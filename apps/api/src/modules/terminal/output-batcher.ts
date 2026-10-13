const FLUSH_INTERVAL_MS = 16;
const MAX_BATCH_BYTES = 16 * 1024;

export class OutputBatcher {
  private pending: string[] = [];
  private pendingBytes = 0;
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly onFlush: (chunk: string) => void) {}

  push(chunk: string): void {
    this.pending.push(chunk);
    this.pendingBytes += Buffer.byteLength(chunk);
    if (this.pendingBytes >= MAX_BATCH_BYTES) {
      this.flush();
      return;
    }
    if (this.timer === undefined) {
      this.timer = setTimeout(() => this.flush(), FLUSH_INTERVAL_MS);
    }
  }

  flush(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.pending.length === 0) {
      return;
    }
    const chunk = this.pending.join("");
    this.pending = [];
    this.pendingBytes = 0;
    this.onFlush(chunk);
  }
}
