import type { Agent, BranchGraph, GraphCommit } from "@gitspore/shared";
import { agent as baseAgent } from "../mock/scenarioFixtures";
import {
  chainColour,
  formatAge,
  labelText,
  layoutBranches,
} from "./branchLayout";

function commit(sha: string, ...parents: string[]): GraphCommit {
  return {
    sha,
    parents,
    author: "Thomas",
    date: "2026-10-23T09:00:00.000Z",
    subject: sha,
  };
}

function agent(slotIndex: number, issueNumber: number, branch: string): Agent {
  return { ...baseAgent, id: branch, slotIndex, issueNumber, branch };
}

const a12 = agent(0, 12, "spore/12-login-redirect");
const a21 = agent(3, 21, "spore/21-dark-mode");

describe("layoutBranches", () => {
  const graph: BranchGraph = {
    hasMore: false,
    commits: [
      commit("x2", "x1"),
      commit("m2", "m1"),
      commit("y1", "m1"),
      commit("x1", "m0"),
      commit("m1", "m0"),
      commit("m0"),
    ],
    heads: [
      { branch: "main", sha: "m2" },
      { branch: a12.branch, sha: "x2" },
      { branch: a21.branch, sha: "y1" },
    ],
  };

  it("keeps main in lane 0 and gives the agents lanes in slot order", () => {
    const layout = layoutBranches(graph, [a21, a12], "main");

    const laneOf = (sha: string) => {
      const row = layout.rows.find((r) => r.commit.sha === sha)!;
      return layout.chains[row.chain].lane;
    };
    expect(["m2", "m1", "m0"].map(laneOf)).toEqual([0, 0, 0]);
    expect(laneOf("x2")).toBe(1);
    expect(laneOf("y1")).toBe(2);
    expect(layout.lanes).toBe(3);
  });

  it("colours main brown and each agent in its slot colour", () => {
    const layout = layoutBranches(graph, [a12, a21], "main");

    expect(layout.chains.map(chainColour)).toEqual([
      "var(--color-branch-main)",
      "var(--color-agent-1)",
      "var(--color-agent-4)",
    ]);
  });

  it("forks an agent's first commit off the commit it started from", () => {
    const layout = layoutBranches(graph, [a12, a21], "main");

    expect(layout.edges).toContainEqual({
      chain: 1,
      from: { row: 3, lane: 1 },
      to: { row: 5, lane: 0 },
      kind: "fork",
    });
  });

  it("labels the heads of main and the agents", () => {
    const layout = layoutBranches(graph, [a12, a21], "main");

    const labels = layout.rows.flatMap((r) => r.labels.map(labelText));
    expect(labels).toEqual(["#12 login-redirect", "main", "#21 dark-mode"]);
  });

  it("puts a new agent's label on main when it has no commits yet", () => {
    const fresh: BranchGraph = {
      hasMore: false,
      commits: [commit("m1", "m0"), commit("m0")],
      heads: [
        { branch: "main", sha: "m1" },
        { branch: a12.branch, sha: "m1" },
      ],
    };

    const layout = layoutBranches(fresh, [a12], "main");

    expect(layout.chains).toHaveLength(1);
    expect(layout.rows[0].labels.map(labelText)).toEqual([
      "main",
      "#12 login-redirect",
    ]);
  });

  it("draws a merged branch in its own grey lane up to the merge", () => {
    const merged: BranchGraph = {
      hasMore: false,
      commits: [
        commit("m2", "m1", "s1"),
        commit("s1", "m0"),
        commit("m1", "m0"),
        commit("m0"),
      ],
      heads: [{ branch: "main", sha: "m2" }],
    };

    const layout = layoutBranches(merged, [], "main");

    expect(layout.rows[0].merge).toBe(true);
    expect(layout.chains[1]).toMatchObject({ lane: 1, top: 0, bottom: 3 });
    expect(chainColour(layout.chains[1])).toBe("var(--color-muted)");
    expect(layout.edges).toContainEqual({
      chain: 1,
      from: { row: 0, lane: 0 },
      to: { row: 1, lane: 1 },
      kind: "merge",
    });
  });

  it("reuses a lane once the branch before it has ended", () => {
    const twoMerges: BranchGraph = {
      hasMore: false,
      commits: [
        commit("m4", "m3", "t1"),
        commit("t1", "m3"),
        commit("m3", "m2"),
        commit("m2", "m1", "s1"),
        commit("s1", "m1"),
        commit("m1"),
      ],
      heads: [{ branch: "main", sha: "m4" }],
    };

    const layout = layoutBranches(twoMerges, [], "main");

    expect(layout.chains.map((c) => c.lane)).toEqual([0, 1, 1]);
    expect(layout.lanes).toBe(2);
  });

  it("leaves branches without an agent unlabelled", () => {
    const leftover: BranchGraph = {
      hasMore: false,
      commits: [commit("z1", "m0"), commit("m0")],
      heads: [
        { branch: "main", sha: "m0" },
        { branch: "spore/7-old", sha: "z1" },
      ],
    };

    const layout = layoutBranches(leftover, [], "main");

    expect(layout.rows[0].labels).toEqual([]);
    expect(layout.rows[0].head).toBe(true);
    expect(chainColour(layout.chains[1])).toBe("var(--color-muted)");
  });

  it("runs a line to the bottom when the parent was cut off", () => {
    const cut: BranchGraph = {
      hasMore: false,
      commits: [commit("m1", "m0")],
      heads: [{ branch: "main", sha: "m1" }],
    };

    const layout = layoutBranches(cut, [], "main");

    expect(layout.edges).toEqual([
      {
        chain: 0,
        from: { row: 0, lane: 0 },
        to: { row: 0.5, lane: 0 },
        kind: "line",
      },
    ]);
  });
});

describe("formatAge", () => {
  it.each([
    [30_000, "0m"],
    [5 * 60_000, "5m"],
    [90 * 60_000, "1h"],
    [50 * 3_600_000, "2d"],
    [-1000, "0m"],
  ])("formats %d ms as %s", (ms, text) => {
    expect(formatAge(ms)).toBe(text);
  });
});
