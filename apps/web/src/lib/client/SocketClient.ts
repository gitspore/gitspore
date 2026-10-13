import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@gitspore/shared";
import type { ConnectionStatus, GreenhouseClient } from "./GreenhouseClient";
import { ConnectionStatusSource } from "./ConnectionStatusSource";

export const TOKEN_MISSING =
  "Session token missing – open GitSpore from the daemon";
export const TOKEN_REJECTED =
  "Session token invalid – reopen GitSpore from the daemon";

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
  private readonly statusSource: ConnectionStatusSource;

  /**
   * @param url Where the daemon listens, e.g. http://localhost:3001.
   * @param token The session token the daemon printed on start. It goes into
   *   the Socket.io handshake `auth`, the daemon rejects the connection
   *   without it. Null if the page was opened without one: the client then
   *   stays offline with a message and connect() does nothing, instead of
   *   knocking on the daemon with a handshake that is sure to fail.
   */
  constructor(
    url: string,
    private readonly token: string | null,
  ) {
    this.statusSource = new ConnectionStatusSource({
      kind: "offline",
      reason: token === null ? TOKEN_MISSING : "Not connected yet",
    });
    this.socket = io(url, { autoConnect: false, auth: { token } });
    this.socket.on("connect", () => {
      this.statusSource.set({ kind: "connected" });
    });
    this.socket.on("disconnect", () => {
      this.statusSource.set(
        this.socket.active
          ? { kind: "reconnecting" }
          : { kind: "offline", reason: "Disconnected" },
      );
    });
    this.socket.io.on("reconnect_attempt", () => {
      this.statusSource.set({ kind: "reconnecting" });
    });
    this.socket.on("connect_error", () => {
      this.statusSource.set(
        this.socket.active
          ? { kind: "reconnecting" }
          : { kind: "offline", reason: TOKEN_REJECTED },
      );
    });
  }

  connect(): void {
    if (this.token === null) return;
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

  now(): number {
    return Date.now();
  }

  getStatus(): ConnectionStatus {
    return this.statusSource.get();
  }

  subscribeStatus(listener: () => void): () => void {
    return this.statusSource.subscribe(listener);
  }
}
