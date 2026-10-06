# 2026-10-06: Planter grid proposal

Ticket: #1 (GSP-1). Process record.

## What happened

An alternative brief came in as screenshots: the planter grid, an attention gauge for parallel AI agents (six pots, seed packets for issues, plants wilt while an agent waits). It narrows v2 to one question the scene answers and adds a hypothesis that a user study can test.

Reviewing it against v1 and v2 showed one gap: the repo itself barely appears. We looked for a cheap way to show it in 2D next to the scene.

## What we did

- Wrote `concept/v3_planter-grid.md`.
- Tested the `commit-graph` npm package (2.4.0) with React 19.2 and Next 16.3 in a scratch project outside the repo. It works; gotchas are in v3.
- Built two visual directions as one live render, `research/inspiration/renders/planter-grid.html`, with a branch graph overlay: cozy-04 (cozy greenhouse, day and night) and lab-05 (plant lab, clay-02 tokens). Described in `research/inspiration/aesthetics.md`.

## Proposed, not decided

- v3 as the capstone concept.
- Branch graph as an absolutely positioned 2D overlay over the scene, built with `commit-graph`. Should-have.
- One of cozy-04 or lab-05 as the visual direction. Georgios prefers lab-05.
- An ID colour per agent, picked from a fixed set of 8 per style, shown small (band at the pot's foot, dot on the name tag, branch colour in the graph). Fixed set so the art direction stays in our hands.
- A garden map object in the scene that opens the branch graph when clicked (G still works).
- More pots (up to 9, fixed spots) only if time is left.

## Still open

- Agree on v3 as a team.
- Pick the visual direction.
- Whether the files-touched overlap warning is worth a could-have slot.
