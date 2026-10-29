import { RepoConfig } from "@/config/repo-config";
import type { BranchGraphAck } from "@gitspore/shared";
import { Injectable, Logger } from "@nestjs/common";
import { simpleGit } from "simple-git";
import {
  headPatterns,
  LOG_FORMAT,
  parseCommits,
  parseHeads,
  REF_FORMAT,
} from "./branch-graph";

export const DEFAULT_COMMITS = 40;
// Keeps one request cheap for git and for the panel to draw.
export const MAX_COMMITS = 2000;

const GIT_TIMEOUT_MS = 10_000;

@Injectable()
export class BranchesService {
  private readonly logger = new Logger(BranchesService.name);

  constructor(private readonly config: RepoConfig) {}

  /** The newest `limit` commits; `hasMore` says whether older ones exist. */
  async graph(limit = DEFAULT_COMMITS): Promise<BranchGraphAck> {
    if (!this.config.isSet()) {
      return {
        error: {
          code: "repo_unavailable",
          message: "No repository chosen yet.",
        },
      };
    }
    const baseBranch = this.config.baseBranch();
    const git = simpleGit({
      baseDir: this.config.repoPath(),
      timeout: { block: GIT_TIMEOUT_MS },
    });

    try {
      const heads = parseHeads(
        await git.raw([
          "for-each-ref",
          `--format=${REF_FORMAT}`,
          ...headPatterns(baseBranch),
        ]),
        baseBranch,
      );
      if (heads.length === 0) {
        return { graph: { commits: [], heads, hasMore: false } };
      }

      const count = clampLimit(limit);

      const log = await git.raw([
        "log",
        "--topo-order",
        // One more than asked tells whether older commits exist.
        `--max-count=${count + 1}`,
        `--format=${LOG_FORMAT}`,
        ...new Set(heads.map((head) => head.sha)),
      ]);
      const commits = parseCommits(log);
      return {
        graph: {
          commits: commits.slice(0, count),
          heads,
          hasMore: commits.length > count,
        },
      };
    } catch (error) {
      this.logger.warn(error);
      return {
        error: { code: "git_failed", message: (error as Error).message },
      };
    }
  }
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_COMMITS;
  return Math.min(Math.max(Math.floor(limit), 1), MAX_COMMITS);
}
