import {
  applyPatch,
  type AgentDispatchAck,
  type BranchGraphAck,
  type ClientToServerEvents,
  type GreenhouseState,
  type JsonValue,
  type PatchOp,
  type RepoCheckAck,
  type RepoChooseAck,
  type ServerToClientEvents,
  type TerminalOpenAck,
  type ServerError,
  type ErrorCode,
} from "./index";

// Typed as JsonValue, so a payload that isn't plain JSON (a Date, a Map, an
// optional field) fails to compile before it can fail here.
function roundTrip(value: JsonValue): unknown {
  return JSON.parse(JSON.stringify(value));
}

const snapshot: GreenhouseState = {
  version: 7,
  repo: { path: "/home/dev/repo", baseBranch: "main", github: "on" },
  agents: [
    {
      id: "agent-1",
      slotIndex: 0,
      issueNumber: 42,
      branch: "spore/42-fix-login",
      worktreePath: "/home/dev/repo/.worktrees/42-fix-login",
      status: "needs_input",
      statusSince: "2026-10-08T09:15:00.000Z",
      startedAt: "2026-10-08T09:00:00.000Z",
      pullRequest: {
        number: 7,
        url: "https://github.com/gitspore/gitspore/pull/7",
        state: "open",
      },
      statusReason: null,
      usage: {
        contextPercent: 22,
        model: "Opus",
        tokens: {
          input: 1_200,
          output: 48_000,
          cacheRead: 640_000,
          cacheWrite: 11_800,
          total: 701_000,
        },
      },
      cleaningUp: false,
    },
    {
      id: "overview",
      slotIndex: null,
      issueNumber: null,
      branch: "main",
      worktreePath: "/home/dev/repo",
      status: "working",
      statusSince: "2026-10-08T09:01:00.000Z",
      startedAt: "2026-10-08T09:01:00.000Z",
      pullRequest: null,
      statusReason: null,
      usage: null,
      cleaningUp: false,
    },
  ],
  issues: [
    {
      number: 42,
      title: "Login fails with umlauts in the password",
      url: "https://github.com/gitspore/gitspore/issues/42",
      labels: ["bug"],
      body: "Typing ü in the password field breaks the login.",
    },
    {
      number: 43,
      title: "Dark mode",
      url: "https://github.com/gitspore/gitspore/issues/43",
      labels: [],
      body: "",
    },
  ],
  plan: {
    fiveHour: { usedPercent: 23.5, resetsAt: "2026-10-08T12:00:00.000Z" },
    sevenDay: null,
  },
  repoTokens: 20_800_000,
};

// One sample per op type. A new PatchOp type is a compile error here until it
// has a sample.
const ops: { [T in PatchOp["type"]]: Extract<PatchOp, { type: T }> } = {
  "agent:upsert": {
    type: "agent:upsert",
    agent: {
      ...snapshot.agents[0],
      status: "working",
      statusSince: "2026-10-08T09:16:00.000Z",
    },
  },
  "agent:remove": { type: "agent:remove", agentId: "agent-1" },
  "issue:upsert": {
    type: "issue:upsert",
    issue: {
      number: 44,
      title: "Flaky test",
      url: "https://github.com/gitspore/gitspore/issues/44",
      labels: ["ci", "good first issue"],
      body: "",
    },
  },
  "issue:remove": { type: "issue:remove", issueNumber: 43 },
  "repo:github": { type: "repo:github", github: "off" },
  "plan:set": {
    type: "plan:set",
    plan: {
      fiveHour: { usedPercent: 100, resetsAt: "2026-10-08T14:30:00.000Z" },
      sevenDay: { usedPercent: 41.2, resetsAt: "2026-10-12T08:00:00.000Z" },
    },
  },
  "repoTokens:set": { type: "repoTokens:set", repoTokens: 21_500_000 },
};

// One sample payload per event, so the event log can hold every one of them.
const clientPayloads: {
  [E in keyof ClientToServerEvents]: Parameters<ClientToServerEvents[E]>[0];
} = {
  "agent:dispatch": { issueNumber: 43, slotIndex: 1 },
  "agent:stop": { agentId: "agent-1", removeWorktree: true },
  "issues:refresh": {},
  "state:request": {},
  "repo:choose": { path: "/home/dev/repo", baseBranch: "main" },
  "repo:check": { path: "/home/dev/repo", baseBranch: "main" },
  "branches:graph": { limit: 80 },
  "terminal:open": { agentId: "agent-1" },
  "terminal:input": { sessionId: "session-1", data: "y\r" },
  "terminal:resize": { sessionId: "session-1", cols: 80, rows: 24 },
  "terminal:close": { sessionId: "session-1" },
};

const acks: {
  dispatchOk: AgentDispatchAck;
  dispatchError: AgentDispatchAck;
  openOk: TerminalOpenAck;
  openError: TerminalOpenAck;
  repoOk: RepoChooseAck;
  repoProblems: RepoChooseAck;
  repoChecks: RepoCheckAck;
  branchGraph: BranchGraphAck;
  branchGraphError: BranchGraphAck;
} = {
  dispatchOk: { agentId: "agent-2" },
  dispatchError: {
    error: {
      code: "slot_unavailable",
      message: "Slot 0 already has agent agent-1",
      context: { slotIndex: 0, agentId: "agent-1" },
    },
  },
  openOk: { sessionId: "session-1" },
  openError: {
    error: { code: "agent_not_found", message: "No agent agent-9" },
  },
  repoOk: { repo: snapshot.repo! },
  repoProblems: {
    problems: [
      {
        code: "not_a_repo",
        message: "/home/dev/photos is not a git repository.",
      },
      {
        code: "no_base_branch",
        message: 'Branch "main" does not exist. Choose the base branch.',
      },
      {
        code: "no_claude",
        message: "Claude Code was not found. Install it, then check again.",
      },
    ],
  },
  repoChecks: {
    checks: [
      { item: "git", result: "ok", detail: "repo" },
      { item: "base_branch", result: "fail", detail: "No branch main" },
      { item: "github", result: "warn", detail: "No GitHub remote" },
      { item: "claude", result: "ok", detail: "found" },
    ],
  },
  branchGraph: {
    graph: {
      commits: [
        {
          sha: "a41c9e2f0c1d4b6e8f7a9b0c1d2e3f4a5b6c7d8e",
          parents: ["3fa61d8e0c1d4b6e8f7a9b0c1d2e3f4a5b6c7d8e"],
          author: "Claude",
          date: "2026-10-23T09:15:00.000Z",
          subject: "session check",
        },
      ],
      heads: [
        { branch: "main", sha: "3fa61d8e0c1d4b6e8f7a9b0c1d2e3f4a5b6c7d8e" },
        {
          branch: "spore/12-login-redirect",
          sha: "a41c9e2f0c1d4b6e8f7a9b0c1d2e3f4a5b6c7d8e",
        },
      ],
      hasMore: false,
    },
  },
  branchGraphError: {
    error: { code: "repo_unavailable", message: "No repository chosen yet." },
  },
};

const errors: { [C in ErrorCode]: ServerError & { code: C } } = {
  invalid_payload: { code: "invalid_payload", message: "Invalid payload" },
  slot_unavailable: {
    code: "slot_unavailable",
    message: "Slot 0 already has agent agent-1",
    context: { slotIndex: 0, agentId: "agent-1" },
  },
  issue_not_found: { code: "issue_not_found", message: "No open issue #99" },
  issue_taken: {
    code: "issue_taken",
    message: "Issue #42 already has agent agent-1",
    context: { issueNumber: 42, agentId: "agent-1" },
  },
  agent_not_found: { code: "agent_not_found", message: "Agent not found" },
  session_not_found: {
    code: "session_not_found",
    message: "No session session-9",
  },
  git_failed: {
    code: "git_failed",
    message: "Branch spore/42-fix-login already exists",
  },
  git_push_failed: {
    code: "git_push_failed",
    message: "Could not push spore/42-fix-login to origin: no login",
    context: { branch: "spore/42-fix-login" },
  },
  worktree_dirty: {
    code: "worktree_dirty",
    message: "The worktree has uncommitted changes",
    context: { agentId: "agent-1" },
  },
  agent_starting: {
    code: "agent_starting",
    message: "Agent agent-1 is still starting",
    context: { agentId: "agent-1" },
  },
  claude_not_found: {
    code: "claude_not_found",
    message:
      "Claude Code was not found. Install it from https://claude.com/claude-code",
  },
  repo_unavailable: {
    code: "repo_unavailable",
    message:
      "gitspore is switching to another repository. Try again in a moment.",
  },
  github_failed: { code: "github_failed", message: "GitHub answered with 500" },
  github_sync_disabled: {
    code: "github_sync_disabled",
    message: "No GitHub token found",
  },
  github_unreachable: {
    code: "github_unreachable",
    message: "api.github.com is not reachable",
  },
  github_rate_limited: {
    code: "github_rate_limited",
    message: "Rate limit reached",
  },
  github_auth_failed: {
    code: "github_auth_failed",
    message: "GitHub rejected the token",
  },
  internal: { code: "internal", message: "Unexpected error" },
};

const serverPayloads: {
  [E in keyof ServerToClientEvents]: Parameters<ServerToClientEvents[E]>[0];
} = {
  "state:snapshot": snapshot,
  "state:patch": { version: 8, ops: Object.values(ops) },
  "terminal:data": {
    sessionId: "session-1",
    chunk: "\u001b[32m✔\u001b[0m Tests passed\r\n",
  },
  "terminal:exit": { sessionId: "session-1", exitCode: 0 },
  error: { code: errors.git_failed.code, message: "worktree remove failed" },
};

describe("JSON round trip", () => {
  it("keeps the snapshot unchanged", () => {
    expect(roundTrip(snapshot)).toStrictEqual(snapshot);
  });

  it.each(Object.values(ops))("keeps the $type op unchanged", (op) => {
    expect(roundTrip(op)).toStrictEqual(op);
  });

  it.each([
    ["client payloads", clientPayloads],
    ["acks", acks],
    ["errors", errors],
    ["server payloads", serverPayloads],
  ] as const)("keeps all %s unchanged", (_, payloads) => {
    expect(roundTrip(payloads)).toStrictEqual(payloads);
  });
});

describe("applyPatch", () => {
  it("applies every op type in order and takes the patch version", () => {
    const result = applyPatch(snapshot, {
      version: 8,
      ops: Object.values(ops),
    });

    expect(result).toStrictEqual({
      status: "applied",
      state: {
        version: 8,
        repo: { ...snapshot.repo!, github: "off" },
        agents: [snapshot.agents[1]],
        issues: [snapshot.issues[0], ops["issue:upsert"].issue],
        plan: ops["plan:set"].plan,
        repoTokens: ops["repoTokens:set"].repoTokens,
      },
    });
  });

  it("changes nothing with repo:github while no repo is chosen", () => {
    const result = applyPatch(
      { ...snapshot, repo: null },
      { version: 8, ops: [ops["repo:github"]] },
    );

    expect(result).toMatchObject({ status: "applied", state: { repo: null } });
  });

  it("replaces an upserted entity in place", () => {
    const result = applyPatch(snapshot, {
      version: 8,
      ops: [ops["agent:upsert"]],
    });

    expect(result).toStrictEqual({
      status: "applied",
      state: {
        ...snapshot,
        version: 8,
        agents: [ops["agent:upsert"].agent, snapshot.agents[1]],
      },
    });
  });

  it("leaves the old state untouched", () => {
    const before = structuredClone(snapshot);
    applyPatch(snapshot, { version: 8, ops: Object.values(ops) });
    expect(snapshot).toStrictEqual(before);
  });

  it("ignores a patch at or below the current version", () => {
    expect(applyPatch(snapshot, { version: 7, ops: [] })).toStrictEqual({
      status: "stale",
    });
  });

  it("reports a gap when a version was skipped", () => {
    expect(applyPatch(snapshot, { version: 9, ops: [] })).toStrictEqual({
      status: "gap",
    });
  });
});
