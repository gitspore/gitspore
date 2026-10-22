import { checkRepo } from "./check-repo";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initRepo } from "../../../test/git-repo";
import { RepoConfig } from "@/config/repo-config";
import { StateStore } from "../state/state.store";
import { RepoService } from "./repo.service";

// The point of repo-problems.ts: a check line and a refused switch say the
// same thing about the same path.
describe("repo problems", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "gitspore-problems-"));
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  const service = () =>
    new RepoService(
      new StateStore(),
      new RepoConfig(null, "main"),
      { getToken: async () => null },
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { resolve: () => Promise.reject(new Error("none")) } as never,
    );
  const deps = {
    connectGitHub: async () => ({ disabled: "off" }),
    claudeInstalled: async () => false,
  };

  it.each([
    ["a missing folder", (d: string) => join(d, "nope"), undefined],
    ["a folder without git", (d: string) => d, undefined],
    ["a missing branch", (d: string) => d, "master"],
  ])("%s", async (_, path, initialBranch) => {
    if (initialBranch) await initRepo(dir, initialBranch);

    const checks = await checkRepo(path(dir), "main", deps);
    const ack = await service().choose(path(dir), "main");

    const failed = checks
      .filter((c) => c.result === "fail")
      .map((c) => c.detail);
    expect("problems" in ack && ack.problems.map((p) => p.message)).toEqual(
      failed,
    );
  });
});
