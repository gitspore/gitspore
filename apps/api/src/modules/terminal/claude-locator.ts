import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";

import path from "node:path";
import { TerminalError } from "./terminal-error";
import { execFile } from "node:child_process";
import { access } from "node:fs/promises";

export async function findOnPath(
  names: string[],
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  exists: (file: string) => Promise<boolean>,
): Promise<string | null> {
  // path.win32 / path.posix instead of path: the platform is a parameter, so
  // both branches run on any OS.
  const p = platform === "win32" ? path.win32 : path.posix;

  // Windows calls the variable Path; a plain object copy of process.env
  // keeps that spelling.
  const raw = env.PATH ?? env.Path ?? "";

  const dirs = raw
    .split(p.delimiter)
    // Windows allows quotes around an entry with spaces.
    .map((dir) => dir.replace(/^"|"$/g, ""))
    .filter((dir) => dir !== "");

  // Names outside, folders inside: the first name wins over every later one,
  // so claude.exe (native install) beats claude.cmd (npm) in any folder.
  for (const name of names) {
    for (const dir of dirs) {
      const file = p.join(dir, name);
      if (await exists(file)) {
        return file;
      }
    }
  }

  return null;
}

// What the locator needs from the system. Tests pass fakes, so they neither
// touch the file system nor start a program.
export type LocatorDeps = {
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  exists: (file: string) => Promise<boolean>;
  // True if `<file> --version` ends with exit code 0.
  checkVersion: (file: string) => Promise<boolean>;
};

// Same reason as SPAWN_PTY: an object type does not exist at runtime, so Nest
// looks the dependency up by this name.
export const LOCATOR_DEPS = Symbol("LOCATOR_DEPS");

const VERSION_TIMEOUT_MS = 10_000;
// cmd.exe reads these as syntax, even inside quotes (see agent-terminal.ts).
const CMD_UNSAFE = /[&|<>^%"\r\n]/;

export function systemDeps(): LocatorDeps {
  return {
    env: process.env,
    platform: process.platform,
    exists: (file) =>
      access(file).then(
        () => true,
        () => false,
      ),
    checkVersion: (file) =>
      new Promise((resolve) => {
        const done = (error: Error | null) => resolve(error === null);
        // Fixed arguments only: nothing the user typed reaches this call.
        if (process.platform === "win32" && /\.(cmd|bat)$/i.test(file)) {
          if (CMD_UNSAFE.test(file)) return resolve(false);
          // A .cmd cannot be started directly. Verbatim, so Node leaves the
          // quotes alone, like the command line built for the terminal.
          execFile(
            "cmd.exe",
            ["/d", "/s", "/c", `""${file}" --version"`],
            { windowsVerbatimArguments: true, timeout: VERSION_TIMEOUT_MS },
            done,
          );
        } else {
          execFile(file, ["--version"], { timeout: VERSION_TIMEOUT_MS }, done);
        }
      }),
  };
}

const INSTALL_HINT =
  "Claude Code was not found. Install it from https://claude.com/claude-code " +
  "(or `npm install -g @anthropic-ai/claude-code`) and restart gitspore. " +
  "To use another location, set GITSPORE_CLAUDE_BIN to the full path.";

@Injectable()
export class ClaudeLocator implements OnModuleInit {
  private readonly logger = new Logger(ClaudeLocator.name);
  private cached: string | null = null;
  // The lookup that is running, so two callers share one.
  private pending: Promise<string> | null = null;

  constructor(@Inject(LOCATOR_DEPS) private readonly deps: LocatorDeps) {}

  // Checks once at startup. A throw here would stop the daemon; without Claude
  // everything else still works, so we log and continue. The dispatch fails
  // later with claude_not_found.
  async onModuleInit(): Promise<void> {
    try {
      const file = await this.resolve();
      this.logger.log(`Claude Code found: ${file}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(message);
    }
  }

  resolve(): Promise<string> {
    if (this.cached !== null) return Promise.resolve(this.cached);
    this.pending ??= this.locate()
      .then((file) => {
        this.cached = file;
        return file;
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }

  // Call it when a spawn fails with ENOENT: Claude may have been moved.
  invalidate(): void {
    this.cached = null;
  }

  private async locate(): Promise<string> {
    const { env, platform, exists, checkVersion } = this.deps;
    const override = env.GITSPORE_CLAUDE_BIN;
    const names =
      platform === "win32" ? ["claude.exe", "claude.cmd"] : ["claude"];

    // An override never falls back to the PATH: someone who sets it wants
    // exactly that file, and a typo should show up.
    let file: string | null;
    if (override) {
      file = (await exists(override)) ? override : null;
    } else {
      file = await findOnPath(names, env, platform, exists);
    }

    if (file === null || !(await checkVersion(file))) {
      throw new TerminalError("claude_not_found", INSTALL_HINT);
    }
    return file;
  }
}
