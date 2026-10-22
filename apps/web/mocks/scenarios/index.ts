import { Scenario } from "@/lib/mock/scenario";
import allStates from "./all-states.json";
import coreLoop from "./core-loop.json";
import empty from "./empty.json";
import prClosed from "./pr-closed.json";
import stress from "./stress.json";
import noRepo from "./no-repo.json";
import { validateScenario } from "@/lib/mock/validateScenario";

const RAW_SCENARIOS = {
  empty,
  "all-states": allStates,
  "core-loop": coreLoop,
  "pr-closed": prClosed,
  stress,
  "no-repo": noRepo,
};

export type ScenarioName = keyof typeof RAW_SCENARIOS;
export const SCENARIO_NAMES = Object.keys(RAW_SCENARIOS) as ScenarioName[];

export function isScenarioName(value: string): value is ScenarioName {
  return Object.hasOwn(RAW_SCENARIOS, value);
}

export function getScenario(name: ScenarioName): Scenario {
  const scenario = validateScenario(RAW_SCENARIOS[name], `${name}.json`);

  if (scenario.name !== name) {
    throw new Error(`${name} does not match any scenario`);
  }

  return scenario;
}
