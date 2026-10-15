export type GitHubErrorCode =
  | "github_unreachable"
  | "github_rate_limited"
  | "github_auth_failed"
  | "github_failed";

export class GitHubError extends Error {
  constructor(
    readonly code: GitHubErrorCode,
    message: string,
    readonly retryAt?: Date,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}
