import type { RepoCheck } from "@gitspore/shared";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { branchExists, findRepoRoot } from "@/config/find-repo";
import type { GitHubConnection } from "../github/github-source";

// GitHub and Claude Code come in as parameters, so tests run neither gh nor
// claude.
export type CheckDeps = {
  connectGitHub: (top: string) => Promise<GitHubConnection>;
  claudeInstalled: () => Promise<boolean>;
};

/**
 * What the setup screen shows for a path, one line per RepoCheckItem in its
 * order. Without a git repo the branch and GitHub are left out: both need
 * one. Changes nothing.
 */
export async function checkRepo(
  path: string,
  baseBranch: string,
  deps: CheckDeps,
): Promise<RepoCheck[]> {
  const checks: RepoCheck[] = [];
  const root = await findRepoRoot(expandHome(path));

  if ("problem" in root) {
    checks.push({
      item: "git",
      result: "fail",
      detail:
        root.problem === "not_found"
          ? `${path} does not exist.`
          : "Not a git repository. Run git init there.",
    });
  } else {
    checks.push({ item: "git", result: "ok", detail: basename(root.top) });

    checks.push(
      (await branchExists(root.top, baseBranch))
        ? { item: "base_branch", result: "ok", detail: `${baseBranch} exists` }
        : {
            item: "base_branch",
            result: "fail",
            detail: `No branch ${baseBranch}. Choose another one.`,
          },
    );

    // No GitHub is a warning, not a failure: agents work, issues don't sync.
    const github = await deps.connectGitHub(root.top);
    checks.push(
      "disabled" in github
        ? { item: "github", result: "warn", detail: github.disabled }
        : {
            item: "github",
            result: "ok",
            detail: `${github.repo.owner}/${github.repo.repo}`,
          },
    );
  }

  checks.push(
    (await deps.claudeInstalled())
      ? { item: "claude", result: "ok", detail: "found" }
      : {
          item: "claude",
          result: "fail",
          detail: "Not found. Install Claude Code, then check again.",
        },
  );
  return checks;
}

/**
 * A pasted path may start with ~, which only a shell expands. Both
 * separators: on Windows it is ~\code\repo.
 */
export function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (/^~[\\/]/.test(path)) return join(homedir(), path.slice(2));
  return path;
}
