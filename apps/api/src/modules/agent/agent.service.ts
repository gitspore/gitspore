import type { AgentDispatchAck, AgentId, AgentStatus } from "@gitspore/shared";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { StateStore } from "../state/state.store";
import { GitHubService } from "../github/github.service";
import { WorktreeService } from "../worktree/worktree.service";
import { TerminalService } from "../terminal/terminal.service";
import { ClaudeLocator } from "../terminal/claude-locator";
import { RepoConfig } from "@/config/repo-config";
import { checkDispatch, checkStop } from "./agent-request";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { PROMPT, taskFile } from "./task-file";
import { TerminalError } from "../terminal/terminal-error";
import { AgentError, toServerError } from "./agent-error";
import { RepoService } from "../repo/repo.service";

const TASK_DIR = ".gitspore";
const STOP_TIMEOUT_MS = 10_000;

type Running = {
  worktreePath: string;
  branch: string;
  sessionId: string;
  processRunning: boolean;
  stopping: boolean;
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

  constructor(
    private readonly store: StateStore,
    private readonly github: GitHubService,
    private readonly worktrees: WorktreeService,
    private readonly terminals: TerminalService,
    private readonly locator: ClaudeLocator,
    private readonly config: RepoConfig,
    private readonly repos: RepoService,
  ) {}

  onModuleInit(): void {
    this.terminals.onExited((agentId, exitCode) => {
      void this.handleExit(agentId, exitCode);
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

      const sessionId = randomUUID();
      this.spawnClaude(agentId, path, claude, sessionId);
      progress.spawned = true;
      this.running.set(agentId, {
        worktreePath: path,
        branch,
        sessionId,
        processRunning: true,
        stopping: false,
      });
      // GS-67 replaces this with the status the hooks report.
      this.setStatus(agentId, "working");
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
    if (agent.status === "starting") {
      throw new AgentError(
        "agent_starting",
        `Agent ${agentId} is still starting`,
        { agentId },
      );
    }
    const entry = this.running.get(agentId);
    if (!entry) {
      throw new AgentError("agent_not_found", `No agent ${agentId}`, {
        agentId,
      });
    }
    if (entry.stopping) return;

    entry.stopping = true;
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
        args: ["--session-id", sessionId, PROMPT],
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

  // Claude Code ended. Status from the exit code, and on a clean exit from
  // whether it opened a pull request. GS-67 replaces this with the status
  // the hooks report.
  private async handleExit(agentId: AgentId, exitCode: number): Promise<void> {
    const entry = this.running.get(agentId);
    if (!entry) return;
    entry.processRunning = false;

    this.exitWaiters.get(agentId)?.();
    if (entry.stopping) return;

    if (exitCode !== 0) {
      this.setStatus(agentId, "error");
      return;
    }
    this.setStatus(agentId, await this.statusAfterCleanExit(entry.branch));
  }

  // Asks GitHub directly: a pull request Claude opened seconds ago is not in
  // the last poll yet.
  private async statusAfterCleanExit(branch: string): Promise<AgentStatus> {
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

  private setStatus(agentId: AgentId, status: AgentStatus): void {
    const agent = this.store.snapshot().agents.find((a) => a.id === agentId);

    if (!agent) return;
    this.store.apply([
      {
        type: "agent:upsert",
        agent: { ...agent, status, statusSince: new Date().toISOString() },
      },
    ]);
  }

  private report(error: unknown) {
    const serverError = toServerError(error);
    if (serverError.code === "internal") this.logger.error(error);
    return serverError;
  }
}
