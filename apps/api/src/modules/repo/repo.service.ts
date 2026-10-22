import type { RepoCheck, RepoChooseAck, RepoProblem } from "@gitspore/shared";
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleInit,
} from "@nestjs/common";
import { branchExists, findRepoRoot } from "@/config/find-repo";
import { RepoConfig } from "@/config/repo-config";
import { RepoMemory } from "@/config/repo-memory";
import { StateStore } from "../state/state.store";
import { GitHubCredentialsProvider } from "../github/credentials";
import { RepoGitHubSource } from "../github/github-source";
import { GitHubService } from "../github/github.service";
import { OverviewAgentService } from "../overview/overview-agent.service";
import { WorktreeService } from "../worktree/worktree.service";
import { ClaudeLocator } from "../terminal/claude-locator";
import { checkRepo, expandHome } from "./check-repo";

/**
 * The repo gitspore works in (#58): puts it into the state at startup,
 * checks paths for the setup screen, switches to another repo and
 * remembers it for the next start. Starts GitHub sync once a repo is known.
 */
@Injectable()
export class RepoService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(RepoService.name);
  // True from the first line of choose() until it answers. Set before any
  // await, so two tabs can't both pass the checks.
  private switching = false;

  constructor(
    private readonly store: StateStore,
    private readonly config: RepoConfig,
    private readonly credentials: GitHubCredentialsProvider,
    private readonly github: GitHubService,
    private readonly worktrees: WorktreeService,
    private readonly memory: RepoMemory,
    private readonly overview: OverviewAgentService,
    private readonly claude: ClaudeLocator,
  ) {}

  // Nest awaits this before the gateway listens, so the first snapshot a
  // client gets already has the repo. Without one the state keeps
  // repo: null and the setup screen shows. GitHub is asked here only for
  // "on" or "off"; the sync starts in onApplicationBootstrap.
  async onModuleInit(): Promise<void> {
    if (!this.config.isSet()) return;
    const path = this.config.repoPath();
    this.store.setRepo({
      path,
      baseBranch: this.config.baseBranch(),
      github: await this.githubStatus(path),
    });
  }

  // Not awaited: asking gh for a token and GitHub for the issues takes a
  // moment, and the daemon should accept connections meanwhile.
  onApplicationBootstrap(): void {
    if (this.config.isSet()) void this.github.start();
  }

  check(path: string, baseBranch: string): Promise<RepoCheck[]> {
    return checkRepo(path, baseBranch, {
      connectGitHub: (top) => this.connectGitHub(top),
      // The same lookup the agents start with (claude.cmd on Windows,
      // GITSPORE_CLAUDE_BIN), so the screen and a start never disagree.
      claudeInstalled: () =>
        this.claude.resolve().then(
          () => true,
          () => false,
        ),
    });
  }

  /**
   * Switches to another repo, or returns every reason it can't. Only what
   * agents need is required: a git repo with the base branch. GitHub off
   * is allowed.
   */
  async choose(path: string, baseBranch: string): Promise<RepoChooseAck> {
    if (this.switching) {
      return {
        problems: [
          {
            code: "switching",
            message: "Another tab is switching repos. Try again in a moment.",
          },
        ],
      };
    }
    this.switching = true;
    try {
      return await this.switchTo(path, baseBranch);
    } finally {
      this.switching = false;
    }
  }

  /**
   * While a switch runs, nothing may start an agent: the switch checked
   * for running agents at its start and wipes the state at its end. Agent
   * dispatch (#16) asks here and refuses.
   */
  isSwitching(): boolean {
    return this.switching;
  }

  private async switchTo(
    path: string,
    baseBranch: string,
  ): Promise<RepoChooseAck> {
    const problems: RepoProblem[] = [];

    // The overview agent doesn't count: it restarts in the new repo.
    const { agents } = this.store.snapshot();
    if (agents.some((agent) => agent.slotIndex !== null)) {
      problems.push({
        code: "agents_running",
        message: "Agents are still running. Stop them before switching.",
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

    // Ends before the state starts over, so its exit (agent:remove) belongs
    // to the old repo.
    await this.overview.stop();
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
    await this.overview.start();
    await this.remember(repo.path, baseBranch);
    return { repo };
  }

  // The switch already happened; a file that can't be written only means
  // the setup screen shows again on the next start.
  private async remember(path: string, baseBranch: string): Promise<void> {
    try {
      await this.memory.remember({ path, baseBranch });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Could not remember ${path}: ${message}`);
    }
  }

  private async githubStatus(top: string): Promise<"on" | "off"> {
    return "api" in (await this.connectGitHub(top)) ? "on" : "off";
  }

  private connectGitHub(top: string) {
    return new RepoGitHubSource(top, this.credentials).connect();
  }
}
