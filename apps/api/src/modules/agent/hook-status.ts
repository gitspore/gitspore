import { AgentStatus } from "@gitspore/shared";

export type HookPayload = {
  hook_event_name: string;
  notification_type?: string;
};

export type HookOutcome =
  { kind: "set"; status: AgentStatus } | { kind: "stop" } | { kind: "keep" };

const NEEDS_INPUT_NOTIFICATIONS = new Set([
  "permission_prompt",
  "elicitation_dialog",
  "elicitation_url_dialog",
]);

export function parseHookPayload(payload: unknown): HookPayload | null {
  if (typeof payload !== "object" || payload === null) return null;

  const { hook_event_name, notification_type } = payload as Record<
    string,
    unknown
  >;

  if (typeof hook_event_name !== "string") return null;

  return {
    hook_event_name,
    notification_type:
      typeof notification_type === "string" ? notification_type : undefined,
  };
}

export function statusFromHook(payload: HookPayload): HookOutcome {
  switch (payload.hook_event_name) {
    case "UserPromptSubmit":
    case "PreToolUse":
    case "PostToolUse":
      return { kind: "set", status: "working" };
    case "PermissionRequest":
      return { kind: "set", status: "needs_input" };
    case "Notification":
      return NEEDS_INPUT_NOTIFICATIONS.has(payload.notification_type ?? "")
        ? { kind: "set", status: "needs_input" }
        : { kind: "keep" };
    case "Stop":
      return { kind: "stop" };
    case "StopFailure":
      return { kind: "set", status: "error" };
    default:
      return { kind: "keep" };
  }
}
