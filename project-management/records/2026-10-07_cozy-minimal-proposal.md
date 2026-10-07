# 2026-10-07: Cozy minimal proposal (cozy-06)

Ticket: #1 (GSP-1). Process record.

## What happened

Georgios explored logos, brand directions and interface variants for the cozy greenhouse style in pages outside the repo: four logo directions (sprouting wordmark, enamel badge, spore, beetle), then two rounds of cozy interface studies (paper and wood, enamel, enamel slim, minimal). The last round combined the beetle logo, the Fredoka font from the spore direction and squarer corners, and compared six ways to show agent status.

## What we did

- Wrote proposal-cozy-06 in `research/inspiration/aesthetics.md`: logo (with SVG source), type, colour tokens, the five states and where each shows, shapes and sizes, motion.
- Added the interface study `research/inspiration/renders/cozy-06-minimal.html` (our own work). It also holds the rejected Enamel variant and the comparison of status options.

## Proposed, not decided

- cozy-06 as the visual direction. Georgios picked it over the enamel variant and over lab-05, his earlier preference.
- The beetle as logo, on the green plate. Fredoka for logo and titles, Figtree for the interface.
- Status: waiting is red and is the only red; error grey; review yellow bud; merged pink bloom. Each state also has a word, a growth track position and a shape.

## Applied to the prototype and the layout pages

Later on 2026-10-07. The layout rules R1–R12 in `concept/v3_layout.html` are unchanged. `renders/planter-grid.html` stays as the record of cozy-04 and lab-05.

- `research/inspiration/renders/planter-grid-layout.html`: cozy-06 is the default style, day and night. lab-05 is the second style in the settings. The interface has the cozy-06 tokens and fonts, the beetle logo and favicon, bookmarks on the rail, segmented tabs, rows with the plant in a circle, the status word and the growth track, the "1 waiting" badge, the red notification, a light/dark switch per terminal. In the scene every rim takes the status colour (waiting pulses red, error is grey), a two-leaf sprout, a grey bare stalk, a closed yellow bud for review, a pink bloom for merged, a shape marker on each name tag.
- New in the prototype: the hotbar from the interface study, at the bottom centre of the main area (pots on keys 1–6, the overview on 0). The overview agent as a window, opened from the beetle bookmark, hotbar slot 0, key 0 or the carving, with demo states S17–S19. The larger table from `2026-10-06_layout-v3.md`: pots moved back, seed packets in a front strip, the beetle carved into a front board (cozy) or engraved in a plate (lab). Its seam glows with the overview's status.
- `concept/v3_layout-slides/`: all screenshots retaken from the prototype. `s01`–`s19` and `cozy-day-s01` are cozy-06 day, `cozy-night-*` cozy-06 night, `lab-light-s01` (new) and `lab-dark-s01` lab-05. Before, `s01`–`s16` showed lab-05 light.
- `concept/v3_layout.html`: cozy-06 colours and fonts. A table of the five states and the empty pot. The wireframes use the cozy-06 shapes, a red waiting row and the hotbar. The hotbar is also in the schematic, the components (as should-have) and the ways to act. "review" and "merged" replace "done".
- `concept/v3_layout-slides.html`: cozy-06 colours and fonts, a slide on the five states, the hotbar in the regions slide and the should-have list, cozy-06 on the styles slide, a slide with S17 and S19. The 1600 px stage now scales into narrow windows; it was cut off on the right before.

The agent colours are still cozy-04's set of 8.

## In Penpot

Later on 2026-10-07, in `gitspore_v01`. Details and the naming rule are in `penpot.md`.

- Tokens in three sets (`cozy-06/shared`, `cozy-06/day`, `cozy-06/night`) with a theme group `mode`. The 8 agent colours from `2026-10-07_hotbar-and-beetle.md` went in as the current values. Georgios decided to use them as they are and change them if a reason comes up. The plant and pot colours became tokens too (`color.plant.*`, `color.pot.*`), so R3F materials can read them.
- 17 typographies and 16 components (with variants), on a new page `cozy-06 ui` with S01 day and night built from them.
- The proposal and the prototype session didn't disagree on any value. Where they differ, the prototype won: no repo name, no beetle on the rail, rows in slot order with the focused row outlined, a close button on the notification.
- Added beyond the proposal: `color.accent-ink` (`#2a2119`, text on accent), `color.terminal.box` (the question box in the terminal, `#5e7189` / `#a9b5c9`), `opacity.logo-glow` (0 by day, 1 at night).
- Penpot switches token themes for the whole file, so S01 night is a frozen copy and doesn't follow token changes.
- `layout wireframes` updated in all 19 frames: cozy-06 status shapes and words, the hotbar instead of the tray (windows and scenes 36 px shorter to make room), the "waiting" badge, no repo name, no beetle on the rail, the carving at twice its size, and the notes for S01–S03, S11, S12, S17–S19.

## Still open

- Agree on the visual direction as a team.
- A fixed set of 8 agent colours that avoids the status hues. Proposed later the same day, see `2026-10-07_hotbar-and-beetle.md`.
- Whether merged pots stay in the list.
- Whether the repo name comes back to the top bar. Taken out for now; it may return later.
- Whether the hotbar joins the layout. Taken further in `2026-10-07_hotbar-and-beetle.md`: it replaces the tray.
