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

| Variable               | Standard                      | Wirkung                                                                                                                                                                                                                         |
| ---------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WEB_ORIGIN`           | `http://localhost:3000`       | Erlaubte `Origin`-Werte des Web-Clients, mehrere kommagetrennt. Der Vergleich ist exakt: `http://127.0.0.1:3000` ist ein anderer Origin als `http://localhost:3000`.                                                            |
| `GITSPORE_REPO`        | Repo, in dem der Daemon läuft | Pfad zum Git-Repository, in dem gitspore Worktrees anlegt. Ein Unterordner wird auf den Repo-Stamm aufgelöst. Ein gesetzter, aber ungültiger Pfad stoppt den Daemon. Der Standard gilt vorläufig, bis es den Setup-Screen gibt. |
| `GITSPORE_BASE_BRANCH` | `main`                        | Lokaler Branch, von dem neue Worktrees abzweigen. Muss lokal existieren.                                                                                                                                                        |

### GitHub-Sync

Der Daemon liest die offenen Issues des Repos, in dem er arbeitet, und prüft die Pull Requests der Agent-Branches. Repo und Owner kommen aus der Remote `origin`; sie muss auf `github.com` zeigen. Das Token sucht er in dieser Reihenfolge:

1. `GITHUB_TOKEN` aus der Umgebung
2. `gh auth token`, wenn die [GitHub CLI](https://cli.github.com/) installiert und angemeldet ist (`gh auth login`)

Ohne Remote oder Token läuft der Daemon trotzdem, nur ohne Issues; der Browser bekommt einmal den Fehler `github_sync_disabled` mit dem Grund. Das Token wird nie geloggt und nie an den Browser geschickt. Für ein privates Repo braucht es Leserechte auf Issues und Pull Requests. Details: [apps/api/src/modules/github/README.md](apps/api/src/modules/github/README.md).

| Variable       | Standard        | Wirkung                                                                                   |
| -------------- | --------------- | ----------------------------------------------------------------------------------------- |
| `GITHUB_TOKEN` | `gh auth token` | Token für die GitHub-API. Ein geändertes Token gilt erst nach einem Neustart des Daemons. |

Konfigurationsentscheidungen stehen in [docs/decisions.md](docs/decisions.md).
