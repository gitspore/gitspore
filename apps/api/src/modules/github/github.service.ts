import {
  type Issue,
  issueNumberFromBranch,
  MAX_SLOTS,
  type PullRequest,
  type ServerError,
} from "@gitspore/shared";
import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { StateStore } from "../state/state.store";
import { diffIssues } from "./diff-issues";
import type { GitHubApi } from "./github-api";
import { GitHubError, type GitHubErrorCode } from "./github-error";
import { GitHubSource } from "./github-source";

/**
 * How often the issues and the agents' pull requests are asked for. At most
 * 7 requests a poll (issues, six branches), so about 1,700 an hour of the
 * 5,000 GitHub allows; unchanged issues (304) don't count.
 */
export const POLL_INTERVAL_MS = 15_000;

/** A pull request of an agent's branch appeared or changed its state. */
export type PullRequestChange = {
  branch: string;
  issueNumber: number;
  pullRequest: PullRequest;
};

type ErrorListener = (error: ServerError) => void;
type PullRequestListener = (change: PullRequestChange) => void;

/**
 * Keeps the open issues in the state and watches the pull requests of the
 * agents' branches. Every GitHub read of the daemon goes through here
 * (dispatch uses getIssue, merge handling onPullRequest).
 *
 * One poll every POLL_INTERVAL_MS, or right away on refresh():
 * 1. the open issues → diffIssues against the state → StateStore.apply, which
 *    broadcasts `state:patch`;
 * 2. then the pull request of every agent branch. Because this runs after
 *    the issues, an issue closed by a merge (`Closes #n`) is followed by its
 *    pull request check in the same poll.
 *
 * Never throws out of a poll and never stops the daemon. Problems are
 * reported to onError listeners, once per problem: the same code again only
 * after a poll succeeded in between.
 */
@Injectable()
export class GitHubService implements OnModuleDestroy {
  private readonly logger = new Logger(GitHubService.name);

  // null while starting and once sync is off (no remote, no token, 401).
  private api: GitHubApi | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  // The poll that is running, so a refresh doesn't start a second one.
  private running: Promise<void> | null = null;
  // Rate limit: no request to GitHub before this time (ms since 1970).
  private pausedUntil = 0;
  private stopped = false;
  // Counts restarts. Work started for an older repo sees a different number
  // and drops its result instead of writing into the new repo's state.
  private generation = 0;

  // The problem sync has right now, for clients that connect later.
  private problem: ServerError | null = null;
  // The code last sent to the listeners; cleared by a successful poll.
  private reported: GitHubErrorCode | null = null;

  // Last known pull request per agent branch. A branch missing here has
  // not been asked for yet.
  private readonly pullRequests = new Map<string, PullRequest | null>();

  private readonly errorListeners: ErrorListener[] = [];
  private readonly pullRequestListeners: PullRequestListener[] = [];

  constructor(
    private readonly store: StateStore,
    private readonly source: GitHubSource,
  ) {}

  onModuleDestroy(): void {
    this.stop();
  }

  /**
   * Connects and runs the first poll. RepoService calls it once a repo is
   * known: at startup, or after the setup screen through restart().
   */
  async start(): Promise<void> {
    const generation = this.generation;
    const connection = await this.source.connect();
    if (this.stopped || generation !== this.generation) return;
    this.setRepoGitHub("disabled" in connection ? "off" : "on");

    if ("disabled" in connection) {
      this.report("github_sync_disabled", connection.disabled);
      return;
    }

    this.api = connection.api;
    const { owner, repo } = connection.repo;
    this.logger.log(`GitHub sync on for ${owner}/${repo}`);
    await this.poll();
  }

  /**
   * `issues:refresh`: polls right away and starts the 15 s over. While sync
   * is off or paused by the rate limit, nothing is asked; the current
   * problem is sent again instead, so whoever pressed refresh learns why.
   */
  refresh(): Promise<void> {
    if (!this.api || Date.now() < this.pausedUntil) {
      if (this.problem) this.emitError(this.problem);
      return Promise.resolve();
    }
    return this.poll();
  }

  /**
   * Starts over for another repo (#58): forgets the connection, the pull
   * requests and the problem, then connects again. A poll of the old repo
   * that is still running finishes without touching the state.
   */
  restart(): Promise<void> {
    this.generation++;
    this.clearTimer();
    this.api = null;
    this.running = null;
    this.pullRequests.clear();
    this.problemSolved();
    return this.start();
  }

  /** Stops polling for good. A running poll still finishes. */
  stop(): void {
    this.stopped = true;
    this.clearTimer();
  }

  /** The problem sync has right now, or null when it works. */
  currentProblem(): ServerError | null {
    return this.problem;
  }

  /** Last known pull request of a branch; null if none or not asked yet. */
  pullRequestFor(branch: string): PullRequest | null {
    return this.pullRequests.get(branch) ?? null;
  }

  /**
   * Title, text, URL and labels of an open issue, for dispatch. Throws a
   * GitHubError: `issue_not_found` for a closed or missing issue,
   * `github_sync_disabled` when sync is off.
   */
  getIssue(issueNumber: number): Promise<Issue> {
    if (!this.api) {
      return Promise.reject(
        new GitHubError(
          "github_sync_disabled",
          this.problem?.message ?? "GitHub sync has not started yet",
        ),
      );
    }
    return this.api.getIssue(issueNumber);
  }

  findPullRequest(branch: string): Promise<PullRequest | null> {
    if (!this.api) {
      return Promise.reject(
        new GitHubError(
          "github_sync_disabled",
          this.problem?.message ?? "Github sync has not started yet",
        ),
      );
    }
    return this.api.pullRequestFor(branch);
  }

  onError(listener: ErrorListener): void {
    this.errorListeners.push(listener);
  }

  /** GS-48 listens here: a pull request appeared or changed its state. */
  onPullRequest(listener: PullRequestListener): void {
    this.pullRequestListeners.push(listener);
  }

  private poll(): Promise<void> {
    if (!this.running) {
      const run = this.runPoll().finally(() => {
        // After a restart, `running` may already be the new repo's poll.
        if (this.running === run) this.running = null;
      });
      this.running = run;
    }
    return this.running;
  }

  private async runPoll(): Promise<void> {
    const api = this.api;
    if (!api) return;
    const generation = this.generation;
    this.clearTimer();

    let nextIn: number | null = POLL_INTERVAL_MS;
    try {
      await this.syncIssues(api, generation);
      await this.syncPullRequests(api, generation);
      if (generation !== this.generation) return;
      this.problemSolved();
    } catch (error) {
      if (generation !== this.generation) return;
      nextIn = this.handleFailure(error);
    }

    if (nextIn !== null) this.schedule(nextIn);
  }

  private async syncIssues(api: GitHubApi, generation: number): Promise<void> {
    const result = await api.openIssues();
    if (!result.changed || generation !== this.generation) return;

    // Only issues change here. An agent whose issue was closed keeps
    // running; merge handling decides what happens to it.
    const ops = diffIssues(this.store.snapshot().issues, result.issues);
    this.store.apply(ops);
  }

  private async syncPullRequests(
    api: GitHubApi,
    generation: number,
  ): Promise<void> {
    // Only branches the daemon made (`spore/<n>…`); the overview agent in
    // the repo root and foreign branches are left out.
    const branches = [
      ...new Set(this.store.snapshot().agents.map((agent) => agent.branch)),
    ]
      .filter((branch) => issueNumberFromBranch(branch) !== null)
      .slice(0, MAX_SLOTS);

    // Forget branches whose agent is gone.
    for (const branch of this.pullRequests.keys()) {
      if (!branches.includes(branch)) this.pullRequests.delete(branch);
    }

    for (const branch of branches) {
      // The current pull request also on a 304. A branch that came back after
      // its agent left is then reported as it is, not as "nothing".
      const now = await api.pullRequestFor(branch);
      if (generation !== this.generation) return;
      const before = this.pullRequests.get(branch) ?? null;
      this.pullRequests.set(branch, now);

      // A new ETag doesn't mean a new state: a comment changes it too.
      if (now && !samePullRequest(before, now)) {
        const issueNumber = issueNumberFromBranch(branch)!;
        for (const listener of this.pullRequestListeners) {
          listener({ branch, issueNumber, pullRequest: now });
        }
      }
    }
  }

  // Reports the failure and returns when to poll next, or null for never.
  private handleFailure(error: unknown): number | null {
    if (!(error instanceof GitHubError)) {
      // A bug on our side, not GitHub's. Logged in full, since GitHubApi
      // never lets Octokit's errors (with the token) through.
      this.logger.error(error);
      this.report(
        "github_failed",
        "GitHub sync failed unexpectedly; see the daemon log",
      );
      return POLL_INTERVAL_MS;
    }

    switch (error.code) {
      case "github_auth_failed":
        this.api = null;
        this.setRepoGitHub("off");
        this.report(
          error.code,
          "GitHub rejected the token. Sync is off until the daemon restarts with a valid token.",
        );
        return null;

      case "github_rate_limited": {
        const retryAt = error.retryAt?.getTime() ?? 0;
        this.pausedUntil = retryAt;
        this.report(
          error.code,
          retryAt
            ? `GitHub's rate limit is used up. Sync pauses until ${new Date(retryAt).toISOString()}.`
            : error.message,
        );
        return Math.max(retryAt - Date.now(), POLL_INTERVAL_MS);
      }

      default:
        // Unreachable or any other failure: the last known issues stay in
        // the state, the next poll tries again.
        this.report(error.code, error.message);
        return POLL_INTERVAL_MS;
    }
  }

  // The state's repo shows whether sync is on (#58). Only a change becomes a
  // patch.
  private setRepoGitHub(github: "on" | "off"): void {
    const { repo } = this.store.snapshot();
    if (repo && repo.github !== github) {
      this.store.apply([{ type: "repo:github", github }]);
    }
  }

  private report(code: GitHubErrorCode, message: string): void {
    const error: ServerError = { code, message };
    this.problem = error;
    if (this.reported === code) return;

    this.reported = code;
    this.logger.warn(message);
    this.emitError(error);
  }

  private emitError(error: ServerError): void {
    for (const listener of this.errorListeners) listener(error);
  }

  private problemSolved(): void {
    this.problem = null;
    this.reported = null;
    this.pausedUntil = 0;
  }

  private schedule(delay: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.poll(), delay);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

function samePullRequest(a: PullRequest | null, b: PullRequest): boolean {
  return a !== null && a.number === b.number && a.state === b.state;
}
