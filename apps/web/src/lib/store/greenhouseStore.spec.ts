import type {
  Agent,
  GreenhouseState,
  Issue,
  ServerError,
  StatePatch,
} from "@gitspore/shared";
import type {
  ConnectionStatus,
  GreenhouseClient,
} from "../client/GreenhouseClient";
import { agent as baseAgent } from "../mock/scenarioFixtures";
import { bindStoreToClient, createGreenhouseStore } from "./greenhouseStore";

function agent(overrides: Partial<Agent> = {}): Agent {
  return { ...baseAgent, ...overrides };
}

function issue(number: number): Issue {
  return {
    number,
    title: `Issue ${number}`,
    url: `https://x/${number}`,
    labels: [],
  };
}

function state(overrides: Partial<GreenhouseState> = {}): GreenhouseState {
  return { version: 1, repo: null, agents: [], issues: [], ...overrides };
}

const serverError: ServerError = { code: "slot_unavailable", message: "taken" };

function setup(mode: "live" | "mock" = "live") {
  let status: ConnectionStatus = {
    kind: "offline",
    reason: "Not connected yet",
  };
  const statusListeners = new Set<() => void>();
  const client = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    now: jest.fn(() => 0),
    getStatus: jest.fn(() => status),
    subscribeStatus: jest.fn((listener: () => void) => {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    }),
  };
  const store = createGreenhouseStore(client as GreenhouseClient, mode);

  function setStatus(next: ConnectionStatus) {
    status = next;
    statusListeners.forEach((listener) => listener());
  }

  /** Calls the listener the store registered for `event`. */
  function fire(event: string, payload: unknown) {
    const call = client.on.mock.calls.find(([name]) => name === event);
    if (!call) throw new Error(`No listener registered for "${event}"`);
    call[1](payload);
  }

  /** Answers the last emit of `event` through its ack. */
  function ack(event: string, response: unknown) {
    const call = client.emit.mock.calls.findLast(([name]) => name === event);
    if (!call) throw new Error(`"${event}" was not emitted`);
    call[2](response);
  }

  return { client, store, setStatus, fire, ack, statusListeners };
}

function patch(version: number, ops: StatePatch["ops"]): StatePatch {
  return { version, ops };
}

describe("createGreenhouseStore", () => {
  it("starts without server state, selection or error", () => {
    const { store } = setup();

    expect(store.getState()).toMatchObject({
      server: null,
      selectedSlot: null,
      lastError: null,
    });
  });

  it("takes the initial connection status from the client", () => {
    const { store } = setup();

    expect(store.getState().connection).toEqual({
      kind: "offline",
      reason: "Not connected yet",
    });
  });

  it("keeps the mode it was created with", () => {
    const { store } = setup("mock");

    expect(store.getState().mode).toBe("mock");
  });

  describe("applySnapshot", () => {
    it("replaces the server state", () => {
      const { store } = setup();
      const snapshot = state({ version: 3, agents: [agent()] });

      store.getState().applySnapshot(snapshot);

      expect(store.getState().server).toBe(snapshot);
    });

    it("replaces it even when the snapshot has a lower version", () => {
      const { store } = setup();
      store.getState().applySnapshot(state({ version: 9 }));
      const older = state({ version: 1 });

      store.getState().applySnapshot(older);

      expect(store.getState().server).toBe(older);
    });

    it("leaves the UI state untouched", () => {
      const { store } = setup();
      store.getState().selectSlot(2);
      store.getState().setError(serverError);

      store.getState().applySnapshot(state());

      expect(store.getState().selectedSlot).toBe(2);
      expect(store.getState().lastError).toBe(serverError);
    });
  });

  describe("applyPatch", () => {
    it("ignores a patch before the first snapshot", () => {
      const { store, client } = setup();

      store
        .getState()
        .applyPatch(patch(1, [{ type: "agent:upsert", agent: agent() }]));

      expect(store.getState().server).toBeNull();
      expect(client.emit).not.toHaveBeenCalled();
    });

    it("applies the ops in order", () => {
      const { store } = setup();
      store.getState().applySnapshot(state({ version: 1 }));

      store.getState().applyPatch(
        patch(2, [
          { type: "agent:upsert", agent: agent({ status: "working" }) },
          { type: "agent:upsert", agent: agent({ status: "needs_input" }) },
          { type: "issue:upsert", issue: issue(5) },
          { type: "issue:remove", issueNumber: 5 },
        ]),
      );

      expect(store.getState().server).toEqual({
        version: 2,
        repo: null,
        agents: [agent({ status: "needs_input" })],
        issues: [],
      });
    });

    it("ignores a stale patch", () => {
      const { store, client } = setup();
      const snapshot = state({ version: 5 });
      store.getState().applySnapshot(snapshot);

      store
        .getState()
        .applyPatch(patch(5, [{ type: "agent:upsert", agent: agent() }]));

      expect(store.getState().server).toBe(snapshot);
      expect(client.emit).not.toHaveBeenCalled();
    });

    it("sends state:request on a gap and keeps the state", () => {
      const { store, client } = setup();
      const snapshot = state({ version: 1 });
      store.getState().applySnapshot(snapshot);

      store
        .getState()
        .applyPatch(patch(3, [{ type: "agent:upsert", agent: agent() }]));

      expect(client.emit).toHaveBeenCalledWith("state:request", {});
      expect(store.getState().server).toBe(snapshot);
    });

    it("sends state:request only once until the next snapshot", () => {
      const { store, client } = setup();
      store.getState().applySnapshot(state({ version: 1 }));

      store.getState().applyPatch(patch(3, []));
      store.getState().applyPatch(patch(4, []));

      expect(client.emit).toHaveBeenCalledTimes(1);
    });

    it("asks again for a gap after the requested snapshot arrived", () => {
      const { store, client } = setup();
      store.getState().applySnapshot(state({ version: 1 }));
      store.getState().applyPatch(patch(3, []));

      store.getState().applySnapshot(state({ version: 4 }));
      store.getState().applyPatch(patch(6, []));

      expect(client.emit).toHaveBeenCalledTimes(2);
    });

    it("clears the selection when the selected agent is removed", () => {
      const { store } = setup();
      store
        .getState()
        .applySnapshot(state({ agents: [agent({ slotIndex: 2 })] }));
      store.getState().selectSlot(2);

      store
        .getState()
        .applyPatch(patch(2, [{ type: "agent:remove", agentId: "a1" }]));

      expect(store.getState().selectedSlot).toBeNull();
    });

    it("keeps the selection when another agent is removed", () => {
      const { store } = setup();
      store.getState().applySnapshot(
        state({
          agents: [
            agent({ id: "a1", slotIndex: 0 }),
            agent({ id: "a2", slotIndex: 1 }),
          ],
        }),
      );
      store.getState().selectSlot(0);

      store
        .getState()
        .applyPatch(patch(2, [{ type: "agent:remove", agentId: "a2" }]));

      expect(store.getState().selectedSlot).toBe(0);
    });

    it("keeps the selection of an empty slot", () => {
      const { store } = setup();
      store.getState().applySnapshot(state());
      store.getState().selectSlot(3);

      store
        .getState()
        .applyPatch(patch(2, [{ type: "issue:upsert", issue: issue(1) }]));

      expect(store.getState().selectedSlot).toBe(3);
    });
  });

  describe("layout", () => {
    const windows = (store: ReturnType<typeof setup>["store"]) =>
      store.getState().layout.windows;

    it("starts with the agents panel, the scene and no windows", () => {
      const { store } = setup();

      expect(store.getState().layout).toEqual({
        sidePanel: "agents",
        mode: "scene",
        windows: [],
      });
    });

    it("setSidePanel opens a tab and closes the panel with null", () => {
      const { store } = setup();

      store.getState().setSidePanel("issues");
      expect(store.getState().layout.sidePanel).toBe("issues");

      store.getState().setSidePanel(null);
      expect(store.getState().layout.sidePanel).toBeNull();
    });

    it("setMode closes the panel for focus and brings it back for the scene", () => {
      const { store } = setup();
      store.getState().setSidePanel("issues");

      store.getState().setMode("focus");
      expect(store.getState().layout).toMatchObject({
        mode: "focus",
        sidePanel: null,
      });

      store.getState().setMode("scene");
      expect(store.getState().layout).toMatchObject({
        mode: "scene",
        sidePanel: "issues",
      });
    });

    it("setMode to the current mode changes nothing", () => {
      const { store } = setup();
      const before = store.getState().layout;

      store.getState().setMode("scene");

      expect(store.getState().layout).toBe(before);
    });

    it("openWindow adds a window at the end", () => {
      const { store } = setup();

      store.getState().openWindow("a1");
      store.getState().openWindow("a2");

      expect(windows(store)).toEqual([
        { agentId: "a1", minimised: false },
        { agentId: "a2", minimised: false },
      ]);
    });

    it("openWindow un-minimises an open window in place, without a duplicate", () => {
      const { store } = setup();
      store.getState().openWindow("a1");
      store.getState().openWindow("a2");
      store.getState().toggleMinimised("a1");

      store.getState().openWindow("a1");

      expect(windows(store)).toEqual([
        { agentId: "a1", minimised: false },
        { agentId: "a2", minimised: false },
      ]);
    });

    it("openWindow alone minimises every other window", () => {
      const { store } = setup();
      store.getState().openWindow("a1");
      store.getState().openWindow("a2");

      store.getState().openWindow("a3", { alone: true });

      expect(windows(store)).toEqual([
        { agentId: "a1", minimised: true },
        { agentId: "a2", minimised: true },
        { agentId: "a3", minimised: false },
      ]);
    });

    it("closeWindow removes the window", () => {
      const { store } = setup();
      store.getState().openWindow("a1");
      store.getState().openWindow("a2");

      store.getState().closeWindow("a1");

      expect(windows(store)).toEqual([{ agentId: "a2", minimised: false }]);
    });

    it("toggleMinimised flips one window", () => {
      const { store } = setup();
      store.getState().openWindow("a1");
      store.getState().openWindow("a2");

      store.getState().toggleMinimised("a2");

      expect(windows(store)).toEqual([
        { agentId: "a1", minimised: false },
        { agentId: "a2", minimised: true },
      ]);
    });

    it("closes the window of a removed agent", () => {
      const { store } = setup();
      store
        .getState()
        .applySnapshot(
          state({ agents: [agent({ id: "a1" }), agent({ id: "a2" })] }),
        );
      store.getState().openWindow("a1");
      store.getState().openWindow("a2");

      store
        .getState()
        .applyPatch(patch(2, [{ type: "agent:remove", agentId: "a1" }]));

      expect(windows(store)).toEqual([{ agentId: "a2", minimised: false }]);
    });

    it("keeps the same layout object when a patch closes no window", () => {
      const { store } = setup();
      store.getState().applySnapshot(state({ agents: [agent({ id: "a1" })] }));
      store.getState().openWindow("a1");
      const before = store.getState().layout;

      store
        .getState()
        .applyPatch(patch(2, [{ type: "issue:upsert", issue: issue(1) }]));

      expect(store.getState().layout).toBe(before);
    });

    it("a snapshot leaves the layout untouched", () => {
      const { store } = setup();
      store.getState().openWindow("a1");
      store.getState().setSidePanel(null);
      const before = store.getState().layout;

      store.getState().applySnapshot(state());

      expect(store.getState().layout).toBe(before);
    });
  });

  describe("commands", () => {
    it("dispatchAgent emits agent:dispatch", () => {
      const { store, client } = setup();

      store.getState().dispatchAgent(7, 2);

      expect(client.emit).toHaveBeenCalledWith(
        "agent:dispatch",
        { issueNumber: 7, slotIndex: 2 },
        expect.any(Function),
      );
    });

    it("dispatchAgent keeps a refusal as lastError", () => {
      const { store, ack } = setup();

      store.getState().dispatchAgent(7, 2);
      ack("agent:dispatch", { error: serverError });

      expect(store.getState().lastError).toBe(serverError);
    });

    it("dispatchAgent leaves lastError alone on success", () => {
      const { store, ack } = setup();

      store.getState().dispatchAgent(7, 2);
      ack("agent:dispatch", { agentId: "a1" });

      expect(store.getState().lastError).toBeNull();
    });

    it("stopAgent emits agent:stop", () => {
      const { store, client } = setup();

      store.getState().stopAgent("a1", true);

      expect(client.emit).toHaveBeenCalledWith("agent:stop", {
        agentId: "a1",
        removeWorktree: true,
      });
    });

    it("refreshIssues emits issues:refresh", () => {
      const { store, client } = setup();

      store.getState().refreshIssues();

      expect(client.emit).toHaveBeenCalledWith("issues:refresh", {});
    });

    it("openTerminal resolves with the session id", async () => {
      const { store, client, ack } = setup();

      const opened = store.getState().openTerminal("a1");
      ack("terminal:open", { sessionId: "s1" });

      await expect(opened).resolves.toBe("s1");
      expect(client.emit).toHaveBeenCalledWith(
        "terminal:open",
        { agentId: "a1" },
        expect.any(Function),
      );
    });

    it("openTerminal resolves with null and keeps a refusal as lastError", async () => {
      const { store, ack } = setup();

      const opened = store.getState().openTerminal("a1");
      ack("terminal:open", { error: serverError });

      await expect(opened).resolves.toBeNull();
      expect(store.getState().lastError).toBe(serverError);
    });

    it("chooseRepo emits repo:choose, resolves with the repo and closes the setup screen", async () => {
      const { store, client, ack } = setup();
      const repo = { path: "/r", baseBranch: "main", github: "on" } as const;
      store.getState().openSetup();

      const chosen = store.getState().chooseRepo("/r", "main");
      ack("repo:choose", { repo });

      await expect(chosen).resolves.toEqual({ repo });
      expect(client.emit).toHaveBeenCalledWith(
        "repo:choose",
        { path: "/r", baseBranch: "main" },
        expect.any(Function),
      );
      expect(store.getState().setupOpen).toBe(false);
    });

    it("chooseRepo resolves with the problems and keeps the setup screen open", async () => {
      const { store, ack } = setup();
      const problems = [{ code: "not_found", message: "/r does not exist." }];
      store.getState().openSetup();

      const chosen = store.getState().chooseRepo("/r", "main");
      ack("repo:choose", { problems });

      await expect(chosen).resolves.toEqual({ problems });
      expect(store.getState().setupOpen).toBe(true);
    });

    it("checkRepo emits repo:check and resolves with the checks", async () => {
      const { store, client, ack } = setup();
      const checks = [{ item: "git", result: "ok", detail: "r" }];

      const checked = store.getState().checkRepo("/r", "dev");
      ack("repo:check", { checks });

      await expect(checked).resolves.toEqual({ checks });
      expect(client.emit).toHaveBeenCalledWith(
        "repo:check",
        { path: "/r", baseBranch: "dev" },
        expect.any(Function),
      );
    });

    it("sends terminal input, resize and close", () => {
      const { store, client } = setup();

      store.getState().sendTerminalInput("s1", "ls\r");
      store.getState().resizeTerminal("s1", 80, 24);
      store.getState().closeTerminal("s1");

      expect(client.emit.mock.calls).toEqual([
        ["terminal:input", { sessionId: "s1", data: "ls\r" }],
        ["terminal:resize", { sessionId: "s1", cols: 80, rows: 24 }],
        ["terminal:close", { sessionId: "s1" }],
      ]);
    });
  });
});

describe("bindStoreToClient", () => {
  it("applies snapshots and patches from the client", () => {
    const { store, client, fire } = setup();
    bindStoreToClient(store, client as GreenhouseClient);

    fire("state:snapshot", state({ version: 1 }));
    fire("state:patch", patch(2, [{ type: "issue:upsert", issue: issue(4) }]));

    expect(store.getState().server).toEqual(
      state({ version: 2, issues: [issue(4)] }),
    );
  });

  it("keeps server errors as lastError", () => {
    const { store, client, fire } = setup();
    bindStoreToClient(store, client as GreenhouseClient);

    fire("error", serverError);

    expect(store.getState().lastError).toBe(serverError);
  });

  it("follows the connection status", () => {
    const { store, client, setStatus } = setup();
    bindStoreToClient(store, client as GreenhouseClient);

    setStatus({ kind: "connected" });

    expect(store.getState().connection).toEqual({ kind: "connected" });
  });

  it("takes a status that changed before binding", () => {
    const { store, client, setStatus } = setup();
    setStatus({ kind: "reconnecting" });

    bindStoreToClient(store, client as GreenhouseClient);

    expect(store.getState().connection).toEqual({ kind: "reconnecting" });
  });

  it("removes every listener it added", () => {
    const { store, client, statusListeners } = setup();
    const unbind = bindStoreToClient(store, client as GreenhouseClient);

    unbind();

    expect(client.off.mock.calls).toEqual(client.on.mock.calls);
    expect(statusListeners.size).toBe(0);
  });
});
