import { RepoConfig } from "@/config/repo-config";
import { Logger } from "@nestjs/common";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initRepo } from "../../../test/git-repo";
import { HookService } from "../hooks/hook.service";
import { StateStore } from "../state/state.store";
import type { ClaudeLocator } from "../terminal/claude-locator";
import type { TerminalService } from "../terminal/terminal.service";
import type { WorktreeService } from "../worktree/worktree.service";
import { OverviewAgentService } from "./overview-agent.service";

//
//
//
// Stands in for TerminalService:
// records spawn() and stop() and lets a test end a shell.
class FakeTerminals {
  readonly spawn = jest.fn();
  readonly stop = jest.fn().mockResolvedValue(true);
  private exitListener?: (agentId: string, exitCode: number) => void;

  onExited(listener: (agentId: string, exitCode: number) => void) {
    this.exitListener = listener;
  }

  exit(agentId: string) {
    this.exitListener?.(agentId, 0);
  }
}

// Stands in for ClaudeLocator: a fixed path.
class FakeLocator {
  readonly resolve = jest.fn(async () => "/bin/claude");
}

// Stands in for WorktreeService: records what is kept out of git.
class FakeWorktrees {
  readonly ensureExcluded = jest.fn().mockResolvedValue(undefined);
}

describe("OverviewAgentService", () => {
  let repo: string;
  let terminals: FakeTerminals;
  let locator: FakeLocator;
  let store: StateStore;
  let hooks: HookService;
  let worktrees: FakeWorktrees;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "gitspore-overview-"));
    await initRepo(repo);
    terminals = new FakeTerminals();
    locator = new FakeLocator();
    store = new StateStore();
    hooks = new HookService();
    worktrees = new FakeWorktrees();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await rm(repo, { recursive: true, force: true });
  });

  // What Nest does at startup: build the service, then call the hook.
  const start = (enabled: boolean) =>
    new OverviewAgentService(
      terminals as unknown as TerminalService,
      locator as unknown as ClaudeLocator,
      store,
      new RepoConfig(repo, "main"),
      hooks,
      worktrees as unknown as WorktreeService,
      enabled,
    ).onApplicationBootstrap();

  it("starts nothing without a repo, even with the flag", async () => {
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});

    await new OverviewAgentService(
      terminals as unknown as TerminalService,
      locator as unknown as ClaudeLocator,
      store,
      new RepoConfig(null, "main"),
      hooks,
      worktrees as unknown as WorktreeService,
      true,
    ).onApplicationBootstrap();

    expect(terminals.spawn).not.toHaveBeenCalled();
    expect(store.snapshot().agents).toEqual([]);
  });

  it("starts claude in a shell in the repo root, by file name", async () => {
    await start(true);

    expect(terminals.spawn).toHaveBeenCalledWith({
      agentId: "overview",
      cwd: repo,
      command: "claude",
      args: [
        "--settings",
        ".gitspore/settings.json",
        "--permission-mode",
        "plan",
      ],
    });
  });

  describe("statusline", () => {
    const readJson = async (file: string) =>
      JSON.parse(await readFile(join(repo, ".gitspore", file), "utf8"));

    it("writes settings with only the statusline script", async () => {
      await start(true);

      const settings = await readJson("settings.json");
      expect(Object.keys(settings)).toEqual(["statusLine"]);
      expect(settings.statusLine.command).toMatch(
        /^node '.*\/statusline-script\.mjs'$/,
      );
    });

    it("writes hook.json with a secret the endpoint accepts", async () => {
      await start(true);

      const hook = await readJson("hook.json");
      expect(hook).toMatchObject({ url: hooks.url(), agentId: "overview" });
      expect(hooks.isValid("overview", hook.secret)).toBe(true);
    });

    it("keeps .gitspore/ out of git", async () => {
      await start(true);

      expect(worktrees.ensureExcluded).toHaveBeenCalledWith(".gitspore/");
    });

    it("starts without it when the files can't be written", async () => {
      const warn = jest
        .spyOn(Logger.prototype, "warn")
        .mockImplementation(() => {});
      worktrees.ensureExcluded.mockRejectedValue(new Error("read-only"));

      await start(true);

      expect(terminals.spawn).toHaveBeenCalledWith(
        expect.objectContaining({ args: ["--permission-mode", "plan"] }),
      );
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("read-only"));
      expect(store.snapshot().agents).toHaveLength(1);
    });

    it("revokes the secret when the shell exits", async () => {
      await start(true);
      const { secret } = await readJson("hook.json");

      terminals.exit("overview");

      expect(hooks.isValid("overview", secret)).toBe(false);
    });
  });

  it("types the locator's file name, not its Windows path", async () => {
    locator.resolve.mockResolvedValue("C:\\Program Files\\nodejs\\claude.cmd");

    await start(true);

    expect(terminals.spawn).toHaveBeenCalledWith(
      expect.objectContaining({ command: "claude.cmd" }),
    );
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
      pullRequest: null,
      statusReason: null,
      usage: null,
    });
    expect(new Date(agent.startedAt).toISOString()).toBe(agent.startedAt);
  });

  it("starts nothing without the flag", async () => {
    await start(false);

    expect(locator.resolve).not.toHaveBeenCalled();
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

  it("starts nothing and keeps running when Claude is not found", async () => {
    const logError = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => {});
    locator.resolve.mockRejectedValue(new Error("Claude Code was not found"));

    await expect(start(true)).resolves.toBeUndefined();

    expect(terminals.spawn).not.toHaveBeenCalled();
    expect(store.snapshot().agents).toEqual([]);
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining("Claude Code was not found"),
    );
  });

  describe("after a switch to another repo", () => {
    it("stops through TerminalService and starts again where RepoConfig points", async () => {
      const config = new RepoConfig(repo, "main");
      const service = new OverviewAgentService(
        terminals as unknown as TerminalService,
        locator as unknown as ClaudeLocator,
        store,
        config,
        hooks,
        worktrees as unknown as WorktreeService,
        true,
      );
      const other = await mkdtemp(join(tmpdir(), "gitspore-overview-other-"));
      await initRepo(other);

      await service.stop();
      config.set(other, "main");
      await service.start();
      const secret = JSON.parse(
        await readFile(join(other, ".gitspore", "hook.json"), "utf8"),
      ).secret;

      expect(terminals.stop).toHaveBeenCalledWith("overview");
      expect(terminals.spawn).toHaveBeenCalledWith(
        expect.objectContaining({ cwd: other }),
      );
      // A new secret for the new repo's hook.json.
      expect(hooks.isValid("overview", secret)).toBe(true);
      await rm(other, { recursive: true, force: true });
    });
  });
});
