# Concept

Status: proposed, not agreed by the team yet ([ADR 0002](decisions/0002-planter-grid-instead-of-terrarium.md)). Last updated 2026-10-07.

## In one sentence

gitspore shows which of your AI agents needs you right now, before it wilts.

## The problem

Developers run several AI coding agents at once, each in its own git worktree. An agent stops to ask a question, and nobody notices for minutes because the developer is busy in another tab. The time saved by running agents in parallel is lost to waiting.

## The idea

A greenhouse table in 3D. Each pot is one agent. A plant that wilts is an agent that waits for you.

1. Open GitHub issues are listed as **seed packets** in the Issues tab.
2. Give an issue to an empty **pot** (button, click on the empty pot, or drag). gitspore creates a worktree and a branch and starts Claude Code with the issue as its task.
3. The plant shows how the agent is doing. You see at a glance which one needs you.
4. Click a pot to open the agent's real terminal and answer it.
5. When the branch is merged, the plant blooms and the pot is free again.

gitspore runs on your machine: a local daemon starts the agents and their terminals, the browser shows the scene ([ADR 0001](decisions/0001-local-daemon-agents-in-worktrees.md)).

## How to read a plant

Five states. Each has a plant, a rim colour, a word in the Agents tab, a growth stage and a shape, so none depends on colour alone.

| Plant | Agent | Word | Shape |
|---|---|---|---|
| Sprout with two leaves, gently swaying, green rim | working | growing | circle |
| Red rim pulses, then the plant droops and yellows (0–15 s, 15–60 s, over 60 s) | waiting for you | a timer | triangle |
| Grey bare stalk, grey rim | error | wilted | cross |
| Closed yellow bud, yellow rim | ready for review | review | diamond |
| Pink bloom, pink rim | merged, the pot frees up | merged | five-dot flower |
| Empty pot | no agent | pick an issue | dashed circle |

Waiting is the only red. Every visual element means exactly one thing. Colours and shapes: [design/components.md](design/components.md).

## Agent colour

Each agent gets an ID colour, so you can tell them apart in the scene, the Agents tab, the terminal window, the hotbar and the Branches tab.

- It stays small: a thin band at the foot of the pot and a dot on the name tag. The rim stays reserved for status.
- The user picks from a fixed set of 8 colours, not a free colour picker. The set stays clear of the status colours, so a wilting plant still stands out.
- gitspore assigns the next free colour on its own; the user can change it.

## The repo: garden map and Branches tab

The scene shows agents, not the repo. The repo lives in the **garden map**:

- A small plan pinned to the greenhouse wall. It shows one mark per pot in its agent colour and nothing else.
- Click it, press G, or use the rail button, and the side panel opens on its **Branches** tab: `main` and every agent branch over the full panel height (about 28 commits), each in its agent's colour, with a status shape on its label.
- Click a pot while the tab is open and its branch is highlighted. Click a branch and its agent's terminal opens.

## The overview: the beetle

The plants show one agent each. The overview answers "what have all of them done, and where is the whole thing going" ([ADR 0004](decisions/0004-overview-agent-and-beetle.md)).

- One more Claude Code session, started by the daemon in the repo root instead of a worktree, without a pot. It reads `git log --all`, the worktrees' diffs and a status file the daemon writes (agents, issues, states, waiting times, branches).
- Hotbar slot 0, key `0`, or a click on the beetle carved into the table opens its window maximised. After that it is an ordinary window.
- The carving glows with the overview's status: dim when idle, a slow pulse when working, red when it waits.
- The table is larger for it: two rows of three pots at the back, a strip at the front with space for seed packets and the carving in the middle.
- Read-only at first. Later it may orchestrate (plant an issue, stop an agent) through an MCP server on the daemon.

## Next to the scene

The full layout (regions, rules, all 19 states) is in [design/layout.html](design/layout.html) ([ADR 0003](decisions/0003-layout-model.md)).

- The scene fills the page. On top of it, in a CSS grid: top bar, tool rail on the left, main area for terminal windows, side panel on the right, the hotbar at the bottom.
- The side panel has three tabs: **Agents**, **Issues** (open issues as seed packets) and **Branches** (the graph). It works on its own if the 3D scene fails.
- Every terminal window belongs to one agent. Buttons, not dragging, set a window's size: minimise, maximise, or *focus this* to show one terminal alone.
- The **hotbar** has one slot per pot (keys 1–6) and one for the overview (key 0). Each slot shows the plant, the status shape and the agent colour; a mark means the window is minimised ([ADR 0005](decisions/0005-hotbar-replaces-tray.md)).
- When an agent waits and its terminal is not in view, a notification appears bottom right, and the tab title and favicon show the number of waiting agents.
- Greenhouse vitality (should-have) is one value, 0–100 %, for how much agent time is lost to waiting.
- Token usage: the top bar shows how much of the Claude plan's 5-hour and weekly limits is used; each terminal window shows its agent's tokens and how full its context is ([ADR 0009](decisions/0009-show-token-usage.md)).

## Who it is for and how we test it

Developers who run three or more agents at once. Our hypothesis: with gitspore they notice blocked agents faster than with terminal tabs. A small user study in week 4 tests it (5 people, 30 min each).

## Risks

1. Detecting "waiting for input" depends on Claude Code hooks. Spike S3 decides it.
2. Windows support for terminals and worktrees.
3. The user study in week 4 is tight.
4. The repo is secondary now. That is a real change from the first idea (a visualisation of the whole repo), and the team has to agree to it before we build.
