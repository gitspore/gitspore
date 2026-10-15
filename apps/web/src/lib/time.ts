import { useEffect, useState } from "react";

// Seconds since `since`, counting up every second. null until the first tick,
// so the server and the browser render the same markup.
export function useSecondsSince(since: string, active: boolean) {
  const [seconds, setSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (!active) return;
    const tick = () =>
      setSeconds(Math.floor((Date.now() - Date.parse(since)) / 1000));
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [since, active]);

  return active ? seconds : null;
}

// 72 -> "1:12"
export function formatSeconds(total: number) {
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}
