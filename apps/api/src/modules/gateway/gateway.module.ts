import { Module } from "@nestjs/common";
import { StateModule } from "../state/state.module";
import { SessionAuth } from "./session-auth.service";
import { StateGateway } from "./state.gateway";

@Module({
  imports: [StateModule],
  providers: [SessionAuth, StateGateway],
})
export class GatewayModule {}
