const DEFAULT_LIMIT_BYTES = 256 * 1024;

// In UTF-8, a byte that starts with the bits 10 is the middle or end of a
// multi-byte character (ü takes 2 bytes, 🐛 takes 4). The mask keeps only
// the first two bits, so the comparison checks for exactly that pattern.
const isContinuationByte = (byte: number) =>
  (byte & 0b1100_0000) === 0b1000_0000;

// Removes at least `bytes` bytes from the front. If the cut lands inside a
// character, it moves forward to the next one, so the rest is valid UTF-8.
function dropFront(text: string, bytes: number): string {
  const encoded = Buffer.from(text);
  //start is here a position showing the index of the first
  // byte we keep in the byte array
  let start = bytes;
  while (start < encoded.length && isContinuationByte(encoded[start])) {
    start++;
  }
  return encoded.subarray(start).toString();
}

// Keeps the newest terminal output up to a limit in UTF-8 bytes, so a viewer
// who attaches late still gets the recent scrollback.
export class RingBuffer {
  private chunks: string[] = [];
  private size = 0;

  constructor(private readonly limitBytes = DEFAULT_LIMIT_BYTES) {}

  push(chunk: string): void {
    this.chunks.push(chunk);
    this.size += Buffer.byteLength(chunk);
    while (this.size > this.limitBytes) {
      const oldest = this.chunks[0];
      const oldestBytes = Buffer.byteLength(oldest);
      const excess = this.size - this.limitBytes;
      // Drop the oldest chunk if it fits in the excess, else cut its front.
      if (oldestBytes <= excess) {
        this.chunks.shift();
        this.size -= oldestBytes;
      } else {
        const rest = dropFront(oldest, excess);
        this.chunks[0] = rest;
        // Not just `excess`: the cut may take more to keep characters whole.
        this.size -= oldestBytes - Buffer.byteLength(rest);
      }
    }
  }

  contents(): string {
    return this.chunks.join("");
  }
}
