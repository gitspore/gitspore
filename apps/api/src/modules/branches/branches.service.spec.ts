import { RepoConfig } from "@/config/repo-config";
import { Logger } from "@nestjs/common";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  initOrigin,
  initRepo,
  pushFromElsewhere,
} from "../../../test/git-repo";
import { BranchesService } from "./branches.service";

describe("BranchesService", () => {
  let dir: string;
  let repo: string;

  beforeEach(async () => {
    dir = await realpath(await mkdtemp(join(tmpdir(), "gitspore-br-")));
    repo = join(dir, "repo");
    await mkdir(repo);
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  const graphOf = async (path: string) => {
    const ack = await new BranchesService(new RepoConfig(path, "main")).graph();
    if ("error" in ack) throw new Error(ack.error.message);
    return ack.graph;
  };

  it("answers repo_unavailable while no repo is chosen", async () => {
    const service = new BranchesService(new RepoConfig(null, "main"));

    expect(await service.graph()).toEqual({
      error: expect.objectContaining({ code: "repo_unavailable" }),
    });
  });

  it("returns main and the spore branches with their commits", async () => {
    const git = await initRepo(repo);
    await git.raw(["checkout", "-b", "spore/12-login-redirect"]);
    await git.raw(["commit", "--allow-empty", "-m", "session check"]);
    await git.raw(["checkout", "main"]);

    const graph = await graphOf(repo);

    expect(graph.heads.map((h) => h.branch)).toEqual([
      "main",
      "spore/12-login-redirect",
    ]);
    expect(graph.commits.map((c) => c.subject)).toEqual([
      "session check",
      "initial",
    ]);
    expect(graph.commits[0].parents).toEqual([graph.commits[1].sha]);
  });

  it("leaves out branches no agent made", async () => {
    const git = await initRepo(repo);
    await git.raw(["checkout", "-b", "feature/other"]);
    await git.raw(["commit", "--allow-empty", "-m", "not ours"]);
    await git.raw(["checkout", "main"]);

    const graph = await graphOf(repo);

    expect(graph.heads.map((h) => h.branch)).toEqual(["main"]);
    expect(graph.commits.map((c) => c.subject)).toEqual(["initial"]);
  });

  it("takes the base branch from origin, where merged pull requests land", async () => {
    const git = await initRepo(repo);
    const origin = await initOrigin(repo, join(dir, "origin.git"));
    const merged = await pushFromElsewhere(origin, join(dir, "elsewhere"));
    await git.fetch("origin");

    const graph = await graphOf(repo);

    expect(graph.heads).toEqual([{ branch: "main", sha: merged }]);
    expect(graph.commits.map((c) => c.subject)).toEqual([
      "from elsewhere",
      "initial",
    ]);
  });

  it("answers git_failed when the folder is no repo", async () => {
    const warn = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => {});
    const service = new BranchesService(new RepoConfig(dir, "main"));

    expect(await service.graph()).toEqual({
      error: expect.objectContaining({ code: "git_failed" }),
    });
    warn.mockRestore();
  });
});
