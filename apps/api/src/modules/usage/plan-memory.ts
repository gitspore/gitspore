import type { PlanUsage } from "@gitspore/shared";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Limit } from "./statusline";

/**
 * The plan's last known limits, in a file in the user's home like the
 * chosen repos (RepoMemory). Claude Code sends the limits only after an
 * agent's first answer, so without this the top bar would stay empty after
 * every daemon start until then.
 */
export class PlanMemory {
  private writing: Promise<void> = Promise.resolve();

  constructor(
    private readonly file = join(homedir(), ".gitspore", "plan.json"),
  ) {}

  /** A missing or broken file counts as none, as does an odd window. */
  async load(): Promise<PlanUsage | null> {
    try {
      const plan = JSON.parse(await readFile(this.file, "utf8")) as {
        fiveHour?: unknown;
        sevenDay?: unknown;
      } | null;
      if (typeof plan !== "object" || plan === null) return null;
      return { fiveHour: limit(plan.fiveHour), sevenDay: limit(plan.sevenDay) };
    } catch {
      return null;
    }
  }

  /** One write after the other, so the last plan is the one that stays. */
  save(plan: PlanUsage): Promise<void> {
    const write = this.writing.then(async () => {
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(this.file, JSON.stringify(plan, null, 2) + "\n");
    });
    this.writing = write.catch(() => {});
    return write;
  }
}

function limit(value: unknown): Limit | null {
  const candidate = value as Limit | null | undefined;
  if (
    typeof candidate?.usedPercent !== "number" ||
    !Number.isFinite(candidate.usedPercent) ||
    typeof candidate.resetsAt !== "string" ||
    Number.isNaN(Date.parse(candidate.resetsAt))
  ) {
    return null;
  }
  return { usedPercent: candidate.usedPercent, resetsAt: candidate.resetsAt };
}
