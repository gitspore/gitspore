import type { Agent, AgentUsage, Issue } from "@gitspore/shared";
import { agent as baseAgent } from "./mock/scenarioFixtures";
import {
  ACCOUNT_NOTE,
  agentTokens,
  CACHE_NOTE,
  contextTip,
  limitTip,
  formatTokens,
  PAUSED_NOTE,
  REPO_NOTE,
  repoTip,
  resetTime,
} from "./usageTip";

// The rabbit agent's real session log (#42): 26 requests, mostly cache reads.
const USAGE: AgentUsage = {
  contextPercent: 10.2,
  model: "Opus",
  tokens: {
    input: 58,
    output: 18_133,
    cacheRead: 2_159_887,
    cacheWrite: 69_120,
    total: 2_247_198,
  },
};

const withTokens = (overrides: Partial<Agent>, total: number): Agent => ({
  ...baseAgent,
  ...overrides,
  usage: { ...USAGE, tokens: { ...USAGE.tokens, total } },
});

const issue = (number: number, title: string): Issue => ({
  number,
  title,
  url: `https://x/${number}`,
  labels: [],
  body: "",
});

const RESETS_AT = "2026-10-27T13:30:00.000Z";

describe("contextTip", () => {
  it("lists the four kinds, the total, the context and the model", () => {
    expect(contextTip(USAGE)).toEqual({
      title: "Tokens of this agent",
      rows: [
        { label: "Input", value: "58" },
        { label: "Output", value: "18,133" },
        { label: "Cache read", value: "2,159,887" },
        { label: "Cache write", value: "69,120" },
        { label: "Total", value: "2,247,198", total: true },
        { label: "Context used", value: "10 %" },
        { label: "Model", value: "Opus" },
      ],
      notes: [CACHE_NOTE],
    });
  });

  it("leaves out what Claude Code hasn't reported", () => {
    const rows = contextTip({
      ...USAGE,
      contextPercent: null,
      model: null,
    }).rows;

    expect(rows.map((row) => row.label)).toEqual([
      "Input",
      "Output",
      "Cache read",
      "Cache write",
      "Total",
    ]);
  });

  it("explains cache reads only when they are most of it", () => {
    const tokens = {
      input: 100,
      output: 400,
      cacheRead: 300,
      cacheWrite: 200,
      total: 1_000,
    };

    expect(contextTip({ ...USAGE, tokens }).notes).toEqual([]);
  });
});

describe("agentTokens", () => {
  it("names the agents as the window header does, the most first", () => {
    const agents = [
      withTokens({ id: "a", issueNumber: 7 }, 1_000),
      withTokens({ id: "overview", issueNumber: null, slotIndex: null }, 5_000),
    ];

    expect(agentTokens(agents, [issue(7, "Add a rabbit")])).toEqual([
      { name: "Overview", tokens: 5_000 },
      { name: "#7 Add a rabbit", tokens: 1_000 },
    ]);
  });

  it("leaves out agents without tokens", () => {
    const agents = [
      { ...baseAgent, id: "none", usage: null },
      withTokens({ id: "zero" }, 0),
    ];

    expect(agentTokens(agents, [])).toEqual([]);
  });
});

describe("limitTip", () => {
  const agents = [
    { name: "#7 Add a rabbit", tokens: 2_000_000 },
    { name: "Overview", tokens: 247_198 },
  ];

  it("shows used, reset time and the agents' tokens with their sum", () => {
    expect(
      limitTip("fiveHour", { usedPercent: 41.4, resetsAt: RESETS_AT }, agents),
    ).toEqual({
      title: "5-hour limit",
      rows: [
        { label: "Used", value: "41 %" },
        { label: "Resets", value: resetTime("fiveHour", RESETS_AT) },
        { label: "#7 Add a rabbit", value: "2,000,000" },
        { label: "Overview", value: "247,198" },
        { label: "Agents' tokens", value: "2,247,198", total: true },
      ],
      notes: [ACCOUNT_NOTE],
    });
  });

  it("has no token rows without agents", () => {
    const tip = limitTip(
      "sevenDay",
      { usedPercent: 12, resetsAt: RESETS_AT },
      [],
    );

    expect(tip.title).toBe("Weekly limit");
    expect(tip.rows.map((row) => row.label)).toEqual(["Used", "Resets"]);
  });

  it("says that the agents are paused at 100 %", () => {
    const tip = limitTip(
      "fiveHour",
      { usedPercent: 100, resetsAt: RESETS_AT },
      [],
    );

    expect(tip.notes).toEqual([PAUSED_NOTE, ACCOUNT_NOTE]);
  });
});

describe("repoTip", () => {
  it("splits the total into the running agents and earlier sessions", () => {
    const agents = [
      { name: "#7 Add a rabbit", tokens: 2_000_000 },
      { name: "Overview", tokens: 247_198 },
    ];

    expect(repoTip(20_800_000, agents)).toEqual({
      title: "Tokens of this repo",
      rows: [
        { label: "Running agents", value: "2,247,198" },
        { label: "Earlier sessions", value: "18,552,802" },
        { label: "Total", value: "20,800,000", total: true },
      ],
      notes: [REPO_NOTE],
    });
  });

  it("never shows earlier sessions below 0", () => {
    const rows = repoTip(100, [{ name: "Overview", tokens: 150 }]).rows;

    expect(rows[1]).toEqual({ label: "Earlier sessions", value: "0" });
  });
});

describe("formatTokens", () => {
  it.each([
    [58, "58"],
    [701_000, "701k"],
    [2_247_198, "2.2M"],
    [20_800_000, "20.8M"],
  ])("writes %d as %s", (n, text) => {
    expect(formatTokens(n)).toBe(text);
  });
});

describe("resetTime", () => {
  it("adds the day only for the weekly window", () => {
    const time = new Date(RESETS_AT).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const day = new Date(RESETS_AT).toLocaleDateString("en", {
      weekday: "short",
    });

    expect(resetTime("fiveHour", RESETS_AT)).toBe(time);
    expect(resetTime("sevenDay", RESETS_AT)).toBe(`${day} ${time}`);
  });
});
