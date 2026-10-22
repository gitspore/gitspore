export const HOOK_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PermissionRequest",
  "Notification",
  "Stop",
  "StopFailure",
] as const;

const TIMEOUT_S = 5;

type Handler = {
  type: "command";
  command: string;
  args: string[];
  timeout: number;
};

export function hookSettings(
  nodePath: string,
  scriptPath: string,
): { hooks: Record<string, { hooks: Handler[] }[]> } {
  const handler: Handler = {
    type: "command",
    command: nodePath,
    args: [scriptPath],
    timeout: TIMEOUT_S,
  };

  return {
    hooks: Object.fromEntries(
      HOOK_EVENTS.map((event) => [event, [{ hooks: [handler] }]]),
    ),
  };
}
