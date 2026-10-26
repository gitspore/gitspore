"use client";

import { useRef } from "react";
import { useGreenhouseStore } from "@/lib/client/GreenhouseClientProvider";
import { mainGrid, shellGrid } from "@/lib/layout";
// Stays mock until the daemon sends usage (#42)
import { mockUsage } from "@/lib/mock";
import { needsInputCount, showSetup } from "@/lib/store/selectors";
import { useHotbarKeys } from "@/lib/hotbarKeys";
import { useSceneEnabled } from "@/lib/scene";
import { Scene } from "../Scene";
import { ConnectScreen } from "../attention/ConnectScreen";
import { NotificationStack } from "../attention/NotificationStack";
import { Hotbar } from "../main/Hotbar";
import { WindowGrid } from "../main/WindowGrid";
import { SidePanel } from "../side-panel/SidePanel";
import { ToolRail } from "./ToolRail";
import { TopBar } from "./TopBar";

export function AppShell() {
  // Side panel, main mode and open windows live in the store
  const layout = useGreenhouseStore((s) => s.layout);
  const setSidePanel = useGreenhouseStore((s) => s.setSidePanel);
  const setMode = useGreenhouseStore((s) => s.setMode);
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

  // The windows themselves are WindowGrid's (#109)
  const hasVisibleWindow = layout.windows.some((w) => !w.minimised);
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
          className="relative grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] gap-layout-edge [grid-area:main]"
          style={mainGrid(layout)}
        >
          <div
            ref={sceneArea}
            className={sceneHidden ? "hidden" : "[grid-area:scene]"}
          />

          {hasVisibleWindow && (
            <div className="pointer-events-auto min-h-0 min-w-0 [grid-area:windows]">
              <WindowGrid />
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
