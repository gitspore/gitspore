# Worktree module

Gives every agent its own git worktree: a separate folder of the repo on its own `spore/…` branch, so up to six agents work in parallel without touching each other's files or the user's checkout. The module creates, lists and removes worktrees, and puts their branches on origin. Starting Claude Code in one is the agent ticket (GS-66).

| File                | Holds                                                                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `worktree.service`  | `WorktreeService`: `create`, `leftoverFor`, `open`, `list`, `remove`, `fetch`, `publish`, `deleteRemoteBranch`, `isClean`, `ensureExcluded`, cleanup at startup |
| `worktree-error.ts` | `WorktreeError` with a `code` (see [Errors](#errors))                                                                                                           |
| `worktree.module`   | Provides and exports `WorktreeService`; imports `RepoConfigModule`                                                                                              |

The branch name comes from `branchForIssue(issueNumber, title)` in `packages/shared/src/branch.ts`, next to `issueNumberFromBranch`, which reads the number back.

## Where worktrees go

```
<parent>/
├── my-repo/                                  the repo (GITSPORE_REPO)
└── .gitspore-worktrees/my-repo/
    ├── 42-fix-login/                         branch spore/42-fix-login
    └── 57-add-dark-mode/                     branch spore/57-add-dark-mode
```

- Branch: `BRANCH_PREFIX` + issue number + slug of the title (lowercase ASCII, words joined by `-`, at most 40 characters). A title with nothing usable gives `spore/42`.
- Folder: the branch name without `BRANCH_PREFIX`, so the two can't disagree.
- `my-repo` is the folder name of the checkout the daemon runs in. Started inside a linked worktree, the daemon gets its own subfolder.
- New branches start at `startPoint` when it is given (the dispatch passes `origin/<base>` after `fetch()`), otherwise at the local base branch (`GITSPORE_BASE_BRANCH`, default `main`). Never at whatever the main folder has checked out.

## API

```ts
create({ issueNumber, issueTitle, startPoint? }): Promise<{ branch, path }>
leftoverFor({ issueNumber, issueTitle }): Promise<{ branch, path | null, local, onOrigin } | null>
open(leftover): Promise<{ branch, path }>
list(): Promise<{ branch, path }[]>
remove({ path, force?, deleteBranch? }): Promise<void>

fetch(): Promise<void>
publish(branch): Promise<void>
deleteRemoteBranch(branch): Promise<void>
isClean(path): Promise<boolean>
ensureExcluded(pattern): Promise<void>
```

**`create()`** refuses with `branch_exists` when the branch exists locally. With `startPoint` it also asks origin (`ls-remote --heads origin refs/heads/<branch>`): `fetch()` only updates the base branch, so `origin/<branch>` may be missing or stale. A missing branch is empty output, not an error; an unreachable origin throws and never counts as "free". Without `startPoint`, `create()` does not talk to origin.

**`leftoverFor()`** finds the branch an earlier agent left for the issue (#102): local branches (`for-each-ref refs/heads/`) and origin's (`ls-remote --heads origin`) whose number (`issueNumberFromBranch`) is the issue's. By number, not by name, so a renamed issue still finds its branch; `spore/420-…` is not #42's. Of several, the one `planFor` would make, else the first by name. `path` is its worktree if `list()` still has one. An unreachable origin throws.

**`open(leftover)`** makes a worktree for a branch that exists: `git worktree add <path> <branch>` for a local one; for one only on origin it fetches `refs/heads/<branch>` and runs `worktree add --track -b <branch> <path> origin/<branch>`. The folder comes from the branch name. Nothing is pushed. It refuses `not_ours` and an existing folder (`path_exists`).

**`fetch()`** runs `git fetch origin <base>`. It updates `origin/<base>` and leaves every local branch, the user's checkout and the local base branch alone. The daemon never pulls.

**`publish(branch)`** runs `git push -u origin <branch>`. A failed push (no login, no rights, offline) is `push_failed`. **`deleteRemoteBranch(branch)`** runs `git push origin --delete <branch>`, for a dispatch that is rolled back. Both refuse any branch that does not start with `BRANCH_PREFIX` (`not_ours`), so a bug can never push or delete `main`.

**`isClean(path)`** is true when `git status --porcelain --untracked-files=all` in the worktree is empty.

**`ensureExcluded(pattern)`** adds `pattern` (the dispatch uses `.gitspore/`) to `<git-common-dir>/info/exclude` once. Worktrees read the main repo's file, so one line covers all of them, and nothing there shows up in `git status` or a commit. Two calls at the same moment can both add the line; a duplicate line is harmless.

**`list()`** returns only our worktrees: directly inside `.gitspore-worktrees/<repo>/` **and** on a `spore/` branch. The main folder, worktrees elsewhere and detached ones are left out.

**`remove()`** checks in this order and stops at the first problem, before anything is changed:

1. `outside_root`: the path is not directly in our folder.
2. `not_found`: the path is not in `list()`.
3. `dirty`: `git status` shows modified or untracked files. Skipped with `force`, and when the folder was already deleted by hand.
4. `unmerged`: only with `deleteBranch`. The branch has commits that are not in the base branch (`rev-list --count <base>..<branch>`). Skipped with `force`.

Then `git worktree remove` (`--force` with `force`) and, with `deleteBranch`, `git branch -D`. Without `deleteBranch` the branch is always kept. A folder deleted by hand is fine: `git worktree remove` cleans up its registration.

**Startup.** `onModuleInit()` runs `git worktree prune` (registrations of folders that no longer exist, repo-wide; branches stay) and logs what `list()` finds. It doesn't rebuild agents; the agent module takes the worktrees over (#102).

## Errors

All refusals are a `WorktreeError` with a `code`. The agent module maps `push_failed` to the shared `git_push_failed` and every other code to `git_failed`.

| Code            | From                                    | Meaning                                                 |
| --------------- | --------------------------------------- | ------------------------------------------------------- |
| `branch_exists` | `create`                                | The branch already exists, locally or on origin         |
| `path_exists`   | `create`, `open`                        | The target folder already exists; it is left alone      |
| `outside_root`  | `remove`                                | Not a folder directly inside our worktree folder        |
| `not_found`     | `remove`                                | Not one of our registered worktrees                     |
| `dirty`         | `remove`                                | Uncommitted changes, including untracked files          |
| `unmerged`      | `remove`                                | `deleteBranch` on a branch with commits not in the base |
| `push_failed`   | `publish`                               | The push to origin failed; the message says why         |
| `not_ours`      | `publish`, `deleteRemoteBranch`, `open` | The branch does not start with `BRANCH_PREFIX`          |

Anything else (git missing, timeout) is simple-git's `GitError`.

## Rules

- **No shell.** simple-git starts git with an argument array, so an issue title can't run commands.
- **One git process at a time.** Every command that changes the repo or talks to origin goes through `run()`, a simple-git instance with `maxConcurrentProcesses: 1`. That is the queue: parallel `create` calls never collide on git's lock files.
- **One 60 s timeout for all commands.** It is a "no output for 60 s" limit, not a total time. `fetch`, `push` and `ls-remote` wait for the network, and simple-git sets the timeout per instance: a second instance for remote commands would have its own queue, so two git commands could run at once.
- **Git never asks for a login.** `run()` passes `GIT_TERMINAL_PROMPT=0` and `GCM_INTERACTIVE=never` (Git Credential Manager on Windows), so a missing login is an error instead of a process that waits. simple-git 4 has an environment guard: it drops `GIT_*`, `EDITOR`, `PAGER`, `PREFIX`, `SSH_ASKPASS` and `VISUAL` from the environment, and throws if one of them is passed through `.env()` without `allowEnvironment`. `gitEnv()` therefore copies the environment without those names (VS Code sets `GIT_ASKPASS`) and allows only `GIT_TERMINAL_PROMPT`. Not covered: an SSH remote whose key has a passphrase, because `ssh` asks by itself.
- **Read-only commands inside a worktree** (`status`) use a short-lived `simpleGit({ baseDir: path })`. simple-git 4 blocks `git -C`, because the target folder's config could make git run programs.
- **Check first, never parse git's text.** Errors are detected with `show-ref --verify`, `access`, `status` and `rev-list` before the real command runs. Git's messages change with version and language.
- **Compare paths with `resolve` and `dirname`, never `startsWith`.** `my-repo-2` starts with `my-repo`.
- **Use `BRANCH_PREFIX`** from `@gitspore/shared`, never a hand-written `"spore/"`.
- **Lock files are never deleted.** An agent killed mid-commit can leave `.git/worktrees/<name>/index.lock`; the user decides.

## Not handled here

- Checking the issue number (`-1`, `NaN`), the agent limit, and planting the same issue twice: the gateway (#16). Two `create` calls for the same issue at the same moment can both pass the checks; the second fails with a raw `GitError`.
- Merge detection and branch cleanup after a merge: GS-48, in the agent module. A branch squash-merged on GitHub still counts as unmerged locally, so that cleanup needs `force`.

## Tests

`worktree.service.spec.ts` runs against real temporary repos (`initRepo` from `apps/api/test/git-repo.ts`) next to a `.gitspore-worktrees` folder in `os.tmpdir()`, on Ubuntu, macOS and Windows in CI. For the remote methods, `initOrigin` adds a bare repo in the same temp folder as `origin`, and `pushFromElsewhere` plays someone else who pushes to it. The login test points origin at a local HTTP server that answers 401 and runs without a credential helper, so the machine's Git Credential Manager cannot open a window. Under Jest git has no console to ask in, so that test passes even without `GIT_TERMINAL_PROMPT=0`; a dispatch without a login is checked by hand. The branch name rules are tested in `packages/shared/src/branch.spec.ts`. Run them with `npm run test:api`.
