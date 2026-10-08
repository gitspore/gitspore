# Konfigurationsentscheidungen

Kurz festgehalten, damit später nachvollziehbar ist, _warum_ etwas so
eingerichtet ist. Neue Einträge oben anfügen.

## GS-02 – Monorepo-Gerüst und CI (2026-10-06)

### Node 24 (aktuelle LTS) statt Node 20

Wir verwenden Node 24 statt des im Ticket genannten Node 20. Node 20 ist seit
30.04.2026 End-of-Life; Node 24 ist die aktuelle LTS (Active LTS, Support bis
April 2028) und entspricht der lokal genutzten Version, sodass lokale Läufe
und CI dieselbe Hauptversion testen. Festgelegt in `.nvmrc`, `engines` im Root
und der CI-Matrix.

### Datenbank-Dependencies entfernt

`better-sqlite3`, `drizzle-orm` und `drizzle-kit` wurden aus `apps/api`
entfernt, weil sie ungenutzt waren. `better-sqlite3` scheiterte auf Windows
ohne C++-Build-Tools. Die Speicher-Entscheidung (SQLite, `node:sqlite` oder
JSON-Event-Log) ist noch offen und wird im Team getroffen. Sie werden
hinzugefügt, sobald die Entscheidung fällt.

### Nur npm Workspaces, keine zusätzlichen Build-Tools

Kein Turborepo, kein Docker. Die Build-Reihenfolge ergibt sich aus der
Reihenfolge in `workspaces` (`packages/*` vor `apps/*`): npm führt
`--workspaces`-Skripte in dieser Reihenfolge aus, also wird `shared` zuerst
gebaut.

### `@gitspore/shared` wird nach `dist/` kompiliert (CommonJS + `.d.ts`)

`apps/api` läuft als kompiliertes CommonJS unter Node und kann kein
TypeScript-Quellpaket laden; Next bündelt beide Formate. `typecheck` und
`test` im Root bauen `shared` deshalb vorab (`npm run build:shared`), weil
`types` auf `dist/` zeigt.

### Gemeinsame Konfiguration im Root, dünne Configs pro Workspace

- `tsconfig.base.json` enthält nur workspaceübergreifende Optionen (`strict`,
  `skipLibCheck`, `isolatedModules`, `esModuleInterop`,
  `forceConsistentCasingInFileNames`). Modulsystem und Target bleiben pro
  Workspace, weil Next (Bundler) und API/shared (Node, CommonJS) verschieden
  sind.
- `eslint.base.mjs` (`@eslint/js` + `typescript-eslint` recommended +
  `eslint-config-prettier`) wird von jeder `eslint.config.mjs` gespreadet;
  `apps/web` ergänzt `eslint-config-next`. ESLint 9 sucht die Config ab dem
  Arbeitsverzeichnis, deshalb hat jeder Workspace eine eigene Datei.
- `typescript` und `eslint` sind im Root deklariert (eine Version für alle);
  `eslint-config-next` bleibt in `apps/web`.

### Prettier mit dem bisherigen Stil

Doppelte Anführungszeichen, Semikolons, trailing commas, also der Stil, den
der Code schon hatte. Das Repo wurde einmalig formatiert (nur Formatierung).
`npm run lint` prüft Prettier mit, damit die CI Formatabweichungen meldet.

### `.gitattributes` mit `eol=lf`

Mit `core.autocrlf=true` (Windows-Standard, auch auf dem Windows-Runner)
würden Dateien als CRLF ausgecheckt und `prettier --check` schlüge fehl.
`* text=auto eol=lf` erzwingt LF auf allen Plattformen.

### `apps/web`: `output: 'export'`

`next build` erzeugt einen statischen Export in `apps/web/out/`. Folge:
`next start` funktioniert damit nicht mehr (das Skript ist noch vorhanden);
Server-Features wie Route Handlers mit Request-Daten, Middleware oder
On-Demand-ISR stehen nicht zur Verfügung. `typecheck` ruft vorher
`next typegen` auf, weil `layout.tsx` die generierten `LayoutProps` nutzt.

### Shell-Auswahl für PTYs

`getDefaultShell(platform, env)` in `apps/api/src/common/shell.ts`: Windows →
`powershell.exe`, sonst `$SHELL`, Fallback `/bin/sh`. Plattform und Umgebung
sind Parameter, damit beide Zweige auf jedem OS testbar sind. Der
`node-pty`-Smoketest (`pty.smoke.spec.ts`) startet die echte Shell und
erwartet eine Ausgabezeile `gitspore`; er fängt fehlende Prebuilds oder einen
gescheiterten `node-gyp`-Build ab.

Unter Windows beendet der Test die Shell mit `kill()`. Das erzeugt einen
harmlosen Trace und verzögert das Prozessende um einige Sekunden (siehe
„Offen für GS-03“). Der Test bleibt grün; `--forceExit` wird bewusst nicht
gesetzt, um echte Leaks in anderen Tests nicht zu verdecken.

### CI

GitHub Actions auf ubuntu/macos/windows mit Node 24, `fail-fast: false`,
npm-Cache über `actions/setup-node`. Auf Windows wird `core.longpaths` vor dem
Checkout gesetzt. Laufende Pipelines desselben Branches werden bei neuem Push
abgebrochen.

### npm `allowScripts`: node-pty vorsorglich freigegeben

`node-pty` ist in der Root-`package.json` unter `allowScripts` freigegeben
(`npm approve-scripts node-pty`). Unter Linux gibt es kein Prebuild, das
Install-Skript muss dort `node-gyp rebuild` ausführen dürfen.

Wichtig: In npm 11.16 greift `allowScripts` noch nicht. Freigaben und Sperren
sind nur beratend, Install-Skripte laufen weiterhin immer; npm meldet lediglich
nicht freigegebene Pakete (derzeit `esbuild`, `@parcel/watcher`,
`unrs-resolver`). Erst ein künftiges npm-Release blockiert nicht freigegebene
Skripte. Die Freigabe ist also Vorsorge für diesen Zeitpunkt.

Die Freigabe ist auf die Version gepinnt (`node-pty@1.1.0`, npm-Standard).
Nach einem Update von `node-pty` muss `npm approve-scripts node-pty` erneut
laufen, sonst würde der Linux-Build blockiert, sobald npm die Regel durchsetzt.

### macOS: Ausführungsrechte für node-pty `spawn-helper`

- **Problem:** Auf macos-latest schlug der node-pty-Smoke-Test mit
  `posix_spawnp failed` fehl.
- **Ursache:** Die mitgelieferte Datei
  `node_modules/node-pty/prebuilds/darwin-*/spawn-helper` hat nach der
  npm-Installation keine Ausführungsrechte. node-pty startet jede Shell über
  dieses Hilfsprogramm, ohne `+x` scheitert `posix_spawnp`.
- **Lösung:** `scripts/fix-node-pty-permissions.mjs` (nur Node-Bordmittel) läuft
  als `postinstall` im Root und setzt für jede gefundene `spawn-helper`-Datei
  in den `darwin-*`-Ordnern die Rechte auf `0o755`. Auf anderen Plattformen
  oder ohne node-pty beendet es sich still.
- **Entfernen:** Sobald node-pty das Problem selbst behebt (Paket mit korrekten
  Rechten), können Skript und `postinstall`-Eintrag wieder entfernt werden.

### Offen für GS-03: sauberes Beenden von PTY-Prozessen unter Windows

`node-pty@1.1.0` beendet unter Windows (Standard-ConPTY) Shells nicht sauber.
Gemessen mit PowerShell außerhalb von Jest:

| Variante                                 | Trace | Exit-Event      | Prozessende    |
| ---------------------------------------- | ----- | --------------- | -------------- |
| nur `kill()` (aktueller Smoke-Test)      | ja    | nach ~0,5 s     | nach ~5,5 s    |
| `exit` senden, auf Exit-Event warten     | nein  | sauber (Code 0) | hängt (> 40 s) |
| `exit` senden, Exit-Event, dann `kill()` | ja    | sauber (Code 0) | nach ~6,4 s    |

- `kill()` startet asynchron einen Hilfsprozess
  (`conpty_console_list_agent`), der sich an die Konsole der Shell hängen
  will, schließt die Konsole aber sofort. Daher auf stderr
  `Error: AttachConsole failed`.
- Endet die Shell von selbst, bleiben Conout-Worker und Pipes offen, bis
  `kill()` sie freigibt; ohne `kill()` endet der Node-Prozess nie.
- Mit `useConptyDll: true` (mitgelieferte `conpty.dll`) verschwindet der
  Trace; das Nachlaufen des Prozesses blieb im Test bestehen.

Für GS-03 zu klären: ob der PTY-Dienst `useConptyDll` nutzt, wie Sessions
beim Herunterfahren des Daemons beendet werden, und ob eine neuere
`node-pty`-Version das Verhalten behebt.
