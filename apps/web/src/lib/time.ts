import { useNow } from "./client/GreenhouseClientProvider";

// Seconds since `since` on the client's clock (useNow), so the mock plays it
// at speed and holds it while paused. null while inactive and before the
// first tick, so the server and the browser render the same markup.
export function useSecondsSince(since: string, active: boolean) {
  const now = useNow();
  if (!active || now === 0) return null;
  // A clock that is a little behind the daemon must not give negative times.
  return Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
}

// 72 -> "1:12"
export function formatSeconds(total: number) {
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}
