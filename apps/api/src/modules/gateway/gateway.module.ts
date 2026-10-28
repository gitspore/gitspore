import { Module } from "@nestjs/common";
import { BranchesModule } from "../branches/branches.module";
import { GitHubModule } from "../github/github.module";
import { RepoModule } from "../repo/repo.module";
import { StateModule } from "../state/state.module";
import { TerminalModule } from "../terminal/terminal.module";
import { SESSION_TOKEN, SessionAuth } from "./session-auth.service";
import { SessionTokenStore } from "./session-token-store";
import { StateGateway } from "./state.gateway";
import { TerminalGateway } from "./terminal.gateway";

@Module({
  imports: [
    StateModule,
    GitHubModule,
    RepoModule,
    TerminalModule,
    BranchesModule,
  ],
  providers: [
    {
      provide: SESSION_TOKEN,
      // Read once at startup.
      useFactory: () => new SessionTokenStore().load(),
    },
    SessionAuth,
    StateGateway,
    TerminalGateway,
  ],
})
export class GatewayModule {}
