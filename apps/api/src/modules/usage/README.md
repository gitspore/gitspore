# Usage module

Token usage from Claude Code (#42, [ADR 0009](../../../../../design-docs/decisions/0009-show-token-usage.md)): the plan's 5-hour and weekly limits for the top bar, each agent's context, model and tokens for its window header. The data comes from the agents' statuslines; Claude Code runs `statusline-script.mjs` after every answer, and the script posts the JSON to `POST /hooks/:agentId/statusline` (see "Statusline" in the [agent README](../agent/README.md#statusline)).

| File                   | Holds                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `statusline.ts`        | `parseStatusline`: the statusline JSON → what the daemon reads, pure and defensive       |
| `transcript-tokens.ts` | `TranscriptCounter`: the token counts of one agent from its session logs; `isSessionLog` |
| `usage.service.ts`     | `UsageService`: listens to `HookService.onStatusline`, writes `plan` and `agent.usage`   |
| `usage.module.ts`      | Provides `UsageService`; imports State and Hook                                          |

## From the statusline into the state

```
HookController → HookService.onStatusline → parseStatusline
  → limits    → plan:set     (only when changed)
  → context, model → agent:upsert with usage (only when changed)
  → transcript_path → TranscriptCounter.read (afterwards, async)
                    → agent:upsert with the tokens (only when changed)
```

- A statusline for an agent that isn't in the state, or a payload that isn't an object, changes nothing.
- From the snapshot to `apply` everything runs synchronously, so a status change from `AgentService` can't come in between and be overwritten. `AgentService` builds its upserts with `{ ...agent }` and keeps `usage` that way.

### Plan limits

The limits belong to the whole Claude account, so they are one `plan` on the state, not one per agent. The newest statusline of any agent wins.

| Statusline                                              | `plan`                                   |
| ------------------------------------------------------- | ---------------------------------------- |
| no `rate_limits` (API key, before the first answer)     | unchanged: says nothing about the limits |
| `rate_limits` with both windows                         | both set                                 |
| a window missing (Claude Code drops it after its reset) | that window `null`                       |
| a window whose reset time has already passed            | that window `null`                       |
| the same values as before                               | no patch                                 |

- Claude Code drops a window only in its next statusline, and with no agent running there is none. So the daemon drops each window itself at its reset time: one timer for the earliest `resetsAt`, `unref()`ed so it doesn't keep the process alive.
- `plan` stays `null` until a statusline with `rate_limits` comes, and with an API key for good. The web hides the meters then.
- A repo switch keeps `plan` (`StateStore.setRepo`).

### Agent usage

`agent.usage` gets `contextPercent` and `model` from each statusline. `contextPercent` is `null` early in a session. The overview agent has no statusline, so its `usage` stays `null`.

### Tokens

The statusline names the session's log (`transcript_path`); the token counts come from there. After the statusline is in the state, `UsageService` reads the log and puts the sum on the agent.

- **Each request once.** Claude Code writes one line per content block of an answer, each with the usage of the whole request. So each `requestId` counts once (without one, the message id). Rarely a line of a request has zeros; the largest line counts. Checked against 40 real logs: of 1454 requests, one had a line with zeros, none had two different non-zero counts.
- **The four kinds** are `input_tokens`, `output_tokens`, `cache_read_input_tokens` and `cache_creation_input_tokens`; `total` is their sum. A missing or odd number counts 0. Most of a long session is cache reads.
- **Subagents** write their own logs in `<session>/subagents/*.jsonl`; they count for the agent.
- **Read on, not again.** The counter keeps how far it read each file and reads only what is new, up to the last complete line. The first read of a long session is a few MB (a 3 MB log takes about 20 ms), later ones a few lines. A file that got shorter is read from the start; the request ids keep a second count out.
- **After `--continue`** the statusline names a new log, which starts with the history of the old one. The old log's requests stay in the sum, the copied ones have the same ids.
- **One read per agent at a time.** A statusline during a read asks for one more read afterwards. A log that doesn't exist yet (before the first answer) is tried again with the next statusline; other read errors are logged.
- **Only Claude Code's own files.** The path comes from outside the daemon, so only a `.jsonl` inside `~/.claude/projects` (or `$CLAUDE_CONFIG_DIR/projects`) is read.
- A removed agent's count goes with it; a repo switch drops all. After a daemon restart the count starts from the log again, so only what is still in the logs counts. Claude Code deletes logs after 30 days by default.

## Tests

- `statusline.spec.ts`: the parser with the example from Claude Code's docs and every missing or odd field.
- `transcript-tokens.spec.ts`: the counter on real files in a temp folder: duplicate lines, zeros, reading on, a half-written line, odd lines and numbers, subagents, `--continue`, a replaced file; `isSessionLog`.
- `usage.service.spec.ts`: with the real `StateStore` and `HookService`, fake timers for the reset times, a temp folder as Claude Code's projects folder for the tokens.
