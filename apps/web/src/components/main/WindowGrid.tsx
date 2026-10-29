"use client";

import type { Agent } from "@gitspore/shared";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { useGreenhouseStore } from "@/lib/client/GreenhouseClientProvider";
import type { MainMode } from "@/lib/layout";
import { issueTitle } from "@/lib/store/selectors";
import { measureCell, type Cell } from "@/lib/terminal/font";
import { tileWindows, type Placement, type Tiling } from "@/lib/windowGrid";
import { tokens } from "@/theme/tokens";
import { Window } from "./Window";

// The visible windows, tiled by the rules in lib/windowGrid.ts (#109). Fills
// the windows area and tiles again when it changes size (side panel, mode,
// browser window). A window that doesn't fit minimises the oldest one; in
// scene mode, opening one that needs a second row switches to focus mode.

const { space, size, border } = tokens.day;
// gap-2 between the tiles
const GAP = space["2"];
// addon-fit keeps 14 px for xterm's scrollbar (measured, components.md)
const SCROLLBAR = 14;
// What a tile has besides terminal cells: the screen padding on each side
// and the scrollbar, the header and its line
const CHROME = {
  x: 2 * space.terminal.screen + SCROLLBAR,
  y: size["terminal-header"] + border.line + 2 * space.terminal.screen,
};

// The area's size and the terminal's cell, and the mode they were measured
// in: right after a mode switch the area still has the old size for a frame
type Measured = { width: number; height: number; mode: MainMode; cell: Cell };

function measureArea(
  area: HTMLElement,
  mode: MainMode,
  cellRef: RefObject<Cell | null>,
): Measured {
  return {
    width: area.clientWidth,
    height: area.clientHeight,
    mode,
    // Once: the font doesn't change while the page is open
    cell: (cellRef.current ??= measureCell()),
  };
}

export function WindowGrid() {
  const mode = useGreenhouseStore((s) => s.layout.mode);
  const focusedAgentId = useGreenhouseStore((s) => s.focusedAgentId);
  const focusWindow = useGreenhouseStore((s) => s.focusWindow);
  const toggleMinimised = useGreenhouseStore((s) => s.toggleMinimised);
  const minimiseWindows = useGreenhouseStore((s) => s.minimiseWindows);
  const setMode = useGreenhouseStore((s) => s.setMode);
  // The agents of the visible windows, in open order; a window whose agent
  // is gone is skipped
  const agents = useGreenhouseStore(
    useShallow((s) =>
      s.layout.windows
        .filter((w) => !w.minimised)
        .map((w) => s.server?.agents.find((a) => a.id === w.agentId))
        .filter((agent) => agent !== undefined),
    ),
  );

  const areaRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef(mode);
  const cellRef = useRef<Cell | null>(null);
  const [measured, setMeasured] = useState<Measured | null>(null);
  // Before paint and before the ResizeObserver, so a size is never stamped
  // with the old mode; and measured right away, as the area may keep its
  // size across the switch and the observer never fire
  useLayoutEffect(() => {
    modeRef.current = mode;
    if (areaRef.current) {
      setMeasured(measureArea(areaRef.current, mode, cellRef));
    }
  }, [mode]);
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const observer = new ResizeObserver(() =>
      setMeasured(measureArea(area, modeRef.current, cellRef)),
    );
    observer.observe(area);
    return () => observer.disconnect();
  }, []);

  // Tiled in the mode the size was measured in: right after a switch the
  // new mode with the old size would drop windows that still fit, and
  // unmounting them closes their terminal sessions
  const current = measured !== null && measured.mode === mode;
  const tiling: Tiling | null =
    measured &&
    tileWindows(
      agents.map((a) => a.id),
      focusedAgentId,
      measured.mode,
      { ...measured, gap: GAP, chrome: CHROME },
    );

  // Act on what doesn't fit, only on a measurement of the current mode
  const lastCount = useRef(agents.length);
  useEffect(() => {
    if (!tiling || !current) return;
    const opened = agents.length > lastCount.current;
    lastCount.current = agents.length;
    if (tiling.needsSecondRow && opened) setMode("focus");
    else if (tiling.overflow.length > 0) minimiseWindows(tiling.overflow);
  });

  return (
    <div
      ref={areaRef}
      className="grid size-full min-h-0 min-w-0 gap-2"
      style={
        tiling
          ? {
              gridTemplateColumns: `repeat(${tiling.columns}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${tiling.rows}, minmax(0, 1fr))`,
            }
          : undefined
      }
    >
      {/* One flat list in open order, so a window that moves to another
          tile keeps its terminal */}
      {tiling?.placements.map((placement) => {
        const agent = agents.find((a) => a.id === placement.agentId)!;
        return (
          <Tile
            key={agent.id}
            agent={agent}
            placement={placement}
            focused={agent.id === focusedAgentId}
            onFocus={() => focusWindow(agent.id)}
            onMinimise={() => toggleMinimised(agent.id)}
          />
        );
      })}
    </div>
  );
}

// One window in its cell of the grid
function Tile({
  agent,
  placement,
  focused,
  onFocus,
  onMinimise,
}: {
  agent: Agent;
  placement: Placement;
  focused: boolean;
  onFocus: () => void;
  onMinimise: () => void;
}) {
  const title = useGreenhouseStore(issueTitle(agent.issueNumber));
  return (
    <div
      className="flex min-h-0 min-w-0"
      style={{
        gridColumn: `${placement.column} / span ${placement.columnSpan}`,
        gridRow: placement.row,
      }}
    >
      <Window
        agent={agent}
        issueTitle={title}
        focused={focused}
        onFocus={onFocus}
        onMinimise={onMinimise}
      />
    </div>
  );
}
