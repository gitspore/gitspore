"use client";

import { useState } from "react";
import type { Agent } from "@gitspore/shared";
import {
  mainGrid,
  shellGrid,
  type LayoutSettings,
  type SidePanelTab,
} from "@/lib/layout";
import { mockAgents, mockIssues } from "@/lib/mock";
import { Button } from "../ui/button";
import SidePanel from "../side-panel/SidePanel";
import ToolRail from "./ToolRail";
import TopBar from "./TopBar";

const HOTBAR_SLOTS = ["1", "2", "3", "4", "5", "6"];

export default function AppShell() {
  // Temporary: moves to the zustand store later
  const [layout, setLayout] = useState<LayoutSettings>({
    sidePanel: "agents",
    mode: "scene",
    windows: [{ agentId: "a1", minimised: false }],
  });

  // Shared by the top bar and the side panel. Moves to the store with #8.
  const [agents, setAgents] = useState<Agent[]>(mockAgents);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);

  // The side panel before entering focus mode, to bring it back afterwards (rule R6)
  const [panelBeforeFocus, setPanelBeforeFocus] = useState<SidePanelTab | null>(
    null,
  );

  const visibleWindows = layout.windows.filter((w) => !w.minimised);
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

  return (
    <div
      className="app-shell pointer-events-none fixed inset-0 z-10"
      style={shellGrid(layout)}
    >
      {/* 
				------
				Header
				------
			*/}
      <header className="pointer-events-auto rounded-xl bg-panel text-ink [grid-area:topbar]">
        <TopBar
          agents={agents}
          issues={mockIssues}
          selectedSlot={selectedSlot}
          connection="online"
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

      {/* 
				----
				Rail
				----
			*/}
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

      {/* 
				------------
				Main Section 
				------------
			*/}
      <section
        className="relative grid gap-layout-edge [grid-area:main]"
        style={mainGrid(layout)}
      >
        {visibleWindows.length > 0 && (
          <div className="pointer-events-auto rounded-xl bg-terminal-bg p-2 text-terminal-fg [grid-area:windows]">
            {visibleWindows.length} window(s)
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

        <div className="pointer-events-auto absolute right-0 bottom-0 rounded-xl bg-wait p-2 text-xs text-wait-ink">
          notifications
        </div>
      </section>

      {/* 
				----------
				Side Panel 
				----------
			*/}
      {layout.sidePanel && (
        <aside className="pointer-events-auto overflow-y-auto rounded-xl bg-panel p-2 text-ink shadow-lg [grid-area:panel]">
          <SidePanel
            tab={layout.sidePanel}
            onTabChange={(tab) => setLayout((l) => ({ ...l, sidePanel: tab }))}
            onClose={() => setLayout((l) => ({ ...l, sidePanel: null }))}
            agents={agents}
            setAgents={setAgents}
            selectedSlot={selectedSlot}
            setSelectedSlot={setSelectedSlot}
          />
        </aside>
      )}
    </div>
  );
}
