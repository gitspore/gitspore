# 2026-10-07: Hotbar instead of tray, beetle in the hotbar, agent colours

Ticket: #1 (GSP-1). Process record. Follows `2026-10-07_cozy-minimal-proposal.md` and changes parts of `2026-10-06_layout-v3.md`.

## What happened

After cozy-06 went into the prototype, Georgios reviewed it and asked for five changes. Claude made them in the prototype, the layout page, the slide deck and `concept/v3_planter-grid.md`, and retook the screenshots.

## Proposed, not decided

- **No tray.** Minimised terminals no longer get a chip at the bottom left. The hotbar already has a slot for every agent with its status, and clicking it opens the terminal (shift-click: beside). A minimised window is now a small mark at the top of its slot. Rules R8 and the "open windows" setting in `concept/v3_layout.html` say this now; the other rules are unchanged. The hotbar moves to MVP because it takes over the tray's job.
- **The beetle only in the hotbar.** Slot 0 is the overview, always visible. The rail keeps panel tabs and the scene/focus button and loses the beetle bookmark. We also considered showing slot 0 only while the overview's window is open and rejected it: a waiting overview with a closed window would have no slot to turn red, and key 0 would have nothing on screen.
- **Carving on the table top.** The beetle moved from the front edge onto the table top, in the front strip between the seed packets, at about twice its earlier size (1.5 units wide in cozy, an engraved plate of 1.7 in lab). It reads better from the camera's angle than the front edge did.
- **No repo name in the top bar.** gitspore runs on one repo, so "acme/shop" said nothing.
- **Agent colours for cozy-06.** Eight per mode, in `research/inspiration/aesthetics.md`: blue, sky, navy, teal, violet, lavender, ink, umber. Every pair is at least 22 ΔE apart (CIELAB), every colour at least 25 ΔE from the status colours. The old cozy-04 set had two colours close to the review and merged colours.

## Also changed

- `concept/v3_planter-grid.md`: the five cozy-06 states with words and shapes, the hotbar, the carving position, cozy-06 instead of cozy-04.
- At 390 px the hotbar slots shrink to 38 px so all seven fit.

## Archive folder

Later the same day, at Georgios's request: everything superseded moved to a top-level `archive/` that mirrors the original paths, so current folders show only what is current and the cleanup after review handles one folder. (A first step put the renders in `research/inspiration/alternatives/`; that folder is gone again.)

| Was | Now |
|---|---|
| `concept/v1_initial-idea.md`, `concept/v2_agents-and-worktrees.md` | `archive/concept/` |
| `research/inspiration/proposals.html` | `archive/research/inspiration/proposals.html` |
| `research/inspiration/renders/biome-station*` (bark-01, clay-02), `vine-jar*` (vine-03), `planter-grid.html` and `planter-grid-*.jpg` (cozy-04, lab-05) | `archive/research/inspiration/renders/` |
| `aesthetics.md` sections: the 2026-10-05 brief, bark-01, clay-02, vine-03, colour proportions, their scope, earlier exploration | `archive/research/inspiration/aesthetics-terrarium-proposals.md` |

Paths are updated in `CLAUDE.md` (new `archive/` row and two conventions), `concept/main.md`, `concept/v3_layout.html`, `concept/v3_planter-grid.md`, `scope.md`, `research/questions.md`, `research/inspiration/aesthetics.md`, `research/inspiration/CONTEXT.md` and the prototype's header comment. Older records keep the old paths; this table maps them.

## Still open

- Minimise and close are now close to each other: both hide the terminal, the agent keeps running, and the hotbar opens it again. The difference left is whether the xterm instance stays alive. Worth asking whether we need both buttons.
- The team has to agree on the hotbar, the agent colours and the carving position along with cozy-06.
