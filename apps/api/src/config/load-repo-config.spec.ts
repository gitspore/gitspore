import { loadRepoConfig, startRepoConfig } from "./load-repo-config";
import type { RememberedRepo, RepoMemory } from "./repo-memory";
import { initRepo } from "../../test/git-repo";

import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { mkdtemp, mkdir, realpath, rm } from "node:fs/promises";

//
//
//

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

describe("startRepoConfig", () => {
  let dir: string;

  // A memory that knows these repos, last chosen first
  const remembering = (...recent: RememberedRepo[]) =>
    ({ recent: jest.fn().mockResolvedValue(recent) }) as unknown as RepoMemory;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "gitspore-start-"));
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("uses GITSPORE_REPO over the remembered repo", async () => {
    await initRepo(dir);
    const memory = remembering({ path: "/elsewhere", baseBranch: "main" });

    const config = await startRepoConfig({ GITSPORE_REPO: dir }, memory);

    expect(config.repoPath()).toBe(await realpath(dir));
    expect(memory.recent).not.toHaveBeenCalled();
  });

  it("still stops the daemon for a wrong GITSPORE_REPO", async () => {
    await expect(
      startRepoConfig({ GITSPORE_REPO: dir }, remembering()),
    ).rejects.toThrow("not inside a git repository");
  });

  it("starts in the last remembered repo with its base branch", async () => {
    await initRepo(dir, "develop");

    const config = await startRepoConfig(
      {},
      remembering(
        { path: dir, baseBranch: "develop" },
        { path: "/older", baseBranch: "main" },
      ),
    );

    expect(config.repoPath()).toBe(await realpath(dir));
    expect(config.baseBranch()).toBe("develop");
  });

  it.each([
    ["is gone", (d: string) => join(d, "gone"), "main"],
    ["lost its base branch", (d: string) => d, "develop"],
  ])(
    "starts without a repo when the remembered one %s",
    async (_, path, baseBranch) => {
      await initRepo(dir);

      const config = await startRepoConfig(
        {},
        remembering({ path: path(dir), baseBranch }),
      );

      expect(config.isSet()).toBe(false);
    },
  );

  it("starts without a repo when none is remembered", async () => {
    const config = await startRepoConfig({}, remembering());

    expect(config.isSet()).toBe(false);
    expect(() => config.repoPath()).toThrow("No repository chosen yet");
  });
});
