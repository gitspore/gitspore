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

/** Any value that survives JSON.stringify / JSON.parse unchanged. */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** A UTC timestamp in ISO 8601, as returned by `new Date().toISOString()`. */
export type IsoTimestamp = string;

export type AgentId = string;
export type SessionId = string;

/**
 * Where an agent is in its life. The daemon is the only one that changes it.
 *
 * - `starting`: worktree and branch are being created, Claude Code launches.
 * - `working`: Claude Code runs and does not need the user.
 * - `needs_input`: Claude Code stopped and waits for the user.
 * - `error`: Claude Code or the git setup failed. The worktree is kept.
 * - `done`: Claude Code finished; the branch waits for review and merge.
 * - `merged`: the branch is merged into main. The agent is removed after cleanup.
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

/** The full state the daemon sends on connect and on `state:request`. */
export type GreenhouseState = {
  /** Version of this state. Patches continue from it (see StatePatch). */
  version: number;
  agents: Agent[];
  /** Open issues, with or without an agent. */
  issues: Issue[];
};
