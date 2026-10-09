import { loadRepoConfig } from "./load-repo-config";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { mkdtemp, mkdir, realpath, rm } from "node:fs/promises";
import { simpleGit } from "simple-git";

//
//
//
// A real repo with one empty commit on `branch`.
async function initRepo(dir: string, branch = "main") {
  const git = simpleGit(dir);
  await git.init(["--initial-branch", branch]);
  await git.addConfig("user.name", "gitspore test");
  await git.addConfig("user.email", "test@gitspore.invalid");
  await git.addConfig("commit.gpgsign", "false");
  await git.raw(["commit", "--allow-empty", "-m", "initial"]);
  return git;
}

describe("loadRepoConfig", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "gitspore-config-"));
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("refuses to start when GITSPORE_REPO is not set", async () => {
    await expect(loadRepoConfig({})).rejects.toThrow("GITSPORE_REPO");
  });

  it("refuses a path that does not exist", async () => {
    const missing = join(tmpdir(), `gitspore-missing-${randomUUID()}`);

    await expect(loadRepoConfig({ GITSPORE_REPO: missing })).rejects.toThrow(
      missing,
    );
  });

  it("refuses a folder that is not a git repository", async () => {
    await expect(loadRepoConfig({ GITSPORE_REPO: dir })).rejects.toThrow(
      "not inside a git repository",
    );
  });

  it("resolves a subfolder to the repo's top level", async () => {
    await initRepo(dir);

    const sub = join(dir, "apps", "api");
    await mkdir(sub, { recursive: true });

    const config = await loadRepoConfig({ GITSPORE_REPO: sub });

    expect(config.repoPath()).toBe(await realpath(dir));
  });

  it("refuses a repository without the base branch", async () => {
    await initRepo(dir, "test-branch");

    const result = loadRepoConfig({ GITSPORE_REPO: dir });

    await expect(result).rejects.toThrow('"main"');
    await expect(result).rejects.toThrow("GITSPORE_BASE_BRANCH");
  });

  it("returns the absolute repository path and the base branch", async () => {
    await initRepo(dir);

    const config = await loadRepoConfig({
      GITSPORE_REPO: relative(process.cwd(), dir),
    });

    expect(config.repoPath()).toBe(await realpath(dir));
    expect(config.baseBranch()).toBe("main");
  });

  it("uses GITSPORE_BASE_BRANCH when it is set", async () => {
    await initRepo(dir, "test-branch");

    const config = await loadRepoConfig({
      GITSPORE_REPO: dir,
      GITSPORE_BASE_BRANCH: "test-branch",
    });

    expect(config.baseBranch()).toBe("test-branch");
  });
});
