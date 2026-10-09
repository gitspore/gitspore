"use client";

import { useState } from "react";
import { mainGrid, shellGrid, type LayoutSettings } from "@/lib/layout";
import { Button } from "../ui/button";
import ThemeToggle from "./ThemeToggle";

const HOTBAR_SLOTS = ["1", "2", "3", "4", "5", "6"];

export default function AppShell() {
  // Temporary: moves to the zustand store later
  const [layout, setLayout] = useState<LayoutSettings>({
    sidePanel: "agents",
    mode: "scene",
    windows: [{ agentId: "a1", minimised: false }],
  });

  const visibleWindows = layout.windows.filter((w) => !w.minimised);

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
      <header className="pointer-events-auto flex gap-2 rounded-xl bg-panel p-2 text-ink [grid-area:topbar]">
        top bar
        {/* Debug controls, remove once the store and real buttons exist */}
        <Button
          onClick={() =>
            setLayout((l) => ({
              ...l,
              sidePanel: l.sidePanel ? null : "agents",
            }))
          }
        >
          Toggle Panel
        </Button>
        <Button
          variant={layout.mode === "scene" ? "default" : "secondary"}
          className="capitalize"
          onClick={() =>
            setLayout((l) => ({
              ...l,
              mode: l.mode === "scene" ? "focus" : "scene",
            }))
          }
        >
          {layout.mode}
        </Button>
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
        <ThemeToggle />
      </header>

      {/* 
				----
				Rail
				----
			*/}
      <nav className="pointer-events-auto rounded-xl bg-plate p-2 text-plate-ink [grid-area:rail]">
        rail
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
        <aside className="pointer-events-auto rounded-xl bg-panel p-2 text-ink [grid-area:panel]">
          side panel · {layout.sidePanel}
        </aside>
      )}
    </div>
  );
}
