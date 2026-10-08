# Theme

Every design value of gitspore: colours, spacing, sizes, radii, shadows, type, the terminal palettes and the 3D scene. Look values up in [design-docs/design/tokens.html](../../../../design-docs/design/tokens.html) (open it in a browser; click a value to copy it). Never type a hex value, a pixel size or a Tailwind palette colour into a component.

## Files

| File              | What it is                                                          | Edit?                        |
| ----------------- | ------------------------------------------------------------------- | ---------------------------- |
| `tokens.json`     | Copy of the Penpot tokens (sets `cozy-06/shared`, `/day`, `/night`) | Only by dumping from Penpot  |
| `typography.json` | Copy of the 17 Penpot typographies                                  | Only by dumping from Penpot  |
| `scene.json`      | 3D scene values, not in Penpot                                      | Yes, this file is the source |
| `tokens.css`      | CSS variables, day on `:root`, night under `.dark`                  | Generated                    |
| `tailwind.css`    | Tailwind v4 theme that maps utilities to those variables            | Generated                    |
| `tokens.ts`       | Typed values for R3F and xterm.js                                   | Generated                    |

`npm run tokens` (script: `apps/web/scripts/tokens.mjs`) writes the generated files and `tokens.html`. `npm run tokens:check` fails if they are out of date; CI runs it. How a value gets from Penpot into `tokens.json`: [penpot.md, "Change a token"](../../../../design-docs/design/penpot.md#change-a-token). Why it works this way: [ADR 0008](../../../../design-docs/decisions/0008-generated-theme-files.md).

## Setup

In `src/app/globals.css`, after Tailwind and shadcn:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "../theme/tailwind.css";
@import "../theme/tokens.css";
```

`next/font` in `layout.tsx` must set `--font-fredoka`, `--font-figtree` and `--font-jetbrains-mono`; `--font-title`, `--font-ui` and `--font-mono` read them. next-themes (`attribute="class"`) puts `.dark` on `<html>` for night. Without a class, the system setting decides.

`tailwind.css` switches off Tailwind's default palette (`bg-red-500` doesn't exist) so only token colours are available.

## Use

**Tailwind.** Token names without the group for sizes and spacing:

```tsx
<aside className="bg-panel rounded-panel shadow-panel p-panel-padding w-panel-width">
  <h2 className="text-title-panel font-title text-ink">Your pots</h2>
  <div className="h-row pl-row-left pr-row-right gap-row-gap rounded-row" />
</aside>
```

`color.muted` and `color.accent` have no utility because shadcn uses `muted` and `accent` for its own roles. Use shadcn's names, which point at our tokens in `globals.css`: `text-muted-foreground`, `bg-primary text-primary-foreground`. Tokens without a utility (opacity, border widths) work as `opacity-(--opacity-disabled)`, `border-(length:--border-line)`.

**CSS and CSS modules.**

```css
.row {
  height: var(--size-row);
  padding: 0 var(--space-row-right) 0 var(--space-row-left);
  border-radius: var(--radius-row);
  font: var(--type-ui-row);
}
```

**React Three Fiber.** The scene can't read CSS variables; it takes the same values from TS:

```ts
import { tokens } from "@/theme/tokens";

const t = tokens[mode]; // "day" | "night"
<meshStandardMaterial color={t.color.status.waiting} emissiveIntensity={t.scene.glow} />;
```

Sizes are numbers in px. Agent colours are `t.color.agent[1]` … `[8]`.

**xterm.js.** The terminal theme follows the window's sun/moon switch, not the mode:

```ts
import { typography, xtermTheme } from "@/theme/tokens";

const term = new Terminal({
  theme: xtermTheme[windowTerminal], // "light" | "dark"
  fontFamily: jetbrainsMono.style.fontFamily, // the next/font face; load it before term.open()
  fontSize: typography.mono.terminal.fontSize,
  lineHeight: typography.mono.terminal.lineHeight,
});
```

Put `.terminal-light` or `.terminal-dark` on the window, so the CSS around the terminal (`bg-terminal-bg`, …) matches.
