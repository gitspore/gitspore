import { loadRepoConfig } from "./load-repo-config";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, mkdir, realpath, rm } from "node:fs/promises";
import { simpleGit } from "simple-git";

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
    await simpleGit(dir).init();
    const sub = join(dir, "apps", "api");
    await mkdir(sub, { recursive: true });

    const config = await loadRepoConfig({ GITSPORE_REPO: sub });

    expect(config.repoPath()).toBe(await realpath(dir));
  });
});
