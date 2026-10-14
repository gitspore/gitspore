import type { Agent, Issue } from "@gitspore/shared";
import type { PlanUsage } from "@/components/shell/UsageMeter";

// Fake data

const now = Date.now();
const secondsAgo = (s: number) => new Date(now - s * 1000).toISOString();

function agent(
  slotIndex: number,
  issueNumber: number,
  status: Agent["status"],
  since = 0,
): Agent {
  return {
    id: `agent-${slotIndex}`,
    slotIndex,
    issueNumber,
    branch: `spore/${issueNumber}`,
    worktreePath: `/tmp/gitspore/${issueNumber}`,
    status,
    statusSince: secondsAgo(since),
    startedAt: secondsAgo(600),
  };
}

export const mockAgents: Agent[] = [
  agent(0, 12, "working"),
  // Waiting for 50 s: emphasized now, stronger after 10 more seconds
  agent(1, 15, "needs_input", 50),
  agent(2, 18, "error"),
  agent(3, 21, "done"),
  agent(4, 9, "merged"),
];

// Plan limits: the 5-hour window in warn, the week in normal. 100% - full state with resetAt time
export const mockUsage: PlanUsage = {
  fiveHour: { percent: 86, resetsAt: new Date(now + 2 * 3600 * 1000).toISOString() },
  week: { percent: 34, resetsAt: new Date(now + 4 * 86400 * 1000).toISOString() },
};

// Worktrees with uncommitted changes: removing them fails with WORKTREE_DIRTY
export const mockDirtyWorktrees = new Set(["spore/12"]);

export const mockIssues: Issue[] = [
  { number: 9, title: "readme-setup", url: "", labels: [] },
  { number: 12, title: "login-redirect", url: "", labels: [] },
  { number: 15, title: "avatar-upload", url: "", labels: [] },
  { number: 18, title: "flaky-ci", url: "", labels: [] },
  { number: 21, title: "dark-mode-toggle", url: "", labels: [] },
  // Not planted yet: they show up in the Issues tab
  { number: 23, title: "info-box", url: "", labels: ["ui", "question"] },
  { number: 25, title: "scene-feasibility", url: "", labels: ["research"] },
  { number: 27, title: "theme-tokens", url: "", labels: ["ui"] },
];
