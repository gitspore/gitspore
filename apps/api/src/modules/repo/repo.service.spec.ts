import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RepoConfig } from "@/config/repo-config";
import { initRepo } from "../../../test/git-repo";
import type { GitHubCredentialsProvider } from "../github/credentials";
import { StateStore } from "../state/state.store";
import { RepoService } from "./repo.service";

function credentials(token: string | null): GitHubCredentialsProvider {
  return { getToken: jest.fn().mockResolvedValue(token) };
}

describe("RepoService", () => {
  let dir: string;
  let store: StateStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "gitspore-repo-"));
    store = new StateStore();
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("puts the repo it started with into the state, GitHub on", async () => {
    const git = await initRepo(dir);
    await git.addRemote("origin", "git@github.com:gitspore/shop.git");
    const service = new RepoService(
      store,
      new RepoConfig(dir, "main"),
      credentials("token"),
    );

    await service.onModuleInit();

    expect(store.snapshot().repo).toEqual({
      path: dir,
      baseBranch: "main",
      github: "on",
    });
  });

  it("marks GitHub off for a repo without a remote", async () => {
    await initRepo(dir);
    const service = new RepoService(
      store,
      new RepoConfig(dir, "main"),
      credentials("token"),
    );

    await service.onModuleInit();

    expect(store.snapshot().repo).toMatchObject({ github: "off" });
  });
});
