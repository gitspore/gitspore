# Penpot

Our design file is `gitspore_v01` in Penpot. Claude Code can read it and draw in it through the Penpot MCP server, so a session can see the designs and build wireframes without screenshots or descriptions.

We use the hosted server at `design.penpot.app`. Nothing runs locally. Set up on 2026-10-07.

## Setup, once per person

1. In Penpot, open **Your account → Integrations → MCP Server** and turn it on.
2. Copy the **complete server URL** from that panel. It already contains your key. Penpot has one key per account. If you already use the MCP server in another project, copy the existing URL. Generating a new key breaks the old connection.
3. In a terminal, outside any Claude chat, register the server in the repo root (and in any other folder you start Claude from):

   ```bash
   cd <repo root>
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
| `layout sketches` | Georgios's first layout sketch: seven frames at 1728 × 1117 (normal view, all minimised, tiled terminals, issues tab, issue selected). Source of `layout.html`. |
| `layout wireframes` | Greyscale wireframes of the 19 states S01–S19 in `layout.html`, one 1440 × 900 frame each (the laptop size the layout limits are measured on), four per row. Under each frame: how you get there, what you see, the limit. Red marks a waiting agent. Status uses the cozy-06 shapes: circle growing, triangle waiting, cross wilted, diamond review, flower merged. Every frame has the hotbar (keys 1–6 and 0, no tray) and the "1 waiting" badge, and the beetle is no longer on the rail. Built by Claude on 2026-10-07, brought up to cozy-06 the same day. |
| `cozy-06 ui` | proposal-cozy-06 in colour. S01 at 1440 × 900, day (bound to the tokens) and night (a frozen copy, see below), both built from the components. Below them, the main components with all their variants. Built by Claude on 2026-10-07. |

## Tokens, typographies, components

Four token sets, switched by the theme group `mode`. The layers, names and units are in [components.md](components.md#tokens) and [ADR 0010](../decisions/0010-token-layers-and-base-scales.md).

| Set | Holds | Active in |
|---|---|---|
| `cozy-06/base` | The only raw interface values: the palette (`palette.*`) and the spacing, size, radius and opacity scales (`space.N`, `size.N`, `radius.*`, `opacity.N`) | `mode/day` and `mode/night` |
| `cozy-06/shared` | Font families, border widths, the semantic opacities, the mode-free interface colours (`plate`, `plate-ink`, `accent`, `accent-ink`, `wait-ink`, `focus`), the component handles (`size.row`, `space.layout.edge`, …), and the mode-free content colours: `color.art.plant.*`, `color.art.pot.*`, `color.art.logo.leaf` and both terminal palettes `color.xterm.light.*` and `color.xterm.dark.*` | `mode/day` and `mode/night` |
| `cozy-06/day` | Interface colours that change with the mode, status, agent colours 1–6, main branch, issue paper, backdrop, logo seam and glow, `shadow.sm` and `shadow.lg` | `mode/day` |
| `cozy-06/night` | The same names with the night values | `mode/night` |

Interface tokens in `shared`, `day` and `night` point into `cozy-06/base`; only the content groups (`color.agent.*`, `color.art.*`, `color.xterm.*`), shadows, borders, fonts and three handles (`size.panel-width`, `size.terminal-min-width`, `space.focus-offset`) hold raw values. `npm run tokens` fails on any other raw value.

Switching the theme re-colours every shape bound to a token in the whole file. Penpot has no per-frame mode, so day and night can't both be live on one page. That is why S01 night is a frozen copy. Apart from the 3D placeholder, all its parts (`top-bar`, `rail`, `side-panel`, `terminal-window`, `hotbar`, `notification`) are instances of the same components as in S01 day, with the night colours as overrides, so a change to their structure reaches both screens; colours on new parts must be set to the night values by hand. The terminal body is bound to `color.xterm.light.*` in S01 day; in the night copy its colours must be the `color.xterm.dark.*` values. To refresh the whole copy after a token change: delete it, switch to `mode/night`, duplicate S01 day, unlink its colour and opacity tokens (change each value and set it back), fix the sky gradient and the table by hand, switch back to `mode/day`. Then check the copy: the window's sun/moon switch must show the moon and "dark", the terminal must use the `color.xterm.dark.*` colours, and the "● " bullets in the terminal can shrink when their tokens are unlinked (set them back to 16 px wide).

Typographies sit in three groups, `title/` (Fredoka 600), `ui/` (Figtree) and `mono/` (JetBrains Mono), and take the name of where they appear: `title/panel`, `ui/row`, `mono/timer`.

Components on `cozy-06 ui`: `logo-mark` (style: plate, slot), `logo-lockup`, `plant` (state × pot), `marker`, `growth-track`, `icon`, `button` (kind), `icon-button` (size 36 or 32), `wait-badge`, `count-badge`, `segmented-tabs` (active), `rail-bookmark` (state), `panel-row` (state, the waiting row is its own variant), `hotbar-slot` (state × selected), `notification`, `terminal-window`. Row stripes and the outline on the focused row are overrides on the instance. A layer named "(blinks)", "(wiggles)" or "(pulses)" carries the motion.

Token names and how CSS, Tailwind and R3F use them: [components.md](components.md#tokens). All values: [tokens.html](tokens.html).

Bound to tokens on `cozy-06 ui`: fills, strokes, radii and sizes, the shadows (`shadow.lg` on the side panel, window, hotbar, notification, popovers and dialogs, `shadow.sm` on the bookmarks) and the padding, gaps and margins of every component with a layout. Padding, margin and gap bind a base step (`space.1` … `space.6`), radii a base radius, sizes a base size or one of the kept handles (`size.row`, `size.top-bar`, …). A new component binds base tokens; it gets a token of its own only when code or a layout rule needs a handle. Spacing that is placed by hand (the rail, the distances to the screen edge) has no binding; the screen edge distance is `space.layout.edge`. Shapes inside the plant and icon drawings keep their own radii; they are illustration.

## Change a token

The repo keeps a copy of the tokens in `apps/web/src/theme/tokens.json` and generates the theme files from it ([ADR 0008](../decisions/0008-generated-theme-files.md)). A change goes Penpot → copy → generated files, never the other way.

1. Change or add the token in Penpot, in the right set: a raw interface value in `cozy-06/base`, a token both modes share in `cozy-06/shared`, otherwise the same name in `cozy-06/day` and `cozy-06/night`, pointing into base. Bind it to the shapes that use it. For a new spacing, size or radius, bind a base token rather than add a component token.
2. In a Claude session with the Penpot MCP server connected, run the `tokens-update` skill. It dumps the four sets into `tokens.json` (and the typographies into `typography.json` if they changed), runs `npm run tokens`, and checks that `git diff apps/web/src/theme/tokens.json` shows only your change.
3. Look at [tokens.html](tokens.html), then commit the JSON and the generated files together.

Without the skill: dump the sets by hand, run `npm run tokens`, check the diff. Never edit `tokens.css`, `tailwind.css`, `tokens.ts` or `tokens.html`; CI fails if they don't match the JSON. The 3D values are not in Penpot: change them in `apps/web/src/theme/scene.json` and run `npm run tokens`.

Penpot's own token import replaces the whole catalogue; don't use it to sync, bindings may not survive.

## Rules for Claude sessions

- Reading any page is fine. Ask before drawing on a page, and never change `layout sketches`.
- Tokens, colours, typographies and components belong to the whole file. Ask before adding or changing them.
- Leave `mode/day` active when you finish, so S01 day and the components show day colours.
- Penpot holds the design values; the code takes them from there. No sync back from code to Penpot.
