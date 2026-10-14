import { getDefaultShell } from "@/common/shell";
import type { IPty, IPtyForkOptions } from "node-pty";
import { TerminalError } from "./terminal-error";
import type { SessionId } from "@gitspore/shared";
import { OutputBatcher } from "./output-batcher";
import { RingBuffer } from "./ring-buffer";

export type Pty = Pick<IPty, "onData" | "onExit" | "write" | "resize" | "kill">;
export type Viewer = {
  onData: (chunk: string) => void;
  onExit: (exitCode: number) => void;
};

export type SpawnPty = (
  file: string,
  args: string[],
  options: IPtyForkOptions,
) => Pty;

export type AgentTerminalOptions = {
  cwd: string;
  command: string;
  args: string[];
  // Only tests set this, to run the Windows branch on any OS.
  platform?: NodeJS.Platform;
};

const TERMINAL_NAME = "xterm-256color";
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const REDRAW_DELAY_MS = 50;

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

// The only shell-specific code: start the user's shell, then type the command
// into it, so the shell stays usable after the command exits. To start the
// command directly instead, spawn options.command with options.args here.
// It's outside the class, so that switch never touches AgentTerminal.
//(in case we want to hardcode claude when calling the terminal.)
function startInShell(spawnPty: SpawnPty, options: AgentTerminalOptions): Pty {
  const commandLine = toCommandLine(options.command, options.args);
  const pty = spawnPty(getDefaultShell(), [], {
    name: TERMINAL_NAME,
    cols: DEFAULT_COLS,
    rows: DEFAULT_ROWS,
    cwd: options.cwd,
    env: { ...process.env, TERM: TERMINAL_NAME, COLORTERM: "truecolor" },
  });

  pty.write(`${commandLine}\r`);
  return pty;
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
  private readonly platform: NodeJS.Platform;

  constructor(
    spawnPty: SpawnPty,
    options: AgentTerminalOptions,
    private readonly onExit?: (exitCode: number) => void,
  ) {
    this.platform = options.platform ?? process.platform;
    this.pty = startInShell(spawnPty, options);
    this.pty.onData((chunk) => this.batcher.push(chunk));
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
  // would be an uncaught exception that ends the daemon.
  private resizePty(cols: number, rows: number): void {
    if (!this.exited) {
      this.pty.resize(cols, rows);
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
      this.pty.kill();
    }
  }
}
