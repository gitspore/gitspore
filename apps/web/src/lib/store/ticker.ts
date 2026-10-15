export type Ticker = {
  /** The time of the last tick. The same number until the next one. */
  get(): number;
  /** Calls `listener` on every tick. Returns a function that stops it. */
  subscribe(listener: () => void): () => void;
};

/**
 * One clock for the whole app: all waiting times and wilting stages read the
 * same tick, so plants never disagree and there is a single interval instead
 * of one per plant. Made for useSyncExternalStore.
 *
 * The interval only runs while someone listens. `now` is the client's clock
 * (client.now()), which in the mock follows the playback speed.
 */
export function createTicker(now: () => number, intervalMs = 1000): Ticker {
  let current = now();
  let timer: ReturnType<typeof setInterval> | undefined;
  const listeners = new Set<() => void>();

  function tick() {
    current = now();
    listeners.forEach((listener) => listener());
  }

  return {
    get: () => current,
    subscribe(listener) {
      if (listeners.size === 0) {
        // The time stood still while nobody listened. Catch up, React reads
        // get() again right after subscribing.
        current = now();
        timer = setInterval(tick, intervalMs);
      }
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) clearInterval(timer);
      };
    },
  };
}
