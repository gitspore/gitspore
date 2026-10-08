# @gitspore/shared

The contract between the daemon (`apps/api`) and the browser (`apps/web`): domain models, Socket.io events and the patch rules. Both apps import it as `@gitspore/shared`.

- `models.ts`: `Agent`, `AgentStatus`, `Issue`, `TerminalSession`, `GreenhouseState`, `MAX_SLOTS`, `BRANCH_PREFIX`, `JsonValue`.
- `events.ts`: `ClientToServerEvents`, `ServerToClientEvents`, payloads, `PatchOp`, `StatePatch`, `ServerError`.
- `patch.ts`: `applyPatch`, the one implementation of the version and op rules for the web store, the mock server and replay.

## Rules

- **Domain only.** Names describe agents, issues and worktrees. Pots, seed packets, wilting and blooms are drawn by `apps/web` and never appear here.
- **IDs, not nested objects.** An agent refers to its issue by `issueNumber`; a terminal session to its agent by `agentId`.
- **Plain JSON only.** No `Date`, `Map`, `Set` or class instances. Timestamps are ISO strings. Every event can be written to the event log and replayed as-is. The test checks this at compile time and at runtime.
- **Snapshot, then versioned patches.** See [Versions](#versions).
- **Derived state stays on the client.** How long an agent has waited, the plant's stage and greenhouse vitality come from `status` and `statusSince`. No events exist for them.

## Events

Wire them up as Socket.io generics: `Server<ClientToServerEvents, ServerToClientEvents>` in `apps/api`, `Socket<ServerToClientEvents, ClientToServerEvents>` in `apps/web`.

| Event             | Direction       | Payload                       | Ack                            | Purpose                                                                              |
| ----------------- | --------------- | ----------------------------- | ------------------------------ | ------------------------------------------------------------------------------------ |
| `agent:dispatch`  | Client → Server | `{ issueNumber, slotIndex }`  | `{ agentId }` \| `{ error }`   | Start Claude Code on an issue in a free slot, in a new worktree and `spore/…` branch |
| `agent:stop`      | Client → Server | `{ agentId, removeWorktree }` | –                              | Stop an agent, free its slot, optionally delete the worktree                         |
| `issues:refresh`  | Client → Server | `{}`                          | –                              | Fetch the open issues from GitHub again                                              |
| `state:request`   | Client → Server | `{}`                          | –                              | Ask for a new `state:snapshot`, e.g. after a version gap                             |
| `terminal:open`   | Client → Server | `{ agentId }`                 | `{ sessionId }` \| `{ error }` | Attach to an agent's terminal                                                        |
| `terminal:input`  | Client → Server | `{ sessionId, data }`         | –                              | Keystrokes into the terminal                                                         |
| `terminal:resize` | Client → Server | `{ sessionId, cols, rows }`   | –                              | Resize the terminal to its window                                                    |
| `terminal:close`  | Client → Server | `{ sessionId }`               | –                              | Detach; the agent keeps running                                                      |
| `state:snapshot`  | Server → Client | `GreenhouseState`             | –                              | The full state, on connect and on `state:request`                                    |
| `state:patch`     | Server → Client | `{ version, ops }`            | –                              | Changes since the previous version                                                   |
| `terminal:data`   | Server → Client | `{ sessionId, chunk }`        | –                              | Terminal output, ANSI codes included                                                 |
| `terminal:exit`   | Server → Client | `{ sessionId, exitCode }`     | –                              | The terminal's process ended; the session is closed                                  |
| `error`           | Server → Client | `{ code, message, context? }` | –                              | A request without an ack failed, or a background step failed                         |

Patch ops in `state:patch`:

| Op             | Fields        | Effect                                                   |
| -------------- | ------------- | -------------------------------------------------------- |
| `agent:upsert` | `agent`       | Add the agent, or replace the one with the same `id`     |
| `agent:remove` | `agentId`     | Remove the agent                                         |
| `issue:upsert` | `issue`       | Add the issue, or replace the one with the same `number` |
| `issue:remove` | `issueNumber` | Remove the issue (closed on GitHub)                      |

## Versions

The snapshot carries a `version`. Every patch raises it by exactly one, so a client at version `n` applies only the patch with version `n + 1`.

- `patch.version <= n`: stale, ignore it.
- `patch.version > n + 1`: patches were missed. Send `state:request`, then replace the state with the snapshot that comes back.
- A snapshot always replaces the client's state, whatever its version. After a daemon restart, the snapshot on reconnect resets the client.

`applyPatch(state, patch)` returns `applied` with the new state, `stale` or `gap`.

## The core flow

The user plants issue #42 in the first slot and answers the agent once.

1. On connect the client receives `state:snapshot` with `version: 7`: no agents, issue #42 among the issues.
2. Client sends `agent:dispatch { issueNumber: 42, slotIndex: 0 }`. The daemon creates the worktree and branch `spore/42-fix-login`, starts Claude Code and acks `{ agentId: "a1" }`.
3. `state:patch { version: 8, ops: [agent:upsert a1, status "starting"] }`. Claude Code is up: `version: 9`, `status: "working"`.
4. Claude Code asks a question: `version: 10`, `status: "needs_input"`, `statusSince` now. The client counts the waiting time from `statusSince`.
5. Client sends `terminal:open { agentId: "a1" }`, gets `{ sessionId: "s1" }`, and `terminal:data { sessionId: "s1", chunk }` starts to flow.
6. The user answers: `terminal:input { sessionId: "s1", data: "y\r" }`. The xterm window reports its size with `terminal:resize`.
7. Claude Code continues (`working`), finishes (`done`), the branch is merged (`merged`). Each step is one `agent:upsert`.
8. The daemon cleans up: `agent:remove a1` and `issue:remove 42` in one patch. The slot is free again.

`terminal:close` detaches the window at any point without stopping the agent. `agent:stop` stops it.

## Tests

`contract.spec.ts` has one sample per event, ack and patch op, and checks that each survives a `JSON.stringify` / `JSON.parse` round trip unchanged. Adding an event or op without a sample, or a field that isn't plain JSON, fails to compile.
