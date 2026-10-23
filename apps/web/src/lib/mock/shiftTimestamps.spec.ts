import type { Agent } from "@gitspore/shared";
import { getScenario } from "../../../mocks/scenarios";
import type { Scenario } from "./scenario";
import { shiftScenario } from "./shiftTimestamps";

const MINUTE = 60_000;

const agent: Agent = {
  id: "agent-1",
  slotIndex: 0,
  issueNumber: 1,
  branch: "spore/1-test",
  worktreePath: "/repo/.worktrees/1-test",
  status: "working",
  statusSince: "2026-10-09T09:00:00.000Z",
  startedAt: "2026-10-09T08:00:00.000Z",
  pullRequest: null,
  statusReason: null,
};

function scenario(events: Scenario["events"] = []): Scenario {
  return {
    name: "test",
    anchor: "2026-10-09T09:30:00.000Z",
    snapshot: {
      version: 1,
      repo: { path: "/mock/repo", baseBranch: "main", github: "on" },
      agents: [agent],
      issues: [{ number: 1, title: "Issue", url: "u", labels: ["bug"] }],
    },
    events,
  };
}

describe("shiftScenario", () => {
  it("moves both timestamps of an agent by exactly the offset", () => {
    const shifted = shiftScenario(scenario(), 5 * MINUTE);

    expect(shifted.snapshot.agents[0]).toEqual({
      ...agent,
      statusSince: "2026-10-09T09:05:00.000Z",
      startedAt: "2026-10-09T08:05:00.000Z",
    });
  });

  it("moves the anchor and leaves name, issues and version alone", () => {
    const shifted = shiftScenario(scenario(), 5 * MINUTE);

    expect(shifted.anchor).toBe("2026-10-09T09:35:00.000Z");
    expect(shifted.name).toBe("test");
    expect(shifted.snapshot.issues).toEqual(scenario().snapshot.issues);
    expect(shifted.snapshot.version).toBe(1);
  });

  it("moves agents in state:snapshot events", () => {
    const [entry] = shiftScenario(
      scenario([
        { at: 0, event: "state:snapshot", payload: scenario().snapshot },
      ]),
      MINUTE,
    ).events;

    expect(entry.event === "state:snapshot" && entry.payload.agents[0]).toEqual(
      {
        ...agent,
        statusSince: "2026-10-09T09:01:00.000Z",
        startedAt: "2026-10-09T08:01:00.000Z",
      },
    );
  });

  it("moves agent:upsert ops and leaves the other ops alone", () => {
    const issue = { number: 2, title: "Other", url: "u", labels: [] };
    const [entry] = shiftScenario(
      scenario([
        {
          at: 10,
          event: "state:patch",
          payload: {
            version: 2,
            ops: [
              { type: "agent:upsert", agent },
              { type: "agent:remove", agentId: "agent-2" },
              { type: "issue:upsert", issue },
              { type: "issue:remove", issueNumber: 3 },
            ],
          },
        },
      ]),
      MINUTE,
    ).events;

    expect(entry).toEqual({
      at: 10,
      event: "state:patch",
      payload: {
        version: 2,
        ops: [
          {
            type: "agent:upsert",
            agent: {
              ...agent,
              statusSince: "2026-10-09T09:01:00.000Z",
              startedAt: "2026-10-09T08:01:00.000Z",
            },
          },
          { type: "agent:remove", agentId: "agent-2" },
          { type: "issue:upsert", issue },
          { type: "issue:remove", issueNumber: 3 },
        ],
      },
    });
  });

  it("returns events without timestamps unchanged", () => {
    const events: Scenario["events"] = [
      {
        at: 1,
        event: "terminal:data",
        payload: { sessionId: "s", chunk: "x" },
      },
      {
        at: 2,
        event: "terminal:exit",
        payload: { sessionId: "s", exitCode: 0 },
      },
      { at: 3, event: "error", payload: { code: "internal", message: "m" } },
    ];

    expect(shiftScenario(scenario(events), MINUTE).events).toEqual(events);
  });

  it("does not mutate its input", () => {
    const input = scenario([
      {
        at: 10,
        event: "state:patch",
        payload: { version: 2, ops: [{ type: "agent:upsert", agent }] },
      },
    ]);
    const copy = structuredClone(input);

    shiftScenario(input, 5 * MINUTE);

    expect(input).toEqual(copy);
  });

  it("returns an equal scenario for offset 0", () => {
    const input = scenario();

    expect(shiftScenario(input, 0)).toEqual(input);
  });

  it("works with a negative offset", () => {
    const shifted = shiftScenario(scenario(), -5 * MINUTE);

    expect(shifted.snapshot.agents[0].statusSince).toBe(
      "2026-10-09T08:55:00.000Z",
    );
  });

  it("keeps the waiting time of the all-states scenario at start", () => {
    const original = getScenario("all-states");
    const now = Date.parse("2030-01-01T12:00:00.000Z");
    const shifted = shiftScenario(original, now - Date.parse(original.anchor));

    const waitingBefore = original.snapshot.agents.map(
      (a) => Date.parse(original.anchor) - Date.parse(a.statusSince),
    );
    const waitingAfter = shifted.snapshot.agents.map(
      (a) => now - Date.parse(a.statusSince),
    );

    expect(original.snapshot.agents.length).toBeGreaterThan(0);
    expect(waitingAfter).toEqual(waitingBefore);
  });
});
