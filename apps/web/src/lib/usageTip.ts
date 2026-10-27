import type { Agent, AgentUsage, Issue, UsageLimit } from "@gitspore/shared";
import { agentName } from "./agentName";

// What a usage-tip shows (components.md, Usage). Built here, without React,
// so the specs can check it; UsageTip only draws it.

/** Label on the left, number on the right. A total gets a line above it. */
export type TipRow = { label: string; value: string; total?: boolean };

export type TipContent = { title: string; rows: TipRow[]; notes: string[] };

/** One agent's token count, for the top bar's tips. */
export type AgentTokens = { name: string; tokens: number };

export const CACHE_NOTE =
  "Most of it is cache reads: each answer reads the conversation so far " +
  "again, mostly from the cache.";
export const PAUSED_NOTE = "All agents are paused until the reset.";
export const ACCOUNT_NOTE =
  "The limit covers your whole Claude account, sessions outside gitspore too.";

// 2247198 -> "2,247,198": the tip has room for the exact number.
const count = (n: number) => n.toLocaleString("en");
const percent = (n: number) => `${Math.round(n)} %`;

/** The window header's tip: the agent's tokens by kind, context, model. */
export function contextTip(usage: AgentUsage): TipContent {
  const { tokens } = usage;
  const rows: TipRow[] = [
    { label: "Input", value: count(tokens.input) },
    { label: "Output", value: count(tokens.output) },
    { label: "Cache read", value: count(tokens.cacheRead) },
    { label: "Cache write", value: count(tokens.cacheWrite) },
    { label: "Total", value: count(tokens.total), total: true },
  ];
  if (usage.contextPercent !== null) {
    rows.push({ label: "Context used", value: percent(usage.contextPercent) });
  }
  if (usage.model !== null) rows.push({ label: "Model", value: usage.model });
  return {
    title: "Tokens of this agent",
    rows,
    notes: tokens.cacheRead > tokens.total / 2 ? [CACHE_NOTE] : [],
  };
}

/** The agents with tokens, the most first, named as in the window header. */
export function agentTokens(agents: Agent[], issues: Issue[]): AgentTokens[] {
  return agents
    .flatMap((agent) => {
      const tokens = agent.usage?.tokens.total ?? 0;
      if (tokens <= 0) return [];
      const title =
        issues.find((issue) => issue.number === agent.issueNumber)?.title ?? "";
      return [{ name: agentName(agent, title), tokens }];
    })
    .sort((a, b) => b.tokens - a.tokens);
}

/** A top-bar meter's tip: used, reset time, tokens of the running agents. */
export function limitTip(
  window: "fiveHour" | "sevenDay",
  limit: UsageLimit,
  agents: AgentTokens[],
): TipContent {
  const rows: TipRow[] = [
    { label: "Used", value: percent(limit.usedPercent) },
    { label: "Resets", value: resetTime(window, limit.resetsAt) },
  ];
  if (agents.length > 0) {
    for (const agent of agents) {
      rows.push({ label: agent.name, value: count(agent.tokens) });
    }
    const sum = agents.reduce((total, agent) => total + agent.tokens, 0);
    rows.push({
      label: "Agents' tokens",
      value: count(sum),
      total: true,
    });
  }
  return {
    title: window === "fiveHour" ? "5-hour limit" : "Weekly limit",
    rows,
    notes:
      limit.usedPercent >= 100 ? [PAUSED_NOTE, ACCOUNT_NOTE] : [ACCOUNT_NOTE],
  };
}

// The 5-hour window resets today or overnight, so the time is enough; the
// weekly one needs the day. The time as the user's locale writes it, like
// UsageMeter's; the day in English, like the rest of the UI ("Sat 15:04").
export function resetTime(
  window: "fiveHour" | "sevenDay",
  resetsAt: string,
): string {
  const date = new Date(resetsAt);
  const time = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (window === "fiveHour") return time;
  return `${date.toLocaleDateString("en", { weekday: "short" })} ${time}`;
}
