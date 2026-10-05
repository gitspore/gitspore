# v2: Agents and worktrees

2026-10-05. Built from the backlog tickets #2 to #11 (titles GS-01 to GS-10, written by Thomas) and the M2 check in `scope.md`. Where v1 says something the tickets don't cover, it is listed under "From v1, not in the tickets yet". Nothing here is agreed; see `records/2026-10-05_concept-v2-from-tickets.md`.

## What changed from v1

v1 is a web app that shows a GitHub repository as a plant. v2 is a **local app**: a daemon on your machine works on a git repo, spawns agents (for example Claude Code) in their own git worktrees, and the browser shows the repo and the agents as a 3D biotope. You click an agent to open its real terminal.

Sources: M2 check ("Ein Klick auf eine Ranke sollte ein echtes Terminal mit einem echten Worktree, in dem Claude Code läuft, öffnen"), v1 edit ("Click on agents (insects) to start a terminal"), tickets #9, #10, #11.

## Vocabulary

| Thing | v1 word | Ticket word |
|---|---|---|
| Branch | shoot (main: stem) | Vine |
| Agent | insect (contributor) | Beetle |
| Issue | pest | Spore |
| Merge | flower, then fruit | Bloom |
| Whole scene state | terrarium | Biotope (`BiotopeState`) |
| Worktree | not in v1 | Worktree |
| Terminal session | not in v1 | TerminalSession |

Agent status (#2): `idle`, `working`, `waiting`, `error`, `done`.

## How it works

- **Daemon** (`apps/api`, NestJS). Runs locally, binds only to `127.0.0.1`, requires a session token generated at startup and checks the `Origin` header, because it spawns real shells (#4).
- **Terminals** (#9). node-pty sessions that can run interactive programs such as `vim` and `claude`. Output streams over Socket.io. Scrollback of about 1,000 lines. No orphan processes after shutdown. Limit on concurrent sessions.
- **Worktrees** (#10). One git worktree per agent, outside the repo root (e.g. `../.gitspore-worktrees/<branch>`), so two agents can work at the same time without conflicts. Synced with the DB at startup.
- **Database** (#3). SQLite through Drizzle, with tables for repos, branches, worktrees, agents, terminal sessions, issues, merges and gamification events. Neon (Postgres) stays an option: start on SQLite and migrate if the need comes.
- **Shared contracts** (#2). Types and Socket.io events in `packages/shared`. The server sends a full `state:snapshot` on connect, then small `state:patch` deltas. Events: `terminal:*`, `agent:spawn`, `agent:stop`, `gamification:event`, `error`.
- **Web** (`apps/web`). A Zustand store holds the state; the 3D scene reads only from the store (#8). A mock event source lets the scene be built without the backend (#6).
- **Scene** (#5). React Three Fiber: glass case, ground, lights, OrbitControls with limits, Bloom post-processing with a neon look (emissive materials). Components: `<Vines />`, `<Beetles />`, `<Spores />`, `<Blooms />`. Target 60 FPS on an average laptop.
- **Terminal panel** (#11). xterm.js overlay above the scene, closed with Esc; keyboard input doesn't reach the camera while the terminal has focus.
- **Gamification.** Exists as an event type and a DB table (#2, #3). What it does is not described yet.

## From v1, not in the tickets yet

- GitHub data: PRs, issues and CI from the GitHub API, GitHub login, deploy.
- Notes pinned on objects.
- Gardener's diary written by AI.
- Replay of how the plant grew.
- Visual rules: growth per commit, buds swelling and blooming, moss and mould on stale branches, CI weather, light following activity, insect size by commits.
