# Agent module

Turns an issue into a running agent and stops it again: `agent:dispatch` makes a worktree on a pushed `spore/…` branch, writes a task file and starts Claude Code in it; `agent:stop` ends it. While it runs, Claude Code's hooks report its status. Agents live in the `StateStore` (in memory), next to the overview agent. Git and the running processes are the source of truth; there is no database. After a restart the worktrees on disk bring the agents back, without their Claude Code (see [After a restart](#after-a-restart)).

| File                       | Holds                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| `agent.service.ts`         | `AgentService`: `dispatch`, `stop`, the status from hooks and after Claude's exit, watchdog |
| `agent.gateway.ts`         | `agent:dispatch` (with ack) and `agent:stop` (failures as `error` event)                    |
| `agent-request.ts`         | `checkDispatch` and `checkStop`: validation and the slot/issue check, synchronous           |
| `agent-error.ts`           | `AgentError`, and `toServerError`, which turns every error into one of the contract         |
| `task-file.ts`             | `PROMPT` (constant) and `taskFile(issue)`, the text of `.gitspore/task.md`                  |
| `hook-status.ts`           | `parseHookPayload` and `statusFromHook`: hook event → status, pure                          |
| `hook-files.ts`            | `hookSettings`, the content of `.gitspore/settings.json`                                    |
| `pull-request-reaction.ts` | `reactToPullRequest`: a changed pull request → status or merge handling, pure               |
| `hook-script.mjs`          | The script Claude Code runs per hook event; posts it to the daemon. Shipped as build asset  |
| `agent.module.ts`          | Provides `AgentService` and `AgentGateway`; imports State, GitHub, Terminal, Worktree, Hook |
| `agent.e2e.spec.ts`        | Acceptance tests with real git, real PTYs, the fake claude and its hooks                    |

The hook endpoint itself (`POST /hooks/:agentId`, secrets) is in `modules/hooks/`. It only checks and passes events on; what they mean is decided here.

The gateway lives here and not in `GatewayModule`, so the gateway specs there don't start the worktree service. It is still guarded: every gateway on the port shares one Socket.io server, and the middleware in `StateGateway.afterInit` checks every connection.

## Dispatch

```
synchronous  checkDispatch → planFor → agent:upsert "starting"
             ── from here on the call may await ──
async        locator.resolve → getIssue → fetch → leftoverFor
             → create(origin/<base>)  or, for a leftover branch, its worktree / open(branch)
             → ensureExcluded(".gitspore/") → publish (unless origin has the branch)
             → write .gitspore/task.md, hook.json, settings.json → spawn (exec mode)
             → watchdog → ack { agentId }
```

1. **Check and reserve, without awaiting.** `checkDispatch` reads the state: `issueNumber` a positive integer and `slotIndex` an integer (`invalid_payload`), slot in range and free (`slot_unavailable`), no agent on the issue yet (`issue_taken`), issue in the synced list (`issue_not_found`). The agent is upserted as `starting` in the same synchronous run, so a second dispatch for the same slot or issue already sees it. The pot shows before any git command runs.
2. **Branch and folder** come from `WorktreeService.planFor`, with the title from the synced list. `create` gets the same title, so the branch is the one the agent was shown with, even if the issue was renamed on GitHub since the last poll.
3. **Claude first.** `ClaudeLocator.resolve()` runs before any git work, so a missing Claude fails before a branch is pushed. After the first success it answers from its cache.
4. **`getIssue`** fetches body and URL. An issue closed since the last poll gives `issue_not_found`.
5. **Git:** `fetch` updates `origin/<base>`. `leftoverFor` looks for a branch an earlier agent left for the issue (see below). Without one, `create` starts the branch at `origin/<base>`, and still refuses a branch that exists locally or on origin (two dispatches at once). `ensureExcluded` keeps `.gitspore/` out of git, `publish` pushes the branch. The daemon never pulls; the user's checkout stays untouched.
6. **Task file.** Issue number, title, URL, body and the instruction to put `Closes #<n>` into the pull request go into `<worktree>/.gitspore/task.md`. Issue text is user input from GitHub: it is only written to this file, never passed on a command line.
7. **Hook files.** `HookService.issue` makes a secret for the agent. `hook.json` gets `{ url, agentId, secret }`, `settings.json` registers `hook-script.mjs` for every event `statusFromHook` reads (see below). Both are written before the spawn, because Claude runs `SessionStart` right away.
8. **Spawn** in exec mode, cwd the worktree: `claude --settings .gitspore/settings.json --session-id <uuid> "<PROMPT>"`. The settings path is relative and the prompt is constant and contains none of `& | < > ^ % "` (a test enforces it), because `claude.cmd` on Windows runs through `cmd.exe`. The session id is kept for a later `claude --resume`.
9. **Still `starting`**, the watchdog starts, then the ack with the id. The first hook sets the status.

### On a branch an earlier agent left

A `spore/<n>-…` branch for the issue can be left from an agent that was stopped, or from before a restart (#102). The new agent continues on it instead of failing:

| Left                                  | The dispatch …                                                    |
| ------------------------------------- | ----------------------------------------------------------------- |
| branch with its worktree              | starts Claude in that worktree; creates nothing                   |
| local branch, no worktree             | `open`: a new worktree on the branch, its commits kept            |
| branch only on origin                 | `open`: fetches it, a local branch that tracks it, a new worktree |
| local branch that origin doesn't have | as above, then `publish`                                          |

- The branch is found by the issue number, so an issue renamed since still finds its branch. The agent then moves to that branch and folder in a second `agent:upsert`.
- `task.md`, the hook files and the prompt are written as for a new agent. Claude starts fresh, with the earlier commits (and pull request) on the branch.

### Rollback

All or nothing. On any failure after the `starting` upsert, in reverse order, only what this dispatch made:

1. Claude was started: kill it.
2. The worktree was created: `remove({ force, deleteBranch })`, `deleteBranch` only if this dispatch made the local branch. A branch that existed before is never touched; a local copy of a branch only origin had is deleted (origin keeps it).
3. The branch was pushed: `deleteRemoteBranch`. Only a branch that origin didn't have before is pushed, so a branch with a pull request is never deleted.
4. The secret is revoked, then `agent:remove`, so slot and issue are free and a retry works.

A failing rollback step is logged and the next one still runs. The ack carries the original error, not one from the cleanup.

## Status from hooks

Claude Code runs `hook-script.mjs` for each event, with the daemon's own Node (`process.execPath`) in exec form: no shell, so paths with spaces need no quoting. The script reads `hook.json` from `$CLAUDE_PROJECT_DIR/.gitspore/`, posts the event to `POST /hooks/<agentId>` with the secret, and always exits 0 without output, even if the daemon is down: a failing hook must never block Claude.

| Hook event                                                                                              | Status                             |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `SessionStart`                                                                                          | unchanged (satisfies the watchdog) |
| `UserPromptSubmit`, `PreToolUse`, `PostToolUse`                                                         | `working`                          |
| `PermissionRequest`; `Notification` `permission_prompt`, `elicitation_dialog`, `elicitation_url_dialog` | `needs_input`                      |
| `Stop`, and the branch has an **open** PR                                                               | `done`                             |
| `Stop`, otherwise                                                                                       | `needs_input`                      |
| `StopFailure` (API error, usage limit)                                                                  | `error`                            |
| any other event or notification type                                                                    | unchanged                          |

- `idle_prompt` is left out on purpose: it comes about a minute after every `Stop`, also after one with an open PR, and would overwrite `done`.
- The same status twice sends nothing; a change sets `statusSince` and goes out as `agent:upsert`.
- `Stop` asks GitHub for the PR (`statusFromPullRequest`). An event that arrives while GitHub answers wins: a counter per agent drops the older result.
- Events for unknown agents, agents being stopped, and payloads without a string `hook_event_name` are ignored.

### Watchdog

If not a single hook arrives within 60 s of the spawn, the agent becomes `error` with the `statusReason` `no_status`: Claude most likely waits for the trust question in its terminal. It is not killed: once the question is answered, the hooks arrive and the status moves on by itself. Worktrees seem to inherit the trust of their main repo, so trusting the repo once in Claude Code saves the question for all agents. The first readable hook, the exit and stop clear the watchdog.

## When the pull request changes

The GitHub poll reports every new pull request on an agent branch and every new state (`GitHubService.onPullRequest`). The pull request goes on the agent, and `reactToPullRequest` decides the status, in one patch:

| Pull request | Status                                       |
| ------------ | -------------------------------------------- |
| open         | `done`; a `working` agent stays `working`    |
| merged       | `merged`, then cleaned up (see below)        |
| closed       | `error` with `pr_closed`; nothing is deleted |

- A merged agent stays as it is: later PR changes, hooks and Claude's exit don't move it back.
- After `pr_closed` the hooks go on as usual, e.g. when Claude opens a new pull request. A reopened one makes the agent `done` again.
- The `Stop` hook and the exit ask GitHub themselves and put the pull request they find on the agent; a merged one there is left to the poll. Without an answer from GitHub the agent keeps the pull request it has.
- Hooks, the exit and the poll share the counter that lets the newest change win.

### After a merge

1. The agent is `merged` (one patch, with the pull request), and the watchdog is cleared.
2. Nothing happens for 5 s (`bloomMs`), so the bloom can be seen. A stop in that time wins: the cleanup doesn't run.
3. Claude is killed if it still runs, and its secret revoked. Hooks, the exit and a stop no longer change the agent.
4. A worktree with uncommitted changes is kept: the agent stays `merged` with `cleanup_blocked`, until the user stops it. The check runs after the kill, so Claude can't write anything in between.
5. Otherwise `remove({ force, deleteBranch })` deletes the worktree and the local branch; `force`, because a squash merge leaves the branch unmerged in local git. The branch on origin is left to GitHub ("Automatically delete head branches").
6. `agent:remove`: the slot is free.

A failing removal also gives `cleanup_blocked`, with the reason in its message.

## When Claude exits

Hooks can't report an exit, so the exit code and the pull request decide:

| Claude ends …                             | Status                                         |
| ----------------------------------------- | ---------------------------------------------- |
| with exit code ≠ 0                        | `error`                                        |
| with 0, and the branch has an **open** PR | `done`                                         |
| with 0, and no PR                         | `needs_input`                                  |
| with 0, and GitHub can't be asked         | `needs_input`                                  |
| with 0, and the PR is already merged      | `needs_input`; the poll then makes it `merged` |
| after the agent is `merged`               | unchanged                                      |
| because of `agent:stop`                   | unchanged; `stop` takes care of the agent      |

The PR is asked from GitHub directly (`GitHubService.findPullRequest`), not from the last poll: Claude may have opened it seconds ago. The exit revokes the agent's secret. The overview agent's exit is not handled here.

After the exit the agent stays in the state with its worktree and branch until `agent:stop`.

## After a restart

Agents are only in memory, so a restart of the daemon (or of the dev server) loses them, and their Claude Code ends with it. The worktrees, branches and pull requests are still there. `onModuleInit` takes them over before GitHub sync starts, and so does a repo switch (`RepoService.onSwitched`), before the new repo's first poll:

1. Every worktree `WorktreeService.list()` returns becomes an agent in the next free slot, with the issue number from its branch.
2. It has no process (`processRunning: false`), no secret and no watchdog. Its status is `error` with `daemon_restarted`.
3. The first poll treats its branch like any other: an open pull request makes it `done`, a merged one `merged` with bloom and cleanup, a closed one `pr_closed`. Without a pull request it stays `daemon_restarted`.
4. It can be stopped, with or without its worktree. Planting the issue again afterwards continues on its branch.

Skipped and logged: a second worktree for the same issue, and worktrees beyond the six slots. Their Claude Code session is not resumed. Opening the terminal gives `agent_not_found`, as for an agent whose Claude has exited.

## Stop

`agent:stop { agentId, removeWorktree }` has no ack: the result is an `agent:remove` patch, a failure an `error` event to the tab that asked.

1. `invalid_payload` for a wrong shape, `agent_not_found` for an unknown agent and for the overview agent.
2. An agent whose dispatch still runs is refused with `agent_starting`; nothing changes. Once Claude runs, the agent can be stopped, also while it is still `starting`.
3. A second stop while one runs does nothing.
4. The secret is revoked and the watchdog cleared, so no late event changes the status.
5. If Claude still runs, it is killed and the stop **waits for the exit** (at most 10 s): Windows keeps the files of a running process locked, and the worktree could not be removed.
6. With `removeWorktree`: uncommitted changes give `worktree_dirty`, nothing is deleted, and the agent stays with status `error`. Stop it again with `removeWorktree: false`. Otherwise the worktree is removed; the branch is kept, locally and on origin.
7. `agent:remove`.

## Errors

`toServerError` turns what the other modules throw into the shared contract:

| Thrown                                 | Sent as                                             |
| -------------------------------------- | --------------------------------------------------- |
| `AgentError`                           | its code, with its context                          |
| `GitHubError`                          | its code (`issue_not_found`, `github_*`)            |
| `WorktreeError` `push_failed`          | `git_push_failed`                                   |
| any other `WorktreeError`              | `git_failed`, `context.reason` is the worktree code |
| `TerminalError` `claude_not_found`     | `claude_not_found`                                  |
| any other `TerminalError`              | `internal`                                          |
| simple-git's `GitError` (e.g. offline) | `git_failed`                                        |
| anything else                          | `internal`, and logged as a bug                     |

A spawn that throws although the locator found Claude is `claude_not_found`, and the locator looks again next time.

## Not handled here

- Showing `statusReason` in the web app.
- `agent:restart` (`claude --resume <session id>`), also for agents taken over after a restart: their Claude Code session is not resumed.
- Skipping the trust dialog, a configurable permission mode.
- Process trees and a clean shutdown of the daemon: GS-53. `kill` ends Claude, not programs Claude started.

## Tests

- `agent.service.spec.ts`: the logic of dispatch, leftover branches, rollback, taking over after a restart, hooks, watchdog, exit and stop, with stand-ins for git, GitHub, the terminals, the locator and the hook service.
- `agent-request.spec.ts`, `agent-error.spec.ts`, `task-file.spec.ts`, `hook-status.spec.ts`, `hook-files.spec.ts`, `pull-request-reaction.spec.ts`: the pure functions.
- `hook-script.spec.ts`: the real script against a stand-in daemon, including a daemon that is down or never answers.
- `agent.gateway.spec.ts`: the events reach the service and the answers come back.
- `agent.e2e.spec.ts`: the acceptance criteria of GS-66, GS-67, GS-48 and GS-102 with real git (a bare repo in a temp folder as origin), real PTYs, the real hook endpoint and `apps/api/test/fake-claude.mjs` through `GITSPORE_CLAUDE_BIN`. `FAKE_CLAUDE_HOOKS` makes the fake fire hook events through the written `settings.json`. Only GitHub is a stand-in; the tests fire its pull request events themselves, including a squash merge (a commit only on the branch) and a worktree with uncommitted changes. About a minute on Windows.

Run them with `npm run test:api`, or one file with `npm run test -w apps/api -- agent.e2e`.
