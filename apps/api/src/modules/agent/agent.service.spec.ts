import { RepoConfig } from "@/config/repo-config";
import {
  issueNumberFromBranch,
  type AgentStatus,
  type Issue,
  type PullRequest,
  type StatePatch,
} from "@gitspore/shared";
import { Logger } from "@nestjs/common";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitHubError } from "../github/github-error";
import type {
  GitHubService,
  PullRequestChange,
} from "../github/github.service";
import { StateStore } from "../state/state.store";
import type { ClaudeLocator } from "../terminal/claude-locator";
import { TerminalError } from "../terminal/terminal-error";
import type { TerminalService } from "../terminal/terminal.service";
import { WorktreeError } from "../worktree/worktree-error";
import type {
  Leftover,
  Worktree,
  WorktreeService,
} from "../worktree/worktree.service";
import { AgentService } from "./agent.service";
import type { RepoService } from "../repo/repo.service";
import { PROMPT, taskFile } from "./task-file";
import type { HookService } from "../hooks/hook.service";

// No repo switch is running.
const notSwitching = {
  isSwitching: () => false,
  onSwitched: () => {},
} as unknown as RepoService;

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
  readonly isClean = jest.fn<Promise<boolean>, [string]>(async () => true);
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
  // No worktrees and no branches from earlier agents, unless a test says so.
  readonly list = jest.fn<Promise<Worktree[]>, []>(async () => []);
  readonly leftoverFor = jest.fn<Promise<Leftover | null>, [unknown]>(
    async () => null,
  );
  readonly open = jest.fn(async (leftover: Leftover) => {
    const path = join(this.root, leftover.branch.slice("spore/".length));
    await mkdir(path, { recursive: true });
    return { branch: leftover.branch, path };
  });
}

class FakeTerminals {
  readonly spawn = jest.fn();
  readonly kill = jest.fn();
  private exitListener?: (agentId: string, exitCode: number) => void;
  readonly onExited = jest.fn(
    (listener: (agentId: string, exitCode: number) => void) => {
      this.exitListener = listener;
    },
  );
  private reviver?: (agentId: string) => Promise<void>;
  readonly onMissing = jest.fn(
    (reviver: (agentId: string) => Promise<void>) => {
      this.reviver = reviver;
    },
  );

  exit(agentId: string, exitCode: number) {
    this.exitListener?.(agentId, exitCode);
  }

  // A tab opens the agent's terminal while it has none.
  async open(agentId: string) {
    await this.reviver?.(agentId);
  }
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
  readonly findPullRequest = jest.fn<Promise<PullRequest | null>, [string]>(
    async () => null,
  );
  private pullRequestListener?: (change: PullRequestChange) => void;
  readonly onPullRequest = jest.fn(
    (listener: (change: PullRequestChange) => void) => {
      this.pullRequestListener = listener;
    },
  );

  pullRequestChanged(branch: string, pullRequest: PullRequest) {
    this.pullRequestListener?.({
      branch,
      issueNumber: issueNumberFromBranch(branch) ?? 0,
      pullRequest,
    });
  }
}

class FakeHooks {
  readonly issue = jest.fn((agentId: string) => `secret-${agentId}`);
  readonly revoke = jest.fn();
  readonly url = jest.fn(() => "http://127.0.0.1:3001");
  private listener?: (agentId: string, payload: unknown) => void;
  readonly onEvent = jest.fn(
    (listener: (agentId: string, payload: unknown) => void) => {
      this.listener = listener;
    },
  );

  send(agentId: string, payload: unknown) {
    this.listener?.(agentId, payload);
  }
}

const settle = () => new Promise((resolve) => setImmediate(resolve));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
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
  let hooks: FakeHooks;

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
    hooks = new FakeHooks();
    service = new AgentService(
      store,
      github as unknown as GitHubService,
      worktrees as unknown as WorktreeService,
      terminals as unknown as TerminalService,
      locator as unknown as ClaudeLocator,
      new RepoConfig("/repo", "main"),
      hooks as unknown as HookService,
      notSwitching,
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
    expect(statuses).toEqual(["starting"]);
    const [agent] = store.snapshot().agents;
    expect(agent).toMatchObject({
      slotIndex: 0,
      issueNumber: 42,
      branch: "spore/42-issue",
      worktreePath: join(root, "42-issue"),
      status: "starting",
    });
    expect(worktrees.create).toHaveBeenCalledWith({
      issueNumber: 42,
      issueTitle: "Issue 42",
      startPoint: "origin/main",
    });
    expect(worktrees.ensureExcluded).toHaveBeenCalledWith(".gitspore/");
    expect(worktrees.publish).toHaveBeenCalledTimes(1);
    expect(worktrees.publish).toHaveBeenCalledWith("spore/42-issue");
    expect(terminals.spawn).toHaveBeenCalledWith({
      agentId: agent.id,
      cwd: join(root, "42-issue"),
      mode: "exec",
      command: "/bin/claude",
      args: [
        "--settings",
        ".gitspore/settings.json",
        "--session-id",
        expect.any(String),
        PROMPT,
      ],
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

  it.each([
    ["while a repo switch runs", "/repo", true, "switching"],
    ["without a repo", null, false, "No repository"],
  ])(
    "refuses %s and starts nothing (#58)",
    async (_, repoPath, switching, message) => {
      service = new AgentService(
        store,
        github as unknown as GitHubService,
        worktrees as unknown as WorktreeService,
        terminals as unknown as TerminalService,
        locator as unknown as ClaudeLocator,
        new RepoConfig(repoPath, "main"),
        hooks as unknown as HookService,
        { isSwitching: () => switching } as unknown as RepoService,
      );

      const ack = await service.dispatch({ issueNumber: 42, slotIndex: 0 });

      expect(ack).toEqual({
        error: {
          code: "repo_unavailable",
          message: expect.stringContaining(message),
        },
      });
      expect(statuses).toEqual([]);
      expect(locator.resolve).not.toHaveBeenCalled();
    },
  );

  it("lets only one of two dispatches for the same slot through", async () => {
    const acks = await Promise.all([dispatch(42, 0), dispatch(43, 0)]);

    const codes = acks.map((ack) => ("error" in ack ? ack.error.code : "ok"));
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
    expect(hooks.revoke).toHaveBeenCalled();

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

  // --- a branch an earlier agent left (#102) ---------------------------

  describe("on a branch an earlier agent left", () => {
    const leftover = (change: Partial<Leftover> = {}): Leftover => ({
      branch: "spore/42-issue",
      path: null,
      local: true,
      onOrigin: true,
      ...change,
    });

    it("starts in the worktree that is still there and creates nothing", async () => {
      const path = join(root, "42-issue");
      await mkdir(path, { recursive: true });
      worktrees.leftoverFor.mockResolvedValue(leftover({ path }));

      expect(await dispatch()).toEqual({ agentId: expect.any(String) });
      expect(worktrees.create).not.toHaveBeenCalled();
      expect(worktrees.open).not.toHaveBeenCalled();
      expect(worktrees.publish).not.toHaveBeenCalled();
      expect(terminals.spawn).toHaveBeenCalledWith(
        expect.objectContaining({ cwd: path }),
      );
      expect(await readFile(join(path, ".gitspore", "task.md"), "utf8")).toBe(
        taskFile({ ...issue(42), body: "Fix it." }),
      );
    });

    it("makes a worktree on the branch when only the branch is left", async () => {
      worktrees.leftoverFor.mockResolvedValue(leftover());

      expect(await dispatch()).toEqual({ agentId: expect.any(String) });
      expect(worktrees.open).toHaveBeenCalledWith(leftover());
      expect(worktrees.create).not.toHaveBeenCalled();
      expect(worktrees.publish).not.toHaveBeenCalled();
    });

    it("pushes a branch that origin doesn't have yet", async () => {
      worktrees.leftoverFor.mockResolvedValue(leftover({ onOrigin: false }));

      await dispatch();

      expect(worktrees.publish).toHaveBeenCalledWith("spore/42-issue");
    });

    it("moves the agent to the branch of the renamed issue", async () => {
      worktrees.leftoverFor.mockResolvedValue(
        leftover({ branch: "spore/42-old-title" }),
      );

      await dispatch();

      expect(store.snapshot().agents[0]).toMatchObject({
        branch: "spore/42-old-title",
        worktreePath: join(root, "42-old-title"),
      });
      expect(statuses).toEqual(["starting", "starting"]);
    });

    it("leaves branch and worktree alone when it fails in a worktree that was there", async () => {
      const path = join(root, "42-issue");
      await mkdir(path, { recursive: true });
      worktrees.leftoverFor.mockResolvedValue(leftover({ path }));
      terminals.spawn.mockImplementationOnce(() => {
        throw new Error("File not found: ");
      });

      expect(await dispatch()).toMatchObject({ error: expect.anything() });
      expect(worktrees.remove).not.toHaveBeenCalled();
      expect(worktrees.deleteRemoteBranch).not.toHaveBeenCalled();
      expect(store.snapshot().agents).toEqual([]);
    });

    it("removes only the new worktree when it fails on a local branch", async () => {
      worktrees.leftoverFor.mockResolvedValue(leftover());
      terminals.spawn.mockImplementationOnce(() => {
        throw new Error("File not found: ");
      });

      await dispatch();

      expect(worktrees.remove).toHaveBeenCalledWith({
        path: join(root, "42-issue"),
        force: true,
        deleteBranch: false,
      });
      expect(worktrees.deleteRemoteBranch).not.toHaveBeenCalled();
    });

    it("deletes the local copy, not the branch on origin, when it fails on a branch only origin had", async () => {
      worktrees.leftoverFor.mockResolvedValue(leftover({ local: false }));
      terminals.spawn.mockImplementationOnce(() => {
        throw new Error("File not found: ");
      });

      await dispatch();

      expect(worktrees.remove).toHaveBeenCalledWith({
        path: join(root, "42-issue"),
        force: true,
        deleteBranch: true,
      });
      expect(worktrees.deleteRemoteBranch).not.toHaveBeenCalled();
    });
  });

  // --- worktrees from before a restart (#102) -------------------------

  describe("at startup", () => {
    const worktree = (n: number): Worktree => ({
      branch: `spore/${n}-issue`,
      path: join(root, `${n}-issue`),
    });
    const merged: PullRequest = {
      number: 7,
      url: "https://github.com/owner/repo/pull/7",
      state: "merged",
    };
    const agentOn = (n: number) =>
      store.snapshot().agents.find((a) => a.issueNumber === n);

    beforeEach(() => {
      jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});
    });

    it("takes over each worktree as an agent without Claude, in the free slots", async () => {
      worktrees.list.mockResolvedValue([worktree(42), worktree(43)]);

      await service.onModuleInit();

      expect(store.snapshot().agents).toEqual([
        expect.objectContaining({
          slotIndex: 0,
          issueNumber: 42,
          branch: "spore/42-issue",
          worktreePath: join(root, "42-issue"),
          status: "error",
          pullRequest: null,
          statusReason: {
            code: "daemon_restarted",
            message: expect.stringMatching(/restarted/),
          },
        }),
        expect.objectContaining({ slotIndex: 1, issueNumber: 43 }),
      ]);
      expect(terminals.spawn).not.toHaveBeenCalled();
    });

    it("takes over no more worktrees than there are slots", async () => {
      worktrees.list.mockResolvedValue(
        [40, 41, 42, 43, 44, 45, 46].map(worktree),
      );

      await service.onModuleInit();

      expect(store.snapshot().agents.map((a) => a.slotIndex)).toEqual([
        0, 1, 2, 3, 4, 5,
      ]);
    });

    it("takes over only one worktree per issue", async () => {
      worktrees.list.mockResolvedValue([
        worktree(42),
        { branch: "spore/42-old-title", path: join(root, "42-old-title") },
      ]);

      await service.onModuleInit();

      expect(store.snapshot().agents).toHaveLength(1);
    });

    it("starts without agents when git fails", async () => {
      worktrees.list.mockRejectedValue(new Error("git is gone"));

      await service.onModuleInit();

      expect(store.snapshot().agents).toEqual([]);
    });

    it("refuses a dispatch for an issue it took over", async () => {
      worktrees.list.mockResolvedValue([worktree(42)]);
      await service.onModuleInit();

      expect(await dispatch(42, 1)).toMatchObject({
        error: { code: "issue_taken" },
      });
    });

    it("is done once the poll finds an open pull request", async () => {
      worktrees.list.mockResolvedValue([worktree(42)]);
      await service.onModuleInit();

      github.pullRequestChanged("spore/42-issue", { ...merged, state: "open" });

      expect(agentOn(42)).toMatchObject({ status: "done", statusReason: null });
    });

    it("blooms and cleans up once the poll finds the merge, without a kill", async () => {
      service.bloomMs = 20;
      worktrees.list.mockResolvedValue([worktree(42)]);
      await service.onModuleInit();

      github.pullRequestChanged("spore/42-issue", merged);
      expect(agentOn(42)?.status).toBe("merged");
      await sleep(60);

      expect(terminals.kill).not.toHaveBeenCalled();
      expect(worktrees.remove).toHaveBeenCalledWith({
        path: join(root, "42-issue"),
        force: true,
        deleteBranch: true,
      });
      expect(store.snapshot().agents).toEqual([]);
    });

    it("can be stopped, with and without the worktree, without a kill", async () => {
      worktrees.list.mockResolvedValue([worktree(42), worktree(43)]);
      await service.onModuleInit();

      await service.stop({ agentId: agentOn(42)!.id, removeWorktree: false });
      await service.stop({ agentId: agentOn(43)!.id, removeWorktree: true });

      expect(terminals.kill).not.toHaveBeenCalled();
      expect(worktrees.remove).toHaveBeenCalledTimes(1);
      expect(worktrees.remove).toHaveBeenCalledWith({
        path: join(root, "43-issue"),
      });
      expect(store.snapshot().agents).toEqual([]);
    });

    it("takes over again after a repo switch", async () => {
      let switched: (() => Promise<void>) | undefined;
      const repos = {
        isSwitching: () => false,
        onSwitched: (listener: () => Promise<void>) => (switched = listener),
      };
      service = new AgentService(
        store,
        github as unknown as GitHubService,
        worktrees as unknown as WorktreeService,
        terminals as unknown as TerminalService,
        locator as unknown as ClaudeLocator,
        new RepoConfig("/repo", "main"),
        hooks as unknown as HookService,
        repos as unknown as RepoService,
      );
      await service.onModuleInit();
      worktrees.list.mockResolvedValue([worktree(42)]);

      await switched?.();

      expect(agentOn(42)?.statusReason?.code).toBe("daemon_restarted");
    });

    it("takes over nothing without a repo", async () => {
      service = new AgentService(
        store,
        github as unknown as GitHubService,
        worktrees as unknown as WorktreeService,
        terminals as unknown as TerminalService,
        locator as unknown as ClaudeLocator,
        new RepoConfig(null, "main"),
        hooks as unknown as HookService,
        notSwitching,
      );

      await service.onModuleInit();

      expect(worktrees.list).not.toHaveBeenCalled();
    });
  });

  // --- Claude Code again when the terminal opens (#102) ---------------

  describe("when the terminal of an agent without Claude opens", () => {
    beforeEach(() => {
      jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});
    });

    async function takeOver() {
      const path = join(root, "42-issue");
      await mkdir(path, { recursive: true });
      worktrees.list.mockResolvedValue([{ branch: "spore/42-issue", path }]);
      await service.onModuleInit();
      return store.snapshot().agents[0];
    }

    it("continues the conversation of an agent taken over after a restart", async () => {
      const agent = await takeOver();

      await terminals.open(agent.id);

      expect(terminals.spawn).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: agent.id,
          cwd: agent.worktreePath,
          args: ["--settings", ".gitspore/settings.json", "--continue"],
        }),
      );
      const hook = JSON.parse(
        await readFile(
          join(agent.worktreePath, ".gitspore", "hook.json"),
          "utf8",
        ),
      );
      expect(hook).toMatchObject({ agentId: agent.id });
      expect(hooks.issue).toHaveBeenCalledWith(agent.id);
    });

    it("drops daemon_restarted: Claude runs and waits for the user", async () => {
      const agent = await takeOver();

      await terminals.open(agent.id);

      expect(store.snapshot().agents[0]).toMatchObject({
        status: "needs_input",
        statusReason: null,
      });
    });

    it("keeps done when the branch has an open pull request", async () => {
      const agent = await takeOver();
      github.pullRequestChanged("spore/42-issue", {
        number: 7,
        url: "https://github.com/owner/repo/pull/7",
        state: "open",
      });

      await terminals.open(agent.id);

      expect(store.snapshot().agents[0].status).toBe("done");
    });

    it("starts Claude once for two tabs at the same time", async () => {
      const agent = await takeOver();

      await Promise.all([terminals.open(agent.id), terminals.open(agent.id)]);
      await terminals.open(agent.id);

      expect(terminals.spawn).toHaveBeenCalledTimes(1);
    });

    it("continues after Claude exited, and the exit is handled again", async () => {
      await service.onModuleInit();
      const ack = await dispatch();
      if ("error" in ack) throw new Error("dispatch failed");
      terminals.exit(ack.agentId, 0);
      await settle();

      await terminals.open(ack.agentId);
      terminals.exit(ack.agentId, 1);

      expect(terminals.spawn).toHaveBeenCalledTimes(2);
      expect(terminals.spawn.mock.calls[1][0].args).toContain("--continue");
      expect(store.snapshot().agents[0].status).toBe("error");
    });

    it("starts nothing for a running, stopped, merged or unknown agent", async () => {
      await service.onModuleInit();
      service.bloomMs = 60_000;
      const ack = await dispatch();
      if ("error" in ack) throw new Error("dispatch failed");

      await terminals.open(ack.agentId);
      await terminals.open("overview");
      terminals.exit(ack.agentId, 0);
      await settle();
      github.pullRequestChanged("spore/42-issue", {
        number: 7,
        url: "https://github.com/owner/repo/pull/7",
        state: "merged",
      });
      await terminals.open(ack.agentId);

      expect(terminals.spawn).toHaveBeenCalledTimes(1);
      await service.stop({ agentId: ack.agentId, removeWorktree: false });
    });

    it("leaves the agent as it is when Claude is gone", async () => {
      const agent = await takeOver();
      locator.resolve.mockRejectedValue(
        new TerminalError("claude_not_found", "Install it"),
      );

      await terminals.open(agent.id);

      expect(terminals.spawn).not.toHaveBeenCalled();
      expect(store.snapshot().agents[0].statusReason?.code).toBe(
        "daemon_restarted",
      );
      expect(hooks.revoke).toHaveBeenCalledWith(agent.id);
    });
  });

  describe("when Claude Code exits", () => {
    let agentId: string;

    beforeEach(async () => {
      service.onModuleInit();
      const ack = await dispatch();
      if ("error" in ack) throw new Error("dispatch failed");
      agentId = ack.agentId;
      statuses = [];
    });

    const agentOf = () => store.snapshot().agents.find((a) => a.id === agentId);
    const statusOf = () => agentOf()?.status;

    it("is error after a non-zero exit code", async () => {
      terminals.exit(agentId, 1);
      await settle();

      expect(statusOf()).toBe("error");
      expect(github.findPullRequest).not.toHaveBeenCalled();
    });

    it("is done after a clean exit with an open pull request", async () => {
      github.findPullRequest.mockResolvedValue({
        number: 7,
        url: "https://github.com/owner/repo/pull/7",
        state: "open",
      });

      terminals.exit(agentId, 0);
      await settle();

      expect(statusOf()).toBe("done");
      expect(github.findPullRequest).toHaveBeenCalledWith("spore/42-issue");
      expect(agentOf()?.pullRequest?.number).toBe(7);
    });

    it("is needs_input after a clean exit without a pull request", async () => {
      terminals.exit(agentId, 0);
      await settle();

      expect(statusOf()).toBe("needs_input");
    });

    it("is needs_input when the pull request is already merged", async () => {
      github.findPullRequest.mockResolvedValue({
        number: 7,
        url: "https://github.com/owner/repo/pull/7",
        state: "merged",
      });

      terminals.exit(agentId, 0);
      await settle();

      expect(statusOf()).toBe("needs_input");
    });

    it("is needs_input when GitHub cannot be asked, and keeps the pull request it has", async () => {
      github.pullRequestChanged("spore/42-issue", {
        number: 7,
        url: "https://github.com/owner/repo/pull/7",
        state: "open",
      });
      github.findPullRequest.mockRejectedValue(
        new GitHubError("github_unreachable", "Offline"),
      );

      terminals.exit(agentId, 0);
      await settle();

      expect(statusOf()).toBe("needs_input");
      expect(agentOf()?.pullRequest?.number).toBe(7);
      expect(Logger.prototype.warn).toHaveBeenCalled();
    });

    it("sets statusSince anew", async () => {
      const [agent] = store.snapshot().agents;
      const old = "2000-01-01T00:00:00.000Z";
      store.apply([
        { type: "agent:upsert", agent: { ...agent, statusSince: old } },
      ]);

      terminals.exit(agentId, 1);
      await settle();

      const [after] = store.snapshot().agents;
      expect(after.statusSince).not.toBe(old);
      expect(new Date(after.statusSince).toISOString()).toBe(after.statusSince);
    });

    it("leaves the overview agent and unknown agents alone", async () => {
      terminals.exit("overview", 1);
      terminals.exit("someone-else", 0);
      await settle();

      expect(statuses).toEqual([]);
      expect(statusOf()).toBe("starting");
    });
  });
  describe("stop", () => {
    let agentId: string;
    const path = () => join(root, "42-issue");

    beforeEach(async () => {
      service.onModuleInit();
      // Like the real TerminalService: kill() ends the process.
      terminals.kill.mockImplementation((id: string) => terminals.exit(id, 1));
      const ack = await dispatch();
      if ("error" in ack) throw new Error("dispatch failed");
      agentId = ack.agentId;
      statuses = [];
    });

    it("stops Claude Code and frees the slot, keeping the worktree", async () => {
      await service.stop({ agentId, removeWorktree: false });

      expect(terminals.kill).toHaveBeenCalledWith(agentId);
      expect(worktrees.remove).not.toHaveBeenCalled();
      expect(store.snapshot().agents).toEqual([]);
      // The exit caused by the stop sets no status of its own.
      expect(statuses).toEqual(["removed"]);
    });
    it("stops an agent that hasn't reported yet, and revokes its secret", async () => {
      expect(store.snapshot().agents.map((a) => a.status)).toEqual([
        "starting",
      ]);

      await service.stop({ agentId, removeWorktree: false });

      expect(store.snapshot().agents).toEqual([]);
      expect(hooks.revoke).toHaveBeenCalledWith(agentId);
    });

    it("removes a clean worktree and keeps the branch", async () => {
      await service.stop({ agentId, removeWorktree: true });

      expect(worktrees.remove).toHaveBeenCalledWith({ path: path() });
      expect(store.snapshot().agents).toEqual([]);
    });

    it("keeps a dirty worktree and the agent, as error", async () => {
      worktrees.isClean.mockResolvedValue(false);

      await expect(
        service.stop({ agentId, removeWorktree: true }),
      ).rejects.toMatchObject({ code: "worktree_dirty" });

      expect(worktrees.remove).not.toHaveBeenCalled();
      expect(store.snapshot().agents.map((a) => a.status)).toEqual(["error"]);
    });

    it("removes the agent on a second stop without removing the worktree", async () => {
      worktrees.isClean.mockResolvedValue(false);
      await service.stop({ agentId, removeWorktree: true }).catch(() => {});

      await service.stop({ agentId, removeWorktree: false });

      expect(terminals.kill).toHaveBeenCalledTimes(1);
      expect(worktrees.remove).not.toHaveBeenCalled();
      expect(store.snapshot().agents).toEqual([]);
    });

    it("waits for Claude Code to end before it removes the worktree", async () => {
      terminals.kill.mockImplementation(() => {});

      const stopping = service.stop({ agentId, removeWorktree: true });
      await settle();
      expect(worktrees.remove).not.toHaveBeenCalled();

      terminals.exit(agentId, 1);
      await stopping;
      expect(worktrees.remove).toHaveBeenCalledTimes(1);
    });

    it("does not kill a process that already ended", async () => {
      terminals.exit(agentId, 1);
      await settle();

      await service.stop({ agentId, removeWorktree: false });

      expect(terminals.kill).not.toHaveBeenCalled();
      expect(store.snapshot().agents).toEqual([]);
    });

    it.each([
      [{ agentId: "nobody", removeWorktree: false }, "agent_not_found"],
      [{ agentId: 1, removeWorktree: false }, "invalid_payload"],
    ])("refuses %p with %s", async (payload, code) => {
      await expect(service.stop(payload)).rejects.toMatchObject({ code });
    });

    it("refuses the overview agent", async () => {
      store.apply([
        {
          type: "agent:upsert",
          agent: {
            id: "overview",
            slotIndex: null,
            issueNumber: null,
            branch: "main",
            worktreePath: "/repo",
            status: "working",
            statusSince: "2026-10-21T10:00:00.000Z",
            startedAt: "2026-10-21T10:00:00.000Z",
            pullRequest: null,
            statusReason: null,
            usage: null,
          },
        },
      ]);

      await expect(
        service.stop({ agentId: "overview", removeWorktree: false }),
      ).rejects.toMatchObject({ code: "agent_not_found" });
    });
  });

  describe("watchdog", () => {
    let agentId: string;

    beforeEach(async () => {
      service.onModuleInit();
      service.watchdogMs = 20;
      // Like the real TerminalService: kill() ends the process.
      terminals.kill.mockImplementation((id: string) => terminals.exit(id, 1));
      const ack = await dispatch();
      if ("error" in ack) throw new Error("dispatch failed");
      agentId = ack.agentId;
      statuses = [];
    });

    const agentOf = () => store.snapshot().agents.find((a) => a.id === agentId);

    it("is error with a hint at the trust question when no hook arrives", async () => {
      await sleep(60);

      expect(agentOf()?.status).toBe("error");
      expect(agentOf()?.statusReason?.code).toBe("no_status");
    });

    it("is satisfied by the first hook, even SessionStart", async () => {
      hooks.send(agentId, { hook_event_name: "SessionStart" });
      await sleep(60);

      expect(agentOf()?.status).toBe("starting");
      expect(statuses).toEqual([]);
    });

    it("recovers when the hooks arrive later, and drops its message", async () => {
      await sleep(60);
      hooks.send(agentId, { hook_event_name: "UserPromptSubmit" });
      await settle();

      expect(agentOf()?.status).toBe("working");
      expect(agentOf()?.statusReason).toBeNull();
    });

    it("is cleared when Claude Code exits", async () => {
      terminals.exit(agentId, 0);
      await sleep(60);

      expect(statuses).toEqual(["needs_input"]);
    });

    it("is cleared on stop", async () => {
      await service.stop({ agentId, removeWorktree: false });
      await sleep(60);

      expect(statuses).toEqual(["removed"]);
    });
  });

  it("refuses to stop an agent that is still starting", async () => {
    const issueAnswer = deferred<Awaited<ReturnType<FakeGitHub["getIssue"]>>>();
    github.getIssue.mockReturnValue(issueAnswer.promise);

    const dispatching = dispatch();
    const [starting] = store.snapshot().agents;

    await expect(
      service.stop({ agentId: starting.id, removeWorktree: false }),
    ).rejects.toMatchObject({ code: "agent_starting" });
    expect(store.snapshot().agents.map((a) => a.status)).toEqual(["starting"]);

    issueAnswer.resolve({ ...issue(42), body: "Fix it." });
    await dispatching;
  });

  describe("when hooks report", () => {
    let agentId: string;
    const path = () => join(root, "42-issue");
    const openPullRequest: PullRequest = {
      number: 7,
      url: "https://github.com/owner/repo/pull/7",
      state: "open",
    };

    beforeEach(async () => {
      service.onModuleInit();
      const ack = await dispatch();
      if ("error" in ack) throw new Error("dispatch failed");
      agentId = ack.agentId;
      statuses = [];
    });

    const send = async (payload: unknown) => {
      hooks.send(agentId, payload);
      await settle();
    };
    const statusOf = () =>
      store.snapshot().agents.find((a) => a.id === agentId)?.status;

    it("writes hook.json with the daemon's URL and the agent's secret", async () => {
      const written = JSON.parse(
        await readFile(join(path(), ".gitspore", "hook.json"), "utf8"),
      );

      expect(written).toEqual({
        url: "http://127.0.0.1:3001",
        agentId,
        secret: `secret-${agentId}`,
      });
    });

    it("writes settings.json that runs the hook script with this Node", async () => {
      const written = JSON.parse(
        await readFile(join(path(), ".gitspore", "settings.json"), "utf8"),
      );

      expect(written.hooks.PreToolUse[0].hooks[0]).toMatchObject({
        command: process.execPath,
        args: [expect.stringMatching(/hook-script\.mjs$/)],
      });
    });

    it("follows the hooks, and sends a status only when it changes", async () => {
      await send({ hook_event_name: "SessionStart" });
      await send({ hook_event_name: "UserPromptSubmit" });
      await send({ hook_event_name: "PreToolUse" });
      await send({ hook_event_name: "PermissionRequest" });
      await send({ hook_event_name: "PostToolUse" });

      expect(statuses).toEqual(["working", "needs_input", "working"]);
    });

    it("is done after Stop with an open pull request", async () => {
      github.findPullRequest.mockResolvedValue(openPullRequest);

      await send({ hook_event_name: "Stop" });

      expect(statusOf()).toBe("done");
      expect(github.findPullRequest).toHaveBeenCalledWith("spore/42-issue");
    });

    it("is needs_input after Stop without a pull request", async () => {
      await send({ hook_event_name: "Stop" });

      expect(statusOf()).toBe("needs_input");
    });

    it("is error after StopFailure", async () => {
      await send({ hook_event_name: "StopFailure" });

      expect(statusOf()).toBe("error");
    });

    it("lets a later event win over a pull request check still under way", async () => {
      const answer = deferred<PullRequest | null>();
      github.findPullRequest.mockReturnValue(answer.promise);

      await send({ hook_event_name: "Stop" });
      await send({ hook_event_name: "UserPromptSubmit" });
      answer.resolve(openPullRequest);
      await settle();

      expect(statusOf()).toBe("working");
    });

    it("ignores payloads it can't read and agents it doesn't run", async () => {
      await send(null);
      await send({ hook_event_name: 42 });
      hooks.send("someone-else", { hook_event_name: "PreToolUse" });
      await settle();

      expect(statuses).toEqual([]);
    });

    it("revokes the secret when Claude Code exits", async () => {
      terminals.exit(agentId, 0);
      await settle();

      expect(hooks.revoke).toHaveBeenCalledWith(agentId);
    });
  });

  describe("when the pull request changes", () => {
    let agentId: string;
    const branch = "spore/42-issue";
    const pr = (state: PullRequest["state"]): PullRequest => ({
      number: 7,
      url: "https://github.com/owner/repo/pull/7",
      state,
    });

    beforeEach(async () => {
      service.onModuleInit();
      const ack = await dispatch();
      if ("error" in ack) throw new Error("dispatch failed");
      agentId = ack.agentId;
      statuses = [];
    });

    const agentOf = () => store.snapshot().agents.find((a) => a.id === agentId);
    const send = async (payload: unknown) => {
      hooks.send(agentId, payload);
      await settle();
    };

    it("puts an open pull request on the agent and makes it done, in one patch", () => {
      github.pullRequestChanged(branch, pr("open"));

      expect(agentOf()).toMatchObject({
        status: "done",
        pullRequest: pr("open"),
      });
      expect(statuses).toEqual(["done"]);
    });

    it("keeps a working agent working, but shows the pull request", async () => {
      await send({ hook_event_name: "UserPromptSubmit" });

      github.pullRequestChanged(branch, pr("open"));

      expect(agentOf()).toMatchObject({
        status: "working",
        pullRequest: pr("open"),
      });
    });

    it("makes the agent merged", () => {
      github.pullRequestChanged(branch, pr("merged"));

      expect(agentOf()).toMatchObject({
        status: "merged",
        pullRequest: pr("merged"),
      });
    });

    it("is error with pr_closed when closed without merging, and done when reopened", () => {
      github.pullRequestChanged(branch, pr("closed"));
      expect(agentOf()?.status).toBe("error");
      expect(agentOf()?.statusReason?.code).toBe("pr_closed");

      github.pullRequestChanged(branch, pr("open"));
      expect(agentOf()?.status).toBe("done");
      expect(agentOf()?.statusReason).toBeNull();
    });

    it("adds pr_closed to an agent that is already error", async () => {
      await send({ hook_event_name: "StopFailure" });

      github.pullRequestChanged(branch, pr("closed"));

      expect(agentOf()?.statusReason?.code).toBe("pr_closed");
    });

    it("lets hooks move the agent on after pr_closed", async () => {
      github.pullRequestChanged(branch, pr("closed"));

      await send({ hook_event_name: "UserPromptSubmit" });

      expect(agentOf()?.status).toBe("working");
      expect(agentOf()?.statusReason).toBeNull();
    });

    it("ignores hooks and the exit once merged", async () => {
      github.pullRequestChanged(branch, pr("merged"));

      await send({ hook_event_name: "Stop" });
      terminals.exit(agentId, 1);
      await settle();

      expect(agentOf()?.status).toBe("merged");
      expect(github.findPullRequest).not.toHaveBeenCalled();
    });

    it("wins over a pull request check still under way", async () => {
      const answer = deferred<PullRequest | null>();
      github.findPullRequest.mockReturnValue(answer.promise);

      await send({ hook_event_name: "Stop" });
      github.pullRequestChanged(branch, pr("merged"));
      answer.resolve(pr("open"));
      await settle();

      expect(agentOf()?.status).toBe("merged");
    });

    it("ignores branches without an agent", () => {
      github.pullRequestChanged("spore/99-other", pr("open"));

      expect(statuses).toEqual([]);
    });
  });

  describe("after a merge", () => {
    let agentId: string;
    const branch = "spore/42-issue";
    const path = () => join(root, "42-issue");
    const merged: PullRequest = {
      number: 7,
      url: "https://github.com/owner/repo/pull/7",
      state: "merged",
    };

    beforeEach(async () => {
      service.onModuleInit();
      service.bloomMs = 20;
      service.watchdogMs = 40;
      // Like the real TerminalService: kill() ends the process.
      terminals.kill.mockImplementation((id: string) => terminals.exit(id, 1));
      const ack = await dispatch();
      if ("error" in ack) throw new Error("dispatch failed");
      agentId = ack.agentId;
      statuses = [];
    });

    const agentOf = () => store.snapshot().agents.find((a) => a.id === agentId);

    it("shows merged first and touches nothing during the bloom", () => {
      github.pullRequestChanged(branch, merged);

      expect(agentOf()?.status).toBe("merged");
      expect(terminals.kill).not.toHaveBeenCalled();
      expect(worktrees.remove).not.toHaveBeenCalled();
    });

    it("then ends Claude, removes worktree and local branch, and frees the slot", async () => {
      github.pullRequestChanged(branch, merged);
      await sleep(60);

      expect(terminals.kill).toHaveBeenCalledWith(agentId);
      expect(hooks.revoke).toHaveBeenCalledWith(agentId);
      expect(worktrees.remove).toHaveBeenCalledWith({
        path: path(),
        force: true,
        deleteBranch: true,
      });
      expect(worktrees.deleteRemoteBranch).not.toHaveBeenCalled();
      expect(store.snapshot().agents).toEqual([]);
      expect(statuses).toEqual(["merged", "removed"]);
    });

    it("doesn't kill a Claude that has already ended", async () => {
      github.pullRequestChanged(branch, merged);
      terminals.exit(agentId, 0);
      await sleep(60);

      expect(terminals.kill).not.toHaveBeenCalled();
      expect(store.snapshot().agents).toEqual([]);
    });

    it("keeps a worktree with uncommitted changes, with cleanup_blocked", async () => {
      worktrees.isClean.mockResolvedValue(false);

      github.pullRequestChanged(branch, merged);
      await sleep(60);

      expect(worktrees.remove).not.toHaveBeenCalled();
      expect(agentOf()?.status).toBe("merged");
      expect(agentOf()?.statusReason).toEqual({
        code: "cleanup_blocked",
        message: expect.stringMatching(/uncommitted changes/),
      });
    });

    it("keeps the agent with cleanup_blocked when the removal fails", async () => {
      worktrees.remove.mockRejectedValue(new Error("file is locked"));

      github.pullRequestChanged(branch, merged);
      await sleep(60);

      expect(agentOf()?.statusReason?.code).toBe("cleanup_blocked");
      expect(agentOf()?.statusReason?.message).toMatch(/file is locked/);
    });

    it("can be stopped after cleanup_blocked", async () => {
      worktrees.isClean.mockResolvedValue(false);
      github.pullRequestChanged(branch, merged);
      await sleep(60);

      await service.stop({ agentId, removeWorktree: false });

      expect(store.snapshot().agents).toEqual([]);
    });

    it("lets a stop during the bloom win over the cleanup", async () => {
      github.pullRequestChanged(branch, merged);

      await service.stop({ agentId, removeWorktree: false });
      await sleep(60);

      expect(worktrees.remove).not.toHaveBeenCalled();
      expect(terminals.kill).toHaveBeenCalledTimes(1);
      expect(store.snapshot().agents).toEqual([]);
    });

    it("isn't turned into error by the watchdog", async () => {
      worktrees.isClean.mockResolvedValue(false);

      github.pullRequestChanged(branch, merged);
      await sleep(100);

      expect(agentOf()?.status).toBe("merged");
    });
  });
});
