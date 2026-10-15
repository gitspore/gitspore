"use client";

import type { Agent } from "@gitspore/shared";
import { Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { UsageMeter, type ContextUsage } from "@/components/shell/UsageMeter";
import { STATUS_COLOUR, STATUS_ICON, STATUS_WORD } from "@/lib/status";

// One agent's terminal window.

type WindowProps = {
  agent: Agent;
  issueTitle: string;
  // Missing until the daemon sends it (#42): the meter stays hidden
  context?: ContextUsage;
  onMinimise: () => void;
};

export function Window({
  agent,
  issueTitle,
  context,
  onMinimise,
}: WindowProps) {
  const StatusIcon = STATUS_ICON[agent.status];

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-terminal-bg shadow-lg outline-2 outline-line">
      <header className="flex h-terminal-header shrink-0 items-center gap-2 border-b-2 border-line bg-panel pr-2 pl-3 text-ink">
        <StatusIcon
          aria-hidden
          className={`size-3 shrink-0 fill-current ${STATUS_COLOUR[agent.status]}`}
        />
        <span className="sr-only">{STATUS_WORD[agent.status]}</span>

        <p className="min-w-0 flex-1 truncate text-ui-meta">
          <span className="font-bold">
            #{agent.issueNumber} {issueTitle}
          </span>
          <span className="text-muted-foreground"> · {agent.branch}</span>
        </p>

        {context && (
          <UsageMeter
            label="context"
            percent={context.percent}
            tokens={context.tokens}
          />
        )}

        <ThemeToggle />

        {/* Window buttons: no fill until hovered (components.md, icon-button in headers) */}
        <Button
          variant="ghost"
          size="icon"
          className="rounded-lg [&_svg]:size-5"
          aria-label={`Minimise #${agent.issueNumber}`}
          onClick={onMinimise}
        >
          <Minus />
        </Button>
      </header>

      <div className="flex-1 p-3 font-mono text-terminal-fg">
        Terminal for {agent.branch}
      </div>
    </div>
  );
}
