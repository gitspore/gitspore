// The terminal's font, in one place: TerminalPanel gives it to xterm.js, and
// the window grid measures a cell with it to turn columns and rows into
// pixels (#109). Today xterm's own defaults; GS-55 changes it to JetBrains
// Mono 13 px here.
export const TERMINAL_FONT = {
  fontFamily: "monospace",
  fontSize: 15,
  lineHeight: 1,
};

export type Cell = { width: number; height: number };

/**
 * The size of one terminal cell in px, measured like xterm.js does: the
 * width of "W", and the font's height times the line height. Browser only.
 */
export function measureCell(font = TERMINAL_FONT): Cell {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) throw new Error("No 2D canvas to measure the terminal font");
  context.font = `${font.fontSize}px ${font.fontFamily}`;
  const metrics = context.measureText("W");
  return {
    width: metrics.width,
    height: Math.ceil(
      (metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent) *
        font.lineHeight,
    ),
  };
}
