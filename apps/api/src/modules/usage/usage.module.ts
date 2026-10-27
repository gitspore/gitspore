import { Module } from "@nestjs/common";
import { HookModule } from "../hooks/hook.module";
import { StateModule } from "../state/state.module";
import { UsageService } from "./usage.service";

@Module({
  imports: [StateModule, HookModule],
  providers: [UsageService],
})
export class UsageModule {}
