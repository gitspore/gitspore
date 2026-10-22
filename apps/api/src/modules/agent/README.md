# Agent module

Turns an issue into a running agent and stops it again: `agent:dispatch` makes a worktree on a pushed `spore/…` branch, writes a task file and starts Claude Code in it; `agent:stop` ends it. Agents live in the `StateStore` (in memory), next to the overview agent. Git and the running processes are the source of truth; there is no database.

| File                | Holds                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------- |
| `agent.service.ts`  | `AgentService`: `dispatch`, `stop`, the status after Claude's exit                    |
| `agent.gateway.ts`  | `agent:dispatch` (with ack) and `agent:stop` (failures as `error` event)              |
| `agent-request.ts`  | `checkDispatch` and `checkStop`: validation and the slot/issue check, synchronous     |
| `agent-error.ts`    | `AgentError`, and `toServerError`, which turns every error into one of the contract   |
| `task-file.ts`      | `PROMPT` (constant) and `taskFile(issue)`, the text of `.gitspore/task.md`            |
| `agent.module.ts`   | Provides `AgentService` and `AgentGateway`; imports State, GitHub, Terminal, Worktree |
| `agent.e2e.spec.ts` | Acceptance tests with real git, real PTYs and the fake claude                         |

The gateway lives here and not in `GatewayModule`, so the gateway specs there don't start the worktree service. It is still guarded: every gateway on the port shares one Socket.io server, and the middleware in `StateGateway.afterInit` checks every connection.

## Dispatch

```
synchronous  checkDispatch → planFor → agent:upsert "starting"
             ── from here on the call may await ──
async        locator.resolve → getIssue → fetch → create(origin/<base>) → ensureExcluded(".gitspore/")
             → publish → write .gitspore/task.md → spawn (exec mode) → "working" → ack { agentId }
```

1. **Check and reserve, without awaiting.** `checkDispatch` reads the state: `issueNumber` a positive integer and `slotIndex` an integer (`invalid_payload`), slot in range and free (`slot_unavailable`), no agent on the issue yet (`issue_taken`), issue in the synced list (`issue_not_found`). The agent is upserted as `starting` in the same synchronous run, so a second dispatch for the same slot or issue already sees it. The pot shows before any git command runs.
2. **Branch and folder** come from `WorktreeService.planFor`, with the title from the synced list. `create` gets the same title, so the branch is the one the agent was shown with, even if the issue was renamed on GitHub since the last poll.
3. **Claude first.** `ClaudeLocator.resolve()` runs before any git work, so a missing Claude fails before a branch is pushed. After the first success it answers from its cache.
4. **`getIssue`** fetches body and URL. An issue closed since the last poll gives `issue_not_found`.
5. **Git:** `fetch` updates `origin/<base>`, `create` starts the branch there and refuses a branch that exists locally or on origin, `ensureExcluded` keeps `.gitspore/` out of git, `publish` pushes the branch. The daemon never pulls; the user's checkout stays untouched.
6. **Task file.** Issue number, title, URL, body and the instruction to put `Closes #<n>` into the pull request go into `<worktree>/.gitspore/task.md`. Issue text is user input from GitHub: it is only written to this file, never passed on a command line.
7. **Spawn** in exec mode, cwd the worktree: `claude --session-id <uuid> "<PROMPT>"`. The prompt is constant and contains none of `& | < > ^ % "` (a test enforces it), because `claude.cmd` on Windows runs through `cmd.exe`. The session id is kept for a later `claude --resume`.
8. **`working`** right after the spawn (GS-67 replaces it with the status from hooks), then the ack with the id.

### Rollback

All or nothing. On any failure after the `starting` upsert, in reverse order, only what this dispatch made:

1. Claude was started: kill it.
2. The worktree was created: `remove({ force, deleteBranch })`. A branch that existed before (`branch_exists`) is never touched.
3. The branch was pushed: `deleteRemoteBranch`.
4. `agent:remove`, so slot and issue are free and a retry works.

A failing rollback step is logged and the next one still runs. The ack carries the original error, not one from the cleanup.

## When Claude exits

| Claude ends …                             | Status                                    |
| ----------------------------------------- | ----------------------------------------- |
| with exit code ≠ 0                        | `error`                                   |
| with 0, and the branch has an **open** PR | `done`                                    |
| with 0, and no PR                         | `needs_input`                             |
| with 0, and GitHub can't be asked         | `needs_input`                             |
| with 0, and the PR is already merged      | `needs_input` (merge handling is GS-48)   |
| because of `agent:stop`                   | unchanged; `stop` takes care of the agent |

The PR is asked from GitHub directly (`GitHubService.findPullRequest`), not from the last poll: Claude may have opened it seconds ago. Every change sets `statusSince` and goes out as `agent:upsert`. The overview agent's exit is not handled here.

After the exit the agent stays in the state with its worktree and branch until `agent:stop`.

## Stop

`agent:stop { agentId, removeWorktree }` has no ack: the result is an `agent:remove` patch, a failure an `error` event to the tab that asked.

1. `invalid_payload` for a wrong shape, `agent_not_found` for an unknown agent and for the overview agent.
2. An agent in `starting` is refused with `agent_starting`; nothing changes.
3. A second stop while one runs does nothing.
4. If Claude still runs, it is killed and the stop **waits for the exit** (at most 10 s): Windows keeps the files of a running process locked, and the worktree could not be removed.
5. With `removeWorktree`: uncommitted changes give `worktree_dirty`, nothing is deleted, and the agent stays with status `error`. Stop it again with `removeWorktree: false`. Otherwise the worktree is removed; the branch is kept, locally and on origin.
6. `agent:remove`.

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

- Live status from hooks, watchdog: GS-67. Until then a dispatched agent shows `working`, also while Claude asks "Do you trust this folder?" in the new worktree.
- Merge detection and `merged`: GS-48.
- `agent:restart` (`claude --resume <session id>`) and "continue or discard" for an issue whose branch already exists: a follow-up. Until then such a dispatch fails with `git_failed` (`branch_exists`).
- Skipping the trust dialog, a configurable permission mode, resuming agents after a daemon restart.
- Process trees and a clean shutdown of the daemon: GS-53. `kill` ends Claude, not programs Claude started.

## Tests

- `agent.service.spec.ts`: the logic of dispatch, rollback, exit and stop, with stand-ins for git, GitHub, the terminals and the locator.
- `agent-request.spec.ts`, `agent-error.spec.ts`, `task-file.spec.ts`: the pure functions.
- `agent.gateway.spec.ts`: the events reach the service and the answers come back.
- `agent.e2e.spec.ts`: the acceptance criteria of GS-66 with real git (a bare repo in a temp folder as origin), real PTYs and `apps/api/test/fake-claude.mjs` through `GITSPORE_CLAUDE_BIN`. Only GitHub is a stand-in. About 30 s on Windows.

Run them with `npm run test:api`, or one file with `npm run test -w apps/api -- agent.e2e`.
