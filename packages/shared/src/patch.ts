import type { PatchOp, StatePatch } from "./events";
import type { GreenhouseState } from "./models";

export type ApplyPatchResult =
  | { status: "applied"; state: GreenhouseState }
  /** The patch is older than the state. Ignore it. */
  | { status: "stale" }
  /** Patches were missed. Send `state:request` and wait for the snapshot. */
  | { status: "gap" };

/**
 * Applies a patch following the version rules of StatePatch. Pure: returns
 * a new state and leaves the old one untouched.
 */
export function applyPatch(
  state: GreenhouseState,
  patch: StatePatch,
): ApplyPatchResult {
  if (patch.version <= state.version) return { status: "stale" };
  if (patch.version > state.version + 1) return { status: "gap" };

  const next = patch.ops.reduce(applyOp, state);
  return { status: "applied", state: { ...next, version: patch.version } };
}

// No default branch: a new PatchOp type is a compile error here until it is
// handled.
function applyOp(state: GreenhouseState, op: PatchOp): GreenhouseState {
  switch (op.type) {
    case "agent:upsert":
      return {
        ...state,
        agents: upsert(state.agents, op.agent, (a) => a.id === op.agent.id),
      };
    case "agent:remove":
      return {
        ...state,
        agents: state.agents.filter((a) => a.id !== op.agentId),
      };
    case "issue:upsert":
      return {
        ...state,
        issues: upsert(
          state.issues,
          op.issue,
          (i) => i.number === op.issue.number,
        ),
      };
    case "issue:remove":
      return {
        ...state,
        issues: state.issues.filter((i) => i.number !== op.issueNumber),
      };
  }
}

// Replaces in place to keep the order stable, appends otherwise.
function upsert<T>(
  items: T[],
  item: T,
  matches: (existing: T) => boolean,
): T[] {
  const index = items.findIndex(matches);
  if (index === -1) return [...items, item];
  return items.map((existing, i) => (i === index ? item : existing));
}
