// Socket.io event maps. Pass them as generics on both ends:
//
//   apps/api: Server<ClientToServerEvents, ServerToClientEvents>
//   apps/web: Socket<ServerToClientEvents, ClientToServerEvents>
//
// Every payload is plain JSON, so the event log can record and replay it.

import type {
  Agent,
  AgentId,
  GreenhouseState,
  Issue,
  JsonValue,
  RepoInfo,
  SessionId,
} from "./models";

// --- Errors ---------------------------------------------------------------

/** Why the daemon rejected a request. */
export type ErrorCode =
  /** The payload is missing fields or has values of the wrong type. */
  | "invalid_payload"
  /** The slot index is out of range or the slot already has an agent. */
  | "slot_unavailable"
  /** No open issue with this number. */
  | "issue_not_found"
  /** An agent already works on this issue. */
  | "issue_taken"
  /** No agent with this id. */
  | "agent_not_found"
  /** No terminal session with this id. */
  | "session_not_found"
  /** Creating or removing the worktree or branch failed. */
  | "git_failed"
  /** GitHub could not be reached or refused the request. */
  | "github_failed"
  /** GitHub synchronization is disabled. */
  | "github_sync_disabled"
  /** GitHub Servers are not reachable. */
  | "github_unreachable"
  /** GitHub rate limiting. */
  | "github_rate_limited"
  /** Not authorized. */
  | "github_auth_failed"
  /** Anything else. `message` says what. */
  | "internal";

export type ServerError = {
  code: ErrorCode;
  /** For the developer, not for display as-is. */
  message: string;
  /** Ids or values the error refers to, e.g. `{ agentId }`. */
  context?: { [key: string]: JsonValue };
};

// --- State patches --------------------------------------------------------

/**
 * One change to GreenhouseState. Upserts carry the whole entity and replace
 * any entity with the same key; removes carry only the key.
 */
export type PatchOp =
  | { type: "agent:upsert"; agent: Agent }
  | { type: "agent:remove"; agentId: AgentId }
  | { type: "issue:upsert"; issue: Issue }
  | { type: "issue:remove"; issueNumber: number };

/**
 * Changes from version `version - 1` to `version`. Versions increase by
 * exactly one per patch, so a client at version n applies only the patch
 * with version n + 1. A higher version means it missed patches: it requests
 * a snapshot with `state:request`. A lower or equal version is stale and is
 * ignored. A snapshot always replaces the client's state, whatever its
 * version.
 */
export type StatePatch = {
  version: number;
  /** Applied in order. */
  ops: PatchOp[];
};

// --- Payloads: Client → Server --------------------------------------------

/** Payload of events that carry no data. Send `{}`. */
export type EmptyPayload = { [key: string]: never };

export type AgentDispatchPayload = { issueNumber: number; slotIndex: number };
export type AgentDispatchAck = { agentId: AgentId } | { error: ServerError };

export type AgentStopPayload = {
  agentId: AgentId;
  /** Also delete the worktree. The branch is kept either way. */
  removeWorktree: boolean;
};

export type TerminalOpenPayload = { agentId: AgentId };
export type TerminalOpenAck = { sessionId: SessionId } | { error: ServerError };

export type TerminalInputPayload = {
  sessionId: SessionId;
  /** Keystrokes or pasted text, as xterm.js reports them in `onData`. */
  data: string;
};

export type TerminalResizePayload = {
  sessionId: SessionId;
  cols: number;
  rows: number;
};

export type TerminalClosePayload = { sessionId: SessionId };

export type RepoChoosePayload = {
  /** Absolute path, or a folder inside the repo. */
  path: string;
  /** Defaults to "main". */
  baseBranch?: string;
};

/** Why a repo can't be chosen. `message` is for display and says what to do. */
export type RepoProblem = {
  code:
    | "not_found"
    | "not_a_repo"
    | "no_base_branch"
    | "agents_running"
    /** Claude Code is not installed; no agent could start there. */
    | "no_claude"
    /** Another tab is switching repos right now. */
    | "switching"
    /** The switch failed midway and was undone; the old repo stays. */
    | "switch_failed"
    /** The payload is missing fields or has values of the wrong type. */
    | "invalid_payload";
  message: string;
};

export type RepoChooseAck = { repo: RepoInfo } | { problems: RepoProblem[] };

/** What `repo:check` looked at, one line each on the setup screen. */
export type RepoCheckItem = "git" | "base_branch" | "github" | "claude";

export type RepoCheck = {
  item: RepoCheckItem;
  /**
   * "warn": gitspore works without it, e.g. GitHub off. "fail": agents
   * can't run there; fix it before choosing the repo.
   */
  result: "ok" | "warn" | "fail";
  /** For display: what was found ("main exists"), or what to do. */
  detail: string;
};

/** In the order above. Checks that need a git repo are left out without one. */
export type RepoCheckAck = { checks: RepoCheck[] };

// --- Payloads: Server → Client --------------------------------------------

export type TerminalDataPayload = {
  sessionId: SessionId;
  /** Terminal output, ANSI escape codes included. Write it to xterm.js as-is. */
  chunk: string;
};

export type TerminalExitPayload = {
  sessionId: SessionId;
  exitCode: number;
};

// --- Event maps -----------------------------------------------------------

export interface ClientToServerEvents {
  /**
   * Client → Server. Start an agent on an issue in a free slot. The daemon
   * creates a worktree and a `spore/…` branch and starts Claude Code in it.
   * The ack carries the new agent's id; the agent itself arrives as an
   * `agent:upsert` patch, first with status `starting`.
   */
  "agent:dispatch": (
    payload: AgentDispatchPayload,
    ack: (response: AgentDispatchAck) => void,
  ) => void;

  /**
   * Client → Server. Stop an agent's Claude Code process, close its terminal
   * sessions and free its slot, optionally deleting the worktree. Ends with
   * an `agent:remove` patch; failures arrive as `error`.
   */
  "agent:stop": (payload: AgentStopPayload) => void;

  /**
   * Client → Server. Fetch the open issues from GitHub again. Changes arrive
   * as `issue:upsert` and `issue:remove` patches; failures as `error`.
   */
  "issues:refresh": (payload: EmptyPayload) => void;

  /**
   * Client → Server. Ask for a full `state:snapshot`, e.g. after a gap in
   * patch versions.
   */
  "state:request": (payload: EmptyPayload) => void;

  /**
   * Client → Server. Choose the repository gitspore works in. The daemon
   * checks the path; the ack carries the repo or every problem found. On
   * success all clients get a new `state:snapshot` for that repo. Refused
   * while agents run.
   */
  "repo:choose": (
    payload: RepoChoosePayload,
    ack: (response: RepoChooseAck) => void,
  ) => void;

  /**
   * Client → Server. Check a repository without choosing it, for the setup
   * screen to show before the user commits. Changes nothing.
   */
  "repo:check": (
    payload: RepoChoosePayload,
    ack: (response: RepoCheckAck) => void,
  ) => void;

  /**
   * Client → Server. Attach to an agent's terminal. The ack carries the
   * session id for the other `terminal:*` events; output follows as
   * `terminal:data`.
   */
  "terminal:open": (
    payload: TerminalOpenPayload,
    ack: (response: TerminalOpenAck) => void,
  ) => void;

  /** Client → Server. Send keystrokes to a session's terminal. */
  "terminal:input": (payload: TerminalInputPayload) => void;

  /** Client → Server. Resize a session's terminal to the window's size. */
  "terminal:resize": (payload: TerminalResizePayload) => void;

  /**
   * Client → Server. Detach from a terminal. The agent keeps running; use
   * `agent:stop` to end it.
   */
  "terminal:close": (payload: TerminalClosePayload) => void;
}

export interface ServerToClientEvents {
  /**
   * Server → Client. The full state. Sent on connect and in answer to
   * `state:request`. Replaces whatever the client had.
   */
  "state:snapshot": (state: GreenhouseState) => void;

  /** Server → Client. Changes since the previous version (see StatePatch). */
  "state:patch": (patch: StatePatch) => void;

  /** Server → Client. Output of a session's terminal. */
  "terminal:data": (payload: TerminalDataPayload) => void;

  /**
   * Server → Client. The process behind a session's terminal ended. The
   * session is closed; the agent's new status arrives as a patch.
   */
  "terminal:exit": (payload: TerminalExitPayload) => void;

  /**
   * Server → Client. A request without an ack failed, or something went
   * wrong in the background (e.g. an agent's worktree could not be removed).
   */
  error: (error: ServerError) => void;
}
