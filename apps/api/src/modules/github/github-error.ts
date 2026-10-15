import type { ErrorCode } from "@gitspore/shared";

// The codes of the shared contract that come from GitHub. The gateway sends
// them to the browser as they are.
export type GitHubErrorCode = Extract<
  ErrorCode,
  | "github_sync_disabled"
  | "github_unreachable"
  | "github_rate_limited"
  | "github_auth_failed"
  | "github_failed"
  | "issue_not_found"
>;

export class GitHubError extends Error {
  constructor(
    readonly code: GitHubErrorCode,
    message: string,
    /** Only for github_rate_limited: when polling may start again. */
    readonly retryAt?: Date,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}
