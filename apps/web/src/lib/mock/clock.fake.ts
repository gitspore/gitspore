import type { Clock } from "./clock";
type FakeClock = Clock & { advance(ms: number): void };

export function createFakeClock(start = 0): FakeClock {
  let current = start;
  let nextId = 0;
  let timers: { id: number; dueAt: number; fn: () => void }[] = [];

  return {
    now: () => current,
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timers.push({ id, dueAt: current + ms, fn });
      return id;
    },
    clearTimeout: (handle) => {
      timers = timers.filter((timer) => timer.id !== handle);
    },
    advance: (ms) => {
      const target = current + ms;

      // Search again on every pass: a callback may schedule a new timer
      // that is still due inside this advance.
      for (;;) {
        const next = timers.reduce<(typeof timers)[number] | undefined>(
          (earliest, timer) =>
            !earliest ||
            timer.dueAt < earliest.dueAt ||
            (timer.dueAt === earliest.dueAt && timer.id < earliest.id)
              ? timer
              : earliest,
          undefined,
        );
        if (!next || next.dueAt > target) break;

        current = next.dueAt;
        timers = timers.filter((timer) => timer.id !== next.id);
        next.fn();
      }
      current = target;
    },
  };
}
