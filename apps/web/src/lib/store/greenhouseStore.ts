import {
  applyPatch as applyStatePatch,
  type AgentId,
  type GreenhouseState,
  type ServerError,
  type SessionId,
  type StatePatch,
} from "@gitspore/shared";
import { createStore } from "zustand/vanilla";
import type {
  ConnectionStatus,
  GreenhouseClient,
} from "../client/GreenhouseClient";

export type GreenhouseStoreState = {
  server: GreenhouseState | null;

  selectedSlot: number | null;
  connection: ConnectionStatus;
  mode: "live" | "mock";
  lastError: ServerError | null;

  applySnapshot: (state: GreenhouseState) => void;
  applyPatch: (patch: StatePatch) => void;
  selectSlot: (slot: number | null) => void;
  setConnection: (status: ConnectionStatus) => void;
  setError: (error: ServerError | null) => void;
  dispatchAgent: (issueNumber: number, slotIndex: number) => void;
  stopAgent: (agentId: AgentId, removeWorktree: boolean) => void;
  refreshIssues: () => void;
  /** Resolves with the session id, or null if the daemon refused (see lastError). */
  openTerminal: (agentId: AgentId) => Promise<SessionId | null>;
  sendTerminalInput: (sessionId: SessionId, data: string) => void;
  resizeTerminal: (sessionId: SessionId, cols: number, rows: number) => void;
  closeTerminal: (sessionId: SessionId) => void;
};

export function createGreenhouseStore(
  client: GreenhouseClient,
  mode: "live" | "mock",
) {
  let snapshotRequested = false;

  return createStore<GreenhouseStoreState>()((set, get) => ({
    server: null,
    selectedSlot: null,
    connection: client.getStatus(),
    mode,
    lastError: null,
    selectSlot: (slot) => set({ selectedSlot: slot }),
    setConnection: (status) => set({ connection: status }),
    setError: (error) => set({ lastError: error }),

    // Commands. Components call these instead of client.emit. The result of
    // a command arrives as a patch; only refusals end up in lastError.
    dispatchAgent: (issueNumber, slotIndex) => {
      client.emit("agent:dispatch", { issueNumber, slotIndex }, (response) => {
        if ("error" in response) set({ lastError: response.error });
      });
    },
    stopAgent: (agentId, removeWorktree) => {
      client.emit("agent:stop", { agentId, removeWorktree });
    },
    refreshIssues: () => {
      client.emit("issues:refresh", {});
    },
    openTerminal: (agentId) =>
      new Promise((resolve) => {
        client.emit("terminal:open", { agentId }, (response) => {
          if ("error" in response) {
            set({ lastError: response.error });
            resolve(null);
          } else {
            resolve(response.sessionId);
          }
        });
      }),
    // Terminal traffic touches no state: input goes straight out, output
    // (terminal:data) goes straight to xterm.js and never through the store.
    sendTerminalInput: (sessionId, data) => {
      client.emit("terminal:input", { sessionId, data });
    },
    resizeTerminal: (sessionId, cols, rows) => {
      client.emit("terminal:resize", { sessionId, cols, rows });
    },
    closeTerminal: (sessionId) => {
      client.emit("terminal:close", { sessionId });
    },

    applySnapshot: (state) => {
      snapshotRequested = false;
      set({ server: state });
    },
    applyPatch: (patch) => {
      const { server, selectedSlot } = get();
      // Without a snapshot there is nothing to patch. It arrives on connect.
      if (server === null) return;

      const result = applyStatePatch(server, patch);
      switch (result.status) {
        case "stale":
          return;
        case "gap":
          // Every patch after a gap is a gap too. Ask once and wait for the
          // snapshot instead of asking again for each of them.
          if (snapshotRequested) return;
          snapshotRequested = true;
          client.emit("state:request", {});
          return;
        case "applied":
          set({
            server: result.state,
            selectedSlot: agentLeftSlot(server, result.state, selectedSlot)
              ? null
              : selectedSlot,
          });
      }
    },
  }));
}

export type GreenhouseStore = ReturnType<typeof createGreenhouseStore>;

/**
 * Feeds the client's events into the store and returns a function that
 * stops it. Call it before client.connect(): the first snapshot is sent
 * during connect and would be missed otherwise.
 *
 * terminal:data and terminal:exit are not handled here, they go straight to
 * the terminal and never through the store.
 */
export function bindStoreToClient(
  store: GreenhouseStore,
  client: GreenhouseClient,
): () => void {
  const { applySnapshot, applyPatch, setError, setConnection } =
    store.getState();

  client.on("state:snapshot", applySnapshot);
  client.on("state:patch", applyPatch);
  client.on("error", setError);
  const unsubscribeStatus = client.subscribeStatus(() =>
    setConnection(client.getStatus()),
  );
  // The status may have changed between creating the store and binding it.
  setConnection(client.getStatus());

  return () => {
    client.off("state:snapshot", applySnapshot);
    client.off("state:patch", applyPatch);
    client.off("error", setError);
    unsubscribeStatus();
  };
}

// True if the slot had an agent before and has none now. A selected empty
// slot (e.g. picked for a dispatch) stays selected.
function agentLeftSlot(
  before: GreenhouseState,
  after: GreenhouseState,
  slot: number | null,
): boolean {
  if (slot === null) return false;
  const hasAgent = (state: GreenhouseState) =>
    state.agents.some((agent) => agent.slotIndex === slot);
  return hasAgent(before) && !hasAgent(after);
}
