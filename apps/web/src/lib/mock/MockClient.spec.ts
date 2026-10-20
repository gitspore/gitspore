import type {
  Agent,
  AgentDispatchAck,
  AgentStatus,
  GreenhouseState,
  RepoCheckAck,
  RepoChooseAck,
  ServerError,
  StatePatch,
  TerminalOpenAck,
} from "@gitspore/shared";
import { createFakeClock } from "./clock.fake";
import { MockClient } from "./MockClient";
import type { ScenarioEntry } from "./scenario";
import { agent, ANCHOR, data, makeScenario } from "./scenarioFixtures";

const GREETING = "Claude Code (mock)\r\n> ready\r\n$ ";

function patchEntry(
  at: number,
  version: number,
  status: AgentStatus,
): ScenarioEntry {
  return {
    at,
    event: "state:patch",
    payload: {
      version,
      ops: [{ type: "agent:upsert", agent: { ...agent, status } }],
    },
  };
}

// A connected client that records what it receives.
function setup(events: ScenarioEntry[] = [], agents?: Agent[]) {
  const clock = createFakeClock(Date.parse(ANCHOR));
  const client = new MockClient(makeScenario(events, agents), clock);
  const patches: StatePatch[] = [];
  const snapshots: GreenhouseState[] = [];
  const chunks: string[] = [];
  const errors: ServerError[] = [];
  client.on("state:patch", (patch) => patches.push(patch));
  client.on("state:snapshot", (state) => snapshots.push(state));
  client.on("terminal:data", (payload) => chunks.push(payload.chunk));
  client.on("error", (error) => errors.push(error));
  client.connect();
  return { clock, client, patches, snapshots, chunks, errors };
}

function dispatchAgent(client: MockClient): AgentDispatchAck {
  const acks: AgentDispatchAck[] = [];
  client.emit("agent:dispatch", { issueNumber: 2, slotIndex: 1 }, (ack) =>
    acks.push(ack),
  );
  return acks[0];
}

function openTerminal(client: MockClient, agentId: string): TerminalOpenAck {
  const acks: TerminalOpenAck[] = [];
  client.emit("terminal:open", { agentId }, (ack) => acks.push(ack));
  return acks[0];
}

function chooseRepo(client: MockClient, path: string): RepoChooseAck {
  const acks: RepoChooseAck[] = [];
  client.emit("repo:choose", { path }, (ack) => acks.push(ack));
  return acks[0];
}

function checkRepo(client: MockClient, path: string): RepoCheckAck {
  const acks: RepoCheckAck[] = [];
  client.emit("repo:check", { path }, (ack) => acks.push(ack));
  return acks[0];
}

function sessionOf(ack: TerminalOpenAck): string {
  if ("error" in ack) throw new Error("expected a session");
  return ack.sessionId;
}

describe("MockClient", () => {
  it("delivers the snapshot to a listener registered before connect", () => {
    const clock = createFakeClock(Date.parse(ANCHOR));
    const client = new MockClient(makeScenario(), clock);
    const listener = jest.fn();
    client.on("state:snapshot", listener);

    client.connect();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("delivers events only to listeners of that event", () => {
    const clock = createFakeClock(Date.parse(ANCHOR));
    const client = new MockClient(makeScenario([data(100, "a")]), clock);
    const onData = jest.fn();
    const onError = jest.fn();
    client.on("terminal:data", onData);
    client.on("error", onError);
    client.connect();

    clock.advance(100);

    expect(onData).toHaveBeenCalledWith({ sessionId: "s", chunk: "a" });
    expect(onError).not.toHaveBeenCalled();
  });

  it("stops delivering to a listener after off", () => {
    const clock = createFakeClock(Date.parse(ANCHOR));
    const client = new MockClient(makeScenario([data(100, "a")]), clock);
    const listener = jest.fn();
    client.on("terminal:data", listener);
    client.connect();

    client.off("terminal:data", listener);
    clock.advance(100);

    expect(listener).not.toHaveBeenCalled();
  });

  it("delivers nothing after disconnect", () => {
    const clock = createFakeClock(Date.parse(ANCHOR));
    const client = new MockClient(makeScenario([data(100, "a")]), clock);
    const listener = jest.fn();
    client.on("terminal:data", listener);
    client.connect();

    client.disconnect();
    clock.advance(100);

    expect(listener).not.toHaveBeenCalled();
  });

  it("ignores emit", () => {
    const client = new MockClient(makeScenario());

    expect(() => client.emit("state:request", {})).not.toThrow();
  });
  describe("agent:dispatch", () => {
    it("acks, then sends starting and one and a half seconds later working", () => {
      const { client, clock, patches } = setup();

      const ack = dispatchAgent(client);

      expect(ack).toEqual({ agentId: "mock-agent-1" });
      expect(patches).toHaveLength(1);
      expect(patches[0].version).toBe(2);
      expect(patches[0].ops[0]).toMatchObject({
        type: "agent:upsert",
        agent: { id: "mock-agent-1", status: "starting" },
      });

      clock.advance(1499);
      expect(patches).toHaveLength(1);

      clock.advance(1);
      expect(patches).toHaveLength(2);
      expect(patches[1].version).toBe(3);
      expect(patches[1].ops[0]).toMatchObject({
        agent: { id: "mock-agent-1", status: "working" },
      });
    });

    it("numbers the scenario's patches after its own", () => {
      const { client, clock, patches } = setup([patchEntry(3000, 2, "done")]);

      dispatchAgent(client);
      clock.advance(3000);

      expect(patches.map((patch) => patch.version)).toEqual([2, 3, 4]);
    });
  });

  describe("agent:stop", () => {
    it("removes the agent with a patch", () => {
      const { client, patches } = setup();

      client.emit("agent:stop", { agentId: agent.id, removeWorktree: true });

      expect(patches).toEqual([
        { version: 2, ops: [{ type: "agent:remove", agentId: agent.id }] },
      ]);
    });

    it("reports an unknown agent as an error", () => {
      const { client, patches, errors } = setup();

      client.emit("agent:stop", { agentId: "nope", removeWorktree: false });

      expect(patches).toHaveLength(0);
      expect(errors).toEqual([
        expect.objectContaining({
          code: "agent_not_found",
          context: { agentId: "nope" },
        }),
      ]);
    });
  });

  describe("repo:check", () => {
    it("passes every check for a plain path and changes nothing", () => {
      const { client, snapshots } = setup([], []);

      expect(checkRepo(client, "/home/dev/shop")).toEqual({
        checks: [
          { item: "git", result: "ok", detail: "shop" },
          { item: "base_branch", result: "ok", detail: "main exists" },
          { item: "github", result: "ok", detail: expect.any(String) },
          { item: "claude", result: "ok", detail: "found" },
        ],
      });
      expect(snapshots).toHaveLength(1); // only the one of connect
    });

    it("leaves out the repo checks without a git repo", () => {
      const { client } = setup([], []);

      expect(
        checkRepo(client, "/home/dev/not-git").checks.map((c) => c.item),
      ).toEqual(["git", "claude"]);
    });

    it.each([
      ["/home/dev/missing", "git", "fail"],
      ["/home/dev/no-branch", "base_branch", "fail"],
      ["/home/dev/no-github", "github", "warn"],
      ["/home/dev/no-claude", "claude", "fail"],
    ])("reports %s as %s %s", (path, item, result) => {
      const { client } = setup([], []);

      expect(checkRepo(client, path).checks).toContainEqual(
        expect.objectContaining({ item, result }),
      );
    });
  });

  describe("repo:choose", () => {
    it("acks with the repo and sends a snapshot of it without agents", () => {
      const { client, snapshots } = setup([], []);

      const ack = chooseRepo(client, "/home/dev/shop");

      expect(ack).toEqual({
        repo: { path: "/home/dev/shop", baseBranch: "main", github: "on" },
      });
      expect(snapshots).toHaveLength(2); // connect, then the new repo
      expect(snapshots[1]).toMatchObject({
        version: 2,
        repo: { path: "/home/dev/shop" },
        agents: [],
      });
    });

    it("turns GitHub off for a path with no-github", () => {
      const { client } = setup([], []);

      expect(chooseRepo(client, "/home/dev/no-github")).toMatchObject({
        repo: { github: "off" },
      });
    });

    it.each([
      ["/home/dev/missing", "not_found"],
      ["/home/dev/not-git", "not_a_repo"],
      ["/home/dev/no-branch", "no_base_branch"],
    ])("refuses %s with %s and keeps the state", (path, code) => {
      const { client, snapshots } = setup([], []);

      expect(chooseRepo(client, path)).toEqual({
        problems: [expect.objectContaining({ code })],
      });
      expect(snapshots).toHaveLength(1); // only the one of connect
    });

    it("refuses while an agent with a slot runs", () => {
      const { client } = setup(); // the fixture's agent sits in slot 0

      expect(chooseRepo(client, "/home/dev/shop")).toEqual({
        problems: [expect.objectContaining({ code: "agents_running" })],
      });
    });

    it("does not count the overview agent as running", () => {
      const { client } = setup([], [{ ...agent, slotIndex: null }]);

      expect(chooseRepo(client, "/home/dev/shop")).toHaveProperty("repo");
    });

    it("stops the scenario, whose events belong to the old repo", () => {
      const { client, clock, patches } = setup(
        [patchEntry(1000, 2, "done")],
        [],
      );

      chooseRepo(client, "/home/dev/shop");
      clock.advance(1000);

      expect(patches).toHaveLength(0);
    });
  });

  describe("snapshots on request", () => {
    it.each(["state:request", "issues:refresh"] as const)(
      "%s answers with the current state",
      (event) => {
        const { client, clock, snapshots } = setup([
          patchEntry(100, 2, "done"),
        ]);
        clock.advance(100);

        client.emit(event, {});

        expect(snapshots).toHaveLength(2); // connect, then the answer
        expect(snapshots[1].version).toBe(2);
        expect(snapshots[1].agents[0].status).toBe("done");
      },
    );

    it("keeps the version gap of a scenario, and recovers from it", () => {
      const { client, clock, patches, snapshots } = setup([
        patchEntry(100, 2, "working"),
        patchEntry(200, 4, "done"),
      ]);

      clock.advance(200);
      expect(patches.map((patch) => patch.version)).toEqual([2, 4]);

      client.emit("state:request", {});
      expect(snapshots.at(-1)?.version).toBe(4);
      expect(snapshots.at(-1)?.agents[0].status).toBe("done");
    });
  });

  describe("terminal", () => {
    it("answers an unknown agent with an error", () => {
      const { client } = setup();

      expect(openTerminal(client, "nobody")).toEqual({
        error: { code: "agent_not_found", message: "No agent nobody" },
      });
    });

    it("opens a session and sends the greeting line by line", () => {
      const { client, clock, chunks } = setup();

      const ack = openTerminal(client, agent.id);

      expect(sessionOf(ack)).toBe("mock-session-1");
      clock.advance(150);
      expect(chunks).toEqual(["Claude Code (mock)\r\n"]);

      clock.advance(300);
      expect(chunks.join("")).toBe(GREETING);
    });

    it("echoes input and shows Enter as a new line", () => {
      const { client, chunks } = setup();
      const sessionId = sessionOf(openTerminal(client, agent.id));

      client.emit("terminal:input", { sessionId, data: "ls\r" });

      expect(chunks).toEqual(["ls\r\n"]);
    });

    it("reports input to an unknown session as an error", () => {
      const { client, errors, chunks } = setup();

      client.emit("terminal:input", { sessionId: "nope", data: "x" });

      expect(chunks).toEqual([]);
      expect(errors).toEqual([
        { code: "session_not_found", message: "No session nope" },
      ]);
    });

    it("stops the greeting and refuses input once the session is closed", () => {
      const { client, clock, chunks, errors } = setup();
      const sessionId = sessionOf(openTerminal(client, agent.id));

      client.emit("terminal:close", { sessionId });
      clock.advance(1000);
      client.emit("terminal:input", { sessionId, data: "x" });

      expect(chunks).toEqual([]);
      expect(errors[0].code).toBe("session_not_found");
    });
  });

  describe("disconnect", () => {
    it("cancels what the mock itself has planned", () => {
      const { client, clock, patches, chunks } = setup();
      dispatchAgent(client); // plans "working"
      openTerminal(client, agent.id); // plans the greeting

      client.disconnect();
      clock.advance(5000);

      expect(patches).toHaveLength(1); // only "starting"
      expect(chunks).toEqual([]);
    });

    it("closes all sessions", () => {
      const { client, errors } = setup();
      const sessionId = sessionOf(openTerminal(client, agent.id));

      client.disconnect();
      client.connect();
      client.emit("terminal:input", { sessionId, data: "x" });

      expect(errors[0].code).toBe("session_not_found");
    });
  });

  describe("commands before connect", () => {
    // Not connected: no scenario yet, so nothing can have been sent.
    function idle(events: ScenarioEntry[] = []) {
      const clock = createFakeClock(Date.parse(ANCHOR));
      const client = new MockClient(makeScenario(events), clock);
      const log: string[] = [];
      const patches: StatePatch[] = [];
      client.on("state:snapshot", () => log.push("snapshot"));
      client.on("state:patch", (patch) => {
        log.push("patch");
        patches.push(patch);
      });
      return { clock, client, log, patches };
    }

    it("waits, and runs after the snapshot of connect", () => {
      const { client, log, patches } = idle();
      const acks: AgentDispatchAck[] = [];

      client.emit("agent:dispatch", { issueNumber: 2, slotIndex: 1 }, (ack) => {
        log.push("ack");
        acks.push(ack);
      });
      expect(log).toEqual([]);

      client.connect();

      expect(log).toEqual(["snapshot", "ack", "patch"]);
      expect(acks[0]).toEqual({ agentId: "mock-agent-1" });
      expect(patches[0].version).toBe(2); // after the snapshot's version 1
    });

    it("keeps the agent and its turn to working", () => {
      const { client, clock, log } = idle();
      client.emit("agent:dispatch", { issueNumber: 2, slotIndex: 1 }, () => {});

      client.connect();
      clock.advance(1500);

      expect(log).toEqual(["snapshot", "patch", "patch"]);
    });

    it("runs several commands in the order they were sent", () => {
      const { client } = idle();
      const ids: string[] = [];

      for (const issueNumber of [1, 2, 3]) {
        client.emit("agent:dispatch", { issueNumber, slotIndex: 0 }, (ack) => {
          if ("agentId" in ack) ids.push(ack.agentId);
        });
      }
      client.connect();

      expect(ids).toEqual(["mock-agent-1", "mock-agent-2", "mock-agent-3"]);
    });

    it("runs each command only once, also over a restart", () => {
      const { client, log } = idle();
      client.emit("agent:dispatch", { issueNumber: 2, slotIndex: 1 }, () => {});

      client.connect();
      client.restart();

      expect(log.filter((entry) => entry === "snapshot")).toHaveLength(2);
      expect(log.filter((entry) => entry === "patch")).toHaveLength(1);
    });

    it("also waits after disconnect", () => {
      const { client, log } = idle();
      client.connect();
      client.disconnect();
      log.length = 0;

      client.emit("state:request", {});
      expect(log).toEqual([]);

      client.connect();
      expect(log).toEqual(["snapshot", "snapshot"]); // connect, then the answer
    });
  });

  describe("playback controls", () => {
    it("exposes the name of the scenario", () => {
      const { client } = setup();

      expect(client.scenarioName).toBe("test");
    });

    it("plays faster after setSpeed", () => {
      const { client, clock, chunks } = setup([data(1000, "a")]);

      client.setSpeed(10);
      clock.advance(100);

      expect(client.speed).toBe(10);
      expect(chunks).toEqual(["a"]);
    });

    it("holds the scenario back while paused, and goes on after resume", () => {
      const { client, clock, chunks } = setup([data(100, "a")]);

      client.pause();
      clock.advance(1000);
      expect(client.isPaused).toBe(true);
      expect(chunks).toEqual([]);

      client.resume();
      clock.advance(100);
      expect(client.isPaused).toBe(false);
      expect(chunks).toEqual(["a"]);
    });

    it("runs virtualNow at the chosen speed", () => {
      const { client, clock } = setup();
      client.setSpeed(60);
      const before = client.virtualNow();

      clock.advance(1000);

      expect(client.virtualNow() - before).toBe(60_000);
    });

    it("restarts with a fresh snapshot and keeps the speed", () => {
      const { client, clock, snapshots, chunks } = setup([data(1000, "a")]);
      client.setSpeed(10);
      clock.advance(100);

      client.restart();
      expect(snapshots).toHaveLength(2);
      expect(client.speed).toBe(10);

      clock.advance(100);
      expect(chunks).toEqual(["a", "a"]);
    });

    it("restarts without the sessions and timers of the run before", () => {
      const { client, clock, patches, errors } = setup();
      const sessionId = sessionOf(openTerminal(client, agent.id));
      dispatchAgent(client); // plans "working"

      client.restart();
      clock.advance(5000);
      client.emit("terminal:input", { sessionId, data: "x" });

      expect(patches).toHaveLength(1); // "starting" only, no "working"
      expect(errors[0].code).toBe("session_not_found");
    });

    it("plays again from the start after a restart from pause", () => {
      const { client, clock, chunks } = setup([data(100, "a")]);
      client.pause();

      client.restart();
      clock.advance(100);

      expect(client.isPaused).toBe(false);
      expect(chunks).toEqual(["a"]);
    });
  });

  describe("connection status", () => {
    it("is offline before connect", () => {
      const client = new MockClient(makeScenario());

      expect(client.getStatus().kind).toBe("offline");
    });

    it("is connected after connect and tells its listeners", () => {
      const client = new MockClient(makeScenario());
      const listener = jest.fn();
      client.subscribeStatus(listener);

      client.connect();

      expect(client.getStatus()).toEqual({ kind: "connected" });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("is offline again after disconnect, with a reason", () => {
      const { client } = setup();

      client.disconnect();

      expect(client.getStatus()).toEqual({
        kind: "offline",
        reason: "Disconnected",
      });
    });

    it("is already connected when the snapshot arrives", () => {
      const client = new MockClient(makeScenario());
      const seen: string[] = [];
      client.on("state:snapshot", () => seen.push(client.getStatus().kind));

      client.connect();

      expect(seen).toEqual(["connected"]);
    });

    it("never goes offline on restart", () => {
      const { client } = setup();
      const listener = jest.fn();
      client.subscribeStatus(listener);

      client.restart();

      expect(listener).not.toHaveBeenCalled();
      expect(client.getStatus().kind).toBe("connected");
    });

    it("keeps the same status object while the status does not change", () => {
      const { client } = setup();
      const before = client.getStatus();

      client.restart();

      expect(client.getStatus()).toBe(before);
    });

    it("stops telling a listener after it unsubscribed", () => {
      const client = new MockClient(makeScenario());
      const listener = jest.fn();
      const unsubscribe = client.subscribeStatus(listener);

      unsubscribe();
      client.connect();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("now", () => {
    it("is the virtual time of the scenario", () => {
      const { client } = setup();

      expect(client.now()).toBe(client.virtualNow());
    });

    it("runs at the chosen speed", () => {
      const { client, clock } = setup();
      client.setSpeed(60);
      const before = client.now();

      clock.advance(1000);

      expect(client.now() - before).toBe(60_000);
    });

    it("stands still while paused", () => {
      const { client, clock } = setup();
      client.pause();
      const before = client.now();

      clock.advance(5000);

      expect(client.now()).toBe(before);
    });
  });
});
