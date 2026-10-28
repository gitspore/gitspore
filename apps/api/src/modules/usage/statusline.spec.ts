import { parseStatusline } from "./statusline";

// The fields the daemon reads, from the example in Claude Code's statusline
// docs.
const EXAMPLE = {
  session_id: "abc123",
  transcript_path: "/home/dev/.claude/projects/repo/abc123.jsonl",
  model: { id: "claude-opus-5-5", display_name: "Opus" },
  context_window: { used_percentage: 8, remaining_percentage: 92 },
  rate_limits: {
    five_hour: { used_percentage: 23.5, resets_at: 1738425600 },
    seven_day: { used_percentage: 41.2, resets_at: 1738857600 },
  },
};

describe("parseStatusline", () => {
  it("reads every field the daemon needs", () => {
    expect(parseStatusline(EXAMPLE)).toEqual({
      sessionId: "abc123",
      transcriptPath: "/home/dev/.claude/projects/repo/abc123.jsonl",
      contextPercent: 8,
      model: "Opus",
      limits: {
        fiveHour: { usedPercent: 23.5, resetsAt: "2025-02-01T16:00:00.000Z" },
        sevenDay: { usedPercent: 41.2, resetsAt: "2025-02-06T16:00:00.000Z" },
      },
    });
  });

  it.each([null, "text", 42, [EXAMPLE]])("refuses %p", (payload) => {
    expect(parseStatusline(payload)).toBeNull();
  });

  it("gives null for each field that is missing", () => {
    expect(parseStatusline({})).toEqual({
      sessionId: null,
      transcriptPath: null,
      contextPercent: null,
      model: null,
      limits: "absent",
    });
  });

  it.each([
    ["context_window.used_percentage is null", { used_percentage: null }],
    ["context_window.used_percentage is text", { used_percentage: "8" }],
    ["context_window is missing", undefined],
  ])("has no context percentage when %s", (_, contextWindow) => {
    expect(
      parseStatusline({ ...EXAMPLE, context_window: contextWindow })
        ?.contextPercent,
    ).toBeNull();
  });

  it("says rate_limits is absent (API key, before the first answer)", () => {
    const withoutLimits = { ...EXAMPLE, rate_limits: undefined };

    expect(parseStatusline(withoutLimits)?.limits).toBe("absent");
  });

  it("drops a window Claude Code no longer reports (after its reset)", () => {
    const limits = parseStatusline({
      ...EXAMPLE,
      rate_limits: { seven_day: EXAMPLE.rate_limits.seven_day },
    })?.limits;

    expect(limits).toEqual({
      fiveHour: null,
      sevenDay: { usedPercent: 41.2, resetsAt: "2025-02-06T16:00:00.000Z" },
    });
  });

  it.each([
    ["no percentage", { resets_at: 1738425600 }],
    ["no reset time", { used_percentage: 23.5 }],
    ["a reset time as text", { used_percentage: 23.5, resets_at: "soon" }],
    ["a reset time out of range", { used_percentage: 23.5, resets_at: 1e20 }],
    ["a percentage that isn't finite", { used_percentage: Infinity }],
  ])("drops a window with %s", (_, fiveHour) => {
    expect(
      parseStatusline({ ...EXAMPLE, rate_limits: { five_hour: fiveHour } })
        ?.limits,
    ).toEqual({ fiveHour: null, sevenDay: null });
  });

  it("keeps 100 % and decimals as they are", () => {
    const limits = parseStatusline({
      rate_limits: { five_hour: { used_percentage: 100, resets_at: 1 } },
    })?.limits;

    expect(limits).toMatchObject({ fiveHour: { usedPercent: 100 } });
  });

  it("gives null for an empty session id, log path or model name", () => {
    expect(
      parseStatusline({
        session_id: "",
        transcript_path: "",
        model: { display_name: "" },
      }),
    ).toMatchObject({ sessionId: null, transcriptPath: null, model: null });
  });
});
