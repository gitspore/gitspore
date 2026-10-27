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

// CLAUDE_PROJECT_DIR is emptied, so one set in the shell that runs the
// tests can't point the script at a real hook.json.
function runStatusline(
  stdin: string,
  env: NodeJS.ProcessEnv = {},
): Promise<Run> {
  return runScript(SCRIPT, { CLAUDE_PROJECT_DIR: "", ...env }, stdin);
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
});
