import { RepoConfig } from "@/config/repo-config";
import type { AgentStatus, Issue, StatePatch } from "@gitspore/shared";
import { Logger } from "@nestjs/common";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitHubError } from "../github/github-error";
import type { GitHubService } from "../github/github.service";
import { StateStore } from "../state/state.store";
import type { ClaudeLocator } from "../terminal/claude-locator";
import { TerminalError } from "../terminal/terminal-error";
import type { TerminalService } from "../terminal/terminal.service";
import { WorktreeError } from "../worktree/worktree-error";
import type { WorktreeService } from "../worktree/worktree.service";
import { AgentService } from "./agent.service";
import { PROMPT, taskFile } from "./task-file";

const issue = (number: number): Issue => ({
  number,
  title: `Issue ${number}`,
  url: `https://github.com/owner/repo/issues/${number}`,
  labels: [],
});

// Stands in for WorktreeService. create() makes a real folder, so the
// service can write the task file into it; nothing else touches git.
class FakeWorktrees {
  constructor(private readonly root: string) {}
  readonly planFor = jest.fn(
    (target: { issueNumber: number; issueTitle: string }) => ({
      branch: `spore/${target.issueNumber}-issue`,
      path: join(this.root, `${target.issueNumber}-issue`),
    }),
  );
  readonly fetch = jest.fn(async () => {});
  readonly create = jest.fn(
    async (target: { issueNumber: number; issueTitle: string }) => {
      const plan = this.planFor(target);
      await mkdir(plan.path, { recursive: true });
      return plan;
    },
  );
  readonly ensureExcluded = jest.fn(async () => {});
  readonly publish = jest.fn(async () => {});
  readonly remove = jest.fn(async () => {});
  readonly deleteRemoteBranch = jest.fn(async () => {});
}

class FakeTerminals {
  readonly spawn = jest.fn();
  readonly kill = jest.fn();
  readonly onExited = jest.fn();
}

class FakeLocator {
  readonly resolve = jest.fn(async () => "/bin/claude");
  readonly invalidate = jest.fn();
}

class FakeGitHub {
  readonly getIssue = jest.fn(async (number: number) => ({
    ...issue(number),
    body: "Fix it.",
  }));
  readonly findPullRequest = jest.fn(async () => null);
}

describe("AgentService.dispatch", () => {
  let root: string;
  let store: StateStore;
  let worktrees: FakeWorktrees;
  let terminals: FakeTerminals;
  let locator: FakeLocator;
  let github: FakeGitHub;
  let service: AgentService;
  let statuses: (AgentStatus | "removed")[];

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "gitspore-agent-"));
    store = new StateStore();
    store.apply([
      { type: "issue:upsert", issue: issue(42) },
      { type: "issue:upsert", issue: issue(43) },
    ]);
    worktrees = new FakeWorktrees(root);
    terminals = new FakeTerminals();
    locator = new FakeLocator();
    github = new FakeGitHub();
    service = new AgentService(
      store,
      github as unknown as GitHubService,
      worktrees as unknown as WorktreeService,
      terminals as unknown as TerminalService,
      locator as unknown as ClaudeLocator,
      new RepoConfig("/repo", "main"),
    );

    // Every status an agent goes through, in order.
    statuses = [];
    store.onPatch((patch: StatePatch) => {
      for (const op of patch.ops) {
        if (op.type === "agent:upsert") statuses.push(op.agent.status);
        if (op.type === "agent:remove") statuses.push("removed");
      }
    });
    // Rollbacks log a warning; the tests check what happened instead.
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  const dispatch = (issueNumber = 42, slotIndex = 0) =>
    service.dispatch({ issueNumber, slotIndex });

  // --- the way it should go ------------------------------------------

  it("starts Claude Code in a pushed worktree and acks the agent's id", async () => {
    const ack = await dispatch();

    expect(ack).toEqual({ agentId: expect.any(String) });
    expect(statuses).toEqual(["starting", "working"]);
    const [agent] = store.snapshot().agents;
    expect(agent).toMatchObject({
      slotIndex: 0,
      issueNumber: 42,
      branch: "spore/42-issue",
      worktreePath: join(root, "42-issue"),
      status: "working",
    });
    expect(worktrees.create).toHaveBeenCalledWith({
      issueNumber: 42,
      issueTitle: "Issue 42",
      startPoint: "origin/main",
    });
    expect(worktrees.ensureExcluded).toHaveBeenCalledWith(".gitspore/");
    expect(worktrees.publish).toHaveBeenCalledWith("spore/42-issue");
    expect(terminals.spawn).toHaveBeenCalledWith({
      agentId: agent.id,
      cwd: join(root, "42-issue"),
      mode: "exec",
      command: "/bin/claude",
      args: ["--session-id", expect.any(String), PROMPT],
    });
  });

  it("fetches before it creates, and pushes before Claude starts", async () => {
    await dispatch();

    const order = (fn: jest.Mock) => fn.mock.invocationCallOrder[0];
    expect(order(worktrees.fetch)).toBeLessThan(order(worktrees.create));
    expect(order(worktrees.publish)).toBeLessThan(order(terminals.spawn));
  });

  it("writes the issue into .gitspore/task.md", async () => {
    await dispatch();

    const written = await readFile(
      join(root, "42-issue", ".gitspore", "task.md"),
      "utf8",
    );
    expect(written).toBe(taskFile({ ...issue(42), body: "Fix it." }));
  });

  it("shows the agent as starting before anything is awaited", async () => {
    const pending = dispatch();

    expect(store.snapshot().agents.map((a) => a.status)).toEqual(["starting"]);
    await pending;
  });

  // --- refused before anything starts -------------------------------

  it("refuses an invalid payload and starts nothing", async () => {
    const ack = await service.dispatch({ issueNumber: "42", slotIndex: 0 });

    expect(ack).toMatchObject({ error: { code: "invalid_payload" } });
    expect(statuses).toEqual([]);
    expect(locator.resolve).not.toHaveBeenCalled();
  });

  it("lets only one of two dispatches for the same slot through", async () => {
    const acks = await Promise.all([dispatch(42, 0), dispatch(43, 0)]);

    const codes = acks.map((ack) => (ack.error ? ack.error.code : "ok"));
    expect(codes.sort()).toEqual(["ok", "slot_unavailable"]);
    expect(store.snapshot().agents).toHaveLength(1);
  });

  it("refuses an issue that already has an agent", async () => {
    await dispatch(42, 0);

    expect(await dispatch(42, 1)).toMatchObject({
      error: { code: "issue_taken" },
    });
  });

  // --- failures and the rollback -------------------------------------

  it("fails before any git work when Claude Code is missing", async () => {
    locator.resolve.mockRejectedValue(
      new TerminalError("claude_not_found", "Install it"),
    );

    expect(await dispatch()).toMatchObject({
      error: { code: "claude_not_found" },
    });
    expect(worktrees.fetch).not.toHaveBeenCalled();
    expect(statuses).toEqual(["starting", "removed"]);
  });

  it("removes the agent again for an issue closed since the last poll", async () => {
    github.getIssue.mockRejectedValue(
      new GitHubError("issue_not_found", "No open issue #42"),
    );

    expect(await dispatch()).toMatchObject({
      error: { code: "issue_not_found" },
    });
    expect(statuses).toEqual(["starting", "removed"]);
    expect(worktrees.create).not.toHaveBeenCalled();
  });

  it("leaves a branch alone that existed before", async () => {
    worktrees.create.mockRejectedValue(
      new WorktreeError(
        "branch_exists",
        "Branch spore/42-issue already exists.",
      ),
    );

    expect(await dispatch()).toMatchObject({ error: { code: "git_failed" } });
    expect(worktrees.remove).not.toHaveBeenCalled();
    expect(worktrees.deleteRemoteBranch).not.toHaveBeenCalled();
  });

  it("removes the worktree but nothing on origin when the push fails", async () => {
    worktrees.publish.mockRejectedValue(
      new WorktreeError("push_failed", "No login"),
    );

    expect(await dispatch()).toMatchObject({
      error: { code: "git_push_failed" },
    });
    expect(worktrees.remove).toHaveBeenCalledWith({
      path: join(root, "42-issue"),
      force: true,
      deleteBranch: true,
    });
    expect(worktrees.deleteRemoteBranch).not.toHaveBeenCalled();
    expect(statuses).toEqual(["starting", "removed"]);
  });

  it("undoes everything when Claude Code does not start, and a retry works", async () => {
    terminals.spawn.mockImplementationOnce(() => {
      throw new Error("File not found: ");
    });

    expect(await dispatch()).toMatchObject({
      error: { code: "claude_not_found" },
    });
    expect(locator.invalidate).toHaveBeenCalledTimes(1);
    expect(worktrees.remove).toHaveBeenCalledTimes(1);
    expect(worktrees.deleteRemoteBranch).toHaveBeenCalledWith("spore/42-issue");
    expect(store.snapshot().agents).toEqual([]);

    expect(await dispatch()).toEqual({ agentId: expect.any(String) });
  });

  it("goes on with the rollback when one step of it fails", async () => {
    terminals.spawn.mockImplementationOnce(() => {
      throw new Error("File not found: ");
    });
    worktrees.remove.mockRejectedValue(new Error("folder is locked"));

    expect(await dispatch()).toMatchObject({
      error: { code: "claude_not_found" },
    });
    expect(worktrees.deleteRemoteBranch).toHaveBeenCalledTimes(1);
    expect(store.snapshot().agents).toEqual([]);
  });
});
