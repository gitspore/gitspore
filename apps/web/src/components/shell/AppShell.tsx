"use client";

import { useState } from "react";
import { OVERVIEW_AGENT_ID, type Agent } from "@gitspore/shared";
import { useGreenhouseStore } from "@/lib/client/GreenhouseClientProvider";
import { mainGrid, shellGrid } from "@/lib/layout";
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
  // Side panel, main mode and open windows live in the store
  const layout = useGreenhouseStore((s) => s.layout);
  const setSidePanel = useGreenhouseStore((s) => s.setSidePanel);
  const setMode = useGreenhouseStore((s) => s.setMode);
  const openWindow = useGreenhouseStore((s) => s.openWindow);
  const toggleMinimised = useGreenhouseStore((s) => s.toggleMinimised);

  // mock or live, from the URL. Not layout.mode (scene or focus).
  // Live, every window shows the overview agent's terminal for now: it is
  // the only agent the daemon runs, and the windows still use mockAgents (#8).
  const clientMode = useGreenhouseStore((s) => s.mode);

  // Shared by the top bar and the side panel. Moves to the store with #8.
  const [agents, setAgents] = useState<Agent[]>(mockAgents);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);

  // No scene with ?scene=off or without WebGL; the interface works the same (#18)
  const showScene = useSceneEnabled();

  // The agents of the visible windows; a window whose agent is gone is skipped
  const visibleWindows = layout.windows
    .filter((w) => !w.minimised)
    .map((w) => agents.find((a) => a.id === w.agentId))
    .filter((agent) => agent !== undefined);
  const waitingCount = agents.filter((a) => a.status === "needs_input").length;

  // Open: this agent's window alone, the others minimised.
  // Beside: this window next to the ones already visible.
  function openAgent(agent: Agent, beside: boolean) {
    setSelectedSlot(agent.slotIndex);
    openWindow(agent.id, { alone: !beside });
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
                layout.windows.forEach((w) => toggleMinimised(w.agentId))
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
              onSidePanelChange={setSidePanel}
              mode={layout.mode}
              onToggleMode={() =>
                setMode(layout.mode === "scene" ? "focus" : "scene")
              }
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
                  terminalAgentId={
                    clientMode === "live" ? OVERVIEW_AGENT_ID : agent.id
                  }

                  onMinimise={() => toggleMinimised(agent.id)}
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
              onTabChange={setSidePanel}
              onClose={() => setSidePanel(null)}
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
