"use client";

import { useState } from "react";
import type { Agent } from "@gitspore/shared";
import {
  mainGrid,
  shellGrid,
  type LayoutSettings,
  type SidePanelTab,
} from "@/lib/layout";
import { mockAgents, mockContext, mockIssues, mockUsage } from "@/lib/mock";
import { useSceneEnabled } from "@/lib/scene";
import { Scene } from "../Scene";
import { Button } from "../ui/button";
import { NotificationStack } from "../attention/NotificationStack";
import { Window } from "../main/Window";
import { SidePanel } from "../side-panel/SidePanel";
import { ToolRail } from "./ToolRail";
import { TopBar } from "./TopBar";

const HOTBAR_SLOTS = ["1", "2", "3", "4", "5", "6"];

export function AppShell() {
  // Temporary: moves to the zustand store later
  const [layout, setLayout] = useState<LayoutSettings>({
    sidePanel: "agents",
    mode: "scene",
    // #15 waits in the mock, so the header shows the waiting state
    windows: [{ agentId: "agent-1", minimised: false }],
  });

  // Shared by the top bar and the side panel. Moves to the store with #8.
  const [agents, setAgents] = useState<Agent[]>(mockAgents);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);

  // The side panel before entering focus mode, to bring it back afterwards (rule R6)
  const [panelBeforeFocus, setPanelBeforeFocus] = useState<SidePanelTab | null>(
    null,
  );

  // No scene with ?scene=off or without WebGL; the interface works the same (#18)
  const showScene = useSceneEnabled();

  // The agents of the visible windows; a window whose agent is gone is skipped
  const visibleWindows = layout.windows
    .filter((w) => !w.minimised)
    .map((w) => agents.find((a) => a.id === w.agentId))
    .filter((agent) => agent !== undefined);
  const waitingCount = agents.filter((a) => a.status === "needs_input").length;

  // R6: entering focus mode closes the side panel; leaving it restores the panel
  function toggleMode() {
    if (layout.mode === "scene") {
      setPanelBeforeFocus(layout.sidePanel);
      setLayout((l) => ({ ...l, mode: "focus", sidePanel: null }));
    } else {
      setLayout((l) => ({ ...l, mode: "scene", sidePanel: panelBeforeFocus }));
    }
  }

  // Open: this agent's window alone, the others minimised.
  // Beside: this window next to the ones already visible.
  function openAgent(agent: Agent, beside: boolean) {
    setSelectedSlot(agent.slotIndex);
    setLayout((l) => {
      const others = l.windows
        .filter((w) => w.agentId !== agent.id)
        .map((w) => (beside ? w : { ...w, minimised: true }));
      return {
        ...l,
        windows: [...others, { agentId: agent.id, minimised: false }],
      };
    });
  }

  return (
    <>
      {/* The scene fills the page under the interface */}
      <div className="fixed inset-0 z-0 bg-panel-2">
        {showScene && <Scene />}
      </div>

      <div
        className="app-shell pointer-events-none fixed inset-0 z-10"
        style={shellGrid(layout)}
      >
        {/* Header */}
        <header className="pointer-events-auto rounded-xl bg-panel text-ink [grid-area:topbar]">
          <TopBar
            agents={agents}
            issues={mockIssues}
            selectedSlot={selectedSlot}
            connection="online"
            usage={mockUsage}
            mockScenario="all-states"
          >
            {/* Debug control, remove once the hotbar exists */}
            <Button
              onClick={() =>
                setLayout((l) => ({
                  ...l,
                  windows: l.windows.map((w) => ({
                    ...w,
                    minimised: !w.minimised,
                  })),
                }))
              }
            >
              Toggle Terminal
            </Button>
          </TopBar>
        </header>

        {/* Rail */}
        {/* No background of its own; -ml pulls the bookmarks to the screen edge */}
        <nav className="-ml-layout-edge [grid-area:rail]">
          <div className="pointer-events-auto w-fit">
            <ToolRail
              sidePanel={layout.sidePanel}
              onSidePanelChange={(tab) =>
                setLayout((l) => ({ ...l, sidePanel: tab }))
              }
              mode={layout.mode}
              onToggleMode={toggleMode}
              waitingCount={waitingCount}
            />
          </div>
        </nav>

        {/* Main Section */}
        <section
          className="relative grid gap-layout-edge [grid-area:main]"
          style={mainGrid(layout)}
        >
          {visibleWindows.length > 0 && (
            // Side by side for now; tiling (1, 2, 2+1, 2×2) comes with WindowGrid
            <div className="pointer-events-auto flex gap-2 [grid-area:windows]">
              {visibleWindows.map((agent) => (
                <Window
                  key={agent.id}
                  agent={agent}
                  issueTitle={
                    mockIssues.find((i) => i.number === agent.issueNumber)
                      ?.title ?? ""
                  }
                  context={mockContext[agent.id]}
                  onMinimise={() =>
                    setLayout((l) => ({
                      ...l,
                      windows: l.windows.map((w) =>
                        w.agentId === agent.id ? { ...w, minimised: true } : w,
                      ),
                    }))
                  }
                />
              ))}
            </div>
          )}

          <div className="hotbar pointer-events-auto flex items-center gap-1.5 justify-self-center rounded-2xl bg-panel p-1.5 text-ink [grid-area:hotbar]">
            {HOTBAR_SLOTS.map((key) => (
              <div
                key={key}
                className="hotbar-slot grid place-items-center rounded-xl bg-panel-2 font-mono"
              >
                {key}
              </div>
            ))}
            <div className="h-10 w-0.5 bg-line" />
            <div className="hotbar-slot grid place-items-center rounded-xl bg-panel-2 font-mono">
              0
            </div>
          </div>
        </section>

        {/* Side Panel */}
        {layout.sidePanel && (
          <aside className="pointer-events-auto overflow-y-auto rounded-xl bg-panel p-2 text-ink shadow-lg [grid-area:panel]">
            <SidePanel
              tab={layout.sidePanel}
              onTabChange={(tab) =>
                setLayout((l) => ({ ...l, sidePanel: tab }))
              }
              onClose={() => setLayout((l) => ({ ...l, sidePanel: null }))}
              agents={agents}
              setAgents={setAgents}
              selectedSlot={selectedSlot}
              setSelectedSlot={setSelectedSlot}
            />
          </aside>
        )}

        {/* Notifications */}
        <div className="absolute right-layout-edge bottom-[calc(var(--space-layout-edge)+12px)] flex w-panel-width justify-center">
          <div className="pointer-events-auto">
            <NotificationStack
              agents={agents}
              onOpen={(agent) => openAgent(agent, false)}
              onOpenBeside={(agent) => openAgent(agent, true)}
            />
          </div>
        </div>
      </div>
    </>
  );
}
