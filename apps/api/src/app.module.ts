import { Module } from "@nestjs/common";
import { StateModule } from "./modules/state/state.module";
import { GatewayModule } from "./modules/gateway/gateway.module";
import { RepoConfigModule } from "./config/config.module";

// Feature modules from src/modules and background workers from
// src/workers get registered here as the app grows.
@Module({
  imports: [RepoConfigModule, StateModule, GatewayModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
