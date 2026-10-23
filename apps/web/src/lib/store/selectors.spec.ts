import {
  OVERVIEW_AGENT_ID,
  type Agent,
  type GreenhouseState,
  type Issue,
} from "@gitspore/shared";
import type { GreenhouseClient } from "../client/GreenhouseClient";
import { agent as baseAgent } from "../mock/scenarioFixtures";
import { createGreenhouseStore } from "./greenhouseStore";
import {
  agentByKey,
  agentBySlot,
  freeSlots,
  issueTitle,
  needsInputCount,
  openIssuesWithoutAgent,
  selectAgents,
} from "./selectors";

function agent(overrides: Partial<Agent> = {}): Agent {
  return { ...baseAgent, ...overrides };
}

function issue(number: number): Issue {
  return {
    number,
    title: `Issue ${number}`,
    url: `https://x/${number}`,
    labels: [],
  };
}

function storeWith(server: Partial<GreenhouseState> | null) {
  const client = {
    getStatus: () => ({ kind: "connected" }) as const,
  } as GreenhouseClient;
  const store = createGreenhouseStore(client, "live");
  if (server)
    store
      .getState()
      .applySnapshot({ version: 1, agents: [], issues: [], ...server });
  return store.getState();
}

describe("selectors", () => {
  describe("without a snapshot", () => {
    const state = storeWith(null);

    it("returns the same empty agent list every time", () => {
      expect(selectAgents(state)).toEqual([]);
      expect(selectAgents(state)).toBe(selectAgents(state));
    });

    it("has every slot free and nothing to dispatch", () => {
      expect(freeSlots(state)).toEqual([0, 1, 2, 3, 4, 5]);
      expect(openIssuesWithoutAgent(state)).toEqual([]);
      expect(needsInputCount(state)).toBe(0);
    });
  });

  describe("issueTitle", () => {
    it("finds the title, or gives an empty one for an unknown issue", () => {
      const state = storeWith({ issues: [issue(3)] });

      expect(issueTitle(3)(state)).toBe("Issue 3");
      expect(issueTitle(4)(state)).toBe("");
    });
  });

  describe("agentBySlot", () => {
    it("finds the agent in a slot", () => {
      const a2 = agent({ id: "a2", slotIndex: 2 });
      const state = storeWith({ agents: [agent({ slotIndex: 0 }), a2] });

      expect(agentBySlot(2)(state)).toBe(a2);
    });

    it("returns null for an empty slot", () => {
      const state = storeWith({ agents: [agent({ slotIndex: 0 })] });

      expect(agentBySlot(1)(state)).toBeNull();
    });
  });

  describe("agentByKey", () => {
    it("finds the pot on keys 1–6 and the overview on 0", () => {
      const pot = agent({ id: "a1", slotIndex: 2 });
      const overview = agent({ id: OVERVIEW_AGENT_ID, slotIndex: null });
      const state = storeWith({ agents: [pot, overview] });

      expect(agentByKey(3)(state)).toBe(pot);
      expect(agentByKey(0)(state)).toBe(overview);
      expect(agentByKey(1)(state)).toBeNull();
    });
  });

  describe("freeSlots", () => {
    it("leaves out the slots with an agent", () => {
      const state = storeWith({
        agents: [
          agent({ id: "a1", slotIndex: 1 }),
          agent({ id: "a2", slotIndex: 4 }),
        ],
      });

      expect(freeSlots(state)).toEqual([0, 2, 3, 5]);
    });

    it("ignores an agent without a slot", () => {
      const state = storeWith({
        agents: [agent({ slotIndex: null, issueNumber: null })],
      });

      expect(freeSlots(state)).toEqual([0, 1, 2, 3, 4, 5]);
    });
  });

  describe("needsInputCount", () => {
    it("counts the agents that wait for the user", () => {
      const state = storeWith({
        agents: [
          agent({ id: "a1", slotIndex: 0, status: "needs_input" }),
          agent({ id: "a2", slotIndex: 1, status: "working" }),
          agent({ id: "a3", slotIndex: 2, status: "needs_input" }),
        ],
      });

      expect(needsInputCount(state)).toBe(2);
    });
  });

  describe("openIssuesWithoutAgent", () => {
    it("leaves out issues an agent works on", () => {
      const state = storeWith({
        agents: [agent({ issueNumber: 2 })],
        issues: [issue(1), issue(2), issue(3)],
      });

      expect(openIssuesWithoutAgent(state)).toEqual([issue(1), issue(3)]);
    });
  });
});
