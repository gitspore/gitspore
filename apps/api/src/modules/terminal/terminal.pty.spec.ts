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

// Real-PTY tests that need UTF-8 output. PowerShell gets it in #53.
const itOnUnix = process.platform === "win32" ? it.skip : it;

// Prints the numbers 1 to 10,000, one per line.
const COUNT_TO_10000 =
  process.platform === "win32" ? "1..10000" : "seq 1 10000";

describe("TerminalService with a real PTY", () => {
  let ptys: { pty: IPty; running: boolean; exited: Promise<void> }[];
  let service: TerminalService;

  beforeEach(() => {
    ptys = [];
    service = new TerminalService((file, args, options) => {
      const pty = spawn(file, args, options);
      const entry = { pty, running: true, exited: Promise.resolve() };
      entry.exited = new Promise((resolve) =>
        pty.onExit(() => {
          entry.running = false;
          resolve();
        }),
      );
      ptys.push(entry);
      return pty;
    });
  });

  // kill() from #53 doesn't exist yet, so the test kills its own shells.
  afterEach(async () => {
    for (const { pty, running } of ptys) {
      if (running) {
        pty.kill();
      }
    }
    await Promise.all(ptys.map(({ exited }) => exited));
  });

  // Attaches one browser tab and collects everything it receives.
  function attachTab(agentId: string, ownerId = "socket-1") {
    let output = "";
    let check: (() => void) | undefined;
    let chunks = 0;
    let reportExit!: (exitCode: number) => void;
    const exited = new Promise<number>((resolve) => {
      reportExit = resolve;
    });

    const { sessionId, scrollback } = service.attach(agentId, {
      ownerId,
      onData: (chunk) => {
        output += chunk;
        chunks += 1;

        check?.();
      },
      onExit: (exitCode) => reportExit(exitCode),
    });
    output = scrollback;

    // Resolves once `found(output)` is true; fails after 10 s (20 s on Windows) showing the output.
    function waitFor(
      found: (output: string) => boolean,
      what: string,
    ): Promise<void> {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`No ${what} in time:\n${output}`)),
          process.platform === "win32" ? 20_000 : 10_000,
        );
        check = () => {
          if (found(output)) {
            clearTimeout(timer);
            check = undefined;
            resolve();
          }
        };
        check();
      });
    }

    const waitForLine = (line: string) =>
      waitFor((raw) => toLines(raw).includes(line), `line "${line}"`);

    const waitForOutput = (text: string) =>
      waitFor((raw) => raw.includes(text), JSON.stringify(text));

    // The start command's output: a line ending in "gitspore" that isn't the
    // typed "echo gitspore" itself. On macOS, bash's redraw can glue the output
    // to the end of a line, so an exact line match misses it.
    const waitForShell = () =>
      waitFor(
        (raw) =>
          toLines(raw).some(
            (line) =>
              line.endsWith("gitspore") && !line.endsWith("echo gitspore"),
          ),
        "output of the start command",
      );

    return {
      sessionId,
      waitForLine,
      waitForOutput,
      waitForShell,
      chunkCount: () => chunks,
      exited,
    };
  }

  it('runs "echo gitspore" in the shell and streams the output to a tab', async () => {
    service.spawn({
      agentId: "agent-1",
      cwd: process.cwd(),
      command: "echo",
      args: ["gitspore"],
    });
    const browserTab = attachTab("agent-1");

    await browserTab.waitForShell();
  }, 30_000);

  it("resizes the terminal so the shell reports 100 columns", async () => {
    service.spawn({
      agentId: "agent-1",
      cwd: process.cwd(),
      command: "echo",
      args: ["gitspore"],
    });
    const browserTab = attachTab("agent-1");
    await browserTab.waitForShell();

    service.resize(browserTab.sessionId, "socket-1", 100, 30);
    service.write(browserTab.sessionId, "socket-1", `${ASK_COLUMNS}\r`);

    await browserTab.waitForLine("100");
  }, 30_000);

  itOnUnix(
    "passes colour codes and UTF-8 through unchanged",
    async () => {
      service.spawn({
        agentId: "agent-1",
        cwd: process.cwd(),
        command: "echo",
        args: ["gitspore"],
      });
      const browserTab = attachTab("agent-1");
      await browserTab.waitForShell();

      // Typed as octal escapes, so the real bytes only appear in the output:
      // \033 = ESC, \303\274 = ü, \360\237\214\261 = 🌱
      service.write(
        browserTab.sessionId,
        "socket-1",
        "printf '\\033[32mgr\\303\\274n \\360\\237\\214\\261\\033[0m\\n'\r",
      );

      await browserTab.waitForOutput("\x1b[32mgrün 🌱\x1b[0m");
    },
    30_000,
  );

  it("sends 10,000 lines in far fewer than 10,000 chunks", async () => {
    service.spawn({
      agentId: "agent-1",
      cwd: process.cwd(),
      command: "echo",
      args: ["gitspore"],
    });
    const browserTab = attachTab("agent-1");
    await browserTab.waitForShell();

    service.write(browserTab.sessionId, "socket-1", `${COUNT_TO_10000}\r`);
    await browserTab.waitForLine("10000");

    expect(browserTab.chunkCount()).toBeLessThan(1_000);
  }, 30_000);

  it("keeps the shell running when a tab detaches", async () => {
    service.spawn({
      agentId: "agent-1",
      cwd: process.cwd(),
      command: "echo",
      args: ["gitspore"],
    });
    const browserTab = attachTab("agent-1");
    await browserTab.waitForShell();

    service.detach(browserTab.sessionId, "socket-1");
    const otherBrowserTab = attachTab("agent-1", "socket-2");
    service.write(otherBrowserTab.sessionId, "socket-2", "echo still-here\r");

    await otherBrowserTab.waitForLine("still-here");
  }, 30_000);

  it("forgets the terminal when the shell exits", async () => {
    service.spawn({
      agentId: "agent-1",
      cwd: process.cwd(),
      command: "echo",
      args: ["gitspore"],
    });
    const browserTab = attachTab("agent-1");
    await browserTab.waitForShell();

    service.write(browserTab.sessionId, "socket-1", "exit\r");

    await expect(browserTab.exited).resolves.toBe(0);
    expect(() => attachTab("agent-1")).toThrow("No terminal for agent-1");
  }, 30_000);
});
