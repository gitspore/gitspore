import { Agent } from "@gitspore/shared";
import { ScenarioEntry, Scenario } from "./scenario";

export const agent: Agent = {
  id: "a1",
  slotIndex: 0,
  issueNumber: 1,
  branch: "spore/1-x",
  worktreePath: "/w",
  status: "working",
  statusSince: "2026-10-09T09:00:00.000Z",
  startedAt: "2026-10-09T09:00:00.000Z",
  pullRequest: null,
  statusReason: null,
  usage: null,
};

export const ANCHOR = "2026-10-09T09:30:00.000Z";

export function data(at: number, chunk: string): ScenarioEntry {
  return { at, event: "terminal:data", payload: { sessionId: "s", chunk } };
}

// `agents`: the snapshot's agents, by default the one agent above in slot 0.
export function makeScenario(
  events: ScenarioEntry[] = [],
  agents: Agent[] = [agent],
): Scenario {
  return {
    name: "test",
    anchor: ANCHOR,
    snapshot: {
      version: 1,
      repo: { path: "/mock/repo", baseBranch: "main", github: "on" },
      agents,
      issues: [],
      plan: null,
    },
    events,
  };
}
