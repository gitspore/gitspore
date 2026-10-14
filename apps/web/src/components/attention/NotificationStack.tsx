"use client";

import { useState } from "react";
import type { Agent } from "@gitspore/shared";
import Notification from "./Notification";

// Bottom-right cards for waiting agents. A card stays while
// its agent waits, so the list follows from `agents` instead of being pushed
// like a toast. A dismissed card comes back the next time the agent waits.

type NotificationStackProps = {
  agents: Agent[];
  onOpen: (agent: Agent) => void;
  onOpenBeside: (agent: Agent) => void;
};

// One wait = one agent + the moment it started waiting
const waitKey = (agent: Agent) => `${agent.id}:${agent.statusSince}`;

export default function NotificationStack({
  agents,
  onOpen,
  onOpenBeside,
}: NotificationStackProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const waiting = agents.filter(
    (a) => a.status === "needs_input" && !dismissed.has(waitKey(a)),
  );

  return (
    // polite: a screen reader reads a new card without moving the focus
    <div aria-live="polite" className="flex w-88 max-w-full flex-col gap-2">
      {waiting.map((agent) => (
        <Notification
          key={waitKey(agent)}
          agent={agent}
          onOpen={() => onOpen(agent)}
          onOpenBeside={() => onOpenBeside(agent)}
          onDismiss={() =>
            setDismissed((d) => new Set(d).add(waitKey(agent)))
          }
        />
      ))}
    </div>
  );
}
