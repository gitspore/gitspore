import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Post,
} from "@nestjs/common";
import { HookService } from "./hook.service";

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export function isLoopback(address: string | undefined): boolean {
  return address !== undefined && LOOPBACK.has(address);
}

@Controller("hooks")
export class HookController {
  constructor(private readonly hooks: HookService) {}

  @Post(":agentId")
  @HttpCode(HttpStatus.NO_CONTENT)
  receive(
    @Param("agentId") agentId: string,
    @Ip() ip: string | undefined,
    @Headers("origin") origin: string | undefined,
    @Headers("x-gitspore-secret") secret: string | undefined,
    @Body() payload: unknown,
  ): void {
    this.check(agentId, ip, origin, secret);
    this.hooks.receive(agentId, payload);
  }

  // The agent's statusline (#42): plan limits, context, session log.
  @Post(":agentId/statusline")
  @HttpCode(HttpStatus.NO_CONTENT)
  receiveStatusline(
    @Param("agentId") agentId: string,
    @Ip() ip: string | undefined,
    @Headers("origin") origin: string | undefined,
    @Headers("x-gitspore-secret") secret: string | undefined,
    @Body() payload: unknown,
  ): void {
    this.check(agentId, ip, origin, secret);
    this.hooks.receiveStatusline(agentId, payload);
  }

  private check(
    agentId: string,
    ip: string | undefined,
    origin: string | undefined,
    secret: string | undefined,
  ): void {
    if (
      origin !== undefined ||
      !isLoopback(ip) ||
      !this.hooks.isValid(agentId, secret)
    ) {
      throw new ForbiddenException();
    }
  }
}
