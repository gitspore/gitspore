import type { AgentStatus } from "@gitspore/shared";
import { Circle, Diamond, Flower, Triangle, X } from "lucide-react";
import type { PlantKind } from "@/components/icons/Plant";

// How each status shows in the interface (components.md, "The five states")

export const STATUS_WORD: Record<AgentStatus, string> = {
  starting: "starting",
  working: "growing",
  needs_input: "waiting",
  error: "wilted",
  done: "review",
  merged: "merged",
};

// Status is never shown by colour alone: every status also has a shape
export const STATUS_ICON: Record<AgentStatus, typeof Circle> = {
  starting: Circle,
  working: Circle,
  needs_input: Triangle,
  error: X,
  done: Diamond,
  merged: Flower,
};

// The plant drawn for each status (#101). Starting has none of its own in
// the design: the pot is taken, so it shows the sprout
export const STATUS_PLANT: Record<AgentStatus, PlantKind> = {
  starting: "working",
  working: "working",
  needs_input: "waiting",
  error: "wilted",
  done: "review",
  merged: "merged",
};

export const STATUS_COLOUR: Record<AgentStatus, string> = {
  starting: "text-muted-foreground",
  working: "text-status-working",
  needs_input: "text-status-waiting",
  error: "text-status-error",
  done: "text-status-review",
  merged: "text-status-merged",
};
