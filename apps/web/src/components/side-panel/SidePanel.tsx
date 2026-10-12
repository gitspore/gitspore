"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { MAX_SLOTS, type Agent } from "@gitspore/shared";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SidePanelTab } from "@/lib/layout";
import ConfirmDialog from "@/components/attention/ConfirmDialog";
import { mockDirtyWorktrees, mockIssues } from "@/lib/mock";
import AgentRow, { FreeSlotRow } from "./AgentRow";
import IssueRow from "./IssueRow";

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
  // Shared with the top bar, so they live in AppShell. Move to the store with #8.
  agents: Agent[];
  setAgents: Dispatch<SetStateAction<Agent[]>>;
  selectedSlot: number | null;
  setSelectedSlot: (slot: number | null) => void;
};

export default function SidePanel({
  tab,
  onTabChange,
  onClose,
  agents,
  setAgents,
  selectedSlot,
  setSelectedSlot,
}: SidePanelProps) {
  // The agent the stop dialog asks about; null while the dialog is closed
  const [stopping, setStopping] = useState<Agent | null>(null);
  const [removeWorktree, setRemoveWorktree] = useState(false);
  const [stopError, setStopError] = useState<string>();

  const planted = agents.filter((a) => a.slotIndex !== null).length;
  const waiting = agents.filter((a) => a.status === "needs_input").length;

  const freeSlot = Array.from({ length: MAX_SLOTS }, (_, i) => i).find(
    (i) => !agents.some((a) => a.slotIndex === i),
  );
  // Open issues without a running agent
  const unplanted = mockIssues.filter(
    (issue) => !agents.some((a) => a.issueNumber === issue.number),
  );

  // Later this sends `agent:dispatch { issueNumber, slotIndex }` to the daemon
  function plant(issueNumber: number) {
    if (freeSlot === undefined) return;
    const now = new Date().toISOString();
    setAgents((list) => [
      ...list,
      {
        id: `agent-${freeSlot}-${issueNumber}`,
        slotIndex: freeSlot,
        issueNumber,
        branch: `spore/${issueNumber}`,
        worktreePath: `/tmp/gitspore/${issueNumber}`,
        status: "starting",
        statusSince: now,
        startedAt: now,
      },
    ]);
  }

  function openStop(agent: Agent) {
    setStopping(agent);
    setRemoveWorktree(false);
    setStopError(undefined);
  }

  // Later this sends `agent:stop { agentId, removeWorktree }` to the daemon
  function stop() {
    if (!stopping) return;
    if (removeWorktree && mockDirtyWorktrees.has(stopping.branch)) {
      // WORKTREE_DIRTY: the daemon keeps the agent
      setStopError(
        `${stopping.branch} has uncommitted changes, so the worktree can't be removed. The agent keeps running.`,
      );
      return;
    }
    setAgents((list) => list.filter((a) => a.id !== stopping.id));
    if (selectedSlot === stopping.slotIndex) setSelectedSlot(null);
    setStopping(null);
  }

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
              // (components.md, States → Hover). dark: classes override shadcn's night styles.
              className="h-9 rounded-sm text-ink hover:not-data-active:bg-ink/20 dark:text-ink data-active:bg-plate data-active:text-plate-ink data-active:hover:text-plate-ink dark:data-active:border-transparent dark:data-active:bg-plate dark:data-active:text-plate-ink dark:data-active:hover:text-plate-ink"
            >
              {/* On the span, because cn() drops text-ui-* next to a text colour */}
              <span className="text-ui-tab">{t.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="agents" className="flex flex-col gap-1">
          {Array.from({ length: MAX_SLOTS }, (_, slotIndex) => {
            const agent = agents.find((a) => a.slotIndex === slotIndex);
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
                onStop={() => openStop(agent)}
              />
            );
          })}
        </TabsContent>

        <TabsContent value="issues" className="flex flex-col gap-1">
          {unplanted.length === 0 ? (
            <p className="px-2 text-ui-meta text-muted-foreground">
              No open issues without an agent.
            </p>
          ) : (
            unplanted.map((issue) => (
              <IssueRow
                key={issue.number}
                issue={issue}
                canPlant={freeSlot !== undefined}
                onPlant={() => plant(issue.number)}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="branches" className="px-2 text-muted-foreground">
          Branches later (should-have).
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={stopping !== null}
        onOpenChange={(open) => !open && setStopping(null)}
        title={`Stop the agent on #${stopping?.issueNumber}?`}
        description="Claude Code stops and the pot is free again. The branch stays."
        actionLabel="Stop agent"
        onConfirm={stop}
        error={stopError}
      >
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={removeWorktree}
            onChange={(e) => {
              setRemoveWorktree(e.target.checked);
              setStopError(undefined);
            }}
            className="size-4 accent-plate"
          />
          <span className="text-ui-body">Also remove worktree</span>
        </label>
      </ConfirmDialog>
    </div>
  );
}
