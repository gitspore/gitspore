# 0001: A local daemon runs the agents in git worktrees

- Status: accepted
- Date: 2026-10-05

## Context

The first idea was a web app that visualises a GitHub repo. The backlog tickets #2–#11 describe something else: a daemon on the developer's machine that runs Claude Code agents, each in its own git worktree, with real terminals opened from the 3D scene. The dependencies already installed (node-pty, simple-git, xterm, better-sqlite3) match the tickets.

## Decision

- `apps/api` is a NestJS daemon that runs locally: terminals with node-pty, git worktrees, Socket.io to the browser.
- One agent per worktree and branch.
- Database: SQLite via Drizzle. Neon stays in mind if we need a hosted database later.

## Alternatives

- A hosted web app reading GitHub only. Can't start agents or open terminals.

## Consequences

- Users install and start the daemon; the app needs a connect screen when it isn't running.
- The daemon listens only on localhost, with a token.
- Windows support for node-pty and worktrees is a risk to test early.
