#!/usr/bin/env node
// Stands in for Claude Code in tests. Behaviour comes from the environment:
//   FAKE_CLAUDE_OUTPUT     text to print (default: "fake claude")
//   FAKE_CLAUDE_EXIT_CODE  exit code (default: 0)
//   FAKE_CLAUDE_ARGS_FILE  write the arguments here as JSON, so a test can
//                          check what the daemon passed
//   FAKE_CLAUDE_HOOKS      hook events to fire, comma-separated and in order,
//                          through the hooks of the --settings file, the way
//                          Claude Code runs them. "Notification:<type>" also
//                          sets notification_type.
//   FAKE_CLAUDE_STAY       any value: keep running until killed
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { setInterval } from "node:timers";

const args = process.argv.slice(2);

if (args.includes("--version")) {
  process.stdout.write("fake-claude 0.0.0\n");
  process.exit(0);
}

if (process.env.FAKE_CLAUDE_ARGS_FILE) {
  writeFileSync(process.env.FAKE_CLAUDE_ARGS_FILE, JSON.stringify(args));
}

process.stdout.write(`${process.env.FAKE_CLAUDE_OUTPUT ?? "fake claude"}\n`);

if (process.env.FAKE_CLAUDE_HOOKS) {
  fireHooks(process.env.FAKE_CLAUDE_HOOKS.split(","));
}

if (process.env.FAKE_CLAUDE_STAY) {
  // An interval keeps the event loop alive until the process is killed.
  setInterval(() => {}, 1000);
} else {
  process.exit(Number(process.env.FAKE_CLAUDE_EXIT_CODE ?? 0));
}

// Runs every hook the --settings file registers for each event, one after
// the other, as Claude Code does: the command directly with its args (no
// shell), the event as JSON on stdin, CLAUDE_PROJECT_DIR set.
function fireHooks(events) {
  const at = args.indexOf("--settings");
  if (at === -1) return;
  const { hooks = {} } = JSON.parse(
    readFileSync(resolve(args[at + 1]), "utf8"),
  );

  for (const event of events) {
    const [name, notificationType] = event.split(":");
    const payload = JSON.stringify({
      hook_event_name: name,
      notification_type: notificationType,
    });
    for (const group of hooks[name] ?? []) {
      for (const hook of group.hooks) {
        spawnSync(hook.command, hook.args ?? [], {
          input: payload,
          env: { ...process.env, CLAUDE_PROJECT_DIR: process.cwd() },
          timeout: (hook.timeout ?? 600) * 1000,
        });
      }
    }
  }
}
