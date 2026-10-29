"use client";

import type { Agent } from "@gitspore/shared";
import { Minus, MoonIcon, SunIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
// import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { UsageMeter } from "@/components/shell/UsageMeter";
import { contextTip } from "@/lib/usageTip";
import { agentName } from "@/lib/agentName";
import { useGreenhouseStore } from "@/lib/client/GreenhouseClientProvider";
import { STATUS_COLOUR, STATUS_ICON, STATUS_WORD } from "@/lib/status";
import { cn } from "@/lib/utils";
import { useRef, type MouseEvent } from "react";
import { useTheme } from "next-themes";

// One agent's terminal window.

// xterm.js needs the browser, so the panel is never rendered on the server.
const TerminalPanel = dynamic(
  () => import("./TerminalPanel").then((m) => m.TerminalPanel),
  { ssr: false },
);

type WindowProps = {
  agent: Agent;
  issueTitle: string;
  focused: boolean;
  onFocus: () => void;
  onMinimise: () => void;
};

export function Window({
  agent,
  issueTitle,
  focused,
  onFocus,
  onMinimise,
}: WindowProps) {
  const StatusIcon = STATUS_ICON[agent.status];
  // The terminal follows day and night until this window's switch
  // overrides; kept in the store, as minimising unmounts the window
  const { resolvedTheme } = useTheme();
  const terminalTheme = useGreenhouseStore(
    (s) => s.layout.windows.find((w) => w.agentId === agent.id)?.theme,
  );
  const setWindowTheme = useGreenhouseStore((s) => s.setWindowTheme);
  const theme = terminalTheme ?? (resolvedTheme === "dark" ? "dark" : "light");
  const name = agentName(agent, issueTitle);

  const usage = agent.usage;
  const tokens = usage?.tokens.total ?? 0;

  // The title, the header's gaps and the padding have nothing focusable, so
  // a click there would leave the keys where they were (or drop them on the
  // page). Like a click into the terminal it focuses the window and moves
  // the keys into its terminal. Buttons and the terminal handle their own.
  const terminalArea = useRef<HTMLDivElement>(null);
  const focusFromBackground = (e: MouseEvent) => {
    const target = e.target as Element;
    const area = terminalArea.current;
    if (target.closest("button")) return;
    if (area && target !== area && area.contains(target)) return;
    e.preventDefault();
    onFocus();
    // xterm.js takes keys through its one textarea
    area?.querySelector("textarea")?.focus();
  };

  return (
    <div
      // Focus inside the window: a click into the terminal, Tab, a button
      onFocusCapture={onFocus}
      onMouseDown={focusFromBackground}
      className={cn(
        `terminal-${theme} flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-terminal-bg shadow-lg outline-2`,
        // Unfocused: the same outline at opacity.window-unfocused (components.md, States)
        focused
          ? "outline-line"
          : "outline-[color-mix(in_srgb,var(--color-line)_calc(var(--opacity-window-unfocused)*100%),transparent)]",
      )}
    >
      <header className="flex h-terminal-header shrink-0 items-center gap-2 border-b-2 border-line bg-panel pr-2 pl-3 text-ink">
        <StatusIcon
          aria-hidden
          className={`size-3 shrink-0 fill-current ${STATUS_COLOUR[agent.status]}`}
        />
        <span className="sr-only">{STATUS_WORD[agent.status]}</span>

        <p className="min-w-0 flex-1 truncate text-ui-meta">
          <span className="font-bold">{name}</span>
          <span className="text-muted-foreground"> · {agent.branch}</span>
        </p>

        {usage && usage.contextPercent !== null && (
          <UsageMeter
            label="context"
            percent={usage.contextPercent}
            tokens={tokens > 0 ? tokens : undefined}
            tip={contextTip(usage)}
          />
        )}

        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-lg bg-hover hover:bg-ink/20 [&_svg]:size-5"
          aria-label={`Terminal colours: ${theme}`}
          onClick={() =>
            setWindowTheme(agent.id, theme === "dark" ? "light" : "dark")
          }
        >
          {theme === "dark" ? <MoonIcon /> : <SunIcon />}
        </Button>

        {/* Window buttons: no fill until hovered (components.md, icon-button in headers) */}
        <Button
          variant="ghost"
          size="icon"
          className="rounded-lg [&_svg]:size-5"
          aria-label={`Minimise ${name}`}
          onClick={onMinimise}
        >
          <Minus />
        </Button>
      </header>

      <div ref={terminalArea} className="min-h-0 flex-1 p-3">
        <TerminalPanel agentId={agent.id} theme={theme} focused={focused} />
      </div>
    </div>
  );
}
