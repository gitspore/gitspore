import { Logger } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { AddressInfo } from "node:net";
import { io, type Socket } from "socket.io-client";
import type { ServerError } from "@gitspore/shared";
import { RepoConfig } from "@/config/repo-config";
import { GitHubService } from "../github/github.service";
import { RepoService } from "../repo/repo.service";
import { StateStore } from "../state/state.store";
import { GatewayModule } from "./gateway.module";
import { SessionAuth } from "./session-auth.service";

const ORIGIN = "http://localhost:3000";

describe("StateGateway", () => {
  let app: INestApplication;
  let auth: SessionAuth;
  let url: string;
  const sockets: Socket[] = [];

  // Stands in for GitHubService, so no test here runs git, gh or reaches
  // GitHub.
  let githubError: (error: ServerError) => void = () => {};
  const github = {
    refresh: jest.fn().mockResolvedValue(undefined),
    currentProblem: jest.fn().mockReturnValue(null),
    onError: (listener: (error: ServerError) => void) => {
      githubError = listener;
    },
  };

  // Stands in for RepoService, for the same reason.
  const repo = { check: jest.fn(), choose: jest.fn() };

  const connect = (options: {
    token?: string;
    origin?: string;
    host?: string;
  }) => {
    const headers: Record<string, string> = {};
    if (options.origin) headers.Origin = options.origin;
    if (options.host) headers.Host = options.host;

    const socket = io(url, {
      transports: ["websocket"],
      reconnection: false,
      auth: options.token === undefined ? {} : { token: options.token },
      extraHeaders: headers,
    });
    sockets.push(socket);
    return socket;
  };

  const outcome = (socket: Socket) =>
    new Promise<"snapshot" | "rejected">((resolve) => {
      socket.on("state:snapshot", () => resolve("snapshot"));
      socket.on("connect_error", () => resolve("rejected"));
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GatewayModule],
    })
      .overrideProvider(GitHubService)
      .useValue(github)
      .overrideProvider(RepoService)
      .useValue(repo)
      // No repo: the worktree service runs no git either.
      .overrideProvider(RepoConfig)
      .useValue(new RepoConfig(null, "main"))
      .compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, "127.0.0.1");

    const { address, port } = app.getHttpServer().address() as AddressInfo;
    expect(address).toBe("127.0.0.1");
    url = `http://127.0.0.1:${port}`;
    auth = app.get(SessionAuth);
  });

  afterEach(() => {
    sockets.splice(0).forEach((socket) => socket.close());
    github.currentProblem.mockReturnValue(null);
  });
  afterAll(() => app.close());

  it("sends the snapshot to a client with token and allowed origin", async () => {
    const socket = connect({ token: auth.token, origin: ORIGIN });
    await expect(outcome(socket)).resolves.toBe("snapshot");
  });

  it("rejects a missing token", async () => {
    await expect(outcome(connect({ origin: ORIGIN }))).resolves.toBe(
      "rejected",
    );
  });

  it("rejects a wrong token", async () => {
    const socket = connect({ token: "nope", origin: ORIGIN });
    await expect(outcome(socket)).resolves.toBe("rejected");
  });

  it("rejects a foreign origin", async () => {
    const socket = connect({ token: auth.token, origin: "http://evil.test" });
    await expect(outcome(socket)).resolves.toBe("rejected");
  });

  it("rejects a missing origin", async () => {
    await expect(outcome(connect({ token: auth.token }))).resolves.toBe(
      "rejected",
    );
  });

  it("rejects a non-loopback Host (DNS rebinding)", async () => {
    const socket = connect({
      token: auth.token,
      origin: ORIGIN,
      host: "evil.test",
    });
    await expect(outcome(socket)).resolves.toBe("rejected");
  });

  describe("GitHub", () => {
    const connected = async () => {
      const socket = connect({ token: auth.token, origin: ORIGIN });
      await expect(outcome(socket)).resolves.toBe("snapshot");
      return socket;
    };

    it("asks GitHubService to refresh on issues:refresh", async () => {
      const socket = await connected();
      github.refresh.mockClear();

      socket.emit("issues:refresh", {});
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(github.refresh).toHaveBeenCalledTimes(1);
    });

    it("sends GitHub problems to every client", async () => {
      const socket = await connected();
      const received = new Promise((resolve) => socket.on("error", resolve));
      const error: ServerError = {
        code: "github_unreachable",
        message: "GitHub could not be reached",
      };

      githubError(error);

      await expect(received).resolves.toEqual(error);
    });

    it("tells a client that connects later about the current problem", async () => {
      const problem: ServerError = {
        code: "github_sync_disabled",
        message: "No GitHub token.",
      };
      github.currentProblem.mockReturnValue(problem);
      const socket = connect({ token: auth.token, origin: ORIGIN });

      const received = await new Promise((resolve) =>
        socket.on("error", resolve),
      );

      expect(received).toEqual(problem);
    });
  });

  describe("repo", () => {
    it("answers repo:check with RepoService's checks, main by default", async () => {
      const socket = connect({ token: auth.token, origin: ORIGIN });
      await expect(outcome(socket)).resolves.toBe("snapshot");
      const checks = [{ item: "claude", result: "ok", detail: "found" }];
      repo.check.mockResolvedValue(checks);

      const ack = await socket.emitWithAck("repo:check", { path: "/r" });

      expect(ack).toEqual({ checks });
      expect(repo.check).toHaveBeenCalledWith("/r", "main");
    });

    it("acks repo:choose to the asking tab and sends every tab the new state", async () => {
      const asking = connect({ token: auth.token, origin: ORIGIN });
      const other = connect({ token: auth.token, origin: ORIGIN });
      await expect(outcome(asking)).resolves.toBe("snapshot");
      await expect(outcome(other)).resolves.toBe("snapshot");
      const chosen = { path: "/r", baseBranch: "dev", github: "off" } as const;
      // Like the real one: the state starts over, then the ack
      repo.choose.mockImplementation(() => {
        app.get(StateStore).setRepo(chosen);
        return Promise.resolve({ repo: chosen });
      });
      const snapshotOf = (socket: Socket) =>
        new Promise((resolve) => socket.once("state:snapshot", resolve));
      const snapshots = Promise.all([snapshotOf(asking), snapshotOf(other)]);

      const ack = await asking.emitWithAck("repo:choose", {
        path: "/r",
        baseBranch: "dev",
      });

      expect(ack).toEqual({ repo: chosen });
      expect(repo.choose).toHaveBeenCalledWith("/r", "dev");
      for (const snapshot of await snapshots) {
        expect(snapshot).toMatchObject({ repo: chosen });
      }
    });

    it.each([
      ["repo:check", { checks: [expect.objectContaining({ result: "fail" })] }],
      [
        "repo:choose",
        { problems: [expect.objectContaining({ code: "invalid_payload" })] },
      ],
    ] as const)("answers %s without a path", async (event, answer) => {
      const socket = connect({ token: auth.token, origin: ORIGIN });
      await expect(outcome(socket)).resolves.toBe("snapshot");
      repo.check.mockClear();
      repo.choose.mockClear();

      const ack = await socket.emitWithAck(event, {} as never);

      expect(ack).toEqual(answer);
      expect(repo.check).not.toHaveBeenCalled();
      expect(repo.choose).not.toHaveBeenCalled();
    });

    it("still answers when RepoService throws", async () => {
      const socket = connect({ token: auth.token, origin: ORIGIN });
      await expect(outcome(socket)).resolves.toBe("snapshot");
      const logError = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => {});
      repo.check.mockRejectedValueOnce(new Error("boom"));
      repo.choose.mockRejectedValueOnce(new Error("boom"));

      const check = await socket.emitWithAck("repo:check", { path: "/r" });
      const choose = await socket.emitWithAck("repo:choose", { path: "/r" });

      expect(check).toEqual({
        checks: [expect.objectContaining({ result: "fail" })],
      });
      expect(choose).toEqual({
        problems: [expect.objectContaining({ code: "switch_failed" })],
      });
      logError.mockRestore();
    });
  });

  describe("branches", () => {
    it("answers branches:graph with repo_unavailable while no repo is chosen", async () => {
      const socket = connect({ token: auth.token, origin: ORIGIN });
      await expect(outcome(socket)).resolves.toBe("snapshot");

      const ack = await socket.emitWithAck("branches:graph", {});

      expect(ack).toEqual({
        error: expect.objectContaining({ code: "repo_unavailable" }),
      });
    });
  });
});
