import { execFile } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

// How long the processes get to end after SIGTERM before SIGKILL.
const GRACE_MS = 2_000;
const POLL_MS = 100;
// ps and PowerShell answer within seconds; this only stops a hang.
const COMMAND_TIMEOUT_MS = 15_000;

/** One row of the process table. started: ms since 1970, Windows only. */
export type ProcessInfo = { pid: number; ppid: number; started?: number };

// Windows: pid, parent pid and start time (ms) per line. CreationDate is
// empty for the idle process, so it is left out.
const WINDOWS_TABLE =
  "Get-CimInstance Win32_Process | ForEach-Object { if ($_.CreationDate) { " +
  "'{0} {1} {2}' -f $_.ProcessId, $_.ParentProcessId, " +
  "[math]::Floor($_.CreationDate.ToUniversalTime().Subtract(" +
  "[datetime]'1970-01-01').TotalMilliseconds) } }";

/**
 * Windows: when the process with this pid started, to tell it later from a
 * process that got the pid after it ended (Windows hands out pids again at
 * once). undefined when it is gone or the table can't be read.
 */
export async function startedAt(
  pid: number,
  platform: NodeJS.Platform = process.platform,
): Promise<number | undefined> {
  if (platform !== "win32" || !isOwnPid(pid)) return undefined;
  const table = await processTable(platform);
  return table.find((row) => row.pid === pid)?.started;
}

/**
 * Ends a process and everything it started (dev servers, test watchers, MCP
 * servers). Call it while the process still lives: the parent chain leads to
 * its children only until it is gone. Never rejects; a process that is
 * already gone is fine.
 *
 * Windows needs `started` from startedAt(): without it, or when the pid now
 * belongs to a process that started at another time, nothing is killed.
 */
export async function killTree(
  pid: number,
  platform: NodeJS.Platform = process.platform,
  started?: number,
): Promise<void> {
  if (!isOwnPid(pid)) return;
  const table = await processTable(platform);
  if (platform === "win32") {
    for (const target of victims(pid, started, table)) {
      try {
        process.kill(target);
      } catch {
        // Gone in the meantime.
      }
    }
    return;
  }
  await killUnixTree(pid, table);
}

// 0 and 1 would signal our own process group or init.
function isOwnPid(pid: number): boolean {
  return Number.isInteger(pid) && pid > 1;
}

/**
 * Windows: the pids to kill, the process last. Empty unless the pid still
 * belongs to the process that started at `started`. Not taskkill /T: Windows
 * never updates a parent pid, so /T also hits processes whose dead parent
 * once had this pid, and a pid that was handed out again.
 */
export function victims(
  pid: number,
  started: number | undefined,
  table: ProcessInfo[],
): number[] {
  const root = table.find((row) => row.pid === pid);
  if (started === undefined || root?.started !== started) return [];
  return [...descendantsOf(pid, table), pid];
}

// node-pty starts the process as a session leader, so its process group
// covers what it starts. Children that open their own session (detached) come
// from the process table, found while their parent still lives. A parent
// that dies hands its children to init, so ps never shows a stale parent.
async function killUnixTree(pid: number, table: ProcessInfo[]): Promise<void> {
  const pids = [pid, ...descendantsOf(pid, table)];

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

async function processTable(platform: NodeJS.Platform) {
  const output =
    platform === "win32"
      ? await run("powershell.exe", [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          WINDOWS_TABLE,
        ])
      : await run("ps", ["-A", "-o", "pid=,ppid="]);
  return parseProcessTable(output);
}

/** "pid ppid" or "pid ppid started" per line → rows. */
export function parseProcessTable(output: string): ProcessInfo[] {
  const rows: ProcessInfo[] = [];
  for (const line of output.split("\n")) {
    const [pid, ppid, started] = line.trim().split(/\s+/).map(Number);
    if (!Number.isInteger(pid) || !Number.isInteger(ppid)) continue;
    rows.push(
      Number.isFinite(started) ? { pid, ppid, started } : { pid, ppid },
    );
  }
  return rows;
}

/**
 * Children, grandchildren and so on of pid, without pid itself. A child
 * that started before its parent isn't one: its real parent died, and the
 * pid went to another process (Windows).
 */
export function descendantsOf(pid: number, table: ProcessInfo[]): number[] {
  const byPid = new Map(table.map((row) => [row.pid, row]));
  const children = new Map<number, ProcessInfo[]>();
  for (const row of table) {
    children.set(row.ppid, [...(children.get(row.ppid) ?? []), row]);
  }
  // found grows while it is walked: each child's children come after it.
  const found: number[] = [];
  for (let i = -1; i < found.length; i++) {
    const parent = i === -1 ? pid : found[i];
    const parentStarted = byPid.get(parent)?.started;
    for (const child of children.get(parent) ?? []) {
      if (child.pid === pid || found.includes(child.pid)) continue;
      if (
        parentStarted !== undefined &&
        child.started !== undefined &&
        child.started < parentStarted
      ) {
        continue;
      }
      found.push(child.pid);
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
