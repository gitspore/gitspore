import {
  applyPatch,
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
