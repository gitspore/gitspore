import type { ConnectionStatus } from "./GreenhouseClient";

export class ConnectionStatusSource {
  private listeners = new Set<() => void>();
  constructor(private connectionStatus: ConnectionStatus) {}

  get() {
    return this.connectionStatus;
  }

  set(next: ConnectionStatus) {
    if (
      this.connectionStatus.kind === next.kind &&
      this.connectionStatus.reason === next.reason
    )
      return;
    this.connectionStatus = next;
    for (const listener of this.listeners) listener();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
