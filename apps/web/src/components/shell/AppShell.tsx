"use client";

import type { Agent } from "@gitspore/shared";

import { useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useGreenhouseStore } from "@/lib/client/GreenhouseClientProvider";
import { mainGrid, shellGrid } from "@/lib/layout";
// Stays mock until the daemon sends usage (#42)
import { mockContext, mockUsage } from "@/lib/mock";
import { issueTitle, needsInputCount, showSetup } from "@/lib/store/selectors";
import { useHotbarKeys } from "@/lib/hotbarKeys";
import { useSceneEnabled } from "@/lib/scene";
import { Scene } from "../Scene";
import { ConnectScreen } from "../attention/ConnectScreen";
import { NotificationStack } from "../attention/NotificationStack";
import { Hotbar } from "../main/Hotbar";
import { Window } from "../main/Window";
import { SidePanel } from "../side-panel/SidePanel";
import { ToolRail } from "./ToolRail";
import { TopBar } from "./TopBar";

export function AppShell() {
  // Side panel, main mode and open windows live in the store
  const layout = useGreenhouseStore((s) => s.layout);
  const setSidePanel = useGreenhouseStore((s) => s.setSidePanel);
  const setMode = useGreenhouseStore((s) => s.setMode);
  const toggleMinimised = useGreenhouseStore((s) => s.toggleMinimised);
  const focusWindow = useGreenhouseStore((s) => s.focusWindow);
  const focusedAgentId = useGreenhouseStore((s) => s.focusedAgentId);
  // No repo chosen yet, or the user switches repos (#58)
  const setupVisible = useGreenhouseStore(showSetup);
  // Keys 0–6 press the hotbar slots (#72), not behind the setup screen
  const pressSlot = useGreenhouseStore((s) => s.pressSlot);
  useHotbarKeys(pressSlot, !setupVisible);

  // No scene with ?scene=off or without WebGL; the interface works the same (#18)
  const showScene = useSceneEnabled();
  // The scene's free part of the main area; the camera frames the table
  // into it. Focus mode with a window open has no scene area, so it hides
  const sceneArea = useRef<HTMLDivElement>(null);
  const sceneHidden =
    layout.mode === "focus" && layout.windows.some((w) => !w.minimised);

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
        {showScene && <Scene sceneArea={sceneArea} />}
      </div>

      <div
        className="app-shell pointer-events-none fixed inset-0 z-10"
        style={shellGrid(layout)}
      >
        {/* Header */}
        <header className="pointer-events-auto rounded-xl bg-panel text-ink [grid-area:topbar]">
          <TopBar usage={mockUsage} />
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
          <div
            ref={sceneArea}
            className={sceneHidden ? "hidden" : "[grid-area:scene]"}
          />

          {visibleWindows.length > 0 && (
            // Side by side for now; tiling (1, 2, 2+1, 2×2) comes with WindowGrid
            <div className="pointer-events-auto flex gap-2 [grid-area:windows]">
              {visibleWindows.map((agent) => (
                <AgentWindow
                  key={agent.id}
                  agent={agent}
                  focused={agent.id === focusedAgentId}
                  onFocus={() => focusWindow(agent.id)}
                  onMinimise={() => toggleMinimised(agent.id)}
                />
              ))}
            </div>
          )}

          <div className="pointer-events-auto justify-self-center [grid-area:hotbar]">
            <Hotbar />
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

      {/* Covers the greenhouse until a repo is chosen */}
      {setupVisible && <ConnectScreen />}
    </>
  );
}

// A window with its issue title from the store
function AgentWindow({
  agent,
  focused,
  onFocus,
  onMinimise,
}: {
  agent: Agent;
  focused: boolean;
  onFocus: () => void;
  onMinimise: () => void;
}) {
  const title = useGreenhouseStore(issueTitle(agent.issueNumber));
  return (
    <Window
      agent={agent}
      issueTitle={title}
      context={mockContext[agent.id]}
      focused={focused}
      onFocus={onFocus}
      onMinimise={onMinimise}
    />
  );
}
