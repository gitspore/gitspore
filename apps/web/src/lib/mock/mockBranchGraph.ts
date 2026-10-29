import {
  BRANCH_PREFIX,
  type Agent,
  type BranchGraph,
  type BranchHead,
  type GraphCommit,
} from "@gitspore/shared";

const MINUTE = 60_000;

const MAIN_SUBJECTS = [
  "scaffold api and web",
  "theme tokens",
  "ci workflow",
  "toggle store",
];

const AGENT_SUBJECTS = ["first draft", "tests", "fix review notes"];

// Older commits below MAIN_SUBJECTS, so "Load more" has something to load.
const HISTORY = 60;

export const DEFAULT_LIMIT = 40;

export function fakeSha(seed: string): string {
  let hash = 2166136261;
  for (const ch of seed) {
    hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0").repeat(5);
}

export function mockBranchGraph(
  agents: Agent[],
  baseBranch: string,
  now: number,
  limit = DEFAULT_LIMIT,
): BranchGraph {
  const commit = (
    seed: string,
    parents: string[],
    minutesAgo: number,
    subject: string,
    author = "Thomas",
  ): GraphCommit => ({
    sha: fakeSha(seed),
    parents,
    author,
    date: new Date(now - minutesAgo * MINUTE).toISOString(),
    subject,
  });

  const history: GraphCommit[] = [];
  for (let i = 0; i < HISTORY; i++) {
    const parents = i === 0 ? [] : [history[i - 1].sha];
    const minutesAgo = 600 + (HISTORY - i) * 120;
    history.push(commit(`history-${i}`, parents, minutesAgo, `history ${i}`));
  }

  const main: GraphCommit[] = [];
  MAIN_SUBJECTS.forEach((subject, i) => {
    const parents = i === 0 ? [history[HISTORY - 1].sha] : [main[i - 1].sha];
    main.push(commit(`main-${i}`, parents, 600 - i * 60, subject));
  });
  const side = commit("side-0", [main[1].sha], 300, "readme setup", "Claude");
  const merge = commit(
    "main-merge",
    [main[3].sha, side.sha],
    240,
    "merge #9 readme-setup",
  );
  const trunk = [...main, merge];

  const planted = agents
    .filter((a) => a.slotIndex !== null && a.branch.startsWith(BRANCH_PREFIX))
    .sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));

  const branchCommits: GraphCommit[] = [];
  const agentHeads: BranchHead[] = [];
  for (const agent of planted) {
    const slot = agent.slotIndex ?? 0;
    let parent = trunk[trunk.length - 1 - (slot % 3)];
    const count = ((agent.issueNumber ?? 0) % 3) + 1;
    for (let i = 0; i < count; i++) {
      parent = commit(
        `${agent.branch}-${i}`,
        [parent.sha],
        200 - slot * 20 - i * 30,
        AGENT_SUBJECTS[i],
        "Claude",
      );
      branchCommits.push(parent);
    }
    agentHeads.push({ branch: agent.branch, sha: parent.sha });
  }

  const commits = [...branchCommits, ...history, ...trunk, side].sort(
    (a, b) => Date.parse(b.date) - Date.parse(a.date),
  );
  return {
    commits: commits.slice(0, limit),
    hasMore: commits.length > limit,
    heads: [
      { branch: baseBranch, sha: merge.sha },
      ...agentHeads.sort((a, b) => a.branch.localeCompare(b.branch)),
    ],
  };
}
