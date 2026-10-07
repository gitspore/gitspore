# 0007: Penpot is the source of design values

- Status: proposed
- Date: 2026-10-07

## Context

Colours, sizes and components lived in several places: HTML studies, Markdown tables, the prototype. They drifted apart. Penpot supports design tokens with day and night themes, and Claude Code can read and draw in it through the Penpot MCP server.

## Decision

- The Penpot file `gitspore_v01` holds the tokens (sets `cozy-06/shared`, `cozy-06/day`, `cozy-06/night`), typographies and components.
- Visual changes happen in Penpot first. Then [components.md](../design/components.md) and the exported images are updated.
- Token names follow one rule (`color.status.waiting` → `--color-status-waiting` in CSS, `tokens.color.status.waiting` in R3F). The code takes the values from a Penpot export; nothing syncs back.

## Alternatives

- Tokens only in code. No visual overview for the design work.
- Figma. Equally capable; Penpot is open source, free for the whole team, and already set up with its MCP server.

## Consequences

- Once `apps/web` has the tokens, the code is the source for running values and `components.md` keeps only the guide.
- Penpot can't show day and night live on one page; the night frame of S01 is a copy that must be refreshed by hand.
- Everyone who works on design sets up the Penpot MCP server ([penpot.md](../design/penpot.md)).
