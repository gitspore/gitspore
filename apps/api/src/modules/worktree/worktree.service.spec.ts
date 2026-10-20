import { BRANCH_PREFIX } from "@gitspore/shared";
import { RepoConfig } from "@/config/repo-config";
import { WorktreeService } from "./worktree.service";
import {
  initOrigin,
  initRepo,
  pushFromElsewhere,
} from "../../../test/git-repo";

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
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

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

    it("gives branch_exists to the second of two create calls for the same issue", async () => {
      const results = await Promise.allSettled([
        service.create({ issueNumber: 42, issueTitle: "Fix bug" }),
        service.create({ issueNumber: 42, issueTitle: "Fix bug" }),
      ]);

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );
      expect(rejected?.reason).toMatchObject({ code: "branch_exists" });
    });

    // The timing the test above only hits sometimes: the other call made
    // branch and folder after this call's branch check, before its folder
    // check.
    it("gives branch_exists when the other call made the folder after the branch check", async () => {
      const branch = `${BRANCH_PREFIX}42-fix-bug`;
      const path = join(parent, ".gitspore-worktrees", "my-repo", "42-fix-bug");
      await simpleGit(repo).raw([
        "worktree",
        "add",
        "-b",
        branch,
        path,
        "main",
      ]);
      // The branch check that ran before the other call was done.
      jest
        .spyOn(
          service as unknown as {
            branchExists(branch: string): Promise<boolean>;
          },
          "branchExists",
        )
        .mockResolvedValueOnce(false);

      await expect(
        service.create({ issueNumber: 42, issueTitle: "Fix bug" }),
      ).rejects.toMatchObject({ code: "branch_exists" });
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

  describe("list", () => {
    it("returns an empty list when there are no worktrees", async () => {
      expect(await service.list()).toEqual([]);
    });

    it("returns only our worktrees", async () => {
      const ours = await service.create({
        issueNumber: 42,
        issueTitle: "Fix bug",
      });

      const git = simpleGit(repo);
      const root = join(parent, ".gitspore-worktrees", "my-repo");
      await git.raw([
        "worktree",
        "add",
        "-b",
        "feature",
        join(parent, "elsewhere"),
        "main",
      ]);
      await git.raw([
        "worktree",
        "add",
        "-b",
        `${BRANCH_PREFIX}7-x`,
        join(parent, "spore-elsewhere"),
        "main",
      ]);
      await git.raw([
        "worktree",
        "add",
        "--detach",
        join(root, "detached"),
        "main",
      ]);

      expect(await service.list()).toEqual([ours]);
    });
  });

  describe("remove", () => {
    it("removes a clean worktree and keeps its branch", async () => {
      const { branch, path } = await service.create({
        issueNumber: 42,
        issueTitle: "Fix bug",
      });

      await service.remove({ path });

      expect(existsSync(path)).toBe(false);
      const branches = await simpleGit(repo).branchLocal();
      expect(branches.all).toContain(branch);
    });

    it("refuses a path outside our folder and leaves it alone", async () => {
      const elsewhere = join(parent, "elsewhere");
      await simpleGit(repo).raw([
        "worktree",
        "add",
        "-b",
        "feature",
        elsewhere,
        "main",
      ]);

      await expect(service.remove({ path: elsewhere })).rejects.toMatchObject({
        code: "outside_root",
      });
      await expect(service.remove({ path: repo })).rejects.toMatchObject({
        code: "outside_root",
      });

      expect(existsSync(elsewhere)).toBe(true);
      expect(existsSync(repo)).toBe(true);
    });

    it("refuses a worktree with an untracked file and keeps it", async () => {
      const { path } = await service.create({
        issueNumber: 42,
        issueTitle: "Fix bug",
      });
      await writeFile(join(path, "new.ts"), "agent work");

      await expect(service.remove({ path })).rejects.toMatchObject({
        code: "dirty",
      });
      expect(await readFile(join(path, "new.ts"), "utf8")).toBe("agent work");
    });

    it("removes a dirty worktree with force and keeps its branch", async () => {
      const { branch, path } = await service.create({
        issueNumber: 42,
        issueTitle: "Fix bug",
      });
      await writeFile(join(path, "new.ts"), "agent work");

      await service.remove({ path, force: true });

      expect(existsSync(path)).toBe(false);
      const branches = await simpleGit(repo).branchLocal();
      expect(branches.all).toContain(branch);
    });

    it("refuses a worktree with a modified tracked file and keeps the change", async () => {
      const { path } = await service.create({
        issueNumber: 42,
        issueTitle: "Fix bug",
      });
      const git = simpleGit(path);
      await writeFile(join(path, "app.ts"), "v1");
      await git.add("app.ts");
      await git.commit("add app.ts");
      await writeFile(join(path, "app.ts"), "v2");

      await expect(service.remove({ path })).rejects.toMatchObject({
        code: "dirty",
      });
      expect(await readFile(join(path, "app.ts"), "utf8")).toBe("v2");
    });

    it("cleans up a worktree whose folder was deleted by hand", async () => {
      const { branch, path } = await service.create({
        issueNumber: 42,
        issueTitle: "Fix bug",
      });
      await rm(path, { recursive: true, force: true });

      await service.remove({ path });

      expect(await service.list()).toEqual([]);
      const branches = await simpleGit(repo).branchLocal();
      expect(branches.all).toContain(branch);
    });

    it("deletes the branch with deleteBranch when it has no new commits", async () => {
      const { branch, path } = await service.create({
        issueNumber: 42,
        issueTitle: "Fix bug",
      });

      await service.remove({ path, deleteBranch: true });

      expect(existsSync(path)).toBe(false);
      const branches = await simpleGit(repo).branchLocal();
      expect(branches.all).not.toContain(branch);
    });

    it("refuses deleteBranch when the branch has unmerged commits, and removes nothing", async () => {
      const { branch, path } = await service.create({
        issueNumber: 42,
        issueTitle: "Fix bug",
      });
      await simpleGit(path).raw([
        "commit",
        "--allow-empty",
        "-m",
        "agent work",
      ]);

      await expect(
        service.remove({ path, deleteBranch: true }),
      ).rejects.toMatchObject({ code: "unmerged" });

      expect(existsSync(path)).toBe(true);
      const branches = await simpleGit(repo).branchLocal();
      expect(branches.all).toContain(branch);
    });

    it("deletes an unmerged branch with deleteBranch and force", async () => {
      const { branch, path } = await service.create({
        issueNumber: 42,
        issueTitle: "Fix bug",
      });
      await simpleGit(path).raw([
        "commit",
        "--allow-empty",
        "-m",
        "agent work",
      ]);

      await service.remove({ path, deleteBranch: true, force: true });

      expect(existsSync(path)).toBe(false);
      const branches = await simpleGit(repo).branchLocal();
      expect(branches.all).not.toContain(branch);
    });

    it("refuses a path that is not a registered worktree, and leaves it alone", async () => {
      const { path } = await service.create({
        issueNumber: 42,
        issueTitle: "Fix bug",
      });
      await service.remove({ path });

      await expect(service.remove({ path })).rejects.toMatchObject({
        code: "not_found",
      });

      const stray = join(parent, ".gitspore-worktrees", "my-repo", "99-stray");
      await mkdir(stray);
      await writeFile(join(stray, "keep.txt"), "mine");

      await expect(service.remove({ path: stray })).rejects.toMatchObject({
        code: "not_found",
      });
      expect(await readFile(join(stray, "keep.txt"), "utf8")).toBe("mine");
    });
  });

  describe("isClean", () => {
    it("is true for a new worktree and false after a new file", async () => {
      const { path } = await service.create({
        issueNumber: 42,
        issueTitle: "Fix bug",
      });
      expect(await service.isClean(path)).toBe(true);

      await writeFile(join(path, "new.txt"), "x");

      expect(await service.isClean(path)).toBe(false);
    });
  });

  describe("ensureExcluded", () => {
    const excludeFile = () => join(repo, ".git", "info", "exclude");
    const linesWith = async (pattern: string) =>
      (await readFile(excludeFile(), "utf8"))
        .split(/\r?\n/)
        .filter((line) => line.trim() === pattern).length;

    it("adds the pattern once, however often it is called", async () => {
      await service.ensureExcluded(".gitspore/");
      await service.ensureExcluded(".gitspore/");

      expect(await linesWith(".gitspore/")).toBe(1);
    });

    it("starts a new line when the file does not end with one", async () => {
      await writeFile(excludeFile(), "*.log");

      await service.ensureExcluded(".gitspore/");

      expect(await readFile(excludeFile(), "utf8")).toBe("*.log\n.gitspore/\n");
    });

    it("keeps .gitspore/ out of git status in every worktree", async () => {
      const { path } = await service.create({
        issueNumber: 42,
        issueTitle: "Fix bug",
      });
      await service.ensureExcluded(".gitspore/");

      await mkdir(join(path, ".gitspore"));
      await writeFile(join(path, ".gitspore", "task.md"), "# Task");

      expect(await service.isClean(path)).toBe(true);
    });
  });

  describe("startup", () => {
    it("cleans up a worktree whose folder was deleted while the daemon was down", async () => {
      const { path } = await service.create({
        issueNumber: 42,
        issueTitle: "Fix bug",
      });
      await rm(path, { recursive: true, force: true });

      await service.onModuleInit();

      expect(await service.list()).toEqual([]);
    });
  });

  describe("with an origin", () => {
    let origin: string;

    beforeEach(async () => {
      origin = await initOrigin(repo, join(parent, "origin.git"));
    });
    // A server that wants a login: publish must fail fast with push_failed.
    // The test runs without a credential helper, so the machine's (Git
    // Credential Manager on Windows) cannot open a window, and on CI nobody
    // would answer it. Under Jest git has no console to ask in, so this test
    // also passes without GIT_TERMINAL_PROMPT=0; it does not prove that the
    // variable works. A dispatch without a login is checked by hand.

    it("fails at once instead of asking for a login", async () => {
      const server = createServer((_request, response) => {
        response.writeHead(401, {
          "WWW-Authenticate": 'Basic realm="gitspore"',
        });
        response.end();
      });
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      const { port } = server.address() as AddressInfo;

      try {
        // Without startPoint: create does not talk to origin.
        const { branch } = await service.create({
          issueNumber: 42,
          issueTitle: "Fix bug",
        });
        await simpleGit(repo).remote([
          "set-url",
          "origin",
          `http://127.0.0.1:${port}/repo.git`,
        ]);

        await simpleGit({
          baseDir: repo,
          unsafe: { allowUnsafeCredentialHelper: true },
        }).raw(["config", "credential.helper", ""]);

        const started = Date.now();

        await expect(service.publish(branch)).rejects.toMatchObject({
          code: "push_failed",
        });
        expect(Date.now() - started).toBeLessThan(10_000);
      } finally {
        server.closeAllConnections();
        server.close();
      }
    }, 30_000);

    describe("fetch", () => {
      it("brings origin/main up to date and leaves the local main alone", async () => {
        const localMain = await simpleGit(repo).revparse(["main"]);
        const theirs = await pushFromElsewhere(
          origin,
          join(parent, "elsewhere"),
        );

        await service.fetch();

        const git = simpleGit(repo);
        expect(await git.revparse(["origin/main"])).toBe(theirs);
        expect(await git.revparse(["main"])).toBe(localMain);
      });
    });

    describe("create from origin", () => {
      it("starts the branch at origin/main, not at the local main", async () => {
        const theirs = await pushFromElsewhere(
          origin,
          join(parent, "elsewhere"),
        );
        await service.fetch();

        const { path } = await service.create({
          issueNumber: 42,
          issueTitle: "Fix bug",
          startPoint: "origin/main",
        });

        expect(await simpleGit(path).revparse(["HEAD"])).toBe(theirs);
      });

      it("refuses a branch that exists only on origin, and creates nothing", async () => {
        const branch = `${BRANCH_PREFIX}42-fix-bug`;
        await simpleGit(repo).raw([
          "push",
          "origin",
          `main:refs/heads/${branch}`,
        ]);

        await expect(
          service.create({
            issueNumber: 42,
            issueTitle: "Fix bug",
            startPoint: "origin/main",
          }),
        ).rejects.toMatchObject({ code: "branch_exists" });

        const path = join(
          parent,
          ".gitspore-worktrees",
          "my-repo",
          "42-fix-bug",
        );
        expect(existsSync(path)).toBe(false);
        expect((await simpleGit(repo).branchLocal()).all).not.toContain(branch);
      });
    });

    describe("publish", () => {
      it("pushes the branch to origin and sets its upstream", async () => {
        const { branch } = await service.create({
          issueNumber: 42,
          issueTitle: "Fix bug",
          startPoint: "origin/main",
        });

        await service.publish(branch);

        const onOrigin = await simpleGit(repo).raw([
          "ls-remote",
          "--heads",
          "origin",
          `refs/heads/${branch}`,
        ]);
        expect(onOrigin.trim()).not.toBe("");
        const upstream = await simpleGit(repo).revparse([
          "--abbrev-ref",
          `${branch}@{upstream}`,
        ]);
        expect(upstream).toBe(`origin/${branch}`);
      });

      it("gives push_failed when origin is not there", async () => {
        const { branch } = await service.create({
          issueNumber: 42,
          issueTitle: "Fix bug",
        });
        await simpleGit(repo).remote([
          "set-url",
          "origin",
          join(parent, "missing.git"),
        ]);

        await expect(service.publish(branch)).rejects.toMatchObject({
          code: "push_failed",
        });
      });

      it("refuses a branch that is not ours", async () => {
        await expect(service.publish("main")).rejects.toMatchObject({
          code: "not_ours",
        });
      });
    });

    describe("deleteRemoteBranch", () => {
      it("deletes the branch on origin", async () => {
        const { branch } = await service.create({
          issueNumber: 42,
          issueTitle: "Fix bug",
          startPoint: "origin/main",
        });
        await service.publish(branch);

        await service.deleteRemoteBranch(branch);

        const onOrigin = await simpleGit(repo).raw([
          "ls-remote",
          "--heads",
          "origin",
          `refs/heads/${branch}`,
        ]);
        expect(onOrigin.trim()).toBe("");
      });

      it("refuses main and leaves it on origin", async () => {
        await expect(service.deleteRemoteBranch("main")).rejects.toMatchObject({
          code: "not_ours",
        });

        const onOrigin = await simpleGit(repo).raw([
          "ls-remote",
          "--heads",
          "origin",
          "refs/heads/main",
        ]);
        expect(onOrigin.trim()).not.toBe("");
      });
    });
  });
});
