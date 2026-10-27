import { join } from "node:path";

// nest build copies both next to the compiled code (nest-cli.json assets).
export const HOOK_SCRIPT = join(__dirname, "hook-script.mjs");
export const STATUSLINE_SCRIPT = join(__dirname, "statusline-script.mjs");

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

type StatusLine = {
  type: "command";
  command: string;
  padding: number;
};

export function hookSettings(
  nodePath: string,
  scriptPath: string,
  statuslinePath: string,
): {
  hooks: Record<string, { hooks: Handler[] }[]>;
  statusLine: StatusLine;
} {
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
    ...statuslineSettings(statuslinePath),
  };
}

/** Only the statusline, for the overview agent, which has no hooks yet. */
export function statuslineSettings(statuslinePath: string): {
  statusLine: StatusLine;
} {
  return {
    statusLine: {
      type: "command",
      command: statusLineCommand(statuslinePath),
      padding: 0,
    },
  };
}

// Unlike a hook, the statusline is one command line for a shell: Git Bash,
// or PowerShell without it, on Windows, sh elsewhere. A quoted path as the
// first word is a string in PowerShell, not a command, so this can't use
// the daemon's own Node like the hooks do; it takes `node` from the PATH.
// Single quotes and forward slashes read the same in all three shells.
export function statusLineCommand(scriptPath: string): string {
  if (scriptPath.includes("'")) {
    throw new Error(
      `The statusline script can't run from a path with ': ${scriptPath}`,
    );
  }
  return `node '${scriptPath.replaceAll("\\", "/")}'`;
}
