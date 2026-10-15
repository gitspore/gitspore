import { RepoConfigModule } from "@/config/config.module";
import { Module } from "@nestjs/common";
import { StateModule } from "../state/state.module";
import { TerminalModule } from "../terminal/terminal.module";
import { OverviewAgentService, START_OVERVIEW } from "./overview-agent.service";

@Module({
  imports: [RepoConfigModule, StateModule, TerminalModule],
  providers: [
    OverviewAgentService,
    {
      provide: START_OVERVIEW,
      // Read once at startup.
      // Off unless "1".
      useFactory: () => process.env.GITSPORE_START_OVERVIEW === "1",
    },
  ],
})
export class OverviewModule {}
