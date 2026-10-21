import { RepoConfigModule } from "@/config/config.module";
import { Module } from "@nestjs/common";
import { GitHubModule } from "../github/github.module";
import { StateModule } from "../state/state.module";
import { WorktreeModule } from "../worktree/worktree.module";
import { RepoService } from "./repo.service";

@Module({
  imports: [RepoConfigModule, StateModule, GitHubModule, WorktreeModule],
  providers: [RepoService],
  exports: [RepoService],
})
export class RepoModule {}
