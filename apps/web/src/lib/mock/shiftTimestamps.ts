import type {
  Agent,
  GreenhouseState,
  IsoTimestamp,
  PatchOp,
  PlanUsage,
  UsageLimit,
} from "@gitspore/shared";

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

function shiftPlan(plan: PlanUsage | null, offset: number): PlanUsage | null {
  if (plan === null) return null;
  const shiftLimit = (limit: UsageLimit | null): UsageLimit | null =>
    limit && { ...limit, resetsAt: shiftIso(limit.resetsAt, offset) };

  return {
    fiveHour: shiftLimit(plan.fiveHour),
    sevenDay: shiftLimit(plan.sevenDay),
  };
}

function shiftOp(op: PatchOp, offset: number): PatchOp {
  switch (op.type) {
    case "agent:upsert":
      return { ...op, agent: shiftAgent(op.agent, offset) };
    case "plan:set":
      return { ...op, plan: shiftPlan(op.plan, offset) };
    default:
      return op;
  }
}

function shiftState(state: GreenhouseState, offset: number): GreenhouseState {
  return {
    ...state,
    agents: state.agents.map((agent) => shiftAgent(agent, offset)),
    plan: shiftPlan(state.plan, offset),
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
          ops: entry.payload.ops.map((op) => shiftOp(op, offset)),
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
