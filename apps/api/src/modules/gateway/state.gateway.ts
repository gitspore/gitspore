import { Logger } from "@nestjs/common";
import {
  Ack,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import { allowedOrigins, SessionAuth } from "./session-auth.service";
import { BranchesService } from "../branches/branches.service";
import { StateStore } from "../state/state.store";
import { GitHubService } from "../github/github.service";
import { parseRepoPayload } from "../repo/repo-payload";
import { RepoService } from "../repo/repo.service";
import { Server, Socket } from "socket.io";
import type {
  BranchGraphAck,
  ClientToServerEvents,
  RepoCheckAck,
  RepoChooseAck,
  ServerToClientEvents,
} from "@gitspore/shared";

type GreenhouseServer = Server<ClientToServerEvents, ServerToClientEvents>;
export type GreenhouseSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents
>;

// What the setup screen shows when a repo request can't be answered.
const INVALID = "The request had no path or an invalid branch name.";
const FAILED = "Something went wrong in gitspore; see the daemon log.";

function sendSnapshot(client: GreenhouseSocket, store: StateStore) {
  client.emit("state:snapshot", store.snapshot());
}

@WebSocketGateway({ cors: { origin: allowedOrigins() } })
export class StateGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(StateGateway.name);

  constructor(
    private readonly auth: SessionAuth,
    private readonly store: StateStore,
    private readonly github: GitHubService,
    private readonly repo: RepoService,
    private readonly branches: BranchesService,
  ) {}

  afterInit(server: GreenhouseServer) {
    server.use((socket, next) => {
      const { headers, auth } = socket.handshake;

      if (
        !this.auth.isOriginAllowed(headers.origin) ||
        !this.auth.isHostAllowed(headers.host) ||
        !this.auth.isTokenValid(auth.token)
      ) {
        return next(new Error("unauthorized"));
      }
      next();
    });

    this.store.onPatch((patch) => server.emit("state:patch", patch));
    // Another repo: the old state is gone, so every tab gets the new one.
    this.store.onReset(() =>
      server.emit("state:snapshot", this.store.snapshot()),
    );
    this.github.onError((error) => server.emit("error", error));
  }

  handleConnection(client: GreenhouseSocket) {
    sendSnapshot(client, this.store);

    // A GitHub problem is reported once, usually before the browser is open.
    // A client that connects later still gets to know it.
    const problem = this.github.currentProblem();
    if (problem) client.emit("error", problem);
  }

  @SubscribeMessage("state:request")
  handleStateRequest(client: GreenhouseSocket) {
    sendSnapshot(client, this.store);
  }

  // Not awaited: the result arrives as `state:patch`, failures as `error`.
  @SubscribeMessage("issues:refresh")
  handleIssuesRefresh() {
    void this.github.refresh();
  }

  // Answers only the asking tab; a check changes nothing. Always answers,
  // or the setup screen would wait forever.
  @SubscribeMessage("repo:check")
  async handleRepoCheck(
    @MessageBody() payload: unknown,
    @Ack() ack: (response: RepoCheckAck) => void,
  ) {
    const request = parseRepoPayload(payload);
    if (!request) {
      ack({ checks: [{ item: "git", result: "fail", detail: INVALID }] });
      return;
    }
    try {
      ack({ checks: await this.repo.check(request.path, request.baseBranch) });
    } catch (error) {
      this.logger.error(error);
      ack({ checks: [{ item: "git", result: "fail", detail: FAILED }] });
    }
  }

  // The ack tells the asking tab; the new state reaches every tab as a
  // snapshot (onReset above). Always answers, like repo:check.
  @SubscribeMessage("repo:choose")
  async handleRepoChoose(
    @MessageBody() payload: unknown,
    @Ack() ack: (response: RepoChooseAck) => void,
  ) {
    const request = parseRepoPayload(payload);
    if (!request) {
      ack({ problems: [{ code: "invalid_payload", message: INVALID }] });
      return;
    }
    try {
      ack(await this.repo.choose(request.path, request.baseBranch));
    } catch (error) {
      this.logger.error(error);
      ack({ problems: [{ code: "switch_failed", message: FAILED }] });
    }
  }

  @SubscribeMessage("branches:graph")
  async handleBranchesGraph(@Ack() ack: (response: BranchGraphAck) => void) {
    try {
      ack(await this.branches.graph());
    } catch (error) {
      this.logger.error(error);
      ack({ error: { code: "internal", message: FAILED } });
    }
  }
}
