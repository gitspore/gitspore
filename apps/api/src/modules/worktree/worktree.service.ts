import { RepoConfig } from "@/config/repo-config";
import { BRANCH_PREFIX } from "@gitspore/shared";
import { Injectable } from "@nestjs/common";
import { basename, dirname, join } from "node:path";
import { simpleGit, SimpleGit } from "simple-git";
import { branchName } from "./branch-name";
import { WorktreeError } from "./worktree-error";
import { access } from "node:fs/promises";

@Injectable()
export class WorktreeService {
  private readonly git: SimpleGit;
  private readonly worktreeRoot: string;

  constructor(private readonly config: RepoConfig) {
    // Reads repoPath() once. When the setup-screen ticket lets the user
    // switch repos, it has to create a new instance.
    const repo = config.repoPath();
    this.git = simpleGit({
      baseDir: config.repoPath(),
      maxConcurrentProcesses: 1,
      timeout: { block: 30_000 },
    });
    this.worktreeRoot = join(
      dirname(repo),
      ".gitspore-worktrees",
      basename(repo),
    );
  }

  async create(issue: { issueNumber: number; issueTitle: string }) {
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

  private run(args: string[]): Promise<string> {
    return this.git.raw(args);
  }
}
