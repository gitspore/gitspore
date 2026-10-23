// Domain models shared by the daemon (apps/api) and the browser (apps/web).
//
// The contract describes the domain only: agents, issues, worktrees. How the
// web app draws them is its own business, so no name here refers to the
// picture. Everything is plain JSON (no Date, Map, Set or class instances),
// because every event is written to the event log and replayed as-is.
// Types are aliases, not interfaces, so the tests can check them against
// JsonValue.

/** Number of agent slots. Agents with a slot index use 0 to MAX_SLOTS - 1. */
export const MAX_SLOTS = 6;
/** Prefix of every branch the daemon creates for an agent. */
export const BRANCH_PREFIX = "spore/";
export const OVERVIEW_AGENT_ID = "overview";

/** Any value that survives JSON.stringify / JSON.parse unchanged. */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** A UTC timestamp in ISO 8601, as returned by `new Date().toISOString()`. */
export type IsoTimestamp = string;

export type AgentId = string;
export type SessionId = string;

/** The pull request of an agent's branch. If there are several, the newest. */
export type PullRequest = {
  number: number;
  /** The pull request's page on github.com. */
  url: string;
  /** `merged` is a closed pull request whose branch was merged. */
  state: "open" | "closed" | "merged";
};

/**
 * Why an agent is in its status, where the status alone doesn't say it.
 *
 * - `no_status`: Claude Code has sent no status since its start; it most
 *   likely waits for the trust question in its terminal (`error`).
 * - `pr_closed`: the pull request was closed without merging. Nothing was
 *   deleted (`error`).
 * - `cleanup_blocked`: the branch is merged, but the worktree has uncommitted
 *   changes, so it was kept (`merged`).
 * - `daemon_restarted`: the worktree is from before a daemon restart, so
 *   Claude Code no longer runs in it. Worktree and branch are kept (`error`).
 */
export type StatusReasonCode =
  "no_status" | "pr_closed" | "cleanup_blocked" | "daemon_restarted";

export type StatusReason = {
  code: StatusReasonCode;
  /** For people: what happened and what to do. */
  message: string;
};

/**
 * Where an agent is in its life. The daemon is the only one that changes it.
 *
 * - `starting`: worktree and branch are being created and pushed, Claude Code
 *   launches, and no hook has reported yet. It can be stopped once Claude
 *   Code runs.
 * - `working`: Claude Code runs and does not need the user.
 * - `needs_input`: Claude Code stopped and waits for the user.
 * - `error`: Claude Code exited with an error or reported an API failure,
 *   sent no status at all after its start (`no_status`), its pull request
 *   was closed without merging (`pr_closed`), the worktree of a stopped
 *   agent could not be removed, or the agent was taken over from before a
 *   daemon restart and its branch has no pull request (`daemon_restarted`).
 *   The worktree is kept.
 *   A failed git setup is not an `error`: the agent is removed again (see
 *   `agent:dispatch`).
 * - `done`: the branch has an open pull request and waits for review and
 *   merge.
 * - `merged`: the pull request is merged. The agent is removed shortly after,
 *   unless its worktree has uncommitted changes (`cleanup_blocked`).
 */

export type AgentStatus =
  "starting" | "working" | "needs_input" | "error" | "done" | "merged";

/** One Claude Code session, running in its own git worktree and branch. */
export type Agent = {
  id: AgentId;
  /**
   * 0 to MAX_SLOTS - 1, unique among agents. `null` for an agent without a
   * slot, such as the overview agent in the repo root (ADR 0004).
   */
  slotIndex: number | null;
  /** The issue the agent works on. `null` for an agent without a slot. */
  issueNumber: number | null;
  /** Full branch name, starting with BRANCH_PREFIX for issue agents. */
  branch: string;
  /** Absolute path of the agent's worktree (the repo root for the overview agent). */
  worktreePath: string;
  status: AgentStatus;
  /** When `status` last changed. The client derives waiting times from it. */
  statusSince: IsoTimestamp;
  startedAt: IsoTimestamp;
  /** The pull request of the branch; `null` until there is one. */
  pullRequest: PullRequest | null;
  /**
   * Why the agent is in `status`, if the status alone doesn't say it. A
   * reason belongs to its status: the next status change clears it.
   */
  statusReason: StatusReason | null;
};

/** An open GitHub issue in the repo. */
export type Issue = {
  number: number;
  title: string;
  /** The issue's page on github.com. */
  url: string;
  /** Label names. */
  labels: string[];
};

/**
 * One client's connection to an agent's terminal. Closing it detaches the
 * client; the agent keeps running until `agent:stop`.
 */
export type TerminalSession = {
  id: SessionId;
  agentId: AgentId;
};

/** The repository gitspore works in. */
export type RepoInfo = {
  /** Absolute path of the repo root on the user's machine. */
  path: string;
  baseBranch: string;
  /**
   * "off": no GitHub remote or no token. Agents still work, issues don't sync.
   * Starts "off" for a new repo; a `repo:github` patch follows once GitHub
   * answered.
   */
  github: "on" | "off";
};

/** The full state the daemon sends on connect and on `state:request`. */
export type GreenhouseState = {
  /** Version of this state. Patches continue from it (see StatePatch). */
  version: number;
  repo: RepoInfo | null;
  agents: Agent[];
  /** Open issues, with or without an agent. */
  issues: Issue[];
};
