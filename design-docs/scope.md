# Scope

Status: proposed, not agreed by the team yet. Last updated 2026-10-09.

Four weeks, 2026-10-05 to the presentation on 2026-11-04, about 60 person-days for the team. Tasks and their status live on the board: https://github.com/orgs/gitspore/projects/1

## Must-have

- Issues tab with seed-packet rows; planting by button or by clicking an empty pot
- Worktree, branch and Claude Code start for a planted issue
- Agent status from Claude Code hooks; the plant wilts while the agent waits
- Terminal windows: minimise, maximise, focus this
- The hotbar (keys 1–6 and 0)
- Side panel with the Agents and Issues tabs
- Waiting notification, waiting count in the tab title and favicon
- Token usage: the plan's 5-hour and weekly limits in the top bar, tokens and context per agent in its window ([ADR 0009](decisions/0009-show-token-usage.md))
- Merge detection with bloom and worktree cleanup
- macOS and Windows
- Daemon only on localhost, with a token
- Connect screen when the daemon isn't running; agents and terminals keep working when WebGL fails

## Should-have

- Branches tab with `commit-graph` and the garden map object
- Overview agent with the beetle carving
- Drag an issue onto a pot
- Tiling of 2–4 terminals
- Agent colours and the colour picker
- Replay, greenhouse vitality
- The project's token total
- Sound cue and browser notification

## Later, if time

- 3D seed packets on the table
- A shell tab in an agent's worktree
- More pots (up to 9, each in a fixed spot)
- A warning when two agents edit the same file

## Out

- Agents other than Claude Code
- Several repos
- More than six agents
- Merge conflicts in the UI
- Resuming agents after a daemon restart
- Points and levels

## Budget for the look

On top of the planter grid logic. The aim is 15–20 % of the team's time.

| Work | Person-days |
|---|---|
| Scene, pots, five plant states, day and night | 5–7 |
| Garden map object and Branches tab | 2–3 |
| Agent colours (palette, band, tag dot, graph) | 0.5–1 |
| Larger table, beetle carving with emissive states | 1–2 |
| Interface theme (no frames, so cheap) | 0.5 |
| **Total** | **9–13.5, about 15–22 % of 60** |

Cut first if time runs short: night mode, foliage and shelf, the drops from the watering can.
