import { resolve } from "node:path";
import { RepoConfig } from "./repo-config";
import { stat } from "node:fs/promises";

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

  return new RepoConfig(repo, repoPath);
}
