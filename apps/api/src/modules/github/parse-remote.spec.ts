import { parseGitHubRemote } from "./parse-remote";

describe("parseGitHubRemote", () => {
  it("reads owner and repo from an https URL", () => {
    const url = "https://github.com/testowner/testrepo";

    const result = parseGitHubRemote(url);

    expect(result).toEqual({ owner: "testowner", repo: "testrepo" });
  });
  it("reads owner and repo from an https URL ending in .git", () => {
    const url = "https://github.com/testowner/testrepo.git";

    const result = parseGitHubRemote(url);

    expect(result).toEqual({ owner: "testowner", repo: "testrepo" });
  });
  it("reads owner and repo from an scp-style ssh URL", () => {
    const url = "git@github.com:testowner/testrepo.git";

    const result = parseGitHubRemote(url);

    expect(result).toEqual({ owner: "testowner", repo: "testrepo" });
  });
  it("reads owner and repo from an ssh:// URL", () => {
    const url = "ssh://git@github.com/testowner/testrepo.git";

    const result = parseGitHubRemote(url);

    expect(result).toEqual({ owner: "testowner", repo: "testrepo" });
  });
  it("ignores whitespace around the URL", () => {
    const url = "https://github.com/testowner/testrepo.git ";

    const result = parseGitHubRemote(url);

    expect(result).toEqual({ owner: "testowner", repo: "testrepo" });
  });
  it("returns null for a remote that is not on GitHub", () => {
    const url = "https://gitlab.com/testowner/testrepo.git";

    const result = parseGitHubRemote(url);

    expect(result).toBeNull();
  });
  it("returns null when owner or repo is missing", () => {
    const url = "https://github.com/testowner";

    const result = parseGitHubRemote(url);

    expect(result).toBeNull();
  });
  it("returns null for a URL with more than owner and repo", () => {
    const url = "https://github.com/testowner/testrepo/tree/main";

    const result = parseGitHubRemote(url);

    expect(result).toBeNull();
  });
});
