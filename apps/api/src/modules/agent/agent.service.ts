import { AgentId, AgentStatus } from "@gitspore/shared";
import { Injectable, Logger } from "@nestjs/common";
import { StateStore } from "../state/state.store";
import { GitHubService } from "../github/github.service";
import { WorktreeService } from "../worktree/worktree.service";
import { TerminalService } from "../terminal/terminal.service";
import { ClaudeLocator } from "../terminal/claude-locator";
import { RepoConfig } from "@/config/repo-config";
import { checkDispatch } from "./agent-request";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { PROMPT, taskFile } from "./task-file";
import { TerminalError } from "../terminal/terminal-error";
import { AgentError, toServerError } from "./agent-error";

const TASK_DIR = ".gitspore";

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
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly running = new Map<AgentId, Running>();

  constructor(
    private readonly store: StateStore,
    private readonly github: GitHubService,
    private readonly worktrees: WorktreeService,
    private readonly terminals: TerminalService,
    private readonly locator: ClaudeLocator,
    private readonly config: RepoConfig,
  ) {}

  async dispatch(payload: unknown) {
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
