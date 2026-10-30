import type {
  AgentId,
  SessionId,
  TerminalDataPayload,
  TerminalExitPayload,
} from "@gitspore/shared";
import type { GreenhouseClient } from "../client/GreenhouseClient";
import type { GreenhouseStoreState } from "../store/greenhouseStore";
//
//
//
// The part of xterm.js a session uses,
// tests pass fake.
export type TerminalScreen = {
  options: { disableStdin?: boolean };
  write(data: string): void;
  onData(listener: (data: string) => void): { dispose(): void };
};
// The store's terminal commands.
export type TerminalActions = Pick<
  GreenhouseStoreState,
  "openTerminal" | "sendTerminalInput" | "resizeTerminal" | "closeTerminal"
>;

// A planted agent appears at once, but the daemon starts its terminal only
// after the issue, the worktree and the push, a few seconds later. Opened in
// between, it refuses: ask again every second for half a minute (#55).
// Tests pass their own, without real waiting
export type OpenRetry = { attempts: number; wait: () => Promise<void> };
const OPEN_RETRY: OpenRetry = {
  attempts: 30,
  wait: () => new Promise((resolve) => setTimeout(resolve, 1000)),
};

export class TerminalSession {
  // null before ack, after refusal and after exit.
  // if output delivered before open()
  // --> get session id, keep prior output
  private sessionId: SessionId | null = null;
  private waiting = false;
  private early: TerminalDataPayload[] = [];
  private disposed = false;
  private size = { cols: 0, rows: 0 };
  private sentSize = { cols: 0, rows: 0 };
  private readonly input: { dispose(): void };

  constructor(
    private readonly screen: TerminalScreen,
    private readonly client: GreenhouseClient,
    private readonly actions: TerminalActions,
    private readonly retry: OpenRetry = OPEN_RETRY,
  ) {
    client.on("terminal:data", this.onOutput);
    client.on("terminal:exit", this.onExit);

    this.input = screen.onData(this.onInput);
  }
  async open(agentId: AgentId): Promise<void> {
    let sessionId: SessionId | null = null;
    for (let attempt = 1; attempt <= this.retry.attempts; attempt++) {
      if (attempt > 1) await this.retry.wait();
      // Closed while waiting: nothing was opened
      if (this.disposed) return;
      this.waiting = true;
      sessionId = await this.actions.openTerminal(agentId);
      this.waiting = false;
      if (sessionId !== null || this.disposed) break;
    }
    const early = this.early;
    this.early = [];

    // Disposed while waiting
    // (unmount, StrictMode):
    // nobody shows this session,
    // so give it back.
    if (this.disposed) {
      if (sessionId) this.actions.closeTerminal(sessionId);
      return;
    }

    if (sessionId === null) {
      this.screen.write("Could not open the terminal\r\n");
      return;
    }

    this.sessionId = sessionId;
    for (const payload of early) {
      if (payload.sessionId === sessionId) this.screen.write(payload.chunk);
    }
    this.sendSize();
  }

  // after every fit.
  // Sent on size change.
  resize(cols: number, rows: number): void {
    this.size = { cols, rows };
    this.sendSize();
  }

  // Stops listening and detaches.
  // agent running.
  dispose(): void {
    this.disposed = true;

    this.client.off("terminal:data", this.onOutput);
    this.client.off("terminal:exit", this.onExit);

    this.input.dispose();
    if (this.sessionId) this.actions.closeTerminal(this.sessionId);
    this.sessionId = null;
  }

  // open() sends size when session present.
  private sendSize(): void {
    const { cols, rows } = this.size;
    if (!this.sessionId || cols === 0) return;
    if (cols === this.sentSize.cols && rows === this.sentSize.rows) return;
    this.sentSize = this.size;
    this.actions.resizeTerminal(this.sessionId, cols, rows);
  }

  // session output arrives here
  private readonly onOutput = (payload: TerminalDataPayload) => {
    if (payload.sessionId === this.sessionId) {
      this.screen.write(payload.chunk);
    } else if (this.waiting) {
      this.early.push(payload);
    }
  };

  // screen stays, input stops.
  private readonly onExit = ({ sessionId, exitCode }: TerminalExitPayload) => {
    if (sessionId !== this.sessionId) return;
    this.screen.write(`\r\n[process exited with code ${exitCode}]\r\n`);
    this.screen.options.disableStdin = true;
    this.sessionId = null;
  };

  private readonly onInput = (data: string) => {
    if (this.sessionId) this.actions.sendTerminalInput(this.sessionId, data);
  };
}
