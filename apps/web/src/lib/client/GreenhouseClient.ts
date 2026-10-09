import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from "@gitspore/shared";

export interface GreenhouseClient {
  connect(): void;
  disconnect(): void;
  emit<E extends keyof ClientToServerEvents>(
    event: E,
    ...args: Parameters<ClientToServerEvents[E]>
  ): void;
  on<E extends keyof ServerToClientEvents>(
    event: E,
    listener: ServerToClientEvents[E],
  ): void;
  off<E extends keyof ServerToClientEvents>(
    event: E,
    listener: ServerToClientEvents[E],
  ): void;
}
