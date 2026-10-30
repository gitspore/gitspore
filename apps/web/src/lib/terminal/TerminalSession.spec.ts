import { createFakeClock } from "../mock/clock.fake";
import { MockClient } from "../mock/MockClient";
import type { ScenarioEntry } from "../mock/scenario";
import { ANCHOR, makeScenario } from "../mock/scenarioFixtures";
import { createGreenhouseStore } from "../store/greenhouseStore";
import { TerminalSession, type TerminalScreen } from "./TerminalSession";
//
//
//
// What the mock prints after an open, 150 ms per line.
const GREETING = "Claude Code (mock)\r\n> ready\r\n$ ";
// Stands in for xterm.js: keeps what was written, lets a test type.
class FakeTerminal implements TerminalScreen {
  text = "";
  options: { disableStdin?: boolean } = {};
  private listener: (data: string) => void = () => {};
  write(data: string) {
    this.text += data;
  }
  onData(listener: (data: string) => void) {
    this.listener = listener;
    return { dispose: () => {} };
  }
  // Like xterm, typing does nothing while input is disabled.
  type(data: string) {
    if (!this.options.disableStdin) this.listener(data);
  }
}
// A connected mock with the agent "a1", and a session for it.
function setup(events: ScenarioEntry[] = []) {
  const clock = createFakeClock(Date.parse(ANCHOR));
  const client = new MockClient(makeScenario(events), clock);
  const actions = createGreenhouseStore(client, "mock").getState();
  const terminal = new FakeTerminal();
  client.connect();
  const session = new TerminalSession(terminal, client, actions);
  return { clock, client, actions, terminal, session };
}
describe("TerminalSession", () => {
  it("shows the agent's output and sends what is typed", async () => {
    const { clock, terminal, session } = setup();
    await session.open("a1");
    clock.advance(450);
    terminal.type("ls\r");
    expect(terminal.text).toBe(GREETING + "ls\r\n");
  });

  it("keeps output that arrives before the session id", async () => {
    const { clock, client, actions } = setup();
    const terminal = new FakeTerminal();
    // ack and first output can come in one response:
    // if output delivered before open()
    // --> get session id, keep prior output
    const session = new TerminalSession(terminal, client, {
      ...actions,
      openTerminal: (agentId) => {
        const opened = actions.openTerminal(agentId);
        clock.advance(450);
        return opened;
      },
    });
    await session.open("a1");
    expect(terminal.text).toBe(GREETING);
  });

  it("shows the exit code, keeps the screen and stops input on exit", async () => {
    // The mock numbers its sessions, so the first open is mock-session-1.
    const { clock, terminal, session } = setup([
      {
        at: 1000,
        event: "terminal:exit",
        payload: { sessionId: "mock-session-1", exitCode: 0 },
      },
    ]);

    await session.open("a1");
    clock.advance(1000);
    terminal.type("ls\r");

    expect(terminal.text).toBe(
      GREETING + "\r\n[process exited with code 0]\r\n",
    );
    expect(terminal.options.disableStdin).toBe(true);
  });

  it("says so when the daemon keeps refusing the open", async () => {
    const { client, actions, terminal } = setup();
    const openTerminal = jest.fn(actions.openTerminal);
    const session = new TerminalSession(
      terminal,
      client,
      { ...actions, openTerminal },
      { attempts: 3, wait: async () => {} },
    );

    await session.open("nobody");

    expect(openTerminal).toHaveBeenCalledTimes(3);
    expect(terminal.text).toBe("Could not open the terminal\r\n");
  });

  // A planted agent's terminal starts a few seconds after the agent appears
  it("asks again until the agent's terminal is there", async () => {
    const { clock, client, actions, terminal } = setup();
    let refusals = 2;
    const session = new TerminalSession(
      terminal,
      client,
      {
        ...actions,
        openTerminal: (agentId) =>
          refusals-- > 0
            ? Promise.resolve(null)
            : actions.openTerminal(agentId),
      },
      { attempts: 5, wait: async () => {} },
    );

    await session.open("a1");
    clock.advance(450);

    expect(terminal.text).toBe(GREETING);
  });

  it("stops asking when closed while it waits", async () => {
    const { client, actions, terminal } = setup();
    const openTerminal = jest.fn(async () => null);
    const session: TerminalSession = new TerminalSession(
      terminal,
      client,
      { ...actions, openTerminal },
      { attempts: 5, wait: async () => session.dispose() },
    );

    await session.open("a1");

    expect(openTerminal).toHaveBeenCalledTimes(1);
    expect(terminal.text).toBe("");
  });

  it("gives the session back when disposed before the ack", async () => {
    const { client, actions, terminal } = setup();
    const closeTerminal = jest.fn(actions.closeTerminal);
    const session = new TerminalSession(terminal, client, {
      ...actions,
      closeTerminal,
    });

    // StrictMode: mount, unmount before the ack arrives.
    const opened = session.open("a1");
    session.dispose();
    await opened;

    expect(closeTerminal).toHaveBeenCalledWith("mock-session-1");
  });
});
