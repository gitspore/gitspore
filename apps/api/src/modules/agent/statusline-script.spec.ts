import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runScript,
  startDaemon,
  stopDaemon,
  type Run,
} from "../../../test/stand-in-daemon";

const SCRIPT = join(__dirname, "statusline-script.mjs");

// Shortened from the example in Claude Code's statusline docs.
function statusline(projectDir?: string) {
  return JSON.stringify({
    session_id: "session-1",
    transcript_path: "/home/dev/.claude/projects/repo/session-1.jsonl",
    model: { id: "claude-opus-5-5", display_name: "Opus" },
    workspace: projectDir ? { project_dir: projectDir } : {},
    context_window: { used_percentage: 21.6 },
    rate_limits: {
      five_hour: { used_percentage: 23.5, resets_at: 1738425600 },
    },
  });
}

// A Claude Code config folder that doesn't exist, so the developer's own
// statusline from ~/.claude/settings.json never runs in a test.
const NO_CONFIG = join(tmpdir(), "gitspore-no-claude-config");

// CLAUDE_PROJECT_DIR is emptied, so one set in the shell that runs the
// tests can't point the script at a real hook.json.
function runStatusline(
  stdin: string,
  env: NodeJS.ProcessEnv = {},
): Promise<Run> {
  return runScript(
    SCRIPT,
    { CLAUDE_PROJECT_DIR: "", CLAUDE_CONFIG_DIR: NO_CONFIG, ...env },
    stdin,
  );
}

async function writeSettings(dir: string, command: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "settings.json"),
    JSON.stringify({ statusLine: { type: "command", command } }),
  );
}

async function writeHookFile(dir: string, url: string): Promise<void> {
  await mkdir(join(dir, ".gitspore"), { recursive: true });
  await writeFile(
    join(dir, ".gitspore", "hook.json"),
    JSON.stringify({ url, agentId: "agent-1", secret: "s3cret" }),
  );
}

describe("statusline-script", () => {
  let dir: string;
  let server: Server | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "gitspore-statusline-"));
  });

  afterEach(async () => {
    if (server) await stopDaemon(server);
    server = undefined;
    await rm(dir, { recursive: true, force: true });
  });

  it("posts the statusline to the agent's endpoint with the secret", async () => {
    const daemon = await startDaemon((res) => res.writeHead(204).end());
    server = daemon.server;
    await writeHookFile(dir, daemon.url);
    const stdin = statusline(dir);

    const run = await runStatusline(stdin);

    expect(run).toMatchObject({ code: 0, stderr: "" });
    expect(daemon.received).toHaveLength(1);
    expect(daemon.received[0].url).toBe("/hooks/agent-1/statusline");
    expect(daemon.received[0].headers["x-gitspore-secret"]).toBe("s3cret");
    expect(daemon.received[0].body).toBe(stdin);
  });

  it("prints the model and the context for Claude Code's footer", async () => {
    const run = await runStatusline(statusline(dir));

    expect(run.stdout).toBe("Opus · context 22 %");
  });

  it("leaves out what Claude Code hasn't reported yet", async () => {
    const run = await runStatusline(
      JSON.stringify({ model: { display_name: "Opus" } }),
    );

    expect(run.stdout).toBe("Opus");
  });

  it("finds hook.json through CLAUDE_PROJECT_DIR without project_dir", async () => {
    const daemon = await startDaemon((res) => res.writeHead(204).end());
    server = daemon.server;
    await writeHookFile(dir, daemon.url);

    await runStatusline(statusline(), { CLAUDE_PROJECT_DIR: dir });

    expect(daemon.received).toHaveLength(1);
  });

  it("still prints the line and exits 0 when the daemon is down", async () => {
    const daemon = await startDaemon(() => {});
    await stopDaemon(daemon.server);
    await writeHookFile(dir, daemon.url);

    expect(await runStatusline(statusline(dir))).toMatchObject({
      code: 0,
      stdout: "Opus · context 22 %",
      stderr: "",
    });
  });

  it("gives up after its timeout when the daemon never answers", async () => {
    const daemon = await startDaemon(() => {});
    server = daemon.server;
    await writeHookFile(dir, daemon.url);

    const run = await runStatusline(statusline(dir));

    expect(run).toMatchObject({ code: 0, stderr: "" });
    expect(run.ms).toBeLessThan(2500);
  });

  it("exits 0 when hook.json is missing", async () => {
    expect(await runStatusline(statusline(dir))).toMatchObject({
      code: 0,
      stderr: "",
    });
  });

  it("posts and prints nothing for input that isn't JSON", async () => {
    const daemon = await startDaemon((res) => res.writeHead(204).end());
    server = daemon.server;
    await writeHookFile(dir, daemon.url);

    const run = await runStatusline("not json", { CLAUDE_PROJECT_DIR: dir });

    expect(run).toMatchObject({ code: 0, stdout: "", stderr: "" });
    expect(daemon.received).toHaveLength(0);
  });

  // The commands run in Git Bash or PowerShell on Windows and sh elsewhere,
  // so they stick to what all three understand.
  describe("the user's own statusline", () => {
    let config: string;

    beforeEach(() => {
      config = join(dir, "claude-config");
    });

    const runWithConfig = (stdin = statusline(dir)) =>
      runStatusline(stdin, { CLAUDE_CONFIG_DIR: config });

    it("prints it instead of gitspore's line, and still posts", async () => {
      const daemon = await startDaemon((res) => res.writeHead(204).end());
      server = daemon.server;
      await writeHookFile(dir, daemon.url);
      await writeSettings(config, "echo own-line");

      const run = await runWithConfig();

      expect(run).toMatchObject({ code: 0, stdout: "own-line" });
      expect(daemon.received).toHaveLength(1);
    });

    it("takes the project's statusline before the user's", async () => {
      await writeSettings(config, "echo user-line");
      await writeSettings(join(dir, ".claude"), "echo project-line");

      expect((await runWithConfig()).stdout).toBe("project-line");
    });

    it("hands it the statusline JSON on stdin", async () => {
      await writeSettings(
        config,
        'node -e "process.stdin.pipe(process.stdout)"',
      );
      const stdin = statusline(dir);

      expect((await runWithConfig(stdin)).stdout).toBe(stdin);
    });

    it.each([
      ["fails", "exit 3"],
      ["prints nothing", "exit 0"],
    ])("prints gitspore's line when it %s", async (_, command) => {
      await writeSettings(config, command);

      expect((await runWithConfig()).stdout).toBe("Opus · context 22 %");
    });

    it("gives up on it after its timeout, and posts anyway", async () => {
      const daemon = await startDaemon((res) => res.writeHead(204).end());
      server = daemon.server;
      await writeHookFile(dir, daemon.url);
      await writeSettings(config, "sleep 10");

      const run = await runWithConfig();

      expect(run).toMatchObject({ code: 0, stdout: "Opus · context 22 %" });
      expect(run.ms).toBeLessThan(4000);
      expect(daemon.received).toHaveLength(1);
    });

    it("ignores settings that aren't JSON or have no command", async () => {
      await mkdir(join(dir, ".claude"), { recursive: true });
      await writeFile(join(dir, ".claude", "settings.json"), "not json");
      await writeFile(
        join(dir, ".claude", "settings.local.json"),
        JSON.stringify({ statusLine: { type: "static" } }),
      );
      await writeSettings(config, "echo user-line");

      expect((await runWithConfig()).stdout).toBe("user-line");
    });
  });
});
