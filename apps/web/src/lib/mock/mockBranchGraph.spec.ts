import { agent } from "./scenarioFixtures";
import { mockBranchGraph } from "./mockBranchGraph";

const NOW = Date.parse("2026-10-23T12:00:00.000Z");

describe("mockBranchGraph", () => {
  const agents = [
    { ...agent, id: "a1", slotIndex: 0, issueNumber: 12, branch: "spore/12-a" },
    { ...agent, id: "a2", slotIndex: 3, issueNumber: 21, branch: "spore/21-b" },
    { ...agent, id: "o", slotIndex: null, issueNumber: null, branch: "main" },
  ];

  it("has a head for the base branch and every planted agent", () => {
    const graph = mockBranchGraph(agents, "main", NOW);

    expect(graph.heads.map((h) => h.branch)).toEqual([
      "main",
      "spore/12-a",
      "spore/21-b",
    ]);
  });

  it("puts children before their parents", () => {
    const { commits } = mockBranchGraph(agents, "main", NOW);
    const row = new Map(commits.map((c, i) => [c.sha, i]));

    for (const [i, commit] of commits.entries()) {
      for (const parent of commit.parents) {
        expect(row.get(parent)).toBeGreaterThan(i);
      }
    }
  });

  it("gives the same hashes on every call", () => {
    const first = mockBranchGraph(agents, "main", NOW);
    const later = mockBranchGraph(agents, "main", NOW + 5000);

    expect(later.commits.map((c) => c.sha)).toEqual(
      first.commits.map((c) => c.sha),
    );
  });
});
