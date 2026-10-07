@AGENTS.md

# gitspore

gitspore shows each AI coding agent as a plant on a 3D greenhouse table; a plant that wilts is an agent waiting for you. Capstone project, 2026-10-05 to the presentation on 2026-11-04. The current concept, scope, decisions and design are in `design-docs/` (start with `design-docs/README.md`).

## Where things live

- `apps/web`: Next.js frontend (React Three Fiber scene, terminal UI).
- `apps/api`: NestJS daemon, runs locally (terminals with node-pty, git worktrees, Socket.io, SQLite via Drizzle).
- `packages/shared`: types shared by web and api.
- `design-docs/`: concept, scope, decisions (ADRs), layout, components and tokens, the 3D prototype, a presentation. Not part of the app. Never import from it or include it in a build. It has its own `CLAUDE.md`; read it for any concept, design or planning task.
- Design values come from the Penpot file `gitspore_v01` (`design-docs/design/penpot.md`). Research and process records are in the `gitspore/workbench` repo.

## Git workflow

- Never commit to `main`. One branch per ticket, named `GSP-<issue number>_<Short-Name>`, for example `GSP-28_Monorepo-CI`. Card titles start with the same number (`GS-28 …` is issue #28).
- Merge only through a pull request after a teammate's review. Put `Closes #<issue number>` in the PR description.
- Tickets live on the board: https://github.com/orgs/gitspore/projects/1
