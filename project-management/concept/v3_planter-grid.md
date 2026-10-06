# v3: Planter grid

2026-10-06. A proposal, not agreed yet. Background: `records/2026-10-06_planter-grid-proposal.md`. Visual directions: `research/inspiration/aesthetics.md` (cozy-04, lab-05). Live mockup: `research/inspiration/renders/planter-grid.html`. App layout: `concept/v3_layout.html`.

## In one sentence

gitspore shows which of your AI agents needs you right now, before it wilts.

## The problem

Developers run several AI coding agents at once, each in its own git worktree. An agent stops to ask a question, and nobody notices for minutes because the developer is busy in another tab. The time saved by running agents in parallel is lost to waiting.

## The idea

A greenhouse table in 3D. Each pot is one agent. A plant that wilts is an agent that waits for you.

1. Open GitHub issues lie at the front of the table as **seed packets**.
2. Drag a packet into an empty **pot**. gitspore creates a worktree and a branch and starts Claude Code with the issue as its task.
3. The plant shows how the agent is doing. You see at a glance which one needs you.
4. Click a pot to open the agent's real terminal and answer it.
5. When the branch is merged, the plant blooms and the pot is free again.

## How to read a plant

| Plant | Agent |
|---|---|
| Sprout, gently swaying | working |
| Rim pulses, then the plant droops, then it wilts | waiting for you (0-15 s, 15-60 s, over 60 s) |
| Grey plant, red rim | error |
| Glowing bud | done, ready for review |
| Flower | merged, the pot frees up |

Every visual element means exactly one thing.

## Agent colour

Each agent gets an ID colour, so you can tell them apart in the scene, the sidebar, the terminal and the branch graph.

- It stays small: a thin band at the foot of the pot and a dot on the name tag. The rim stays reserved for status.
- The same colour marks the agent's row in the sidebar, its terminal tab and its branch in the graph.
- The user picks from a fixed set of 8 colours per visual style, not a free colour picker. We design that set as part of the art direction: muted, and clearly apart from the status colours, so a wilting plant still stands out.
- gitspore assigns the next free colour on its own; the user can change it.

## The repo: garden map

The scene shows agents, not the repo. The repo lives in the **garden map**:

- A small object in the scene: a plan pinned to the greenhouse wall (cozy) or a small floor-plan plate on the bench (lab). It shows one mark per pot in its ID colour and nothing else.
- Click it, press G, or use the rail button, and the side panel opens on its **Branches** tab: `main` and every agent branch over the full panel height (about 28 commits), each branch in its agent's colour, with a status dot on its label. The tab replaces the earlier overlay over the scene, so the graph never covers the pots.
- Click a pot while the tab is open and its branch is highlighted. Click a branch and its agent's terminal opens.
- The side panel keeps one width (about 400 px) for all tabs, so switching tabs never moves the windows.
- The graph comes from the `commit-graph` React package. We tested it with React 19 and Next 16; gotchas below.

## Next to the scene

The full layout (windows, states, rules) is in `concept/v3_layout.html` and replaces the docked layout of the mockup.

- The sidebar lists every agent with status, issue and waiting time. It works on its own if the 3D scene fails.
- The terminal is docked under the scene and opens for the selected pot.
- Greenhouse vitality (should-have) is one value, 0-100 %, for how much agent time is lost to waiting.

## Who it is for and how we test it

Developers who run three or more agents at once. Our hypothesis is that with gitspore they notice blocked agents faster than with terminal tabs. A small user study in week 4 tests it (5 people, 30 min each).

## Scope

**Must-have.** seed packets from issues, drag to plant (fallback: click), worktree + branch + Claude Code start, agent status from Claude Code hooks, wilting, docked terminal, sidebar, merge detection with bloom and worktree cleanup, macOS and Windows, daemon only on localhost with a token.

**Should-have.** garden map with branch graph, agent colours, replay, greenhouse vitality, sound cue and browser notification.

**Out.** agents other than Claude Code, several repos, more than six agents, merge conflicts in the UI, resuming agents after a daemon restart, points and levels.

**Later, if time.** more pots (up to 9, each in a fixed spot); a warning when two agents edit the same file.

| Work on the look | Person-days |
|---|---|
| Scene, pots, plant states, light and dark theme | 5-7 (cozy-04 more, lab-05 less) |
| Garden map object and Branches tab | 2-3 |
| Agent colours (palette, band, tag dot, graph) | 0.5-1 |
| **Total** | **7.5-11, about 13-18 % of ~60 team days** |

## `commit-graph` gotchas

- Add `"overrides": { "react": "$react", "react-dom": "$react-dom" }` to the root `package.json`, or npm installs a second React 18 and tests break.
- It colours lanes by position, not by branch name. We pass the ID colours in lane order through a small adapter.
- Its CSS is light-only. Dark mode needs override CSS.
- `package.json` says MIT, the `LICENSE` file says Apache 2.0. Both licenses are fine for us.

## Risks

1. Detecting "waiting for input" depends on Claude Code hooks. Spike S3 decides it.
2. Windows support for terminals and worktrees.
3. The user study in week 4 is tight.
4. The repo is now secondary. That is a real change from v1, and the team has to agree to it before we build.
