import { Module } from "@nestjs/common";
import { StateModule } from "./modules/state/state.module";

// Feature modules from src/modules and background workers from
// src/workers get registered here as the app grows.
@Module({
  imports: [StateModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
