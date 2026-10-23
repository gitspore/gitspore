import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import {
  createServer,
  type IncomingHttpHeaders,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(__dirname, "hook-script.mjs");
const EVENT = '{"hook_event_name":"PreToolUse","tool_name":"Bash"}';

type Received = { url?: string; headers: IncomingHttpHeaders; body: string };
type Run = { code: number | null; stdout: string; stderr: string; ms: number };

function runHook(projectDir: string, stdin = EVENT): Promise<Run> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn(process.execPath, [SCRIPT], {
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => (stdout += data));
    child.stderr.on("data", (data) => (stderr += data));
    child.on("error", reject);
    child.on("close", (code) =>
      resolve({ code, stdout, stderr, ms: Date.now() - started }),
    );
    child.stdin.end(stdin);
  });
}

async function startDaemon(
  answer: (res: ServerResponse) => void,
): Promise<{ server: Server; url: string; received: Received[] }> {
  const received: Received[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received.push({ url: req.url, headers: req.headers, body });
      answer(res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}`, received };
}

function stopDaemon(server: Server): Promise<void> {
  // A request that never got an answer keeps its socket open, and close()
  // would wait for it.
  server.closeAllConnections();
  return new Promise((resolve) => server.close(() => resolve()));
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
