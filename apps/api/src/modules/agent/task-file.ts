// Constant on purpose: nothing from the issue reaches the command line. On
// Windows claude.cmd runs through cmd.exe, which reads & | < > ^ % " as
// syntax even inside quotes, so the prompt contains none of them.
export const PROMPT =
  "Read .gitspore/task.md and solve the issue described there. " +
  "Commit and push to this branch as you go. When the issue is fully " +
  "solved and everything is pushed, open a pull request as described in " +
  "the task file. Don't merge it unless the user tells you to.";

export function taskFile(issue: {
  number: number;
  title: string;
  url: string;
  body: string;
}): string {
  return [
    `# Issue #${issue.number}: ${issue.title}`,
    "",
    issue.url,
    "",
    "## Description",
    "",
    issue.body,
    "",
    "## Pull request",
    "",
    `The pull request description must contain \`Closes #${issue.number}\`.`,
    "",
  ].join("\n");
}
