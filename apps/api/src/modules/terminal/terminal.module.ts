import { Module } from "@nestjs/common";
import { spawn } from "node-pty";
import type { SpawnPty } from "./agent-terminal";
import { SPAWN_PTY, TerminalService } from "./terminal.service";
import { ClaudeLocator, LOCATOR_DEPS, systemDeps } from "./claude-locator";

@Module({
  providers: [
    TerminalService,
    ClaudeLocator,
    { provide: LOCATOR_DEPS, useFactory: systemDeps },
    { provide: SPAWN_PTY, useValue: spawn satisfies SpawnPty },
  ],
  exports: [TerminalService, ClaudeLocator],
})
export class TerminalModule {}
