import type {
  Agent,
  AgentId,
  AgentUsage,
  PlanUsage,
  TokenCounts,
} from "@gitspore/shared";
import { Injectable, OnModuleInit } from "@nestjs/common";
import { HookService } from "../hooks/hook.service";
import { StateStore } from "../state/state.store";
import { parseStatusline, type Limit, type Statusline } from "./statusline";

const NO_TOKENS: TokenCounts = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  total: 0,
};

// setTimeout fires at once for a delay above 2^31 - 1 ms (about 24 days).
const MAX_TIMER_MS = 2 ** 31 - 1;

/**
 * Turns the agents' statuslines into the state (#42, ADR 0009): the plan's
 * limits into `plan`, context and model into the agent's `usage`.
 */
@Injectable()
export class UsageService implements OnModuleInit {
  private resetTimer?: NodeJS.Timeout;

  constructor(
    private readonly store: StateStore,
    private readonly hooks: HookService,
  ) {}

  onModuleInit(): void {
    this.hooks.onStatusline((agentId, payload) => {
      this.handleStatusline(agentId, payload);
    });
  }

  // Synchronous from the snapshot to apply(), so a status change from
  // AgentService can't come in between and be overwritten.
  private handleStatusline(agentId: AgentId, payload: unknown): void {
    const statusline = parseStatusline(payload);
    const agent = this.store.snapshot().agents.find((a) => a.id === agentId);
    if (!statusline || !agent) return;

    this.updatePlan(statusline.limits);
    this.updateAgent(agent, statusline);
  }

  // No rate_limits says nothing about the limits (API key, or a session
  // before its first answer), so the others' values stay.
  private updatePlan(limits: Statusline["limits"]): void {
    if (limits === "absent") return;
    this.setPlan(withoutPast(limits, Date.now()));
  }

  private updateAgent(agent: Agent, statusline: Statusline): void {
    const usage: AgentUsage = {
      contextPercent: statusline.contextPercent,
      model: statusline.model,
      tokens: agent.usage?.tokens ?? NO_TOKENS,
    };
    if (agent.usage && sameUsage(agent.usage, usage)) return;
    this.store.apply([{ type: "agent:upsert", agent: { ...agent, usage } }]);
  }

  private setPlan(plan: PlanUsage): void {
    const current = this.store.snapshot().plan;
    if (!current || !samePlan(current, plan)) {
      this.store.apply([{ type: "plan:set", plan }]);
    }
    this.scheduleReset(plan);
  }

  // Claude Code drops a window once its reset time has passed, but only in
  // the next statusline, and with no agent running there is none. So the
  // daemon drops it itself at the reset time.
  private scheduleReset(plan: PlanUsage): void {
    clearTimeout(this.resetTimer);
    this.resetTimer = undefined;
    const next = [plan.fiveHour, plan.sevenDay]
      .filter((limit): limit is Limit => limit !== null)
      .map((limit) => Date.parse(limit.resetsAt))
      .sort((a, b) => a - b)[0];
    if (next === undefined) return;

    const delay = Math.min(Math.max(next - Date.now(), 0), MAX_TIMER_MS);
    this.resetTimer = setTimeout(() => {
      const current = this.store.snapshot().plan;
      if (current) this.setPlan(withoutPast(current, Date.now()));
    }, delay);
    this.resetTimer.unref();
  }
}

function withoutPast(plan: PlanUsage, now: number): PlanUsage {
  const keep = (limit: Limit | null) =>
    limit && Date.parse(limit.resetsAt) > now ? limit : null;
  return { fiveHour: keep(plan.fiveHour), sevenDay: keep(plan.sevenDay) };
}

// Field by field, like the comparisons in AgentService: the store hands out
// clones.
function samePlan(a: PlanUsage, b: PlanUsage): boolean {
  return sameLimit(a.fiveHour, b.fiveHour) && sameLimit(a.sevenDay, b.sevenDay);
}

function sameLimit(a: Limit | null, b: Limit | null): boolean {
  return a?.usedPercent === b?.usedPercent && a?.resetsAt === b?.resetsAt;
}

function sameUsage(a: AgentUsage, b: AgentUsage): boolean {
  return (
    a.contextPercent === b.contextPercent &&
    a.model === b.model &&
    a.tokens.input === b.tokens.input &&
    a.tokens.output === b.tokens.output &&
    a.tokens.cacheRead === b.tokens.cacheRead &&
    a.tokens.cacheWrite === b.tokens.cacheWrite &&
    a.tokens.total === b.tokens.total
  );
}
