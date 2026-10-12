import { BRANCH_PREFIX } from "@gitspore/shared";
import { RepoConfig } from "@/config/repo-config";
import { WorktreeService } from "./worktree.service";
import { initRepo } from "../../../test/git-repo";

import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  readFile,
  writeFile,
} from "node:fs/promises";
import { simpleGit } from "simple-git";
import { existsSync } from "node:fs";

//
//
//
describe("WorktreeService", () => {
  let parent: string;
  let repo: string;
  let service: WorktreeService;

  beforeEach(async () => {
    parent = await realpath(await mkdtemp(join(tmpdir(), "gitspore-wt-")));
    repo = join(parent, "my-repo");
    await mkdir(repo);
    await initRepo(repo);
    service = new WorktreeService(new RepoConfig(repo, "main"));
  });

  afterEach(() => rm(parent, { recursive: true, force: true }));

  describe("create", () => {
    it("makes a worktree on a new spore branch next to the repo", async () => {
      const result = await service.create({
        issueNumber: 42,
        issueTitle: "Fix bug",
      });

      const expectedPath = join(
        parent,
        ".gitspore-worktrees",
        "my-repo",
        "42-fix-bug",
      );
      expect(result).toEqual({
        branch: `${BRANCH_PREFIX}42-fix-bug`,
        path: expectedPath,
      });

      const head = await simpleGit(expectedPath).revparse([
        "--abbrev-ref",
        "HEAD",
      ]);
      expect(head).toBe(`${BRANCH_PREFIX}42-fix-bug`);
    });

    it("starts the branch at the base branch, not at the checked-out one", async () => {
      const git = simpleGit(repo);
      await git.checkoutLocalBranch("other");
      await git.raw(["commit", "--allow-empty", "-m", "on other"]);

      const { path } = await service.create({
        issueNumber: 42,
        issueTitle: "Fix bug",
      });

      const mainCommit = await git.revparse(["main"]);
      const worktreeCommit = await simpleGit(path).revparse(["HEAD"]);
      expect(worktreeCommit).toBe(mainCommit);
    });

    it("leaves the main folder's branch name and files alone", async () => {
      const git = simpleGit(repo);
      await writeFile(join(repo, "notes.txt"), "work in progress");
      const statusBefore = await git.raw(["status", "--porcelain"]);

      await service.create({ issueNumber: 42, issueTitle: "Fix bug" });

      expect(await git.revparse(["--abbrev-ref", "HEAD"])).toBe("main");
      expect(await git.raw(["status", "--porcelain"])).toBe(statusBefore);
      expect(await readFile(join(repo, "notes.txt"), "utf8")).toBe(
        "work in progress",
      );
    });

    it("refuses when the branch already exists, and creates nothing", async () => {
      const branch = `${BRANCH_PREFIX}42-fix-bug`;
      await simpleGit(repo).branch([branch]);

      await expect(
        service.create({ issueNumber: 42, issueTitle: "Fix bug" }),
      ).rejects.toMatchObject({ code: "branch_exists" });

      const path = join(parent, ".gitspore-worktrees", "my-repo", "42-fix-bug");
      expect(existsSync(path)).toBe(false);
    });

    it("refuses when the target folder already exists, and leaves it alone", async () => {
      const path = join(parent, ".gitspore-worktrees", "my-repo", "42-fix-bug");
      await mkdir(path, { recursive: true });
      await writeFile(join(path, "keep.txt"), "mine");

      await expect(
        service.create({ issueNumber: 42, issueTitle: "Fix bug" }),
      ).rejects.toMatchObject({ code: "path_exists" });

      expect(await readFile(join(path, "keep.txt"), "utf8")).toBe("mine");
    });

    it("handles six create calls at the same time", async () => {
      const numbers = [1, 2, 3, 4, 5, 6];

      const results = await Promise.all(
        numbers.map((n) =>
          service.create({ issueNumber: n, issueTitle: `Task ${n}` }),
        ),
      );

      expect(results.map((r) => r.branch)).toEqual(
        numbers.map((n) => `${BRANCH_PREFIX}${n}-task-${n}`),
      );
      for (const { path } of results) {
        expect(existsSync(path)).toBe(true);
      }
    });

    it("keeps each worktree's files apart", async () => {
      const one = await service.create({ issueNumber: 1, issueTitle: "One" });
      const two = await service.create({ issueNumber: 2, issueTitle: "Two" });

      await writeFile(join(one.path, "notes.txt"), "from one");
      expect(existsSync(join(two.path, "notes.txt"))).toBe(false);
      expect(existsSync(join(repo, "notes.txt"))).toBe(false);

      await writeFile(join(two.path, "notes.txt"), "from two");
      expect(await readFile(join(one.path, "notes.txt"), "utf8")).toBe(
        "from one",
      );
    });
  });
});
