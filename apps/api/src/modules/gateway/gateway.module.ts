import { Module } from "@nestjs/common";
import { GitHubModule } from "../github/github.module";
import { StateModule } from "../state/state.module";
import { TerminalModule } from "../terminal/terminal.module";
import { SessionAuth } from "./session-auth.service";
import { StateGateway } from "./state.gateway";
import { TerminalGateway } from "./terminal.gateway";

@Module({
  imports: [StateModule, GitHubModule, TerminalModule],
  providers: [SessionAuth, StateGateway, TerminalGateway],
})
export class GatewayModule {}
