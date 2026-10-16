import { RepoConfig } from "@/config/repo-config";
import { Logger } from "@nestjs/common";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initRepo } from "../../../test/git-repo";
import { StateStore } from "../state/state.store";
import type { TerminalService } from "../terminal/terminal.service";
import { OverviewAgentService } from "./overview-agent.service";

//
//
//
// Stands in for TerminalService:
// records spawn() and lets a test end a shell.
class FakeTerminals {
  readonly spawn = jest.fn();
  private exitListener?: (agentId: string, exitCode: number) => void;

  onExited(listener: (agentId: string, exitCode: number) => void) {
    this.exitListener = listener;
  }

  exit(agentId: string) {
    this.exitListener?.(agentId, 0);
  }
}

describe("OverviewAgentService", () => {
  let repo: string;
  let terminals: FakeTerminals;
  let store: StateStore;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "gitspore-overview-"));
    await initRepo(repo);
    terminals = new FakeTerminals();
    store = new StateStore();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await rm(repo, { recursive: true, force: true });
  });

  // What Nest does at startup: build the service, then call the hook.
  const start = (enabled: boolean) =>
    new OverviewAgentService(
      terminals as unknown as TerminalService,
      store,
      new RepoConfig(repo, "main"),
      enabled,
    ).onApplicationBootstrap();

  it("starts claude in the repo root when the flag is set", async () => {
    await start(true);

    expect(terminals.spawn).toHaveBeenCalledWith({
      agentId: "overview",
      cwd: repo,
      command: "claude",
      args: ["--permission-mode", "plan"],
    });
  });

  it("puts the overview agent into the state", async () => {
    await start(true);

    const { agents } = store.snapshot();
    expect(agents).toHaveLength(1);
    const [agent] = agents;
    expect(agent).toEqual({
      id: "overview",
      slotIndex: null,
      issueNumber: null,
      branch: "main",
      worktreePath: repo,
      status: "working",
      statusSince: agent.startedAt,
      startedAt: expect.any(String),
    });
    expect(new Date(agent.startedAt).toISOString()).toBe(agent.startedAt);
  });

  it("starts nothing without the flag", async () => {
    await start(false);

    expect(terminals.spawn).not.toHaveBeenCalled();
    expect(store.snapshot().agents).toEqual([]);
  });

  it("removes the overview agent when its shell exits", async () => {
    await start(true);

    terminals.exit("agent-1");
    expect(store.snapshot().agents.map((agent) => agent.id)).toEqual([
      "overview",
    ]);

    terminals.exit("overview");
    expect(store.snapshot().agents).toEqual([]);
  });

  it("logs a failed start, and the daemon keeps running", async () => {
    const logError = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => {});
    terminals.spawn.mockImplementation(() => {
      throw new Error("no shell");
    });

    await expect(start(true)).resolves.toBeUndefined();

    expect(logError).toHaveBeenCalledWith(expect.stringContaining("no shell"));
    expect(store.snapshot().agents).toEqual([]);
  });
});
