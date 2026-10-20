import { RepoConfig } from "@/config/repo-config";
import { BRANCH_PREFIX, branchForIssue } from "@gitspore/shared";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { basename, dirname, join, resolve } from "node:path";
import { simpleGit, SimpleGit } from "simple-git";
import { WorktreeError } from "./worktree-error";
import { access } from "node:fs/promises";

export type Worktree = { branch: string; path: string };

// Commands that talk to origin wait for the network. simple-git sets the
// timeout per instance, and a second instance would have its own queue, so
// two git commands could run at once. One timeout for all commands instead.
const GIT_TIMEOUT_MS = 60_000;

// simple-git refuses these when they are passed through .env(), and drops
// them from the ambient environment otherwise (simple-git 4, environment
// guard). VS Code sets GIT_ASKPASS, many shells set EDITOR.
const GUARDED_ENV = /^(GIT_|EDITOR$|PAGER$|PREFIX$|SSH_ASKPASS$|VISUAL$)/i;

function gitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!GUARDED_ENV.test(key)) env[key] = value;
  }
  return {
    ...env,
    // A missing login fails at once instead of waiting for a password.
    GIT_TERMINAL_PROMPT: "0",
    // The same for Git Credential Manager on Windows; ignored elsewhere.
    GCM_INTERACTIVE: "never",
  };
}

@Injectable()
export class WorktreeService implements OnModuleInit {
  private readonly git: SimpleGit;
  private readonly worktreeRoot: string;
  private readonly logger = new Logger(WorktreeService.name);

  constructor(private readonly config: RepoConfig) {
    // Reads repoPath() once. When the setup-screen ticket lets the user
    // switch repos, it has to create a new instance.
    const repo = config.repoPath();
    this.git = simpleGit({
      baseDir: repo,
      maxConcurrentProcesses: 1,
      timeout: { block: GIT_TIMEOUT_MS },
      allowEnvironment: ["GIT_TERMINAL_PROMPT"],
    }).env(gitEnv());

    this.worktreeRoot = join(
      dirname(repo),
      ".gitspore-worktrees",
      basename(repo),
    );
  }

  private assertOurs(branch: string): void {
    if (!branch.startsWith(BRANCH_PREFIX)) {
      throw new WorktreeError(
        "not_ours",
        `${branch} is not a ${BRANCH_PREFIX} branch.`,
      );
    }
  }

  async onModuleInit(): Promise<void> {
    await this.run(["worktree", "prune"]);
    const worktrees = await this.list();
    this.logger.log(
      `${worktrees.length} worktree(s) in ${this.worktreeRoot}: ` +
        (worktrees.map((w) => w.branch).join(", ") || "none"),
    );
  }

  async fetch(): Promise<void> {
    await this.run(["fetch", "origin", this.config.baseBranch()]);
  }

  async create(issue: {
    issueNumber: number;
    issueTitle: string;
    startPoint?: string;
  }): Promise<Worktree> {
    const branch = branchForIssue(issue.issueNumber, issue.issueTitle);
    const path = join(this.worktreeRoot, branch.slice(BRANCH_PREFIX.length));

    if (await this.branchExists(branch)) {
      throw new WorktreeError(
        "branch_exists",
        `Branch ${branch} already exists.`,
      );
    }

    if (
      issue.startPoint !== undefined &&
      (await this.branchExistsOnOrigin(branch))
    ) {
      throw new WorktreeError(
        "branch_exists",
        `Branch ${branch} already exists on origin.`,
      );
    }

    if (await this.pathExists(path)) {
      // Another create() for the same issue may have made the folder since
      // the check above. `worktree add -b` makes the branch before the
      // folder, so then the branch exists by now. A folder without its
      // branch is a leftover.
      if (await this.branchExists(branch)) {
        throw new WorktreeError(
          "branch_exists",
          `Branch ${branch} already exists.`,
        );
      }
      throw new WorktreeError("path_exists", `Folder ${path} already exists.`);
    }

    try {
      await this.run([
        "worktree",
        "add",
        "-b",
        branch,
        path,
        issue.startPoint ?? this.config.baseBranch(),
      ]);
    } catch (error) {
      // Another create() for the same issue can pass the checks at the same
      // time; then its branch exists now.
      if (await this.branchExists(branch)) {
        throw new WorktreeError(
          "branch_exists",
          `Branch ${branch} already exists.`,
        );
      }
      throw error;
    }
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

  async remove(options: {
    path: string;
    force?: boolean;
    deleteBranch?: boolean;
  }): Promise<void> {
    if (dirname(resolve(options.path)) !== this.worktreeRoot) {
      throw new WorktreeError(
        "outside_root",
        `${options.path} is not a gitspore worktree.`,
      );
    }

    const worktree = (await this.list()).find(
      (w) => w.path === resolve(options.path),
    );

    if (!worktree) {
      throw new WorktreeError(
        "not_found",
        `${options.path} is not a registered worktree.`,
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

    if (options.deleteBranch && !options.force) {
      const base = this.config.baseBranch();
      const ahead = await this.run([
        "rev-list",
        "--count",
        `${base}..${worktree.branch}`,
      ]);
      if (ahead.trim() !== "0") {
        throw new WorktreeError(
          "unmerged",
          `${worktree.branch} has commits that are not in ${base}.`,
        );
      }
    }

    await this.run([
      "worktree",
      "remove",
      ...(options.force ? ["--force"] : []),
      options.path,
    ]);

    if (options.deleteBranch) {
      await this.run(["branch", "-D", worktree.branch]);
    }
  }

  async publish(branch: string): Promise<void> {
    this.assertOurs(branch);
    try {
      await this.run(["push", "-u", "origin", branch]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new WorktreeError(
        "push_failed",
        `Could not push ${branch} to origin: ${message}`,
      );
    }
  }

  async deleteRemoteBranch(branch: string): Promise<void> {
    this.assertOurs(branch);
    await this.run(["push", "origin", "--delete", branch]);
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

  private async branchExistsOnOrigin(branch: string): Promise<boolean> {
    const output = await this.run([
      "ls-remote",
      "--heads",
      "origin",
      `refs/heads/${branch}`,
    ]);
    return output.trim() !== "";
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
