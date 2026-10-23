import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type RememberedRepo = { path: string; baseBranch: string };

/** At most this many repos are kept, the last chosen first. */
const MAX_RECENT = 5;

/**
 * The repos chosen on the setup screen (#58), in a file in the user's home,
 * never in a repo. The next start uses the last one.
 */
export class RepoMemory {
  constructor(
    private readonly file = join(homedir(), ".gitspore", "config.json"),
  ) {}

  /** Last chosen first. A missing or broken file counts as none. */
  async recent(): Promise<RememberedRepo[]> {
    try {
      const { recent } = JSON.parse(await readFile(this.file, "utf8")) as {
        recent?: unknown;
      };
      return Array.isArray(recent) ? recent.filter(isRememberedRepo) : [];
    } catch {
      return [];
    }
  }

  /** Moves the repo to the front, or adds it there. */
  async remember(repo: RememberedRepo): Promise<void> {
    const others = (await this.recent()).filter((r) => r.path !== repo.path);
    const recent = [repo, ...others].slice(0, MAX_RECENT);
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify({ recent }, null, 2) + "\n");
  }
}

function isRememberedRepo(value: unknown): value is RememberedRepo {
  const repo = value as RememberedRepo | null;
  return typeof repo?.path === "string" && typeof repo.baseBranch === "string";
}
