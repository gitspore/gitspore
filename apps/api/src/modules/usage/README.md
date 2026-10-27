# Usage module

Token usage from Claude Code (#42, [ADR 0009](../../../../../design-docs/decisions/0009-show-token-usage.md)): the plan's 5-hour and weekly limits for the top bar, each agent's context and model for its window header. The data comes from the agents' statuslines; Claude Code runs `statusline-script.mjs` after every answer, and the script posts the JSON to `POST /hooks/:agentId/statusline` (see "Statusline" in the [agent README](../agent/README.md#statusline)).

| File               | Holds                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------- |
| `statusline.ts`    | `parseStatusline`: the statusline JSON → what the daemon reads, pure and defensive     |
| `usage.service.ts` | `UsageService`: listens to `HookService.onStatusline`, writes `plan` and `agent.usage` |
| `usage.module.ts`  | Provides `UsageService`; imports State and Hook                                        |

## From the statusline into the state

```
HookController → HookService.onStatusline → parseStatusline
  → limits    → plan:set     (only when changed)
  → context, model → agent:upsert with usage (only when changed)
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

`agent.usage` gets `contextPercent` and `model` from each statusline. `contextPercent` is `null` early in a session. The token counts stay at 0 until the session log is read (next step of #42). The overview agent has no statusline, so its `usage` stays `null`.

## Tests

- `statusline.spec.ts`: the parser with the example from Claude Code's docs and every missing or odd field.
- `usage.service.spec.ts`: with the real `StateStore` and `HookService`, fake timers for the reset times.
