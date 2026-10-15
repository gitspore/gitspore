import type { Agent } from "@gitspore/shared";
import { agent as baseAgent } from "../mock/scenarioFixtures";
import { waitingMs, wiltStage } from "./wilting";

const SINCE = Date.parse(baseAgent.statusSince);

function waiting(): Agent {
  return { ...baseAgent, status: "needs_input" };
}

describe("waitingMs", () => {
  it("is the time since the status changed", () => {
    expect(waitingMs(waiting(), SINCE + 4_000)).toBe(4_000);
  });

  it("is null for an agent that does not wait", () => {
    expect(
      waitingMs({ ...baseAgent, status: "working" }, SINCE + 4_000),
    ).toBeNull();
  });

  it("is never negative", () => {
    expect(waitingMs(waiting(), SINCE - 500)).toBe(0);
  });
});

describe("wiltStage", () => {
  it.each([
    [0, "pulse"],
    [14_999, "pulse"],
    [15_000, "droop"],
    [59_999, "droop"],
    [60_000, "yellow"],
    [600_000, "yellow"],
  ])("after %i ms is %s", (waited, stage) => {
    expect(wiltStage(waiting(), SINCE + waited)).toBe(stage);
  });

  it("is null for an agent that does not wait", () => {
    expect(
      wiltStage({ ...baseAgent, status: "done" }, SINCE + 90_000),
    ).toBeNull();
  });
});
