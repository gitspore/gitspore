/* global fetch, AbortSignal */
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { setTimeout } from "node:timers";

// Claude Code runs the statusline after every answer and cancels a run that
// is still going when the next one starts, so this stays below a second.
const TIMEOUT_MS = 1000;

setTimeout(() => {
  process.exit(0);
}, TIMEOUT_MS + 500);

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

function parse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// "Opus · context 22 %", shorter while Claude Code hasn't reported a part.
function line(status) {
  const parts = [];
  const model = status?.model?.display_name;
  const percent = status?.context_window?.used_percentage;
  if (typeof model === "string") parts.push(model);
  if (typeof percent === "number") {
    parts.push(`context ${Math.round(percent)} %`);
  }
  return parts.join(" · ");
}

function print(text) {
  return new Promise((resolve) => process.stdout.write(text, () => resolve()));
}

async function post(dir, body) {
  const hook = JSON.parse(
    await readFile(join(dir, ".gitspore", "hook.json"), "utf8"),
  );
  await fetch(
    `${hook.url}/hooks/${encodeURIComponent(hook.agentId)}/statusline`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-gitspore-secret": hook.secret,
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
}

async function main() {
  const text = await readStdin();
  const status = parse(text);
  if (status === null) return;
  // First the line: it shows in Claude Code even if the daemon is down.
  await print(line(status));
  const dir =
    status.workspace?.project_dir ??
    process.env.CLAUDE_PROJECT_DIR ??
    process.cwd();
  await post(dir, text);
}

main()
  .catch(() => {})
  .finally(() => process.exit(0));
