import { RepoConfigModule } from "@/config/config.module";
import { Module } from "@nestjs/common";
import { BranchesService } from "./branches.service";

@Module({
  imports: [RepoConfigModule],
  providers: [BranchesService],
  exports: [BranchesService],
})
export class BranchesModule {}
