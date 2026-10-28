import type { Pty } from "@/modules/terminal/agent-terminal";

export class FakePty implements Pty {
  // killTree() ignores 0, so a fake never signals a real process. A test
  // that sets another pid also passes its own killTree and startedAt.
  pid = 0;
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

  private exited = false;

  output(chunk: string) {
    this.sendData?.(chunk);
  }

  exit(exitCode: number) {
    this.exited = true;
    this.sendExit?.({ exitCode });
  }

  // Like a real PTY: kill() ends the process, once. For tests that close a
  // Nest app, whose shutdown waits until every terminal has exited.
  exitingOnKill(): this {
    this.kill.mockImplementation(() => {
      if (!this.exited) this.exit(0);
    });
    return this;
  }
}
