# Penpot

Our design file is `gitspore_v01` in Penpot. Claude Code can read it and draw in it through the Penpot MCP server, so a session can see the designs and build wireframes without screenshots or descriptions.

We use the hosted server at `design.penpot.app`. Nothing runs locally. Set up on 2026-10-07.

## Setup, once per person

1. In Penpot, open **Your account → Integrations → MCP Server** and turn it on.
2. Copy the **complete server URL** from that panel. It already contains your key. Penpot has one key per account. If you already use the MCP server in another project, copy the existing URL. Generating a new key breaks the old connection.
3. In a terminal, outside any Claude chat, register the server in every folder you start Claude from:

   ```bash
   cd <repo root>
   claude mcp add penpot --scope local --transport http "PASTE_FULL_URL"

   cd project-management
   claude mcp add penpot --scope local --transport http "PASTE_FULL_URL"
   ```

   `--scope local` writes to `~/.claude.json`, outside the repo.

**The URL is a password.** Never commit it, never put it in `.mcp.json`, never paste it into a chat, a screenshot or an issue. If it leaks, regenerate the key in Penpot and run `claude mcp add` again with `--force`.

## Every session

1. Open `gitspore_v01` in the browser.
2. **File → MCP Server → Connect**. Keep the tab open; closing it or navigating away drops the connection.
3. Start Claude after that. Claude checks MCP servers only at startup, so a session started before the connection doesn't see Penpot. `claude mcp list` should show `penpot ✓ Connected`.

Chrome asks permission for the connection. Brave needs Shields off for the Penpot tab. Firefox works as is.

## What is in the file

| Page | Contents |
|---|---|
| `layout sketches` | Georgios's first layout sketch: seven frames at 1728 × 1117 (normal view, all minimised, tiled terminals, issues tab, issue selected). Source of `concept/v3_layout.html`. |
| `layout wireframes` | Greyscale wireframes of the 19 states S01–S19 in `concept/v3_layout.html`, one 1440 × 900 frame each (the laptop size the layout limits are measured on), four per row. Under each frame: how you get there, what you see, the limit. Red marks a waiting agent. Status uses the cozy-06 shapes: circle growing, triangle waiting, cross wilted, diamond review, flower merged. Every frame has the hotbar (keys 1–6 and 0, no tray) and the "1 waiting" badge, and the beetle is no longer on the rail. Built by Claude on 2026-10-07, brought up to cozy-06 the same day. |
| `cozy-06 ui` | proposal-cozy-06 in colour. S01 at 1440 × 900, day (bound to the tokens) and night (a frozen copy, see below), both built from the components. Below them, the main components with all their variants. Built by Claude on 2026-10-07. |

## Tokens, typographies, components

Three token sets, switched by the theme group `mode`:

| Set | Holds | Active in |
|---|---|---|
| `cozy-06/shared` | Radii, sizes, border widths, font families, plant and pot colours, both terminal palettes, the logo plate and body | `mode/day` and `mode/night` |
| `cozy-06/day` | Interface colours, status, agent colours 1–8, logo seam and leaf, the terminal in use, the glow opacity | `mode/day` |
| `cozy-06/night` | The same names with the night values | `mode/night` |

Switching the theme re-colours every shape bound to a token in the whole file. Penpot has no per-frame mode, so day and night can't both be live on one page. That is why S01 night is a frozen copy. To refresh it after a token change: delete it, switch to `mode/night`, duplicate S01 day, unlink its colour and opacity tokens (change each value and set it back), fix the sky gradient and the table by hand, switch back to `mode/day`.

Typographies sit in three groups, `title/` (Fredoka 600), `ui/` (Figtree) and `mono/` (JetBrains Mono), and take the name of where they appear: `title/panel`, `ui/row`, `mono/timer`.

Components on `cozy-06 ui`: `logo-mark` (style: plate, bare, slot), `logo-lockup`, `plant` (state × pot), `marker`, `growth-track`, `icon`, `button` (kind), `icon-button` (size 36 or 32), `wait-badge`, `count-badge`, `segmented-tabs` (active), `rail-bookmark` (state), `panel-row` (state, the waiting row is its own variant), `hotbar-slot` (state × selected), `notification`, `terminal-window`. Row stripes and the outline on the focused row are overrides on the instance. A layer named "(blinks)", "(wiggles)" or "(pulses)" carries the motion.

### Token names

Lowercase, dot-separated, kebab-case inside a segment: `<group>.<name>` or `<group>.<subgroup>.<name>`. The first segment is the kind: `color`, `radius`, `size`, `border`, `opacity`, `font`. A name never contains the mode; day and night share it.

- CSS: replace the dots with hyphens and prefix `--`. `color.panel-2` → `--color-panel-2`, `color.status.waiting` → `--color-status-waiting`, `radius.row-wait` → `--radius-row-wait`. Day values go on `:root`, night values under the app's night selector.
- R3F: the exported token JSON nests by the dots, so `tokens.color.status.waiting` or `tokens.color.pot.clay` goes straight into `new THREE.Color(...)` or a material's `color`. Sizes are plain numbers in px.
- Status tokens use the state names from the code: `working`, `waiting`, `error`, `review`, `merged`, `empty`. The words on screen ("growing", "wilted") are copy, not token names.
- Agent colours are numbered by slot: `color.agent.1` … `color.agent.8`.

## Rules for Claude sessions

- Reading any page is fine. Ask before drawing on a page, and never change `layout sketches`.
- Tokens, colours, typographies and components belong to the whole file. Ask before adding or changing them.
- Leave `mode/day` active when you finish, so S01 day and the components show day colours.
- Penpot holds the design values; the code takes them from there. No sync back from code to Penpot.
