# Components and tokens

Status: proposed (visual direction cozy-06, [ADR 0006](../decisions/0006-visual-direction-cozy-06.md)).

How the interface looks and how to build it: the tokens, the type, the five agent states and every component with its size, tokens and variants. Where each component appears and when is in [layout.html](layout.html). All of it runs in [prototype.html](prototype.html).

**Penpot is the source** (file `gitspore_v01`, see [penpot.md](penpot.md)). If this file and Penpot disagree, Penpot is right; fix this file. This file doesn't list values. [tokens.html](tokens.html) has every token with its day and night value, CSS variable, Tailwind class and TS path. The script generates it from the Penpot copy in `apps/web/src/theme/` ([ADR 0008](../decisions/0008-generated-theme-files.md)).

## Tokens

### Names

Lowercase, dot-separated, kebab-case inside a segment: `<group>.<name>` or `<group>.<subgroup>.<name>`. The first segment is the kind: `color`, `space`, `size`, `radius`, `border`, `shadow`, `opacity`, `font`. A name never contains the mode; day and night share it.

- **CSS:** dots become hyphens, prefix `--`. `color.panel-2` → `--color-panel-2`, `space.button.x` → `--space-button-x`. Day values on `:root`, night values under `.dark`.
- **Tailwind:** the same names without the group for sizes and spacing: `bg-panel`, `text-status-waiting`, `rounded-row`, `shadow-window`, `h-button`, `px-button-x`, `gap-row-gap`, `text-ui-row`. `color.muted` and `color.accent` have no utility because shadcn uses those names: `text-muted-foreground`, `bg-primary`.
- **TS (R3F, xterm):** `tokens[mode]` nests by the dots: `tokens.night.color.status.waiting`, `tokens.day.size.row` (a number in px). `xtermTheme.light` / `.dark` and `typography.mono.terminal` are ready to pass to xterm.js.
- **Spacing** is named per component, and the last segment is the CSS property: `space.button.x` (padding left and right), `space.row.left`, `space.notification.title-gap` (a margin). `space.layout.*` are the distances to the screen edge.
- **Status tokens** use the state names from the code: `working`, `waiting`, `error`, `review`, `merged`, `empty`. The words on screen ("growing", "wilted") are copy, not token names.
- **Agent colours** are numbered by slot: `color.agent.1` … `color.agent.8`.

Penpot has three token sets: `cozy-06/shared` (both modes), `cozy-06/day` and `cozy-06/night` (same names, different values), switched by the theme group `mode`.

### Groups

| Group | Holds |
|---|---|
| `color.*` | interface colours, `status.*`, `agent.1`–`8`, `branch-main`, issue paper (`paper`, `paper-line`, `paper-ink`), `focus`, `backdrop` |
| `color.terminal.*` | the terminal in use: light by day, dark at night; a window's sun/moon switch overrides it with `.terminal-light` / `.terminal-dark` |
| `color.terminal-light.*`, `-dark.*` | the two terminal palettes: background, text, the colours Claude Code's output uses, 16 ANSI colours, cursor, selection |
| `color.plant.*`, `color.pot.*` | the colours of the 2D plant icons (`plantSvg()`); the 3D scene uses `scene.json` |
| `color.logo.*` | the beetle on and off its plate |
| `space.*`, `size.*`, `radius.*`, `border.*` | spacing per component, fixed sizes, corner radii, line widths, all in px |
| `shadow.*` | panel, window, hotbar, notification, bookmark; warm by day, black at night |
| `opacity.*` | agent circle, empty track square, logo glow, `disabled` (.45), `window-unfocused` (.35) |
| `font.*` | `title` Fredoka, `ui` Figtree, `mono` JetBrains Mono |
| 3D (`scene.json`) | sky, fog, floor, frame, glass, foliage, wood, soil, pot, leaves and stems with the three waiting stages, lights, name tag, seed packet, and the renderer numbers |

The terminal sizes are measured, not estimated: JetBrains Mono 13 px is 7.8 px per column in xterm.js, line height 1.2 gives 20 px per row, the screen has 12 px padding top and bottom and 10 px left and right, and addon-fit reserves 14 px for the scrollbar. So 80 columns need `size.terminal-min-width` (660 px).

## Type

| Token | Font | Use |
|---|---|---|
| `font.title` | Fredoka 600 | logo wordmark, panel titles ("Your pots"), notification titles |
| `font.ui` | Figtree 400–800 | everything else in the interface |
| `font.mono` | JetBrains Mono | terminal (13 px, line height 1.2), timers, hotbar key numbers |

Penpot typographies are named by where they appear: `title/panel`, `ui/row`, `mono/timer`. All 17 with size, weight and line height are in [tokens.html](tokens.html#typography). In CSS `font: var(--type-ui-row)`, in Tailwind `text-ui-row font-ui`, in TS `typography.ui.row`.

## The five states

Each state has a plant, a colour, a word, a growth stage and a shape, so none depends on colour alone. Waiting is the only red.

| State (code) | Plant | Word | Growth track (5 squares) | Shape |
|---|---|---|---|---|
| `working` | sprout with two leaves | growing | 3 filled | circle |
| `waiting` | drooping, yellowed | the timer (`0:43`) | 3 filled, the third blinks | triangle |
| `error` | grey bare stalk | wilted | 3 filled, grey | cross |
| `review` | closed yellow bud | review | 4 filled | diamond |
| `merged` | pink bloom | merged | 5 filled | five-dot flower |
| `empty` | none, dashed circle | pick an issue | none | dashed circle |

Where status shows: the panel row, the hotbar slot, the pot rim and name tag in the scene, the "waiting" badge in the top bar, the notification.

## Components

The Penpot name comes first, the code name second. Sizes in px at a 1440 × 900 screen.

### Shell

**`logo-lockup` / `Logo`.** Beetle on the plate (`size.logo-plate`, `radius.logo-plate`, `color.logo.plate`) plus "gitspore" in `font.title`, always lowercase. At night the seam glows (`color.logo.seam`, `color.logo.glow`, `opacity.logo-glow`). Variants of `logo-mark`: `plate`, `bare` (no plate), `slot` (in the hotbar). SVG source below.

**`TopBar`.** Height `size.top-bar`, background `color.panel`. Left: logo. Then the focused agent's issue and branch (`font.ui`, issue in 700). Right: `wait-badge`, two `usage-meter`s for the plan limits ("5 h" and "week"), connection status (see States) and vitality in `color.muted`, help and settings as `icon-button`. No repo name.

**`wait-badge` / `WaitBadge`.** "1 waiting", uppercase, `color.wait` with `color.wait-ink`, `radius.badge`. A square dot blinks. Hidden when nothing waits.

**`rail-bookmark` / `RailBookmark`.** Tabs on the left edge: `size.bookmark-width` × `size.bookmark-height`, open one `size.bookmark-width-open` in `color.accent`, others `color.plate` with `color.plate-ink` icons. Right corners `radius.bookmark`. Variant `state`: closed, open. `count-badge` on the agents bookmark shows the waiting count. Buttons: Agents, Issues, Branches, scene/focus.

**`count-badge` / `CountBadge`.** `size.count-badge` square, `radius.badge`, `color.wait` with `color.wait-ink`, `ui/count`, a 2 px (`border.line`) ring in `color.panel`. It sits `space.count-badge.outside` outside the top-right corner of the agents bookmark.

### Side panel

**`SidePanel`.** `size.panel-width`, `radius.panel`, `color.panel`, soft shadow, no border. Title in `font.title` ("Your pots") with the close button on the right; below it, aligned left, the count in `ui/meta` `color.muted` ("5 of 6 planted"). Optional: the project's token total on the same line ("5 of 6 planted · 20.8M tokens"), see Usage.

**`segmented-tabs` / `SegmentedTabs`.** Track `color.panel-2`, `radius.tab-track`; tabs `size.tab` high, `radius.tab`; active tab `color.plate` with `color.plate-ink`. Agents · Issues · Branches.

**`panel-row` / `AgentRow`.** `size.row`, `radius.row`. Plant (`size.plant-in-row`) in a circle (`size.plant-circle`) filled with the agent colour at `opacity.agent-circle`, then the name, the status word in `color.muted` (error in its status colour) and the growth track. Odd rows `color.hover`. The focused agent's row has a 2 px `color.line` outline. Variant `state`: one per state. The `waiting` variant is `size.row-wait` high, `radius.row-wait`, filled `color.wait`, the timer in `font.mono` instead of the word, and the plant wiggles. Rows stay in slot order.

**`growth-track`.** Five squares, `size.track-square`, `radius.track`, filled in the status colour, empty ones at `opacity.track-empty`.

**`marker`.** The status shape, `size.marker`, in the status colour.

**`IssueRow`, `BranchesTab`.** Specified in [layout.html](layout.html) (S09, S11), not yet in Penpot. `BranchesTab` uses the `commit-graph` package; gotchas:

- Add `"overrides": { "react": "$react", "react-dom": "$react-dom" }` to the root `package.json`, or npm installs a second React 18.
- It colours lanes by position, not by branch name. Pass the agent colours in lane order through a small adapter.
- Its CSS is light-only. Night mode needs override CSS.
- `package.json` says MIT, `LICENSE` says Apache 2.0. Both are fine.

### Main area

**`terminal-window` / `TerminalWindow`.** A card: `radius.terminal`, 2 px `color.line` outline, no other frame. Header `size.terminal-header` in `color.panel` with a 2 px `color.line` underneath: status dot, issue and branch, a `usage-meter` for the agent's context with its token count ("context 22 % · 701k tokens"), the sun/moon switch, then the window buttons (minimise, focus this, maximise, close, ⋯) as `icon-button` at `size.window-button`, `radius.window-button`. Body: xterm.js with `typography.mono.terminal` and `xtermTheme`. The screen has 12 px padding top and bottom, 10 px left and right (`space.terminal.screen-y`, `-x`). A tile is at least `size.terminal-min-width` (660 px) wide, so 80 columns fit; the number of rows follows from the layout state. Focused and unfocused windows and the dark terminal: see States.

**`hotbar-slot` / `HotbarSlot`, in `Hotbar`.** The hotbar sits at the bottom centre of the main area: `color.panel`, `radius.hotbar`. Slots 1–6 (pots) and 0 (overview, after a `color.line` separator): `size.hotbar-slot`, `radius.slot`, `color.panel-2`. Each shows the plant (`size.plant-in-slot`), the key number in `font.mono`, the marker top right and the agent colour as a `size.agent-band` band at the bottom. A minimised window shows as a mark at the top of its slot. Variants `state` × `selected`: selected has a `border.selected` outline in `color.accent`; `waiting` is filled `color.wait`, shows the seconds and bobs.

**`notification` / `Notification`.** Bottom right, `color.wait`, `radius.notification`, `font.title` heading. Buttons Open beside (primary) and Open, plus close. Stays until the agent no longer waits, never takes keyboard focus, nudges sideways every 2.4 s.

**`button`, `icon-button`.** Button `size.button`, `radius.button`, `ui/button`, padding `space.button.x`, gap `space.button.gap`. Five kinds:

| Kind | Fill | Text | Outline | Where |
|---|---|---|---|---|
| `primary` | `color.accent` | `color.accent-ink` | none | the main action |
| `secondary` | `color.hover` | `color.ink` | none | every other action |
| `on-wait` | none | `color.wait-ink` | 2 px (`border.line`) `color.wait-ink` | notification ("Open") |
| `primary-on-wait` | `color.accent` | `color.accent-ink` | 2 px `color.wait-ink` | notification ("Open beside") |
| `destructive` | `color.ink` | `color.panel` | none | the confirm button of the stop-agent and delete-worktree dialogs |

Red means only "needs you" ([ADR 0006](../decisions/0006-visual-direction-cozy-06.md)), so destructive actions are ink, not red. The button that opens the confirm dialog is `secondary` and says what it does ("Stop agent"); only the confirm button is `destructive`.

Icon button `size.icon-button`, `radius.icon-button`, `color.hover` fill, no border. In window headers it is `size.window-button`, `radius.window-button`, with no fill until hovered. Icons `size.icon`.

shadcn names: `primary` is `default`, the header icon button is `ghost`. `outline` and `link` are not used.

### Usage

Token usage, from Claude Code ([ADR 0009](../decisions/0009-show-token-usage.md)). Numbers in `font.mono` 700, labels in `ui/meta`.

**`usage-meter` / `UsageMeter`.** Variants `kind` (limit, context) × `state` (normal, warn, full). A label in `ui/meta`, a bar (`size.meter-width` × `size.meter-height`, track `color.panel-2`, fill `color.line`, round ends), the percentage, and an optional token count. From 80 % the fill is `color.status.review`. At 100 % label, fill and number are `color.wait`, followed by the reset time ("100 % · 14:30"). The whole meter has the hover of an unfilled button and opens a `usage-tip` on hover and on keyboard focus.

| Where | Label | Value | `usage-tip` shows |
|---|---|---|---|
| top bar | "5 h", "week" | share of the plan's 5-hour and 7-day limit | used, reset time, tokens of the running agents; at 100 % "All agents are paused until the reset." |
| window header | "context" | how full the agent's context is, then "· 701k tokens" | input, output, cache read, cache write, total, context used, model; "Most of it is cache reads." |
| panel title (optional) | none | "20.8M tokens" for the project | running agents, finished agents, total; where the number comes from |

The plan limits apply to the whole Claude account, so they also count sessions outside gitspore; the tip says so. No money amounts: with a Pro or Max plan the user doesn't pay per token.

**`usage-tip`.** A popover: `color.panel`, `radius.notification`, `shadow.panel`, padding `space.notification.y` `space.notification.x`. Width 260. Title in `ui/row`, rows with the label in `ui/meta` on the left and the number in `mono/key` on the right, a 1 px `color.panel-2` line above the total (in `ui/row`), a note in `ui/small` `color.muted`. It never takes focus.

### States

**Hover.** A filled button (`primary`, `primary-on-wait`, `destructive`) mixes 20 % of the surface it sits on into its fill: `color-mix(in srgb, var(--color-accent) 80%, var(--color-panel))`, with `--color-wait` on the notification. It gets lighter by day and darker at night. Anything without a fill of its own (`secondary`, icon buttons, `on-wait`) gets its text colour at 12 % as the fill: `color-mix(in srgb, var(--color-ink) 12%, transparent)`, `--color-wait-ink` on the notification. Rows and slots use the same rule. A disabled element has no hover.

**Disabled.** The whole element at `opacity.disabled`, `cursor: not-allowed`.

**Keyboard focus.** An outline of `border.focus` in `color.focus`, offset `space.focus.offset`, on `:focus-visible` only (never after a mouse click). On buttons, icon buttons, rows, hotbar slots, bookmarks and tabs. The terminal has no ring; the window outline shows where typing goes.

**`terminal-window`.** Focused: 2 px `color.line` outline. Unfocused: the same outline at `opacity.window-unfocused` (`color-mix(in srgb, var(--color-line) 35%, transparent)`). The dark terminal (`.terminal-dark` on the body) changes only the body; header and outline stay.

**`rail-bookmark`.** On hover a closed bookmark widens from `size.bookmark-width` to `size.bookmark-width-hover` (width transition 0.15 s), icon in `color.plate-ink`. The open one doesn't change.

**Connection status.** In the top bar: a `size.status-dot` dot and a word in `ui/meta`.

| State | Dot | Word |
|---|---|---|
| `online` | `color.status.working` | "online", `color.muted` |
| `reconnecting` | `color.muted`, blinks | "reconnecting…", `color.muted` |
| `offline` | `color.wait` | "offline", `color.wait` |

Offline is red because you have to act (start the daemon). The offline dialog opens and the rest of the app drops to `opacity.disabled`.

**Dialog backdrop.** `color.backdrop` covers the screen behind the confirm and offline dialogs: warm ink at 25 % by day, black at 50 % at night.

### Motion

| Name | Where | What |
|---|---|---|
| wiggle | waiting plant (row and scene) | rotation ±8°, 0.7 s |
| bob | waiting hotbar slot | up 6 px, 1.1 s |
| blink | wait-badge dot, current growth square | opacity, 1 s steps |
| nudge | notification | sideways shake every 2.4 s |
| pulse | waiting pot rim in the scene | glow in and out |

All motion stops under `prefers-reduced-motion`. In Penpot a layer named "(wiggles)", "(blinks)" or "(pulses)" carries it.

## Logo source

The agent beetle seen from above. The seam between the wing cases is one line that splits and joins again: a branch and its merge.

```svg
<svg viewBox="0 0 32 32"><!-- BODY, SEAM, SEP (= background behind the head), LEAF -->
  <path d="M7.5 15.5 L4 13.5 M7 22.5 L3.5 24 M24.5 15.5 L28 13.5 M25 22.5 L28.5 24" stroke="BODY" stroke-width="2.2" stroke-linecap="round" fill="none"/>
  <ellipse cx="16" cy="19.5" rx="9.5" ry="10.5" fill="BODY"/>
  <ellipse cx="16" cy="7.4" rx="4.3" ry="3.4" fill="BODY" stroke="SEP" stroke-width="1.6"/>
  <path d="M17 4.4 C18 1.8 21.4 .9 24.4 1.7 C22.7 4.1 20 5.2 17 4.4Z" fill="LEAF"/>
  <path d="M16 11.6 C12.4 15 12.4 23.6 16 27.6 C19.6 23.6 19.6 15 16 11.6Z" fill="SEAM"/>
</svg>
```

On the plate: BODY `color.logo.body`, SEAM `color.logo.seam`, LEAF `color.logo.leaf`. Without plate: `color.logo.bare-body`, `-bare-seam`, `-bare-leaf`.

## Open

- Fredoka or Figtree for the name tags in the scene (Fredoka may blur at small sizes).
- Whether a merged pot stays in the list or empties at once.
- `IssueRow`, `IssueSheet`, `BranchesTab`, and the connect screen are not yet components in Penpot.
- The project's token total is optional. Claude Code deletes session logs after 30 days by default, so the daemon would keep its own running total per repo.
- The ANSI colours: all 16 per terminal reach 4.5 : 1, so `white` is dark on the light terminal and `black` light on the dark one. If programs that paint black or white backgrounds (inverse bars) look wrong, change `ansi.white` and `ansi.bright-white` (light) and `ansi.black` (dark) back ([ADR 0008](../decisions/0008-generated-theme-files.md)). Check with real Claude Code output in #11.
