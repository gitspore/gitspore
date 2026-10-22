import type { Agent, Issue, ServerError, StatePatch } from "@gitspore/shared";
import { Logger } from "@nestjs/common";
import { StateStore } from "../state/state.store";
import type { GitHubApi, PullRequest } from "./github-api";
import { GitHubError } from "./github-error";
import { GitHubConnection, GitHubSource } from "./github-source";
import {
  GitHubService,
  POLL_INTERVAL_MS,
  PullRequestChange,
} from "./github.service";

function issue(number: number, overrides: Partial<Issue> = {}): Issue {
  return {
    number,
    title: `Issue ${number}`,
    url: `https://github.com/owner/repo/issues/${number}`,
    labels: [],
    ...overrides,
  };
}

function agent(branch: string, overrides: Partial<Agent> = {}): Agent {
  return {
    id: `agent-${branch}`,
    slotIndex: 0,
    issueNumber: 1,
    branch,
    worktreePath: `/worktrees/${branch}`,
    status: "working",
    statusSince: "2026-10-15T10:00:00.000Z",
    startedAt: "2026-10-15T10:00:00.000Z",
    ...overrides,
  };
}

function pullRequest(
  number: number,
  state: PullRequest["state"] = "open",
): PullRequest {
  return {
    number,
    url: `https://github.com/owner/repo/pull/${number}`,
    state,
  };
}

// A GitHubApi whose answers each test sets. By default: no issues, no pull
// requests.
function fakeApi() {
  return {
    openIssues: jest
      .fn()
      .mockResolvedValue({ changed: true, issues: [] as Issue[] }),
    pullRequestFor: jest.fn().mockResolvedValue(null),
    getIssue: jest.fn(),
  };
}

function setup(connection?: GitHubConnection) {
  const api = fakeApi();
  const store = new StateStore();
  const source: GitHubSource = {
    connect: jest.fn().mockResolvedValue(
      connection ?? {
        api: api as unknown as GitHubApi,
        repo: { owner: "owner", repo: "repo" },
      },
    ),
  };
  const service = new GitHubService(store, source);

  const errors: ServerError[] = [];
  const patches: StatePatch[] = [];
  const changes: PullRequestChange[] = [];
  service.onError((error) => errors.push(error));
  store.onPatch((patch) => patches.push(patch));
  service.onPullRequest((change) => changes.push(change));

  return { api, source, store, service, errors, patches, changes };
}

// Lets the timer of the next poll fire and that poll finish.
async function nextPoll(ms = POLL_INTERVAL_MS) {
  await jest.advanceTimersByTimeAsync(ms);
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date("2026-10-15T12:00:00Z") });
  // The service logs every report; the tests check the reports instead.
  jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});
  jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
  jest.spyOn(Logger.prototype, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("GitHubService: start", () => {
  it("puts the open issues into the state", async () => {
    const { api, store, service } = setup();
    api.openIssues.mockResolvedValue({
      changed: true,
      issues: [issue(1), issue(2)],
    });

    await service.start();

    expect(store.snapshot().issues).toEqual([issue(1), issue(2)]);
    service.stop();
  });

  it("reports github_sync_disabled once and asks nothing when there is no token", async () => {
    const { service, errors, patches } = setup({
      disabled: "No GitHub token.",
    });

    await service.start();
    await nextPoll();

    expect(errors).toEqual([
      { code: "github_sync_disabled", message: "No GitHub token." },
    ]);
    expect(patches).toEqual([]);
    expect(service.currentProblem()).toEqual(errors[0]);
  });
});

describe("GitHubService: polling", () => {
  it("polls again after the interval", async () => {
    const { api, service } = setup();
    await service.start();

    await nextPoll();

    expect(api.openIssues).toHaveBeenCalledTimes(2);
    service.stop();
  });

  it("sends no patch when GitHub reports no change", async () => {
    const { api, service, patches } = setup();
    api.openIssues.mockResolvedValue({ changed: true, issues: [issue(1)] });
    await service.start();
    api.openIssues.mockResolvedValue({ changed: false });

    await nextPoll();

    expect(patches).toHaveLength(1);
    service.stop();
  });

  it("sends exactly the ops for added, changed and closed issues", async () => {
    const { api, service, patches } = setup();
    api.openIssues.mockResolvedValue({
      changed: true,
      issues: [issue(1), issue(2)],
    });
    await service.start();
    api.openIssues.mockResolvedValue({
      changed: true,
      issues: [issue(1, { title: "Renamed" }), issue(3)],
    });

    await nextPoll();

    const ops = patches[1].ops;
    expect(ops).toHaveLength(3);
    expect(ops).toContainEqual({
      type: "issue:upsert",
      issue: issue(1, { title: "Renamed" }),
    });
    expect(ops).toContainEqual({ type: "issue:upsert", issue: issue(3) });
    expect(ops).toContainEqual({ type: "issue:remove", issueNumber: 2 });
    service.stop();
  });

  it("removes a closed issue but keeps the agent working on it", async () => {
    const { api, store, service } = setup();
    api.openIssues.mockResolvedValue({ changed: true, issues: [issue(1)] });
    await service.start();
    store.apply([{ type: "agent:upsert", agent: agent("spore/1-issue-1") }]);
    api.openIssues.mockResolvedValue({ changed: true, issues: [] });

    await nextPoll();

    expect(store.snapshot().issues).toEqual([]);
    expect(store.snapshot().agents).toEqual([agent("spore/1-issue-1")]);
    service.stop();
  });

  it("asks nothing after stop", async () => {
    const { api, service } = setup();
    await service.start();

    service.stop();
    await nextPoll();

    expect(api.openIssues).toHaveBeenCalledTimes(1);
  });
});

describe("GitHubService: refresh", () => {
  it("polls right away and starts the interval over", async () => {
    const { api, service } = setup();
    await service.start();
    await jest.advanceTimersByTimeAsync(30_000);

    await service.refresh();
    await jest.advanceTimersByTimeAsync(30_000);

    expect(api.openIssues).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(30_000);
    expect(api.openIssues).toHaveBeenCalledTimes(3);
    service.stop();
  });

  it("joins a poll that is still running instead of starting a second", async () => {
    const { api, service } = setup();
    await service.start();
    let finish!: () => void;
    api.openIssues.mockReturnValue(
      new Promise((resolve) => {
        finish = () => resolve({ changed: false });
      }),
    );

    const first = service.refresh();
    const second = service.refresh();
    finish();
    await Promise.all([first, second]);

    expect(api.openIssues).toHaveBeenCalledTimes(2);
    service.stop();
  });

  it("sends the current problem again while sync is off", async () => {
    const { service, errors } = setup({ disabled: "No GitHub token." });
    await service.start();

    await service.refresh();

    expect(errors).toHaveLength(2);
    expect(errors[1].code).toBe("github_sync_disabled");
  });
});

describe("GitHubService: failures", () => {
  it("keeps the issues and reports a network failure once", async () => {
    const { api, store, service, errors } = setup();
    api.openIssues.mockResolvedValue({ changed: true, issues: [issue(1)] });
    await service.start();
    api.openIssues.mockRejectedValue(
      new GitHubError("github_unreachable", "GitHub could not be reached"),
    );

    await nextPoll();
    await nextPoll();
    await nextPoll();

    expect(errors).toEqual([
      { code: "github_unreachable", message: "GitHub could not be reached" },
    ]);
    expect(store.snapshot().issues).toEqual([issue(1)]);
    service.stop();
  });

  it("resumes after a failure and reports the next one again", async () => {
    const { api, store, service, errors } = setup();
    await service.start();
    const unreachable = new GitHubError("github_unreachable", "unreachable");
    api.openIssues.mockRejectedValueOnce(unreachable);
    await nextPoll();
    api.openIssues.mockResolvedValueOnce({
      changed: true,
      issues: [issue(5)],
    });
    await nextPoll();
    api.openIssues.mockRejectedValueOnce(unreachable);

    await nextPoll();

    expect(store.snapshot().issues).toEqual([issue(5)]);
    expect(errors.map((e) => e.code)).toEqual([
      "github_unreachable",
      "github_unreachable",
    ]);
    expect(service.currentProblem()?.code).toBe("github_unreachable");
    service.stop();
  });

  it("asks nothing until the rate limit resets", async () => {
    const { api, service, errors } = setup();
    await service.start();
    const resetIn = 10 * 60_000;
    api.openIssues.mockRejectedValueOnce(
      new GitHubError(
        "github_rate_limited",
        "rate limited",
        new Date(Date.now() + POLL_INTERVAL_MS + resetIn),
      ),
    );
    await nextPoll();

    await service.refresh();
    await jest.advanceTimersByTimeAsync(resetIn - 1);

    expect(api.openIssues).toHaveBeenCalledTimes(2);
    // The report, and again for the refresh during the pause.
    expect(errors.map((e) => e.code)).toEqual([
      "github_rate_limited",
      "github_rate_limited",
    ]);
    service.stop();
  });

  it("resumes when the rate limit resets", async () => {
    const { api, service } = setup();
    await service.start();
    const resetIn = 10 * 60_000;
    api.openIssues.mockRejectedValueOnce(
      new GitHubError(
        "github_rate_limited",
        "rate limited",
        new Date(Date.now() + POLL_INTERVAL_MS + resetIn),
      ),
    );
    await nextPoll();

    await jest.advanceTimersByTimeAsync(resetIn);

    expect(api.openIssues).toHaveBeenCalledTimes(3);
    expect(service.currentProblem()).toBeNull();
    service.stop();
  });

  it("turns sync off when GitHub rejects the token", async () => {
    const { api, service, errors } = setup();
    api.openIssues.mockRejectedValue(
      new GitHubError("github_auth_failed", "GitHub rejected the token"),
    );

    await service.start();
    await nextPoll();
    await nextPoll();

    expect(api.openIssues).toHaveBeenCalledTimes(1);
    expect(errors.map((e) => e.code)).toEqual(["github_auth_failed"]);
  });

  it("survives an unexpected error and keeps polling", async () => {
    const { api, service, errors } = setup();
    api.openIssues.mockRejectedValueOnce(new Error("bug"));

    await service.start();
    await nextPoll();

    expect(errors.map((e) => e.code)).toEqual(["github_failed"]);
    expect(api.openIssues).toHaveBeenCalledTimes(2);
    service.stop();
  });
});

describe("GitHubService: pull requests", () => {
  async function startWithAgents(...branches: string[]) {
    const context = setup();
    for (const branch of branches) {
      context.store.apply([{ type: "agent:upsert", agent: agent(branch) }]);
    }
    await context.service.start();
    return context;
  }

  it("emits one event when a pull request appears", async () => {
    const { api, service, changes } =
      await startWithAgents("spore/42-fix-login");
    api.pullRequestFor.mockResolvedValue(pullRequest(7));

    await nextPoll();
    await nextPoll();

    expect(changes).toEqual([
      {
        branch: "spore/42-fix-login",
        issueNumber: 42,
        pullRequest: pullRequest(7),
      },
    ]);
    expect(service.pullRequestFor("spore/42-fix-login")).toEqual(
      pullRequest(7),
    );
    service.stop();
  });

  it("emits one event each for opened, merged and closed", async () => {
    const { api, service, changes } = await startWithAgents(
      "spore/42-a",
      "spore/43-b",
    );
    api.pullRequestFor.mockImplementation(async (branch: string) =>
      pullRequest(branch === "spore/42-a" ? 7 : 8),
    );
    await nextPoll();
    api.pullRequestFor.mockImplementation(async (branch: string) =>
      branch === "spore/42-a"
        ? pullRequest(7, "merged")
        : pullRequest(8, "closed"),
    );

    await nextPoll();

    expect(changes.map((c) => c.pullRequest.state)).toEqual([
      "open",
      "open",
      "merged",
      "closed",
    ]);
    service.stop();
  });

  it("emits nothing while the pull request stays the same", async () => {
    const { api, service, changes } = await startWithAgents("spore/42-a");
    api.pullRequestFor.mockResolvedValue(pullRequest(7));
    await nextPoll();

    await nextPoll();

    expect(changes).toHaveLength(1);
    service.stop();
  });

  it("knows the pull request again when its agent comes back, without a new event", async () => {
    const { api, store, service, changes } =
      await startWithAgents("spore/42-a");
    api.pullRequestFor.mockResolvedValue(pullRequest(7));
    await nextPoll();
    store.apply([{ type: "agent:remove", agentId: "agent-spore/42-a" }]);
    await nextPoll();
    expect(service.pullRequestFor("spore/42-a")).toBeNull();

    store.apply([{ type: "agent:upsert", agent: agent("spore/42-a") }]);
    await nextPoll();
    await nextPoll();

    expect(service.pullRequestFor("spore/42-a")).toEqual(pullRequest(7));
    // Once when it appeared, once when the agent came back, nothing after.
    expect(changes).toHaveLength(2);
    service.stop();
  });

  it("asks only for branches with the spore/ prefix", async () => {
    const { api, store, service } = setup();
    store.apply([
      {
        type: "agent:upsert",
        agent: agent("main", { id: "overview", slotIndex: null }),
      },
      { type: "agent:upsert", agent: agent("feature/42-x", { id: "other" }) },
      { type: "agent:upsert", agent: agent("spore/42-a", { id: "a" }) },
    ]);

    await service.start();

    expect(api.pullRequestFor.mock.calls).toEqual([["spore/42-a"]]);
    service.stop();
  });

  it("checks the pull request in the same poll that removes the agent's issue", async () => {
    const { api, store, service } = setup();
    api.openIssues.mockResolvedValue({ changed: true, issues: [issue(42)] });
    store.apply([{ type: "agent:upsert", agent: agent("spore/42-a") }]);
    await service.start();
    api.openIssues.mockResolvedValue({ changed: true, issues: [] });
    api.pullRequestFor.mockClear();

    await service.refresh();

    expect(store.snapshot().issues).toEqual([]);
    expect(api.pullRequestFor).toHaveBeenCalledWith("spore/42-a");
    service.stop();
  });
});

describe("GitHubService: the repo's GitHub status", () => {
  const repo = { path: "/r", baseBranch: "main", github: "off" } as const;

  it("turns it on once connected, with one repo:github patch", async () => {
    const { store, service, patches } = setup();
    store.setRepo(repo);

    await service.start();

    expect(store.snapshot().repo?.github).toBe("on");
    expect(patches[0].ops).toEqual([{ type: "repo:github", github: "on" }]);
    service.stop();
  });

  it("sends nothing when sync stays off", async () => {
    const { store, service, patches } = setup({ disabled: "No token." });
    store.setRepo(repo);

    await service.start();

    expect(store.snapshot().repo?.github).toBe("off");
    expect(patches).toEqual([]);
  });

  it("turns it off when GitHub rejects the token later", async () => {
    const { api, store, service } = setup();
    store.setRepo(repo);
    api.openIssues.mockRejectedValue(
      new GitHubError("github_auth_failed", "401"),
    );

    await service.start();

    expect(store.snapshot().repo?.github).toBe("off");
  });
});

describe("GitHubService: restart", () => {
  // The second repo's API, handed out by the source's next connect.
  function secondRepo(source: GitHubSource) {
    const api = fakeApi();
    api.openIssues.mockResolvedValue({ changed: true, issues: [issue(2)] });
    jest.mocked(source.connect).mockResolvedValueOnce({
      api: api as unknown as GitHubApi,
      repo: { owner: "owner", repo: "other" },
    });
    return api;
  }

  it("connects again and syncs the new repo", async () => {
    const { source, store, service } = setup();
    await service.start();
    const other = secondRepo(source);

    await service.restart();

    expect(source.connect).toHaveBeenCalledTimes(2);
    expect(store.snapshot().issues).toEqual([issue(2)]);
    await nextPoll();
    expect(other.openIssues).toHaveBeenCalledTimes(2);
    service.stop();
  });

  it("drops a poll of the old repo that answers after the restart", async () => {
    const { api, source, store, service } = setup();
    let answerOld!: (value: { changed: true; issues: Issue[] }) => void;
    api.openIssues.mockReturnValue(
      new Promise((resolve) => (answerOld = resolve)),
    );
    void service.start();
    await jest.advanceTimersByTimeAsync(0); // the old poll now waits
    secondRepo(source);

    await service.restart();
    answerOld({ changed: true, issues: [issue(1)] });
    await jest.advanceTimersByTimeAsync(0);

    expect(store.snapshot().issues).toEqual([issue(2)]);
    await nextPoll();
    expect(api.openIssues).toHaveBeenCalledTimes(1);
    service.stop();
  });
});

describe("GitHubService: getIssue", () => {
  it("asks the API", async () => {
    const { api, service } = setup();
    api.getIssue.mockResolvedValue({ ...issue(42), body: "text" });
    await service.start();

    const details = await service.getIssue(42);

    expect(details.body).toBe("text");
    expect(api.getIssue).toHaveBeenCalledWith(42);
    service.stop();
  });

  it("throws github_sync_disabled while sync is off", async () => {
    const { service } = setup({ disabled: "No GitHub token." });
    await service.start();

    const error = await service.getIssue(42).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GitHubError);
    expect(error).toMatchObject({
      code: "github_sync_disabled",
      message: "No GitHub token.",
    });
  });
});
