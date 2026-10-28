import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "./app.module";
import { RepoConfig } from "./config/repo-config";
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  GreenhouseState,
  ServerToClientEvents,
} from "@gitspore/shared";
import { initRepo } from "../test/git-repo";
import { FakePty } from "../test/fake-pty";
import {
  SESSION_TOKEN,
  SessionAuth,
} from "./modules/gateway/session-auth.service";
import { START_OVERVIEW } from "./modules/overview/overview-agent.service";
import { SPAWN_PTY } from "./modules/terminal/terminal.service";
import { LOCATOR_DEPS } from "./modules/terminal/claude-locator";

//
//
//
type BrowserTab = Socket<ServerToClientEvents, ClientToServerEvents>;

describe("AppModule", () => {
  let repo: string;
  let app: INestApplication | undefined;
  let browserTab: BrowserTab | undefined;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "gitspore-app-"));
    await initRepo(repo);
  });

  afterEach(async () => {
    browserTab?.close();
    await app?.close();
    browserTab = undefined;
    app = undefined;
    // Windows can't remove a folder while a process still runs in it, like
    // the git of the GitHub sync that start() doesn't wait for: EBUSY. rm
    // retries on that.
    await rm(repo, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  });

  // compile() runs no lifecycle hooks
  // overview agent never starts here.
  it("compiles", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RepoConfig)
      .useValue(new RepoConfig(repo, "main"))
      // Never the real token file in the home folder.
      .overrideProvider(SESSION_TOKEN)
      .useValue("a".repeat(64))
      .compile();

    expect(moduleRef.get(AppModule)).toBeInstanceOf(AppModule);
  });

  // FakePty instead of node-pty:
  // flag is on, but no shell and no claude start.
  it("starts the overview agent with the flag, and a tab can open its terminal", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RepoConfig)
      .useValue(new RepoConfig(repo, "main"))
      .overrideProvider(START_OVERVIEW)
      .useValue(true)
      .overrideProvider(SPAWN_PTY)
      .useValue(() => new FakePty())
      .overrideProvider(LOCATOR_DEPS)
      .useValue({
        env: { GITSPORE_CLAUDE_BIN: "/fake/claude" },
        platform: process.platform,
        exists: async () => true,
        checkVersion: async () => true,
      })
      // Never the real token file in the home folder.
      .overrideProvider(SESSION_TOKEN)
      .useValue("a".repeat(64))
      .compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, "127.0.0.1");
    const { port } = app.getHttpServer().address() as AddressInfo;

    const tab: BrowserTab = io(`http://127.0.0.1:${port}`, {
      transports: ["websocket"],
      reconnection: false,
      auth: { token: app.get(SessionAuth).token },
      extraHeaders: { Origin: "http://localhost:3000" },
    });
    browserTab = tab;
    const snapshot = await new Promise<GreenhouseState>((resolve) =>
      tab.on("state:snapshot", resolve),
    );

    expect(snapshot.agents.map((agent) => agent.id)).toEqual(["overview"]);
    expect(
      await tab.emitWithAck("terminal:open", { agentId: "overview" }),
    ).toEqual({ sessionId: expect.any(String) });
  });
});
