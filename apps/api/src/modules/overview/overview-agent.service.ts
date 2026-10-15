import { simpleGit } from "simple-git";
import { RepoConfig } from "@/config/repo-config";
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from "@nestjs/common";
import { StateStore } from "../state/state.store";
import { TerminalService } from "../terminal/terminal.service";

//
//
//
export const OVERVIEW_AGENT_ID = "overview";

// A boolean has no class Nest could look it up by,
// so it gets a token, like SPAWN_PTY. OverviewModule reads
// GITSPORE_START_OVERVIEW into it.
export const START_OVERVIEW = Symbol("START_OVERVIEW");

@Injectable()
export class OverviewAgentService implements OnApplicationBootstrap {
  private readonly logger = new Logger(OverviewAgentService.name);

  constructor(
    private readonly terminals: TerminalService,
    private readonly store: StateStore,
    private readonly config: RepoConfig,
    @Inject(START_OVERVIEW) private readonly enabled: boolean,
  ) {}

  //   async onApplicationBootstrap(): Promise<void> {
  //     if (!this.enabled) return;

  //     const repo = this.config.repoPath();
  //     // The branch checked out in the repo root, read once at startup.
  //     const branch = await simpleGit(repo).revparse(["--abbrev-ref", "HEAD"]);

  //     // Read-only (plan mode)
  //     // while it runs in our own repo.
  //     // No prompt,
  //     // so nothing user-controlled typed into shell.
  //     this.terminals.spawn({
  //       agentId: OVERVIEW_AGENT_ID,
  //       cwd: repo,
  //       command: "claude",
  //       args: ["--permission-mode", "plan"],
  //     });

  //     const now = new Date().toISOString();
  //     this.store.apply([
  //       {
  //         type: "agent:upsert",
  //         agent: {
  //           id: OVERVIEW_AGENT_ID,
  //           slotIndex: null,
  //           issueNumber: null,
  //           branch,
  //           worktreePath: repo,
  //           // Stays "working" until hooks report the real status (#16).
  //           status: "working",
  //           statusSince: now,
  //           startedAt: now,
  //         },
  //       },
  //     ]);
  //     // TerminalService tells every listener
  //     // about every agent's exit.
  //     // No restart for now: the agent just leaves the state.
  //     this.terminals.onExited((agentId) => {
  //       if (agentId === OVERVIEW_AGENT_ID) {
  //         this.store.apply([{ type: "agent:remove", agentId }]);
  //       }
  //     });
  //   }
  // Nest calls this once, after every module is set up.
  async onApplicationBootstrap(): Promise<void> {
    if (!this.enabled) return;

    // A throw here would stop the daemon.
    // Without the overview agent
    // everything else still works,
    // so we log and continue.
    try {
      await this.start();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Could not start the overview agent: ${message}`);
    }
  }

  private async start(): Promise<void> {
    const repo = this.config.repoPath();
    // The branch checked out in the repo root, read once at startup.
    const branch = await simpleGit(repo).revparse(["--abbrev-ref", "HEAD"]);

    // Read-only (plan mode) while it runs in our own repo.
    // No prompt:
    // nothing user-controlled is typed into the shell atm.
    this.terminals.spawn({
      agentId: OVERVIEW_AGENT_ID,
      cwd: repo,
      command: "claude",
      args: ["--permission-mode", "plan"],
    });

    const now = new Date().toISOString();
    this.store.apply([
      {
        type: "agent:upsert",
        agent: {
          id: OVERVIEW_AGENT_ID,
          slotIndex: null,
          issueNumber: null,
          branch,
          worktreePath: repo,
          // Stays "working" until hooks report the real status (#16).
          status: "working",
          statusSince: now,
          startedAt: now,
        },
      },
    ]);

    // TerminalService tells listeners about every agent's exit.
    // No restart: agent leaves state.
    this.terminals.onExited((agentId) => {
      if (agentId === OVERVIEW_AGENT_ID) {
        this.store.apply([{ type: "agent:remove", agentId }]);
      }
    });

    this.logger.log(`Overview agent started in ${repo} on ${branch}`);
  }
}
