// Acceptance tests of GS-66: dispatch and stop with real git (a bare repo in
// a temp folder as origin), real PTYs and the fake claude. Only GitHub is a
// stand-in. The logic of each step has its unit tests in
// agent.service.spec.ts; these check that the parts work together on every
// OS in CI.
import { RepoConfig } from "@/config/repo-config";
import type { AgentId, AgentStatus, Issue } from "@gitspore/shared";
import { Logger } from "@nestjs/common";
import { existsSync } from "node:fs";
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
import type { PullRequest } from "../github/github-api";
import { GitHubError } from "../github/github-error";
import type { GitHubService } from "../github/github.service";
import { StateStore } from "../state/state.store";
import { ClaudeLocator, systemDeps } from "../terminal/claude-locator";
import { TerminalService } from "../terminal/terminal.service";
import { WorktreeService } from "../worktree/worktree.service";
import { AgentService } from "./agent.service";
import { PROMPT } from "./task-file";

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
  };
  const exited = new Set<AgentId>();

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
      new HookService(),
    );
    service.onModuleInit();

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

  // Resolves once the agent has the status; fails after WAIT_MS.
  function waitForStatus(agentId: AgentId, status: AgentStatus) {
    return new Promise<void>((resolve, reject) => {
      const has = () =>
        store.snapshot().agents.find((a) => a.id === agentId)?.status ===
        status;
      if (has()) return resolve();
      const timer = setTimeout(
        () => reject(new Error(`${agentId} did not become ${status}`)),
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

  it(
    "refuses a branch that exists only on origin, and leaves it there",
    async () => {
      const branch = "spore/42-issue-42";
      await simpleGit(repo).raw([
        "push",
        "origin",
        `main:refs/heads/${branch}`,
      ]);

      expect(await dispatch()).toMatchObject({
        error: { code: "git_failed", context: { reason: "branch_exists" } },
      });
      expect(await onOrigin(branch)).toBe(true);
      expect(await localBranches()).not.toContain(branch);
      expect(store.snapshot().agents).toEqual([]);
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
