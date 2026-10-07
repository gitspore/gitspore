# Project management

This folder holds the work around gitspore: ideas, research, scope and records. Nothing here ships. Start Claude inside this folder (`cd project-management && claude`) for concept and planning sessions; the root `CLAUDE.md` loads as well.

We are in the research phase. Expect files to move and get renamed.

## Where things go

| Folder or file | Contents | Read first |
|---|---|---|
| `concept/` | Versions and ideas of what gitspore is | this file |
| `research/` | Input for the concept: questions, findings, references | this file |
| `research/inspiration/` | Moodboard: visual references and aesthetics | `research/inspiration/CONTEXT.md` |
| `records/` | Decisions, meeting notes, work log, retrospectives | `records/CONTEXT.md` |
| `scope.md` | What we build in 4 weeks, in what order, what gets cut | this file |
| `penpot.md` | The Penpot design file: MCP setup, what each page holds, rules for sessions | `penpot.md` |

## Conventions

- Write in English for now. Quoted German source material can stay German.
- Markdown files, lowercase names with hyphens.
- Add a section to an existing file before creating a new file. Create a folder only when there is content for it.
- `concept/main.md` is the current concept. Read it first for any concept work.
- Concept versions are whole files named `v<n>_<name>.md`. A new version gets a new file; old versions stay so we can compare. Loose ideas that are not a full version go in `concept/ideas.md`.
- A research topic starts as a section in `research/questions.md` and moves to its own file once it outgrows the section.
- When something gets decided, record it in `records/` and update the file it affects (scope, concept, questions).
- Tasks and their status live on the GitHub board, not here: https://github.com/orgs/gitspore/projects/1
- Never commit third-party images. See `research/inspiration/CONTEXT.md`.
