import { resolve } from "node:path";
import { RepoConfig } from "./repo-config";
import { branchExists, findRepoRoot } from "./find-repo";
import type { RepoMemory } from "./repo-memory";

/**
 * The repo the daemon starts with (#58): GITSPORE_REPO when it is set (a
 * wrong one stops the daemon, see loadRepoConfig), otherwise the last repo
 * chosen on the setup screen if it still has its base branch, otherwise
 * none, and the setup screen shows.
 */
export async function startRepoConfig(
  env: NodeJS.ProcessEnv,
  memory: RepoMemory,
): Promise<RepoConfig> {
  if (env.GITSPORE_REPO) return loadRepoConfig(env);

  const [last] = await memory.recent();
  if (last) {
    const root = await findRepoRoot(last.path);
    if ("top" in root && (await branchExists(root.top, last.baseBranch))) {
      return new RepoConfig(root.top, last.baseBranch);
    }
  }
  return new RepoConfig(null, env.GITSPORE_BASE_BRANCH ?? "main");
}

//
//
//
export async function loadRepoConfig(
  env: NodeJS.ProcessEnv,
): Promise<RepoConfig> {
  const repo = env.GITSPORE_REPO;
  if (!repo) {
    throw new Error(
      "GITSPORE_REPO is not set. Set it to the path of the git repository gitspore should work in.",
    );
  }
  const repoPath = resolve(repo);
  const root = await findRepoRoot(repoPath);
  if ("problem" in root) {
    throw new Error(
      root.problem === "not_found"
        ? `GITSPORE_REPO points to ${repoPath}, which does not exist or is not a folder.`
        : `GITSPORE_REPO points to ${repoPath} which is not inside a git repository.`,
    );
  }

  const base = env.GITSPORE_BASE_BRANCH ?? "main";
  if (!(await branchExists(root.top, base))) {
    throw new Error(
      `Base branch "${base}" does not exist in ${root.top}. Set GITSPORE_BASE_BRANCH to the branch new worktrees should start from (master or main etc.).`,
    );
  }

  return new RepoConfig(root.top, base);
}
