# GitHub module

The daemon's only connection to GitHub. Keeps the open issues of the repo in the state, watches the pull requests of the agents' branches, and gives dispatch the full text of an issue. Every GitHub read goes through `GitHubService`; other modules never create their own Octokit client. It never crashes the daemon, whatever the network, the token or the repo look like.

| File                | Holds                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `github.service.ts` | `GitHubService`: the 15 s poll, `refresh`, error reporting, pull request events, `getIssue` |
| `github-api.ts`     | `GitHubApi`: the Octokit calls with ETag, pagination and error mapping. No Nest, no timers  |
| `github-source.ts`  | `GitHubSource`: remote + token → a `GitHubApi`, or the reason sync is off                   |
| `credentials.ts`    | `GitHubCredentialsProvider`: `GITHUB_TOKEN`, then `gh auth token`                           |
| `parse-remote.ts`   | `parseGitHubRemote(url)`: owner and repo from the three URL forms                           |
| `diff-issues.ts`    | `diffIssues(previous, next)`: two issue lists → `issue:upsert` / `issue:remove` ops         |
| `github-error.ts`   | `GitHubError` with a `code` from the shared `ErrorCode` (see [Errors](#errors))             |
| `github.module.ts`  | Wires the providers; exports `GitHubService`                                                |

The mapping between branch and issue (`branchForIssue`, `issueNumberFromBranch`) lives in `packages/shared/src/branch.ts`, because the worktree service and merge handling need it too.

## Startup

`RepoService` calls `start()` without awaiting it once a repo is known: at startup, or through `restart()` after the setup screen switched repos (#58). The daemon accepts connections meanwhile. Without a repo nothing starts.

1. `git remote get-url origin` in the chosen repo. No remote → sync off.
2. `parseGitHubRemote`: `https://github.com/o/r(.git)`, `git@github.com:o/r(.git)`, `ssh://git@github.com/o/r(.git)`. Anything else (GitLab, a local path) → sync off.
3. Token: `GITHUB_TOKEN` from the environment, otherwise the output of `gh auth token` (5 s timeout), otherwise none → sync off.
4. First poll right away, then every 15 s.

"Sync off" sends one `github_sync_disabled` error whose `message` says what to do. The daemon keeps running; the issue list stays empty.

## One poll

```
GitHubApi.openIssues()          every page with its own ETag
  all pages 304 → nothing
  otherwise     → diffIssues(state.issues, new list) → StateStore.apply → state:patch
then, for every agent branch with BRANCH_PREFIX (at most MAX_SLOTS):
GitHubApi.pullRequestFor(branch)  GET /pulls?head=owner:branch&state=all, with ETag
  304 or same number and state → nothing
  otherwise                     → onPullRequest listeners (GS-48)
```

- Issues come from `GET /repos/{owner}/{repo}/issues?state=open&per_page=100`, page by page until a page has fewer than 100 entries. That count includes pull requests, which the endpoint lists too; they are filtered out afterwards.
- Each page has its own ETag, because editing an old issue changes only its page. "Unchanged" means every page answered 304. A 304 doesn't count against the rate limit.
- An issue that disappears from the list gets `issue:remove`. An agent working on it is not touched.
- Pull requests are checked after the issues in the same poll. So when a merge closes an issue (`Closes #n`), the pull request is checked right away, not a poll later.
- `issues:refresh` from the browser polls immediately and starts the 15 s over. A refresh during a running poll joins that poll instead of starting a second one.

## API

```ts
start(): Promise<void>                       // once, at startup
refresh(): Promise<void>                     // issues:refresh
stop(): void
currentProblem(): ServerError | null         // for clients that connect later
pullRequestFor(branch): PullRequest | null   // last known, no request
getIssue(number): Promise<IssueDetails>      // Issue + body, for dispatch
onError(listener: (error: ServerError) => void)
onPullRequest(listener: (change: { branch, issueNumber, pullRequest }) => void)
```

`PullRequest` is `{ number, url, state: "open" | "closed" | "merged" }`. If a branch has several pull requests, the newest counts.

`getIssue` always asks GitHub fresh (no ETag). It throws `issue_not_found` for a missing (404/410) or closed issue and for a pull request number, and `github_sync_disabled` while sync is off.

## Errors

`GitHubApi` turns every Octokit failure into a `GitHubError`. `GitHubService` reports it to `onError`, and the gateway sends it as `error` to every client.

| Code                   | When                                                     | What the service does                         |
| ---------------------- | -------------------------------------------------------- | --------------------------------------------- |
| `github_sync_disabled` | No remote, not a GitHub remote, no token                 | No polling                                    |
| `github_auth_failed`   | 401                                                      | Sync off until the daemon restarts            |
| `github_rate_limited`  | 403/429 with `x-ratelimit-remaining: 0` or `retry-after` | No request until the reset time, then resumes |
| `github_unreachable`   | No answer (network, DNS, timeout) or 5xx                 | Keeps the last issues, tries again in 15 s    |
| `github_failed`        | Anything else, e.g. 403 without access, 404 repo         | Keeps the last issues, tries again in 15 s    |
| `issue_not_found`      | `getIssue` only                                          | Thrown to the caller                          |

- Each problem is reported **once**. The same code is sent again only after a poll succeeded in between.
- A client that connects while a problem lasts gets it right after the snapshot (`currentProblem()`).
- A refresh while sync is off or paused asks nothing and sends the current problem again, so whoever pressed refresh learns why.
- An unexpected error (a bug, not GitHub) is logged and reported as `github_failed`; polling goes on.

## The token

- Read once in `GitHubSource.connect()` and handed to Octokit. Not kept anywhere else.
- Never logged: errors from `gh` are dropped, and `GitHubApi` writes its own messages instead of passing on Octokit's error, which carries the request headers.
- Never sent to the browser: the `error` events only carry the module's own messages. `github-api.spec.ts` checks that the token appears in no error message or stack.

## Tests

All without GitHub: `GitHubApi` gets a fake `fetch` that returns `Response` objects, `GitHubService` a fake `GitHubApi` and Jest's fake timers, the gateway spec a fake `GitHubService`. `github-source.spec.ts` also reads `origin` from a real temporary repo. Run them with `npm run test:api -- github`.

## Not here

- Login via GitHub device flow: replaces only `GitHubCredentialsProvider`.
- Reacting to merged pull requests (cleanup, status `merged`): GS-48, listening to `onPullRequest`.
- Creating or commenting on issues, webhooks.
