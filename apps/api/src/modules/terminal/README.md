# Terminal module

Gives every agent a real terminal: a shell in a PTY (pseudo-terminal) that runs the agent's command in its worktree. Browser tabs attach to it, see its output and type into it. Closing a tab never stops the agent. The module only runs terminals and streams them. Starting Claude Code with the issue prompt is #16, the `terminal:*` Socket.io events are handled in `TerminalGateway` (`apps/api/src/modules/gateway/terminal.gateway.ts`), and the browser terminal is #11.

| File                  | Holds                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| `terminal.service.ts` | `TerminalService`: one terminal per agent, sessions per tab, ownership, limits, exit                     |
| `agent-terminal.ts`   | `AgentTerminal`: one agent's PTY, scrollback, batcher and attached tabs; `startInShell`, `startDirectly` |
| `claude-locator.ts`   | `ClaudeLocator`: finds Claude Code once at startup and caches the path                                   |
| `process-tree.ts`     | `killTree(pid)`: ends a process and everything it started                                                |
| `ring-buffer.ts`      | `RingBuffer`: the last 256 KB of output, never cut inside a UTF-8 character                              |
| `output-batcher.ts`   | `OutputBatcher`: collects output and sends it every 16 ms or at 16 KB                                    |
| `terminal-error.ts`   | `TerminalError` with a `code` (see [Errors](#errors))                                                    |
| `terminal.module.ts`  | Provides and exports `TerminalService`; injects node-pty's `spawn` as `SPAWN_PTY`                        |
| `terminal.manual.ts`  | A manual test: your own terminal plays a browser tab (see [Trying it by hand](#trying-it-by-hand))       |

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
spawn({ agentId, cwd, command, args, mode? }): void
attach(agentId, { ownerId, onData, onExit }): { sessionId, scrollback }
write(sessionId, ownerId, data): void
kill(agentId): Promise<void>
stop(agentId, timeoutMs?): Promise<boolean>
resize(sessionId, ownerId, cols, rows): void
detach(sessionId, ownerId): void
detachOwner(ownerId): void
onExited((agentId, exitCode) => void): void
onMissing((agentId) => Promise<void>): void
revive(agentId): Promise<void>
```

**`spawn`** starts the user's shell (`$SHELL`, `powershell.exe` on Windows) in `cwd` with `TERM=xterm-256color` and `COLORTERM=truecolor`, then types `command args…` and Enter into it. With `mode: "exec"` it starts `command` directly with `args` as an array, without a shell (see [Shell or exec](#shell-or-exec)). It refuses a second terminal for the same agent, and more than `MAX_SLOTS + 1` = 7 terminals (six slot agents plus the overview agent). Both checks run before the shell starts.

**`attach`** opens a session for a tab and returns its `sessionId` and the scrollback (the last 256 KB, `""` if there was no output yet). The gateway passes `socket.id` as `ownerId` and callbacks that emit `terminal:data` and `terminal:exit`. `attach` doesn't send the scrollback itself: the gateway acks `{ sessionId }` first and then emits the scrollback as the first `terminal:data`, so the tab knows its session id before any output arrives. `onData` carries only live output. After an attach the terminal grows by one column for 50 ms. Full-screen programs like Claude Code only redraw when their size changes, so the new tab sees a complete screen instead of half a scrollback.

**`write`, `resize`, `detach`** need the `ownerId` that opened the session. Another tab's session id gives `session_not_found`, the same as an unknown id, so a tab learns nothing about sessions that aren't its own.

**`detachOwner`** detaches every session of one owner. A closed tab sends no `terminal:close`, so **the gateway must call it when a socket disconnects**. Otherwise the terminal keeps sending output to a socket that no longer exists.

**`kill`** ends an agent's process **and everything it started** (dev servers, test watchers, MCP servers), see [Process tree](#process-tree). It throws `agent_not_found` at once for an unknown agent and resolves once the kill is done; `onExited` follows. A kill on a process that has just exited is ignored, and a second kill while the first runs waits for it.

**`stop`** kills and resolves with `true` once the process has exited, after the `onExited` listeners, or with `false` after `timeoutMs` (10 s). The repo switch uses it.

**Shutdown.** `main.ts` calls `enableShutdownHooks()`, so on Ctrl+C or `SIGTERM` Nest calls `onApplicationShutdown`: it stops every terminal in parallel and waits at most 10 s in all. `app.close()` in tests does the same, so a `FakePty` behind a Nest app needs `exitingOnKill()`.

**`onExited`** is for #16: it hears when an agent's shell (or, in exec mode, its program) ended, with the exit code.

**`revive`** runs before every `terminal:open`: for an agent without a terminal it asks the `onMissing` revivers, and the agent module starts Claude Code again (#102). With a terminal, or without revivers, it does nothing; `attach` then refuses an unknown agent as before. The revivers live outside this module, so the gateway doesn't depend on the agent module.

## Shell or exec

|              | Shell mode (default)                                        | Exec mode (`mode: "exec"`)                                     |
| ------------ | ----------------------------------------------------------- | -------------------------------------------------------------- |
| Used by      | the overview agent                                          | issue agents (#66)                                             |
| After Claude | the user is back at the shell prompt; the terminal lives on | the terminal ends; the exit code is Claude's                   |
| Arguments    | typed into the shell, each must match `SAFE_ARGUMENT`       | passed as an array, any argument (`.cmd`: see [Rules](#rules)) |

- **The overview agent** runs in a shell so the user can run commands in the repo root and start `claude` again after it exits. It is checked through the locator and started by file name (`claude.exe`, `claude.cmd`), since `SAFE_ARGUMENT` refuses a Windows path; the file name also keeps PowerShell away from a blocked `claude.ps1`.
- **Issue agents** run without a shell: until hooks report status (GS-67), the end of the process is the only sign that Claude is done, and the prompt arrives as one argument without shell quoting.

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

In shell mode the command is typed into a shell, so when Claude Code ends, the user is back at the shell prompt and the terminal lives on. Only when the shell itself ends (`exit`, Ctrl+D, a crash) does the terminal end. In exec mode the terminal ends with the program. Either way:

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

## Process tree

`pty.kill()` ends only the one process in the PTY. What Claude Code started would live on: a dev server an agent started kept its worktree busy, so the merge cleanup couldn't remove it (#156), and kept its port. So `kill()` first runs `killTree(pid)`, then `pty.kill()`:

- **Windows:** `taskkill /T /F /PID <pid>`. `/T` follows the parent chain, so it has to run while the process still lives. Once it is gone, its children are orphans, and `/T` doesn't find them any more.
- **macOS/Linux:** node-pty starts the process as a session leader, so its process group holds what it starts. Children that open their own session (`detached`) are found in the process table (`ps -A -o pid=,ppid=`) while their parent lives. `SIGTERM` goes to the group and to every pid found, and `SIGKILL` after 2 s to those still there.

Not caught: a process that cut itself loose from its parent before the kill, for example with a double fork. `killTree` ignores pids 0 and 1, so a `FakePty` (pid 0) never signals anything.

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

- **Shell mode: no quoting.** `command` and `args` are typed into the shell as they are, joined by spaces. Every part must match `/^[\w./:=+-]+$/`: no spaces, quotes, `$`, `;`, backticks, `\` or `@` (PowerShell splatting), and not empty. Anything else is `unsafe_argument`.
- **Exec mode on Windows: `claude.cmd` goes through `cmd.exe /d /s /c`.** A `.cmd` can't be started directly. Any of `& | < > ^ % "` or a line break in the path or an argument is `unsafe_argument`. `claude.exe` and Unix take any argument. Issue text never goes on the command line; it is written to `.gitspore/task.md`.
- **What a shell gives.** An interactive shell reads `.bashrc` (so `claude` installed through nvm is on the PATH), Ctrl+C stops the command but not the terminal, and `claude.cmd` works on Windows. Exec mode has none of this, so the locator resolves the full path first.
- **After the shell exits, `write` and `resize` are ignored.** node-pty throws on a resize after exit, and inside the redraw timer that would crash the daemon. On Windows node-pty already refuses a resize before `onExit` fires, so `AgentTerminal` also ignores a resize that throws.
- **Windows: the PTY is released after the shell exits.** ConPTY keeps its pipes open until `kill()` is called, so `AgentTerminal` calls it after every exit on Windows (`docs/decisions.md`, "Offen für GS-03"). Not on Unix, where `kill()` would signal a process id that may already belong to someone else.
- **`TerminalService` gets node-pty's `spawn` through the token `SPAWN_PTY`.** `SpawnPty` is a function type, and Nest can't inject by type. Tests call `new TerminalService(fakeSpawn)` without Nest and never load the native module.

## Not handled here

- PowerShell's UTF-8 output on Windows: #158.
- Starting Claude Code with the issue prompt, and agent status: #16.
- The `terminal:*` events: `TerminalGateway` in `apps/api/src/modules/gateway/terminal.gateway.ts`. It acks before it sends the scrollback, maps `TerminalError` codes as in [Errors](#errors) (and logs anything that isn't a `TerminalError`) and calls `detachOwner` on disconnect.
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
- `process-tree.spec.ts`: reading `ps` output, finding descendants, never signalling pid 0 or 1.
- `agent-terminal.spec.ts`, `terminal.service.spec.ts`: the logic, with `FakePty` (`apps/api/test/fake-pty.ts`) instead of a real PTY. The tree is killed before the PTY, and the shutdown stops all terminals and gives up after 10 s.
- `terminal.pty.spec.ts`: real shells through `TerminalService`, on Ubuntu, macOS and Windows in CI. A command comes back, a resize reaches the shell, colour codes and UTF-8 arrive unchanged (skipped on Windows until PowerShell outputs UTF-8, #158), 10,000 lines arrive in batches, a detached tab doesn't stop the shell, and `exit` makes the service forget the terminal. `kill()` also ends a program's child and its detached child, and the shutdown ends three running programs within 10 s. Each test kills its leftover shells in `afterEach`.
