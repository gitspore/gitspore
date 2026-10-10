import { BRANCH_PREFIX } from "@gitspore/shared";
import { branchName } from "./branch-name";

describe("branchName", () => {
  it("builds spore/<issueNumber>-<slug> from the issue", () => {
    expect(branchName(42, "Fix bug")).toBe(`${BRANCH_PREFIX}42-fix-bug`);
  });

  it("turns a title with shell characters into a safe name", () => {
    expect(branchName(42, "Fix: login; rm -rf / && echo")).toBe(
      `${BRANCH_PREFIX}42-fix-login-rm-rf-echo`,
    );
  });

  it("keeps only ASCII letters, without losing umlauts", () => {
    expect(branchName(7, "Über Café 🐛")).toBe(`${BRANCH_PREFIX}7-uber-cafe`);
  });

  it("cuts the slug to 40 characters without a trailing dash", () => {
    const name = branchName(
      1,
      "Add a very long title that keeps moving well past the limit",
    );
    const slug = name.slice(`${BRANCH_PREFIX}1-`.length);

    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith("-")).toBe(false);
  });
});
