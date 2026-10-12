import { RepoConfig } from "@/config/repo-config";
import { BRANCH_PREFIX } from "@gitspore/shared";
import { Injectable } from "@nestjs/common";
import { basename, dirname, join, resolve } from "node:path";
import { simpleGit, SimpleGit } from "simple-git";
import { branchName } from "./branch-name";
import { WorktreeError } from "./worktree-error";
import { access } from "node:fs/promises";

export type Worktree = { branch: string; path: string };

//
//

@Injectable()
export class WorktreeService {
  private readonly git: SimpleGit;
  private readonly worktreeRoot: string;

  constructor(private readonly config: RepoConfig) {
    // Reads repoPath() once. When the setup-screen ticket lets the user
    // switch repos, it has to create a new instance.
    const repo = config.repoPath();
    this.git = simpleGit({
      // baseDir: config.repoPath(),
      baseDir: repo,
      maxConcurrentProcesses: 1,
      timeout: { block: 30_000 },
    });
    this.worktreeRoot = join(
      dirname(repo),
      ".gitspore-worktrees",
      basename(repo),
    );
  }

  async create(issue: {
    issueNumber: number;
    issueTitle: string;
  }): Promise<Worktree> {
    const branch = branchName(issue.issueNumber, issue.issueTitle);
    const path = join(this.worktreeRoot, branch.slice(BRANCH_PREFIX.length));

    if (await this.branchExists(branch)) {
      throw new WorktreeError(
        "branch_exists",
        `Branch ${branch} already exists.`,
      );
    }

    if (await this.pathExists(path)) {
      throw new WorktreeError("path_exists", `Folder ${path} already exists.`);
    }

    await this.run([
      "worktree",
      "add",
      "-b",
      branch,
      path,
      this.config.baseBranch(),
    ]);
    return { branch, path };
  }

  async list(): Promise<Worktree[]> {
    const output = await this.run(["worktree", "list", "--porcelain"]);
    const worktrees: Worktree[] = [];

    for (const block of output.split("\n\n")) {
      let path = "";
      let branch = "";

      for (const line of block.split("\n")) {
        const space = line.indexOf(" ");
        const key = space === -1 ? line : line.slice(0, space);
        const value = space === -1 ? "" : line.slice(space + 1);

        if (key === "worktree") path = resolve(value);
        if (key === "branch") branch = value.replace("refs/heads/", "");
      }

      if (
        dirname(path) === this.worktreeRoot &&
        branch.startsWith(BRANCH_PREFIX)
      ) {
        worktrees.push({ branch, path });
      }
    }

    return worktrees;
  }

  async remove(options: { path: string; force?: boolean }): Promise<void> {
    if (dirname(resolve(options.path)) !== this.worktreeRoot) {
      throw new WorktreeError(
        "outside_root",
        `${options.path} is not a gitspore worktree.`,
      );
    }

    if (!options.force && (await this.pathExists(options.path))) {
      const status = await this.statusOf(options.path);
      if (status !== "") {
        throw new WorktreeError(
          "dirty",
          `${options.path} has uncommitted changes.`,
        );
      }
    }

    await this.run([
      "worktree",
      "remove",
      ...(options.force ? ["--force"] : []),
      options.path,
    ]);
  }

  // error check helpers
  private async branchExists(branch: string): Promise<boolean> {
    try {
      await this.run(["show-ref", "--verify", `refs/heads/${branch}`]);
      return true;
    } catch {
      return false;
    }
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  //git status -C alternative (simple git forbids -C for security). I tried -C because we remain on main branch.
  private statusOf(path: string): Promise<string> {
    return simpleGit({ baseDir: path, timeout: { block: 30_000 } }).raw([
      "status",
      "--porcelain",
      "--untracked-files=all",
    ]);
  }

  // Run git command:
  private run(args: string[]): Promise<string> {
    return this.git.raw(args);
  }
}
