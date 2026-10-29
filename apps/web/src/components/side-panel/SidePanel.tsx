"use client";

import { useState } from "react";
import { MAX_SLOTS, type Agent, type AgentId } from "@gitspore/shared";
import { X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SidePanelTab } from "@/lib/layout";
import { ConfirmDialog } from "@/components/attention/ConfirmDialog";
import { useGreenhouseStore } from "@/lib/client/GreenhouseClientProvider";
import {
  freeSlots,
  needsInputCount,
  openIssuesWithoutAgent,
  selectAgents,
  selectIssues,
  selectRepoTokens,
} from "@/lib/store/selectors";
import { UsageTip } from "@/components/shell/UsageTip";
import { agentTokens, formatTokens, repoTip } from "@/lib/usageTip";
import { AgentRow, FreeSlotRow } from "./AgentRow";
import { BranchesTab } from "./BranchesTab";
import { IssueRow } from "./IssueRow";
import { stopErrorText } from "./stopErrorText";

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

export function SidePanel({ tab, onTabChange, onClose }: SidePanelProps) {
  const agents = useGreenhouseStore(selectAgents);
  const issues = useGreenhouseStore(selectIssues);
  const waiting = useGreenhouseStore(needsInputCount);
  const selectedSlot = useGreenhouseStore((s) => s.selectedSlot);
  const selectSlot = useGreenhouseStore((s) => s.selectSlot);
  const openWindow = useGreenhouseStore((s) => s.openWindow);
  const slots = useGreenhouseStore(useShallow(freeSlots));
  // Open issues without a running agent
  const unplanted = useGreenhouseStore(useShallow(openIssuesWithoutAgent));
  const lastError = useGreenhouseStore((s) => s.lastError);
  const setError = useGreenhouseStore((s) => s.setError);
  const dispatchAgent = useGreenhouseStore((s) => s.dispatchAgent);
  const stopAgent = useGreenhouseStore((s) => s.stopAgent);

  // The agent the stop dialog asks about; null while the dialog is closed
  const [stopping, setStopping] = useState<Agent | null>(null);
  const [removeWorktree, setRemoveWorktree] = useState(false);
  // True once Stop was sent: the dialog waits for the agent:remove patch
  const [stopSent, setStopSent] = useState(false);

  const repoTokens = useGreenhouseStore(selectRepoTokens);

  const planted = agents.filter((a) => a.slotIndex !== null).length;
  const active = agents.filter(
    (a) => a.slotIndex !== null && a.status !== "merged",
  ).length;
  const freeSlot = slots[0];

  // The agent is gone: the stop went through, the dialog closes.
  // Set during render, so the dialog never shows a removed agent.
  if (stopping && stopSent && !agents.some((a) => a.id === stopping.id)) {
    setStopping(null);
    setStopSent(false);
  }
  // A refusal arrives later as an error event, not as an answer to Stop.
  // The daemon keeps the agent and the dialog stays open with the reason.
  const stopError =
    stopping && stopSent && lastError?.context?.agentId === stopping.id
      ? stopErrorText(stopping, lastError.code)
      : undefined;

  // The agent arrives as a patch, first as "starting"
  function plant(issueNumber: number) {
    if (freeSlot === undefined) return;
    dispatchAgent(issueNumber, freeSlot);
  }

  // Like a click on the plant: the agent's window alone, or beside with shift.
  // An open one is un-minimised, never added twice.
  function openAgent(agentId: AgentId, slotIndex: number, shift: boolean) {
    selectSlot(slotIndex);
    openWindow(agentId, { alone: !shift });
  }

  function openStop(agent: Agent) {
    setStopping(agent);
    setRemoveWorktree(false);
    setStopSent(false);
  }

  // The result arrives as a patch (agent:remove) or as an error, see above
  function stop() {
    if (!stopping) return;
    // An older error must not be taken for the answer to this stop
    setError(null);
    setStopSent(true);
    stopAgent(stopping.id, removeWorktree);
  }

  // h-full and min-h-0 down to the Branches tab, so its list can scroll
  // inside the panel instead of growing it.
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header className="flex items-start justify-between px-2 pt-1">
        {tab === "branches" ? (
          <div>
            <h2 className="font-title text-title-panel">Branches</h2>
            <p className="text-ui-meta text-muted-foreground">
              {active} active
            </p>
          </div>
        ) : (
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
              {/* The repo's total (#42), once something is counted */}
              {repoTokens !== null && repoTokens > 0 && (
                <>
                  {" · "}
                  <UsageTip
                    content={repoTip(repoTokens, agentTokens(agents, issues))}
                    trigger={
                      <span
                        tabIndex={0}
                        className="rounded-md px-1 outline-none hover:bg-ink/20 focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <span className="text-mono-key font-mono tabular-nums">
                          {formatTokens(repoTokens)}
                        </span>{" "}
                        tokens
                      </span>
                    }
                  />
                </>
              )}
            </p>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-lg bg-hover hover:bg-ink/20 [&_svg]:size-5"
          aria-label="Close panel"
          onClick={onClose}
        >
          <X />
        </Button>
      </header>

      <Tabs
        value={tab}
        className="min-h-0 flex-1 gap-3"
        onValueChange={(value) => onTabChange(value as SidePanelTab)}
      >
        <TabsList className="group-data-horizontal/tabs:h-auto w-full rounded-lg bg-panel-2 p-1">
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

        <TabsContent value="agents" className="flex flex-col gap-2">
          {Array.from({ length: MAX_SLOTS }, (_, slotIndex) => {
            const agent = agents.find((a) => a.slotIndex === slotIndex);
            if (!agent)
              return <FreeSlotRow key={slotIndex} slot={slotIndex + 1} />;

            return (
              <AgentRow
                key={agent.id}
                agent={agent}
                issueTitle={
                  issues.find((i) => i.number === agent.issueNumber)?.title ??
                  ""
                }
                selected={selectedSlot === slotIndex}
                onSelect={(shift) => openAgent(agent.id, slotIndex, shift)}
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

        <TabsContent value="branches" className="min-h-0">
          <BranchesTab />
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
              // Hides the refusal; Stop sends again
              setStopSent(false);
            }}
            className="size-4 accent-plate"
          />
          <span className="text-ui-body">Also remove worktree</span>
        </label>
      </ConfirmDialog>
    </div>
  );
}
