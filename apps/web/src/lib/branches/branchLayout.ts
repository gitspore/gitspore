import {
  BRANCH_PREFIX,
  type Agent,
  type BranchGraph,
  type GraphCommit,
} from "@gitspore/shared";

export type Chain = {
  lane: number;
  agent: Agent | null;
  base: boolean;
  // Agent branch still on a commit another chain claimed: a lone marker row.
  empty: boolean;
  top: number;
  bottom: number;
};

export type GraphLabel = { branch: string; agent: Agent | null };

export type GraphRow = {
  commit: GraphCommit;
  chain: number;
  head: boolean;
  merge: boolean;
  labels: GraphLabel[];
};

export type GraphEdge = {
  chain: number;
  from: { row: number; lane: number };
  to: { row: number; lane: number };
  kind: "line" | "fork" | "merge";
};

export type BranchLayout = {
  rows: GraphRow[];
  chains: Chain[];
  edges: GraphEdge[];
  markers: { chain: number; row: number }[];
  lanes: number;
};

export function layoutBranches(
  graph: BranchGraph,
  agents: Agent[],
  baseBranch: string,
): BranchLayout {
  const { commits, heads } = graph;
  const rowOf = new Map(commits.map((commit, row) => [commit.sha, row]));
  const chainOf = new Map<string, number>();
  const chains: Chain[] = [];

  const plantedOn = (branch: string) =>
    agents.find((a) => a.branch === branch && a.slotIndex !== null) ?? null;

  const startChain = (sha: string, agent: Agent | null, base: boolean) => {
    const start = rowOf.get(sha);
    if (start === undefined) return;
    if (chainOf.has(sha)) {
      // A branch without commits of its own still gets a lane and a node.
      if (agent) {
        chains.push({
          lane: -1,
          agent,
          base,
          empty: true,
          top: start,
          bottom: start,
        });
      }
      return;
    }
    const id = chains.length;
    const chain: Chain = {
      lane: -1,
      agent,
      base,
      empty: false,
      top: start,
      bottom: start,
    };
    chains.push(chain);

    let current: string | undefined = sha;
    while (current !== undefined) {
      const row = rowOf.get(current);
      if (row === undefined) {
        chain.bottom = commits.length;
        break;
      }
      chain.bottom = row;
      if (chainOf.has(current)) break;
      chainOf.set(current, id);
      current = commits[row].parents[0];
    }
  };

  const baseHead = heads.find((h) => h.branch === baseBranch);
  if (baseHead) startChain(baseHead.sha, null, true);

  heads
    .flatMap((head) => {
      const agent = plantedOn(head.branch);
      return agent ? [{ head, agent }] : [];
    })
    .sort((a, b) => (a.agent.slotIndex ?? 0) - (b.agent.slotIndex ?? 0))
    .forEach(({ head, agent }) => startChain(head.sha, agent, false));

  for (const commit of commits) startChain(commit.sha, null, false);

  commits.forEach((commit, row) => {
    for (const parent of commit.parents.slice(1)) {
      const chain = chainOf.get(parent);
      if (chain === undefined || chain === chainOf.get(commit.sha)) continue;
      chains[chain].top = Math.min(chains[chain].top, row);
    }
  });

  const markers = chains.flatMap((chain, id) =>
    chain.empty ? [{ chain: id, row: chain.top }] : [],
  );

  const hasBase = chains[0]?.base ?? false;
  const taken: Chain[][] = [];
  for (const chain of chains) {
    let lane = chain.base || !hasBase ? 0 : 1;
    while (
      taken[lane]?.some(
        (other) => other.top <= chain.bottom && chain.top <= other.bottom,
      )
    ) {
      lane++;
    }
    chain.lane = lane;
    (taken[lane] ??= []).push(chain);
  }

  const labelsAt = new Map<string, GraphLabel[]>();
  for (const head of heads) {
    const agent = plantedOn(head.branch);
    if (head.branch !== baseBranch && !agent) continue;
    labelsAt.set(head.sha, [
      ...(labelsAt.get(head.sha) ?? []),
      { branch: head.branch, agent },
    ]);
  }
  const headShas = new Set(heads.map((h) => h.sha));

  const rows: GraphRow[] = commits.map((commit) => ({
    commit,
    chain: chainOf.get(commit.sha) ?? 0,
    head: headShas.has(commit.sha),
    merge: commit.parents.length > 1,
    labels: labelsAt.get(commit.sha) ?? [],
  }));

  const edges: GraphEdge[] = [];
  rows.forEach(({ commit, chain }, row) => {
    const lane = chains[chain].lane;
    commit.parents.forEach((parent, k) => {
      const parentRow = rowOf.get(parent);
      if (parentRow === undefined) {
        if (k === 0) {
          edges.push({
            chain,
            from: { row, lane },
            to: { row: commits.length - 0.5, lane },
            kind: "line",
          });
        }
        return;
      }
      const parentChain = chainOf.get(parent) ?? 0;
      const parentLane = chains[parentChain].lane;
      const kind = parentLane === lane ? "line" : k === 0 ? "fork" : "merge";
      edges.push({
        chain: kind === "merge" ? parentChain : chain,
        from: { row, lane },
        to: { row: parentRow, lane: parentLane },
        kind,
      });
    });
  });

  return {
    rows,
    chains,
    edges,
    markers,
    lanes: Math.max(1, ...chains.map((c) => c.lane + 1)),
  };
}

export function chainColour(chain: Chain): string {
  if (chain.base) return "var(--color-branch-main)";
  if (chain.agent && chain.agent.slotIndex !== null) {
    return `var(--color-agent-${chain.agent.slotIndex + 1})`;
  }
  return "var(--color-muted)";
}

export function labelColour(label: GraphLabel): string {
  if (label.agent && label.agent.slotIndex !== null) {
    return `var(--color-agent-${label.agent.slotIndex + 1})`;
  }
  return "var(--color-branch-main)";
}

export function labelText(label: GraphLabel): string {
  if (!label.agent) return label.branch;
  const slug = label.branch.slice(BRANCH_PREFIX.length).replace(/^\d+-?/, "");
  return `#${label.agent.issueNumber} ${slug}`.trim();
}

export function formatAge(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
