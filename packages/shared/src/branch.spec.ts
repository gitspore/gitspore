import { BRANCH_PREFIX } from "@gitspore/shared";
import { branchForIssue, issueNumberFromBranch } from "./branch";

describe("branchForIssue", () => {
  it("builds spore/<issueNumber>-<slug> from the issue", () => {
    expect(branchForIssue(42, "Fix bug")).toBe(`${BRANCH_PREFIX}42-fix-bug`);
  });

  it("turns a title with shell characters into a safe name", () => {
    expect(branchForIssue(42, "Fix: login; rm -rf / && echo")).toBe(
      `${BRANCH_PREFIX}42-fix-login-rm-rf-echo`,
    );
  });

  it("keeps only ASCII letters, without losing umlauts", () => {
    expect(branchForIssue(7, "Über Café 🐛")).toBe(
      `${BRANCH_PREFIX}7-uber-cafe`,
    );
  });

  it("cuts the slug to 40 characters without a trailing dash", () => {
    const name = branchForIssue(
      1,
      "Add a very long title that keeps moving well past the limit",
    );
    const slug = name.slice(`${BRANCH_PREFIX}1-`.length);

    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("uses only the number when nothing usable is left of the title", () => {
    expect(branchForIssue(42, "🐛 🔥 !!!")).toBe(`${BRANCH_PREFIX}42`);
  });
});

describe("issueNumberFromBranch", () => {
  it("reads the number from a branch made by branchForIssue", () => {
    const branch = branchForIssue(42, "Fix login");

    const issueNumber = issueNumberFromBranch(branch);

    expect(issueNumber).toBe(42);
  });

  it("reads the number from a branch without a slug", () => {
    const branch = branchForIssue(42, "");

    const issueNumber = issueNumberFromBranch(branch);

    expect(issueNumber).toBe(42);
  });
  it("returns null for a branch without the prefix", () => {
    const branch = "42-fix-login";

    const issueNumber = issueNumberFromBranch(branch);

    expect(issueNumber).toBe(null);
  });
  it("returns null when no number follows the prefix", () => {
    const onlyPrefix = "spore/";
    const dashRightAfterPrefix = "spore/-x";

    const fromOnlyPrefix = issueNumberFromBranch(onlyPrefix);
    const fromDash = issueNumberFromBranch(dashRightAfterPrefix);

    expect(fromOnlyPrefix).toBeNull();
    expect(fromDash).toBeNull();
  });

  it("returns null for a number with a leading zero", () => {
    const branch = "spore/042-with-leading-zero";

    const issueNumber = issueNumberFromBranch(branch);

    expect(issueNumber).toBe(null);
  });
  it("returns null when the part after the prefix is not only digits", () => {
    const letters = "spore/abc";
    const digitsThenLetters = "spore/42abc";

    const fromLetters = issueNumberFromBranch(letters);
    const fromDigitsThenLetters = issueNumberFromBranch(digitsThenLetters);

    expect(fromLetters).toBeNull();
    expect(fromDigitsThenLetters).toBeNull();
  });
});
