// Alle WebSocket-Eventnamen zentral als Konstanten
export const WS_EVENTS = {
  // Terminal Stream (PTY <-> Xterm)
  TERMINAL_INPUT: "terminal:input",
  TERMINAL_DATA: "terminal:data",
  TERMINAL_RESIZE: "terminal:resize",

  // Agenten Lifecycle
  AGENT_SPAWN: "agent:spawn",
  AGENT_STATUS: "agent:status",
  AGENT_DISMISS: "agent:dismiss",

  // 3D Biotop & Git Events
  BIOME_STATE: "biome:state",
  BRANCH_CREATED: "branch:created",
  ISSUE_DETECTED: "issue:detected",
  PR_MERGED: "pr:merged",
} as const;

// --- Payloads für Client -> Server (Next.js an NestJS) ---

export interface TerminalInputPayload {
  agentId: string;
  input: string; // Tastenanschlag oder Befehl
}

export interface TerminalResizePayload {
  agentId: string;
  cols: number;
  rows: number;
}

export interface SpawnAgentPayload {
  repoPath: string;
  taskPrompt: string;
  targetBranch?: string;
}

// --- Payloads für Server -> Client (NestJS an Next.js) ---

export interface TerminalDataPayload {
  agentId: string;
  data: string; // ANSI-Chunk aus node-pty
}

export interface AgentStatusPayload {
  agentId: string;
  status: "spawning" | "working" | "waiting_input" | "completed" | "error";
  currentBranch: string;
  activeCommand?: string;
}
