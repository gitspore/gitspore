import { Module } from "@nestjs/common";
import { GitHubModule } from "../github/github.module";
import { StateModule } from "../state/state.module";
import { SessionAuth } from "./session-auth.service";
import { StateGateway } from "./state.gateway";

@Module({
  imports: [StateModule, GitHubModule],
  providers: [SessionAuth, StateGateway],
})
export class GatewayModule {}
