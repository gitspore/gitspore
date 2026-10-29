"use client";

import { useState } from "react";
import type { Agent } from "@gitspore/shared";
import { useGreenhouseStore } from "@/lib/client/GreenhouseClientProvider";
import { selectAgents } from "@/lib/store/selectors";
import { Notification } from "./Notification";

// Bottom-right cards for waiting agents. A card stays while
// its agent waits, so the list follows from the store's agents instead of
// being pushed like a toast. A dismissed card comes back the next time the
// agent waits.

// One wait = one agent + the moment it started waiting
const waitKey = (agent: Agent) => `${agent.id}:${agent.statusSince}`;

export function NotificationStack() {
  const agents = useGreenhouseStore(selectAgents);
  const selectSlot = useGreenhouseStore((s) => s.selectSlot);
  const openWindow = useGreenhouseStore((s) => s.openWindow);
  // Local: which waits the user has dismissed
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const waiting = agents.filter(
    (a) => a.status === "needs_input" && !dismissed.has(waitKey(a)),
  );

  // Open: this agent's window alone, the others minimised.
  // Beside: this window next to the ones already visible.
  function open(agent: Agent, beside: boolean) {
    selectSlot(agent.slotIndex);
    openWindow(agent.id, { alone: !beside });
  }

  return (
    // polite: a screen reader reads a new card without moving the focus
    <div aria-live="polite" className="flex w-88 max-w-full flex-col gap-2">
      {waiting.map((agent) => (
        <Notification
          key={waitKey(agent)}
          agent={agent}
          onOpen={(shift) => open(agent, shift)}
          onOpenBeside={() => open(agent, true)}
          onDismiss={() => setDismissed((d) => new Set(d).add(waitKey(agent)))}
        />
      ))}
    </div>
  );
}
