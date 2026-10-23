import type { AgentStatus, PullRequest } from "@gitspore/shared";
import {
  prClosedReason,
  reactToPullRequest,
  type PullRequestReaction,
} from "./pull-request-reaction";

const pr = (state: PullRequest["state"]): PullRequest => ({
  number: 12,
  url: "https://github.com/gitspore/playground/pull/12",
  state,
});

const KEEP: PullRequestReaction = { kind: "keep" };
const DONE: PullRequestReaction = { kind: "set", status: "done", reason: null };

describe("reactToPullRequest", () => {
  describe("an open pull request", () => {
    it.each<AgentStatus>(["starting", "needs_input", "done", "error"])(
      "makes a %s agent done",
      (status) => {
        expect(reactToPullRequest(status, pr("open"))).toEqual(DONE);
      },
    );

    it("keeps a working agent working, so changes from a review aren't cut short", () => {
      expect(reactToPullRequest("working", pr("open"))).toEqual(KEEP);
    });

    it("clears pr_closed when the pull request is reopened", () => {
      const reaction = reactToPullRequest("error", pr("open"));

      expect(reaction).toEqual(DONE);
    });
  });

  describe("a merged pull request", () => {
    it.each<AgentStatus>([
      "starting",
      "working",
      "needs_input",
      "done",
      "error",
    ])("hands a %s agent to the merge handling", (status) => {
      expect(reactToPullRequest(status, pr("merged"))).toEqual({
        kind: "merged",
      });
    });
  });

  describe("a pull request closed without merging", () => {
    it.each<AgentStatus>(["starting", "working", "needs_input", "done"])(
      "makes a %s agent error with pr_closed",
      (status) => {
        expect(reactToPullRequest(status, pr("closed"))).toEqual({
          kind: "set",
          status: "error",
          reason: prClosedReason(pr("closed")),
        });
      },
    );
  });

  describe("an agent that is already merged", () => {
    it.each<PullRequest["state"]>(["open", "merged", "closed"])(
      "stays as it is on %s, the cleanup is on its way",
      (state) => {
        expect(reactToPullRequest("merged", pr(state))).toEqual(KEEP);
      },
    );
  });
});

describe("prClosedReason", () => {
  it("names the pull request and says nothing was deleted", () => {
    const reason = prClosedReason(pr("closed"));

    expect(reason.code).toBe("pr_closed");
    expect(reason.message).toMatch(/#12/);
    expect(reason.message).toMatch(/Nothing was deleted/);
  });
});
