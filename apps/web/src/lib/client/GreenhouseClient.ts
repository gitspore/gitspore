import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from "@gitspore/shared";

export type ConnectionStatus =
  | { kind: "connected"; reason?: never }
  | { kind: "reconnecting"; reason?: never }
  | { kind: "offline"; reason: string };

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
  /**
   * "Now" in milliseconds since the epoch, in the same timeline as
   * statusSince and startedAt. Derive waiting times from it
   * (`now() - Date.parse(statusSince)`), not from Date.now(): in the mock it
   * follows the playback speed and stands still while paused.
   */
  now(): number;

  /**
   * The current connection status. Returns the same object until the status
   * changes, so it can be used as a snapshot for useSyncExternalStore.
   */
  getStatus(): ConnectionStatus;

  /**
   * Calls `listener` whenever the status changes, never for the same status
   * twice. Read the new status with getStatus(). Returns a function that
   * removes the listener.
   */
  subscribeStatus(listener: () => void): () => void;
}
