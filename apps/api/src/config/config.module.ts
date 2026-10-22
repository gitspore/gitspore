import { Module } from "@nestjs/common";
import { startRepoConfig } from "./load-repo-config";
import { RepoConfig } from "./repo-config";
import { RepoMemory } from "./repo-memory";

// Decides once at startup which repo the daemon works in (startRepoConfig).
// A wrong GITSPORE_REPO stops the daemon; without one it may start with
// none.
@Module({
  providers: [
    { provide: RepoMemory, useFactory: () => new RepoMemory() },
    {
      provide: RepoConfig,
      useFactory: (memory: RepoMemory) => startRepoConfig(process.env, memory),
      inject: [RepoMemory],
    },
  ],
  exports: [RepoConfig, RepoMemory],
})
export class RepoConfigModule {}
