import { simpleGit } from "simple-git";
import { GitHubCredentialsProvider } from "./credentials";
import { GitHubApi } from "./github-api";
import { GitHubRepo, parseGitHubRemote } from "./parse-remote";

/**
 * Either a ready GitHubApi for the repo, or why sync is off. The reason goes
 * to the browser as the `message` of `github_sync_disabled`, so it says what
 * to do. It never contains the token.
 */
export type GitHubConnection =
  { api: GitHubApi; repo: GitHubRepo } | { disabled: string };

/**
 * Where the GitHub service gets its API from. A class, not an interface, so
 * Nest can use it as the injection token; tests pass a fake instead and
 * neither git nor gh runs.
 */
export abstract class GitHubSource {
  abstract connect(): Promise<GitHubConnection>;
}

// Returns the URL of the remote, throws when there is none.
type ReadRemote = (repoPath: string, remote: string) => Promise<string>;

/**
 * The first source: the remote `origin` of the repo the daemon works in,
 * and the token from the credentials provider.
 */
export class RepoGitHubSource extends GitHubSource {
  constructor(
    private readonly repoPath: string,
    private readonly credentials: GitHubCredentialsProvider,
    private readonly readRemote: ReadRemote = gitRemoteUrl,
    private readonly remote = "origin",
  ) {
    super();
  }

  // Checks in this order and stops at the first problem: remote, GitHub,
  // token. The token comes last, so gh only runs for a real GitHub repo.
  async connect(): Promise<GitHubConnection> {
    let url: string;
    try {
      url = await this.readRemote(this.repoPath, this.remote);
    } catch {
      return {
        disabled: `The repo has no remote named ${this.remote}, so there is nothing to sync with.`,
      };
    }

    const repo = parseGitHubRemote(url);
    if (!repo) {
      return {
        disabled: `The remote ${this.remote} (${url.trim()}) is not a GitHub repository.`,
      };
    }

    const token = await this.credentials.getToken();
    if (!token) {
      return {
        disabled:
          "No GitHub token. Set GITHUB_TOKEN or log in with `gh auth login`, then restart the daemon.",
      };
    }

    return { api: new GitHubApi(token, repo), repo };
  }
}

async function gitRemoteUrl(repoPath: string, remote: string): Promise<string> {
  // `git remote get-url` fails when the remote doesn't exist; simple-git
  // turns that into a rejected promise.
  const url = await simpleGit(repoPath).remote(["get-url", remote]);
  if (!url) throw new Error(`No URL for remote ${remote}`);
  return url;
}
