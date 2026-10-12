"use client";

import { useState } from "react";
import { MAX_SLOTS } from "@gitspore/shared";
import { mockAgents, mockIssues } from "@/lib/mock";
import AgentRow, { FreeSlotRow } from "./AgentRow";

// The side panel, Agents tab: one row per slot, always in slot order.
export default function SidePanel() {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: MAX_SLOTS }, (_, slotIndex) => {
        const agent = mockAgents.find((a) => a.slotIndex === slotIndex);
        if (!agent) return <FreeSlotRow key={slotIndex} slot={slotIndex + 1} />;

        return (
          <AgentRow
            key={agent.id}
            agent={agent}
            issueTitle={
              mockIssues.find((i) => i.number === agent.issueNumber)?.title ??
              ""
            }
            selected={selectedSlot === slotIndex}
            onSelect={() => setSelectedSlot(slotIndex)}
          />
        );
      })}
    </div>
  );
}
