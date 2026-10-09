import type { Agent, AgentStatus } from "@gitspore/shared";
import { cn } from "@/lib/utils";

// One agent in the side panel.

const STATUS_WORD: Record<AgentStatus, string> = {
  starting: "starting",
  working: "growing",
  needs_input: "waiting",
  error: "wilted",
  done: "review",
  merged: "merged",
};

type AgentRowProps = {
  agent: Agent;
  issueTitle: string;
  focused?: boolean;
  onClick?: () => void;
};

export default function AgentRow({
  agent,
  issueTitle,
  focused,
  onClick,
}: AgentRowProps) {
  const waiting = agent.status === "needs_input";
  const colour = `var(--color-agent-${(agent.slotIndex ?? 0) + 1})`;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-row w-full items-center gap-3 rounded-lg pr-3 pl-2 text-left",
        waiting && "h-row-wait rounded-xl bg-wait text-wait-ink",
        focused && "outline-2 outline-line",
      )}
    >
      {/* Agent colour circle; the plant goes inside later */}
      <span
        className="size-9 shrink-0 rounded-full opacity-35"
        style={{ backgroundColor: colour }}
      />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-ui-row font-semibold">
          #{agent.issueNumber} {issueTitle}
        </span>
        <span
          className={cn(
            "text-ui-meta",
            !waiting && "text-muted-foreground",
            agent.status === "error" && "text-status-error",
          )}
        >
          {STATUS_WORD[agent.status]}
        </span>
      </span>
    </button>
  );
}
