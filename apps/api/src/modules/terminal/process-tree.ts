import { execFile } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

// How long the processes get to end after SIGTERM before SIGKILL.
const GRACE_MS = 2_000;
const POLL_MS = 100;
// taskkill and ps answer in well under a second; this only stops a hang.
const COMMAND_TIMEOUT_MS = 10_000;

/**
 * Ends a process and everything it started (dev servers, test watchers, MCP
 * servers). Call it while the process still lives: the parent chain leads to
 * its children only until it is gone. Never rejects; a process that is
 * already gone is fine.
 */
export async function killTree(
  pid: number,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  // 0 and 1 would signal our own process group or init.
  if (!Number.isInteger(pid) || pid <= 1) return;
  if (platform === "win32") {
    // /T walks the parent chain, /F because console programs ignore a
    // polite close. Exit code 128 (no such process) is fine too.
    await run("taskkill", ["/T", "/F", "/PID", String(pid)]);
    return;
  }
  await killUnixTree(pid);
}

// node-pty starts the process as a session leader, so its process group
// covers what it starts. Children that open their own session (detached) come
// from the process table, found while their parent still lives.
async function killUnixTree(pid: number): Promise<void> {
  const table = await run("ps", ["-A", "-o", "pid=,ppid="]);
  const pids = [pid, ...descendantsOf(pid, parseProcessTable(table))];

  signal(pid, pids, "SIGTERM");
  const deadline = Date.now() + GRACE_MS;
  while (Date.now() < deadline) {
    if (!pids.some(isAlive)) return;
    await sleep(POLL_MS);
  }
  signal(pid, pids, "SIGKILL");
}

function signal(pid: number, pids: number[], name: NodeJS.Signals): void {
  for (const target of [-pid, ...pids]) {
    try {
      process.kill(target, name);
    } catch {
      // Already gone, or the group has no members left.
    }
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: it exists, but isn't ours to signal.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** `ps -o pid=,ppid=` output → [pid, ppid] pairs. */
export function parseProcessTable(output: string): [number, number][] {
  const pairs: [number, number][] = [];
  for (const line of output.split("\n")) {
    const [pid, ppid] = line.trim().split(/\s+/).map(Number);
    if (Number.isInteger(pid) && Number.isInteger(ppid)) {
      pairs.push([pid, ppid]);
    }
  }
  return pairs;
}

/** Children, grandchildren and so on of pid, without pid itself. */
export function descendantsOf(
  pid: number,
  table: [number, number][],
): number[] {
  const children = new Map<number, number[]>();
  for (const [child, parent] of table) {
    children.set(parent, [...(children.get(parent) ?? []), child]);
  }
  // found grows while it is walked: each child's children come after it.
  const found: number[] = [];
  for (let i = -1; i < found.length; i++) {
    const parent = i === -1 ? pid : found[i];
    for (const child of children.get(parent) ?? []) {
      if (child === pid || found.includes(child)) continue;
      found.push(child);
    }
  }
  return found;
}

// Resolves with stdout, or "" when the command fails or is missing.
function run(file: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { timeout: COMMAND_TIMEOUT_MS, windowsHide: true },
      (error, stdout) => resolve(error ? "" : stdout),
    );
  });
}
