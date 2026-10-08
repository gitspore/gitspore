# 0008: Theme files are generated from a copy of the Penpot tokens

- Status: proposed
- Date: 2026-10-08

## Context

[ADR 0007](0007-penpot-is-the-source-of-design-values.md) makes Penpot the source of design values but leaves open how they reach the code. By 2026-10-08 the same values were typed in by hand in three places: `components.md`, a `tokens.css` and a `tokens.ts` on a frontend branch. They had already drifted: the frontend copy missed spacing, shadows and the xterm colours, and still had an old terminal colour.

The app needs the values in four forms: CSS variables for plain CSS and CSS modules, Tailwind utilities (the frontend uses Tailwind v4 with shadcn), typed values for React Three Fiber and xterm.js, and a page the team can look values up on.

## Decision

- The repo keeps a copy of the Penpot tokens in `apps/web/src/theme/tokens.json`, in the format Penpot imports and exports. The copy must match Penpot exactly. A Claude session with the Penpot MCP server dumps it; it can't run in CI because it needs the open Penpot tab.
- Two more source files sit next to it: `typography.json` (the Penpot typographies, which are not tokens in Penpot) and `scene.json` (the 3D scene values, which have no place in Penpot). For `scene.json` the repo is the source.
- `npm run tokens` (`apps/web/scripts/tokens.mjs`, plain Node, no Style Dictionary) generates `tokens.css`, `tailwind.css`, `tokens.ts` and [tokens.html](../design/tokens.html). Nobody edits the generated files; CI runs `npm run tokens:check` and fails if they are stale.
- Night mode is the `.dark` class on `<html>` (set by next-themes); without a class the system setting decides. A terminal window overrides the mode with `.terminal-light` or `.terminal-dark`.
- Fonts come from `next/font`, which sets `--font-fredoka`, `--font-figtree` and `--font-jetbrains-mono`; the font tokens read those.
- Tailwind reads the same CSS variables (`@theme reference`), so a utility like `bg-panel` follows the mode. Tailwind's default palette is switched off. `color.muted` and `color.accent` get no utility because shadcn uses those names; use `text-muted-foreground` and `bg-primary`.
- Spacing tokens are named per component (`space.button.x`, `space.row.gap`), and the last segment names the CSS property. We tuned the values per component; they don't follow a scale.
- All 16 ANSI colours of each terminal reach 4.5 : 1 against its background, so text stays readable whichever way the per-window switch is set. As a result `white` is dark on the light terminal and `black` is light on the dark one. If programs that paint black or white backgrounds look wrong, three values change back; see "Open" in [components.md](../design/components.md).

## Alternatives

- Tokens only in code, Penpot as a picture. Values drift again as soon as someone designs in Penpot.
- Style Dictionary or Tokens Studio. More setup and configuration than one script for four outputs, and neither knows our Tailwind and shadcn rules.
- Keep the hand-written files. Three copies and a reminder to change them together; that already failed.

## Consequences

- This replaces the first consequence of ADR 0007: the code does not become the source. Penpot stays the source for interface values, `scene.json` for 3D values.
- Changing a value means: Penpot, dump, `npm run tokens`, commit. The steps are in [penpot.md](../design/penpot.md#change-a-token) and the `tokens-update` skill.
- `components.md` no longer lists values; it links to [tokens.html](../design/tokens.html).
- Motion values (durations, easings) are not tokens yet. Penpot has no type for them; #36 adds them as `motion.json`.
