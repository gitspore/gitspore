import type { Agent, GreenhouseState, IsoTimestamp } from "@gitspore/shared";
import type { Scenario, ScenarioEntry } from "./scenario";

function shiftIso(iso: IsoTimestamp, offset: number): IsoTimestamp {
  // An unparsable timestamp gives NaN, and toISOString() throws on it.
  return new Date(Date.parse(iso) + offset).toISOString();
}

function shiftAgent(agent: Agent, offset: number): Agent {
  return {
    ...agent,
    statusSince: shiftIso(agent.statusSince, offset),
    startedAt: shiftIso(agent.startedAt, offset),
  };
}

function shiftState(state: GreenhouseState, offset: number): GreenhouseState {
  return {
    ...state,
    agents: state.agents.map((agent) => shiftAgent(agent, offset)),
  };
}

function shiftEntry(entry: ScenarioEntry, offset: number): ScenarioEntry {
  switch (entry.event) {
    case "state:snapshot":
      return { ...entry, payload: shiftState(entry.payload, offset) };
    case "state:patch":
      return {
        ...entry,
        payload: {
          ...entry.payload,
          ops: entry.payload.ops.map((op) =>
            op.type === "agent:upsert"
              ? { ...op, agent: shiftAgent(op.agent, offset) }
              : op,
          ),
        },
      };
    case "terminal:data":
    case "terminal:exit":
    case "error":
      return entry;
    default: {
      // A new event type must be handled above, or this stops compiling.
      const unhandled: never = entry;
      return unhandled;
    }
  }
}

/**
 * Returns a copy of the scenario with every timestamp moved by `offset` ms.
 * The anchor moves with them, so it still names the moment the timestamps
 * refer to. The input is never mutated: scenarios are shared singletons.
 */
export function shiftScenario(scenario: Scenario, offset: number): Scenario {
  return {
    ...scenario,
    anchor: shiftIso(scenario.anchor, offset),
    snapshot: shiftState(scenario.snapshot, offset),
    events: scenario.events.map((entry) => shiftEntry(entry, offset)),
  };
}
