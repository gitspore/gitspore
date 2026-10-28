import type { Issue, PatchOp } from "@gitspore/shared";

export function diffIssues(previous: Issue[], next: Issue[]): PatchOp[] {
  const before = new Map(previous.map((issue) => [issue.number, issue]));
  const stillOpen = new Set(next.map((issue) => issue.number));
  const ops: PatchOp[] = [];

  for (const issue of next) {
    const old = before.get(issue.number);
    if (!old || !sameIssue(old, issue)) {
      ops.push({ type: "issue:upsert", issue });
    }
  }

  for (const issue of previous) {
    const isOpen = stillOpen.has(issue.number);

    if (!isOpen) {
      ops.push({ type: "issue:remove", issueNumber: issue.number });
    }
  }

  return ops;
}

// Order of labels doesn't matter. GitHub never repeats a label on an issue.
function sameIssue(a: Issue, b: Issue): boolean {
  return (
    a.title === b.title &&
    a.url === b.url &&
    a.body === b.body &&
    a.labels.length === b.labels.length &&
    a.labels.every((label) => b.labels.includes(label))
  );
}
