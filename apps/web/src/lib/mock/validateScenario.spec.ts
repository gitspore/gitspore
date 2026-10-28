import { agent, makeScenario } from "./scenarioFixtures";
import { validateScenario } from "./validateScenario";

describe("validateScenario", () => {
  it("returns a valid scenario", () => {
    const scenario = makeScenario([
      {
        at: 5,
        event: "terminal:data",
        payload: { sessionId: "s", chunk: "x" },
      },
    ]);

    expect(validateScenario(scenario, "test.json")).toEqual(scenario);
  });

  it("takes the repo's token total and its op, null when left out", () => {
    const scenario = makeScenario([
      {
        at: 5,
        event: "state:patch",
        payload: {
          version: 2,
          ops: [{ type: "repoTokens:set", repoTokens: 21_000_000 }],
        },
      },
    ]);
    // A scenario from before the total.
    const older: Record<string, unknown> = { ...scenario.snapshot };
    delete older.repoTokens;

    expect(validateScenario(scenario, "test.json")).toEqual(scenario);
    expect(
      validateScenario({ ...scenario, snapshot: older }, "old.json").snapshot
        .repoTokens,
    ).toBeNull();
  });

  it("names the file in the error", () => {
    expect(() => validateScenario({}, "broken.json")).toThrow(
      'Invalid scenario "broken.json"',
    );
  });

  it("points to the place of a wrong value", () => {
    const broken = makeScenario();
    broken.snapshot.agents = [
      { ...agent, status: "sleeping" as unknown as typeof agent.status },
    ];

    expect(() => validateScenario(broken, "broken.json")).toThrow(
      /snapshot[\s\S]*agents[\s\S]*status/,
    );
  });

  it("rejects a missing field", () => {
    const withoutSnapshot: Partial<ReturnType<typeof makeScenario>> =
      makeScenario();
    delete withoutSnapshot.snapshot;

    expect(() => validateScenario(withoutSnapshot, "broken.json")).toThrow(
      /snapshot/,
    );
  });

  it("rejects an unknown event", () => {
    const broken = makeScenario();
    broken.events = [{ at: 1, event: "agent:explode", payload: {} }] as never;

    expect(() => validateScenario(broken, "broken.json")).toThrow(
      'Invalid scenario "broken.json"',
    );
  });

  it("rejects an anchor that is not a timestamp", () => {
    const broken = { ...makeScenario(), anchor: "yesterday" };

    expect(() => validateScenario(broken, "broken.json")).toThrow(/anchor/);
  });

  it("rejects events that are not sorted by at", () => {
    const broken = makeScenario([
      {
        at: 200,
        event: "terminal:data",
        payload: { sessionId: "s", chunk: "b" },
      },
      {
        at: 100,
        event: "terminal:data",
        payload: { sessionId: "s", chunk: "a" },
      },
    ]);

    expect(() => validateScenario(broken, "broken.json")).toThrow(
      "events must be sorted by at",
    );
  });
});
