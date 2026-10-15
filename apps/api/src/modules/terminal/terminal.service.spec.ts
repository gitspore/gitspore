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
    const browserTab = viewer();

    const { sessionId } = service.attach("agent-1", browserTab);
    ptys[0].output("hello");
    jest.advanceTimersByTime(16);

    expect(sessionId).toEqual(expect.any(String));
    expect(browserTab.onData).toHaveBeenCalledWith("hello");
  });

  it("returns the scrollback together with the session id", () => {
    spawn("agent-1");
    ptys[0].output("before");
    jest.advanceTimersByTime(16);

    const { scrollback } = service.attach("agent-1", viewer());

    expect(scrollback).toBe("before");
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

  it("passes a tab's input to its agent's terminal", () => {
    spawn("agent-1");
    const { sessionId } = service.attach("agent-1", viewer());

    service.write(sessionId, "socket-1", "ls\r");

    expect(ptys[0].write).toHaveBeenLastCalledWith("ls\r");
  });

  it("refuses input for an unknown session or another tab's session", () => {
    spawn("agent-1");
    const { sessionId } = service.attach("agent-1", viewer("socket-1"));

    expect(
      errorCode(() => service.write("no-such-session", "socket-1", "ls\r")),
    ).toBe("session_not_found");
    expect(errorCode(() => service.write(sessionId, "socket-2", "ls\r"))).toBe(
      "session_not_found",
    );
    expect(ptys[0].write).toHaveBeenCalledTimes(1);
  });

  it("resizes the terminal for a tab's session", () => {
    spawn("agent-1");
    const { sessionId } = service.attach("agent-1", viewer());

    service.resize(sessionId, "socket-1", 100, 30);

    expect(ptys[0].resize).toHaveBeenLastCalledWith(100, 30);
  });

  it("detaches a tab: no more output, session gone, shell still running", () => {
    spawn("agent-1");
    const browserTab = viewer();
    const { sessionId } = service.attach("agent-1", browserTab);

    service.detach(sessionId, "socket-1");
    ptys[0].output("after");
    jest.advanceTimersByTime(16);

    expect(browserTab.onData).not.toHaveBeenCalled();
    expect(errorCode(() => service.write(sessionId, "socket-1", "ls\r"))).toBe(
      "session_not_found",
    );
    expect(ptys[0].kill).not.toHaveBeenCalled();
  });

  it("detaches every session of a disconnected tab, and only those", () => {
    spawn("agent-1");
    spawn("agent-2");
    const browserTab = viewer("socket-1");
    const otherBrowserTab = viewer("socket-2");
    const { sessionId } = service.attach("agent-1", browserTab);
    service.attach("agent-2", browserTab);
    service.attach("agent-1", otherBrowserTab);

    service.detachOwner("socket-1");
    ptys[0].output("after");
    ptys[1].output("after");
    jest.advanceTimersByTime(16);

    expect(browserTab.onData).not.toHaveBeenCalled();
    expect(otherBrowserTab.onData).toHaveBeenCalledWith("after");
    expect(errorCode(() => service.write(sessionId, "socket-1", "ls\r"))).toBe(
      "session_not_found",
    );
  });

  it("forgets an agent's terminal and sessions when its shell exits", () => {
    spawn("agent-1");
    const { sessionId } = service.attach("agent-1", viewer());

    ptys[0].exit(0);

    expect(errorCode(() => service.attach("agent-1", viewer()))).toBe(
      "agent_not_found",
    );
    expect(errorCode(() => service.write(sessionId, "socket-1", "ls\r"))).toBe(
      "session_not_found",
    );
    expect(errorCode(() => spawn("agent-1"))).toBeUndefined();
    expect(ptys).toHaveLength(2);
  });

  it("tells exit listeners which agent's shell exited, and its code", () => {
    const listener = jest.fn();
    service.onExited(listener);
    spawn("agent-1");
    spawn("agent-2");

    ptys[1].exit(3);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("agent-2", 3);
  });
});
