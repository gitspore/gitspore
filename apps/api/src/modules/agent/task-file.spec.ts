import { PROMPT, taskFile } from "./task-file";

const ISSUE = {
  number: 42,
  title: "Login fails with umlauts",
  url: "https://github.com/gitspore/gitspore/issues/42",
  body: "Steps to reproduce:\n1. Type ä\n2. Press Enter",
};

describe("PROMPT", () => {
  it("points Claude at the task file", () => {
    expect(PROMPT).toContain(".gitspore/task.md");
  });

  it.each(["&", "|", "<", ">", "^", "%", '"', "\r", "\n"])(
    "contains no %j",
    (char) => {
      expect(PROMPT).not.toContain(char);
    },
  );
});

describe("taskFile", () => {
  it("has the issue's number, title, URL and text", () => {
    const text = taskFile(ISSUE);

    expect(text).toContain("# Issue #42: Login fails with umlauts");
    expect(text).toContain(ISSUE.url);
    expect(text).toContain(ISSUE.body);
  });

  it("asks for Closes #<number> in the pull request", () => {
    expect(taskFile(ISSUE)).toContain("`Closes #42`");
  });

  it("keeps shell syntax in the issue's text unchanged", () => {
    const body = "$(rm -rf ~) `id` \"quoted\" 'single' & | < > ^ %PATH%";

    expect(taskFile({ ...ISSUE, body })).toContain(body);
  });

  it("ends with a newline", () => {
    expect(taskFile(ISSUE).endsWith("\n")).toBe(true);
  });
});
