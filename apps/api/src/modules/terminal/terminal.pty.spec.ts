import { spawn, type IPty } from "node-pty";
import { TerminalService } from "./terminal.service";

// Same as pty.smoke.spec.ts: strips ANSI CSI/OSC sequences.
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

const toLines = (raw: string) =>
  raw
    .replace(ANSI, "")
    .split(/\r?\n|\r/)
    .map((line) => line.trim());

const ASK_COLUMNS =
  process.platform === "win32"
    ? "$Host.UI.RawUI.WindowSize.Width"
    : "tput cols";

describe("TerminalService with a real PTY", () => {
  let ptys: { pty: IPty; exited: Promise<void> }[];
  let service: TerminalService;

  beforeEach(() => {
    ptys = [];
    service = new TerminalService((file, args, options) => {
      const pty = spawn(file, args, options);
      ptys.push({
        pty,
        exited: new Promise((resolve) => pty.onExit(() => resolve())),
      });
      return pty;
    });
  });

  // PR 2's kill() doesn't exist yet, so the test kills its own shells.
  afterEach(async () => {
    for (const { pty } of ptys) {
      pty.kill();
    }
    await Promise.all(ptys.map(({ exited }) => exited));
  });

  // Attaches one browser tab and collects everything it receives.
  function attachTab(agentId: string, ownerId = "socket-1") {
    let output = "";
    let check: (() => void) | undefined;
    const { sessionId } = service.attach(agentId, {
      ownerId,
      onData: (chunk) => {
        output += chunk;
        check?.();
      },
      onExit: () => {},
    });

    function waitForLine(line: string): Promise<void> {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`No line "${line}" within 10s:\n${output}`)),
          10_000,
        );
        check = () => {
          if (toLines(output).includes(line)) {
            clearTimeout(timer);
            check = undefined;
            resolve();
          }
        };
        check();
      });
    }

    return { sessionId, waitForLine };
  }

  it('runs "echo gitspore" in the shell and streams the output to a tab', async () => {
    service.spawn({
      agentId: "agent-1",
      cwd: process.cwd(),
      command: "echo",
      args: ["gitspore"],
    });
    const browserTab = attachTab("agent-1");

    await browserTab.waitForLine("gitspore");
  }, 30_000);

  it("resizes the terminal so the shell reports 100 columns", async () => {
    service.spawn({
      agentId: "agent-1",
      cwd: process.cwd(),
      command: "echo",
      args: ["gitspore"],
    });
    const browserTab = attachTab("agent-1");

    service.resize(browserTab.sessionId, "socket-1", 100, 30);
    service.write(browserTab.sessionId, "socket-1", `${ASK_COLUMNS}\r`);

    await browserTab.waitForLine("100");
  }, 30_000);
});
