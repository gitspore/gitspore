import { RepoConfigModule } from "@/config/config.module";
import { Module } from "@nestjs/common";
import { GitHubModule } from "../github/github.module";
import { HookModule } from "../hooks/hook.module";
import { StateModule } from "../state/state.module";
import { TerminalModule } from "../terminal/terminal.module";
import { WorktreeModule } from "../worktree/worktree.module";
import { AgentGateway } from "./agent.gateway";
import { AgentService } from "./agent.service";

@Module({
  imports: [
    RepoConfigModule,
    StateModule,
    GitHubModule,
    TerminalModule,
    WorktreeModule,
    HookModule,
  ],
  providers: [AgentService, AgentGateway],
  exports: [AgentService],
})
export class AgentModule {}
