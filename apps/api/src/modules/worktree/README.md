# Worktree module

Gives every agent its own git worktree: a separate folder of the repo on its own `spore/…` branch, so up to six agents work in parallel without touching each other's files or the user's checkout. The module only creates, lists and removes worktrees. Starting Claude Code in one is the agent ticket (#16).

| File                | Holds                                                                    |
| ------------------- | ------------------------------------------------------------------------ |
| `worktree.service`  | `WorktreeService`: `create`, `list`, `remove`, cleanup at startup        |
| `worktree-error.ts` | `WorktreeError` with a `code` (see [Errors](#errors))                    |
| `branch-name.ts`    | `branchName(issueNumber, title)`, the pure function that builds the name |
| `worktree.module`   | Provides and exports `WorktreeService`; imports `RepoConfigModule`       |

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
- New branches start at the local base branch (`GITSPORE_BASE_BRANCH`, default `main`), never at whatever the main folder has checked out. No fetch.

## API

```ts
create({ issueNumber, issueTitle }): Promise<{ branch, path }>
list(): Promise<{ branch, path }[]>
remove({ path, force?, deleteBranch? }): Promise<void>
```

**`list()`** returns only our worktrees: directly inside `.gitspore-worktrees/<repo>/` **and** on a `spore/` branch. The main folder, worktrees elsewhere and detached ones are left out.

**`remove()`** checks in this order and stops at the first problem, before anything is changed:

1. `outside_root`: the path is not directly in our folder.
2. `not_found`: the path is not in `list()`.
3. `dirty`: `git status` shows modified or untracked files. Skipped with `force`, and when the folder was already deleted by hand.
4. `unmerged`: only with `deleteBranch`. The branch has commits that are not in the base branch (`rev-list --count <base>..<branch>`). Skipped with `force`.

Then `git worktree remove` (`--force` with `force`) and, with `deleteBranch`, `git branch -D`. Without `deleteBranch` the branch is always kept. A folder deleted by hand is fine: `git worktree remove` cleans up its registration.

**Startup.** `onModuleInit()` runs `git worktree prune` (registrations of folders that no longer exist, repo-wide; branches stay) and logs what `list()` finds. It doesn't rebuild agents; that is the state store's job (#16).

## Errors

All refusals are a `WorktreeError` with a `code`. The gateway maps them to the shared `git_failed`.

| Code            | From     | Meaning                                                 |
| --------------- | -------- | ------------------------------------------------------- |
| `branch_exists` | `create` | The branch already exists                               |
| `path_exists`   | `create` | The target folder already exists; it is left alone      |
| `outside_root`  | `remove` | Not a folder directly inside our worktree folder        |
| `not_found`     | `remove` | Not one of our registered worktrees                     |
| `dirty`         | `remove` | Uncommitted changes, including untracked files          |
| `unmerged`      | `remove` | `deleteBranch` on a branch with commits not in the base |

Anything else (git missing, timeout) is simple-git's `GitError`.

## Rules

- **No shell.** simple-git starts git with an argument array, so an issue title can't run commands.
- **One git process at a time.** Every command that changes the repo goes through `run()`, a simple-git instance with `maxConcurrentProcesses: 1` and a 30 s timeout. That is the queue: parallel `create` calls never collide on git's lock files.
- **Read-only commands inside a worktree** (`status`) use a short-lived `simpleGit({ baseDir: path })`. simple-git 4 blocks `git -C`, because the target folder's config could make git run programs.
- **Check first, never parse git's text.** Errors are detected with `show-ref --verify`, `access`, `status` and `rev-list` before the real command runs. Git's messages change with version and language.
- **Compare paths with `resolve` and `dirname`, never `startsWith`.** `my-repo-2` starts with `my-repo`.
- **Use `BRANCH_PREFIX`** from `@gitspore/shared`, never a hand-written `"spore/"`.
- **Lock files are never deleted.** An agent killed mid-commit can leave `.git/worktrees/<name>/index.lock`; the user decides.

## Not handled here

- Checking the issue number (`-1`, `NaN`), the agent limit, and planting the same issue twice: the gateway (#16). Two `create` calls for the same issue at the same moment can both pass the checks; the second fails with a raw `GitError`.
- Merge detection and branch cleanup after a merge: GS-22. A branch squash-merged on GitHub still counts as unmerged locally, so that cleanup needs `force`.

## Tests

`worktree.service.spec.ts` runs against real temporary repos (`initRepo` from `apps/api/test/git-repo.ts`) next to a `.gitspore-worktrees` folder in `os.tmpdir()`, on Ubuntu, macOS and Windows in CI. `branch-name.spec.ts` tests the slug without git. Run them with `npm run test:api`.
