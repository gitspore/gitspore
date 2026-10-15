import { Module } from "@nestjs/common";
import { StateModule } from "./modules/state/state.module";
import { GatewayModule } from "./modules/gateway/gateway.module";
import { RepoConfigModule } from "./config/config.module";
import { WorktreeModule } from "./modules/worktree/worktree.module";
import { GitHubModule } from "./modules/github/github.module";
import { TerminalModule } from "./modules/terminal/terminal.module";

// Feature modules from src/modules and background workers from
// src/workers get registered here as the app grows.
@Module({
  imports: [
    RepoConfigModule,
    StateModule,
    GatewayModule,
    WorktreeModule,
    GitHubModule,
    TerminalModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
