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
// replaces the credentials provider, a setup screen for other repos the
// source. GitHubService stays as it is.
@Module({
  imports: [RepoConfigModule, StateModule],
  providers: [
    {
      provide: GitHubCredentialsProvider,
      useFactory: () => new EnvOrGhCredentials(process.env, ghAuthToken),
    },
    {
      provide: GitHubSource,
      useFactory: (
        config: RepoConfig,
        credentials: GitHubCredentialsProvider,
      ) => new RepoGitHubSource(config.repoPath(), credentials),
      inject: [RepoConfig, GitHubCredentialsProvider],
    },
    GitHubService,
  ],
  exports: [GitHubService],
})
export class GitHubModule {}
