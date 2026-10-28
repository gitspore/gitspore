import { getDefaultShell } from "@/common/shell";
import type { IPty, IPtyForkOptions } from "node-pty";
import { TerminalError } from "./terminal-error";
import type { SessionId } from "@gitspore/shared";
import { OutputBatcher } from "./output-batcher";
import { RingBuffer } from "./ring-buffer";
import { killTree, startedAt } from "./process-tree";

export type Pty = Pick<
  IPty,
  "pid" | "onData" | "onExit" | "write" | "resize" | "kill"
>;
export type Viewer = {
  onData: (chunk: string) => void;
  onExit: (exitCode: number) => void;
};

export type SpawnPty = (
  file: string,
  args: string[] | string,
  options: IPtyForkOptions,
) => Pty;

export type AgentTerminalOptions = {
  cwd: string;
  command: string;
  args: string[];
  // Only tests set this, to run the Windows branch on any OS.
  platform?: NodeJS.Platform;
  mode?: "shell" | "exec";
  // Only tests set these, to see kill() without ending real processes.
  killTree?: typeof killTree;
  startedAt?: typeof startedAt;
};

const TERMINAL_NAME = "xterm-256color";
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const REDRAW_DELAY_MS = 50;
// ConPTY can send its first bytes a moment before the process exists.
const START_SLACK_MS = 1_000;

// Arguments are typed into the shell unquoted,
// so anything else (spaces, quotes, $, ;, `, \, @) is refused.
const SAFE_ARGUMENT = /^[\w./:=+-]+$/;

function toCommandLine(command: string, args: string[]): string {
  const parts = [command, ...args];
  const unsafe = parts.find((part) => !SAFE_ARGUMENT.test(part));
  if (unsafe !== undefined) {
    throw new TerminalError(
      "unsafe_argument",
      `Refusing to type ${JSON.stringify(unsafe)} into the shell`,
    );
  }
  return parts.join(" ");
}

function ptyOptions(cwd: string): IPtyForkOptions {
  return {
    name: TERMINAL_NAME,
    cols: DEFAULT_COLS,
    rows: DEFAULT_ROWS,
    cwd,
    env: { ...process.env, TERM: TERMINAL_NAME, COLORTERM: "truecolor" },
  };
}
// The only shell-specific code: start the user's shell, then type the command
// into it, so the shell stays usable after the command exits. To start the
// command directly instead, spawn options.command with options.args here.
// It's outside the class, so that switch never touches AgentTerminal.
//(in case we want to hardcode claude when calling the terminal.)
function startInShell(spawnPty: SpawnPty, options: AgentTerminalOptions): Pty {
  const commandLine = toCommandLine(options.command, options.args);
  const platform = options.platform ?? process.platform;
  // ConPTY can drop keys typed before PowerShell reads input,
  // so Windows gets the command as an argument.
  // -NoExit keeps the shell afterwards.
  const shellArgs =
    platform === "win32" ? ["-NoExit", "-Command", commandLine] : [];

  const pty = spawnPty(
    getDefaultShell(platform),
    shellArgs,
    ptyOptions(options.cwd),
  );

  if (platform !== "win32") {
    pty.write(`${commandLine}\r`);
  }
  return pty;
}

// Characters cmd.exe reads as syntax even inside quotes, or that end the
// quoted command line early. Measured on Windows: with none of them in the
// arguments, the prompt arrives as one argument.
const CMD_UNSAFE = /[&|<>^%"\r\n]/;

function toExecCommand(
  command: string,
  args: string[],
  platform: NodeJS.Platform,
): { file: string; args: string[] | string } {
  const needsCmd = platform === "win32" && /\.(cmd|bat)$/i.test(command);
  if (!needsCmd) {
    return { file: command, args };
  }
  const unsafe = args.find((a) => CMD_UNSAFE.test(a));
  if (unsafe !== undefined) {
    throw new TerminalError(
      "unsafe_argument",
      `Refusing to type ${JSON.stringify(unsafe)} into the shell`,
    );
  }

  const quoted = [command, ...args].map((part) => `"${part}"`).join(" ");
  return { file: "cmd.exe", args: `/d /s /c "${quoted}"` };
}

function startDirectly(spawnPty: SpawnPty, options: AgentTerminalOptions): Pty {
  const platform = options.platform ?? process.platform;
  const { file, args } = toExecCommand(options.command, options.args, platform);
  return spawnPty(file, args, ptyOptions(options.cwd));
}

export class AgentTerminal {
  private readonly pty: Pty;
  private readonly scrollback = new RingBuffer();
  private readonly batcher = new OutputBatcher((chunk) =>
    this.broadcast(chunk),
  );
  private readonly viewers = new Map<SessionId, Viewer>();
  private cols = DEFAULT_COLS;
  private rows = DEFAULT_ROWS;
  private exited = false;
  private killing?: Promise<void>;
  // Windows: when the process started, looked up at its first output, so
  // kill() never ends a process that got the pid after it (#53).
  private started?: Promise<number | undefined>;
  private readonly platform: NodeJS.Platform;
  private readonly killTree: typeof killTree;
  private readonly startedAt: typeof startedAt;

  constructor(
    spawnPty: SpawnPty,
    options: AgentTerminalOptions,
    private readonly onExit?: (exitCode: number) => void,
  ) {
    this.platform = options.platform ?? process.platform;
    this.killTree = options.killTree ?? killTree;
    this.startedAt = options.startedAt ?? startedAt;
    this.pty =
      options.mode === "exec"
        ? startDirectly(spawnPty, options)
        : startInShell(spawnPty, options);

    this.pty.onData((chunk) => {
      this.noteStart();
      this.batcher.push(chunk);
    });
    this.pty.onExit(({ exitCode }) => this.handleExit(exitCode));
  }

  attach(sessionId: SessionId, viewer: Viewer): string {
    const scrollback = this.scrollback.contents();
    this.viewers.set(sessionId, viewer);
    this.nudgeRedraw();
    return scrollback;
  }

  detach(sessionId: SessionId): void {
    this.viewers.delete(sessionId);
  }

  write(data: string): void {
    if (this.exited) {
      return;
    }
    this.pty.write(data);
  }

  resize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    this.resizePty(cols, rows);
  }

  // Ends the process and everything it started (#53). The tree first, while
  // the parent chain still leads from the process to its children, then the
  // PTY. Resolves once both are done; onExit may come a moment later.
  kill(): Promise<void> {
    if (this.exited) {
      return Promise.resolve();
    }
    this.killing ??= (async () => {
      await this.killTree(this.pty.pid, this.platform, await this.started);
      if (!this.exited) this.release();
    })();
    return this.killing;
  }

  // Windows only: ConPTY knows the pid only once the process runs, so it is
  // looked up at the first output that comes with a pid. A start after that
  // output means the pid already went to another process: no start, and
  // kill() leaves the tree alone.
  private noteStart(): void {
    if (this.started || this.platform !== "win32" || this.pty.pid <= 1) {
      return;
    }
    const seen = Date.now();
    this.started = this.startedAt(this.pty.pid, this.platform).then(
      (started) =>
        started !== undefined && started <= seen + START_SLACK_MS
          ? started
          : undefined,
    );
  }

  private broadcast(chunk: string): void {
    this.scrollback.push(chunk);
    for (const viewer of this.viewers.values()) {
      viewer.onData(chunk);
    }
  }

  // Full-screen programs redraw only when their size changes, and Node
  // apps ignore a change that is undone before they handle the signal.
  // So: one column wider now, back to the real size a moment later.
  private nudgeRedraw(): void {
    this.resizePty(this.cols + 1, this.rows);
    setTimeout(() => this.resizePty(this.cols, this.rows), REDRAW_DELAY_MS);
  }

  // node-pty throws when an exited PTY is resized, and in a timer that
  // would be an uncaught exception that ends the daemon. On Windows the
  // shell can be gone before onExit fires, so the flag alone isn't enough.
  private resizePty(cols: number, rows: number): void {
    if (this.exited) {
      return;
    }
    try {
      this.pty.resize(cols, rows);
    } catch {
      // The shell has just exited; onExit follows.
    }
  }

  private handleExit(exitCode: number): void {
    this.exited = true;
    this.batcher.flush();
    for (const viewer of this.viewers.values()) {
      viewer.onExit(exitCode);
    }
    this.onExit?.(exitCode);
    // ConPTY (win) keeps its pipes open after the shell exits, until kill()
    // releases them (docs/decisions.md, "Offen für GS-03").
    if (this.platform === "win32") {
      this.release();
    }
  }

  private release(): void {
    try {
      this.pty.kill();
    } catch {
      // The process has just exited on its own; onExit follows.
    }
  }
}
