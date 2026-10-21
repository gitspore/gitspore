import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import { initRepo } from "../../../test/git-repo";
import type { GitHubApi } from "../github/github-api";
import type { GitHubConnection } from "../github/github-source";
import { checkRepo, expandHome, type CheckDeps } from "./check-repo";

const githubOn: GitHubConnection = {
  api: {} as GitHubApi,
  repo: { owner: "gitspore", repo: "shop" },
};

// GitHub on and Claude Code found, unless a test says otherwise.
function deps(overrides: Partial<CheckDeps> = {}): CheckDeps {
  return {
    connectGitHub: jest.fn().mockResolvedValue(githubOn),
    claudeInstalled: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe("checkRepo", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "gitspore-check-"));
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("finds everything in a repo with the base branch, GitHub and Claude Code", async () => {
    await initRepo(dir);

    expect(await checkRepo(dir, "main", deps())).toEqual([
      { item: "git", result: "ok", detail: basename(dir) },
      { item: "base_branch", result: "ok", detail: "main exists" },
      { item: "github", result: "ok", detail: "gitspore/shop" },
      { item: "claude", result: "ok", detail: "found" },
    ]);
  });

  it("checks GitHub at the top level of a path inside the repo", async () => {
    await initRepo(dir);
    const sub = join(dir, "apps", "api");
    await mkdir(sub, { recursive: true });
    const connectGitHub = jest.fn().mockResolvedValue(githubOn);

    const checks = await checkRepo(sub, "main", deps({ connectGitHub }));

    expect(checks[0]).toMatchObject({ item: "git", detail: basename(dir) });
    expect(connectGitHub).toHaveBeenCalledWith(await realpath(dir));
  });

  it.each([
    [
      "does not exist",
      () => join(tmpdir(), `gitspore-missing-${randomUUID()}`),
      "does not exist",
    ],
    ["is not a git repo", () => dir, "Run git init"],
  ])(
    "leaves out the branch and GitHub for a path that %s",
    async (_, path, detail) => {
      const connectGitHub = jest.fn();

      const checks = await checkRepo(path(), "main", deps({ connectGitHub }));

      expect(checks).toEqual([
        {
          item: "git",
          result: "fail",
          detail: expect.stringContaining(detail),
        },
        { item: "claude", result: "ok", detail: "found" },
      ]);
      expect(connectGitHub).not.toHaveBeenCalled();
    },
  );

  it("fails the base branch when it is missing", async () => {
    await initRepo(dir, "master");

    const checks = await checkRepo(dir, "main", deps());

    expect(checks[1]).toEqual({
      item: "base_branch",
      result: "fail",
      detail: "No branch main. Choose another one.",
    });
  });

  it("warns with the reason when GitHub sync would be off", async () => {
    await initRepo(dir);
    const connectGitHub = jest
      .fn()
      .mockResolvedValue({ disabled: "The repo has no remote named origin." });

    const checks = await checkRepo(dir, "main", deps({ connectGitHub }));

    expect(checks[2]).toEqual({
      item: "github",
      result: "warn",
      detail: "The repo has no remote named origin.",
    });
  });

  it("fails Claude Code when it is not installed", async () => {
    await initRepo(dir);
    const claudeInstalled = jest.fn().mockResolvedValue(false);

    const checks = await checkRepo(dir, "main", deps({ claudeInstalled }));

    expect(checks[3]).toMatchObject({ item: "claude", result: "fail" });
  });
});

describe("expandHome", () => {
  it.each([
    ["~", homedir()],
    ["~/code/shop", join(homedir(), "code", "shop")],
    ["/srv/shop", "/srv/shop"],
    ["code/~/shop", "code/~/shop"],
  ])("%s → %s", (path, expanded) => {
    expect(expandHome(path)).toBe(expanded);
  });
});
