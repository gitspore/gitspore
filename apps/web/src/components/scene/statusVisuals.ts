import type { AgentStatus } from "@gitspore/shared";
import type { WiltStage } from "@/lib/store/wilting";

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
export const STATUS_VISUALS: Record<AgentStatus, StatusVisual> = {
  starting: { plant: "working", growth: 0 },
  working: { plant: "working", growth: 0.5 },
  needs_input: { plant: "waiting2", growth: 0.5 },
  error: { plant: "error", growth: 0.5 },
  done: { plant: "done", growth: 0.5 },
  merged: { plant: "merged", growth: 0.5 },
};

// waiting plant's look by waited time
// (lib/store/wilting.ts):
// first upright, after 15 s drooping, after 60 s yellow
export const WILT_PLANTS: Record<WiltStage, PlantState> = {
  pulse: "waiting1",
  droop: "waiting2",
  yellow: "waiting3",
};

// The rim ring's colour (a key of tokens' color.status) by agent status;
// no ring while the plant alone says enough
export type RingColor = "waiting" | "error" | "review";

export const RING_COLORS: Record<AgentStatus, RingColor | null> = {
  starting: null,
  working: null,
  needs_input: "waiting",
  error: "error",
  done: "review",
  merged: null,
};
