import { AgentId } from "@gitspore/shared";
import { Injectable } from "@nestjs/common";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { daemonPort } from "@/config/daemon-port";

type Listener = (agentId: AgentId, payload: unknown) => void;

@Injectable()
export class HookService {
  private readonly secrets = new Map<AgentId, string>();
  private listener: Listener = () => {};
  private statuslineListener: Listener = () => {};

  issue(agentId: AgentId): string {
    const secret = randomBytes(32).toString("hex");
    this.secrets.set(agentId, secret);
    return secret;
  }

  revoke(agentId: AgentId): void {
    this.secrets.delete(agentId);
  }

  url(): string {
    return `http://127.0.0.1:${daemonPort()}`;
  }

  isValid(agentId: AgentId, candidate: unknown): boolean {
    const secret = this.secrets.get(agentId);

    if (secret === undefined || typeof candidate !== "string") return false;

    const expected = Buffer.from(secret);
    const actual = Buffer.from(candidate);

    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }

  onEvent(listener: Listener): void {
    this.listener = listener;
  }

  receive(agentId: AgentId, payload: unknown): void {
    this.listener(agentId, payload);
  }

  onStatusline(listener: Listener): void {
    this.statuslineListener = listener;
  }

  receiveStatusline(agentId: AgentId, payload: unknown): void {
    this.statuslineListener(agentId, payload);
  }
}
