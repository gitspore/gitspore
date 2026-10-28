import { spawn } from "node:child_process";
import {
  createServer,
  type IncomingHttpHeaders,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

export type Received = {
  url?: string;
  headers: IncomingHttpHeaders;
  body: string;
};
export type Run = {
  code: number | null;
  stdout: string;
  stderr: string;
  ms: number;
};

// Runs one of the scripts Claude Code starts (hooks, statusline) with this
// Node, the given environment and stdin.
export function runScript(
  script: string,
  env: NodeJS.ProcessEnv,
  stdin: string,
): Promise<Run> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn(process.execPath, [script], {
      env: { ...process.env, ...env },
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

// An HTTP server on a free port that records every request and lets the
// test decide how (and whether) to answer.
export async function startDaemon(
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

export function stopDaemon(server: Server): Promise<void> {
  // A request that never got an answer keeps its socket open, and close()
  // would wait for it.
  server.closeAllConnections();
  return new Promise((resolve) => server.close(() => resolve()));
}
