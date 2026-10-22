import { z } from "zod";
import type {
  Agent,
  AgentStatus,
  GreenhouseState,
  Issue,
  PatchOp,
  ServerError,
  StatePatch,
  TerminalDataPayload,
  TerminalExitPayload,
} from "@gitspore/shared";
import type { Scenario, ScenarioEntry } from "./scenario";

const agentStatusSchema = z.enum([
  "starting",
  "working",
  "needs_input",
  "error",
  "done",
  "merged",
]) satisfies z.ZodType<AgentStatus>;

const agentSchema = z.object({
  id: z.string(),
  slotIndex: z.number().nullable(),
  issueNumber: z.number().nullable(),
  branch: z.string(),
  status: agentStatusSchema,
  statusSince: z.string(),
  startedAt: z.string(),
  worktreePath: z.string(),
}) satisfies z.ZodType<Agent>;

const issueSchema = z.object({
  number: z.number(),
  title: z.string(),
  url: z.string(),
  labels: z.array(z.string()),
}) satisfies z.ZodType<Issue>;

const greenhouseStateSchema = z.object({
  agents: z.array(agentSchema),
  issues: z.array(issueSchema),
  version: z.number(),
}) satisfies z.ZodType<GreenhouseState>;

const patchOpSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("agent:upsert"), agent: agentSchema }),
  z.object({ type: z.literal("agent:remove"), agentId: z.string() }),
  z.object({ type: z.literal("issue:upsert"), issue: issueSchema }),
  z.object({ type: z.literal("issue:remove"), issueNumber: z.number() }),
]) satisfies z.ZodType<PatchOp>;

const statePatchSchema = z.object({
  ops: z.array(patchOpSchema),
  version: z.number(),
}) satisfies z.ZodType<StatePatch>;

const terminalDataSchema = z.object({
  sessionId: z.string(),
  chunk: z.string(),
}) satisfies z.ZodType<TerminalDataPayload>;

const terminalExitSchema = z.object({
  exitCode: z.number(),
  sessionId: z.string(),
}) satisfies z.ZodType<TerminalExitPayload>;

const serverErrorSchema = z.object({
  code: z.enum([
    "invalid_payload",
    "slot_unavailable",
    "issue_not_found",
    "issue_taken",
    "agent_not_found",
    "session_not_found",
    "git_failed",
    "git_push_failed",
    "worktree_dirty",
    "agent_starting",
    "claude_not_found",
    "github_failed",
    "internal",
  ]),
  message: z.string(),
  context: z.record(z.string(), z.json()).optional(),
}) satisfies z.ZodType<ServerError>;

const scenarioEntrySchema = z.discriminatedUnion("event", [
  z.object({
    at: z.number(),
    event: z.literal("state:snapshot"),
    payload: greenhouseStateSchema,
  }),
  z.object({
    at: z.number(),
    event: z.literal("state:patch"),
    payload: statePatchSchema,
  }),
  z.object({
    at: z.number(),
    event: z.literal("terminal:data"),
    payload: terminalDataSchema,
  }),
  z.object({
    at: z.number(),
    event: z.literal("terminal:exit"),
    payload: terminalExitSchema,
  }),
  z.object({
    at: z.number(),
    event: z.literal("error"),
    payload: serverErrorSchema,
  }),
]) satisfies z.ZodType<ScenarioEntry>;

const scenarioSchema = z
  .object({
    name: z.string(),
    anchor: z.iso.datetime(),
    snapshot: greenhouseStateSchema,
    events: z.array(scenarioEntrySchema),
  })
  .refine(
    (scenario) =>
      scenario.events.every(
        (entry, i) => i === 0 || entry.at >= scenario.events[i - 1].at,
      ),
    { error: "events must be sorted by at", path: ["events"] },
  ) satisfies z.ZodType<Scenario>;

export function validateScenario(raw: unknown, source: string): Scenario {
  const result = scenarioSchema.safeParse(raw);

  if (!result.success) {
    throw new Error(
      `Invalid scenario "${source}":\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}
