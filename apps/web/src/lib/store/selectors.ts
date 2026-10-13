import { MAX_SLOTS, type Agent, type Issue } from "@gitspore/shared";
import type { GreenhouseStoreState } from "./greenhouseStore";

// Selectors for useGreenhouseStore. The ones that return a new array on each
// call (freeSlots, openIssuesWithoutAgent) need useShallow, otherwise every
// store change re-renders the component:
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

/** The agent in a slot, or null for an empty slot. */
export function agentBySlot(slot: number) {
  return (state: GreenhouseStoreState): Agent | null =>
    selectAgents(state).find((agent) => agent.slotIndex === slot) ?? null;
}

/** Slot indexes without an agent, in ascending order. */
export function freeSlots(state: GreenhouseStoreState): number[] {
  const taken = new Set(selectAgents(state).map((agent) => agent.slotIndex));
  return Array.from({ length: MAX_SLOTS }, (_, slot) => slot).filter(
    (slot) => !taken.has(slot),
  );
}

/** How many agents wait for the user. */
export function needsInputCount(state: GreenhouseStoreState): number {
  return selectAgents(state).filter((agent) => agent.status === "needs_input")
    .length;
}

/** Open issues no agent works on yet: the ones that can be dispatched. */
export function openIssuesWithoutAgent(state: GreenhouseStoreState): Issue[] {
  const taken = new Set(selectAgents(state).map((agent) => agent.issueNumber));
  return selectIssues(state).filter((issue) => !taken.has(issue.number));
}
