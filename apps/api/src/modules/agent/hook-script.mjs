import { readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

const TIMEOUT_MS = 2000;

setTimeout(() => {
  process.exit(0);
}, TIMEOUT_MS + 1000);

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

async function main() {
  const dir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const hook = JSON.parse(
    await readFile(join(dir, ".gitspore", "hook.json"), "utf8"),
  );
  await fetch(`${hook.url}/hooks/${encodeURIComponent(hook.agentId)}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-gitspore-secret": hook.secret,
    },
    body: await readStdin(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

main()
  .catch(() => {})
  .finally(() => process.exit(0));
