import type { Issue, PullRequest } from "@gitspore/shared";
import { Octokit } from "@octokit/rest";
import { GitHubError } from "./github-error";
import { GitHubRepo } from "./parse-remote";

// One entry of GitHub's answer to "list the issues of a repo", typed by
// Octokit. Read from the inside out: the return type of listForRepo, awaited
// (it is a Promise), its `data` (an array), one element of that array.
type GitHubIssue = Awaited<
  ReturnType<Octokit["rest"]["issues"]["listForRepo"]>
>["data"][number];

// The fields toIssue reads. Both the issue list and the single issue
// (getIssue) have them.
type GitHubIssueFields = Pick<
  GitHubIssue,
  "number" | "title" | "html_url" | "labels"
>;

// GitHub sends at most 100 entries per answer; more need page 2, 3, ...
// A page with fewer entries is the last one.
const PER_PAGE = 100;

// What an answer looked like the last time GitHub sent it. The ETag is
// GitHub's fingerprint of that answer: sent back as `if-none-match`, GitHub
// answers 304 Not Modified (no body, doesn't count against the rate limit) as
// long as the answer is the same.
type CachedAnswer = { etag: string; data: unknown };

/** An issue with its text, for starting an agent on it. */
export type IssueDetails = Issue & { body: string };

/**
 * The only place that talks to GitHub's REST API. Knows nothing about Nest,
 * timers or the state; the GitHub service decides when to ask and what to do
 * with the answer.
 *
 * Remembers answers between calls (`answers`), so one instance belongs to one
 * repo and one token. A new token or repo needs a new instance.
 */
export class GitHubApi {
  private readonly octokit: Octokit;
  // What was asked → its ETag and content. Keys look like `issues/2` (page 2
  // of the issue list) or `pulls/spore/42-fix-login` (a branch's pull request).
  private readonly answers = new Map<string, CachedAnswer>();

  // `fetch` is only passed in tests, to answer instead of GitHub. Without it,
  // Octokit uses Node's own fetch. The token goes to Octokit and is not kept
  // anywhere else in this class.
  constructor(
    token: string,
    private readonly repo: GitHubRepo,
    fetch?: typeof globalThis.fetch,
  ) {
    this.octokit = new Octokit({ auth: token, request: { fetch } });
  }

  /**
   * The open issues of the repo, pull requests left out.
   *
   * `{ changed: false }` when nothing changed since the last call, so the
   * caller can skip the diff. The first call always reports a change.
   *
   * Every page is asked with its own ETag: an edit to an old issue changes
   * only the page it is on, while page 1 still answers 304. So "unchanged"
   * means every page answered 304.
   *
   * Throws a GitHubError; see toGitHubError for the codes.
   */
  async openIssues(): Promise<
    { changed: false } | { changed: true; issues: Issue[] }
  > {
    // The raw entries of all pages, in GitHub's order.
    const all: GitHubIssue[] = [];
    // Becomes true as soon as one page brought new data.
    let changed = false;

    // No end condition in the head: the loop ends with `break` below, at the
    // first page that is not full.
    for (let page = 1; ; page++) {
      const result = await this.conditional(`issues/${page}`, (headers) =>
        this.octokit.rest.issues.listForRepo({
          owner: this.repo.owner,
          repo: this.repo.repo,
          state: "open",
          per_page: PER_PAGE,
          page,
          headers,
        }),
      );
      if (result.changed) changed = true;
      all.push(...result.data);

      // Counted before pull requests are filtered out: they fill pages too.
      // A full page of 97 issues and 3 pull requests still has a next page.
      if (result.data.length < PER_PAGE) break;
    }

    if (!changed) return { changed: false };

    return {
      changed: true,
      // GitHub's issues endpoint lists pull requests too (to GitHub every
      // pull request is an issue). They are the entries with `pull_request`.
      issues: all.filter((raw) => !raw.pull_request).map(toIssue),
    };
  }

  /**
   * The newest pull request whose head is `branch` in this repo, in any
   * state, or `null` if there is none.
   *
   * Always the current answer, also when GitHub answered 304: then it is the
   * one remembered from the last call for the branch. The caller compares it
   * with what it knows, so it doesn't matter whether the caller forgot the
   * branch in between.
   */
  async pullRequestFor(branch: string): Promise<PullRequest | null> {
    const result = await this.conditional(`pulls/${branch}`, (headers) =>
      this.octokit.rest.pulls.list({
        owner: this.repo.owner,
        repo: this.repo.repo,
        // GitHub wants `owner:branch`; a branch name alone matches nothing.
        head: `${this.repo.owner}:${branch}`,
        state: "all",
        headers,
      }),
    );
    // Newest first by default. An older closed pull request of the same
    // branch doesn't matter once a new one exists.
    const newest = result.data[0];
    if (!newest) return null;

    return {
      number: newest.number,
      url: newest.html_url,
      state: newest.merged_at
        ? "merged"
        : newest.state === "open"
          ? "open"
          : "closed",
    };
  }

  /**
   * Title, text, URL and labels of one open issue, for starting an agent on
   * it. Asked fresh every time (no ETag): it is called once per dispatch.
   *
   * Throws a GitHubError with `issue_not_found` when the number is missing,
   * closed or a pull request; other failures as in openIssues.
   */
  async getIssue(issueNumber: number): Promise<IssueDetails> {
    let raw;
    try {
      const response = await this.octokit.rest.issues.get({
        owner: this.repo.owner,
        repo: this.repo.repo,
        issue_number: issueNumber,
      });
      raw = response.data;
    } catch (error) {
      // 404: never existed or no access. 410: deleted.
      const status = statusOf(error);
      if (status === 404 || status === 410) {
        throw new GitHubError(
          "issue_not_found",
          `Issue #${issueNumber} does not exist`,
        );
      }
      throw toGitHubError(error);
    }

    if (raw.pull_request) {
      throw new GitHubError(
        "issue_not_found",
        `#${issueNumber} is a pull request, not an issue`,
      );
    }
    if (raw.state !== "open") {
      throw new GitHubError(
        "issue_not_found",
        `Issue #${issueNumber} is closed`,
      );
    }

    return { ...toIssue(raw), body: raw.body ?? "" };
  }

  // Asks GitHub with the ETag of the last answer to the same question (`key`)
  // and remembers the new one. `changed: false` means GitHub answered 304 and
  // `data` is what was remembered.
  private async conditional<T>(
    key: string,
    request: (
      headers: Record<string, string>,
    ) => Promise<{ data: T; headers: { etag?: string } }>,
  ): Promise<{ changed: boolean; data: T }> {
    const cached = this.answers.get(key);

    try {
      // Only a question asked before has an ETag to send.
      const response = await request(
        cached ? { "if-none-match": cached.etag } : {},
      );

      // Without an ETag there is nothing to compare against next time, so
      // an old entry is dropped.
      const etag = response.headers.etag;
      if (etag) this.answers.set(key, { etag, data: response.data });
      else this.answers.delete(key);

      return { changed: true, data: response.data };
    } catch (error) {
      // Octokit treats 304 as an error and throws, so "nothing changed"
      // arrives here, not as a normal response.
      if (cached && statusOf(error) === 304) {
        // Stored by this method for the same key, so it is a T.
        return { changed: false, data: cached.data as T };
      }
      throw toGitHubError(error);
    }
  }
}

// GitHub's large issue object → the contract's small Issue.
function toIssue(raw: GitHubIssueFields): Issue {
  return {
    number: raw.number,
    title: raw.title,
    // html_url is the page on github.com; `url` would be the API address.
    url: raw.html_url,
    // GitHub sends a label as a plain string or as an object with a name.
    // The type guard (`name is string`) tells TypeScript that the filter
    // removed every undefined, so the result is string[].
    labels: raw.labels
      .map((label) => (typeof label === "string" ? label : label.name))
      .filter((name): name is string => Boolean(name)),
  };
}

/**
 * Turns whatever Octokit threw into a GitHubError with a code the GitHub
 * service can act on:
 *
 * | Answer                                      | Code                  |
 * | ------------------------------------------- | --------------------- |
 * | 401                                         | `github_auth_failed`  |
 * | 403/429 with no requests left / retry-after | `github_rate_limited` |
 * | no answer at all, or 5xx                    | `github_unreachable`  |
 * | anything else (404, 403 without access, …)  | `github_failed`       |
 *
 * Own messages only: Octokit's error carries the request, and with it the
 * token, so nothing of it is passed on.
 */
function toGitHubError(error: unknown): GitHubError {
  const status = statusOf(error);
  const headers = headersOf(error);

  if (status === 401) {
    return new GitHubError("github_auth_failed", "GitHub rejected the token");
  }

  // A 403 is also what GitHub sends for a repo the token may not read, so
  // only the rate-limit headers make it a rate limit.
  const retryAfter = headers["retry-after"];
  const outOfRequests = headers["x-ratelimit-remaining"] === "0";
  if ((status === 403 || status === 429) && (retryAfter || outOfRequests)) {
    // retry-after is in seconds from now; x-ratelimit-reset is a Unix time
    // in seconds. Date wants milliseconds, hence * 1000.
    const retryAt = retryAfter
      ? new Date(Date.now() + Number(retryAfter) * 1000)
      : new Date(Number(headers["x-ratelimit-reset"]) * 1000);
    return new GitHubError(
      "github_rate_limited",
      "GitHub's rate limit is used up",
      retryAt,
    );
  }

  // No status: the request never got an answer (network, DNS, timeout).
  // 5xx: GitHub itself has a problem. Both are worth trying again later.
  if (status === undefined || status >= 500) {
    return new GitHubError("github_unreachable", "GitHub could not be reached");
  }

  return new GitHubError("github_failed", `GitHub answered ${status}`);
}

// A caught error has the type `unknown`: anything can be thrown in
// JavaScript. These two helpers check step by step before reading a field,
// instead of trusting that it is Octokit's RequestError.

function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

function headersOf(error: unknown): Record<string, string | undefined> {
  if (typeof error !== "object" || error === null) return {};
  const headers = (error as { response?: { headers?: unknown } }).response
    ?.headers;
  return typeof headers === "object" && headers !== null
    ? (headers as Record<string, string | undefined>)
    : {};
}
