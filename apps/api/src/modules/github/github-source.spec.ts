import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initRepo } from "../../../test/git-repo";
import { GitHubCredentialsProvider } from "./credentials";
import { GitHubApi } from "./github-api";
import { RepoGitHubSource } from "./github-source";

const TOKEN = "ghp_secret_test_token";

function credentials(token: string | null): GitHubCredentialsProvider {
  return { getToken: jest.fn().mockResolvedValue(token) };
}

function remoteUrl(url: string) {
  return jest.fn().mockResolvedValue(`${url}\n`);
}

describe("RepoGitHubSource", () => {
  it("connects to the repo of a GitHub remote", async () => {
    const source = new RepoGitHubSource(
      "/repo",
      credentials(TOKEN),
      remoteUrl("git@github.com:owner/repo.git"),
    );

    const connection = await source.connect();

    expect(connection).toEqual({
      api: expect.any(GitHubApi),
      repo: { owner: "owner", repo: "repo" },
    });
  });

  it("reads the remote origin of the configured repo", async () => {
    const readRemote = remoteUrl("https://github.com/owner/repo");
    const source = new RepoGitHubSource(
      "/repo",
      credentials(TOKEN),
      readRemote,
    );

    await source.connect();

    expect(readRemote).toHaveBeenCalledWith("/repo", "origin");
  });

  it("is disabled when the repo has no remote", async () => {
    const tokens = credentials(TOKEN);
    const source = new RepoGitHubSource(
      "/repo",
      tokens,
      jest.fn().mockRejectedValue(new Error("No such remote")),
    );

    const connection = await source.connect();

    expect(connection).toEqual({ disabled: expect.stringContaining("origin") });
    expect(tokens.getToken).not.toHaveBeenCalled();
  });

  it("is disabled for a remote that is not on GitHub", async () => {
    const tokens = credentials(TOKEN);
    const source = new RepoGitHubSource(
      "/repo",
      tokens,
      remoteUrl("https://gitlab.com/owner/repo.git"),
    );

    const connection = await source.connect();

    expect(connection).toEqual({
      disabled: expect.stringContaining("gitlab.com"),
    });
    expect(tokens.getToken).not.toHaveBeenCalled();
  });

  it("is disabled without a token", async () => {
    const source = new RepoGitHubSource(
      "/repo",
      credentials(null),
      remoteUrl("https://github.com/owner/repo"),
    );

    const connection = await source.connect();

    expect(connection).toEqual({
      disabled: expect.stringContaining("GITHUB_TOKEN"),
    });
  });
});

describe("RepoGitHubSource with a real repo", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "gitspore-source-"));
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("reads the URL of origin with git", async () => {
    const git = await initRepo(dir);
    await git.addRemote("origin", "https://github.com/owner/repo.git");
    const source = new RepoGitHubSource(dir, credentials(TOKEN));

    const connection = await source.connect();

    expect(connection).toMatchObject({
      repo: { owner: "owner", repo: "repo" },
    });
  });

  it("is disabled when git finds no origin", async () => {
    await initRepo(dir);
    const source = new RepoGitHubSource(dir, credentials(TOKEN));

    const connection = await source.connect();

    expect(connection).toEqual({ disabled: expect.stringContaining("origin") });
  });
});
