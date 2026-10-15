// "1 waiting" in the top bar.
// The dot should blink; it waits for the motion tokens (#36).
export function WaitBadge({ count }: { count: number }) {
  // Hidden when nothing waits
  if (count === 0) return null;

  return (
    <span className="flex items-center gap-2 rounded-sm bg-wait px-3 py-1 text-wait-ink">
      <span aria-hidden className="size-2 bg-wait-ink" />
      <span className="text-ui-badge uppercase">{count} waiting</span>
    </span>
  );
}
