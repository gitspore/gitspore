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
| `layout wireframes` | Greyscale wireframes of the 19 states S01–S19 in `concept/v3_layout.html`, one 1440 × 900 frame each (the laptop size the layout limits are measured on), four per row. Under each frame: how you get there, what you see, the limit. Red marks a waiting agent or an error. Built by Claude on 2026-10-07. |

No tokens and no components yet.

## Rules for Claude sessions

- Reading any page is fine. Ask before drawing on a page, and never change `layout sketches`.
- Tokens, colours, typographies and components belong to the whole file. Ask before adding or changing them.
- Penpot holds the design values; the code takes them from there. No sync back from code to Penpot.
