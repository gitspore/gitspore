import type { Pty } from "@/modules/terminal/agent-terminal";

export class FakePty implements Pty {
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
