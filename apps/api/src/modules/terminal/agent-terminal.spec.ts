import { getDefaultShell } from "@/common/shell";
import {
  AgentTerminal,
  type AgentTerminalOptions,
  type Pty,
} from "./agent-terminal";

import { TerminalError } from "./terminal-error";

class FakePty implements Pty {
  readonly write = jest.fn();
  readonly resize = jest.fn();
  readonly kill = jest.fn();
  private sendData?: (chunk: string) => void;
  private sendExit?: (event: { exitCode: number }) => void;

  readonly onData: Pty["onData"] = (listener) => {
    this.sendData = listener;
    return { dispose: () => {} };
  };

  readonly onExit: Pty["onExit"] = (listener) => {
    this.sendExit = listener;
    return { dispose: () => {} };
  };

  output(chunk: string) {
    this.sendData?.(chunk);
  }

  exit(exitCode: number) {
    this.sendExit?.({ exitCode });
  }
}

const OPTIONS: AgentTerminalOptions = {
  cwd: "/repo/spore-42",
  command: "claude",
  args: [],
};

function fakeViewer() {
  return { onData: jest.fn(), onExit: jest.fn() };
}

describe("AgentTerminal", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("starts the default shell in the cwd as a 256-color, true-color terminal", () => {
    const pty = new FakePty();
    const spawnPty = jest.fn(() => pty);

    new AgentTerminal(spawnPty, {
      cwd: "/repo/spore-42",
      command: "claude",
      args: [],
    });

    expect(spawnPty).toHaveBeenCalledWith(
      getDefaultShell(),
      [],
      expect.objectContaining({
        name: "xterm-256color",
        cwd: "/repo/spore-42",
        env: expect.objectContaining({
          TERM: "xterm-256color",
          COLORTERM: "truecolor",
        }),
      }),
    );
  });

  it("types the command line into the shell", () => {
    const pty = new FakePty();

    new AgentTerminal(() => pty, {
      cwd: "/repo/spore-42",
      command: "claude",
      args: ["--model=opus", ".gitspore/prompt-42.md"],
    });

    expect(pty.write).toHaveBeenCalledWith(
      "claude --model=opus .gitspore/prompt-42.md\r",
    );
  });

  it.each([
    "two words",
    "a;b",
    "$HOME",
    "`id`",
    "'x'",
    '"x"',
    "a\\b",
    "@x",
    "",
  ])("refuses the argument %p before starting anything", (arg) => {
    const spawnPty = jest.fn(() => new FakePty());

    expect(
      () =>
        new AgentTerminal(spawnPty, {
          cwd: "/repo/spore-42",
          command: "claude",
          args: [arg],
        }),
    ).toThrow(TerminalError);
    expect(spawnPty).not.toHaveBeenCalled();
  });

  it("sends the scrollback first, then live output", () => {
    const pty = new FakePty();
    const terminal = new AgentTerminal(() => pty, OPTIONS);
    pty.output("before");
    jest.advanceTimersByTime(16);

    const viewer = fakeViewer();
    terminal.attach("session-1", viewer);
    pty.output("after");
    jest.advanceTimersByTime(16);

    expect(viewer.onData.mock.calls).toEqual([["before"], ["after"]]);
  });

  it("sends no empty scrollback to a viewer who attaches before any output", () => {
    const pty = new FakePty();
    const terminal = new AgentTerminal(() => pty, OPTIONS);

    const viewer = fakeViewer();
    terminal.attach("session-1", viewer);
    pty.output("hello");
    jest.advanceTimersByTime(16);

    expect(viewer.onData.mock.calls).toEqual([["hello"]]);
  });

  it("stops sending to a detached viewer, but keeps the PTY running", () => {
    const pty = new FakePty();
    const terminal = new AgentTerminal(() => pty, OPTIONS);
    const viewer = fakeViewer();
    terminal.attach("session-1", viewer);

    terminal.detach("session-1");
    pty.output("later");
    jest.advanceTimersByTime(16);

    expect(viewer.onData).not.toHaveBeenCalled();
    expect(pty.kill).not.toHaveBeenCalled();

    const next = fakeViewer();
    terminal.attach("session-2", next);
    expect(next.onData).toHaveBeenCalledWith("later");
  });

  it("passes a viewer's input to the PTY unchanged", () => {
    const pty = new FakePty();
    const terminal = new AgentTerminal(() => pty, OPTIONS);

    terminal.write("ls\r");
    terminal.write("\x03");

    expect(pty.write).toHaveBeenNthCalledWith(2, "ls\r");
    expect(pty.write).toHaveBeenNthCalledWith(3, "\x03");
  });

  it("resizes the PTY to the size the last viewer asked for", () => {
    const pty = new FakePty();
    const terminal = new AgentTerminal(() => pty, OPTIONS);

    terminal.resize(120, 40);
    terminal.resize(100, 30);

    expect(pty.resize).toHaveBeenCalledTimes(2);
    expect(pty.resize).toHaveBeenLastCalledWith(100, 30);
  });

  it("nudges full-screen programs to redraw after an attach", () => {
    const pty = new FakePty();
    const terminal = new AgentTerminal(() => pty, OPTIONS);
    terminal.resize(100, 30);
    pty.resize.mockClear();

    terminal.attach("session-1", fakeViewer());
    expect(pty.resize.mock.calls).toEqual([[101, 30]]);

    jest.advanceTimersByTime(50);
    expect(pty.resize.mock.calls).toEqual([
      [101, 30],
      [100, 30],
    ]);
  });

  it("keeps a resize that arrives during the nudge", () => {
    const pty = new FakePty();
    const terminal = new AgentTerminal(() => pty, OPTIONS);

    terminal.attach("session-1", fakeViewer());
    terminal.resize(120, 40);
    jest.advanceTimersByTime(50);

    expect(pty.resize).toHaveBeenLastCalledWith(120, 40);
  });

  it("sends pending output, then the exit code, to every viewer", () => {
    const pty = new FakePty();
    const terminal = new AgentTerminal(() => pty, OPTIONS);
    const first = fakeViewer();
    const second = fakeViewer();
    terminal.attach("session-1", first);
    terminal.attach("session-2", second);

    pty.output("Done.");
    pty.exit(3);

    for (const viewer of [first, second]) {
      expect(viewer.onData).toHaveBeenCalledWith("Done.");
      expect(viewer.onExit).toHaveBeenCalledWith(3);
      expect(viewer.onData.mock.invocationCallOrder[0]).toBeLessThan(
        viewer.onExit.mock.invocationCallOrder[0],
      );
    }
  });

  it("leaves the PTY alone after it exited", () => {
    const pty = new FakePty();
    const terminal = new AgentTerminal(() => pty, OPTIONS);
    terminal.attach("session-1", fakeViewer());
    pty.exit(0);
    pty.resize.mockClear();
    pty.write.mockClear();

    jest.advanceTimersByTime(50);
    terminal.resize(100, 30);
    terminal.write("ls\r");

    expect(pty.resize).not.toHaveBeenCalled();
    expect(pty.write).not.toHaveBeenCalled();
  });
});
