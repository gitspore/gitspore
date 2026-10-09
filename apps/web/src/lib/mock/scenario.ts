import type {
  GreenhouseState,
  IsoTimestamp,
  ServerToClientEvents,
} from "@gitspore/shared";

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
  /**
   * The moment the timestamps in the file refer to. The mock shifts every
   * timestamp by (now - anchor) when it starts, so an agent waiting since
   * 20 minutes before the anchor has waited 20 minutes at the start.
   */
  anchor: IsoTimestamp;
  snapshot: GreenhouseState;
  events: ScenarioEntry[];
};
