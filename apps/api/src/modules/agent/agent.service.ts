import type {
  AgentDispatchAck,
  AgentId,
  AgentStatus,
  StatusReason,
} from "@gitspore/shared";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { StateStore } from "../state/state.store";
import { GitHubService } from "../github/github.service";
import { WorktreeService } from "../worktree/worktree.service";
import { TerminalService } from "../terminal/terminal.service";
import { ClaudeLocator } from "../terminal/claude-locator";
import { HookService } from "../hooks/hook.service";
import { RepoConfig } from "@/config/repo-config";
import { checkDispatch, checkStop } from "./agent-request";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { PROMPT, taskFile } from "./task-file";
import { TerminalError } from "../terminal/terminal-error";
import { AgentError, toServerError } from "./agent-error";
import { parseHookPayload, statusFromHook } from "./hook-status";
import { hookSettings } from "./hook-files";
import { RepoService } from "../repo/repo.service";

const TASK_DIR = ".gitspore";
const STOP_TIMEOUT_MS = 10_000;
const WATCHDOG_MS = 60_000;
const WATCHDOG_REASON: StatusReason = {
  code: "no_status",
  message:
    "Claude Code has sent no status since it started. It probably waits for " +
    "you to trust the folder: open the agent's terminal and confirm. Opening " +
    "the repo once in Claude Code and trusting it saves the question for " +
    "every future agent. The status updates as soon as Claude Code reports.",
};

// nest build copies it next to the compiled service (nest-cli.json assets).
const HOOK_SCRIPT = join(__dirname, "hook-script.mjs");

type Running = {
  worktreePath: string;
  branch: string;
  sessionId: string;
  processRunning: boolean;
  stopping: boolean;
  // Counts status changes from hooks and the exit, so a slow pull request
  // check can tell that something newer happened meanwhile.
  changes: number;
  watchdog?: NodeJS.Timeout;
};

type Progress = {
  worktree: boolean;
  pushed: boolean;
  spawned: boolean;
};

@Injectable()
export class AgentService implements OnModuleInit {
  private readonly logger = new Logger(AgentService.name);
  private readonly running = new Map<AgentId, Running>();
  private readonly exitWaiters = new Map<AgentId, () => void>();
  watchdogMs = WATCHDOG_MS;

  constructor(
    private readonly store: StateStore,
    private readonly github: GitHubService,
    private readonly worktrees: WorktreeService,
    private readonly terminals: TerminalService,
    private readonly locator: ClaudeLocator,
    private readonly config: RepoConfig,
    private readonly hooks: HookService,
    private readonly repos: RepoService,
  ) {}

  onModuleInit(): void {
    this.terminals.onExited((agentId, exitCode) => {
      void this.handleExit(agentId, exitCode);
    });
    this.hooks.onEvent((agentId, payload) => {
      void this.handleHook(agentId, payload);
    });
  }

  async dispatch(payload: unknown): Promise<AgentDispatchAck> {
    // Before anything else and synchronously: a repo switch (#58) checks for
    // agents when it starts and wipes the state when it ends, so an agent
    // started in between would run unseen. Without a repo there is no
    // worktree to make.
    if (!this.config.isSet() || this.repos.isSwitching()) {
      return {
        error: {
          code: "repo_unavailable",
          message: this.config.isSet()
            ? "gitspore is switching to another repository. Try again in a moment."
            : "No repository is chosen yet.",
        },
      };
    }

    let slotIndex: number;
    let issue;

    try {
      ({ slotIndex, issue } = checkDispatch(payload, this.store.snapshot()));
    } catch (error) {
      return {
        error: this.report(error),
      };
    }

    const target = { issueNumber: issue.number, issueTitle: issue.title };
    const { branch, path } = this.worktrees.planFor(target);
    const agentId = randomUUID();
    const now = new Date().toISOString();
    this.store.apply([
      {
        type: "agent:upsert",
        agent: {
          id: agentId,
          slotIndex,
          issueNumber: issue.number,
          branch,
          worktreePath: path,
          status: "starting",
          statusSince: now,
          startedAt: now,
          pullRequest: null,
          statusReason: null,
        },
      },
    ]);

    const progress: Progress = {
      worktree: false,
      pushed: false,
      spawned: false,
    };

    try {
      const claude = await this.locator.resolve();
      const details = await this.github.getIssue(issue.number);
      await this.worktrees.fetch();
      await this.worktrees.create({
        ...target,
        startPoint: `origin/${this.config.baseBranch()}`,
      });
      progress.worktree = true;
      await this.worktrees.ensureExcluded(`${TASK_DIR}/`);
      await this.worktrees.publish(branch);
      progress.pushed = true;

      await mkdir(join(path, TASK_DIR), { recursive: true });
      await writeFile(join(path, TASK_DIR, "task.md"), taskFile(details));
      await this.writeHookFiles(agentId, path);

      const sessionId = randomUUID();
      this.spawnClaude(agentId, path, claude, sessionId);
      progress.spawned = true;
      const entry: Running = {
        worktreePath: path,
        branch,
        sessionId,
        processRunning: true,
        stopping: false,
        changes: 0,
      };
      this.running.set(agentId, entry);
      this.startWatchdog(agentId, entry);

      // Stays starting until the first hook reports.
      return { agentId };
    } catch (error) {
      await this.rollback(agentId, path, branch, progress);
      return {
        error: this.report(error),
      };
    }
  }

  /**
   * `agent:stop`. Stops Claude Code and frees the slot, optionally removing
   * the worktree (never the branch). Throws an AgentError; the gateway sends
   * it as an `error` event.
   */
  async stop(payload: unknown): Promise<void> {
    const { agentId, removeWorktree } = checkStop(payload);
    const agent = this.store.snapshot().agents.find((a) => a.id === agentId);
    if (!agent) {
      throw new AgentError("agent_not_found", `No agent ${agentId}`, {
        agentId,
      });
    }
    const entry = this.running.get(agentId);
    if (!entry) {
      // Still being dispatched, so nothing runs yet. An agent whose Claude
      // runs but hasn't reported yet is starting as well, and can be stopped.
      if (agent.status === "starting") {
        throw new AgentError(
          "agent_starting",
          `Agent ${agentId} is still starting`,
          { agentId },
        );
      }
      throw new AgentError("agent_not_found", `No agent ${agentId}`, {
        agentId,
      });
    }
    if (entry.stopping) return;

    entry.stopping = true;
    this.clearWatchdog(entry);

    this.hooks.revoke(agentId);
    if (entry.processRunning) await this.killAndWait(agentId);

    if (removeWorktree) {
      await this.removeWorktree(agentId, entry);
    }
    this.running.delete(agentId);
    this.store.apply([{ type: "agent:remove", agentId }]);
  }

  private killAndWait(agentId: AgentId): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.exitWaiters.delete(agentId);
        resolve();
      };
      const timer = setTimeout(done, STOP_TIMEOUT_MS);
      // Before kill(): the exit may come at once.
      this.exitWaiters.set(agentId, done);
      try {
        this.terminals.kill(agentId);
      } catch {
        // The terminal is already gone: nothing to wait for.
        done();
      }
    });
  }

  private async removeWorktree(agentId: AgentId, entry: Running) {
    try {
      if (!(await this.worktrees.isClean(entry.worktreePath))) {
        throw new AgentError(
          "worktree_dirty",
          `${entry.worktreePath} has uncommitted changes, so it was not removed. ` +
            "Stop the agent again without removing the worktree.",
          { agentId },
        );
      }
      await this.worktrees.remove({ path: entry.worktreePath });
    } catch (error) {
      entry.stopping = false;
      this.setStatus(agentId, "error");
      throw error;
    }
  }

  private startWatchdog(agentId: AgentId, entry: Running): void {
    entry.watchdog = setTimeout(() => {
      entry.watchdog = undefined;
      if (this.running.get(agentId) !== entry || entry.stopping) return;
      this.setStatus(agentId, "error", WATCHDOG_REASON);
    }, this.watchdogMs);
    entry.watchdog.unref();
  }

  private clearWatchdog(entry: Running): void {
    clearTimeout(entry.watchdog);
    entry.watchdog = undefined;
  }

  // hook.json tells the hook script where to post and with which secret;
  // settings.json tells Claude Code to run the script for every event.
  private async writeHookFiles(agentId: AgentId, path: string): Promise<void> {
    const hook = {
      url: this.hooks.url(),
      agentId,
      secret: this.hooks.issue(agentId),
    };
    await writeFile(join(path, TASK_DIR, "hook.json"), JSON.stringify(hook));
    await writeFile(
      join(path, TASK_DIR, "settings.json"),
      JSON.stringify(hookSettings(process.execPath, HOOK_SCRIPT), null, 2),
    );
  }

  private spawnClaude(
    agentId: AgentId,
    cwd: string,
    claude: string,
    sessionId: string,
  ): void {
    try {
      this.terminals.spawn({
        agentId,
        cwd,
        mode: "exec",
        command: claude,
        // Relative to cwd: the worktree path may hold characters that
        // cmd.exe would read as syntax when claude.cmd passes it on.
        args: [
          "--settings",
          `${TASK_DIR}/settings.json`,
          "--session-id",
          sessionId,
          PROMPT,
        ],
      });
    } catch (error) {
      // The locator found Claude, but it does not start: it may have been
      // moved or uninstalled since. Look again next time.
      this.locator.invalidate();
      if (error instanceof TerminalError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new AgentError(
        "claude_not_found",
        `Claude Code did not start (${claude}): ${message}`,
      );
    }
  }

  // A hook event, already checked against the agent's secret.
  private async handleHook(agentId: AgentId, payload: unknown): Promise<void> {
    const entry = this.running.get(agentId);
    const event = parseHookPayload(payload);
    if (!entry || entry.stopping || !event) return;
    this.clearWatchdog(entry);

    const outcome = statusFromHook(event);
    if (outcome.kind === "keep") return;

    const change = ++entry.changes;
    const status =
      outcome.kind === "set"
        ? outcome.status
        : await this.statusFromPullRequest(entry.branch);
    // Something newer came in while GitHub was being asked.
    if (entry.changes !== change || entry.stopping) return;
    this.setStatus(agentId, status);
  }

  // Claude Code ended. The hooks can't report that, so the exit code and the
  // pull request decide.
  private async handleExit(agentId: AgentId, exitCode: number): Promise<void> {
    const entry = this.running.get(agentId);
    if (!entry) return;
    entry.processRunning = false;
    this.clearWatchdog(entry);
    entry.changes++;
    this.hooks.revoke(agentId);

    this.exitWaiters.get(agentId)?.();
    if (entry.stopping) return;

    if (exitCode !== 0) {
      this.setStatus(agentId, "error");
      return;
    }
    this.setStatus(agentId, await this.statusFromPullRequest(entry.branch));
  }

  // Asks GitHub directly: a pull request Claude opened seconds ago is not in
  // the last poll yet.
  private async statusFromPullRequest(branch: string): Promise<AgentStatus> {
    try {
      const pullRequest = await this.github.findPullRequest(branch);
      // A merged one stays needs_input until merge handling (GS-48).
      return pullRequest?.state === "open" ? "done" : "needs_input";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`No pull request check for ${branch}: ${message}`);
      return "needs_input";
    }
  }

  private async rollback(
    agentId: AgentId,
    path: string,
    branch: string,
    progress: Progress,
  ): Promise<void> {
    if (progress.spawned) {
      await this.attempt("stop Claude Code", async () =>
        this.terminals.kill(agentId),
      );
    }
    if (progress.worktree) {
      await this.attempt("remove the worktree", () =>
        this.worktrees.remove({ path, force: true, deleteBranch: true }),
      );
    }
    if (progress.pushed) {
      await this.attempt("delete the branch on origin", () =>
        this.worktrees.deleteRemoteBranch(branch),
      );
    }

    this.hooks.revoke(agentId);
    this.running.delete(agentId);
    this.store.apply([{ type: "agent:remove", agentId }]);
  }

  private async attempt(what: string, step: () => Promise<unknown>) {
    try {
      await step();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Rollback could not ${what}: ${message}`);
    }
  }

  // Same status again changes nothing, so it sends nothing either. A message
  // belongs to its status and goes with the next change.
  private setStatus(
    agentId: AgentId,
    status: AgentStatus,
    reason: StatusReason | null = null,
  ): void {
    const agent = this.store.snapshot().agents.find((a) => a.id === agentId);

    if (!agent || agent.status === status) return;
    this.store.apply([
      {
        type: "agent:upsert",
        agent: {
          ...agent,
          status,
          statusSince: new Date().toISOString(),
          statusReason: reason,
        },
      },
    ]);
  }

  private report(error: unknown) {
    const serverError = toServerError(error);
    if (serverError.code === "internal") this.logger.error(error);
    return serverError;
  }
}
