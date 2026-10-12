import { simpleGit } from "simple-git";

//
//
//
// A real repo with one empty commit on `branch`.
export async function initRepo(dir: string, branch = "main") {
  const git = simpleGit(dir);
  await git.init(["--initial-branch", branch]);
  await git.addConfig("user.name", "gitspore test");
  await git.addConfig("user.email", "test@gitspore.invalid");
  await git.addConfig("commit.gpgsign", "false");
  await git.raw(["commit", "--allow-empty", "-m", "initial"]);
  return git;
}
