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
import type {
  LayoutSettings,
  MainMode,
  OpenWindow,
  SidePanelTab,
} from "../layout";
import { agentByKey } from "./selectors";

export type GreenhouseStoreState = {
  server: GreenhouseState | null;

  selectedSlot: number | null;
  connection: ConnectionStatus;
  mode: "live" | "mock";
  lastError: ServerError | null;

  // Layout slice: side panel, main mode, open windows.
  // Snapshots and patches only close the windows of agents that are gone.
  layout: LayoutSettings;

  applySnapshot: (state: GreenhouseState) => void;
  applyPatch: (patch: StatePatch) => void;
  selectSlot: (slot: number | null) => void;
  setConnection: (status: ConnectionStatus) => void;
  setError: (error: ServerError | null) => void;

  setSidePanel: (tab: SidePanelTab | null) => void;
  /** Focus closes the side panel; back in the scene it returns. */
  setMode: (mode: MainMode) => void;
  /**
   * Shows the agent's window: un-minimises it, or adds it at the end.
   * `alone` minimises every other window (the notification's "Open").
   */
  openWindow: (agentId: AgentId, options?: { alone?: boolean }) => void;
  closeWindow: (agentId: AgentId) => void;
  toggleMinimised: (agentId: AgentId) => void;
  /**
   * A hotbar slot was pressed, by click or key (#72): 1–6 are the pots, 0 the
   * overview agent. A visible window is minimised; otherwise the agent's
   * window shows, alone, or `beside` the open ones (shift-click, ADR 0005).
   * A slot without an agent does nothing.
   */
  pressSlot: (key: number, options?: { beside?: boolean }) => void;

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
  // The side panel before entering focus mode, to bring it back afterwards
  let panelBeforeFocus: SidePanelTab | null = null;

  return createStore<GreenhouseStoreState>()((set, get) => ({
    server: null,
    selectedSlot: null,
    connection: client.getStatus(),
    mode,
    lastError: null,
    layout: { sidePanel: "agents", mode: "scene", windows: [] },
    selectSlot: (slot) => set({ selectedSlot: slot }),
    setConnection: (status) => set({ connection: status }),
    setError: (error) => set({ lastError: error }),

    setSidePanel: (sidePanel) =>
      set((s) => ({ layout: { ...s.layout, sidePanel } })),
    setMode: (next) => {
      const { layout } = get();
      if (next === layout.mode) return;
      if (next === "focus") panelBeforeFocus = layout.sidePanel;
      set({
        layout: {
          ...layout,
          mode: next,
          sidePanel: next === "focus" ? null : panelBeforeFocus,
        },
      });
    },
    openWindow: (agentId, { alone = false } = {}) =>
      set((s) => withWindows(s, showWindow(s.layout.windows, agentId, alone))),
    closeWindow: (agentId) =>
      set((s) =>
        withWindows(
          s,
          s.layout.windows.filter((w) => w.agentId !== agentId),
        ),
      ),
    toggleMinimised: (agentId) =>
      set((s) =>
        withWindows(
          s,
          s.layout.windows.map((w) =>
            w.agentId === agentId ? { ...w, minimised: !w.minimised } : w,
          ),
        ),
      ),
    pressSlot: (key, { beside = false } = {}) => {
      const { layout } = get();
      const agent = agentByKey(key)(get());
      if (!agent) return;

      const visible = layout.windows.some(
        (w) => w.agentId === agent.id && !w.minimised,
      );
      if (visible) {
        get().toggleMinimised(agent.id);
        return;
      }
      set((s) => ({
        ...withWindows(s, showWindow(s.layout.windows, agent.id, !beside)),
        // The overview has no slot; the selection stays where it was
        selectedSlot: agent.slotIndex ?? s.selectedSlot,
      }));
    },

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
      // Windows follow agents: after a reconnect an agent can be gone (the
      // daemon restarted without the overview agent, #72), and its window
      // would only hold an empty terminal band
      const { layout } = get();
      const windows = layout.windows.filter((w) =>
        state.agents.some((agent) => agent.id === w.agentId),
      );
      set({
        server: state,
        layout:
          windows.length === layout.windows.length
            ? layout
            : { ...layout, windows },
      });
    },
    applyPatch: (patch) => {
      const { server, selectedSlot, layout } = get();
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
        case "applied": {
          // Windows follow agents: a removed agent's window closes
          const windows = layout.windows.filter(
            (w) => !agentRemoved(server, result.state, w.agentId),
          );
          set({
            server: result.state,
            selectedSlot: agentLeftSlot(server, result.state, selectedSlot)
              ? null
              : selectedSlot,
            // Same layout object when nothing closed, so readers don't re-render
            layout:
              windows.length === layout.windows.length
                ? layout
                : { ...layout, windows },
          });
        }
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

// A store change that replaces only the open windows
function withWindows(s: GreenhouseStoreState, windows: OpenWindow[]) {
  return { layout: { ...s.layout, windows } };
}

// openWindow: un-minimise the agent's window in place, or add it at the end.
// `alone` minimises every other window first.
function showWindow(
  windows: OpenWindow[],
  agentId: AgentId,
  alone: boolean,
): OpenWindow[] {
  const others = alone
    ? windows.map((w) => ({ ...w, minimised: true }))
    : windows;
  const isOpen = others.some((w) => w.agentId === agentId);
  return isOpen
    ? others.map((w) =>
        w.agentId === agentId ? { ...w, minimised: false } : w,
      )
    : [...others, { agentId, minimised: false }];
}

// True if the agent existed before and is gone now
function agentRemoved(
  before: GreenhouseState,
  after: GreenhouseState,
  agentId: AgentId,
): boolean {
  const has = (state: GreenhouseState) =>
    state.agents.some((agent) => agent.id === agentId);
  return has(before) && !has(after);
}
