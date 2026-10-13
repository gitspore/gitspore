import type { AgentId, SessionId } from "@gitspore/shared";
import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AgentTerminal, type SpawnPty, type Viewer } from "./agent-terminal";
import { TerminalError } from "./terminal-error";
import { MAX_SLOTS } from "@gitspore/shared";

//
//
//
// One terminal per slot agent, plus one for the overview agent.
const MAX_TERMINALS = MAX_SLOTS + 1;

// parameter is a function type and types don't exist at runtime,
// so Nest has nothing to look up.
// we give it a unique name instead:
export const SPAWN_PTY = Symbol("SPAWN_PTY");

export type SpawnRequest = {
  agentId: AgentId;
  cwd: string;
  command: string;
  args: string[];
};

// ownerId is the socket that opens the session (socket.id in the gateway).
export type AttachRequest = Viewer & { ownerId: string };

type Session = { agentId: AgentId; ownerId: string };

@Injectable()
export class TerminalService {
  private readonly terminals = new Map<AgentId, AgentTerminal>();
  private readonly sessions = new Map<SessionId, Session>();

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
    this.terminals.set(agentId, new AgentTerminal(this.spawnPty, options));
  }

  attach(
    agentId: AgentId,
    { ownerId, ...viewer }: AttachRequest,
  ): { sessionId: SessionId } {
    const terminal = this.terminalOf(agentId);
    const sessionId = randomUUID();
    this.sessions.set(sessionId, { agentId, ownerId });
    terminal.attach(sessionId, viewer);
    return { sessionId };
  }

  private terminalOf(agentId: AgentId): AgentTerminal {
    const terminal = this.terminals.get(agentId);
    if (terminal === undefined) {
      throw new TerminalError("agent_not_found", `No terminal for ${agentId}`);
    }
    return terminal;
  }
}
