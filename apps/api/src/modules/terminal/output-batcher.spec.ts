import { OutputBatcher } from "./output-batcher";

describe("OutputBatcher", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("sends two quick chunks as one after 16 ms", () => {
    const onFlush = jest.fn();
    const batcher = new OutputBatcher(onFlush);

    batcher.push("ab");
    batcher.push("cd");
    jest.advanceTimersByTime(15);
    expect(onFlush).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith("abcd");
  });

  it("sends right away once 16 KB are pending", () => {
    const onFlush = jest.fn();
    const batcher = new OutputBatcher(onFlush);
    const half = "x".repeat(8 * 1024);

    batcher.push(half);
    expect(onFlush).not.toHaveBeenCalled();

    batcher.push(half);
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith(half + half);

    jest.advanceTimersByTime(16);
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it("sends what is pending when flushed by hand, and not again later", () => {
    const onFlush = jest.fn();
    const batcher = new OutputBatcher(onFlush);

    batcher.push("bye");
    batcher.flush();
    expect(onFlush).toHaveBeenCalledWith("bye");

    jest.advanceTimersByTime(16);
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it("sends nothing when flushed with nothing pending", () => {
    const onFlush = jest.fn();
    const batcher = new OutputBatcher(onFlush);

    batcher.flush();

    expect(onFlush).not.toHaveBeenCalled();
  });
});
