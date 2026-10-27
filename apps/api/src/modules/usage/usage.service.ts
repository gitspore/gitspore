import type {
  Agent,
  AgentId,
  AgentUsage,
  PlanUsage,
  TokenCounts,
} from "@gitspore/shared";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { HookService } from "../hooks/hook.service";
import { StateStore } from "../state/state.store";
import { PlanMemory } from "./plan-memory";
import { parseStatusline, type Limit, type Statusline } from "./statusline";
import {
  claudeProjectsDir,
  isSessionLog,
  TranscriptCounter,
} from "./transcript-tokens";

const NO_TOKENS: TokenCounts = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  total: 0,
};

// setTimeout fires at once for a delay above 2^31 - 1 ms (about 24 days).
const MAX_TIMER_MS = 2 ** 31 - 1;

// One agent's token count: its counter, the session log its newest
// statusline named, and whether a read runs or another one is due.
type Counting = {
  counter: TranscriptCounter;
  log: string;
  reading: boolean;
  again: boolean;
};

/**
 * Turns the agents' statuslines into the state (#42, ADR 0009): the plan's
 * limits into `plan`, kept in PlanMemory for the next start; context, model
 * and the tokens from the session log into the agent's `usage`.
 */
@Injectable()
export class UsageService implements OnModuleInit {
  private readonly logger = new Logger(UsageService.name);
  private resetTimer?: NodeJS.Timeout;
  private readonly counting = new Map<AgentId, Counting>();
  private readonly reads = new Set<Promise<void>>();
  // Only session logs in here are read. Tests point it at a temp folder.
  projectsDir = claudeProjectsDir();

  constructor(
    private readonly store: StateStore,
    private readonly hooks: HookService,
    private readonly memory: PlanMemory,
  ) {}

  async onModuleInit(): Promise<void> {
    this.hooks.onStatusline((agentId, payload) => {
      this.handleStatusline(agentId, payload);
    });
    // A removed agent's count goes with it; a repo switch removes them all.
    this.store.onPatch(({ ops }) => {
      for (const op of ops) {
        if (op.type === "agent:remove") this.counting.delete(op.agentId);
      }
    });
    this.store.onReset(() => this.counting.clear());
    await this.restorePlan();
  }

  // The limits from before the daemon's start, so the top bar shows them
  // before an agent has answered. Sessions outside gitspore may have used
  // more since; the next statusline brings that.
  private async restorePlan(): Promise<void> {
    const saved = await this.memory.load();
    if (!saved || this.store.snapshot().plan) return;
    const plan = withoutPast(saved, Date.now());
    if (plan.fiveHour || plan.sevenDay) this.setPlan(plan);
  }

  /** Resolves once no session log is being read. For tests. */
  async idle(): Promise<void> {
    while (this.reads.size > 0) await Promise.all([...this.reads]);
  }

  // Synchronous from the snapshot to apply(), so a status change from
  // AgentService can't come in between and be overwritten. The session log
  // is read afterwards.
  private handleStatusline(agentId: AgentId, payload: unknown): void {
    const statusline = parseStatusline(payload);
    const agent = this.store.snapshot().agents.find((a) => a.id === agentId);
    if (!statusline || !agent) return;

    this.updatePlan(statusline.limits);
    this.updateAgent(agent, statusline);
    this.countTokens(agentId, statusline.transcriptPath);
  }

  // No rate_limits says nothing about the limits (API key, or a session
  // before its first answer), so the others' values stay.
  private updatePlan(limits: Statusline["limits"]): void {
    if (limits === "absent") return;
    this.setPlan(withoutPast(limits, Date.now()));
  }

  private updateAgent(agent: Agent, statusline: Statusline): void {
    this.setUsage(agent, {
      contextPercent: statusline.contextPercent,
      model: statusline.model,
      tokens: agent.usage?.tokens ?? NO_TOKENS,
    });
  }

  private setUsage(agent: Agent, usage: AgentUsage): void {
    if (agent.usage && sameUsage(agent.usage, usage)) return;
    this.store.apply([{ type: "agent:upsert", agent: { ...agent, usage } }]);
  }

  // One read per agent at a time. A statusline that comes in meanwhile
  // asks for one more read after it, with the log it names.
  private countTokens(agentId: AgentId, log: string | null): void {
    if (log === null || !isSessionLog(log, this.projectsDir)) return;
    let entry = this.counting.get(agentId);
    if (!entry) {
      entry = {
        counter: new TranscriptCounter(),
        log,
        reading: false,
        again: false,
      };
      this.counting.set(agentId, entry);
    }
    entry.log = log;
    if (entry.reading) {
      entry.again = true;
      return;
    }
    const read = this.readLog(agentId, entry).finally(() =>
      this.reads.delete(read),
    );
    this.reads.add(read);
  }

  private async readLog(agentId: AgentId, entry: Counting): Promise<void> {
    entry.reading = true;
    try {
      do {
        entry.again = false;
        const tokens = await entry.counter.read(entry.log);
        // Removed, or a repo switch, while the file was read.
        if (this.counting.get(agentId) !== entry) return;
        this.setTokens(agentId, tokens);
      } while (entry.again);
    } catch (error) {
      // Before the session's first answer the log may not exist yet.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`No tokens from ${entry.log}: ${message}`);
      }
    } finally {
      entry.reading = false;
    }
  }

  // The agent as it is now: the read took a while, and the statusline or
  // AgentService may have changed it meanwhile.
  private setTokens(agentId: AgentId, tokens: TokenCounts): void {
    const agent = this.store.snapshot().agents.find((a) => a.id === agentId);
    if (!agent) return;
    this.setUsage(agent, {
      contextPercent: agent.usage?.contextPercent ?? null,
      model: agent.usage?.model ?? null,
      tokens,
    });
  }

  private setPlan(plan: PlanUsage): void {
    const current = this.store.snapshot().plan;
    if (!current || !samePlan(current, plan)) {
      this.store.apply([{ type: "plan:set", plan }]);
      this.memory.save(plan).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Could not save the plan limits: ${message}`);
      });
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
