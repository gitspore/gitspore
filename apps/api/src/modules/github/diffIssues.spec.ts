import { Issue } from "@gitspore/shared";
import { diffIssues } from "./diffIssues";

function issue(number: number, overrides: Partial<Issue> = {}): Issue {
  return {
    number,
    title: `Issue ${number}`,
    url: `https://github.com/owner/repo/issues/${number}`,
    labels: [],
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

  it("upserts an issue that is new", () => {});
  it("upserts an issue whose title changed", () => {});
  it("upserts an issue whose labels changed", () => {});
  it("removes an issue that is no longer open", () => {});
  it("returns one op per change when several issues change at once", () => {});
  it("returns no ops for two empty lists", () => {});
});
