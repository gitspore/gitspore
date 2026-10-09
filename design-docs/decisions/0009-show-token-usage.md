# 0009: Show token usage: plan limits and tokens per agent

- Status: proposed
- Date: 2026-10-09

## Context

Someone running several agents on a Claude Pro or Max plan needs two answers: how close am I to my plan's limits, and which agent uses the most. Neither was in the concept. Claude Code offers the data locally:

- The statusline command gets JSON on every update, including `rate_limits.five_hour` and `rate_limits.seven_day` (percent used, reset time; only for Pro and Max), `context_window.used_percentage` and `cost.total_cost_usd`.
- Each session's log in `~/.claude/projects/` has the token counts of every answer (input, output, cache read, cache write), with `cwd` and `gitBranch`, so a log can be matched to an agent's worktree.

## Decision

- The top bar shows the plan's 5-hour and weekly limits as two meters. From 80 % they turn amber; at 100 % they turn red, because all agents stop until the reset and that needs the user.
- Each terminal window header shows how full its agent's context is and its token count. A hover shows input, output, cache read, cache write and the total.
- No money amounts. With a Pro or Max plan the user doesn't pay per token, so `cost.total_cost_usd` (an API list price) would mislead.
- The daemon starts each agent with a statusline command that writes the JSON to a file per session, and reads the token counts from the session logs.
- The project's token total is a should-have. Claude Code deletes logs after 30 days by default, so it needs a running total kept by the daemon.

Visual spec: "Usage" in [components.md](../design/components.md).

## Alternatives

- Show the estimated cost per agent. Easy to compare, but wrong for plan users.
- Estimate each agent's share of the 5-hour limit by splitting rises of the limit among active agents. Closer to what a plan user cares about, but a guess, and sessions outside gitspore distort it.
- OpenTelemetry metrics (`claude_code.token.usage`). Needs a collector in the daemon and gives no plan limits.

## Consequences

- The limits cover the whole Claude account, so sessions outside gitspore count too; the hover says so.
- The plan limits exist only for Pro and Max. With an API key the top-bar meters stay hidden.
- The statusline JSON and the session log format can change with Claude Code updates; the daemon should tolerate missing fields.
