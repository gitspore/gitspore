import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SCRIPT = join(__dirname, "fake-claude.mjs");

// Writes a file into `dir` that starts fake-claude.mjs like a real Claude
// would be started, and returns its path: a .cmd on Windows (like npm's
// claude.cmd), an executable shell script elsewhere. Made per test, so nothing
// depends on file modes or line endings in Git.
export function createFakeClaude(dir: string): string {
  if (process.platform === "win32") {
    const file = join(dir, "fake-claude.cmd");
    writeFileSync(
      file,
      `@echo off\r\n"${process.execPath}" "${SCRIPT}" %*\r\nexit /b %ERRORLEVEL%\r\n`,
    );
    return file;
  }
  const file = join(dir, "fake-claude");
  writeFileSync(
    file,
    `#!/bin/sh\nexec "${process.execPath}" "${SCRIPT}" "$@"\n`,
  );
  chmodSync(file, 0o755);
  return file;
}
