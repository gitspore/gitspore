# gitspore docs

gitspore shows each AI coding agent as a plant on a greenhouse table. A plant that wilts is an agent waiting for your answer. Click the pot and answer in the agent's real terminal.

These docs describe the current state: what we build and how it looks. They are not part of the app; nothing here is imported or built.

## What's here

| File | What it answers |
|---|---|
| [concept.md](concept.md) | What gitspore is, for whom, and how to read a plant |
| [scope.md](scope.md) | What we build in four weeks, what comes later, what's out |
| [decisions/](decisions/) | Why things are the way they are, one short record per decision |
| [design/layout.html](design/layout.html) | The layout: regions, rules, all 19 states, components per region, ticket mapping |
| [design/components.md](design/components.md) | Tokens, type, the five states, every component with sizes and variants |
| [design/prototype.html](design/prototype.html) | The live 3D prototype of all states, day and night |
| [design/penpot.md](design/penpot.md) | The Penpot design file: setup, what each page holds, rules |
| [design/competitors.md](design/competitors.md) | Agent Office, Conductor, herdr and Paperclip next to gitspore, and where we differ |
| [presentation/index.html](presentation/index.html) | A 10-slide introduction for other teams |

Open the HTML files directly in a browser. They load fonts and three.js from CDNs, so they need a connection.

## Elsewhere

- Tasks and their status: the board, https://github.com/orgs/gitspore/projects/1
- Designs and tokens: Penpot, file `gitspore_v01` ([setup](design/penpot.md))
- Research, explorations, process records and older versions: the `gitspore/workbench` repo

## Decisions

| # | Decision | Status |
|---|---|---|
| [0001](decisions/0001-local-daemon-agents-in-worktrees.md) | A local daemon runs the agents in git worktrees | accepted |
| [0002](decisions/0002-planter-grid-instead-of-terrarium.md) | A planter grid instead of a repo terrarium | proposed |
| [0003](decisions/0003-layout-model.md) | Windows in fixed slots over a full-page scene | proposed |
| [0004](decisions/0004-overview-agent-and-beetle.md) | An overview agent, shown as a beetle | proposed |
| [0005](decisions/0005-hotbar-replaces-tray.md) | A hotbar replaces the tray of minimised windows | proposed |
| [0006](decisions/0006-visual-direction-cozy-06.md) | Visual direction cozy-06 | proposed |
| [0007](decisions/0007-penpot-is-the-source-of-design-values.md) | Penpot is the source of design values | proposed |

"Proposed" means not yet agreed by the team. When the team agrees, the status changes to "accepted".
