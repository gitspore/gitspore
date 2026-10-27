/* global fetch, AbortSignal */
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";

// Claude Code runs the statusline after every answer and cancels a run that
// is still going when the next one starts, so this stays short. The user's
// own statusline gets a little longer: it may ask git.
const TIMEOUT_MS = 1000;
const OWN_TIMEOUT_MS = 2000;

setTimeout(() => {
  process.exit(0);
}, OWN_TIMEOUT_MS + 500);

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

// The statusline the user set for Claude Code, which --settings replaces
// while the agent runs in gitspore. In Claude Code's order: the project's
// local settings, the project's, the user's.
async function ownCommand(projectDir) {
  const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
  const files = [
    join(projectDir, ".claude", "settings.local.json"),
    join(projectDir, ".claude", "settings.json"),
    join(configDir, "settings.json"),
  ];
  for (const file of files) {
    try {
      const { statusLine } = JSON.parse(await readFile(file, "utf8"));
      const command = statusLine?.type === "command" && statusLine.command;
      if (typeof command === "string" && command !== "") return command;
    } catch {
      // No such file, or not JSON: the next one.
    }
  }
  return null;
}

// The shell Claude Code runs a statusline in: Git Bash on Windows, or
// PowerShell without it; sh elsewhere.
function shell() {
  if (process.platform !== "win32") return ["/bin/sh", "-c"];
  const bash =
    process.env.CLAUDE_CODE_GIT_BASH_PATH ||
    join(
      process.env.ProgramFiles ?? "C:\\Program Files",
      "Git",
      "bin",
      "bash.exe",
    );
  return existsSync(bash)
    ? [bash, "-c"]
    : ["powershell.exe", "-NoProfile", "-Command"];
}

// The command's output, or "" if it fails, prints nothing or takes too long.
function run(command, stdin) {
  return new Promise((resolve) => {
    const [file, ...args] = shell();
    const child = spawn(file, [...args, command], { windowsHide: true });
    // Without waiting for "close": on Windows kill() ends the shell, but a
    // program it started can hold the output open until it ends itself.
    const timer = setTimeout(() => {
      child.kill();
      resolve("");
    }, OWN_TIMEOUT_MS);
    let out = "";
    child.stdout.on("data", (data) => (out += data));
    child.stdin.on("error", () => {});
    child.on("error", () => resolve(""));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? out.trimEnd() : "");
    });
    child.stdin.end(stdin);
  });
}

// The user's own statusline if there is one and it prints something,
// otherwise gitspore's short line.
async function footer(projectDir, status, text) {
  const command = await ownCommand(projectDir);
  const own = command === null ? "" : await run(command, text);
  return own || line(status);
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
  const dir =
    status.workspace?.project_dir ??
    process.env.CLAUDE_PROJECT_DIR ??
    process.cwd();
  // Side by side: a slow statusline of the user's doesn't hold the post
  // back, and the line shows even if the daemon is down.
  await Promise.all([
    post(dir, text).catch(() => {}),
    footer(dir, status, text).then(print),
  ]);
}

main()
  .catch(() => {})
  .finally(() => process.exit(0));
