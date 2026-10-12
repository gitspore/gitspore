import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@gitspore/shared";
import type { GreenhouseClient } from "./GreenhouseClient";

/**
 * The GreenhouseClient for the real daemon (apps/api): a thin wrapper around
 * a Socket.io connection. It adds nothing of its own, the events and their
 * payloads are the ones of the contract in @gitspore/shared.
 *
 * Nothing happens before connect(), and the socket retries on its own if the
 * daemon is not running or goes away. Until it connects, no event arrives, so
 * the UI simply has no state.
 */
export class SocketClient implements GreenhouseClient {
  private readonly socket: Socket<ServerToClientEvents, ClientToServerEvents>;

  /** @param url Where the daemon listens, e.g. http://localhost:3001. */
  constructor(url: string) {
    this.socket = io(url, { autoConnect: false });
  }

  connect(): void {
    this.socket.connect();
  }

  disconnect(): void {
    this.socket.disconnect();
  }

  emit<E extends keyof ClientToServerEvents>(
    event: E,
    ...args: Parameters<ClientToServerEvents[E]>
  ): void {
    this.socket.emit(event, ...args);
  }

  on<E extends keyof ServerToClientEvents>(
    event: E,
    listener: ServerToClientEvents[E],
  ): void {
    // Socket.io's listener type is a conditional type that TypeScript cannot
    // resolve for a generic E. The signature above is the checked contract.
    this.socket.on(event, listener as never);
  }

  off<E extends keyof ServerToClientEvents>(
    event: E,
    listener: ServerToClientEvents[E],
  ): void {
    this.socket.off(event, listener as never);
  }
}
