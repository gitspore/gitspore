"use client";

import type { Agent } from "@gitspore/shared";

import { useShallow } from "zustand/react/shallow";
import { useGreenhouseStore } from "@/lib/client/GreenhouseClientProvider";
import { mainGrid, shellGrid } from "@/lib/layout";
// Stays mock until the daemon sends usage (#42)
import { mockContext, mockUsage } from "@/lib/mock";
import { issueTitle, needsInputCount } from "@/lib/store/selectors";
import { useHotbarKeys } from "@/lib/hotbarKeys";
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
  const toggleMinimised = useGreenhouseStore((s) => s.toggleMinimised);
  // One action for every hotbar slot, by click or key 0–6 (#72)
  const pressSlot = useGreenhouseStore((s) => s.pressSlot);
  useHotbarKeys(pressSlot);

  // No scene with ?scene=off or without WebGL; the interface works the same (#18)
  const showScene = useSceneEnabled();

  // The agents of the visible windows; a window whose agent is gone is skipped
  const visibleWindows = useGreenhouseStore(
    useShallow((s) =>
      s.layout.windows
        .filter((w) => !w.minimised)
        .map((w) => s.server?.agents.find((a) => a.id === w.agentId))
        .filter((agent) => agent !== undefined),
    ),
  );
  const waitingCount = useGreenhouseStore(needsInputCount);

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
          <TopBar usage={mockUsage}>
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
                <AgentWindow
                  key={agent.id}
                  agent={agent}
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
            {/* Slot 0 is the overview agent (ADR 0004, 0005) */}
            <button
              type="button"
              aria-label="Open the overview agent"
              onClick={() => pressSlot(0)}

              className="hotbar-slot grid place-items-center rounded-xl bg-panel-2 font-mono"
            >
              0
            </button>
          </div>
        </section>

        {/* Side Panel */}
        {layout.sidePanel && (
          <aside className="pointer-events-auto overflow-y-auto rounded-xl bg-panel p-2 text-ink shadow-lg [grid-area:panel]">
            <SidePanel
              tab={layout.sidePanel}
              onTabChange={setSidePanel}
              onClose={() => setSidePanel(null)}
            />
          </aside>
        )}

        {/* Notifications */}
        <div className="absolute right-layout-edge bottom-[calc(var(--space-layout-edge)+12px)] flex w-panel-width justify-center">
          <div className="pointer-events-auto">
            <NotificationStack />
          </div>
        </div>
      </div>
    </>
  );
}

// A window with its issue title from the store
function AgentWindow({
  agent,
  onMinimise,
}: {
  agent: Agent;
  onMinimise: () => void;
}) {
  const title = useGreenhouseStore(issueTitle(agent.issueNumber));
  return (
    <Window
      agent={agent}
      issueTitle={title}
      context={mockContext[agent.id]}
      onMinimise={onMinimise}
    />
  );
}
