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
});
