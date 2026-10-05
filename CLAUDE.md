@AGENTS.md

# gitspore

gitspore shows a git repository as a living 3D terrarium. Capstone project, 2026-10-05 to the presentation on 2026-11-04. The concept is still moving; current versions are in `project-management/concept/`.

## Where things live

- `apps/web`: Next.js frontend (React Three Fiber scene, terminal UI).
- `apps/api`: NestJS daemon, runs locally (terminals with node-pty, git worktrees, Socket.io, SQLite via Drizzle).
- `packages/shared`: types shared by web and api.
- `project-management/`: concept, research, scope and records. Not part of the app. Never import from it or include it in a build. It has its own `CLAUDE.md`; read it only when a task is about concept or planning.

## Git workflow

- Never commit to `main`. One branch per ticket, named `GSP-<issue number>_<Short-Name>`, for example `GSP-1_Project-Management-Setup`.
- Merge only through a pull request after a teammate's review. Put `Closes #<issue number>` in the PR description.
- Tickets live on the board: https://github.com/orgs/gitspore/projects/1
