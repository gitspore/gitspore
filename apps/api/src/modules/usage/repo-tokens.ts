import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

type Saved = { repos: Record<string, Record<string, number>> };

/**
 * Each repo's token total (#42, ADR 0009), in a file in the user's home like
 * the plan (PlanMemory). Claude Code deletes its logs after 30 days, and the
 * daemon counts an agent only while it runs, so the total keeps every
 * request it has seen, with its count: a request is counted once, also when
 * `--continue` copies it into a new log or the daemon reads a log again
 * after a restart.
 */
export class RepoTokens {
  private readonly repos = new Map<string, Map<string, number>>();
  private readonly sums = new Map<string, number>();
  private writing: Promise<void> = Promise.resolve();

  constructor(
    private readonly file = join(homedir(), ".gitspore", "usage.json"),
  ) {}

  /** A missing or broken file counts as none; odd counts are skipped. */
  async load(): Promise<void> {
    let saved: Partial<Saved> | null;
    try {
      saved = JSON.parse(await readFile(this.file, "utf8")) as Partial<Saved>;
    } catch {
      return;
    }
    const repos = saved?.repos;
    if (typeof repos !== "object" || repos === null) return;
    for (const [repo, requests] of Object.entries(repos)) {
      if (typeof requests !== "object" || requests === null) continue;
      this.add(repo, Object.entries(requests));
    }
  }

  /** The repo's total; 0 for a repo with nothing counted yet. */
  total(repo: string): number {
    return this.sums.get(repo) ?? 0;
  }

  /**
   * Adds the requests, each id once with its largest count, like
   * TranscriptCounter. True if the repo's total changed.
   */
  add(repo: string, requests: Iterable<[string, unknown]>): boolean {
    let known = this.repos.get(repo);
    if (!known) {
      known = new Map();
      this.repos.set(repo, known);
    }
    let sum = this.total(repo);
    const before = sum;
    for (const [id, count] of requests) {
      if (typeof count !== "number" || !Number.isSafeInteger(count)) continue;
      const counted = known.get(id) ?? 0;
      if (count <= counted) continue;
      known.set(id, count);
      sum += count - counted;
    }
    this.sums.set(repo, sum);
    return sum !== before;
  }

  /** One write after the other, so the last state is the one that stays. */
  save(): Promise<void> {
    const write = this.writing.then(async () => {
      const repos: Saved["repos"] = {};
      for (const [repo, known] of this.repos) {
        repos[repo] = Object.fromEntries(known);
      }
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(this.file, JSON.stringify({ repos }) + "\n");
    });
    this.writing = write.catch(() => {});
    return write;
  }
}
