import { RepoConfigModule } from "@/config/config.module";
import { Module } from "@nestjs/common";
import { WorktreeService } from "./worktree.service";

@Module({
  imports: [RepoConfigModule],
  providers: [WorktreeService],
  exports: [WorktreeService],
})
export class WorktreeModule {}
