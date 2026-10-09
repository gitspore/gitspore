import { Module } from "@nestjs/common";
import { loadRepoConfig } from "./load-repo-config";
import { RepoConfig } from "./repo-config";

//
//
//
// Checks GITSPORE_REPO once at startup; a failed check stops the daemon.
@Module({
  providers: [
    {
      provide: RepoConfig,
      useFactory: () => loadRepoConfig(process.env),
    },
  ],
  exports: [RepoConfig],
})
export class RepoConfigModule {}
