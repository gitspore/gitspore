import type { AgentId } from "@gitspore/shared";
import type { MainMode } from "./layout";
import type { Cell } from "./terminal/font";

// How the visible windows tile (#109, rules from #106). Sizes are counted in
// terminal columns and rows, so they hold for any terminal font:
// - a tile shows at least 60 columns, preferably 80;
// - stacked rows of tiles at least 10 rows each (a single row has 14 and
//   more from 1030 px; smaller screens are GS-106);
// - side by side: as many as keep 80 columns; when that is only one, as
//   many as keep 60 (2 on a laptop, 3 on about 2560 px);
// - a second row only in focus mode, and it goes on top, so the tiles you
//   read don't move;
// - at most four tiles (layout.html R1); the oldest windows that don't fit
//   are minimised (no tabs yet, GS-107).

export const PREFERRED_COLUMNS = 80;
export const MIN_COLUMNS = 60;
export const MIN_STACKED_ROWS = 10;
const MAX_TILES = 4;

export type TileArea = {
  // The windows area in px
  width: number;
  height: number;
  gap: number;
  // The px of a tile that aren't terminal cells: header, padding
  chrome: { x: number; y: number };
  cell: Cell;
};

export type Placement = {
  agentId: AgentId;
  // 1-based grid lines; the grid has `columns` equal columns
  column: number;
  columnSpan: number;
  row: number;
};

export type Tiling = {
  columns: number;
  rows: number;
  // The windows that show, in open order
  placements: Placement[];
  // The oldest windows that don't fit, never the focused one
  overflow: AgentId[];
  // Scene mode holds one row; these windows would need a second
  needsSecondRow: boolean;
};

/** How many tiles fit side by side in the area. */
export function tilesPerRow(area: TileArea): number {
  const fitting = (columns: number) => {
    let n = 1;
    while (n < MAX_TILES && tileColumns(n + 1, area) >= columns) n++;
    return n;
  };
  const wide = fitting(PREFERRED_COLUMNS);
  return wide > 1 ? wide : fitting(MIN_COLUMNS);
}

/** How many rows of tiles fit: one in scene mode, else as many as keep 10 rows. */
export function rowsOfTiles(mode: MainMode, area: TileArea): number {
  if (mode === "scene") return 1;
  let n = 1;
  while (n < MAX_TILES && tileRows(n + 1, area) >= MIN_STACKED_ROWS) n++;
  return n;
}

/**
 * Tiles the visible windows (in open order) into the area. Windows beyond
 * what fits come back as `overflow`, oldest first, for the caller to
 * minimise.
 */
export function tileWindows(
  windows: AgentId[],
  focused: AgentId | null,
  mode: MainMode,
  area: TileArea,
): Tiling {
  const perRow = tilesPerRow(area);
  const capacity = Math.min(MAX_TILES, perRow * rowsOfTiles(mode, area));

  const overflow = windows
    .filter((id) => id !== focused)
    .slice(0, Math.max(0, windows.length - capacity));
  const shown = windows.filter((id) => !overflow.includes(id));

  // Oldest first into the bottom row, the next ones on top of it
  const rows = Math.ceil(shown.length / perRow);
  // Enough grid columns that every row splits them evenly
  const columns = leastCommonMultiple(perRow);
  const placements = shown.map((agentId, index) => {
    const fromBottom = Math.floor(index / perRow);
    const rowStart = fromBottom * perRow;
    const inRow = Math.min(perRow, shown.length - rowStart);
    const span = columns / inRow;
    return {
      agentId,
      column: (index - rowStart) * span + 1,
      columnSpan: span,
      row: rows - fromBottom,
    };
  });

  return {
    columns,
    rows,
    placements,
    overflow,
    needsSecondRow: mode === "scene" && windows.length > perRow,
  };
}

// Columns of terminal one of n tiles side by side shows
function tileColumns(n: number, area: TileArea): number {
  const width = (area.width - (n - 1) * area.gap) / n;
  return Math.floor((width - area.chrome.x) / area.cell.width);
}

// Rows of terminal one of n rows of tiles shows
function tileRows(n: number, area: TileArea): number {
  const height = (area.height - (n - 1) * area.gap) / n;
  return Math.floor((height - area.chrome.y) / area.cell.height);
}

// The least common multiple of 1 … n (n is at most 4)
function leastCommonMultiple(n: number): number {
  return [1, 1, 2, 6, 12][n];
}
