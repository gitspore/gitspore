import type { Agent, ErrorCode } from "@gitspore/shared";

// What the stop dialog says when the daemon refused. The daemon kills the
// agent before it removes the worktree, so after worktree_dirty and
// git_failed the agent is stopped (status error) and only the folder stays.
export function stopErrorText(agent: Agent, code: ErrorCode): string {
  switch (code) {
    case "worktree_dirty":
      return "The worktree has uncommitted changes and was kept. Stop again without removing it, or commit first.";
    case "git_failed":
      return `The worktree of ${agent.branch} can't be removed. The agent is stopped; stop again without removing it.`;
    case "agent_starting":
      return "The agent is still starting. Try again in a moment.";
    case "agent_not_found":
      return "This agent no longer exists.";
    default:
      return "The agent couldn't be stopped and keeps running.";
  }
}
