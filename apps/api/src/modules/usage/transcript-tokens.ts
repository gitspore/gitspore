import type { TokenCounts } from "@gitspore/shared";
import { open, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
} from "node:path";

const NEWLINE = 0x0a;

/** Where Claude Code keeps its session logs, as it finds it itself. */
export function claudeProjectsDir(): string {
  return join(
    process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"),
    "projects",
  );
}

/**
 * The statusline names the session log, and the statusline comes from
 * outside the daemon: only a `.jsonl` inside Claude Code's projects folder
 * is read. On Windows `relative` compares without case.
 */
export function isSessionLog(path: string, projectsDir: string): boolean {
  if (!isAbsolute(path) || extname(path) !== ".jsonl") return false;
  const inside = relative(projectsDir, path);
  return inside !== "" && !inside.startsWith("..") && !isAbsolute(inside);
}

/**
 * Sums the token counts of one agent from its session logs (#42). The log
 * format isn't documented, so it is read defensively: a line that isn't
 * JSON, isn't an answer or has no usage is skipped.
 *
 * Claude Code writes one line per content block of an answer, each with the
 * usage of the whole request, so each `requestId` counts once. Rarely one of
 * those lines has zeros; the largest one counts. Each file is read on from
 * where the last read stopped, up to its last complete line.
 */
export class TranscriptCounter {
  private readonly offsets = new Map<string, number>();
  private readonly requests = new Map<string, TokenCounts>();
  private sum: TokenCounts = zero();

  tokens(): TokenCounts {
    return { ...this.sum };
  }

  /** Each request's id and total, for the repo's token total. */
  *requestTotals(): Generator<[string, number]> {
    for (const [id, counts] of this.requests) yield [id, counts.total];
  }

  /**
   * Reads what is new in the session log and in its subagents' logs
   * (`<session>/subagents/*.jsonl`). A log of an earlier session (after
   * `--continue`) keeps counting: its requests stay in the sum, and the
   * history Claude Code copies into the new log has the same request ids.
   */
  async read(sessionLog: string): Promise<TokenCounts> {
    for (const file of [sessionLog, ...(await subagentLogs(sessionLog))]) {
      await this.readFile(file);
    }
    return this.tokens();
  }

  addLine(line: string): void {
    const entry = object(parse(line));
    if (entry?.type !== "assistant") return;
    const message = object(entry.message);
    const usage = object(message?.usage);
    const id = text(entry.requestId) ?? text(message?.id);
    if (!usage || id === null) return;

    const counts = withTotal({
      input: count(usage.input_tokens),
      output: count(usage.output_tokens),
      cacheRead: count(usage.cache_read_input_tokens),
      cacheWrite: count(usage.cache_creation_input_tokens),
      total: 0,
    });
    const before = this.requests.get(id);
    if (before && before.total >= counts.total) return;
    this.requests.set(id, counts);
    this.sum = withTotal({
      input: this.sum.input - (before?.input ?? 0) + counts.input,
      output: this.sum.output - (before?.output ?? 0) + counts.output,
      cacheRead:
        this.sum.cacheRead - (before?.cacheRead ?? 0) + counts.cacheRead,
      cacheWrite:
        this.sum.cacheWrite - (before?.cacheWrite ?? 0) + counts.cacheWrite,
      total: 0,
    });
  }

  // The rest of the file at once: the first read of a long session may be
  // a few MB, later ones are a few lines. A line still being written stays
  // for the next read; a newline byte never occurs inside a UTF-8 character.
  private async readFile(file: string): Promise<void> {
    const handle = await open(file, "r");
    try {
      const { size } = await handle.stat();
      // Smaller than before: the file was replaced. The request ids keep
      // a second count out.
      let offset = this.offsets.get(file) ?? 0;
      if (size < offset) offset = 0;
      if (size === offset) return;

      const buffer = Buffer.alloc(size - offset);
      await handle.read(buffer, 0, buffer.length, offset);
      const end = buffer.lastIndexOf(NEWLINE);
      if (end === -1) return;
      for (const line of buffer.subarray(0, end).toString("utf8").split("\n")) {
        this.addLine(line);
      }
      this.offsets.set(file, offset + end + 1);
    } finally {
      await handle.close();
    }
  }
}

async function subagentLogs(sessionLog: string): Promise<string[]> {
  const dir = join(
    dirname(sessionLog),
    basename(sessionLog, ".jsonl"),
    "subagents",
  );
  try {
    const names = await readdir(dir);
    return names.filter((n) => n.endsWith(".jsonl")).map((n) => join(dir, n));
  } catch {
    return [];
  }
}

function zero(): TokenCounts {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
}

function withTotal(counts: TokenCounts): TokenCounts {
  return {
    ...counts,
    total: counts.input + counts.output + counts.cacheRead + counts.cacheWrite,
  };
}

function parse(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

// A token count is a whole number of at least 0; anything else counts 0.
function count(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : 0;
}
