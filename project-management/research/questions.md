# Open questions

To explore and decide in week 1. When a question is answered, record the decision in `records/` and move the topic to its own file if it grew.

## Visual concepts

- Moodboards (see `inspiration/`).
- Base "identity" (colors as a minimum).
- Ideal level of polish (low poly? materials? ready assets? etc.)

## 3D scope and methods

- Which parts of the scene are generated / procedural and which are not? For example: plant pieces can be generated but can use ready model pieces and materials. Insects, dome etc. would need to be specific models with their animations.

## Data

- What data do we get ready from git and terminal usage?
- What data do we have to create ourselves?

## Claude setup

- Claude setup for concept and agentic work.

## Found in the backlog tickets (2026-10-05)

Differences between the tickets (#2 to #11) and the first notes. Details in `concept/v2_agents-and-worktrees.md`.

1. Product: v1 visualizes a GitHub repo in a web app; the tickets build a local daemon that runs agents in worktrees. Which one is the capstone? `scope.md` lists "agents that write code" as out of scope.
2. Vocabulary: shoot/insect/pest/flower (v1) vs. Vine/Beetle/Spore/Bloom (tickets). Agree on one glossary.
3. Ticket numbers: titles use `GS-01`… but branches use `GSP-<issue number>`. GS-01 is issue #2.
4. GitHub data: do GitHub PRs, issues and CI still come in (API, login), or only the local git repo?
5. Deploy: a daemon bound to `127.0.0.1` runs locally. What does "deploy" in week 1 mean then?
6. Gamification: an event type and a table exist, but no description of what it is.
7. v1 features not in any ticket: notes, AI diary, replay, CI weather, light, moss and mould.
