"use client";

import { useEffect, useState } from "react";
import type { Agent, AgentStatus } from "@gitspore/shared";
import { Circle, Diamond, Flower, Triangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_WORD: Record<AgentStatus, string> = {
  starting: "starting",
  working: "growing",
  needs_input: "waiting",
  error: "wilted",
  done: "review",
  merged: "merged",
};

// Status is never shown by colour alone: every status also has a shape
const STATUS_ICON: Record<AgentStatus, typeof Circle> = {
  starting: Circle,
  working: Circle,
  needs_input: Triangle,
  error: X,
  done: Diamond,
  merged: Flower,
};

const STATUS_COLOUR: Record<AgentStatus, string> = {
  starting: "text-muted-foreground",
  working: "text-status-working",
  needs_input: "text-status-waiting",
  error: "text-status-error",
  done: "text-status-review",
  merged: "text-status-merged",
};

// Seconds since `since`, counting up every second. null until the first tick,
// so the server and the browser render the same markup.
function useSecondsSince(since: string, active: boolean) {
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
function formatSeconds(total: number) {
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

type AgentRowProps = {
  agent: Agent;
  issueTitle: string;
  selected: boolean;
  onSelect: () => void;
};

export default function AgentRow({
  agent,
  issueTitle,
  selected,
  onSelect,
}: AgentRowProps) {
  const slot = (agent.slotIndex ?? 0) + 1;
  const waiting = agent.status === "needs_input";
  const seconds = useSecondsSince(agent.statusSince, waiting);
  // Same stages as the wilting plant: emphasized from 15 s, stronger from 60 s
  const waitStage =
    seconds === null ? 0 : seconds >= 60 ? 2 : seconds >= 15 ? 1 : 0;

  const Icon = STATUS_ICON[agent.status];
  const word =
    waiting && seconds !== null
      ? `waiting ${formatSeconds(seconds)}`
      : STATUS_WORD[agent.status];

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex h-row w-full items-center gap-3 rounded-lg pr-3 pl-2 text-left",
        waitStage >= 1 && "bg-wait text-wait-ink",
        waitStage === 2 && "h-row-wait rounded-xl",
        selected && "outline-2 outline-line",
      )}
    >
      <span className="w-3 font-mono text-ui-meta">{slot}</span>

      {/* Agent colour circle; the plant goes inside later */}
      <span
        className="size-9 shrink-0 rounded-full opacity-35"
        style={{ backgroundColor: `var(--color-agent-${slot})` }}
      />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-ui-row font-semibold">
          #{agent.issueNumber} {issueTitle}
        </span>
        <span className="flex items-center gap-1 text-ui-meta">
          <Icon
            aria-hidden
            className={cn(
              "size-3 shrink-0 fill-current",
              waitStage >= 1 ? "text-wait-ink" : STATUS_COLOUR[agent.status],
            )}
          />
          <span className={cn(waitStage === 0 && STATUS_COLOUR[agent.status])}>
            {word}
          </span>
          <span
            className={cn(
              "truncate",
              waitStage === 0 && "text-muted-foreground",
            )}
          >
            · {agent.branch}
          </span>
        </span>
      </span>
    </button>
  );
}

export function FreeSlotRow({ slot }: { slot: number }) {
  return (
    <div className="flex h-row items-center gap-3 rounded-lg pr-3 pl-2 text-muted-foreground">
      <span className="w-3 font-mono text-ui-meta">{slot}</span>
      <span className="size-9 shrink-0 rounded-full border-2 border-dashed border-current" />
      <span className="text-ui-row">Free slot</span>
    </div>
  );
}
