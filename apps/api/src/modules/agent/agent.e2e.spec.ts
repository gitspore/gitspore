// Acceptance tests of GS-66, GS-67, GS-48 and GS-102: dispatch, stop, the
// status from hooks and from the pull request, the cleanup after a merge,
// and worktrees and branches left from before, with real
// git (a bare repo in a temp folder as origin), real PTYs, the fake claude,
// and its hooks through the real script and endpoint. Only GitHub is a
// stand-in; the tests fire its poll's events. The logic of each step has its
// unit tests in agent.service.spec.ts; these check that the parts work
// together on every OS in CI.
import { RepoConfig } from "@/config/repo-config";
import type {
  Agent,
  AgentId,
  AgentStatus,
  Issue,
  PullRequest,
} from "@gitspore/shared";
import { Logger, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { existsSync } from "node:fs";
import { HookModule } from "../hooks/hook.module";
import { HookService } from "../hooks/hook.service";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node-pty";
import { simpleGit } from "simple-git";
import { createFakeClaude } from "../../../test/fake-claude";
import { initOrigin, initRepo } from "../../../test/git-repo";
import { GitHubError } from "../github/github-error";
import type {
  GitHubService,
  PullRequestChange,
} from "../github/github.service";
import { StateStore } from "../state/state.store";
import { ClaudeLocator, systemDeps } from "../terminal/claude-locator";
import { TerminalService } from "../terminal/terminal.service";
import { WorktreeService } from "../worktree/worktree.service";
import { AgentService } from "./agent.service";
import type { RepoService } from "../repo/repo.service";
import { PROMPT } from "./task-file";

// No repo switch is running.
const notSwitching = {
  isSwitching: () => false,
  onSwitched: () => {},
} as unknown as RepoService;

// Windows needs about a second per PTY, and every dispatch runs fetch,
// ls-remote and push.
const TEST_TIMEOUT_MS = 90_000;
const WAIT_MS = 30_000;

const issue = (number: number): Issue => ({
  number,
  title: `Issue ${number}`,
  url: `https://github.com/owner/repo/issues/${number}`,
  labels: [],
});

// A promise the test resolves itself, to hold a step of the dispatch.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("Agent dispatch and stop, end to end", () => {
  let parent: string;
  let repo: string;
  let claudeDir: string;
  let fakeClaude: string;
  let store: StateStore;
  let terminals: TerminalService;
  let service: AgentService;
  let github: {
    getIssue: jest.Mock<Promise<Issue & { body: string }>, [number]>;
    findPullRequest: jest.Mock<Promise<PullRequest | null>, [string]>;
    onPullRequest: jest.Mock<void, [(change: PullRequestChange) => void]>;
  };
  const exited = new Set<AgentId>();

  // The real hook endpoint, so the fake's hooks go through the script, HTTP
  // and the secret check. One for all tests; agent ids never repeat.
  let app: INestApplication;
  let hooks: HookService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HookModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, "127.0.0.1");
    const { port } = app.getHttpServer().address() as AddressInfo;
    // HookService.url() reads it and writes it into every hook.json.
    process.env.PORT = String(port);
    hooks = app.get(HookService);
  });

  afterAll(async () => {
    await app.close();
    delete process.env.PORT;
  });

  beforeEach(async () => {
    parent = await realpath(await mkdtemp(join(tmpdir(), "gitspore-e2e-")));
    repo = join(parent, "my-repo");
    await mkdir(repo);
    await initRepo(repo);
    await initOrigin(repo, join(parent, "origin.git"));

    // A space in the folder name, as in npm's folder on Windows.
    claudeDir = await mkdtemp(join(tmpdir(), "gitspore e2e claude "));
    fakeClaude = createFakeClaude(claudeDir);
    process.env.GITSPORE_CLAUDE_BIN = fakeClaude;
    // By default the fake keeps running, so no exit races a test.
    process.env.FAKE_CLAUDE_STAY = "1";

    store = new StateStore();
    store.apply(
      [42, 43, 44, 45, 46, 47].map((n) => ({
        type: "issue:upsert" as const,
        issue: issue(n),
      })),
    );
    github = {
      getIssue: jest.fn(async (n: number) => ({
        ...issue(n),
        body: "Fix it.",
      })),
      findPullRequest: jest.fn<Promise<PullRequest | null>, [string]>(
        async () => null,
      ),
      onPullRequest: jest.fn<void, [(change: PullRequestChange) => void]>(),
    };
    terminals = new TerminalService(spawn);
    exited.clear();
    terminals.onExited((agentId) => exited.add(agentId));
    service = new AgentService(
      store,
      github as unknown as GitHubService,
      new WorktreeService(new RepoConfig(repo, "main")),
      terminals,
      new ClaudeLocator(systemDeps()),
      new RepoConfig(repo, "main"),
      hooks,
      notSwitching,
    );
    await service.onModuleInit();

    for (const level of ["log", "warn", "error"] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation(() => {});
    }
    // A hook has jest's 5 s default otherwise. On a slow Windows runner the
    // ten git calls above can outlast it, and afterEach then deletes the
    // folder while this hook still runs.
  }, TEST_TIMEOUT_MS);

  afterEach(async () => {
    // Stops what still runs, so no PTY outlives the test.
    for (const agent of store.snapshot().agents) {
      await service
        .stop({ agentId: agent.id, removeWorktree: false })
        .catch(() => {});
    }
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("FAKE_CLAUDE_")) delete process.env[key];
    }
    delete process.env.GITSPORE_CLAUDE_BIN;
    jest.restoreAllMocks();
    // Windows releases the files of a killed process a moment later.
    await rm(parent, { recursive: true, force: true, maxRetries: 10 });
    await rm(claudeDir, { recursive: true, force: true, maxRetries: 10 });
  }, TEST_TIMEOUT_MS);

  const dispatch = (issueNumber = 42, slotIndex = 0) =>
    service.dispatch({ issueNumber, slotIndex });

  async function dispatchOk(issueNumber = 42, slotIndex = 0) {
    const ack = await dispatch(issueNumber, slotIndex);
    if ("error" in ack) {
      throw new Error(`dispatch failed: ${JSON.stringify(ack.error)}`);
    }
    return agentOf(ack.agentId);
  }

  const agentOf = (agentId: AgentId) => {
    const agent = store.snapshot().agents.find((a) => a.id === agentId);
    if (!agent) throw new Error(`no agent ${agentId}`);
    return agent;
  };

  // Resolves once `found` holds for the agent (undefined once it is gone);
  // fails after WAIT_MS.
  function waitForAgent(
    agentId: AgentId,
    found: (agent: Agent | undefined) => boolean,
    what: string,
  ) {
    return new Promise<void>((resolve, reject) => {
      const has = () =>
        found(store.snapshot().agents.find((a) => a.id === agentId));
      if (has()) return resolve();
      const timer = setTimeout(
        () => reject(new Error(`${agentId} did not ${what}`)),
        WAIT_MS,
      );
      store.onPatch(() => {
        if (has()) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
  }

  const waitForStatus = (agentId: AgentId, status: AgentStatus) =>
    waitForAgent(
      agentId,
      (agent) => agent?.status === status,
      `become ${status}`,
    );

  const onOrigin = async (branch: string) =>
    (
      await simpleGit(repo).raw([
        "ls-remote",
        "--heads",
        "origin",
        `refs/heads/${branch}`,
      ])
    ).trim() !== "";

  const localBranches = async () => (await simpleGit(repo).branchLocal()).all;

  // --- dispatch ---------------------------------------------------------

  it(
    "makes a worktree, a task file and a pushed branch, and starts Claude",
    async () => {
      const argsFile = join(claudeDir, "args.json");
      process.env.FAKE_CLAUDE_ARGS_FILE = argsFile;
      const statuses: AgentStatus[] = [];
      store.onPatch((patch) => {
        for (const op of patch.ops) {
          if (op.type === "agent:upsert") statuses.push(op.agent.status);
        }
      });

      const ack = await dispatch();

      expect(ack).toEqual({ agentId: expect.any(String) });
      expect(statuses).toEqual(["starting"]);
      const agent = agentOf((ack as { agentId: AgentId }).agentId);
      expect(existsSync(agent.worktreePath)).toBe(true);
      expect(await onOrigin(agent.branch)).toBe(true);
      const task = await readFile(
        join(agent.worktreePath, ".gitspore", "task.md"),
        "utf8",
      );
      expect(task).toContain("# Issue #42: Issue 42");
      expect(task).toContain("`Closes #42`");

      // The prompt arrives as one argument, after the session id.
      await waitForFile(argsFile);
      const args = JSON.parse(await readFile(argsFile, "utf8"));
      expect(args).toEqual([
        "--settings",
        ".gitspore/settings.json",
        "--session-id",
        expect.any(String),
        PROMPT,
      ]);

      // .gitspore/ never shows up in git status.
      const status = await simpleGit(agent.worktreePath).raw([
        "status",
        "--porcelain",
        "--untracked-files=all",
      ]);
      expect(status).toBe("");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "lets exactly one of two dispatches for the same slot through",
    async () => {
      const acks = await Promise.all([dispatch(42, 0), dispatch(43, 0)]);

      const codes = acks.map((ack) => ("error" in ack ? ack.error.code : "ok"));
      expect(codes.sort()).toEqual(["ok", "slot_unavailable"]);
      expect(store.snapshot().agents).toHaveLength(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "refuses an issue that already has an agent",
    async () => {
      await dispatchOk(42, 0);

      expect(await dispatch(42, 1)).toMatchObject({
        error: { code: "issue_taken" },
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "removes the agent again for a closed issue, and the slot is free",
    async () => {
      github.getIssue.mockRejectedValueOnce(
        new GitHubError("issue_not_found", "No open issue #42"),
      );

      expect(await dispatch(42, 0)).toMatchObject({
        error: { code: "issue_not_found" },
      });
      expect(store.snapshot().agents).toEqual([]);
      expect(existsSync(join(parent, ".gitspore-worktrees"))).toBe(false);

      await dispatchOk(43, 0);
    },
    TEST_TIMEOUT_MS,
  );

  // --- branches and worktrees left from before (GS-102) ----------------

  it(
    "continues on a branch that exists only on origin",
    async () => {
      const branch = "spore/42-issue-42";
      await simpleGit(repo).raw([
        "push",
        "origin",
        `main:refs/heads/${branch}`,
      ]);

      const agent = await dispatchOk();

      expect(agent.branch).toBe(branch);
      expect(await localBranches()).toContain(branch);
      const upstream = await simpleGit(repo).revparse([
        "--abbrev-ref",
        `${branch}@{upstream}`,
      ]);
      expect(upstream).toBe(`origin/${branch}`);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "continues in the worktree a stop kept, with its commits",
    async () => {
      const first = await dispatchOk();
      await simpleGit(first.worktreePath).raw([
        "commit",
        "--allow-empty",
        "-m",
        "work",
      ]);
      const work = await simpleGit(first.worktreePath).revparse(["HEAD"]);
      await service.stop({ agentId: first.id, removeWorktree: false });

      const second = await dispatchOk(42, 3);

      expect(second.worktreePath).toBe(first.worktreePath);
      expect(await simpleGit(second.worktreePath).revparse(["HEAD"])).toBe(
        work,
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "continues on the branch after a stop that removed the worktree",
    async () => {
      const first = await dispatchOk();
      await service.stop({ agentId: first.id, removeWorktree: true });
      expect(existsSync(first.worktreePath)).toBe(false);

      const second = await dispatchOk();

      expect(second.branch).toBe(first.branch);
      expect(existsSync(second.worktreePath)).toBe(true);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "leaves a branch that was there in place when the dispatch on it fails",
    async () => {
      const first = await dispatchOk();
      await service.stop({ agentId: first.id, removeWorktree: true });
      jest.spyOn(terminals, "spawn").mockImplementationOnce(() => {
        throw new Error("posix_spawnp failed.");
      });

      expect(await dispatch()).toMatchObject({ error: expect.anything() });

      expect(await localBranches()).toContain(first.branch);
      expect(await onOrigin(first.branch)).toBe(true);
      expect(existsSync(first.worktreePath)).toBe(false);
      expect(store.snapshot().agents).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "takes over a worktree after a restart, and a stop frees the slot",
    async () => {
      const before = await dispatchOk(42, 2);
      await service.stop({ agentId: before.id, removeWorktree: false });

      // The restart: a new state and a new service, the worktree on disk.
      store = new StateStore();
      service = new AgentService(
        store,
        github as unknown as GitHubService,
        new WorktreeService(new RepoConfig(repo, "main")),
        terminals,
        new ClaudeLocator(systemDeps()),
        new RepoConfig(repo, "main"),
        hooks,
        notSwitching,
      );
      await service.onModuleInit();

      const [agent] = store.snapshot().agents;
      expect(agent).toMatchObject({
        slotIndex: 0,
        issueNumber: 42,
        branch: before.branch,
        worktreePath: before.worktreePath,
        status: "error",
        statusReason: { code: "daemon_restarted" },
      });

      await service.stop({ agentId: agent.id, removeWorktree: true });

      expect(store.snapshot().agents).toEqual([]);
      expect(existsSync(before.worktreePath)).toBe(false);
      expect(await localBranches()).toContain(before.branch);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "leaves nothing behind when the PTY does not start, and a retry works",
    async () => {
      const spawnPty = jest.spyOn(terminals, "spawn");
      spawnPty.mockImplementationOnce(() => {
        throw new Error("posix_spawnp failed.");
      });

      expect(await dispatch()).toMatchObject({
        error: { code: "claude_not_found" },
      });
      const branch = "spore/42-issue-42";
      expect(
        existsSync(
          join(parent, ".gitspore-worktrees", "my-repo", "42-issue-42"),
        ),
      ).toBe(false);
      expect(await localBranches()).not.toContain(branch);
      expect(await onOrigin(branch)).toBe(false);
      expect(store.snapshot().agents).toEqual([]);

      spawnPty.mockRestore();
      const agent = await dispatchOk();
      expect(agent.status).toBe("starting");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "answers git_push_failed without waiting for a login, and rolls back",
    async () => {
      // Fetch still uses the bare repo; only the push goes to a server that
      // wants a login. Without a credential helper the machine's Git
      // Credential Manager cannot open a window.
      const server = createServer((_request, response) => {
        response.writeHead(401, { "WWW-Authenticate": 'Basic realm="x"' });
        response.end();
      });
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      const { port } = server.address() as AddressInfo;
      try {
        await simpleGit(repo).raw([
          "remote",
          "set-url",
          "--push",
          "origin",
          `http://127.0.0.1:${port}/repo.git`,
        ]);
        await simpleGit({
          baseDir: repo,
          unsafe: { allowUnsafeCredentialHelper: true },
        }).raw(["config", "credential.helper", ""]);
        const started = Date.now();

        expect(await dispatch()).toMatchObject({
          error: { code: "git_push_failed" },
        });
        expect(Date.now() - started).toBeLessThan(20_000);
        expect(await localBranches()).not.toContain("spore/42-issue-42");
        expect(store.snapshot().agents).toEqual([]);
      } finally {
        server.closeAllConnections();
        server.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "answers claude_not_found before any git work when Claude is missing",
    async () => {
      process.env.GITSPORE_CLAUDE_BIN = join(claudeDir, "missing");

      expect(await dispatch()).toMatchObject({
        error: { code: "claude_not_found" },
      });
      expect(existsSync(join(parent, ".gitspore-worktrees"))).toBe(false);
      expect(await onOrigin("spore/42-issue-42")).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "writes shell syntax from the issue into the task file and runs none of it",
    async () => {
      const body =
        "$(touch pwned-1) `touch pwned-2` \"quoted\" 'single' && touch pwned-3";
      github.getIssue.mockResolvedValueOnce({ ...issue(42), body });

      const agent = await dispatchOk();

      const task = await readFile(
        join(agent.worktreePath, ".gitspore", "task.md"),
        "utf8",
      );
      expect(task).toContain(body);
      for (const dir of [agent.worktreePath, repo, process.cwd()]) {
        for (const name of ["pwned-1", "pwned-2", "pwned-3"]) {
          expect(existsSync(join(dir, name))).toBe(false);
        }
      }
    },
    TEST_TIMEOUT_MS,
  );

  // --- Claude's exit ------------------------------------------------------

  it(
    "is error when Claude exits with code 1",
    async () => {
      delete process.env.FAKE_CLAUDE_STAY;
      process.env.FAKE_CLAUDE_EXIT_CODE = "1";

      const agent = await dispatchOk();

      await waitForStatus(agent.id, "error");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "is done when Claude exits with code 0 and an open pull request",
    async () => {
      delete process.env.FAKE_CLAUDE_STAY;
      github.findPullRequest.mockResolvedValue({
        number: 7,
        url: "https://github.com/owner/repo/pull/7",
        state: "open",
      });

      const agent = await dispatchOk();

      await waitForStatus(agent.id, "done");
      expect(github.findPullRequest).toHaveBeenCalledWith(agent.branch);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "is needs_input when Claude exits with code 0 and no pull request",
    async () => {
      delete process.env.FAKE_CLAUDE_STAY;

      const agent = await dispatchOk();

      await waitForStatus(agent.id, "needs_input");
    },
    TEST_TIMEOUT_MS,
  );

  // --- status from hooks (GS-67) ------------------------------------------

  // Every status the store sends out, in order.
  function recordStatuses() {
    const statuses: AgentStatus[] = [];
    store.onPatch((patch) => {
      for (const op of patch.ops) {
        if (op.type === "agent:upsert") statuses.push(op.agent.status);
      }
    });
    return statuses;
  }

  it(
    "follows the hooks through the real script and endpoint",
    async () => {
      github.findPullRequest.mockResolvedValue({
        number: 7,
        url: "https://github.com/owner/repo/pull/7",
        state: "open",
      });
      process.env.FAKE_CLAUDE_HOOKS = [
        "SessionStart",
        "UserPromptSubmit",
        "PreToolUse",
        "PermissionRequest",
        "Notification:permission_prompt",
        "PostToolUse",
        "Stop",
      ].join(",");
      const statuses = recordStatuses();

      const agent = await dispatchOk();
      await waitForStatus(agent.id, "done");

      expect(statuses).toEqual([
        "starting",
        "working",
        "needs_input",
        "working",
        "done",
      ]);
      expect(github.findPullRequest).toHaveBeenCalledWith(agent.branch);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "is needs_input after Stop without an open pull request",
    async () => {
      process.env.FAKE_CLAUDE_HOOKS = "SessionStart,UserPromptSubmit,Stop";
      const statuses = recordStatuses();

      const agent = await dispatchOk();
      await waitForStatus(agent.id, "needs_input");

      expect(statuses).toEqual(["starting", "working", "needs_input"]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "is error after StopFailure",
    async () => {
      process.env.FAKE_CLAUDE_HOOKS =
        "SessionStart,UserPromptSubmit,StopFailure";

      const agent = await dispatchOk();
      await waitForStatus(agent.id, "error");

      // Not the watchdog's error: that one comes with a reason.
      expect(agentOf(agent.id).statusReason).toBeNull();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "is error with the trust hint when no hook arrives in time",
    async () => {
      service.watchdogMs = 2_000;

      const agent = await dispatchOk();
      await waitForStatus(agent.id, "error");

      expect(agentOf(agent.id).statusReason).toEqual({
        code: "no_status",
        message: expect.stringMatching(/trust the folder/),
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "keeps the hook files out of git",
    async () => {
      process.env.FAKE_CLAUDE_HOOKS = "SessionStart,PreToolUse";

      const agent = await dispatchOk();
      await waitForStatus(agent.id, "working");

      for (const file of ["task.md", "hook.json", "settings.json"]) {
        expect(existsSync(join(agent.worktreePath, ".gitspore", file))).toBe(
          true,
        );
      }
      expect((await simpleGit(agent.worktreePath).status()).isClean()).toBe(
        true,
      );
    },
    TEST_TIMEOUT_MS,
  );

  // --- pull requests and the cleanup after a merge (GS-48) ----------------

  // What the GitHub poll reports for the agent's branch.
  function pullRequestChanged(agent: Agent, state: PullRequest["state"]) {
    const [[listener]] = github.onPullRequest.mock.calls;
    listener({
      branch: agent.branch,
      issueNumber: agent.issueNumber ?? 0,
      pullRequest: {
        number: 7,
        url: "https://github.com/owner/repo/pull/7",
        state,
      },
    });
  }

  it(
    "is done with the link when the pull request is opened",
    async () => {
      const agent = await dispatchOk();

      pullRequestChanged(agent, "open");

      expect(agentOf(agent.id)).toMatchObject({
        status: "done",
        pullRequest: { url: "https://github.com/owner/repo/pull/7" },
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "cleans up a squash-merged branch: worktree and local branch go, the slot is free",
    async () => {
      service.bloomMs = 500;
      const agent = await dispatchOk();
      // A commit that is on the branch only: after a squash merge on GitHub,
      // local git still sees the branch as unmerged.
      const worktree = simpleGit(agent.worktreePath);
      await writeFile(join(agent.worktreePath, "fix.txt"), "fixed\n");
      await worktree.add("fix.txt");
      await worktree.commit("Fix it");

      pullRequestChanged(agent, "merged");
      expect(agentOf(agent.id).status).toBe("merged");
      await waitForAgent(agent.id, (a) => a === undefined, "go away");

      expect(existsSync(agent.worktreePath)).toBe(false);
      expect(await localBranches()).not.toContain(agent.branch);
      // The branch on origin is left to GitHub.
      expect(await onOrigin(agent.branch)).toBe(true);
      await dispatchOk(43, 0);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "keeps a worktree with uncommitted changes after a merge",
    async () => {
      service.bloomMs = 500;
      const agent = await dispatchOk();
      await writeFile(join(agent.worktreePath, "draft.txt"), "not saved\n");

      pullRequestChanged(agent, "merged");
      await waitForAgent(
        agent.id,
        (a) => a?.statusReason?.code === "cleanup_blocked",
        "get cleanup_blocked",
      );

      expect(agentOf(agent.id).status).toBe("merged");
      expect(existsSync(join(agent.worktreePath, "draft.txt"))).toBe(true);
      expect(await localBranches()).toContain(agent.branch);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "is error with pr_closed for a pull request closed without merging, and deletes nothing",
    async () => {
      service.bloomMs = 500;
      const agent = await dispatchOk();

      pullRequestChanged(agent, "closed");
      // Longer than a bloom, so a cleanup would have run by now.
      await new Promise((resolve) => setTimeout(resolve, 1_000));

      expect(agentOf(agent.id)).toMatchObject({
        status: "error",
        statusReason: { code: "pr_closed" },
      });
      expect(existsSync(agent.worktreePath)).toBe(true);
      expect(await localBranches()).toContain(agent.branch);
      expect(await onOrigin(agent.branch)).toBe(true);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "stays as it is when GitHub can't be asked",
    async () => {
      github.findPullRequest.mockRejectedValue(
        new GitHubError("github_unreachable", "Offline"),
      );
      process.env.FAKE_CLAUDE_HOOKS = "SessionStart,UserPromptSubmit,Stop";

      const agent = await dispatchOk();
      await waitForStatus(agent.id, "needs_input");

      expect(agentOf(agent.id).pullRequest).toBeNull();
      expect(existsSync(agent.worktreePath)).toBe(true);
    },
    TEST_TIMEOUT_MS,
  );

  // --- stop ---------------------------------------------------------------

  it(
    "refuses to stop an agent that is still starting",
    async () => {
      const issueAnswer = deferred<Issue & { body: string }>();
      github.getIssue.mockReturnValueOnce(issueAnswer.promise);

      const dispatching = dispatch();
      const [starting] = store.snapshot().agents;

      await expect(
        service.stop({ agentId: starting.id, removeWorktree: false }),
      ).rejects.toMatchObject({ code: "agent_starting" });

      issueAnswer.resolve({ ...issue(42), body: "Fix it." });
      expect(await dispatching).toEqual({ agentId: starting.id });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "stops Claude, removes a clean worktree and keeps the branch",
    async () => {
      const agent = await dispatchOk();

      await service.stop({ agentId: agent.id, removeWorktree: true });

      expect(exited.has(agent.id)).toBe(true);
      expect(existsSync(agent.worktreePath)).toBe(false);
      expect(await localBranches()).toContain(agent.branch);
      expect(await onOrigin(agent.branch)).toBe(true);
      expect(store.snapshot().agents).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "keeps a dirty worktree on stop and answers worktree_dirty",
    async () => {
      const agent = await dispatchOk();
      await writeFile(join(agent.worktreePath, "work.txt"), "not committed");

      await expect(
        service.stop({ agentId: agent.id, removeWorktree: true }),
      ).rejects.toMatchObject({ code: "worktree_dirty" });

      expect(existsSync(join(agent.worktreePath, "work.txt"))).toBe(true);
      expect(agentOf(agent.id).status).toBe("error");

      await service.stop({ agentId: agent.id, removeWorktree: false });
      expect(store.snapshot().agents).toEqual([]);
      expect(existsSync(agent.worktreePath)).toBe(true);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "runs six slot agents and the overview agent at the same time",
    async () => {
      const acks = await Promise.all(
        [42, 43, 44, 45, 46, 47].map((n, slot) => dispatch(n, slot)),
      );
      for (const ack of acks) {
        expect(ack).toEqual({ agentId: expect.any(String) });
      }

      terminals.spawn({
        agentId: "overview",
        cwd: repo,
        mode: "exec",
        command: fakeClaude,
        args: [],
      });

      expect(store.snapshot().agents.map((a) => a.status)).toEqual(
        Array(6).fill("starting"),
      );
      expect(exited.size).toBe(0);

      // The overview agent is not the service's: it is stopped here.
      const overviewExited = new Promise<void>((resolve) =>
        terminals.onExited((agentId) => {
          if (agentId === "overview") resolve();
        }),
      );
      terminals.kill("overview");
      await overviewExited;
    },
    TEST_TIMEOUT_MS * 2,
  );
});

// Resolves once the file exists; the fake writes it right after its start.
async function waitForFile(file: string) {
  const until = Date.now() + WAIT_MS;
  while (!existsSync(file)) {
    if (Date.now() > until) throw new Error(`${file} was never written`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
