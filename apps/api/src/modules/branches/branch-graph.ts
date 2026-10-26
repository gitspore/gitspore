import {
  BRANCH_PREFIX,
  type BranchHead,
  type GraphCommit,
} from "@gitspore/shared";

const FIELD = "\x1f";
const RECORD = "\x1e";

export const LOG_FORMAT = "%H%x1f%P%x1f%an%x1f%aI%x1f%s%x1e";

export const REF_FORMAT = "%(objectname) %(refname)";

export function headPatterns(baseBranch: string): string[] {
  return [
    `refs/heads/${baseBranch}`,
    `refs/remotes/origin/${baseBranch}`,
    `refs/heads/${BRANCH_PREFIX}`,
  ];
}

export function parseCommits(output: string): GraphCommit[] {
  return output
    .split(RECORD)
    .map((record) => record.trim())
    .filter((record) => record !== "")
    .map((record) => {
      const [sha, parents, author, date, subject] = record.split(FIELD);
      return {
        sha,
        parents: parents === "" ? [] : parents.split(" "),
        author,
        date: new Date(date).toISOString(),
        subject,
      };
    });
}

export function parseHeads(output: string, baseBranch: string): BranchHead[] {
  const refs = new Map<string, string>();
  for (const line of output.split("\n")) {
    const [sha, ref] = line.trim().split(" ");
    if (sha && ref) refs.set(ref, sha);
  }

  const heads: BranchHead[] = [];
  const baseSha =
    refs.get(`refs/remotes/origin/${baseBranch}`) ??
    refs.get(`refs/heads/${baseBranch}`);
  if (baseSha) heads.push({ branch: baseBranch, sha: baseSha });

  const spore = `refs/heads/${BRANCH_PREFIX}`;
  for (const [ref, sha] of refs) {
    if (ref.startsWith(spore)) {
      heads.push({ branch: ref.slice("refs/heads/".length), sha });
    }
  }
  return heads;
}
