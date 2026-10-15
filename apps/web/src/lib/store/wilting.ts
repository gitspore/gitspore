import type { Agent } from "@gitspore/shared";

/**
 * How far a waiting plant has wilted (design-docs/concept.md, "How to read a
 * plant"): the rim pulses for the first 15 s, then the plant droops, and
 * after 60 s it yellows.
 */
export type WiltStage = "pulse" | "droop" | "yellow";

const DROOP_AFTER_MS = 15_000;
const YELLOW_AFTER_MS = 60_000;

/**
 * How long the agent has been waiting for the user, in ms, or null if it is
 * not waiting. `now` comes from useNow() (the client's clock), not from
 * Date.now(), so the mock plays it at speed.
 */
export function waitingMs(agent: Agent, now: number): number | null {
  if (agent.status !== "needs_input") return null;
  // A clock that is a little behind the daemon must not give negative times.
  return Math.max(0, now - Date.parse(agent.statusSince));
}

/** The wilting stage of a waiting agent, null if it is not waiting. */
export function wiltStage(agent: Agent, now: number): WiltStage | null {
  const waited = waitingMs(agent, now);
  if (waited === null) return null;
  if (waited < DROOP_AFTER_MS) return "pulse";
  if (waited < YELLOW_AFTER_MS) return "droop";
  return "yellow";
}
