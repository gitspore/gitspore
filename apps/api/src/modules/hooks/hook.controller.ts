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
    if (
      origin !== undefined ||
      !isLoopback(ip) ||
      !this.hooks.isValid(agentId, secret)
    ) {
      throw new ForbiddenException();
    }
    this.hooks.receive(agentId, payload);
  }
}
