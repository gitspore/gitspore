import { Module } from "@nestjs/common";
import { spawn } from "node-pty";
import type { SpawnPty } from "./agent-terminal";
import { SPAWN_PTY, TerminalService } from "./terminal.service";

@Module({
  providers: [
    TerminalService,
    { provide: SPAWN_PTY, useValue: spawn satisfies SpawnPty },
  ],
  exports: [TerminalService],
})
export class TerminalModule {}
