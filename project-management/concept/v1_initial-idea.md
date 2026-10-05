# v1: Initial idea

## Initial idea

Gitspore turns any GitHub repository into a living 3D terrarium, drawn as a cross-section like a vivarium, with the repo being represented as a plant .

What you do:
Click anything to see the real PR, issue or branch behind it, and pin notes on it. When you come back after a few days, the gardener's diary (written by AI) tells you what happened while you were away. In the terminal next to the case you can ask about the repo. Click on agents (insects) to start a terminal.
You can see a replay of how the plant grew while you were gone or from the beginning.

## Example

The main branch is the stem. It grows taller with every commit. Other branches grow off it as shoots, and a shoot gets longer the further its branch is ahead of main.

An open pull request is a bud on its shoot. It swells when the PR is approved and blooms when it's merged. The flower lasts a few days, then turns into fruit. A branch that's deleted without being merged dries up and falls off.

Issues are pests on the leaves. The older the issue, the bigger the pest. When the issue is closed, the pest leaves.

A branch nobody has touched for a week grows moss, and after a month it goes mouldy.

CI sets the weather inside the glass: a passing run sprays a fine mist, and a failing one makes the whole plant wilt. The light follows activity. The case is bright on a busy day and fades to dusk when nobody is working.

Each active contributor is an insect wandering the case, bigger the more they committed this week. Commits made with an AI show up as glowing insects.

## Stack (maybe)

- next js
- Tailwind
- nest js
- Drizzle ORM
- betterAuth
- neon

Graphics:

- React Three Fiber with 3js

Terminal simulation for browsers:

- Terminal UI: @xterm/xterm + @xterm/addon-fit + @xterm/addon-webgl

ticketing: github projects

design:

- penpot
- blender 3d

## Stack already installed in the repo (2026-10-05)

Read from the `package.json` files.

Monorepo: npm workspaces (`apps/*`, `packages/*`), concurrently to run web and api together.

`apps/web`:

- Next.js 16.3.7, React 19.2.8, TypeScript 6, ESLint 9
- Three.js 0.186, React Three Fiber 9, drei 10, postprocessing 3
- @xterm/xterm 6 + @xterm/addon-fit
- socket.io-client 4
- zustand 5 (state)
- lucide-react (icons)

`apps/api`:

- NestJS 12 (core, platform-express, websockets, platform-socket.io), socket.io 4, rxjs
- Drizzle ORM + drizzle-kit, better-sqlite3
- node-pty (real terminal processes)
- simple-git (git from Node)
- Jest 30, ts-jest, supertest

`packages/shared`: empty.

From the list above, not installed yet: Tailwind, Better Auth, Neon (the repo has SQLite instead), PixiJS, @xterm/addon-webgl.
