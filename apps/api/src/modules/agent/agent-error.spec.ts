import { GitError } from "simple-git";
import { GitHubError } from "../github/github-error";
import { TerminalError } from "../terminal/terminal-error";
import { WorktreeError } from "../worktree/worktree-error";
import { AgentError, toServerError } from "./agent-error";

describe("toServerError", () => {
  it("keeps an AgentError with its context", () => {
    const error = new AgentError("slot_unavailable", "Slot 0 is taken", {
      slotIndex: 0,
    });

    expect(toServerError(error)).toEqual({
      code: "slot_unavailable",
      message: "Slot 0 is taken",
      context: { slotIndex: 0 },
    });
  });

  it("leaves out the context when there is none", () => {
    expect(
      toServerError(new AgentError("agent_starting", "Still starting")),
    ).toStrictEqual({ code: "agent_starting", message: "Still starting" });
  });

  it.each([
    [new GitHubError("issue_not_found", "No open issue #9"), "issue_not_found"],
    [new GitHubError("github_unreachable", "Offline"), "github_unreachable"],
    [new WorktreeError("push_failed", "No login"), "git_push_failed"],
    [new WorktreeError("branch_exists", "Exists"), "git_failed"],
    [new TerminalError("claude_not_found", "Install it"), "claude_not_found"],
    [new TerminalError("limit_reached", "Too many"), "internal"],
    [new GitError(undefined, "fatal: no remote"), "git_failed"],
    [new Error("bug"), "internal"],
    ["not even an Error", "internal"],
  ])("turns %p into %s", (error, code) => {
    expect(toServerError(error).code).toBe(code);
  });

  it("names the worktree module's own code in the context", () => {
    expect(toServerError(new WorktreeError("branch_exists", "Exists"))).toEqual(
      {
        code: "git_failed",
        message: "Exists",
        context: { reason: "branch_exists" },
      },
    );
  });
});
