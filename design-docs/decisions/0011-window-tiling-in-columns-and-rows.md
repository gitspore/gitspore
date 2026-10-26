# 0011: Windows tile in terminal columns and rows, and minimise the oldest

- Status: proposed
- Date: 2026-10-26

Supersedes the tiling rule of [0003](0003-layout-model.md) ("Terminals tile by count (1, 2, 2+1, 2×2) and keep 80 columns; when that doesn't fit they stack, then become tabs"). The rest of 0003 stands.

## Context

0003 kept every terminal at 80 columns and fell back to tabs. On a 1440 px laptop that means two terminals side by side only with the side panel closed, and a tab as soon as it opens. Measured with Claude Code in the overview window (#106): it reflows cleanly down to 30 columns, chat reads well at 60, and its own frame takes about 6 rows. Tabs would also repeat what the hotbar already shows: every agent, and whose window is minimised.

## Decision

- A tile shows at least 60 columns, preferably 80. Sizes are counted in terminal columns and rows, measured from the terminal font, so they hold when the font changes.
- Side by side go as many tiles as keep 80 columns; when that is only one, as many as keep 60: 2 on a laptop, 3 on about 2560 px. At most 4 tiles are visible.
- A second row of tiles only in focus mode, with at least 10 rows per tile, and the new row goes on top, so the tiles being read don't move.
- In scene mode the band holds one row. Opening a window that would need a second row switches to focus mode.
- When one more window doesn't fit, the oldest visible one is minimised; its hotbar slot shows the mark. The same happens when the area gets smaller (side panel, browser window).
- Tabs inside a tile come later (#107).

Screens below about 1030 px (one tile, smaller font, vertical hotbar) are #106.

## Alternatives

- Keep 0003: 80 columns and tabs. Two terminals side by side need the side panel closed, and tabs repeat the hotbar.
- Let tiles get narrower than 60 columns. Code wraps on almost every line.

## Consequences

- `WindowGrid` measures the windows area and the terminal cell and tiles with `tileWindows` (`apps/web/src/lib/windowGrid.ts`). The terminal font is set in one place (`lib/terminal/font.ts`), so GS-55 changes it there.
- Opening the side panel can minimise windows; closing it doesn't bring them back.
- After a window is minimised the rest tile again in open order, so a tile can move to the other row.
- `layout.html` R1–R3, S06, S07, S08 and S13 follow these rules.
