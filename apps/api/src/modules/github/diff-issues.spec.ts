import { Issue } from "@gitspore/shared";
import { diffIssues } from "./diff-issues";

function issue(number: number, overrides: Partial<Issue> = {}): Issue {
  return {
    number,
    title: `Issue ${number}`,
    url: `https://github.com/owner/repo/issues/${number}`,
    labels: [],
    body: "",
    ...overrides,
  };
}

describe("diffIssues", () => {
  it("returns no ops when nothing changed", () => {
    const previous = [issue(1), issue(2, { labels: ["bug"] })];
    const next = [issue(1), issue(2, { labels: ["bug"] })];

    const ops = diffIssues(previous, next);

    expect(ops).toEqual([]);
  });

  it("upserts an issue that is new", () => {
    const previous = [issue(1)];
    const next = [issue(1), issue(2)];

    const ops = diffIssues(previous, next);

    expect(ops).toEqual([{ type: "issue:upsert", issue: issue(2) }]);
  });
  it("upserts an issue whose title changed", () => {
    const previous = [issue(1, { title: "Old title" })];
    const next = [issue(1, { title: "New title" })];

    const ops = diffIssues(previous, next);

    expect(ops).toEqual([{ type: "issue:upsert", issue: next[0] }]);
  });
  it("upserts an issue whose labels changed", () => {
    const previous = [issue(1, { labels: ["bug"] })];
    const next = [issue(1, { labels: ["feature"] })];

    const ops = diffIssues(previous, next);

    expect(ops).toEqual([{ type: "issue:upsert", issue: next[0] }]);
  });
  it("upserts an issue that got an additional label", () => {
    const previous = [issue(1, { labels: ["bug"] })];
    const next = [issue(1, { labels: ["bug", "feature"] })];

    const ops = diffIssues(previous, next);

    expect(ops).toEqual([{ type: "issue:upsert", issue: next[0] }]);
  });
  it("upserts an issue whose body changed", () => {
    const previous = [issue(1, { body: "Old text" })];
    const next = [issue(1, { body: "New text" })];

    const ops = diffIssues(previous, next);

    expect(ops).toEqual([{ type: "issue:upsert", issue: next[0] }]);
  });
  it("removes an issue that is no longer open", () => {
    const previous = [issue(1), issue(2)];
    const next = [issue(1)];

    const ops = diffIssues(previous, next);

    expect(ops).toEqual([{ type: "issue:remove", issueNumber: 2 }]);
  });
  it("returns one op per change when several issues change at once", () => {
    const previous = [issue(1), issue(2), issue(3)];
    const next = [issue(1), issue(2, { title: "New title" }), issue(4)];

    const ops = diffIssues(previous, next);

    expect(ops).toHaveLength(3);
    expect(ops).toContainEqual({ type: "issue:upsert", issue: next[1] });
    expect(ops).toContainEqual({ type: "issue:remove", issueNumber: 3 });
    expect(ops).toContainEqual({ type: "issue:upsert", issue: next[2] });
  });

  it("returns no ops for two empty lists", () => {
    const previous: Issue[] = [];
    const next: Issue[] = [];

    const ops = diffIssues(previous, next);

    expect(ops).toEqual([]);
  });
});
