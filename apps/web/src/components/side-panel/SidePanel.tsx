"use client";

import { useState } from "react";
import { MAX_SLOTS } from "@gitspore/shared";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SidePanelTab } from "@/lib/layout";
import { mockAgents, mockIssues } from "@/lib/mock";
import AgentRow, { FreeSlotRow } from "./AgentRow";

// The side panel: title, counts, tabs. Spec: `side-panel` and `segmented-tabs`.

const TABS: { value: SidePanelTab; label: string }[] = [
  { value: "agents", label: "Agents" },
  { value: "issues", label: "Issues" },
  { value: "branches", label: "Branches" },
];

type SidePanelProps = {
  tab: SidePanelTab;
  onTabChange: (tab: SidePanelTab) => void;
  onClose: () => void;
};

export default function SidePanel({
  tab,
  onTabChange,
  onClose,
}: SidePanelProps) {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);

  const planted = mockAgents.filter((a) => a.slotIndex !== null).length;
  const waiting = mockAgents.filter((a) => a.status === "needs_input").length;

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-start justify-between px-2 pt-1">
        <div>
          <h2 className="font-title text-title-panel">Your pots</h2>
          <p className="text-ui-meta text-muted-foreground">
            {planted} of {MAX_SLOTS} planted
            {/* Summary from #18: hidden when nobody waits */}
            {waiting > 0 && (
              <span className="font-semibold text-status-waiting">
                {" "}
                · {waiting} {waiting === 1 ? "needs" : "need"} you
              </span>
            )}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close panel"
          onClick={onClose}
        >
          <X />
        </Button>
      </header>

      <Tabs
        value={tab}
        onValueChange={(value) => onTabChange(value as SidePanelTab)}
      >
        <TabsList className="h-11 w-full rounded-lg bg-panel-2 p-1">
          {TABS.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="h-9 rounded-sm text-ui-row text-ink data-active:bg-plate data-active:text-plate-ink dark:data-active:border-transparent dark:data-active:bg-plate dark:data-active:text-plate-ink"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="agents" className="flex flex-col gap-1">
          {Array.from({ length: MAX_SLOTS }, (_, slotIndex) => {
            const agent = mockAgents.find((a) => a.slotIndex === slotIndex);
            if (!agent)
              return <FreeSlotRow key={slotIndex} slot={slotIndex + 1} />;

            return (
              <AgentRow
                key={agent.id}
                agent={agent}
                issueTitle={
                  mockIssues.find((i) => i.number === agent.issueNumber)
                    ?.title ?? ""
                }
                selected={selectedSlot === slotIndex}
                onSelect={() => setSelectedSlot(slotIndex)}
              />
            );
          })}
        </TabsContent>

        <TabsContent value="issues" className="px-2 text-muted-foreground">
          Issues come next.
        </TabsContent>

        <TabsContent value="branches" className="px-2 text-muted-foreground">
          Branches later (should-have).
        </TabsContent>
      </Tabs>
    </div>
  );
}
