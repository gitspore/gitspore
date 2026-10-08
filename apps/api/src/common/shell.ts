// Picks the interactive shell a PTY session starts. Platform and env are
// parameters so callers (and tests) can resolve the shell for another OS.
export function getDefaultShell(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (platform === "win32") return "powershell.exe";
  return env.SHELL || "/bin/sh";
}
