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

export const MAX_COMMITS = 40;

const GIT_TIMEOUT_MS = 10_000;

@Injectable()
export class BranchesService {
  private readonly logger = new Logger(BranchesService.name);

  constructor(private readonly config: RepoConfig) {}

  async graph(): Promise<BranchGraphAck> {
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
      if (heads.length === 0) return { graph: { commits: [], heads } };

      const log = await git.raw([
        "log",
        "--topo-order",
        `--max-count=${MAX_COMMITS}`,
        `--format=${LOG_FORMAT}`,
        ...new Set(heads.map((head) => head.sha)),
      ]);
      return { graph: { commits: parseCommits(log), heads } };
    } catch (error) {
      this.logger.warn(error);
      return {
        error: { code: "git_failed", message: (error as Error).message },
      };
    }
  }
}
