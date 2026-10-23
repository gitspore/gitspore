import type { AgentStatus, PullRequest, StatusReason } from "@gitspore/shared";

export type PullRequestReaction =
  | { kind: "set"; status: AgentStatus; reason: StatusReason | null }
  | { kind: "merged" }
  | { kind: "keep" };

export function prClosedReason(pullRequest: PullRequest): StatusReason {
  return {
    code: "pr_closed",
    message:
      `Pull request #${pullRequest.number} was closed without merging. ` +
      "Nothing was deleted: reopen it on GitHub, ask the agent for a new " +
      "one, or stop the agent.",
  };
}

// What a changed pull request means for the agent of its branch. The caller
// stores the pull request on the agent in every case; this only decides the
// status.
export function reactToPullRequest(
  status: AgentStatus,
  pullRequest: PullRequest,
): PullRequestReaction {
  // The cleanup is already on its way; nothing moves the agent back.
  if (status === "merged") return { kind: "keep" };

  switch (pullRequest.state) {
    case "open":
      // Claude is still at it, e.g. working in changes asked for in review.
      // Its next Stop hook finds the open PR and sets done.
      return status === "working"
        ? { kind: "keep" }
        : { kind: "set", status: "done", reason: null };
    case "merged":
      return { kind: "merged" };
    case "closed":
      return {
        kind: "set",
        status: "error",
        reason: prClosedReason(pullRequest),
      };
  }
}
