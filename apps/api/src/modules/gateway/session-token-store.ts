import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// 32 random bytes as hex.
const TOKEN_FORMAT = /^[0-9a-f]{64}$/;

/**
 * The session token in a file in the user's home, next to config.json, never
 * in a repo. The same token survives a daemon restart (and every reload of
 * `nest start --watch`), so an open tab reconnects and the link from the log
 * is clicked only once. Deleting the file makes a new token on the next start.
 */
export class SessionTokenStore {
  constructor(
    private readonly file = join(homedir(), ".gitspore", "session-token"),
  ) {}

  /** The token from the file. A missing or broken file gets a new one. */
  async load(): Promise<string> {
    const saved = await readFile(this.file, "utf8").then(
      (text) => text.trim(),
      () => "",
    );
    if (TOKEN_FORMAT.test(saved)) return saved;

    const token = randomBytes(32).toString("hex");
    await mkdir(dirname(this.file), { recursive: true });
    // Readable only by the user. Windows ignores the mode; the home folder is
    // private to the user there.
    await writeFile(this.file, token + "\n", { mode: 0o600 });
    return token;
  }
}
