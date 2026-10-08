import {
  applyPatch,
  type AgentDispatchAck,
  type ClientToServerEvents,
  type GreenhouseState,
  type JsonValue,
  type PatchOp,
  type ServerToClientEvents,
  type TerminalOpenAck,
} from "./index";

// Typed as JsonValue, so a payload that isn't plain JSON (a Date, a Map, an
// optional field) fails to compile before it can fail here.
function roundTrip(value: JsonValue): unknown {
  return JSON.parse(JSON.stringify(value));
}

const snapshot: GreenhouseState = {
  version: 7,
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
    },
  ],
  issues: [
    {
      number: 42,
      title: "Login fails with umlauts in the password",
      url: "https://github.com/gitspore/gitspore/issues/42",
      labels: ["bug"],
    },
    {
      number: 43,
      title: "Dark mode",
      url: "https://github.com/gitspore/gitspore/issues/43",
      labels: [],
    },
  ],
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
    },
  },
  "issue:remove": { type: "issue:remove", issueNumber: 43 },
};

// One sample payload per event, so the event log can hold every one of them.
const clientPayloads: {
  [E in keyof ClientToServerEvents]: Parameters<ClientToServerEvents[E]>[0];
} = {
  "agent:dispatch": { issueNumber: 43, slotIndex: 1 },
  "agent:stop": { agentId: "agent-1", removeWorktree: true },
  "issues:refresh": {},
  "state:request": {},
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
  error: { code: "git_failed", message: "worktree remove failed" },
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
        agents: [snapshot.agents[1]],
        issues: [snapshot.issues[0], ops["issue:upsert"].issue],
      },
    });
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
