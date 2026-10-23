import {
  applyPatch,
  type Agent,
  type AgentStatus,
  type GreenhouseState,
  type StatePatch,
} from "@gitspore/shared";
import { getScenario, SCENARIO_NAMES } from "../../../mocks/scenarios";
import { createFakeClock } from "./clock.fake";
import { MockClient } from "./MockClient";
import type { Scenario } from "./scenario";

// What the ticket promises about the scenarios that ship, checked against the
// files themselves.

function patchVersions(scenario: Scenario): number[] {
  return scenario.events.flatMap((entry) =>
    entry.event === "state:patch" ? [entry.payload.version] : [],
  );
}

// Every agent the scenario's patches upsert, in order.
function upserts(scenario: Scenario): Agent[] {
  return scenario.events.flatMap((entry) =>
    entry.event === "state:patch"
      ? entry.payload.ops.flatMap((op) =>
          op.type === "agent:upsert" ? [op.agent] : [],
        )
      : [],
  );
}

describe("the scenarios that ship", () => {
  it.each(SCENARIO_NAMES)("%s loads and passes the validation", (name) => {
    expect(() => getScenario(name)).not.toThrow();
  });

  describe("empty", () => {
    it("has no agents, six issues and nothing that happens", () => {
      const { snapshot, events } = getScenario("empty");

      expect(snapshot.agents).toEqual([]);
      expect(snapshot.issues).toHaveLength(6);
      expect(events).toEqual([]);
    });
  });

  describe("all-states", () => {
    it("shows every status once, from the start", () => {
      const { snapshot, events } = getScenario("all-states");

      expect(snapshot.agents.map((agent) => agent.status).sort()).toEqual(
        (
          [
            "done",
            "error",
            "merged",
            "needs_input",
            "starting",
            "working",
          ] satisfies AgentStatus[]
        ).sort(),
      );
      expect(events).toEqual([]);
    });

    it("shows the pull request of the done and the merged agent", () => {
      const { snapshot } = getScenario("all-states");
      const agentWith = (status: AgentStatus) =>
        snapshot.agents.find((agent) => agent.status === status);

      expect(agentWith("done")?.pullRequest?.state).toBe("open");
      expect(agentWith("merged")?.pullRequest?.state).toBe("merged");
    });
  });

  describe("core-loop", () => {
    // Statuses an agent goes through, with the time of each change.
    function steps() {
      return getScenario("core-loop").events.flatMap((entry) =>
        entry.event === "state:patch"
          ? entry.payload.ops.map((op) => ({
              at: entry.at,
              status: op.type === "agent:upsert" ? op.agent.status : "removed",
            }))
          : [],
      );
    }

    it("goes from start to merged", () => {
      expect(steps().map((step) => step.status)).toEqual([
        "starting",
        "working",
        "needs_input",
        "working",
        "done",
        "merged",
        "removed",
      ]);
    });

    it("holds needs_input for 70 seconds", () => {
      const all = steps();
      const start = all.findIndex((step) => step.status === "needs_input");

      expect(all[start + 1].at - all[start].at).toBe(70_000);
    });

    it("puts the pull request on the agent from done on", () => {
      expect(
        upserts(getScenario("core-loop")).map(
          (agent) => agent.pullRequest?.state ?? null,
        ),
      ).toEqual([null, null, null, null, "open", "merged"]);
    });

    it("removes the agent 5 seconds after merged, like the daemon", () => {
      const all = steps();
      const merged = all.findIndex((step) => step.status === "merged");

      expect(all[merged + 1]).toEqual({
        at: all[merged].at + 5_000,
        status: "removed",
      });
    });

    it("runs through everything in under 5 seconds at speed 60", () => {
      const clock = createFakeClock(
        Date.parse(getScenario("core-loop").anchor),
      );
      const client = new MockClient(getScenario("core-loop"), clock);
      const patches: StatePatch[] = [];
      client.on("state:patch", (patch) => patches.push(patch));
      client.setSpeed(60);
      client.connect();

      clock.advance(4999);

      expect(patches).toHaveLength(
        patchVersions(getScenario("core-loop")).length,
      );
    });
  });

  describe("pr-closed", () => {
    it("goes from start to error and keeps the agent", () => {
      const scenario = getScenario("pr-closed");
      const removed = scenario.events.some(
        (entry) =>
          entry.event === "state:patch" &&
          entry.payload.ops.some((op) => op.type === "agent:remove"),
      );

      expect(upserts(scenario).map((agent) => agent.status)).toEqual([
        "starting",
        "working",
        "done",
        "error",
      ]);
      expect(removed).toBe(false);
    });

    it("ends with the closed pull request and pr_closed", () => {
      const last = upserts(getScenario("pr-closed")).at(-1);

      expect(last?.pullRequest?.state).toBe("closed");
      expect(last?.statusReason?.code).toBe("pr_closed");
    });
  });

  describe("stress", () => {
    it("starts with six agents", () => {
      expect(getScenario("stress").snapshot.agents).toHaveLength(6);
    });

    it("skips exactly one version", () => {
      const versions = patchVersions(getScenario("stress"));
      const gaps = versions.filter(
        (v, i) => i > 0 && v !== versions[i - 1] + 1,
      );

      expect(gaps).toHaveLength(1);
      expect(versions[versions.indexOf(gaps[0]) - 1]).toBe(12);
      expect(gaps[0]).toBe(14);
    });

    it("lets a client recover with state:request after the gap", () => {
      const scenario = getScenario("stress");
      const clock = createFakeClock(Date.parse(scenario.anchor));
      const client = new MockClient(scenario, clock);

      // What the store will do: apply patches, ask for a snapshot on a gap.
      let state: GreenhouseState | null = null;
      let gaps = 0;
      client.on("state:snapshot", (snapshot) => (state = snapshot));
      client.on("state:patch", (patch) => {
        if (!state) return;
        const result = applyPatch(state, patch);
        if (result.status === "applied") {
          state = result.state;
        } else if (result.status === "gap") {
          gaps++;
          client.emit("state:request", {});
        }
      });
      client.connect();

      clock.advance(60_000);

      const versions = patchVersions(scenario);
      expect(gaps).toBe(1);
      expect((state as GreenhouseState | null)?.version).toBe(
        versions[versions.length - 1],
      );
    });
  });
});
