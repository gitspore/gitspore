This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Mock mode

The app can run without the daemon (`apps/api`). A mock client plays a scripted scenario and answers the UI's commands, so the scene and the side panel can be built and styled without a running agent.

### Start it

- Per URL, no rebuild needed: open `http://localhost:3000/?mock=core-loop&speed=10`.
- As the default for your machine: put `NEXT_PUBLIC_USE_MOCK=true` into `apps/web/.env.local` and restart `npm run dev`. The variable is read at build time.

The URL wins over the variable. `?mock=<name>` picks a scenario, `?mock=true` the default one (`all-states`), `?mock=false` forces the real daemon. `?speed=<n>` sets the playback speed (default 1; `10` shows a 60 s stage in 6 s). A wrong scenario name or speed shows an error screen that lists the valid values.

Without any of this the app talks to the daemon at `NEXT_PUBLIC_DAEMON_URL` (default `http://localhost:8888`).

In mock mode a small panel in the bottom right shows the scenario and has buttons for speed (×1, ×10, ×60), pause/resume and restart.

### Scenarios

| Name         | What it shows                                                                                                                                                                           |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `empty`      | No agents, 6 issues. For seed packets and dispatching.                                                                                                                                  |
| `all-states` | One agent per status (starting, working, needs_input, error, done, merged) plus the overview agent, static. For styling all of them. The done and the merged agent have a pull request. |
| `core-loop`  | One agent: start, work, waits for input for 70 s (all wilting stages), work, done with its pull request, merged, removed 5 s later as by the daemon. 100 s in total.                    |
| `pr-closed`  | One agent: start, work, done with an open pull request, then the pull request is closed without merging: `error` with `pr_closed`. The agent stays. 30 s in total.                      |
| `stress`     | 6 agents with rapid status changes, and one version that is skipped on purpose to test recovery with a snapshot.                                                                        |

The mock also answers commands: `agent:dispatch` creates an agent (starting, then working after 1.5 s), `terminal:open` opens a fake terminal that prints a greeting and echoes input, `state:request` and `issues:refresh` send a snapshot. `agent:stop` and `terminal:resize` do nothing.

### Add a scenario

1. Create `mocks/scenarios/<name>.json`:
   - `name`: the same as the file name.
   - `anchor`: an ISO timestamp. All timestamps in the file refer to it. At start the mock shifts them by `now - anchor`, so an agent with `statusSince` 20 minutes before the anchor has waited 20 minutes when the page loads.
   - `snapshot`: the state at the start (`agents`, `issues`, `version`).
   - `events`: a list of `{ "at": <ms since start>, "event": "state:patch" | "terminal:data" | ..., "payload": ... }`, sorted by `at`. The events and payloads are those of `ServerToClientEvents` in `@gitspore/shared`. Patch versions go up by one; skip one on purpose to test recovery.
2. Add it to `RAW_SCENARIOS` in `mocks/scenarios/index.ts`.

The file is validated when it is loaded, and a mistake is reported with its place in the file. The type of an entry follows the contract, so a change to `@gitspore/shared` shows up as a type error in the mock.

### In components

Components get the client with `useGreenhouseClient()` from `src/lib/client/GreenhouseClientProvider.tsx`, and use the same `on`, `off` and `emit` for the mock and the daemon. Register listeners in an effect that depends on the client and remove them in its cleanup. The provider calls `connect()` afterwards, because the first event (`state:snapshot`) is sent inside `connect()`. Commands sent before that wait and run right after the snapshot, as with the real socket.

At a speed above 1 the scenario runs faster than the clock. Derive waiting times from the mock's clock, not from `Date.now()`: `client.virtualNow() - Date.parse(agent.statusSince)` (the client is a `MockClient`, check it with `useMockClient()`). Otherwise the wilting stages do not play at speed.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
