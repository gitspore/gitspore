# 2026-10-05: Project setup

Ticket: #1 (GSP-1). First day of the capstone. This record uses a plain format until the decision-recording skill is set up.

## Decided

**Name.** The project is called gitspore. "Terrarium" was a working name in the first notes.

**Presentation date.** 2026-11-04.

**GitHub organization.** The repo moved from `GPlastok/gitspore` to the organization `gitspore` (`gitspore/gitspore`). It was imported, so the new repo is a copy with the full git history. Nothing else was lost: the old repo had no issues or PRs. The old repo still exists and should be archived so nobody pushes to it.

**Team access.** The org team `core` (GPlastok, thomasweigert91, yaroslavthedev) has write access to the repo. The project board is internal, and every org member can edit it, so it needs no team access.

**Board.** https://github.com/orgs/gitspore/projects/1, created by Thomas. Columns: Backlog, Ready, In progress, In review, Done. Linked to the repo, automations on.

**Git workflow.** Never work on `main`. One branch per ticket, `GSP-<issue number>_<Short-Name>`; the GSP number is the GitHub issue number. Merge only through a PR after review.

**project-management/ folder.** Concept, research, scope and records live in the repo next to the code, in `project-management/`. Nothing in it ships. Folders: `concept/`, `research/` (with `inspiration/`), `records/`, plus `scope.md`. Kept minimal on purpose; folders get added when there is content for them.

**Two CLAUDE.md files.** The root `CLAUDE.md` is for code work and stays short. `project-management/CLAUDE.md` is for concept and planning work; Claude loads it when started inside that folder or when it reads files there. Deeper folders get a `CONTEXT.md` with their own rules.

**Images.** The repo is public, so third-party images are never committed; publishing them needs the creator's permission. They go in `_assets/` folders, which git ignores. The repo keeps links and our own descriptions.

**Language.** English for now. Mixed languages may come later.

**Graphics.** The stack in `concept/v1_initial-idea.md` now lists React Three Fiber with Three.js; PixiJS was taken out.

## Not decided yet

- Branch protection for `main` (ruleset requiring a PR and one approval). Not active yet.
- Repo milestones M1 to M4 are not created yet.
- Scope: `scope.md` holds the first notes, marked temporary.
- Format for decision records: comes with the decision-recording skill.