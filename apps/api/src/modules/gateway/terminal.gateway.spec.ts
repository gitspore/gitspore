import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { AddressInfo } from "node:net";
import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerError,
  ServerToClientEvents,
  TerminalDataPayload,
  TerminalOpenAck,
} from "@gitspore/shared";
import { RepoConfig } from "@/config/repo-config";
import { FakePty } from "../../../test/fake-pty";
import { GitHubService } from "../github/github.service";
import { TerminalError } from "../terminal/terminal-error";
import { SPAWN_PTY, TerminalService } from "../terminal/terminal.service";
import { GatewayModule } from "./gateway.module";
import { SESSION_TOKEN, SessionAuth } from "./session-auth.service";

const ORIGIN = "http://localhost:3000";

type BrowserTab = Socket<ServerToClientEvents, ClientToServerEvents>;

describe("TerminalGateway", () => {
  let app: INestApplication;
  let url: string;
  let token: string;
  let service: TerminalService;
  let ptys: FakePty[];
  const browserTabs: BrowserTab[] = [];

  beforeEach(async () => {
    ptys = [];
    const moduleRef = await Test.createTestingModule({
      imports: [GatewayModule],
    })
      .overrideProvider(SPAWN_PTY)
      .useValue(() => {
        const pty = new FakePty().exitingOnKill();
        ptys.push(pty);
        return pty;
      })
      // GatewayModule also brings GitHub: no git, gh or GitHub in these tests.
      .overrideProvider(GitHubService)
      .useValue({
        refresh: async () => {},
        currentProblem: () => null,
        onError: () => {},
      })
      // No repo: the worktree service and RepoService start nothing either.
      .overrideProvider(RepoConfig)
      .useValue(new RepoConfig(null, "main"))
      // Never the real token file in the home folder.
      .overrideProvider(SESSION_TOKEN)
      .useValue("a".repeat(64))
      .compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, "127.0.0.1");
    const { port } = app.getHttpServer().address() as AddressInfo;
    url = `http://127.0.0.1:${port}`;
    token = app.get(SessionAuth).token;
    service = app.get(TerminalService);
  });

  afterEach(async () => {
    browserTabs.splice(0).forEach((browserTab) => browserTab.close());
    await app.close();
  });

  const spawn = (agentId: string) =>
    service.spawn({ agentId, cwd: "/repo", command: "claude", args: [] });

  // Resolves once the socket is connected, so socket.id is set.
  const connect = () =>
    new Promise<BrowserTab>((resolve, reject) => {
      const browserTab: BrowserTab = io(url, {
        transports: ["websocket"],
        reconnection: false,
        auth: { token },
        extraHeaders: { Origin: ORIGIN },
      });
      browserTabs.push(browserTab);
      browserTab.on("connect", () => resolve(browserTab));
      browserTab.on("connect_error", reject);
    });

  // The batcher flushes every 16 ms (real timers).
  const flush = () => new Promise((resolve) => setTimeout(resolve, 50));

  // The server handles a disconnect a moment after the client closes.
  const waitUntil = async (condition: () => boolean): Promise<void> => {
    for (let tries = 0; tries < 100 && !condition(); tries++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(condition()).toBe(true);
  };

  // True once write() refuses the session as unknown.
  const isDetached = (sessionId: string, ownerId: string): boolean => {
    try {
      service.write(sessionId, ownerId, "x");
      return false;
    } catch (error) {
      return (
        error instanceof TerminalError && error.code === "session_not_found"
      );
    }
  };

  it("acks terminal:open with the session id, then sends the scrollback", async () => {
    spawn("agent-1");
    ptys[0].output("before");
    await flush();
    const browserTab = await connect();
    const seen: string[] = [];

    const data = new Promise<TerminalDataPayload>((resolve) =>
      browserTab.on("terminal:data", (payload) => {
        seen.push("data");
        resolve(payload);
      }),
    );
    const ack = new Promise<TerminalOpenAck>((resolve) =>
      browserTab.emit("terminal:open", { agentId: "agent-1" }, (response) => {
        seen.push("ack");
        resolve(response);
      }),
    );

    const payload = await data;
    expect(await ack).toEqual({ sessionId: payload.sessionId });
    expect(payload.chunk).toBe("before");
    expect(seen).toEqual(["ack", "data"]);
  });

  it("acks terminal:open for an unknown agent with agent_not_found", async () => {
    const browserTab = await connect();

    const ack = await browserTab.emitWithAck("terminal:open", {
      agentId: "unknown-agent",
    });

    expect(ack).toEqual({
      error: { code: "agent_not_found", message: expect.any(String) },
    });
  });

  it("lets a reviver start the agent's terminal before it opens", async () => {
    service.onMissing(async (agentId) => spawn(agentId));
    const browserTab = await connect();

    const ack = await browserTab.emitWithAck("terminal:open", {
      agentId: "agent-1",
    });

    expect(ack).toEqual({ sessionId: expect.any(String) });
    expect(ptys).toHaveLength(1);
  });

  it("answers terminal:input for another tab's session with session_not_found", async () => {
    spawn("agent-1");
    const tabA = await connect();
    const tabB = await connect();
    const ack = await tabA.emitWithAck("terminal:open", { agentId: "agent-1" });
    if (!("sessionId" in ack)) throw new Error("terminal:open failed");

    const error = new Promise<ServerError>((resolve) =>
      tabB.on("error", resolve),
    );
    tabB.emit("terminal:input", { sessionId: ack.sessionId, data: "ls\r" });

    expect(await error).toEqual({
      code: "session_not_found",
      message: expect.any(String),
    });
  });

  it("detaches a tab's sessions when it disconnects, and the terminal keeps running", async () => {
    spawn("agent-1");
    const tabA = await connect();
    const ownerId = tabA.id;
    if (ownerId === undefined) throw new Error("tabA has no id");
    const ack = await tabA.emitWithAck("terminal:open", { agentId: "agent-1" });
    if (!("sessionId" in ack)) throw new Error("terminal:open failed");

    expect(isDetached(ack.sessionId, ownerId)).toBe(false);

    tabA.close();
    await waitUntil(() => isDetached(ack.sessionId, ownerId));

    const tabB = await connect();
    expect(
      await tabB.emitWithAck("terminal:open", { agentId: "agent-1" }),
    ).toEqual({ sessionId: expect.any(String) });
    expect(ptys[0].kill).not.toHaveBeenCalled();
  });
});
