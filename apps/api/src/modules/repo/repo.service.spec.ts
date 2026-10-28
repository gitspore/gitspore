import { Logger } from "@nestjs/common";
import type { Agent } from "@gitspore/shared";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RepoConfig } from "@/config/repo-config";
import { initRepo } from "../../../test/git-repo";
import type { GitHubCredentialsProvider } from "../github/credentials";
import type { RepoMemory } from "@/config/repo-memory";
import type { GitHubService } from "../github/github.service";
import type { OverviewAgentService } from "../overview/overview-agent.service";
import type { ClaudeLocator } from "../terminal/claude-locator";
import { StateStore } from "../state/state.store";
import type { WorktreeService } from "../worktree/worktree.service";
import { RepoService } from "./repo.service";

function agent(id: string, slotIndex: number | null): Agent {
  return {
    id,
    slotIndex,
    issueNumber: slotIndex === null ? null : 1,
    branch: "main",
    worktreePath: "/tmp/w",
    status: "working",
    statusSince: "2026-10-21T09:00:00.000Z",
    startedAt: "2026-10-21T09:00:00.000Z",
    pullRequest: null,
    statusReason: null,
  };
}

describe("RepoService", () => {
  let dir: string;
  let store: StateStore;
  let config: RepoConfig;
  // Stand-ins: no GitHub, no worktree cleanup, no file in the home. The
  // token is there, but the test repos have no remote, so GitHub is "off"
  // before anyone asks for it.
  const github = {
    start: jest.fn().mockResolvedValue(undefined),
    restart: jest.fn().mockResolvedValue(undefined),
  };
  const memory = { remember: jest.fn().mockResolvedValue(undefined) };
  const claude = { resolve: jest.fn().mockResolvedValue("/bin/claude") };
  const overview = {
    stop: jest.fn().mockResolvedValue(undefined),
    start: jest.fn().mockResolvedValue(undefined),
  };
  const worktrees = { reconfigure: jest.fn().mockResolvedValue(undefined) };
  const credentials: GitHubCredentialsProvider = {
    getToken: jest.fn().mockResolvedValue("token"),
  };

  const service = () =>
    new RepoService(
      store,
      config,
      credentials,
      github as unknown as GitHubService,
      worktrees as unknown as WorktreeService,
      memory as unknown as RepoMemory,
      overview as unknown as OverviewAgentService,
      claude as unknown as ClaudeLocator,
    );

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "gitspore-repo-"));
    store = new StateStore();
    config = new RepoConfig("/old/repo", "main");
    jest.clearAllMocks();
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  describe("onModuleInit", () => {
    it("puts the repo into the state at once, without asking GitHub", async () => {
      config = new RepoConfig(dir, "main");

      service().onModuleInit();

      expect(store.snapshot().repo).toEqual({
        path: dir,
        baseBranch: "main",
        github: "off",
      });
      expect(credentials.getToken).not.toHaveBeenCalled();
    });

    it("leaves the repo null without one, for the setup screen", async () => {
      config = new RepoConfig(null, "main");

      service().onModuleInit();

      expect(store.snapshot().repo).toBeNull();
    });
  });

  describe("onApplicationBootstrap", () => {
    it("starts GitHub sync for the repo it started with", () => {
      service().onApplicationBootstrap();

      expect(github.start).toHaveBeenCalled();
    });

    it("starts nothing without a repo", () => {
      config = new RepoConfig(null, "main");

      service().onApplicationBootstrap();

      expect(github.start).not.toHaveBeenCalled();
    });
  });

  describe("check", () => {
    it("asks ClaudeLocator, found or not", async () => {
      await initRepo(dir);

      const found = await service().check(dir, "main");
      claude.resolve.mockRejectedValueOnce(new Error("not found"));
      const missing = await service().check(dir, "main");

      expect(found.at(-1)).toMatchObject({ item: "claude", result: "ok" });
      expect(missing.at(-1)).toMatchObject({ item: "claude", result: "fail" });
    });
  });

  describe("choose", () => {
    it("switches every service to the repo's top level and starts the state over", async () => {
      await initRepo(dir, "develop");
      const sub = join(dir, "src");
      await mkdir(sub);
      const top = await realpath(dir);
      store.apply([
        {
          type: "issue:upsert",
          issue: { number: 1, title: "Old", url: "u", labels: [], body: "" },
        },
      ]);

      const ack = await service().choose(sub, "develop");

      const repo = { path: top, baseBranch: "develop", github: "off" };
      expect(ack).toEqual({ repo });
      expect(config.repoPath()).toBe(top);
      expect(config.baseBranch()).toBe("develop");
      expect(worktrees.reconfigure).toHaveBeenCalled();
      expect(github.restart).toHaveBeenCalled();
      expect(store.snapshot()).toMatchObject({ repo, issues: [] });
      expect(memory.remember).toHaveBeenCalledWith({
        path: top,
        baseBranch: "develop",
      });
    });

    it("lets onSwitched listeners fill the new state before GitHub restarts", async () => {
      await initRepo(dir);
      const repos = service();
      const seen: string[] = [];
      repos.onSwitched(async () => {
        seen.push(`state of ${store.snapshot().repo?.path}`);
        expect(github.restart).not.toHaveBeenCalled();
      });

      await repos.choose(dir, "main");

      expect(seen).toEqual([`state of ${await realpath(dir)}`]);
      expect(github.restart).toHaveBeenCalled();
    });

    it("works from no repo at all", async () => {
      await initRepo(dir);
      config = new RepoConfig(null, "main");

      expect(await service().choose(dir, "main")).toHaveProperty("repo");
      expect(config.isSet()).toBe(true);
    });

    it("still switches when the choice can't be remembered", async () => {
      await initRepo(dir);
      memory.remember.mockRejectedValueOnce(new Error("read-only home"));
      const warn = jest
        .spyOn(Logger.prototype, "warn")
        .mockImplementation(() => {});

      expect(await service().choose(dir, "main")).toHaveProperty("repo");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("read-only"));
      warn.mockRestore();
    });

    it.each([
      ["a missing folder", "not_found", (d: string) => join(d, "nope")],
      ["a folder without git", "not_a_repo", (d: string) => d],
    ])("refuses %s with %s and changes nothing", async (_, code, path) => {
      const ack = await service().choose(path(dir), "main");

      expect(ack).toEqual({ problems: [expect.objectContaining({ code })] });
      expect(config.repoPath()).toBe("/old/repo");
      expect(github.restart).not.toHaveBeenCalled();
      expect(memory.remember).not.toHaveBeenCalled();
      expect(store.snapshot().repo).toBeNull();
    });

    it("refuses a repo without the base branch", async () => {
      await initRepo(dir, "master");

      expect(await service().choose(dir, "main")).toEqual({
        problems: [expect.objectContaining({ code: "no_base_branch" })],
      });
    });

    it("refuses while a slot agent runs, next to the path's problems", async () => {
      store.apply([{ type: "agent:upsert", agent: agent("a1", 0) }]);

      const ack = await service().choose(dir, "main");

      expect(ack).toEqual({
        problems: [
          expect.objectContaining({ code: "agents_running" }),
          expect.objectContaining({ code: "not_a_repo" }),
        ],
      });
    });

    it("restarts the overview agent around the switch instead of refusing", async () => {
      await initRepo(dir);
      store.apply([{ type: "agent:upsert", agent: agent("overview", null) }]);
      // What the overview agent finds when it stops and starts again
      const seen: string[] = [];
      overview.stop.mockImplementation(async () => {
        seen.push(`stop in ${config.isSet() ? config.repoPath() : "none"}`);
      });
      overview.start.mockImplementation(async () => {
        seen.push(`start with repo ${store.snapshot().repo?.path}`);
      });

      expect(await service().choose(dir, "main")).toHaveProperty("repo");

      const top = await realpath(dir);
      expect(seen).toEqual(["stop in /old/repo", `start with repo ${top}`]);
    });

    it("refuses a second switch while one runs, and tells dispatch so", async () => {
      await initRepo(dir);
      let finishFirst!: () => void;
      worktrees.reconfigure.mockImplementationOnce(
        () => new Promise<void>((resolve) => (finishFirst = resolve)),
      );
      const repoService = service();

      const first = repoService.choose(dir, "main");
      // Wait until the first switch sits in reconfigure()
      while (!finishFirst) await new Promise((r) => setTimeout(r, 5));
      const second = await repoService.choose(dir, "main");

      expect(second).toEqual({
        problems: [expect.objectContaining({ code: "switching" })],
      });
      expect(repoService.isSwitching()).toBe(true);
      finishFirst();
      expect(await first).toHaveProperty("repo");
      expect(repoService.isSwitching()).toBe(false);
      // The next switch works again
      expect(await repoService.choose(dir, "main")).toHaveProperty("repo");
    });

    it("undoes a switch whose worktree setup fails, and still answers", async () => {
      await initRepo(dir);
      const logError = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => {});
      worktrees.reconfigure.mockRejectedValueOnce(new Error("prune failed"));

      const ack = await service().choose(dir, "main");

      expect(ack).toEqual({
        problems: [
          {
            code: "switch_failed",
            message: expect.stringContaining("prune failed"),
          },
        ],
      });
      // Back where it was: config, worktrees, overview agent, state
      expect(config.repoPath()).toBe("/old/repo");
      expect(worktrees.reconfigure).toHaveBeenCalledTimes(2);
      expect(overview.stop).toHaveBeenCalled();
      expect(overview.start).toHaveBeenCalled();
      expect(store.snapshot().repo).toBeNull();
      expect(github.restart).not.toHaveBeenCalled();
      expect(memory.remember).not.toHaveBeenCalled();
      logError.mockRestore();
    });

    it("goes back to no repo when the first choice fails", async () => {
      await initRepo(dir);
      const logError = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => {});
      config = new RepoConfig(null, "main");
      worktrees.reconfigure.mockRejectedValueOnce(new Error("prune failed"));

      await service().choose(dir, "main");

      expect(config.isSet()).toBe(false);
      logError.mockRestore();
    });

    it("refuses without Claude Code, next to the path's problems", async () => {
      claude.resolve.mockRejectedValueOnce(new Error("not found"));

      const ack = await service().choose(dir, "main");

      expect(ack).toEqual({
        problems: [
          expect.objectContaining({ code: "not_a_repo" }),
          expect.objectContaining({ code: "no_claude" }),
        ],
      });
      expect(config.repoPath()).toBe("/old/repo");
    });
  });
});
