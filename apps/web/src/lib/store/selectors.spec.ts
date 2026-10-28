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
  focusedAgent,
  agentBySlot,
  freeSlots,
  hasVisibleWindow,
  issueTitle,
  needsInputCount,
  openIssuesWithoutAgent,
  selectAgents,
  showSetup,
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
    body: "",
  };
}

function storeWith(server: Partial<GreenhouseState> | null) {
  const client = {
    getStatus: () => ({ kind: "connected" }) as const,
  } as GreenhouseClient;
  const store = createGreenhouseStore(client, "live");
  if (server)
    store.getState().applySnapshot({
      version: 1,
      repo: null,
      agents: [],
      issues: [],
      plan: null,
      repoTokens: null,
      ...server,
    });
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

  describe("showSetup", () => {
    const repo = { path: "/r", baseBranch: "main", github: "on" } as const;

    it("hides before the first snapshot", () => {
      expect(showSetup(storeWith(null))).toBe(false);
    });

    it("shows while no repo is chosen", () => {
      expect(showSetup(storeWith({ repo: null }))).toBe(true);
    });

    it("hides with a repo, and shows again once the user opens it", () => {
      expect(showSetup(storeWith({ repo }))).toBe(false);
      expect(showSetup({ ...storeWith({ repo }), setupOpen: true })).toBe(true);
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

  describe("focusedAgent", () => {
    it("is the agent of the focused window, or null", () => {
      const a1 = agent({ id: "a1", slotIndex: 0 });
      const client = {
        getStatus: () => ({ kind: "connected" }) as const,
      } as GreenhouseClient;
      const store = createGreenhouseStore(client, "live");
      store.getState().applySnapshot({
        version: 1,
        agents: [a1],
        issues: [],
        repo: null,
        plan: null,
        repoTokens: null,
      });
      expect(focusedAgent(store.getState())).toBeNull();

      store.getState().openWindow("a1");

      expect(focusedAgent(store.getState())).toBe(a1);
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

  describe("hasVisibleWindow", () => {
    // A store whose windows are open for a1 and a2, with only a1 still there
    function withWindows(minimiseA1 = false) {
      const client = {
        getStatus: () => ({ kind: "connected" }) as const,
      } as GreenhouseClient;
      const store = createGreenhouseStore(client, "live");
      store.getState().applySnapshot({
        version: 1,
        repo: null,
        agents: [agent({ id: "a1", slotIndex: 0 })],
        issues: [],
        plan: null,
        repoTokens: null,
      });
      store.getState().openWindow("a1");
      store.getState().openWindow("a2");
      if (minimiseA1) store.getState().toggleMinimised("a1");
      return store.getState();
    }

    it("is true for an open window of an agent that exists", () => {
      expect(hasVisibleWindow(withWindows())).toBe(true);
    });

    it("skips minimised windows and windows whose agent is gone", () => {
      expect(hasVisibleWindow(withWindows(true))).toBe(false);
    });

    it("is false without windows", () => {
      expect(hasVisibleWindow(storeWith({ agents: [agent()] }))).toBe(false);
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
