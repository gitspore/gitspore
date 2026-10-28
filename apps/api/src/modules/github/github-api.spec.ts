import { GitHubApi } from "./github-api";
import { GitHubError } from "./github-error";

const TOKEN = "ghp_secret_test_token";

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function notModified() {
  return new Response(null, { status: 304 });
}

// One entry as GitHub's issues endpoint returns it.
function gitHubIssue(number: number, overrides: Record<string, unknown> = {}) {
  return {
    number,
    title: `Issue ${number}`,
    url: `https://api.github.com/repos/owner/repo/issues/${number}`,
    html_url: `https://github.com/owner/repo/issues/${number}`,
    labels: [],
    body: null,
    ...overrides,
  };
}

function gitHubIssues(from: number, count: number) {
  return Array.from({ length: count }, (_, i) => gitHubIssue(from + i));
}

function createApi(fetch: jest.Mock) {
  return new GitHubApi(TOKEN, { owner: "owner", repo: "repo" }, fetch);
}

// The headers of the n-th request the fake fetch received.
function sentHeaders(fetch: jest.Mock, call: number): Record<string, string> {
  return fetch.mock.calls[call][1].headers;
}

async function failure(promise: Promise<unknown>): Promise<GitHubError> {
  const error = await promise.catch((e: unknown) => e);
  if (!(error instanceof GitHubError))
    throw new Error("expected a GitHubError");
  return error;
}

describe("GitHubApi.openIssues", () => {
  it("returns the open issues as small Issue objects", async () => {
    const fetch = jest.fn().mockResolvedValue(
      json([
        {
          number: 1,
          title: "Fix login",
          url: "https://api.github.com/repos/owner/repo/issues/1",
          html_url: "https://github.com/owner/repo/issues/1",
          labels: [{ name: "bug" }],
          body: "The button does nothing.",
        },
      ]),
    );
    const api = createApi(fetch);

    const result = await api.openIssues();

    expect(result).toEqual({
      changed: true,
      issues: [
        {
          number: 1,
          title: "Fix login",
          url: "https://github.com/owner/repo/issues/1",
          labels: ["bug"],
          body: "The button does nothing.",
        },
      ],
    });
  });

  it("leaves out pull requests", async () => {
    const fetch = jest.fn().mockResolvedValue(
      json([
        gitHubIssue(1),
        gitHubIssue(2, {
          pull_request: {
            url: "https://api.github.com/repos/owner/repo/pulls/2",
          },
        }),
      ]),
    );
    const api = createApi(fetch);

    const result = await api.openIssues();

    expect(result).toEqual({
      changed: true,
      issues: [expect.objectContaining({ number: 1 })],
    });
  });

  it("fetches every page when there are more than 100 issues", async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(json(gitHubIssues(1, 100)))
      .mockResolvedValueOnce(json(gitHubIssues(101, 2)));
    const api = createApi(fetch);

    const result = await api.openIssues();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ changed: true });
    expect(result.changed && result.issues).toHaveLength(102);
  });

  it("asks for the next page when a full page holds pull requests", async () => {
    const fullPage = [
      ...gitHubIssues(1, 99),
      gitHubIssue(100, { pull_request: {} }),
    ];
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(json(fullPage))
      .mockResolvedValueOnce(json(gitHubIssues(101, 1)));
    const api = createApi(fetch);

    const result = await api.openIssues();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.changed && result.issues).toHaveLength(100);
  });

  it("sends the etag of the last response as if-none-match", async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(json([gitHubIssue(1)], 200, { etag: '"page-1"' }))
      .mockResolvedValueOnce(notModified());
    const api = createApi(fetch);
    await api.openIssues();

    await api.openIssues();

    expect(sentHeaders(fetch, 0)["if-none-match"]).toBeUndefined();
    expect(sentHeaders(fetch, 1)["if-none-match"]).toBe('"page-1"');
  });

  it("reports no change when every page answers 304", async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(json(gitHubIssues(1, 100), 200, { etag: '"a"' }))
      .mockResolvedValueOnce(json(gitHubIssues(101, 2), 200, { etag: '"b"' }))
      .mockResolvedValueOnce(notModified())
      .mockResolvedValueOnce(notModified());
    const api = createApi(fetch);
    await api.openIssues();

    const result = await api.openIssues();

    expect(result).toEqual({ changed: false });
  });

  it("reports a change when only a later page changed", async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(json(gitHubIssues(1, 100), 200, { etag: '"a"' }))
      .mockResolvedValueOnce(json(gitHubIssues(101, 2), 200, { etag: '"b"' }))
      .mockResolvedValueOnce(notModified())
      .mockResolvedValueOnce(
        json([gitHubIssue(101, { title: "Renamed" })], 200, { etag: '"c"' }),
      );
    const api = createApi(fetch);
    await api.openIssues();

    const result = await api.openIssues();

    expect(result.changed && result.issues).toHaveLength(101);
    expect(result.changed && result.issues[100]).toMatchObject({
      number: 101,
      title: "Renamed",
    });
  });

  it("throws github_auth_failed on 401", async () => {
    const fetch = jest
      .fn()
      .mockResolvedValue(json({ message: "Bad credentials" }, 401));
    const api = createApi(fetch);

    const error = await failure(api.openIssues());

    expect(error.code).toBe("github_auth_failed");
  });

  it("throws github_rate_limited with the reset time on 403 without remaining requests", async () => {
    const fetch = jest.fn().mockResolvedValue(
      json({ message: "API rate limit exceeded" }, 403, {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "1760000000",
      }),
    );
    const api = createApi(fetch);

    const error = await failure(api.openIssues());

    expect(error.code).toBe("github_rate_limited");
    expect(error.retryAt).toEqual(new Date(1760000000 * 1000));
  });

  it("throws github_rate_limited with retry-after on 429", async () => {
    const now = Date.now();
    const fetch = jest
      .fn()
      .mockResolvedValue(
        json({ message: "Too many requests" }, 429, { "retry-after": "60" }),
      );
    const api = createApi(fetch);

    const error = await failure(api.openIssues());

    expect(error.code).toBe("github_rate_limited");
    expect(error.retryAt!.getTime()).toBeGreaterThanOrEqual(now + 60_000);
  });

  it("throws github_failed on a 403 that is not a rate limit", async () => {
    const fetch = jest.fn().mockResolvedValue(
      json({ message: "Resource not accessible" }, 403, {
        "x-ratelimit-remaining": "4999",
      }),
    );
    const api = createApi(fetch);

    const error = await failure(api.openIssues());

    expect(error.code).toBe("github_failed");
  });

  it("throws github_unreachable when the network fails", async () => {
    const fetch = jest.fn().mockRejectedValue(new TypeError("fetch failed"));
    const api = createApi(fetch);

    const error = await failure(api.openIssues());

    expect(error.code).toBe("github_unreachable");
  });

  it("throws github_unreachable on a 5xx", async () => {
    const fetch = jest
      .fn()
      .mockResolvedValue(json({ message: "Server Error" }, 502));
    const api = createApi(fetch);

    const error = await failure(api.openIssues());

    expect(error.code).toBe("github_unreachable");
  });

  it("never puts the token into an error message", async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(json({ message: "Bad credentials" }, 401))
      .mockRejectedValueOnce(new TypeError(`fetch failed for ${TOKEN}`));
    const api = createApi(fetch);

    const errors = [
      await failure(api.openIssues()),
      await failure(api.openIssues()),
    ];

    for (const error of errors) {
      expect(error.message).not.toContain(TOKEN);
      expect(String(error.stack)).not.toContain(TOKEN);
    }
  });
});

// One entry as GitHub's pulls endpoint returns it.
function gitHubPull(number: number, overrides: Record<string, unknown> = {}) {
  return {
    number,
    html_url: `https://github.com/owner/repo/pull/${number}`,
    state: "open",
    merged_at: null,
    ...overrides,
  };
}

describe("GitHubApi.pullRequestFor", () => {
  it("asks for the branch's pull requests in any state", async () => {
    const fetch = jest.fn().mockResolvedValue(json([]));
    const api = createApi(fetch);

    await api.pullRequestFor("spore/42-fix-login");

    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/repos/owner/repo/pulls");
    expect(url.searchParams.get("head")).toBe("owner:spore/42-fix-login");
    expect(url.searchParams.get("state")).toBe("all");
  });

  it("returns null when the branch has no pull request", async () => {
    const fetch = jest.fn().mockResolvedValue(json([]));
    const api = createApi(fetch);

    const result = await api.pullRequestFor("spore/42-fix-login");

    expect(result).toBeNull();
  });

  it("returns an open pull request", async () => {
    const fetch = jest.fn().mockResolvedValue(json([gitHubPull(7)]));
    const api = createApi(fetch);

    const result = await api.pullRequestFor("spore/42-fix-login");

    expect(result).toEqual({
      number: 7,
      url: "https://github.com/owner/repo/pull/7",
      state: "open",
    });
  });

  it("tells a merged pull request from a closed one", async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(
        json([
          gitHubPull(7, {
            state: "closed",
            merged_at: "2026-10-15T10:00:00Z",
          }),
        ]),
      )
      .mockResolvedValueOnce(json([gitHubPull(8, { state: "closed" })]));
    const api = createApi(fetch);

    const merged = await api.pullRequestFor("spore/42-fix-login");
    const closed = await api.pullRequestFor("spore/43-other");

    expect(merged).toMatchObject({ state: "merged" });
    expect(closed).toMatchObject({ state: "closed" });
  });

  it("takes the newest pull request when the branch has several", async () => {
    const fetch = jest
      .fn()
      .mockResolvedValue(
        json([gitHubPull(9), gitHubPull(7, { state: "closed" })]),
      );
    const api = createApi(fetch);

    const result = await api.pullRequestFor("spore/42-fix-login");

    expect(result).toMatchObject({ number: 9 });
  });

  it("returns the remembered pull request when GitHub answers 304", async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(json([gitHubPull(7)], 200, { etag: '"pr"' }))
      .mockResolvedValueOnce(notModified());
    const api = createApi(fetch);
    await api.pullRequestFor("spore/42-fix-login");

    const result = await api.pullRequestFor("spore/42-fix-login");

    expect(sentHeaders(fetch, 1)["if-none-match"]).toBe('"pr"');
    expect(result).toEqual({
      number: 7,
      url: "https://github.com/owner/repo/pull/7",
      state: "open",
    });
  });

  it("keeps the ETags of branches and issue pages apart", async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(json([gitHubPull(7)], 200, { etag: '"a"' }))
      .mockResolvedValueOnce(json([], 200, { etag: '"b"' }));
    const api = createApi(fetch);
    await api.pullRequestFor("spore/42-fix-login");

    await api.pullRequestFor("spore/43-other");

    expect(sentHeaders(fetch, 1)["if-none-match"]).toBeUndefined();
  });
});

describe("GitHubApi.getIssue", () => {
  it("returns title, body, URL and labels of an open issue", async () => {
    const fetch = jest.fn().mockResolvedValue(
      json(
        gitHubIssue(42, {
          title: "Fix login",
          body: "The button does nothing.",
          state: "open",
          labels: [{ name: "bug" }],
        }),
      ),
    );
    const api = createApi(fetch);

    const issue = await api.getIssue(42);

    expect(issue).toEqual({
      number: 42,
      title: "Fix login",
      url: "https://github.com/owner/repo/issues/42",
      labels: ["bug"],
      body: "The button does nothing.",
    });
  });

  it("gives an empty body when the issue has no text", async () => {
    const fetch = jest
      .fn()
      .mockResolvedValue(json(gitHubIssue(42, { state: "open", body: null })));
    const api = createApi(fetch);

    const issue = await api.getIssue(42);

    expect(issue.body).toBe("");
  });

  it("throws issue_not_found for a closed issue", async () => {
    const fetch = jest
      .fn()
      .mockResolvedValue(json(gitHubIssue(42, { state: "closed" })));
    const api = createApi(fetch);

    const error = await failure(api.getIssue(42));

    expect(error.code).toBe("issue_not_found");
    expect(error.message).toContain("closed");
  });

  it("throws issue_not_found for a number that does not exist", async () => {
    const fetch = jest
      .fn()
      .mockResolvedValue(json({ message: "Not Found" }, 404));
    const api = createApi(fetch);

    const error = await failure(api.getIssue(42));

    expect(error.code).toBe("issue_not_found");
  });

  it("throws issue_not_found for a pull request", async () => {
    const fetch = jest
      .fn()
      .mockResolvedValue(
        json(gitHubIssue(42, { state: "open", pull_request: {} })),
      );
    const api = createApi(fetch);

    const error = await failure(api.getIssue(42));

    expect(error.code).toBe("issue_not_found");
  });

  it("throws the usual codes for other failures", async () => {
    const fetch = jest
      .fn()
      .mockResolvedValue(json({ message: "Bad credentials" }, 401));
    const api = createApi(fetch);

    const error = await failure(api.getIssue(42));

    expect(error.code).toBe("github_auth_failed");
  });
});
