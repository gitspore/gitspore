# References

One entry per reference. Template and rules in `CONTEXT.md`.

## Pinterest boards

Georgios's boards. The images below come from these boards; the link to each single pin is not recorded.

- Terminal aesthetics: https://de.pinterest.com/georgiosplastok/terminal-aesthetics/
- Micro vivarium: https://de.pinterest.com/georgiosplastok/micro-vivarium/
- Sci-fi micro flora: https://de.pinterest.com/georgiosplastok/sci-fi-micro-flora/

## Moodboard images (first selection)

Added 2026-10-05 from Georgios's inspiration folder. "Why it matters" and "Take / avoid" are Claude's analysis, not agreed by the team. Several images look AI-generated (garbled text).

## Network graph, red nodes
- Link: not recorded
- Local: _assets/1a9e1479c6141fba0e17105ad93fae85.jpg
- What it is: hundreds of coral-red and off-white spheres of different sizes, linked by thin lines, on a charcoal background. Small black label tags float next to some nodes; two tags are yellow.
- Why it matters: reads like a commit or dependency graph. Node size and color already carry meaning.
- Take / avoid: take the single bright accent (yellow) for the few things that need attention. Avoid the density; it stops being readable.

## Cross-section of a biotope, retro poster
- Link: not recorded
- Local: _assets/2c8237dc0e831098d515ea83fee285ea.jpg
- What it is: a tall wireframe box cut open like a diagram. From top to bottom: a cloud, a garden with palms and flowers, striped orange soil layers, water with rocks, gravel. Side columns of colorful pixel text and small data thumbnails, like an 80s science poster.
- Why it matters: the closest image to the "cross-section like a vivarium" idea. Layers could carry meaning: weather on top (CI), plants (branches), soil (history), water (base).
- Take / avoid: take the layered cut and the data panels beside the case. Avoid the text density in the side columns.

## Clay data dashboard, white and coral
- Link: not recorded
- Local: _assets/61bb53b7737dea129af069a17b1c0eee.jpg
- What it is: a matte white board seen from above at an angle. Charts are physical: extruded pink bars, round wells, and coral- or sponge-like growths in red.
- Why it matters: data shown as organic growth with a tactile, soft material. The only light-background image.
- Take / avoid: take the idea of growth texture as data (coral spreading = activity). A possible light theme. Avoid the generic dashboard layout.

## Dark aquascapes, three tanks
- Link: not recorded
- Local: _assets/79cdd8db99c56e90f1af463c308b6837.jpg
- What it is: three black aquariums stacked: black rock, black sand, bare black driftwood branches, a few orange and red fish. Only the glass edges and the water surface catch light.
- Why it matters: branches are literally branches. The monochrome tank makes the few colored creatures stand out, like agents in a quiet repo.
- Take / avoid: take the restraint: dark materials, lit glass edges, color only on living things. Avoid empty scenes; the repo must still read at a glance.

## Neon glass case with a glowing tree
- Link: not recorded
- Local: _assets/7ed1cb77e99fb40ff40edc08064e2291.jpg
- What it is: a glass cube with cyan glowing edges on black. Inside, a cyan network shaped like a tree with a red trunk, small floating screens and panels, a circuit-board floor, falling light particles.
- Why it matters: matches ticket #5 (glass walls, Bloom, emissive neon). Screens inside the case could be terminals or agent panels.
- Take / avoid: take the glowing edges and the emissive tree. Avoid the stock "cyber" look; it is the most generic image in the set.

## Amber archive diagram
- Link: not recorded
- Local: _assets/974dd4b806d0986b6a555bf11aa25e0b.jpg
- What it is: monochrome amber on near-black. Framed panels with dithered, x-ray-like images, labelled like "RECORD", "ARCHIVE UNIT", "ANALYSIS LOG", joined by right-angled lines and small tags.
- Why it matters: a UI language for the 2D layer: panels, connectors, short labels, one color.
- Take / avoid: take amber monochrome, dithering and orthogonal connectors. Avoid low contrast for body text.

## Subject ID card, violet
- Link: not recorded
- Local: _assets/adb2a5f585b0adefea698e48b55f070e.jpg
- What it is: a lavender-on-black profile card, "SUBJECT A-34". Dithered eye, circuit drawing, fingerprint, a field table (name, incept date, function, mental state, threat assessment, special skills) and a waveform.
- Why it matters: a direct model for the panel that opens when you click a beetle: agent name, branch, status (`idle`, `working`, `waiting`, `error`, `done`), activity graph.
- Take / avoid: take the field table and the waveform. Avoid the surveillance tone ("threat", "mental state") unless it's meant as a joke.

## Iridescent analytics dashboard
- Link: not recorded
- Local: _assets/c0708c300282c245781c74691e0193a9.jpg
- What it is: a dark dashboard with a big 3D chart made of glossy, rainbow-iridescent liquid shapes, plus donut and bar charts.
- Why it matters: the iridescent material (thin-film, like a beetle shell) could suit beetles or blooms.
- Take / avoid: take the material for small objects only. Avoid the dashboard; it's the weakest match for gitspore.

## Floating crystal with glitch lines
- Link: not recorded
- Local: _assets/videoframe_9722.png
- What it is: a still from a video. A faceted, ice-like crystal floats in black space with bubbles. Horizontal RGB glitch streaks cross it. Thin white frame lines with tiny text, like a sci-fi poster.
- Why it matters: glass and crystal materials, particles in the air, glitch as a state.
- Take / avoid: take bubbles or particles (mist for CI) and glitch for errors. Avoid glitch as decoration everywhere.

## Amber radar HUD, animated
- Link: not recorded
- Local: _assets/cc1ff1f8dbe469ea1f8d4b3e65d702f5.gif
- What it is: an animated retro screen in amber monospace: "early warning proximity radar", signal-strength bars, a data download list, an orbit chart, small console messages appearing.
- Why it matters: shows how a terminal-style UI can feel alive with small motion. Fits the xterm panel and status readouts.
- Take / avoid: take the monospace grid, the boxed sections and the small, constant motion. Avoid too many simultaneous animations.

## How I Work on 16 Features at Once, YouTube (Web Dev Cody)
- Link: https://www.youtube.com/watch?v=oFy5PtZtZco&t=182s (starts at 3:02)
- Repo: https://github.com/AgentSystemLabs/agent-office
- What it is: Web Dev Cody shows his AI-driven workflow. He spins up about 16 AI agents in his project Agent Office, which build features, fix bugs and process pull requests at the same time. Agent Office is a multiplayer virtual office: a team connects to one server that shares the same repository, kicks off tasks, and assigns agents for automated merges and security audits.
- Why it matters: one of the first influences behind the decision to do this project.
- Take / avoid: open.

## Product references: tools for running coding agents

Added 2026-10-05. These are products that do what concept v2 does without the 3D scene. Descriptions are taken from their websites on that date.

## herdr, website
- Link: https://herdr.dev/
- What it is: a background server that owns the terminal sessions of coding agents (Claude Code, Codex, Cursor). Install one binary; agents keep running when you close the laptop or switch machines over SSH. Tracks agent state (working, blocked, idle). Sidebar with workspaces and agents, one pane per agent. Monospace, terminal-style look.
- Why it matters: same job as our daemon (#9): it owns the terminals and the agent states. Its states are close to ours (`idle`, `working`, `waiting`, `error`, `done`).
- Take / avoid: open.

## Conductor, website
- Link: https://www.conductor.build/
- What it is: a Mac app that runs several Claude Code, Codex and Cursor agents in parallel, each in an isolated workspace. You watch their progress in one interface, then review and merge their changes.
- Why it matters: the closest match to v2: parallel agents in isolated workspaces (our worktrees, #10), then review and merge (our Blooms).
- Take / avoid: open.

## Paperclip, website
- Link: https://paperclip.ing/
- What it is: open-source app that organizes AI agents as a company: roles, hierarchy, goals, budgets per agent, a ticket system, scheduled "heartbeats", human approval, audit log. Agents from any provider. Clean interface, compared to Linear.
- Why it matters: a different metaphor for the same thing (a company instead of a biotope). Ideas for what gamification or agent status could show: cost, goals, approvals.
- Take / avoid: open.