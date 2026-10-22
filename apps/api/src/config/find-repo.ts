import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { simpleGit } from "simple-git";

// The git checks of a repo path, shared by the start (loadRepoConfig) and
// the setup screen.

/** The top level of the repo a path is in, or why there is none. */
export type RepoRoot =
  { top: string } | { problem: "not_found" | "not_a_repo" };

export async function findRepoRoot(path: string): Promise<RepoRoot> {
  const dir = resolve(path);
  // simpleGit throws for a folder that doesn't exist, so look first.
  const info = await stat(dir).catch(() => undefined);
  if (!info?.isDirectory()) return { problem: "not_found" };

  try {
    const top = await simpleGit(dir).revparse(["--show-toplevel"]);
    return { top: resolve(top) };
  } catch {
    return { problem: "not_a_repo" };
  }
}

export async function branchExists(
  top: string,
  branch: string,
): Promise<boolean> {
  try {
    await simpleGit(top).raw(["show-ref", "--verify", `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
}
