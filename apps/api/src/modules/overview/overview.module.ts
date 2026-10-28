import { RepoConfigModule } from "@/config/config.module";
import { Module } from "@nestjs/common";
import { HookModule } from "../hooks/hook.module";
import { StateModule } from "../state/state.module";
import { TerminalModule } from "../terminal/terminal.module";
import { WorktreeModule } from "../worktree/worktree.module";
import { OverviewAgentService, START_OVERVIEW } from "./overview-agent.service";

@Module({
  imports: [
    RepoConfigModule,
    StateModule,
    TerminalModule,
    HookModule,
    WorktreeModule,
  ],
  providers: [
    OverviewAgentService,
    {
      provide: START_OVERVIEW,
      // Read once at startup.
      // On unless "0".
      useFactory: () => process.env.GITSPORE_START_OVERVIEW !== "0",
    },
  ],
  // RepoService restarts it in another repo (#58).
  exports: [OverviewAgentService],
})
export class OverviewModule {}
