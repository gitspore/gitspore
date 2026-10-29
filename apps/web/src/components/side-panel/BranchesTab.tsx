"use client";

import { useEffect, useMemo, useState } from "react";
import type { BranchGraph } from "@gitspore/shared";
import {
  useGreenhouseStore,
  useNow,
} from "@/lib/client/GreenhouseClientProvider";
import {
  chainColour,
  formatAge,
  labelColour,
  labelText,
  layoutBranches,
  type GraphEdge,
  type GraphLabel,
} from "@/lib/branches/branchLayout";
import { Button } from "@/components/ui/button";
import { STATUS_COLOUR } from "@/lib/status";
import { selectAgents } from "@/lib/store/selectors";
import { cn } from "@/lib/utils";

const REFRESH_MS = 5000;
// Commits per page; "Load more" raises the limit by this much.
const PAGE = 40;
const ROW = 28;
const LANE = 16;
const PAD = 12;

const x = (lane: number) => PAD + lane * LANE;
const y = (row: number) => row * ROW + ROW / 2;

function pathOf({ from, to, kind }: GraphEdge): string {
  const x1 = x(from.lane);
  const y1 = y(from.row);
  const x2 = x(to.lane);
  const y2 = y(to.row);
  if (kind === "line") return `M${x1} ${y1}L${x2} ${y2}`;
  if (kind === "fork") {
    const bend = y2 - ROW;
    return `M${x1} ${y1}L${x1} ${bend}C${x1} ${bend + ROW / 2} ${x2} ${bend + ROW / 2} ${x2} ${y2}`;
  }
  const bend = y1 + ROW;
  return `M${x2} ${y2}L${x2} ${bend}C${x2} ${bend - ROW / 2} ${x1} ${bend - ROW / 2} ${x1} ${y1}`;
}

export function BranchesTab() {
  const agents = useGreenhouseStore(selectAgents);
  const baseBranch = useGreenhouseStore(
    (s) => s.server?.repo?.baseBranch ?? "main",
  );
  const selectedSlot = useGreenhouseStore((s) => s.selectedSlot);
  const selectSlot = useGreenhouseStore((s) => s.selectSlot);
  const loadBranchGraph = useGreenhouseStore((s) => s.loadBranchGraph);
  const now = useNow();

  const [graph, setGraph] = useState<BranchGraph | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // Stays raised across the refresh, so loaded rows don't vanish again.
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    let active = true;
    const load = () =>
      loadBranchGraph(limit).then(
        (answer) => {
          if (!active) return;
          if ("error" in answer) {
            setProblem(answer.error.message);
            return;
          }
          setGraph(answer.graph);
          setProblem(null);
        },
        () => {
          if (active) setProblem("No answer from gitspore.");
        },
      );
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [loadBranchGraph, limit]);

  const layout = useMemo(
    () => graph && layoutBranches(graph, agents, baseBranch),
    [graph, agents, baseBranch],
  );

  if (!layout) {
    return (
      <p className="px-2 text-ui-meta text-muted-foreground">
        {problem ?? "Loading branches…"}
      </p>
    );
  }

  const width = PAD * 2 + (layout.lanes - 1) * LANE;
  const selected = layout.chains.findIndex(
    (c) => c.agent !== null && c.agent.slotIndex === selectedSlot,
  );
  const dimmed = (chain: number) => selected !== -1 && chain !== selected;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <p className="px-2 text-ui-meta text-muted-foreground">
        {baseBranch} + agent branches
      </p>
      {problem && (
        <p className="px-2 text-ui-meta text-status-error">{problem}</p>
      )}

      {layout.rows.length === 0 ? (
        <p className="px-2 text-ui-meta text-muted-foreground">
          No commits yet.
        </p>
      ) : (
        // The rows scroll here, the SVG with them: both sit in one box.
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="relative">
            <svg
              aria-hidden
              className="absolute top-0 left-0 overflow-visible"
              width={width}
              height={layout.rows.length * ROW}
            >
              {layout.edges.map((edge, i) => (
                <path
                  key={i}
                  d={pathOf(edge)}
                  fill="none"
                  strokeWidth={2}
                  className={cn(dimmed(edge.chain) && "opacity-35")}
                  style={{ stroke: chainColour(layout.chains[edge.chain]) }}
                />
              ))}
              {layout.rows.map((row, i) => {
                const colour = chainColour(layout.chains[row.chain]);
                return (
                  <circle
                    key={row.commit.sha}
                    cx={x(layout.chains[row.chain].lane)}
                    cy={y(i)}
                    r={row.merge ? 5 : 4}
                    strokeWidth={2}
                    className={cn(dimmed(row.chain) && "opacity-35")}
                    style={{
                      stroke: colour,
                      fill: row.head ? colour : "var(--color-panel)",
                    }}
                  />
                );
              })}
            </svg>

            {layout.rows.map((row) => {
              const owner = layout.chains[row.chain].agent;
              return (
                <div
                  key={row.commit.sha}
                  onClick={() => owner && selectSlot(owner.slotIndex)}
                  className={cn(
                    "flex h-7 items-center gap-2 pr-2",
                    owner && "cursor-pointer",
                    dimmed(row.chain) && "opacity-35",
                  )}
                  style={{ paddingLeft: width }}
                >
                  <span className="shrink-0 font-mono text-ui-meta text-muted-foreground">
                    {row.commit.sha.slice(0, 7)}
                  </span>
                  <span
                    className="min-w-16 flex-1 truncate text-ui-body"
                    title={row.commit.subject}
                  >
                    {row.commit.subject}
                  </span>
                  {row.labels.map((label) => (
                    <BranchLabel
                      key={label.branch}
                      label={label}
                      onOpen={selectSlot}
                    />
                  ))}
                  {now !== 0 && (
                    <span className="shrink-0 text-ui-meta text-muted-foreground tabular-nums">
                      {formatAge(now - Date.parse(row.commit.date))}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {graph?.hasMore && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 w-full text-muted-foreground hover:bg-hover"
              onClick={() => setLimit((l) => l + PAGE)}
            >
              {/* On the span, because cn() drops text-ui-* next to a text colour */}
              <span className="text-ui-meta">Load more</span>
            </Button>
          )}
        </div>
      )}

      <p className="px-2 text-ui-meta text-muted-foreground">
        Click a branch to open its agent.
      </p>
    </div>
  );
}

function BranchLabel({
  label,
  onOpen,
}: {
  label: GraphLabel;
  onOpen: (slot: number) => void;
}) {
  const className =
    "flex max-w-1/2 min-w-0 items-center gap-1 rounded-sm border-2 border-current px-2 text-ui-badge font-semibold";
  const style = { color: labelColour(label) };
  const text = labelText(label);
  const { agent } = label;

  if (!agent || agent.slotIndex === null) {
    return (
      <span className={className} style={style} title={text}>
        <span className="truncate text-ink">{text}</span>
      </span>
    );
  }

  const slot = agent.slotIndex;
  return (
    <button
      type="button"
      className={cn(className, "hover:bg-hover")}
      title={text}
      style={style}
      onClick={(event) => {
        event.stopPropagation();
        onOpen(slot);
      }}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full bg-current",
          STATUS_COLOUR[agent.status],
        )}
      />
      <span className="truncate text-ink">{text}</span>
    </button>
  );
}
