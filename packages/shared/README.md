# @gitspore/shared

The contract between the daemon (`apps/api`) and the browser (`apps/web`): domain models, Socket.io events and the patch rules. Both apps import it as `@gitspore/shared`, so a change here shows up as a type error on both sides. That is what lets everyone work in parallel against the same interface.

| File            | Holds                                                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| `models.ts`     | `Agent`, `AgentStatus`, `Issue`, `TerminalSession`, `GreenhouseState`, `JsonValue`, `MAX_SLOTS`, `BRANCH_PREFIX` |
| `events.ts`     | `ClientToServerEvents`, `ServerToClientEvents`, all payloads and acks, `PatchOp`, `StatePatch`, `ServerError`    |
| `patch.ts`      | `applyPatch`, the one implementation of the version and op rules (web store, mock server, replay)                |
| `meta.ts`       | `PRODUCT_NAME`                                                                                                   |
| `contract.spec` | One sample per event, ack and patch op; JSON round trip and `applyPatch` tests                                   |

## Rules

- **Domain only.** Names describe agents, issues and worktrees. Pots, seed packets, wilting and blooms are drawn by `apps/web` and never appear here, so the contract stays stable if the visualisation changes.
- **IDs, not nested objects.** An agent refers to its issue by `issueNumber`; a terminal session to its agent by `agentId`.
- **Plain JSON only.** No `Date`, `Map`, `Set` or class instances. Timestamps are ISO strings. Every event can be written to the event log and replayed as-is (replay mode, user study). The test checks this at compile time and at runtime.
- **Snapshot, then versioned patches.** The server sends the full state on connect and small patches afterwards. See [Versions](#versions).
- **Derived state stays on the client.** How long an agent has waited, the stage of the picture and the greenhouse's vitality are computed from `status` and `statusSince`. No events exist for them. See [Derived state](#derived-state-stays-on-the-client).
- **The daemon is the only writer.** The client asks (`agent:dispatch`, `agent:stop`), the daemon decides and answers with patches. The client never changes its state on its own.

## Models

### Agent

One Claude Code session, running in its own git worktree and branch.

| Field          | Type             | Meaning                                                                                                                |
| -------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `id`           | `string`         | Identifies the agent in every event                                                                                    |
| `slotIndex`    | `number \| null` | `0` to `MAX_SLOTS - 1`, unique among agents. `null` for an agent without a slot, such as the overview agent (ADR 0004) |
| `issueNumber`  | `number \| null` | The issue the agent works on. `null` for an agent without a slot                                                       |
| `branch`       | `string`         | Full branch name. Issue agents start with `BRANCH_PREFIX` (`spore/`), for example `spore/42-fix-login`                 |
| `worktreePath` | `string`         | Absolute path of the worktree (the repo root for the overview agent)                                                   |
| `status`       | `AgentStatus`    | See below                                                                                                              |
| `statusSince`  | ISO string       | When `status` last changed                                                                                             |
| `startedAt`    | ISO string       | When the agent was started                                                                                             |

### AgentStatus

Only the daemon changes it.

| Status        | Meaning                                                     | Typical next                   |
| ------------- | ----------------------------------------------------------- | ------------------------------ |
| `starting`    | Worktree and branch are created, Claude Code launches       | `working`, `error`             |
| `working`     | Claude Code runs and does not need the user                 | `needs_input`, `done`, `error` |
| `needs_input` | Claude Code stopped and waits for the user                  | `working`                      |
| `error`       | Claude Code or the git setup failed. The worktree is kept   | (`agent:stop`)                 |
| `done`        | Claude Code finished; the branch waits for review and merge | `merged`                       |
| `merged`      | The branch is merged. The agent is removed after cleanup    | (removed)                      |

### Issue, TerminalSession, GreenhouseState

- `Issue`: `number`, `title`, `url` (the issue's page on github.com), `labels` (label names).
- `TerminalSession`: `id`, `agentId`. One client's connection to an agent's terminal.
- `GreenhouseState`: `version`, `agents`, `issues`. The full state sent as a snapshot. `issues` holds all open issues, with or without an agent.

### Constants

- `MAX_SLOTS = 6`: number of slots for agents.
- `BRANCH_PREFIX = "spore/"`: prefix of every branch the daemon creates for an agent.

## Using it

Wire the event maps up as Socket.io generics. The type arguments are in opposite order on the two sides.

```ts
// apps/api (NestJS gateway)
import type { Server } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@gitspore/shared";

@WebSocketServer()
server: Server<ClientToServerEvents, ServerToClientEvents>;
```

```ts
// apps/web
import { io, type Socket } from "socket.io-client";
import {
  applyPatch,
  type ClientToServerEvents,
  type GreenhouseState,
  type ServerToClientEvents,
} from "@gitspore/shared";

const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(url);
let state: GreenhouseState | undefined;

socket.on("state:snapshot", (snapshot) => (state = snapshot));

socket.on("state:patch", (patch) => {
  if (!state) return; // wait for the snapshot
  const result = applyPatch(state, patch);
  if (result.status === "applied") state = result.state;
  if (result.status === "gap") socket.emit("state:request", {});
  // "stale": ignore
});

socket.emit("agent:dispatch", { issueNumber: 42, slotIndex: 0 }, (response) => {
  if ("error" in response) {
    // response.error.code says why, for example "slot_unavailable"
  } else {
    // response.agentId; the agent itself arrives as a patch
  }
});
```

## Events

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

### Acks

An ack is the callback the client passes as the last argument of `emit`. The server calls it with the answer to that one request. Two events have one, because the client needs an id at once: `agent:dispatch` answers `{ agentId }` and `terminal:open` answers `{ sessionId }`. Both can answer `{ error }` instead. Every other request has no ack: its result arrives as a `state:patch`, and a failure as an `error` event.

### Errors

`ServerError` is `{ code, message, context? }`. `message` is for the developer, not for display as-is. `context` holds the ids or values the error refers to, for example `{ agentId }`.

| Code                | Meaning                                                         |
| ------------------- | --------------------------------------------------------------- |
| `invalid_payload`   | The payload is missing fields or has values of the wrong type   |
| `slot_unavailable`  | The slot index is out of range or the slot already has an agent |
| `issue_not_found`   | No open issue with this number                                  |
| `issue_taken`       | An agent already works on this issue                            |
| `agent_not_found`   | No agent with this id                                           |
| `session_not_found` | No terminal session with this id                                |
| `git_failed`        | Creating or removing the worktree or branch failed              |
| `github_failed`     | GitHub could not be reached or refused the request              |
| `internal`          | Anything else; `message` says what                              |

## Patches

`state:patch` carries `{ version, ops }`. The ops are applied in order and belong to one version, so a patch changes the state all at once or not at all.

| Op             | Fields        | Effect                                                   |
| -------------- | ------------- | -------------------------------------------------------- |
| `agent:upsert` | `agent`       | Add the agent, or replace the one with the same `id`     |
| `agent:remove` | `agentId`     | Remove the agent                                         |
| `issue:upsert` | `issue`       | Add the issue, or replace the one with the same `number` |
| `issue:remove` | `issueNumber` | Remove the issue (closed on GitHub)                      |

An upsert carries the whole entity, never a partial one, so there are no half-updated objects and the event log holds every state in full. A replaced entity keeps its place in the list; a new one is appended.

`PatchOp` is a discriminated union on `type`. A `switch` over it without a `default` compiles only while every op is handled, so adding an op shows every place that has to change.

### Versions

The snapshot carries a `version`. Every patch raises it by exactly one, so a client at version `n` applies only the patch with version `n + 1`.

| Case                   | Meaning                 | The client                                                       |
| ---------------------- | ----------------------- | ---------------------------------------------------------------- |
| `patch.version == n+1` | the next expected patch | applies it                                                       |
| `patch.version <= n`   | already known           | ignores it                                                       |
| `patch.version > n+1`  | patches were missed     | sends `state:request`, then replaces its state with the snapshot |

A snapshot always replaces the client's state, whatever its version. After a daemon restart the snapshot on reconnect resets the client.

`applyPatch(state, patch)` implements this. It returns `{ status: "applied", state }`, `{ status: "stale" }` or `{ status: "gap" }`, and does not change the state it was given.

## Terminal sessions

- `terminal:open { agentId }` creates a session and acks its `sessionId`. One agent can have several sessions, for example in two browser windows.
- All other `terminal:*` events refer to the session, not the agent.
- `terminal:close` only detaches the session. The agent keeps running until `agent:stop`.
- When the process behind a session ends, the daemon sends `terminal:exit { sessionId, exitCode }`. The session is closed; the agent's new status arrives as a patch.
- A session id is valid until `terminal:close` or `terminal:exit`. After a new `terminal:open` use the new id.
- A minimised terminal window can keep its session and its xterm instance. Then nothing is sent and `terminal:data` keeps arriving. If the client destroys the window instead, it sends `terminal:close` and opens a new session on restore (see [Open points](#open-points-for-the-review)).

## Derived state stays on the client

The daemon sends facts. The client works out the rest:

- **Waiting time:** `now - statusSince` while `status` is `needs_input`. The client keeps its own clock; nothing is sent while the time runs.
- **Stages and looks:** which picture an agent gets, and when it changes, depends only on `status` and the waiting time. The design is in `design-docs/`.
- **Greenhouse vitality:** one value over all agents, from their statuses and waiting times.

## Agents without a slot

`slotIndex` and `issueNumber` are `null` for an agent that works in the repo root and belongs to no slot, such as the overview agent (ADR 0004). It is an ordinary `Agent` in `GreenhouseState.agents`. Clients that list slots must not assume that every agent has one.

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

`terminal:close` detaches the window at any point without stopping the agent. `agent:stop` stops it and ends with an `agent:remove` patch.

## Changing the contract

The contract is a cross-cutting decision: a change needs the review of all three of us.

1. Change the types in `models.ts` or `events.ts`. Every event keeps a JSDoc comment with its direction (Client → Server / Server → Client) and its purpose.
2. Add a sample to `contract.spec.ts`. Without one the test does not compile.
3. Handle a new patch op in `applyPatch`.
4. Update this README.
5. Run `npm run typecheck` in the repo root: `apps/api` and `apps/web` must compile against the change.

No name may refer to the visual metaphor (pot, seed, vine, beetle, bloom, wilt).

## Open points for the review

These go beyond or differ from the first ticket text:

1. `slotIndex` and `issueNumber` are `null`-able for agents without a slot (ADR 0004). The ticket says 0–5.
2. `state:request` is new. The ticket says the server sends a snapshot "on request" but names no event for asking.
3. `applyPatch` lives here, so the web store, the mock server and replay share one set of rules.
4. The `ErrorCode` list is a proposal. The api side should check it.
5. `done` means "ready for review". `agent:stop` ends with an `agent:remove` patch.
6. **Not decided:** whether `terminal:open` sends the buffered history first (the daemon keeps the last lines of each session, see the terminal ticket) and then live output. The client needs that to restore a destroyed window or to reconnect. This README does not promise it yet.
7. **Not decided:** whether a patch with an empty `ops` list raises the version.

## Tests

`contract.spec.ts` has one sample per event, ack and patch op, and checks that each survives a `JSON.stringify` / `JSON.parse` round trip unchanged. Adding an event or op without a sample, or a field that isn't plain JSON, fails to compile. It also tests `applyPatch`: all ops in order, replacement in place, the old state stays untouched, stale and gap.

Run it from the repo root with `npm run test`.
