import type { GreenhouseState, ServerToClientEvents } from "@gitspore/shared";

type ScenarioEntryMap = {
  [E in keyof ServerToClientEvents]: {
    at: number;
    event: E;
    payload: Parameters<ServerToClientEvents[E]>[0];
  };
};

export type ScenarioEntry = ScenarioEntryMap[keyof ScenarioEntryMap];

export type Scenario = {
  name: string;
  snapshot: GreenhouseState;
  events: ScenarioEntry[];
};
