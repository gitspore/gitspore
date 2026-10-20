#!/usr/bin/env node
// Stands in for Claude Code in tests. Behaviour comes from the environment:
//   FAKE_CLAUDE_OUTPUT     text to print (default: "fake claude")
//   FAKE_CLAUDE_EXIT_CODE  exit code (default: 0)
//   FAKE_CLAUDE_ARGS_FILE  write the arguments here as JSON, so a test can
//                          check what the daemon passed
//   FAKE_CLAUDE_STAY       any value: keep running until killed
import { writeFileSync } from "node:fs";
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

if (process.env.FAKE_CLAUDE_STAY) {
  // An interval keeps the event loop alive until the process is killed.
  setInterval(() => {}, 1000);
} else {
  process.exit(Number(process.env.FAKE_CLAUDE_EXIT_CODE ?? 0));
}
