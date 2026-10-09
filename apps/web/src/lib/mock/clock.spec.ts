import { createFakeClock } from "./clock.fake";

describe("fake clock", () => {
  it("fires a timer exactly once when it becomes due", () => {
    const clock = createFakeClock();
    const fn = jest.fn();
    clock.setTimeout(fn, 100);

    clock.advance(99);
    expect(fn).not.toHaveBeenCalled();

    clock.advance(1);
    expect(fn).toHaveBeenCalledTimes(1);

    clock.advance(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("fires timers with the same due time in scheduling order", () => {
    const clock = createFakeClock();
    const order: string[] = [];
    clock.setTimeout(() => order.push("a"), 100);
    clock.setTimeout(() => order.push("b"), 100);

    clock.advance(100);

    expect(order).toEqual(["a", "b"]);
  });

  it("fires timers scheduled by a callback within the same advance", () => {
    const clock = createFakeClock();
    const seen: string[] = [];
    clock.setTimeout(() => {
      seen.push(`first@${clock.now()}`);
      clock.setTimeout(() => seen.push(`second@${clock.now()}`), 50);
    }, 100);

    clock.advance(200);

    expect(seen).toEqual(["first@100", "second@150"]);
  });

  it("does not fire a cleared timer", () => {
    const clock = createFakeClock();
    const fn = jest.fn();
    const handle = clock.setTimeout(fn, 100);

    clock.clearTimeout(handle);
    clock.advance(200);

    expect(fn).not.toHaveBeenCalled();
  });

  it("ends at start + advanced time, even after the last timer", () => {
    const clock = createFakeClock(1000);
    clock.setTimeout(() => {}, 100);

    clock.advance(250);

    expect(clock.now()).toBe(1250);
  });
});
