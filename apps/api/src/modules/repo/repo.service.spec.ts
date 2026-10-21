import type { Agent } from "@gitspore/shared";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RepoConfig } from "@/config/repo-config";
import { initRepo } from "../../../test/git-repo";
import type { GitHubCredentialsProvider } from "../github/credentials";
import type { GitHubService } from "../github/github.service";
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
  };
}

describe("RepoService", () => {
  let dir: string;
  let store: StateStore;
  let config: RepoConfig;
  // Stand-ins: no GitHub, no worktree cleanup. The token is there, but the
  // test repos have no remote, so GitHub is "off" before anyone asks for it.
  const github = { restart: jest.fn().mockResolvedValue(undefined) };
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
    );

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "gitspore-repo-"));
    store = new StateStore();
    config = new RepoConfig("/old/repo", "main");
    jest.clearAllMocks();
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  describe("onModuleInit", () => {
    it("puts the repo it started with into the state, GitHub on", async () => {
      const git = await initRepo(dir);
      await git.addRemote("origin", "git@github.com:gitspore/shop.git");
      config = new RepoConfig(dir, "main");

      await service().onModuleInit();

      expect(store.snapshot().repo).toEqual({
        path: dir,
        baseBranch: "main",
        github: "on",
      });
    });

    it("marks GitHub off for a repo without a remote", async () => {
      await initRepo(dir);
      config = new RepoConfig(dir, "main");

      await service().onModuleInit();

      expect(store.snapshot().repo).toMatchObject({ github: "off" });
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
          issue: { number: 1, title: "Old", url: "u", labels: [] },
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
    });

    it.each([
      ["a missing folder", "not_found", (d: string) => join(d, "nope")],
      ["a folder without git", "not_a_repo", (d: string) => d],
    ])("refuses %s with %s and changes nothing", async (_, code, path) => {
      const ack = await service().choose(path(dir), "main");

      expect(ack).toEqual({ problems: [expect.objectContaining({ code })] });
      expect(config.repoPath()).toBe("/old/repo");
      expect(github.restart).not.toHaveBeenCalled();
      expect(store.snapshot().repo).toBeNull();
    });

    it("refuses a repo without the base branch", async () => {
      await initRepo(dir, "master");

      expect(await service().choose(dir, "main")).toEqual({
        problems: [expect.objectContaining({ code: "no_base_branch" })],
      });
    });

    it.each([
      ["a slot agent", agent("a1", 0)],
      ["the overview agent", agent("overview", null)],
    ])("refuses while %s runs, next to the path's problems", async (_, a) => {
      store.apply([{ type: "agent:upsert", agent: a }]);

      const ack = await service().choose(dir, "main");

      expect(ack).toEqual({
        problems: [
          expect.objectContaining({ code: "agents_running" }),
          expect.objectContaining({ code: "not_a_repo" }),
        ],
      });
    });
  });
});
