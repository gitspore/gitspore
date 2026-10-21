import {
  MAX_SLOTS,
  type AgentId,
  type GreenhouseState,
  type Issue,
} from "@gitspore/shared";
import { AgentError } from "./agent-error";

export type DispatchRequest = { slotIndex: number; issue: Issue };
export type StopRequest = { agentId: AgentId; removeWorktree: boolean };

// Socket.io hands over whatever the client sent.
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Checks an `agent:dispatch` against the state. Synchronous on purpose: the
 * caller puts the agent into the state right after, before anything awaits,
 * so a second dispatch for the same slot or issue already sees it.
 * Throws an AgentError.
 */
export function checkDispatch(
  payload: unknown,
  state: GreenhouseState,
): DispatchRequest {
  if (
    !isObject(payload) ||
    !Number.isInteger(payload.issueNumber) ||
    (payload.issueNumber as number) <= 0 ||
    !Number.isInteger(payload.slotIndex)
  ) {
    throw new AgentError(
      "invalid_payload",
      "issueNumber must be a positive integer and slotIndex an integer",
    );
  }
  const issueNumber = payload.issueNumber as number;
  const slotIndex = payload.slotIndex as number;

  if (slotIndex < 0 || slotIndex >= MAX_SLOTS) {
    throw new AgentError(
      "slot_unavailable",
      `Slot ${slotIndex} does not exist (0 to ${MAX_SLOTS - 1})`,
      { slotIndex },
    );
  }

  const inSlot = state.agents.find((a) => a.slotIndex === slotIndex);
  if (inSlot) {
    throw new AgentError(
      "slot_unavailable",
      `Slot ${slotIndex} already has agent ${inSlot.id}`,
      { slotIndex, agentId: inSlot.id },
    );
  }

  const onIssue = state.agents.find((a) => a.issueNumber === issueNumber);
  if (onIssue) {
    throw new AgentError(
      "issue_taken",
      `Issue #${issueNumber} already has agent ${onIssue.id}`,
      { issueNumber, agentId: onIssue.id },
    );
  }

  const issue = state.issues.find((i) => i.number === issueNumber);
  if (!issue) {
    throw new AgentError("issue_not_found", `No open issue #${issueNumber}`, {
      issueNumber,
    });
  }

  return { slotIndex, issue };
}

/** Checks the shape of an `agent:stop`. Throws an AgentError. */
export function checkStop(payload: unknown): StopRequest {
  if (
    !isObject(payload) ||
    typeof payload.agentId !== "string" ||
    typeof payload.removeWorktree !== "boolean"
  ) {
    throw new AgentError(
      "invalid_payload",
      "agentId must be a string and removeWorktree a boolean",
    );
  }
  return { agentId: payload.agentId, removeWorktree: payload.removeWorktree };
}
