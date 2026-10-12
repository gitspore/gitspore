import type {
  AgentDispatchAck,
  AgentStatus,
  GreenhouseState,
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
function setup(events: ScenarioEntry[] = []) {
  const clock = createFakeClock(Date.parse(ANCHOR));
  const client = new MockClient(makeScenario(events), clock);
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
      client.emit("terminal:input", { sessionId, data: "x" });

      expect(errors[0].code).toBe("session_not_found");
    });
  });
});
