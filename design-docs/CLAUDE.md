# Design docs

`design-docs/` describes the current state of gitspore: concept, scope, decisions, design. It is not part of the app; never import from it or include it in a build. Start with `README.md`.

## Rules

- A doc describes what is true now. When something changes, edit or delete the old text; git keeps the history. No version numbers in file names, no archive folders.
- A decision gets a new file in `decisions/` (next free number, `NNNN-short-name.md`, sections Status, Date, Context, Decision, Alternatives, Consequences) and an edit to every doc it affects. Never rewrite an old decision; a new one supersedes it and says so. Add it to the table in `README.md`.
- Visual changes happen in Penpot first (`design/penpot.md`), then in `design/components.md`.
- Tasks and their status live on the board, not here: https://github.com/orgs/gitspore/projects/1
- Images: WebP, only what a doc shows, re-exported only when it changes. Every image version stays in git history forever.
- Write in English, plain and short.

Research, explorations and process records live in the separate `gitspore/workbench` repo, not here.
