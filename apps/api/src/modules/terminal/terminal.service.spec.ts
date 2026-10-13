import { FakePty } from "../../../test/fake-pty";
import { TerminalError } from "./terminal-error";
import { TerminalService } from "./terminal.service";
import { MAX_SLOTS } from "@gitspore/shared";

// The code of the TerminalError an action throws, or undefined if it
// throws nothing (or something else).
function errorCode(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    return error instanceof TerminalError ? error.code : undefined;
  }
  return undefined;
}

describe("TerminalService", () => {
  let ptys: FakePty[];
  let service: TerminalService;

  beforeEach(() => {
    jest.useFakeTimers();
    ptys = [];
    service = new TerminalService(() => {
      const pty = new FakePty();
      ptys.push(pty);
      return pty;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function spawn(agentId: string) {
    service.spawn({ agentId, cwd: "/repo", command: "claude", args: [] });
  }

  function viewer(ownerId = "socket-1") {
    return { ownerId, onData: jest.fn(), onExit: jest.fn() };
  }

  it("attaches a viewer to a spawned agent's terminal", () => {
    spawn("agent-1");
    const broeserTab = viewer();

    const { sessionId } = service.attach("agent-1", broeserTab);
    ptys[0].output("hello");
    jest.advanceTimersByTime(16);

    expect(sessionId).toEqual(expect.any(String));
    expect(broeserTab.onData).toHaveBeenCalledWith("hello");
  });

  it("refuses to attach to an unknown agent", () => {
    expect(errorCode(() => service.attach("agent-9", viewer()))).toBe(
      "agent_not_found",
    );
  });

  it("refuses a second terminal for the same agent", () => {
    spawn("agent-1");

    expect(errorCode(() => spawn("agent-1"))).toBe("already_running");
    expect(ptys).toHaveLength(1);
  });

  it("refuses more terminals than slots plus the overview agent", () => {
    for (let i = 0; i < MAX_SLOTS + 1; i++) {
      spawn(`agent-${i}`);
    }

    expect(errorCode(() => spawn("one-too-many"))).toBe("limit_reached");
    expect(ptys).toHaveLength(MAX_SLOTS + 1);
  });
});
