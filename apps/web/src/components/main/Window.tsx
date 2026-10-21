"use client";

import type { Agent } from "@gitspore/shared";
import { Minus, MoonIcon, SunIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
// import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { UsageMeter, type ContextUsage } from "@/components/shell/UsageMeter";
import { STATUS_COLOUR, STATUS_ICON, STATUS_WORD } from "@/lib/status";
import { useState } from "react";
import { useTheme } from "next-themes";
import type { TerminalTheme } from "./TerminalPanel";

// One agent's terminal window.

// xterm.js needs the browser, so the panel is never rendered on the server.
const TerminalPanel = dynamic(
  () => import("./TerminalPanel").then((m) => m.TerminalPanel),
  { ssr: false },
);

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
  // The terminal follows day and night (null)
  // until this window's switch overrides
  const { resolvedTheme } = useTheme();
  const [terminalTheme, setTerminalTheme] = useState<TerminalTheme | null>(
    null,
  );
  const theme = terminalTheme ?? (resolvedTheme === "dark" ? "dark" : "light");

  return (
    <div
      className={`terminal-${theme} flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-terminal-bg shadow-lg outline-2 outline-line`}
    >
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

        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-lg bg-hover hover:bg-ink/20 [&_svg]:size-5"
          aria-label={`Terminal colours: ${theme}`}
          onClick={() => setTerminalTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <MoonIcon /> : <SunIcon />}
        </Button>

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

      <div className="min-h-0 flex-1 p-3">
        <TerminalPanel agentId={agent.id} theme={theme} />
      </div>
    </div>
  );
}
