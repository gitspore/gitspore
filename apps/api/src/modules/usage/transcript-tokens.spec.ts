import { appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isSessionLog, TranscriptCounter } from "./transcript-tokens";

type Usage = {
  input_tokens?: unknown;
  output_tokens?: unknown;
  cache_read_input_tokens?: unknown;
  cache_creation_input_tokens?: unknown;
};

// One line of a session log as Claude Code writes it for an answer, cut
// down to the fields the counter reads.
function answer(requestId: string, usage: Usage): string {
  return JSON.stringify({
    type: "assistant",
    requestId,
    sessionId: "session-1",
    message: { id: `msg-${requestId}`, role: "assistant", usage },
  });
}

const USAGE = {
  input_tokens: 2,
  output_tokens: 300,
  cache_read_input_tokens: 40_000,
  cache_creation_input_tokens: 1_000,
};

describe("TranscriptCounter", () => {
  let dir: string;
  let log: string;
  let counter: TranscriptCounter;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "gitspore-transcript-"));
    log = join(dir, "session-1.jsonl");
    counter = new TranscriptCounter();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const lines = (...entries: string[]) => entries.map((e) => `${e}\n`).join("");

  it("sums the four kinds and the total", async () => {
    await writeFile(
      log,
      lines(
        answer("req-1", USAGE),
        answer("req-2", { ...USAGE, output_tokens: 700 }),
      ),
    );

    expect(await counter.read(log)).toEqual({
      input: 4,
      output: 1_000,
      cacheRead: 80_000,
      cacheWrite: 2_000,
      total: 83_004,
    });
  });

  it("counts a request once, though each content block has its own line", async () => {
    await writeFile(
      log,
      lines(
        answer("req-1", USAGE),
        answer("req-1", USAGE),
        answer("req-1", USAGE),
      ),
    );

    expect((await counter.read(log)).total).toBe(41_302);
  });

  it("takes the largest line of a request, not a line with zeros", async () => {
    const zeros = {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    };
    await writeFile(log, lines(answer("req-1", zeros), answer("req-1", USAGE)));

    expect((await counter.read(log)).total).toBe(41_302);
  });

  it("reads only what is new on the next read", async () => {
    await writeFile(log, lines(answer("req-1", USAGE)));
    await counter.read(log);

    await appendFile(log, lines(answer("req-2", USAGE)));

    expect((await counter.read(log)).total).toBe(2 * 41_302);
  });

  it("leaves a line that is still being written for the next read", async () => {
    const line = answer("req-1", USAGE);
    await writeFile(log, line.slice(0, 20));

    expect((await counter.read(log)).total).toBe(0);

    await appendFile(log, `${line.slice(20)}\n`);

    expect((await counter.read(log)).total).toBe(41_302);
  });

  it("skips lines that aren't JSON, aren't answers or have no usage", async () => {
    await writeFile(
      log,
      lines(
        "not json",
        JSON.stringify({
          type: "user",
          requestId: "req-0",
          message: { usage: USAGE },
        }),
        JSON.stringify({ type: "assistant", requestId: "req-1", message: {} }),
        JSON.stringify({ type: "assistant", message: { usage: USAGE } }),
        "",
        answer("req-2", USAGE),
      ),
    );

    expect((await counter.read(log)).total).toBe(41_302);
  });

  it("counts a missing or odd number as 0", async () => {
    await writeFile(
      log,
      lines(
        answer("req-1", {
          input_tokens: "2",
          output_tokens: -5,
          cache_read_input_tokens: 1.5,
          cache_creation_input_tokens: 10,
        }),
      ),
    );

    expect(await counter.read(log)).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 10,
      total: 10,
    });
  });

  it("falls back to the message id without a requestId", async () => {
    const line = (id: string) =>
      JSON.stringify({ type: "assistant", message: { id, usage: USAGE } });
    await writeFile(log, lines(line("msg-1"), line("msg-1"), line("msg-2")));

    expect((await counter.read(log)).total).toBe(2 * 41_302);
  });

  it("adds the logs of the session's subagents", async () => {
    await writeFile(log, lines(answer("req-1", USAGE)));
    const subagents = join(dir, "session-1", "subagents");
    await mkdir(subagents, { recursive: true });
    await writeFile(
      join(subagents, "agent-a1.jsonl"),
      lines(answer("req-s1", USAGE)),
    );
    await writeFile(
      join(subagents, "notes.txt"),
      lines(answer("req-s2", USAGE)),
    );

    expect((await counter.read(log)).total).toBe(2 * 41_302);
  });

  it("keeps an earlier session's tokens and counts copied history once", async () => {
    await writeFile(log, lines(answer("req-1", USAGE)));
    await counter.read(log);
    // --continue: a new log, starting with the history of the old one.
    const next = join(dir, "session-2.jsonl");
    await writeFile(
      next,
      lines(answer("req-1", USAGE), answer("req-2", USAGE)),
    );

    expect((await counter.read(next)).total).toBe(2 * 41_302);
  });

  it("reads a replaced, shorter file from the start without counting twice", async () => {
    await writeFile(log, lines(answer("req-1", USAGE), answer("req-2", USAGE)));
    await counter.read(log);

    await writeFile(log, lines(answer("req-3", USAGE)));

    expect((await counter.read(log)).total).toBe(3 * 41_302);
  });

  it("throws for a log that doesn't exist yet", async () => {
    await expect(counter.read(log)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("isSessionLog", () => {
  const projects = join(tmpdir(), ".claude", "projects");

  it("accepts a .jsonl inside the projects folder", () => {
    expect(isSessionLog(join(projects, "repo", "s.jsonl"), projects)).toBe(
      true,
    );
  });

  it.each([
    ["outside the folder", join(tmpdir(), "s.jsonl")],
    ["out of it with ..", join(projects, "..", "..", "s.jsonl")],
    ["not a .jsonl", join(projects, "repo", "s.json")],
    ["relative", "repo/s.jsonl"],
    ["the folder itself", projects],
  ])("refuses a path %s", (_, path) => {
    expect(isSessionLog(path, projects)).toBe(false);
  });
});
