"use client";

import type { Agent } from "@gitspore/shared";
import { Ellipsis } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STATUS_COLOUR, STATUS_ICON, STATUS_WORD } from "@/lib/status";
import { formatSeconds, useSecondsSince } from "@/lib/time";
import { cn } from "@/lib/utils";

type AgentRowProps = {
  agent: Agent;
  issueTitle: string;
  selected: boolean;
  onSelect: () => void;
  onStop: () => void;
};

export function AgentRow({
  agent,
  issueTitle,
  selected,
  onSelect,
  onStop,
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
    // Two buttons side by side (a button can't hold another): select and the ⋯ menu
    <div
      className={cn(
        "group flex h-row w-full items-center gap-1 rounded-lg pr-1 pl-2 odd:bg-hover",
        waitStage >= 1 && "bg-wait text-wait-ink",
        waitStage === 2 && "h-row-wait rounded-xl",
        selected && "outline-2 outline-line",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="flex h-full min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="w-3 font-mono text-ui-meta">
          <span className="sr-only">Pot </span>
          {slot}
        </span>

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
            <span
              className={cn(waitStage === 0 && STATUS_COLOUR[agent.status])}
            >
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

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Actions for #${agent.issueNumber}`}
          className="grid size-8 shrink-0 place-items-center rounded-lg opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-current/20 data-popup-open:opacity-100"
        >
          <Ellipsis className="size-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onStop}>Stop agent</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function FreeSlotRow({ slot }: { slot: number }) {
  return (
    <div className="flex h-row items-center gap-3 rounded-lg pr-3 pl-2 text-muted-foreground odd:bg-hover">
      <span className="w-3 font-mono text-ui-meta">
        <span className="sr-only">Pot </span>
        {slot}
      </span>
      <span className="size-9 shrink-0 rounded-full border-2 border-dashed border-current" />
      <span className="text-ui-row">Free slot</span>
    </div>
  );
}
