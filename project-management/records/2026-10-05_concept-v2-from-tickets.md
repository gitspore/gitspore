# 2026-10-05: Concept v2 from the backlog tickets

Ticket: #1 (GSP-1). Process record.

## What happened

Thomas wrote the backlog tickets #2 to #11 (GS-01 to GS-10). Reading them next to `concept/v1_initial-idea.md` showed that they describe a different app: a local daemon that runs agents (Claude Code) in their own git worktrees, with real terminals opened from the 3D scene. v1 describes a web app that visualizes a GitHub repo.

The tickets agree with the M2 check in `scope.md`, with Georgios's edit to v1 ("Click on agents (insects) to start a terminal") and with the dependencies already installed (node-pty, simple-git, xterm, better-sqlite3).

## What we changed

- Wrote `concept/v2_agents-and-worktrees.md` from the tickets. v1 stays unchanged for comparison.
- Added the differences to `research/questions.md` under "Found in the backlog tickets".
- Added a note to `scope.md` that the tickets point to a different plan. The temporary scope text itself is unchanged.
- Root `CLAUDE.md`: the daemon description now matches the tickets (local, terminals, worktrees, SQLite).

## Decided

- Database: start on SQLite (as in ticket #3). Keep Neon in the stack and migrate if the need comes.

## Still open

- Which concept is the capstone: v1, v2, or a mix. Until then v2 is a description of the tickets, not an agreed concept.
- The other points in `research/questions.md`, "Found in the backlog tickets".