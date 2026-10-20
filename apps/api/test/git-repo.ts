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

export async function initOrigin(repo: string, dir: string, branch = "main") {
  await simpleGit().raw(["init", "--bare", `--initial-branch=${branch}`, dir]);
  const git = simpleGit(repo);
  await git.addRemote("origin", dir);
  await git.raw(["push", "-u", "origin", branch]);
  return dir;
}

export async function pushFromElsewhere(
  origin: string,
  dir: string,
  branch = "main",
) {
  await simpleGit().clone(origin, dir);
  const git = simpleGit(dir);
  await git.addConfig("user.name", "someone else");
  await git.addConfig("user.email", "else@gitspore.invalid");
  await git.addConfig("commit.gpgsign", "false");
  await git.raw(["commit", "--allow-empty", "-m", "from elsewhere"]);
  await git.raw(["push", "origin", branch]);
  return git.revparse(["HEAD"]);
}
