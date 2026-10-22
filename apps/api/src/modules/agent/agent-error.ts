import type { ErrorCode, JsonValue, ServerError } from "@gitspore/shared";
import { GitError } from "simple-git";
import { GitHubError } from "../github/github-error";
import { TerminalError } from "../terminal/terminal-error";
import { WorktreeError } from "../worktree/worktree-error";

type Context = { [key: string]: JsonValue };

/** A refusal of the agent module itself, already in the shared contract. */
export class AgentError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly context?: Context,
  ) {
    super(message);
    this.name = "AgentError";
  }
}

/**
 * Turns whatever a dispatch or stop threw into an error of the shared
 * contract, for the ack or the `error` event. `internal` means a bug: the
 * caller logs it.
 */
export function toServerError(error: unknown): ServerError {
  if (error instanceof AgentError) {
    return withContext(error.code, error.message, error.context);
  }
  if (error instanceof GitHubError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof WorktreeError) {
    return error.code === "push_failed"
      ? { code: "git_push_failed", message: error.message }
      : withContext("git_failed", error.message, { reason: error.code });
  }
  if (error instanceof TerminalError) {
    return {
      code: error.code === "claude_not_found" ? "claude_not_found" : "internal",
      message: error.message,
    };
  }
  if (error instanceof GitError) {
    return { code: "git_failed", message: error.message };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { code: "internal", message };
}

function withContext(
  code: ErrorCode,
  message: string,
  context?: Context,
): ServerError {
  return context === undefined ? { code, message } : { code, message, context };
}
