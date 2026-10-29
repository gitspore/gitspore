// The terminal's font, in one place: TerminalPanel gives it to xterm.js, and
// the window grid measures a cell with it to turn columns and rows into
// pixels (#109). The system's monospace at 13 px, the size of
// typography.mono.terminal (#55). Not JetBrains Mono at 1.2 yet: xterm's DOM
// renderer draws block characters as font glyphs, and Claude Code's logo got
// seams; that needs the WebGL renderer (follow-up)
export const TERMINAL_FONT = {
  fontFamily: "monospace",
  fontSize: 13,
  lineHeight: 1,
};

export type Cell = { width: number; height: number };

/**
 * The size of one terminal cell in px, measured like xterm.js does: the
 * width of "W", and the font's height times the line height. Browser only.
 * Without a 2D canvas, or a browser without the font's height, an estimate
 * of a monospace cell.
 *
 * WindowGrid measures once and keeps it. GS-55: with a web font, measure
 * again after `document.fonts.ready`, or the cell stays the fallback font's.
 */
export function measureCell(font = TERMINAL_FONT): Cell {
  const estimate = {
    width: font.fontSize * 0.6,
    height: Math.ceil(font.fontSize * 1.2 * font.lineHeight),
  };
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return estimate;
  context.font = `${font.fontSize}px ${font.fontFamily}`;
  const metrics = context.measureText("W");
  const height =
    (metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent) *
    font.lineHeight;
  return {
    width: metrics.width > 0 ? metrics.width : estimate.width,
    height:
      Number.isFinite(height) && height > 0
        ? Math.ceil(height)
        : estimate.height,
  };
}
