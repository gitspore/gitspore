import { agent } from "@/lib/mock/scenarioFixtures";
import { stopErrorText } from "./stopErrorText";

describe("stopErrorText", () => {
  it("says a dirty worktree was kept and how to go on", () => {
    expect(stopErrorText(agent, "worktree_dirty")).toBe(
      "The worktree has uncommitted changes and was kept. Stop again without removing it, or commit first.",
    );
  });

  it("names the branch whose worktree can't be removed", () => {
    expect(stopErrorText(agent, "git_failed")).toBe(
      "The worktree of spore/1-x can't be removed. The agent is stopped; stop again without removing it.",
    );
  });

  it("asks to wait while the agent is still starting", () => {
    expect(stopErrorText(agent, "agent_starting")).toBe(
      "The agent is still starting. Try again in a moment.",
    );
  });

  it("says when the agent no longer exists", () => {
    expect(stopErrorText(agent, "agent_not_found")).toBe(
      "This agent no longer exists.",
    );
  });

  it("falls back to a general refusal for other codes", () => {
    expect(stopErrorText(agent, "repo_unavailable")).toBe(
      "The agent couldn't be stopped and keeps running.",
    );
  });
});
