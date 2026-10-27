import type { Agent, GreenhouseState, Issue } from "@gitspore/shared";
import { checkDispatch, checkStop } from "./agent-request";

const issue = (number: number): Issue => ({
  number,
  title: `Issue ${number}`,
  url: `https://github.com/owner/repo/issues/${number}`,
  labels: [],
});

const agent = (overrides: Partial<Agent>): Agent => ({
  id: "agent-1",
  slotIndex: 0,
  issueNumber: 42,
  branch: "spore/42-issue-42",
  worktreePath: "/worktrees/42-issue-42",
  status: "working",
  statusSince: "2026-10-21T10:00:00.000Z",
  startedAt: "2026-10-21T10:00:00.000Z",
  pullRequest: null,
  statusReason: null,
  usage: null,
  ...overrides,
});

const state = (agents: Agent[] = []): GreenhouseState => ({
  version: 1,
  repo: { path: "/repo", baseBranch: "main", github: "on" },
  agents,
  issues: [issue(42), issue(43)],
  plan: null,
  repoTokens: null,
});

// The code of the error an action throws.
function codeOf(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

describe("checkDispatch", () => {
  it("gives the slot and the issue of a valid request", () => {
    expect(checkDispatch({ issueNumber: 42, slotIndex: 1 }, state())).toEqual({
      slotIndex: 1,
      issue: issue(42),
    });
  });

  it.each([
    undefined,
    null,
    "42",
    {},
    { issueNumber: "42", slotIndex: 0 },
    { issueNumber: 0, slotIndex: 0 },
    { issueNumber: -1, slotIndex: 0 },
    { issueNumber: 1.5, slotIndex: 0 },
    { issueNumber: 42, slotIndex: "0" },
    { issueNumber: 42, slotIndex: Number.NaN },
  ])("refuses %p as invalid_payload", (payload) => {
    expect(codeOf(() => checkDispatch(payload, state()))).toBe(
      "invalid_payload",
    );
  });

  it.each([-1, 6, 100])("refuses slot %p as slot_unavailable", (slotIndex) => {
    expect(
      codeOf(() => checkDispatch({ issueNumber: 42, slotIndex }, state())),
    ).toBe("slot_unavailable");
  });

  it("refuses a slot that has an agent, also a starting one", () => {
    const busy = state([
      agent({ slotIndex: 2, issueNumber: 43, status: "starting" }),
    ]);

    expect(
      codeOf(() => checkDispatch({ issueNumber: 42, slotIndex: 2 }, busy)),
    ).toBe("slot_unavailable");
  });

  it("refuses an issue that already has an agent", () => {
    const busy = state([agent({ slotIndex: 0, issueNumber: 42 })]);

    expect(
      codeOf(() => checkDispatch({ issueNumber: 42, slotIndex: 1 }, busy)),
    ).toBe("issue_taken");
  });

  it("refuses an issue that is not in the list", () => {
    expect(
      codeOf(() => checkDispatch({ issueNumber: 99, slotIndex: 0 }, state())),
    ).toBe("issue_not_found");
  });

  it("is not blocked by the overview agent", () => {
    const withOverview = state([
      agent({ id: "overview", slotIndex: null, issueNumber: null }),
    ]);

    expect(() =>
      checkDispatch({ issueNumber: 42, slotIndex: 0 }, withOverview),
    ).not.toThrow();
  });
});

describe("checkStop", () => {
  it("gives the agent id and removeWorktree", () => {
    expect(checkStop({ agentId: "agent-1", removeWorktree: true })).toEqual({
      agentId: "agent-1",
      removeWorktree: true,
    });
  });

  it.each([
    undefined,
    {},
    { agentId: 1, removeWorktree: true },
    { agentId: "agent-1" },
    { agentId: "agent-1", removeWorktree: "yes" },
  ])("refuses %p as invalid_payload", (payload) => {
    expect(codeOf(() => checkStop(payload))).toBe("invalid_payload");
  });
});
