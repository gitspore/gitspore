# 0003: Windows in fixed slots over a full-page scene

- Status: proposed
- Date: 2026-10-06

## Context

The app shows a 3D scene, several terminals, issues and branches at once, on a laptop screen. Free floating windows are hard to build, hard to keep tidy, and hide the scene.

## Decision

- The scene fills the page and never resizes. The interface lies on top in a CSS grid: top bar, tool rail, main area, side panel (400 px, tabs Agents · Issues · Branches), hotbar.
- Three settings make every state: the side panel tab (or closed), the main area mode (scene mode with terminals in a band, or focus mode with terminals over the scene), and the ordered list of open windows.
- Buttons place windows; there is no dragging or free resizing. Terminals tile by count (1, 2, 2+1, 2×2) and keep 80 columns; when that doesn't fit they stack, then become tabs.
- Esc belongs to the terminal (Claude Code uses it to interrupt). App shortcuts work only when no terminal has focus.
- The rules R1–R12 and the 19 states are in [layout.html](../design/layout.html).

## Alternatives

- A docked IDE-like layout with a resizable scene. The canvas would resize on every change.
- Draggable windows. More freedom, much more code, and the scene disappears behind them.

## Consequences

- The store holds the layout as a list of windows from day one, so tiling can come later without a refactor.
- The camera frames the pots into the free part of the main area with a view offset.
- Minimum screen width 1280 px; no phone layout.
