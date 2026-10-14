# Terminal module

Gives every agent a real terminal: a shell in a PTY (pseudo-terminal) that runs the agent's command in its worktree. Browser tabs attach to it, see its output and type into it. Closing a tab never stops the agent. The module only runs terminals and streams them. Starting Claude Code with the issue prompt is #16, connecting the `terminal:*` Socket.io events is the gateway's job, and the browser terminal is #11.

| File                  | Holds                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| `terminal.service.ts` | `TerminalService`: one terminal per agent, sessions per tab, ownership, limits, exit               |
| `agent-terminal.ts`   | `AgentTerminal`: one agent's PTY, scrollback, batcher and attached tabs; `startInShell`            |
| `ring-buffer.ts`      | `RingBuffer`: the last 256 KB of output, never cut inside a UTF-8 character                        |
| `output-batcher.ts`   | `OutputBatcher`: collects output and sends it every 16 ms or at 16 KB                              |
| `terminal-error.ts`   | `TerminalError` with a `code` (see [Errors](#errors))                                              |
| `terminal.module.ts`  | Provides and exports `TerminalService`; injects node-pty's `spawn` as `SPAWN_PTY`                  |
| `terminal.manual.ts`  | A manual test: your own terminal plays a browser tab (see [Trying it by hand](#trying-it-by-hand)) |

## Terminal and session

- A **terminal** belongs to an agent: the shell, the program running in it, and its scrollback. It lives until its shell ends.
- A **session** is one browser tab's connection to a terminal. Every tab that opens the same agent gets its own session id. Sessions come and go; the terminal stays.

```
browser tab (xterm.js, #11)  ─┐                ┌─ session A (owner: socket 1) ─┐
other browser tab            ─┼─ Socket.io ─ gateway                          ├─ terminal of agent-1 ─ PTY ─ shell ─ claude
                              │                └─ session B (owner: socket 2) ─┘
```

## API

```ts
spawn({ agentId, cwd, command, args }): void
attach(agentId, { ownerId, onData, onExit }): { sessionId, scrollback }
write(sessionId, ownerId, data): void
resize(sessionId, ownerId, cols, rows): void
detach(sessionId, ownerId): void
detachOwner(ownerId): void
onExited((agentId, exitCode) => void): void
```

**`spawn`** starts the user's shell (`$SHELL`, `powershell.exe` on Windows) in `cwd` with `TERM=xterm-256color` and `COLORTERM=truecolor`, then types `command args…` and Enter into it. It refuses a second terminal for the same agent, and more than `MAX_SLOTS + 1` = 7 terminals (six slot agents plus the overview agent). Both checks run before the shell starts.

**`attach`** opens a session for a tab and returns its `sessionId` and the scrollback (the last 256 KB, `""` if there was no output yet). The gateway passes `socket.id` as `ownerId` and callbacks that emit `terminal:data` and `terminal:exit`. `attach` doesn't send the scrollback itself: the gateway acks `{ sessionId }` first and then emits the scrollback as the first `terminal:data`, so the tab knows its session id before any output arrives. `onData` carries only live output. After an attach the terminal grows by one column for 50 ms. Full-screen programs like Claude Code only redraw when their size changes, so the new tab sees a complete screen instead of half a scrollback.

**`write`, `resize`, `detach`** need the `ownerId` that opened the session. Another tab's session id gives `session_not_found`, the same as an unknown id, so a tab learns nothing about sessions that aren't its own.

**`detachOwner`** detaches every session of one owner. A closed tab sends no `terminal:close`, so **the gateway must call it when a socket disconnects**. Otherwise the terminal keeps sending output to a socket that no longer exists.

**`onExited`** is for #16: it hears when an agent's shell ended, with the exit code.

## Output

```
PTY ─▶ OutputBatcher ─(every 16 ms or 16 KB)─▶ RingBuffer + every attached tab's onData
```

- The batcher groups output, so a burst of 10,000 lines reaches a tab in a handful of `onData` calls instead of thousands of Socket.io messages.
- Chunks pass through unchanged, ANSI colour codes and UTF-8 included. Write them to xterm.js as they are.
- The scrollback keeps the last 256 KB. A tab that opens later gets that, not the whole history.
- There is no backpressure. If a tab's connection is slower than the agent's output, Socket.io queues it without limit.

## Size

A PTY has one size, and the program in it draws its screen for that size. So **all tabs share one size: the last `resize` wins.** A narrower tab shows wrapped lines. Per-tab sizes aren't possible with one program and one layout. If that becomes a problem: "smallest tab wins" in `AgentTerminal` (like tmux), plus scaling in the browser (#11). Neither changes the service API.

## When the shell exits

The command is typed into a shell, so when Claude Code ends, the user is back at the shell prompt and the terminal lives on. Only when the shell itself ends (`exit`, Ctrl+D, a crash) does the terminal end:

1. Every attached tab gets the last output, then `onExit(exitCode)`.
2. The service forgets the terminal and all its sessions. The slot is free, and `spawn` works again for that agent.
3. Every `onExited` listener hears `(agentId, exitCode)`.

A tab that opens afterwards gets `agent_not_found`; the last screen is gone. We considered keeping a dead terminal readable until someone removes it, and rejected it: dead terminals would block slots, and #16 would have to clean them up.

Nothing in that chain goes through Nest. Nest builds `TerminalService` once and injects `SPAWN_PTY`. Everything after that is callbacks:

```
node-pty: shell exited
  └─▶ AgentTerminal.handleExit(code)            registered in its constructor with pty.onExit
        ├─ flush the batcher, then every tab's onExit(code)
        └─▶ this.onExit(code)                   the arrow spawn() passed in:
              └─▶ TerminalService.handleExit(agentId, code)    (code) => this.handleExit(agentId, code)
                    ├─ forget the terminal and its sessions
                    └─ every onExited listener
```

`AgentTerminal` never knows its agent id. The arrow function remembers it (a closure).

## Errors

All refusals are a `TerminalError` with a `code`.

| Code                | From                        | Meaning                                                          | Suggested shared code |
| ------------------- | --------------------------- | ---------------------------------------------------------------- | --------------------- |
| `agent_not_found`   | `attach`                    | No terminal for this agent (never spawned, or its shell exited)  | `agent_not_found`     |
| `session_not_found` | `write`, `resize`, `detach` | Unknown session, or one another tab owns                         | `session_not_found`   |
| `already_running`   | `spawn`                     | The agent already has a terminal                                 | `internal`            |
| `limit_reached`     | `spawn`                     | 7 terminals are already running                                  | `internal`            |
| `unsafe_argument`   | `spawn`                     | `command` or an argument contains a character that isn't allowed | `internal`            |

The last three are mistakes on the daemon's side (#16), not something a tab can cause.

## Rules

- **No quoting.** `command` and `args` are typed into the shell as they are, joined by spaces. Every part must match `/^[\w./:=+-]+$/`: no spaces, quotes, `$`, `;`, backticks, `\` or `@` (PowerShell splatting), and not empty. Anything else is `unsafe_argument`. For #16: write the issue prompt to a file in the worktree and pass its relative path.
- **Why a shell, not the command directly.** An interactive shell reads `.bashrc` (so `claude` installed through nvm is on the PATH), Ctrl+C stops the command but not the terminal, and `claude.cmd` works on Windows. All of this is in `startInShell()` in `agent-terminal.ts`. Starting the command directly later would only change that function.
- **After the shell exits, `write` and `resize` are ignored.** node-pty throws on a resize after exit, and inside the redraw timer that would crash the daemon.
- **Windows: the PTY is released after the shell exits.** ConPTY keeps its pipes open until `kill()` is called, so `AgentTerminal` calls it after every exit on Windows (`docs/decisions.md`, "Offen für GS-03"). Not on Unix, where `kill()` would signal a process id that may already belong to someone else.
- **`TerminalService` gets node-pty's `spawn` through the token `SPAWN_PTY`.** `SpawnPty` is a function type, and Nest can't inject by type. Tests call `new TerminalService(fakeSpawn)` without Nest and never load the native module.

## Not handled here

- Stopping an agent: `kill(agentId)` and killing the whole process tree (Claude Code starts its own child processes, such as MCP servers). Ending the daemon cleanly with all terminals. PowerShell's UTF-8 output. All in #53.
- Starting Claude Code with the issue prompt, and agent status: #16.
- The `terminal:*` events: the gateway (#9, second PR). It acks before it sends the scrollback, maps `TerminalError` codes as in [Errors](#errors) and calls `detachOwner` on disconnect.
- The browser terminal and fitting it to the window: #11.

## Trying it by hand

```bash
npm run terminal:manual -w @gitspore/api              # types "echo gitspore"
npm run terminal:manual -w @gitspore/api -- claude    # starts Claude Code
```

Your own terminal plays one browser tab: keys go to `write`, the window size to `resize`, and output comes back through `onData`. End it with `exit` or Ctrl+D; you'll see `[browserTab onExit]`, then `[onExited]`. The build leaves it out (`**/*.manual.ts` in `tsconfig.build.json`), and Jest doesn't run it. It starts through `terminal.manual.runner.mjs`, so it also works on Windows (not tried there yet). After changing code, start it again: it compiles once at startup.

## Tests

Three layers, all run with `npm run test:api`:

- `ring-buffer.spec.ts`, `output-batcher.spec.ts`: the helpers, with Jest's fake timers.
- `agent-terminal.spec.ts`, `terminal.service.spec.ts`: the logic, with `FakePty` (`apps/api/test/fake-pty.ts`) instead of a real PTY.
- `terminal.pty.spec.ts`: real shells through `TerminalService`, on Ubuntu, macOS and Windows in CI. A command comes back, a resize reaches the shell, colour codes and UTF-8 arrive unchanged (skipped on Windows until PowerShell outputs UTF-8), 10,000 lines arrive in batches, a detached tab doesn't stop the shell, and `exit` makes the service forget the terminal. Each test kills its leftover shells in `afterEach`.
