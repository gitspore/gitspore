# GitSpore

npm-Workspaces-Monorepo:

| Workspace         | Inhalt                                                     |
| ----------------- | ---------------------------------------------------------- |
| `apps/web`        | Next.js-Frontend, gebaut als statischer Export nach `out/` |
| `apps/api`        | NestJS-Daemon (Terminal/PTY, Git, WebSockets)              |
| `packages/shared` | Gemeinsame Typen und Konstanten (`@gitspore/shared`)       |

## Lokales Setup

### Voraussetzungen

- **Node.js 24** (siehe `.nvmrc`) mit dem mitgelieferten npm 11
- **Git**; unter Windows einmalig `git config --global core.longpaths true`
- **Build-Tools nur unter Linux** (für `node-pty`). Für Windows und macOS
  liefert `node-pty` Prebuilds mit, dort sind keine C++-Build-Tools nötig.
  Unter Linux wird es per `node-gyp` gebaut und braucht Python 3, `make` und
  einen C++-Compiler (z. B. `sudo apt install build-essential python3`).

### Installation

```bash
npm install
```

Damit werden alle Workspaces installiert und `@gitspore/shared` in
`node_modules` verlinkt. Für reproduzierbare Installationen (wie in der CI)
`npm ci` verwenden.

### Skripte

Alle Skripte werden im Repo-Root ausgeführt:

| Skript              | Wirkung                                                             |
| ------------------- | ------------------------------------------------------------------- |
| `npm run dev`       | Startet Web (Port 3000) und API (Port 3001) parallel                |
| `npm run typecheck` | Baut `shared`, dann `tsc --noEmit` in allen Workspaces              |
| `npm run lint`      | ESLint in allen Workspaces, danach `prettier --check`               |
| `npm run format`    | Formatiert das ganze Repo mit Prettier                              |
| `npm run build`     | Baut `shared`, `api` (nach `dist/`) und `web` (nach `out/`)         |
| `npm run test`      | Baut `shared`, dann Jest in `apps/api` (inkl. `node-pty`-Smoketest) |

Einzelne Workspaces: `npm run <skript> --workspace @gitspore/<name>`.

### Daemon-Sicherheit

Der Daemon bindet nur an `127.0.0.1`. Bei jedem Start erzeugt er einen zufälligen Session-Token und gibt ihn einmal im Log aus (`Session token: …`). Der Web-Client schickt ihn als `auth.token` im Socket.io-Handshake. Verbindungen ohne gültigen Token, mit unbekanntem `Origin` oder mit einem `Host`, der nicht `localhost`, `127.0.0.1` oder `[::1]` ist, werden abgelehnt.

| Variable               | Standard                | Wirkung                                                                                                                                                              |
| ---------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WEB_ORIGIN`           | `http://localhost:3000` | Erlaubte `Origin`-Werte des Web-Clients, mehrere kommagetrennt. Der Vergleich ist exakt: `http://127.0.0.1:3000` ist ein anderer Origin als `http://localhost:3000`. |
| `GITSPORE_REPO`        | – (Pflicht)             | Pfad zum Git-Repository, in dem gitspore Worktrees anlegt. Ein Unterordner wird auf den Repo-Stamm aufgelöst. Ohne gültiges Repo startet der Daemon nicht.           |
| `GITSPORE_BASE_BRANCH` | `main`                  | Lokaler Branch, von dem neue Worktrees abzweigen. Muss lokal existieren.                                                                                             |

Konfigurationsentscheidungen stehen in [docs/decisions.md](docs/decisions.md).
