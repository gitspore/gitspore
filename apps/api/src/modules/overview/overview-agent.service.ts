import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { simpleGit } from "simple-git";
import { RepoConfig } from "@/config/repo-config";
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from "@nestjs/common";
import { STATUSLINE_SCRIPT, statuslineSettings } from "../agent/hook-files";
import { HookService } from "../hooks/hook.service";
import { StateStore } from "../state/state.store";
import { TerminalService } from "../terminal/terminal.service";
import { ClaudeLocator } from "../terminal/claude-locator";
import { WorktreeService } from "../worktree/worktree.service";

import { OVERVIEW_AGENT_ID } from "@gitspore/shared";

//
//
// moved to shared:
// export const OVERVIEW_AGENT_ID = "overview";

// A boolean has no class Nest could look it up by,
// so it gets a token, like SPAWN_PTY. OverviewModule reads
// GITSPORE_START_OVERVIEW into it.
export const START_OVERVIEW = Symbol("START_OVERVIEW");

// The same folder the agents' worktrees get, here in the repo root.
const HOOK_DIR = ".gitspore";

@Injectable()
export class OverviewAgentService implements OnApplicationBootstrap {
  private readonly logger = new Logger(OverviewAgentService.name);

  constructor(
    private readonly terminals: TerminalService,
    private readonly locator: ClaudeLocator,
    private readonly store: StateStore,
    private readonly config: RepoConfig,
    private readonly hooks: HookService,
    private readonly worktrees: WorktreeService,
    @Inject(START_OVERVIEW) private readonly enabled: boolean,
  ) {}

  // Nest calls this once, after every module is set up.
  async onApplicationBootstrap(): Promise<void> {
    if (!this.enabled) return;

    // TerminalService tells listeners about every agent's exit. The shell
    // exits only on `exit`; no restart, the agent leaves the state.
    // Registered once here, not per start: a repo switch starts it again.
    this.terminals.onExited((agentId) => {
      if (agentId === OVERVIEW_AGENT_ID) {
        this.hooks.revoke(agentId);
        this.store.apply([{ type: "agent:remove", agentId }]);
      }
    });

    await this.start();
  }

  /**
   * Starts the overview agent in the repo RepoConfig names: at startup, and
   * again after RepoService switched repos (#58).
   */
  async start(): Promise<void> {
    if (!this.enabled) return;
    // Without a repo there is nothing to look at; the setup screen shows.
    if (!this.config.isSet()) {
      this.logger.log("No repository chosen yet; overview agent not started");
      return;
    }

    // A throw here would stop the daemon.
    // Without the overview agent
    // everything else still works,
    // so we log and continue.
    try {
      await this.spawnAgent();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Could not start the overview agent: ${message}`);
    }
  }

  /**
   * Ends the overview agent, before a switch to another repo (#58). Never
   * waits forever, or the switch would stay "switching" and refuse every
   * dispatch. A shell that doesn't exit is left behind; start() in the new
   * repo then fails with already_running and logs it.
   */
  async stop(): Promise<void> {
    this.hooks.revoke(OVERVIEW_AGENT_ID);
    const exited = await this.terminals.stop(OVERVIEW_AGENT_ID);
    if (!exited) {
      this.logger.warn("The overview agent's shell did not exit; going on");
    }
  }

  private async spawnAgent(): Promise<void> {
    const repo = this.config.repoPath();
    // The branch checked out in the repo root, read once per start.
    const branch = await simpleGit(repo).revparse(["--abbrev-ref", "HEAD"]);

    // Without Claude, start nothing and add no agent.
    const claude = await this.locator.resolve();
    const settings = await this.statuslineArgs(repo);

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
      args: [...settings, "--permission-mode", "plan"],
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
          pullRequest: null,
          statusReason: null,
          usage: null,
          cleaningUp: false,
        },
      },
    ]);

    this.logger.log(`Overview agent started in ${repo} on ${branch}`);
  }

  // The statusline, like a slot agent's, so its answers bring the plan's
  // limits too (#42). No hooks: its status stays "working" (#16). Without
  // the files the overview agent still starts, only without a statusline.
  private async statuslineArgs(repo: string): Promise<string[]> {
    try {
      await this.worktrees.ensureExcluded(`${HOOK_DIR}/`);
      await mkdir(path.join(repo, HOOK_DIR), { recursive: true });
      const hook = {
        url: this.hooks.url(),
        agentId: OVERVIEW_AGENT_ID,
        secret: this.hooks.issue(OVERVIEW_AGENT_ID),
      };
      await writeFile(
        path.join(repo, HOOK_DIR, "hook.json"),
        JSON.stringify(hook),
      );
      await writeFile(
        path.join(repo, HOOK_DIR, "settings.json"),
        JSON.stringify(statuslineSettings(STATUSLINE_SCRIPT), null, 2),
      );
      // Relative, like the slot agents': SAFE_ARGUMENT refuses a Windows path.
      return ["--settings", `${HOOK_DIR}/settings.json`];
    } catch (error) {
      this.hooks.revoke(OVERVIEW_AGENT_ID);
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Overview agent starts without a statusline: ${message}`,
      );
      return [];
    }
  }
}
