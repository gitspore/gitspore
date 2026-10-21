import path from "node:path";
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
import { ClaudeLocator } from "../terminal/claude-locator";

import { OVERVIEW_AGENT_ID } from "@gitspore/shared";

//
//
// moved to shared:
// export const OVERVIEW_AGENT_ID = "overview";

// A boolean has no class Nest could look it up by,
// so it gets a token, like SPAWN_PTY. OverviewModule reads
// GITSPORE_START_OVERVIEW into it.
export const START_OVERVIEW = Symbol("START_OVERVIEW");

@Injectable()
export class OverviewAgentService implements OnApplicationBootstrap {
  private readonly logger = new Logger(OverviewAgentService.name);

  constructor(
    private readonly terminals: TerminalService,
    private readonly locator: ClaudeLocator,
    private readonly store: StateStore,
    private readonly config: RepoConfig,
    @Inject(START_OVERVIEW) private readonly enabled: boolean,
  ) {}

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

    // Without Claude, start nothing and add no agent.
    const claude = await this.locator.resolve();

    // Shell mode: the shell stays after Claude exits, so the user can run
    // commands in the repo or start claude again. Plan mode (read-only)
    // covers only this first start.
    // The file name, not the path: SAFE_ARGUMENT refuses the backslashes and
    // spaces of a Windows path. "claude.cmd" also keeps PowerShell away from
    // claude.ps1, which a restricted execution policy blocks. A
    // GITSPORE_CLAUDE_BIN outside the PATH is not found by the shell.
    // path.win32 splits at both / and \, so it fits every OS.
    this.terminals.spawn({
      agentId: OVERVIEW_AGENT_ID,
      cwd: repo,
      command: path.win32.basename(claude),
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

    // TerminalService tells listeners about every agent's exit. The shell
    // exits only on `exit`; no restart, the agent leaves the state.
    this.terminals.onExited((agentId) => {
      if (agentId === OVERVIEW_AGENT_ID) {
        this.store.apply([{ type: "agent:remove", agentId }]);
      }
    });

    this.logger.log(`Overview agent started in ${repo} on ${branch}`);
  }
}
