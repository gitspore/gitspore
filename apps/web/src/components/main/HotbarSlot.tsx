"use client";

import type { Agent } from "@gitspore/shared";
import { STATUS_COLOUR, STATUS_ICON, STATUS_WORD } from "@/lib/status";
import { formatSeconds, useSecondsSince } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Beetle } from "../shell/Logo";

// One slot of the hotbar (components.md, hotbar-slot): 1–6 the pots, 0 the overview.

type HotbarSlotProps = {
  // The number on the slot and its key
  hotkey: number;
  // No agent: an empty pot
  agent: Agent | undefined;
  issueTitle?: string;
  // Its window is the focused one
  selected: boolean;
  // Its window is open but minimised
  minimised: boolean;
  // Shift-click opens the window beside the others
  onPress: (beside: boolean) => void;
};

export function HotbarSlot({
  hotkey,
  agent,
  issueTitle,
  selected,
  minimised,
  onPress,
}: HotbarSlotProps) {
  const overview = hotkey === 0;
  const waiting = agent?.status === "needs_input";
  const seconds = useSecondsSince(agent?.statusSince ?? "", waiting);

  const label = overview
    ? "Overview agent"
    : agent
      ? `Pot ${hotkey}: #${agent.issueNumber} ${issueTitle ?? ""}, ${STATUS_WORD[agent.status]}`
      : `Pot ${hotkey}, empty`;
  const Icon = agent && !overview ? STATUS_ICON[agent.status] : null;

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={(e) => onPress(e.shiftKey)}
      className={cn(
        "hotbar-slot relative grid shrink-0 place-items-center rounded-xl",
        waiting
          ? "bg-wait text-wait-ink hover:bg-[color-mix(in_srgb,var(--color-wait)_80%,var(--color-panel))] motion-safe:animate-bob"
          : "bg-panel-2 text-ink hover:bg-[color-mix(in_srgb,var(--color-panel-2)_80%,var(--color-panel))]",
        // color.accent is shadcn's primary
        selected &&
          "outline-(length:--border-selected) outline-offset-2 outline-primary",
      )}
    >
      <span className="absolute top-1 left-1.5 font-mono text-mono-key">
        {hotkey}
      </span>

      {/* A minimised window is a mark at the top of its slot */}
      {minimised && (
        <span className="absolute top-1 left-1/2 h-1 w-4 -translate-x-1/2 rounded-xs bg-current opacity-50" />
      )}

      {overview ? (
        <Beetle className="size-8" />
      ) : agent ? (
        // Agent colour circle; the plant goes inside later
        <span
          className="size-11 rounded-full opacity-35"
          style={{ backgroundColor: `var(--color-agent-${hotkey})` }}
        />
      ) : (
        <span className="size-9 rounded-full border-2 border-dashed border-current opacity-50" />
      )}

      {/* Marker: the status shape, top right */}
      {Icon && agent && (
        <Icon
          aria-hidden
          className={cn(
            "absolute top-1 right-1 size-3 fill-current",
            waiting ? "text-wait-ink" : STATUS_COLOUR[agent.status],
          )}
        />
      )}

      {waiting && seconds !== null && (
        <span className="absolute right-1 bottom-1.5 rounded-xs bg-wait-ink px-1 font-mono text-mono-key text-wait">
          {formatSeconds(seconds)}
        </span>
      )}

      {/* Agent colour band at the bottom */}
      {agent && !overview && (
        <span
          className="absolute inset-x-2.5 bottom-0 h-1 rounded-t-xs"
          style={{ backgroundColor: `var(--color-agent-${hotkey})` }}
        />
      )}
    </button>
  );
}
