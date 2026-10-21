import {
  Ack,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import { allowedOrigins, SessionAuth } from "./session-auth.service";
import { StateStore } from "../state/state.store";
import { GitHubService } from "../github/github.service";
import { RepoService } from "../repo/repo.service";
import { Server, Socket } from "socket.io";
import type {
  ClientToServerEvents,
  RepoCheckAck,
  RepoChoosePayload,
  ServerToClientEvents,
} from "@gitspore/shared";

type GreenhouseServer = Server<ClientToServerEvents, ServerToClientEvents>;
export type GreenhouseSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents
>;

function sendSnapshot(client: GreenhouseSocket, store: StateStore) {
  client.emit("state:snapshot", store.snapshot());
}

@WebSocketGateway({ cors: { origin: allowedOrigins() } })
export class StateGateway implements OnGatewayInit, OnGatewayConnection {
  constructor(
    private readonly auth: SessionAuth,
    private readonly store: StateStore,
    private readonly github: GitHubService,
    private readonly repo: RepoService,
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

  // Answers only the asking tab; a check changes nothing.
  @SubscribeMessage("repo:check")
  async handleRepoCheck(
    @MessageBody() { path, baseBranch = "main" }: RepoChoosePayload,
    @Ack() ack: (response: RepoCheckAck) => void,
  ) {
    ack({ checks: await this.repo.check(path, baseBranch) });
  }
}
