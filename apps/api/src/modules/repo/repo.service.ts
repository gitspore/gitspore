import type { RepoCheck } from "@gitspore/shared";
import { Injectable, OnModuleInit } from "@nestjs/common";
import { RepoConfig } from "@/config/repo-config";
import { StateStore } from "../state/state.store";
import { GitHubCredentialsProvider } from "../github/credentials";
import { RepoGitHubSource } from "../github/github-source";
import { checkRepo, claudeOnPath } from "./check-repo";

/**
 * The repo in the state, and the checks of the setup screen (#58). Choosing
 * another repo comes next; until then the repo is the one the daemon
 * started with.
 */
@Injectable()
export class RepoService implements OnModuleInit {
  constructor(
    private readonly store: StateStore,
    private readonly config: RepoConfig,
    private readonly credentials: GitHubCredentialsProvider,
  ) {}

  // Nest awaits this before the gateway listens, so the first snapshot a
  // client gets already has the repo. GitHubService connects on its own
  // too; this asks once more, only for "on" or "off".
  async onModuleInit(): Promise<void> {
    const path = this.config.repoPath();
    const github = await this.connectGitHub(path);
    this.store.setRepo({
      path,
      baseBranch: this.config.baseBranch(),
      github: "api" in github ? "on" : "off",
    });
  }

  check(path: string, baseBranch: string): Promise<RepoCheck[]> {
    return checkRepo(path, baseBranch, {
      connectGitHub: (top) => this.connectGitHub(top),
      claudeInstalled: claudeOnPath,
    });
  }

  private connectGitHub(top: string) {
    return new RepoGitHubSource(top, this.credentials).connect();
  }
}
