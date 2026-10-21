import type { RepoCheck, RepoChooseAck, RepoProblem } from "@gitspore/shared";
import { Injectable, OnModuleInit } from "@nestjs/common";
import { branchExists, findRepoRoot } from "@/config/find-repo";
import { RepoConfig } from "@/config/repo-config";
import { StateStore } from "../state/state.store";
import { GitHubCredentialsProvider } from "../github/credentials";
import { RepoGitHubSource } from "../github/github-source";
import { GitHubService } from "../github/github.service";
import { WorktreeService } from "../worktree/worktree.service";
import { checkRepo, claudeOnPath, expandHome } from "./check-repo";

/**
 * The repo gitspore works in (#58): puts it into the state at startup,
 * checks paths for the setup screen and switches to another repo.
 */
@Injectable()
export class RepoService implements OnModuleInit {
  constructor(
    private readonly store: StateStore,
    private readonly config: RepoConfig,
    private readonly credentials: GitHubCredentialsProvider,
    private readonly github: GitHubService,
    private readonly worktrees: WorktreeService,
  ) {}

  // Nest awaits this before the gateway listens, so the first snapshot a
  // client gets already has the repo. GitHubService connects on its own
  // too; this asks once more, only for "on" or "off".
  async onModuleInit(): Promise<void> {
    const path = this.config.repoPath();
    this.store.setRepo({
      path,
      baseBranch: this.config.baseBranch(),
      github: await this.githubStatus(path),
    });
  }

  check(path: string, baseBranch: string): Promise<RepoCheck[]> {
    return checkRepo(path, baseBranch, {
      connectGitHub: (top) => this.connectGitHub(top),
      claudeInstalled: claudeOnPath,
    });
  }

  /**
   * Switches to another repo, or returns every reason it can't. Only what
   * agents need is required: a git repo with the base branch. GitHub off
   * is allowed.
   */
  async choose(path: string, baseBranch: string): Promise<RepoChooseAck> {
    const problems: RepoProblem[] = [];

    const { agents } = this.store.snapshot();
    if (agents.some((agent) => agent.slotIndex !== null)) {
      problems.push({
        code: "agents_running",
        message: "Agents are still running. Stop them before switching.",
      });
    } else if (agents.length > 0) {
      // TEMPORARY until the overview agent can restart in the new repo.
      problems.push({
        code: "agents_running",
        message:
          "The overview agent runs in this repo. Restart the daemon without GITSPORE_START_OVERVIEW to switch.",
      });
    }

    const root = await findRepoRoot(expandHome(path));
    if ("problem" in root) {
      problems.push(
        root.problem === "not_found"
          ? { code: "not_found", message: `${path} does not exist.` }
          : {
              code: "not_a_repo",
              message: `${path} is not a git repository. Run git init there, or choose another folder.`,
            },
      );
    } else if (!(await branchExists(root.top, baseBranch))) {
      problems.push({
        code: "no_base_branch",
        message: `Branch "${baseBranch}" does not exist. Choose the base branch.`,
      });
    }

    if (problems.length > 0 || "problem" in root) return { problems };

    // Every service that keeps the path works in the new repo from here on.
    this.config.set(root.top, baseBranch);
    await this.worktrees.reconfigure();
    const repo = {
      path: root.top,
      baseBranch,
      github: await this.githubStatus(root.top),
    };
    // The state starts over; every tab gets a snapshot (StateGateway).
    this.store.setRepo(repo);
    // Not awaited: the new issues arrive as patches, problems as `error`.
    void this.github.restart();
    return { repo };
  }

  private async githubStatus(top: string): Promise<"on" | "off"> {
    return "api" in (await this.connectGitHub(top)) ? "on" : "off";
  }

  private connectGitHub(top: string) {
    return new RepoGitHubSource(top, this.credentials).connect();
  }
}
