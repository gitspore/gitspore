import type {
  RepoCheck,
  RepoChooseAck,
  RepoInfo,
  RepoProblem,
} from "@gitspore/shared";
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
import { branchProblem, NO_CLAUDE, rootProblem } from "./repo-problems";

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
  private readonly switchedListeners: (() => Promise<void>)[] = [];

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

  // Runs before the gateway listens, so the first snapshot a client gets
  // already has the repo. Without one the state keeps repo: null and the
  // setup screen shows. GitHub isn't asked here: "off" until GitHubService
  // connects and sends repo:github, so the start never waits for gh.
  onModuleInit(): void {
    if (!this.config.isSet()) return;
    this.store.setRepo({
      path: this.config.repoPath(),
      baseBranch: this.config.baseBranch(),
      github: "off",
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
      claudeInstalled: () => this.claudeFound(),
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

  /**
   * Runs after a switch has started the state over, before GitHub sync
   * starts for the new repo. AgentService takes over the worktrees the new
   * repo still has (#102), so the first poll already sees their branches.
   */
  onSwitched(listener: () => Promise<void>): void {
    this.switchedListeners.push(listener);
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
      problems.push(rootProblem(path, root.problem));
    } else if (!(await branchExists(root.top, baseBranch))) {
      problems.push(branchProblem(baseBranch));
    }

    // Without it the switch would work, but no agent could start there.
    if (!(await this.claudeFound())) problems.push(NO_CLAUDE);

    if (problems.length > 0 || "problem" in root) return { problems };

    // Ends before the state starts over, so its exit (agent:remove) belongs
    // to the old repo.
    await this.overview.stop();
    // Every service that keeps the path works in the new repo from here on.
    const before = {
      repo: this.config.isSet() ? this.config.repoPath() : null,
      base: this.config.baseBranch(),
    };
    this.config.set(root.top, baseBranch);
    try {
      await this.worktrees.reconfigure();
    } catch (error) {
      return this.undoSwitch(before, path, error);
    }
    // "off" until github.restart() below has connected (repo:github).
    const repo: RepoInfo = { path: root.top, baseBranch, github: "off" };
    // The state starts over; every tab gets a snapshot (StateGateway).
    this.store.setRepo(repo);
    for (const listener of this.switchedListeners) await listener();
    // Not awaited: the new issues arrive as patches, problems as `error`.
    void this.github.restart();
    await this.overview.start();
    await this.remember(repo.path, baseBranch);
    return { repo };
  }

  // reconfigure() is the only step of a switch that can throw, and the
  // state still is the old repo's. Puts back what changed before it.
  private async undoSwitch(
    before: { repo: string | null; base: string },
    path: string,
    error: unknown,
  ): Promise<RepoChooseAck> {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`Switching to ${path} failed: ${message}`);
    this.config.set(before.repo, before.base);
    try {
      await this.worktrees.reconfigure();
    } catch (again) {
      const reason = again instanceof Error ? again.message : String(again);
      this.logger.error(`The old repo's worktrees failed too: ${reason}`);
    }
    await this.overview.start();
    return {
      problems: [
        {
          code: "switch_failed",
          message: `Switching to ${path} failed: ${message}. gitspore stays where it was.`,
        },
      ],
    };
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

  // The same lookup the agents start with (claude.cmd on Windows,
  // GITSPORE_CLAUDE_BIN), so the screen, a switch and a start never disagree.
  private claudeFound(): Promise<boolean> {
    return this.claude.resolve().then(
      () => true,
      () => false,
    );
  }

  private connectGitHub(top: string) {
    return new RepoGitHubSource(top, this.credentials).connect();
  }
}
