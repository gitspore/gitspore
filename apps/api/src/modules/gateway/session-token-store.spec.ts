import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionTokenStore } from "./session-token-store";

describe("SessionTokenStore", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "gitspore-token-"));
    // A folder that doesn't exist yet, like ~/.gitspore on a first start
    file = join(dir, ".gitspore", "session-token");
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("creates a token on the first start and writes it to the file", async () => {
    const token = await new SessionTokenStore(file).load();

    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect((await readFile(file, "utf8")).trim()).toBe(token);
  });

  it("keeps the token across restarts", async () => {
    const first = await new SessionTokenStore(file).load();

    expect(await new SessionTokenStore(file).load()).toBe(first);
  });

  it("reads a token written by hand, with a trailing newline", async () => {
    const token = "ab".repeat(32);
    await new SessionTokenStore(file).load();
    await writeFile(file, token + "\r\n");

    expect(await new SessionTokenStore(file).load()).toBe(token);
  });

  it.each([
    ["is empty", ""],
    ["is too short", "abc"],
    ["is not hex", "zz".repeat(32)],
  ])("replaces a file that %s with a new token", async (_, text) => {
    await new SessionTokenStore(file).load();
    await writeFile(file, text);

    const token = await new SessionTokenStore(file).load();

    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect((await readFile(file, "utf8")).trim()).toBe(token);
  });
});
