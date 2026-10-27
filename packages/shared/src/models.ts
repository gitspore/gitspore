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

/**
 * One of the plan's usage limits (Claude Pro and Max), from Claude Code's
 * statusline (ADR 0009).
 */
export type UsageLimit = {
  /** 0 to 100, may have decimals. At 100 every agent waits for the reset. */
  usedPercent: number;
  resetsAt: IsoTimestamp;
};

/**
 * The plan's limits. They apply to the whole Claude account, so sessions
 * outside gitspore count too. A window is `null` while Claude Code doesn't
 * report it: after its reset, or before the first answer.
 */
export type PlanUsage = {
  fiveHour: UsageLimit | null;
  sevenDay: UsageLimit | null;
};

/** Tokens of one agent, summed over its session log. */
export type TokenCounts = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** Always the sum of the four above. */
  total: number;
};

/** One agent's usage, from its statusline and its session log. */
export type AgentUsage = {
  /** How full the context is, 0 to 100. `null` early in a session. */
  contextPercent: number | null;
  /** The model's display name, e.g. "Opus". `null` if not reported. */
  model: string | null;
  tokens: TokenCounts;
};

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
  /**
   * Tokens and context, once Claude Code has reported them (#42). `null`
   * until then, and for agents without a statusline (the overview agent).
   */
  usage: AgentUsage | null;
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
  /**
   * The plan's limits, from the newest statusline of any agent. `null` until
   * one reported them, and with an API key. Kept across a repo switch: the
   * limits belong to the account, not to the repo.
   */
  plan: PlanUsage | null;
  /**
   * The repo's token total: every request of its agents once, also of agents
   * that are gone and of sessions before the daemon's start. The daemon keeps
   * it, so it outlives Claude Code deleting its logs. `null` without a repo;
   * a repo switch resets it, and the daemon sends the new repo's.
   */
  repoTokens: number | null;
};
