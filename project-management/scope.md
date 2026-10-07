# Scope

> TEMPORARY. Copied as-is from the team's first notes on 2026-10-05. Not reviewed or agreed yet.

Presentation: 2026-11-04.

> The backlog tickets (#2 to #11) point to a different plan than these notes: a local daemon with agents in worktrees instead of a GitHub visualization. See `archive/concept/v2_agents-and-worktrees.md` and `research/questions.md`. Update this file once the team has decided.

## First scope idea

Week 1.
- Repo, CI, deploy, DB, GitHub login.
- The first sync of a repo into the DB, with every PR, issue and branch stored with its timestamps.
- R3F test: a glass case with shapes drawn from sample data.
- DEFINE WHEN: ---> if R3F isn't working, switch to 2D or rethink scope.

Week 2.
- The rules that turn repo data into the plant at any given date, with unit tests.
- All plant parts in 3D, fixed camera. Click for details, notes (CRUD), a simple diary.
- By Friday, it works on any public repo.

Week 3. Add, in this order:
- Terminal chat about the repo.
- Replay: watch the repo grow over time.
- Camera orbit and glow.
- AI diary.
- Insects: one per active contributor.
- Live updates when the repo changes.
- Integration test. Whatever doesn't fit moves to "later".

Week 4.
No new features. Bugs, polish, demo on our own capstone repo.

Not in scope?:
agents that write code, private repos, voice, multiplayer.

## First milestones idea

- Milestone 1: Fundament und Basic Design (Woche 1)
- Milestone 2: Core Loop (Woche 2): Check: Ein Klick auf eine Ranke sollte ein echtes Terminal mit einem echten Worktree, in dem Claude Code läuft, öffnen
- Milestone 3: Github & Gamification (Woche 3)
- Milestone 4: Polish (Woche 4)