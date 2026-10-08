import { spawn, type IPty } from "node-pty";
import { getDefaultShell } from "./shell";

// Strips ANSI CSI/OSC sequences, which shells and ConPTY interleave freely.
// Matching ESC/BEL control characters is the point here.
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

const toLines = (raw: string) =>
  raw
    .replace(ANSI, "")
    .split(/\r?\n|\r/)
    .map((line) => line.trim());

// End-to-end check that the native node-pty build loads and drives a real
// shell on this OS. Catches missing prebuilds or a failed node-gyp build.
describe("node-pty smoke test", () => {
  let pty: IPty | undefined;

  // On Windows, node-pty 1.1.0's kill() races its console-list helper
  // against the closing console, which can print a harmless
  // "AttachConsole failed" trace to stderr. The test result is unaffected.
  afterEach(() => pty?.kill());

  it('runs "echo gitspore" in the default shell', async () => {
    const shell = spawn(getDefaultShell(), [], {
      name: "xterm-color",
      cols: 80,
      rows: 24,
      cwd: process.cwd(),
      env: process.env,
    });
    pty = shell;

    const lines = await new Promise<string[]>((resolve, reject) => {
      let buffer = "";
      const timer = setTimeout(
        () => reject(new Error(`No "gitspore" line within 20s:\n${buffer}`)),
        20_000,
      );
      shell.onData((data) => {
        buffer += data;
        // The echoed command line also contains "gitspore", so wait for a
        // line that is exactly the command's output.
        const current = toLines(buffer);
        if (current.includes("gitspore")) {
          clearTimeout(timer);
          resolve(current);
        }
      });
      shell.write("echo gitspore\r");
    });

    expect(lines).toContain("gitspore");
  }, 30_000);
});
