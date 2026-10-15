import { createTicker } from "./ticker";

describe("createTicker", () => {
  let time: number;
  const now = () => time;

  beforeEach(() => {
    jest.useFakeTimers();
    time = 1_000;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("starts with the current time", () => {
    expect(createTicker(now).get()).toBe(1_000);
  });

  it("keeps the same time between ticks", () => {
    const ticker = createTicker(now);
    ticker.subscribe(() => {});

    time = 1_500;

    expect(ticker.get()).toBe(1_000);
  });

  it("reads the clock and notifies on every tick", () => {
    const ticker = createTicker(now, 1_000);
    const listener = jest.fn();
    ticker.subscribe(listener);

    time = 2_000;
    jest.advanceTimersByTime(1_000);

    expect(ticker.get()).toBe(2_000);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("runs a single interval for all listeners", () => {
    const ticker = createTicker(now);
    ticker.subscribe(() => {});
    ticker.subscribe(() => {});

    expect(jest.getTimerCount()).toBe(1);
  });

  it("stops the interval when the last listener leaves", () => {
    const ticker = createTicker(now);
    const stopA = ticker.subscribe(() => {});
    const stopB = ticker.subscribe(() => {});

    stopA();
    expect(jest.getTimerCount()).toBe(1);
    stopB();
    expect(jest.getTimerCount()).toBe(0);
  });

  it("catches up with the clock when someone starts listening again", () => {
    const ticker = createTicker(now);
    ticker.subscribe(() => {})();

    time = 9_000;
    ticker.subscribe(() => {});

    expect(ticker.get()).toBe(9_000);
  });
});
