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

const SCRIPT = join(__dirname, "hook-script.mjs");
const EVENT = '{"hook_event_name":"PreToolUse","tool_name":"Bash"}';

function runHook(projectDir: string, stdin = EVENT): Promise<Run> {
  return runScript(SCRIPT, { CLAUDE_PROJECT_DIR: projectDir }, stdin);
}

async function writeHookFile(dir: string, url: string): Promise<void> {
  await mkdir(join(dir, ".gitspore"), { recursive: true });
  await writeFile(
    join(dir, ".gitspore", "hook.json"),
    JSON.stringify({ url, agentId: "agent-1", secret: "s3cret" }),
  );
}

describe("hook-script", () => {
  let dir: string;
  let server: Server | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "gitspore-hook-"));
  });

  afterEach(async () => {
    if (server) await stopDaemon(server);
    server = undefined;
    await rm(dir, { recursive: true, force: true });
  });

  it("posts the event to the agent's endpoint with the secret", async () => {
    const daemon = await startDaemon((res) => res.writeHead(204).end());
    server = daemon.server;
    await writeHookFile(dir, daemon.url);

    const run = await runHook(dir);

    expect(run).toMatchObject({ code: 0, stdout: "", stderr: "" });
    expect(daemon.received).toHaveLength(1);
    expect(daemon.received[0].url).toBe("/hooks/agent-1");
    expect(daemon.received[0].headers["x-gitspore-secret"]).toBe("s3cret");
    expect(daemon.received[0].body).toBe(EVENT);
  });

  it("exits 0 without output when the daemon is down", async () => {
    const daemon = await startDaemon(() => {});
    await stopDaemon(daemon.server);
    await writeHookFile(dir, daemon.url);

    expect(await runHook(dir)).toMatchObject({
      code: 0,
      stdout: "",
      stderr: "",
    });
  });

  it("gives up after its timeout when the daemon never answers", async () => {
    const daemon = await startDaemon(() => {});
    server = daemon.server;
    await writeHookFile(dir, daemon.url);

    const run = await runHook(dir);

    expect(run).toMatchObject({ code: 0, stdout: "", stderr: "" });
    expect(run.ms).toBeLessThan(3500);
  });

  it("exits 0 without output when hook.json is missing", async () => {
    expect(await runHook(dir)).toMatchObject({
      code: 0,
      stdout: "",
      stderr: "",
    });
  });
});
