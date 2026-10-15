import { cn } from "@/lib/utils";

// Connection to the daemon. Spec: "Connection status" under States in
// design-docs/design/components.md.

export type Connection = "online" | "reconnecting" | "offline";

const LOOK: Record<Connection, { dot: string; word: string; text: string }> = {
  online: {
    dot: "bg-status-working",
    word: "online",
    text: "text-muted-foreground",
  },
  // The dot should blink; it waits for the motion tokens (#36)
  reconnecting: {
    dot: "bg-muted-foreground",
    word: "reconnecting…",
    text: "text-muted-foreground",
  },
  offline: { dot: "bg-wait", word: "offline", text: "text-wait" },
};

export function ConnectionStatus({ status }: { status: Connection }) {
  const look = LOOK[status];

  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className={cn("size-2 rounded-full", look.dot)} />
      <span className={cn("text-ui-meta", look.text)}>{look.word}</span>
    </span>
  );
}
