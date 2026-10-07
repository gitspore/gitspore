# Components and tokens

Status: proposed (visual direction cozy-06, [ADR 0006](../decisions/0006-visual-direction-cozy-06.md)). Values copied from Penpot on 2026-10-07.

How the interface looks and how to build it: the tokens, the type, the five agent states and every component with its size, tokens and variants. Where each component appears and when is in [layout.html](layout.html). All of it runs in [prototype.html](prototype.html).

**Penpot is the source** (file `gitspore_v01`, see [penpot.md](penpot.md)). If this file and Penpot disagree, Penpot is right; fix this file. Once `apps/web` defines the tokens in code, the code becomes the source and the value tables here go; the rest of this file stays as the guide.

## Tokens

### Names

Lowercase, dot-separated, kebab-case inside a segment: `<group>.<name>` or `<group>.<subgroup>.<name>`. The first segment is the kind: `color`, `radius`, `size`, `border`, `opacity`, `font`. A name never contains the mode; day and night share it.

- **CSS:** dots become hyphens, prefix `--`. `color.panel-2` → `--color-panel-2`, `color.status.waiting` → `--color-status-waiting`. Day values on `:root`, night values under the app's night selector.
- **R3F:** the exported token JSON nests by the dots: `tokens.color.status.waiting` or `tokens.color.pot.clay` goes straight into `new THREE.Color(...)`. Sizes are numbers in px.
- **Status tokens** use the state names from the code: `working`, `waiting`, `error`, `review`, `merged`, `empty`. The words on screen ("growing", "wilted") are copy, not token names.
- **Agent colours** are numbered by slot: `color.agent.1` … `color.agent.8`.

Penpot has three token sets: `cozy-06/shared` (both modes), `cozy-06/day` and `cozy-06/night` (same names, different values), switched by the theme group `mode`.

### Interface colours

| Token | Day | Night | Used for |
|---|---|---|---|
| `color.panel` | `#ece6d6` | `#1d2621` | side panel, top bar, terminal header, hotbar |
| `color.panel-2` | `#ddd4bf` | `#26332c` | tab track, hotbar slots |
| `color.ink` | `#2a2119` | `#f3e7cf` | text |
| `color.muted` | `#6b5a44` | `#bba98b` | secondary text, status words |
| `color.line` | `#2f5446` | `#9cc2ad` | 2 px lines: terminal outline and header, hotbar separator |
| `color.plate` | `#2f5446` | `#2f5446` | logo plate, rail bookmarks, active tab |
| `color.plate-ink` | `#f6eedb` | `#f3ead6` | text and icons on `plate` |
| `color.accent` | `#e8b04a` | `#e8b04a` | open bookmark, selected hotbar slot, primary button |
| `color.accent-ink` | `#2a2119` | `#2a2119` | text on `accent` |
| `color.hover` | `rgba(47,84,70,.08)` | `rgba(156,194,173,.08)` | hover, odd rows, icon buttons |
| `color.wait` | `#b3372a` | `#c4402f` | waiting row, wait badge, notification, waiting hotbar slot |
| `color.wait-ink` | `#fff3e8` | `#fff3e8` | text on `wait` |
| `color.sky-top` / `color.sky-bottom` | `#f6ead1` / `#e2c796` | `#2a3047` / `#12151f` | gradient behind the scene |

### Status colours

| Token | Day | Night |
|---|---|---|
| `color.status.working` | `#4f9a45` | `#7cc96b` |
| `color.status.waiting` | `#b3372a` | `#ff6a50` |
| `color.status.error` | `#8a8277` | `#9a948a` |
| `color.status.review` | `#d99a1e` | `#f5bd3c` |
| `color.status.merged` | `#c2458e` | `#ff6fc0` |
| `color.status.empty` | `{color.muted}` | `{color.muted}` |

### Agent colours

Eight per mode, cool hues plus ink and umber, so none reads as a status. Every pair is at least 22 ΔE apart (CIELAB), every colour at least 25 ΔE from the status colours.

| Slot | Day | Night |
|---|---|---|
| `color.agent.1` blue | `#2f6db3` | `#4f86de` |
| `color.agent.2` sky | `#7ab6e6` | `#a9d6f5` |
| `color.agent.3` navy | `#1c2a55` | `#2f3f8f` |
| `color.agent.4` teal | `#168a8f` | `#3fc1c4` |
| `color.agent.5` violet | `#6a4cc2` | `#8d6ff0` |
| `color.agent.6` lavender | `#b7a3e6` | `#d6c8fa` |
| `color.agent.7` ink | `#2b2622` | `#f1ebe0` |
| `color.agent.8` umber | `#6b4a2e` | `#b88a62` |

### Terminal

Light by day, dark at night. The sun/moon switch in each window's header overrides the mode for that window. `color.terminal.*` points to `color.terminal-light.*` in day mode and to `color.terminal-dark.*` in night mode.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `color.terminal.bg` | `#fbf7ec` | `#171916` | background |
| `color.terminal.fg` | `#2a2119` | `#e4e0d4` | text |
| `color.terminal.dim` | `#857862` | `#8d9085` | tool results, hints |
| `color.terminal.prompt` | `#b24f22` | `#e8956b` | tool call bullets, prompt |
| `color.terminal.ok` | `#3d7a37` | `#9fc98a` | input line, success |
| `color.terminal.question` / `-bg` | `#8a5b00` on `#f2e3c0` | `#e9c46a` on `#2a2c25` | the selected answer |
| `color.terminal.box` | `#5e7189` | `#a9b5c9` | the question box |
| `color.terminal.error` | `#b3372a` | `#ff6a50` | errors |

### Scene colours (shared by both modes)

| Token | Value | | Token | Value |
|---|---|---|---|---|
| `color.plant.leaf` | `#79c05a` | | `color.plant.bud` | `#e8b04a` |
| `color.plant.stem` | `#3f7a2c` | | `color.plant.bud-line` | `#8a5b00` |
| `color.plant.droop-leaf` | `#c4b54e` | | `color.plant.petal` | `#f4a6c4` |
| `color.plant.droop-stem` | `#6d7a2c` | | `color.plant.heart` | `#ffd166` |
| `color.plant.bare` | `#8a8277` | | `color.pot.clay` | `#c8693d` |
| `color.pot.line` | `#5a2e15` | | `color.pot.empty` | `#c88b62` |

### Radii, sizes, borders, opacity

| Token | Value | | Token | Value |
|---|---|---|---|---|
| `radius.panel` | 12 | | `size.top-bar` | 56 |
| `radius.tab-track` / `radius.tab` | 8 / 5 | | `size.panel-width` | 400 |
| `radius.row` / `radius.row-wait` | 8 / 10 | | `size.tab` | 38 |
| `radius.badge` / `radius.tag` | 5 / 2 | | `size.row` / `size.row-wait` | 52 / 76 |
| `radius.button` / `radius.icon-button` | 6 / 7 | | `size.plant-circle` / `size.plant-in-row` | 38 / 30 |
| `radius.terminal` / `radius.window-button` | 12 / 6 | | `size.button` / `size.icon-button` / `size.icon` | 40 / 36 / 20 |
| `radius.hotbar` / `radius.slot` | 14 / 10 | | `size.terminal-header` / `size.window-button` | 42 / 32 |
| `radius.bookmark` | 9 (right corners only) | | `size.hotbar-slot` / `size.plant-in-slot` | 68 / 46 |
| `radius.notification` | 10 | | `size.marker` / `size.agent-band` | 13 / 4 |
| `radius.track` / `radius.logo-plate` | 2 / 8 | | `size.bookmark-width` / `-open` / `-height` | 58 / 72 / 52 |
| `border.line` / `border.selected` | 2 / 3 | | `size.logo-plate` / `size.logo` | 32 / 25 |
| `opacity.agent-circle` | 0.33 | | `size.track-square` | 8 |
| `opacity.track-empty` | 0.55 | | `opacity.logo-glow` | 0 day, 1 night |

## Type

| Token | Font | Use |
|---|---|---|
| `font.title` | Fredoka 600 | logo wordmark, panel titles ("Your pots"), notification titles |
| `font.ui` | Figtree 400–800 | everything else in the interface |
| `font.mono` | JetBrains Mono | terminal (13 px), timers, hotbar key numbers |

Penpot typographies are named by where they appear: `title/panel`, `ui/row`, `mono/timer`.

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

**`TopBar`.** Height `size.top-bar`, background `color.panel`. Left: logo. Then the focused agent's issue and branch (`font.ui`, issue in 700). Right: `wait-badge`, online status and vitality in `color.muted`, help and settings as `icon-button`. No repo name.

**`wait-badge` / `WaitBadge`.** "1 waiting", uppercase, `color.wait` with `color.wait-ink`, `radius.badge`. A square dot blinks. Hidden when nothing waits.

**`rail-bookmark` / `RailBookmark`.** Tabs on the left edge: `size.bookmark-width` × `size.bookmark-height`, open one `size.bookmark-width-open` in `color.accent`, others `color.plate` with `color.plate-ink` icons. Right corners `radius.bookmark`. Variant `state`: closed, open. `count-badge` on the agents bookmark shows the waiting count. Buttons: Agents, Issues, Branches, scene/focus.

### Side panel

**`SidePanel`.** `size.panel-width`, `radius.panel`, `color.panel`, soft shadow, no border. Title in `font.title` ("Your pots"), count on the right in `color.muted`.

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

**`terminal-window` / `TerminalWindow`.** A card: `radius.terminal`, 2 px `color.line` outline, no other frame. Header `size.terminal-header` in `color.panel` with a 2 px `color.line` underneath: status dot, issue and branch, the sun/moon switch, then the window buttons (minimise, focus this, maximise, close, ⋯) as `icon-button` at `size.window-button`, `radius.window-button`. Body: xterm.js in `font.mono` 13 px with the `color.terminal.*` colours. The screen inside must stay at least 650 × 350 px (80 columns, 20 rows).

**`hotbar-slot` / `HotbarSlot`, in `Hotbar`.** The hotbar sits at the bottom centre of the main area: `color.panel`, `radius.hotbar`. Slots 1–6 (pots) and 0 (overview, after a `color.line` separator): `size.hotbar-slot`, `radius.slot`, `color.panel-2`. Each shows the plant (`size.plant-in-slot`), the key number in `font.mono`, the marker top right and the agent colour as a `size.agent-band` band at the bottom. A minimised window shows as a mark at the top of its slot. Variants `state` × `selected`: selected has a `border.selected` outline in `color.accent`; `waiting` is filled `color.wait`, shows the seconds and bobs.

**`notification` / `Notification`.** Bottom right, `color.wait`, `radius.notification`, `font.title` heading. Buttons Open beside (primary) and Open, plus close. Stays until the agent no longer waits, never takes keyboard focus, nudges sideways every 2.4 s.

**`button`, `icon-button`.** Button `size.button`, `radius.button`; kind `primary` (`color.accent` with `color.accent-ink`) or `secondary` (outline). Icon button `size.icon-button` (or `size.window-button` in window headers), `radius.icon-button`, `color.hover` fill, no border; icons `size.icon`.

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
- `IssueRow`, `IssueSheet`, `BranchesTab` and the connect screen are not yet components in Penpot.
