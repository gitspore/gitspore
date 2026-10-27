import { Module } from "@nestjs/common";
import { HookModule } from "../hooks/hook.module";
import { StateModule } from "../state/state.module";
import { PlanMemory } from "./plan-memory";
import { RepoTokens } from "./repo-tokens";
import { UsageService } from "./usage.service";

@Module({
  imports: [StateModule, HookModule],
  providers: [
    UsageService,
    { provide: PlanMemory, useFactory: () => new PlanMemory() },
    { provide: RepoTokens, useFactory: () => new RepoTokens() },
  ],
})
export class UsageModule {}
