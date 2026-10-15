import { RepoConfig } from "@/config/repo-config";
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
});
