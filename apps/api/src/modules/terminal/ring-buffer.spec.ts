import { RingBuffer } from "./ring-buffer";

describe("RingBuffer", () => {
  it("returns every chunk in order while under the limit", () => {
    const buffer = new RingBuffer(10);

    buffer.push("abc");
    buffer.push("def");

    expect(buffer.contents()).toBe("abcdef");
  });

  it("drops the oldest chunk when the limit is exceeded", () => {
    const buffer = new RingBuffer(10);

    buffer.push("abcde");
    buffer.push("fghij");
    buffer.push("klmno");

    expect(buffer.contents()).toBe("fghijklmno");
  });

  it("keeps the last bytes of a chunk bigger than the limit", () => {
    const buffer = new RingBuffer(10);

    buffer.push("abcdefghijkl");

    expect(buffer.contents()).toBe("cdefghijkl");
  });

  it("does not split an umlaut at the cut", () => {
    const buffer = new RingBuffer(4);

    buffer.push("üabc");

    expect(buffer.contents()).toBe("abc");
  });

  it("does not split an emoji at the cut", () => {
    const buffer = new RingBuffer(5);

    buffer.push("🐛abc");

    expect(buffer.contents()).toBe("abc");
  });
});
