import {
  MAX_SLOTS,
  type Agent,
  type Issue,
  type RepoInfo,
} from "@gitspore/shared";
import type { GreenhouseStoreState } from "./greenhouseStore";

// Selectors for useGreenhouseStore. The ones that return a new array on each
// call (freeSlots, openIssuesWithoutAgent) need useShallow, otherwise React
// sees a "changed" value on every read and renders in an endless loop:
//
//   const slots = useGreenhouseStore(useShallow(freeSlots));

// Shared, so "no state yet" returns the same array every time.
const NO_AGENTS: Agent[] = [];
const NO_ISSUES: Issue[] = [];

export function selectAgents(state: GreenhouseStoreState): Agent[] {
  return state.server?.agents ?? NO_AGENTS;
}

export function selectIssues(state: GreenhouseStoreState): Issue[] {
  return state.server?.issues ?? NO_ISSUES;
}

/** The repo gitspore works in, null before a snapshot and while none is chosen. */
export function selectRepo(state: GreenhouseStoreState): RepoInfo | null {
  return state.server?.repo ?? null;
}

/**
 * Whether the setup screen shows: the daemon has no repo yet, or the user
 * opened the screen to switch. Not before the first snapshot: until then
 * nobody knows if a repo is set, and offline shows the connection state.
 */
export function showSetup(state: GreenhouseStoreState): boolean {
  if (state.server === null) return false;
  return state.server.repo === null || state.setupOpen;
}

/** The agent in a slot, or null for an empty slot. */
export function agentBySlot(slot: number) {
  return (state: GreenhouseStoreState): Agent | null =>
    selectAgents(state).find((agent) => agent.slotIndex === slot) ?? null;
}

/**
 * Slot indexes without an agent, in ascending order. A new array each call:
 * use it as `useGreenhouseStore(useShallow(freeSlots))`.
 */
export function freeSlots(state: GreenhouseStoreState): number[] {
  const taken = new Set(selectAgents(state).map((agent) => agent.slotIndex));
  return Array.from({ length: MAX_SLOTS }, (_, slot) => slot).filter(
    (slot) => !taken.has(slot),
  );
}

/**
 * The title of an issue, "" if it is not in the list (yet) or for no issue
 * (null, the overview agent).
 */
export function issueTitle(issueNumber: number | null) {
  return (state: GreenhouseStoreState): string =>
    selectIssues(state).find((issue) => issue.number === issueNumber)?.title ??
    "";
}

/** How many agents wait for the user. */
export function needsInputCount(state: GreenhouseStoreState): number {
  return selectAgents(state).filter((agent) => agent.status === "needs_input")
    .length;
}

/**
 * Open issues no agent works on yet: the ones that can be dispatched. A new
 * array each call: use it as
 * `useGreenhouseStore(useShallow(openIssuesWithoutAgent))`.
 */
export function openIssuesWithoutAgent(state: GreenhouseStoreState): Issue[] {
  const taken = new Set(selectAgents(state).map((agent) => agent.issueNumber));
  return selectIssues(state).filter((issue) => !taken.has(issue.number));
}
