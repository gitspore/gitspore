import { resolve } from "node:path";
import { RepoConfig } from "./repo-config";
import { stat } from "node:fs/promises";
import { simpleGit } from "simple-git";

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
  const info = await stat(repoPath).catch(() => undefined);
  if (!info?.isDirectory()) {
    throw new Error(
      `GITSPORE_REPO points to ${repoPath}, which does not exist or is not a folder.`,
    );
  }

  let topLevel: string;
  try {
    topLevel = await simpleGit(repoPath).revparse(["--show-toplevel"]);
  } catch {
    throw new Error(
      `GITSPORE_REPO points to ${repoPath} which is not inside a git repository.`,
    );
  }

  const top = resolve(topLevel);
  const base = env.GITSPORE_BASE_BRANCH ?? "main";
  try {
    await simpleGit(top).raw(["show-ref", "--verify", `refs/heads/${base}`]);
  } catch {
    throw new Error(
      `Base branch "${base}" does not exist in ${top}. Set GITSPORE_BASE_BRANCH to the branch new worktrees should start from (master or main etc.).`,
    );
  }

  return new RepoConfig(top, base);
}
