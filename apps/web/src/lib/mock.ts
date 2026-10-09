import type { Agent, Issue } from "@gitspore/shared";

// Fake data

const now = new Date().toISOString();

function agent(
  slotIndex: number,
  issueNumber: number,
  status: Agent["status"],
): Agent {
  return {
    id: `agent-${slotIndex}`,
    slotIndex,
    issueNumber,
    branch: `spore/${issueNumber}`,
    worktreePath: `/tmp/gitspore/${issueNumber}`,
    status,
    statusSince: now,
    startedAt: now,
  };
}

export const mockAgents: Agent[] = [
  agent(0, 12, "working"),
  agent(1, 15, "needs_input"),
  agent(2, 18, "error"),
  agent(3, 21, "done"),
  agent(4, 9, "merged"),
];

export const mockIssues: Issue[] = [
  { number: 9, title: "readme-setup", url: "", labels: [] },
  { number: 12, title: "login-redirect", url: "", labels: [] },
  { number: 15, title: "avatar-upload", url: "", labels: [] },
  { number: 18, title: "flaky-ci", url: "", labels: [] },
  { number: 21, title: "dark-mode-toggle", url: "", labels: [] },
];
