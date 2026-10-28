import type { IsoTimestamp } from "@gitspore/shared";

// The same shape as UsageLimit and PlanUsage in @gitspore/shared, so the
// usage service can hand them on as they are.
export type Limit = { usedPercent: number; resetsAt: IsoTimestamp };
export type Limits = { fiveHour: Limit | null; sevenDay: Limit | null };

/** What the daemon reads from one statusline of an agent (#42). */
export type Statusline = {
  sessionId: string | null;
  /** The session log, for the token counts. */
  transcriptPath: string | null;
  contextPercent: number | null;
  /** The model's display name, e.g. "Opus". */
  model: string | null;
  /**
   * "absent": no `rate_limits` at all (API key, or before the session's
   * first answer). That says nothing about the limits, unlike a single
   * missing window, which Claude Code drops after its reset.
   */
  limits: Limits | "absent";
};

type Json = Record<string, unknown>;

/**
 * Reads Claude Code's statusline JSON defensively: its format can change
 * with Claude Code updates, so a missing or odd field becomes `null`
 * instead of an error. `null` only for a payload that isn't an object.
 */
export function parseStatusline(payload: unknown): Statusline | null {
  const status = object(payload);
  if (status === null) return null;

  return {
    sessionId: text(status.session_id),
    transcriptPath: text(status.transcript_path),
    contextPercent: finite(object(status.context_window)?.used_percentage),
    model: text(object(status.model)?.display_name),
    limits: limits(status.rate_limits),
  };
}

function limits(value: unknown): Limits | "absent" {
  const rateLimits = object(value);
  if (rateLimits === null) return "absent";
  return {
    fiveHour: limit(rateLimits.five_hour),
    sevenDay: limit(rateLimits.seven_day),
  };
}

// resets_at is in Unix seconds. A Date out of range is invalid, and
// toISOString() would throw on it.
function limit(value: unknown): Limit | null {
  const window = object(value);
  const usedPercent = finite(window?.used_percentage);
  const resetsAt = new Date((finite(window?.resets_at) ?? NaN) * 1000);
  if (usedPercent === null || Number.isNaN(resetsAt.getTime())) return null;
  return { usedPercent, resetsAt: resetsAt.toISOString() };
}

function object(value: unknown): Json | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Json)
    : null;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}
