"use client";

import type { Agent } from "@gitspore/shared";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatSeconds, useSecondsSince } from "@/lib/time";

// One waiting agent, bottom right.
// It never takes keyboard focus; the buttons are reachable with Tab.

type NotificationProps = {
  agent: Agent;
  onOpen: () => void;
  onOpenBeside: () => void;
  onDismiss: () => void;
};

export default function Notification({
  agent,
  onOpen,
  onOpenBeside,
  onDismiss,
}: NotificationProps) {
  const seconds = useSecondsSince(agent.statusSince, true);
  const pot = (agent.slotIndex ?? 0) + 1;

  return (
    <div className="relative rounded-xl bg-wait p-4 text-wait-ink shadow-lg motion-safe:animate-nudge">
      <h3 className="pr-8 font-title text-title-notification">
        #{agent.issueNumber} needs you
      </h3>
      <p className="mt-0.5 mb-3 text-ui-body">
        Waiting{seconds !== null && ` for ${formatSeconds(seconds)}`} · pot{" "}
        {pot}
      </p>

      <button
        type="button"
        onClick={onDismiss}
        aria-label={`Dismiss #${agent.issueNumber}`}
        className="absolute top-2 right-2 grid size-8 place-items-center rounded-lg hover:bg-[color-mix(in_srgb,var(--color-wait-ink)_20%,transparent)]"
      >
        <X className="size-5" />
      </button>

      <div className="flex gap-2">
        <Button
          variant="primary-on-wait"
          className="h-10 px-4"
          onClick={onOpenBeside}
        >
          Open beside
        </Button>
        <Button variant="on-wait" className="h-10 px-4" onClick={onOpen}>
          Open
        </Button>
      </div>
    </div>
  );
}
