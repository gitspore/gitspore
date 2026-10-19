import type { ContextUsage, PlanUsage } from "@/components/shell/UsageMeter";

// Fake usage data until the daemon sends it (#42). Agents and issues come
// from the store: the MockClient (mocks/scenarios/) or the daemon.

const now = Date.now();

// Plan limits: the 5-hour window in warn, the week in normal. 100% - full state with resetAt time
export const mockUsage: PlanUsage = {
  fiveHour: {
    percent: 86,
    resetsAt: new Date(now + 2 * 3600 * 1000).toISOString(),
  },
  week: {
    percent: 34,
    resetsAt: new Date(now + 4 * 86400 * 1000).toISOString(),
  },
};

// Context per agent id, for the window headers. Agents without an entry show no meter
export const mockContext: Record<string, ContextUsage> = {
  "agent-0": { percent: 22, tokens: 701_000 },
  "agent-1": { percent: 84, tokens: 2_350_000 },
};
