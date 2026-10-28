import type { AgentId, SessionId } from "@gitspore/shared";
import { Inject, Injectable, OnApplicationShutdown } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  AgentTerminal,
  AgentTerminalOptions,
  type SpawnPty,
  type Viewer,
} from "./agent-terminal";
import { TerminalError } from "./terminal-error";
import { MAX_SLOTS } from "@gitspore/shared";

//
//
//
// One terminal per slot agent, plus one for the overview agent.
const MAX_TERMINALS = MAX_SLOTS + 1;
// How long stop() waits for a shell to exit, like AgentService's.
const STOP_TIMEOUT_MS = 10_000;
// For all terminals together when the daemon stops; they stop in parallel.
const SHUTDOWN_TIMEOUT_MS = 10_000;

// parameter is a function type and types don't exist at runtime,
// so Nest has nothing to look up.
// we give it a unique name instead:
export const SPAWN_PTY = Symbol("SPAWN_PTY");

export type SpawnRequest = {
  agentId: AgentId;
  cwd: string;
  command: string;
  args: string[];
  mode?: AgentTerminalOptions["mode"];
};

// ownerId is the socket that opens the session.
export type AttachRequest = Viewer & { ownerId: string };

// each tab (socket) gets its own session for same agent.
type Session = { agentId: AgentId; ownerId: string };

type ExitListener = (agentId: AgentId, exitCode: number) => void;
type Reviver = (agentId: AgentId) => Promise<void>;

//
//
//
@Injectable()
export class TerminalService implements OnApplicationShutdown {
  private readonly terminals = new Map<AgentId, AgentTerminal>();
  private readonly sessions = new Map<SessionId, Session>();
  private readonly exitListeners: ExitListener[] = [];
  private readonly revivers: Reviver[] = [];
  // stop() calls that wait for their agent's shell to exit.
  private readonly stopping = new Map<AgentId, (() => void)[]>();

  constructor(@Inject(SPAWN_PTY) private readonly spawnPty: SpawnPty) {}

  spawn({ agentId, ...options }: SpawnRequest): void {
    if (this.terminals.has(agentId)) {
      throw new TerminalError(
        "already_running",
        `${agentId} already has a terminal`,
      );
    }
    if (this.terminals.size >= MAX_TERMINALS) {
      throw new TerminalError(
        "limit_reached",
        `At most ${MAX_TERMINALS} terminals can run at once`,
      );
    }
    const terminal = new AgentTerminal(this.spawnPty, options, (exitCode) =>
      this.handleExit(agentId, exitCode),
    );
    this.terminals.set(agentId, terminal);
  }

  attach(
    agentId: AgentId,
    { ownerId, ...viewer }: AttachRequest,
  ): { sessionId: SessionId; scrollback: string } {
    const terminal = this.terminalOfAgent(agentId);
    const sessionId = randomUUID();
    this.sessions.set(sessionId, { agentId, ownerId });
    const scrollback = terminal.attach(sessionId, viewer);
    return { sessionId, scrollback };
  }

  write(sessionId: SessionId, ownerId: string, data: string): void {
    this.terminalOfSession(sessionId, ownerId).write(data);
  }

  // Ends the agent's process and everything it started. Throws at once for
  // an unknown agent; resolves once the kill is done, onExited follows.
  kill(agentId: AgentId): Promise<void> {
    return this.terminalOfAgent(agentId).kill();
  }

  resize(
    sessionId: SessionId,
    ownerId: string,
    cols: number,
    rows: number,
  ): void {
    this.terminalOfSession(sessionId, ownerId).resize(cols, rows);
  }

  detach(sessionId: SessionId, ownerId: string): void {
    const terminal = this.terminalOfSession(sessionId, ownerId);
    this.sessions.delete(sessionId);
    terminal.detach(sessionId);
  }

  // call from gateway when its
  // socket disconnects, so a closed tab is not a viewer anymore.
  detachOwner(ownerId: string): void {
    for (const [sessionId, session] of this.sessions) {
      if (session.ownerId === ownerId) {
        this.detach(sessionId, ownerId);
      }
    }
  }

  /**
   * Ends an agent's terminal and resolves with true once its shell has
   * exited, after the exit listeners. Spawning the same agent again before
   * that would fail with already_running. Resolves with false when the shell
   * is still there after timeoutMs, so a caller (a repo switch) never waits
   * forever; the terminal then stays known until it does exit. Resolves with
   * true at once without a terminal.
   */
  stop(agentId: AgentId, timeoutMs = STOP_TIMEOUT_MS): Promise<boolean> {
    const terminal = this.terminals.get(agentId);
    if (terminal === undefined) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const exited = () => {
        clearTimeout(timer);
        resolve(true);
      };
      const timer = setTimeout(() => {
        this.stopping.set(
          agentId,
          (this.stopping.get(agentId) ?? []).filter((w) => w !== exited),
        );
        resolve(false);
      }, timeoutMs);
      this.stopping.set(agentId, [
        ...(this.stopping.get(agentId) ?? []),
        exited,
      ]);
      void terminal.kill();
    });
  }

  // The daemon stops (enableShutdownHooks in main.ts): end every terminal
  // and what it started, all at once, so the whole stop takes at most
  // SHUTDOWN_TIMEOUT_MS and leaves no orphans.
  async onApplicationShutdown(): Promise<void> {
    await Promise.all(
      [...this.terminals.keys()].map((agentId) =>
        this.stop(agentId, SHUTDOWN_TIMEOUT_MS),
      ),
    );
  }

  onExited(listener: ExitListener): void {
    this.exitListeners.push(listener);
  }

  /**
   * Asked when a terminal is opened for an agent that has none: the agent
   * module starts its Claude Code again (#102). A reviver ignores agents
   * that aren't its own; attach() then refuses them as before.
   */
  onMissing(reviver: Reviver): void {
    this.revivers.push(reviver);
  }

  /** Gives the agent a terminal again if it has none and a reviver can. */
  async revive(agentId: AgentId): Promise<void> {
    if (this.terminals.has(agentId)) return;
    for (const reviver of this.revivers) await reviver(agentId);
  }

  // -------------private helpers:-----------------------
  private terminalOfAgent(agentId: AgentId): AgentTerminal {
    const terminal = this.terminals.get(agentId);
    if (terminal === undefined) {
      throw new TerminalError("agent_not_found", `No terminal for ${agentId}`);
    }
    return terminal;
  }

  private terminalOfSession(
    sessionId: SessionId,
    ownerId: string,
  ): AgentTerminal {
    const session = this.sessions.get(sessionId);
    if (session === undefined || session.ownerId !== ownerId) {
      throw new TerminalError("session_not_found", `No session ${sessionId}`);
    }
    return this.terminalOfAgent(session.agentId);
  }

  private forget(agentId: AgentId): void {
    this.terminals.delete(agentId);
    for (const [sessionId, session] of this.sessions) {
      if (session.agentId === agentId) {
        this.sessions.delete(sessionId);
      }
    }
  }

  private handleExit(agentId: AgentId, exitCode: number): void {
    this.forget(agentId);
    for (const listener of this.exitListeners) {
      listener(agentId, exitCode);
    }
    for (const resolve of this.stopping.get(agentId) ?? []) {
      resolve();
    }
    this.stopping.delete(agentId);
  }
}
