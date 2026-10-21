import type { AgentStatus } from "@gitspore/shared";

import type { PlantState } from "./Plant";

//
//
//
// How plant shows agent status:
// which row of Plant's LOOKS table,
// how far grown
// (0 = small, 0.5 = looks's size, 1 = tall)
export type StatusVisual = { plant: PlantState; growth: number };

// Every status
// Needs input: a fixed wilt stage until wilting stages come
export const STATUS_VISUALS: Record<AgentStatus, StatusVisual> = {
  starting: { plant: "working", growth: 0 },
  working: { plant: "working", growth: 0.5 },
  needs_input: { plant: "waiting2", growth: 0.5 },
  error: { plant: "error", growth: 0.5 },
  done: { plant: "done", growth: 0.5 },
  merged: { plant: "merged", growth: 0.5 },
};
