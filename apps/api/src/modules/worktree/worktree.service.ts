import { RepoConfig } from "@/config/repo-config";
import { Injectable } from "@nestjs/common";
import { simpleGit, SimpleGit } from "simple-git";

@Injectable()
export class WorktreeService {
  private readonly git: SimpleGit;

  constructor(private readonly config: RepoConfig) {
    // Reads repoPath() once. When the setup-screen ticket lets the user
    // switch repos, it has to create a new instance.
    this.git = simpleGit({
      baseDir: config.repoPath(),
      maxConcurrentProcesses: 1,
      timeout: { block: 30_000 },
    });
  }

  private run(args: string[]): Promise<string> {
    return this.git.raw(args);
  }
}
