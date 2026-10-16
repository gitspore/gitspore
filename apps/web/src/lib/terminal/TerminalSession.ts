import type { AgentId, SessionId, TerminalDataPayload } from "@gitspore/shared";
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

export class TerminalSession {
  // null before ack, after refusal and after exit.
  // if output delivered before open()
  // --> get session id, keep prior output
  private sessionId: SessionId | null = null;
  private waiting = false;
  private early: TerminalDataPayload[] = [];

  private readonly input: { dispose(): void };
  constructor(
    private readonly screen: TerminalScreen,
    private readonly client: GreenhouseClient,
    private readonly actions: TerminalActions,
  ) {
    client.on("terminal:data", this.onOutput);
    this.input = screen.onData(this.onInput);
  }
  async open(agentId: AgentId): Promise<void> {
    this.waiting = true;
    const sessionId = await this.actions.openTerminal(agentId);
    this.waiting = false;
    const early = this.early;
    this.early = [];
    this.sessionId = sessionId;
    for (const payload of early) {
      if (payload.sessionId === sessionId) this.screen.write(payload.chunk);
    }
  }

  // Stops listening and detaches.
  // agent running.
  dispose(): void {
    this.client.off("terminal:data", this.onOutput);
    this.input.dispose();
    if (this.sessionId) this.actions.closeTerminal(this.sessionId);
    this.sessionId = null;
  }
  // session output arrives here
  private readonly onOutput = (payload: TerminalDataPayload) => {
    if (payload.sessionId === this.sessionId) {
      this.screen.write(payload.chunk);
    } else if (this.waiting) {
      this.early.push(payload);
    }
  };

  private readonly onInput = (data: string) => {
    if (this.sessionId) this.actions.sendTerminalInput(this.sessionId, data);
  };
}
