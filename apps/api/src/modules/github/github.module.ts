import { RepoConfigModule } from "@/config/config.module";
import { RepoConfig } from "@/config/repo-config";
import { Module } from "@nestjs/common";
import { StateModule } from "../state/state.module";
import {
  EnvOrGhCredentials,
  ghAuthToken,
  GitHubCredentialsProvider,
} from "./credentials";
import { GitHubSource, RepoGitHubSource } from "./github-source";
import { GitHubService } from "./github.service";

// The two abstract classes are the swap points: a GitHub login (device flow)
// replaces the credentials provider. GitHubService stays as it is.
@Module({
  imports: [RepoConfigModule, StateModule],
  providers: [
    {
      provide: GitHubCredentialsProvider,
      useFactory: () => new EnvOrGhCredentials(process.env, ghAuthToken),
    },
    {
      provide: GitHubSource,
      // Reads the path on every connect: the repo can change (#58), and
      // GitHubService.restart() connects again.
      useFactory: (
        config: RepoConfig,
        credentials: GitHubCredentialsProvider,
      ): GitHubSource => ({
        connect: () =>
          new RepoGitHubSource(config.repoPath(), credentials).connect(),
      }),
      inject: [RepoConfig, GitHubCredentialsProvider],
    },
    GitHubService,
  ],
  // The setup screen asks for a token to check other repos (#58).
  exports: [GitHubService, GitHubCredentialsProvider],
})
export class GitHubModule {}
