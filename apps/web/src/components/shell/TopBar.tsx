import type { ReactNode } from "react";
import type { Agent, Issue } from "@gitspore/shared";
import ConnectionStatus, { type Connection } from "./ConnectionStatus";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";
import WaitBadge from "./WaitBadge";
import HelpPopover from "./HelpPopover";
import UsageMeter, { type PlanUsage } from "./UsageMeter";

// The bar along the top.

type TopBarProps = {
  agents: Agent[];
  issues: Issue[];
  selectedSlot: number | null;
  connection: Connection;
  // Plan limits; a missing window hides its meter
  usage?: PlanUsage;
  // Name of the mock scenario while the app runs on fake data
  mockScenario?: string;
  // Temporary controls until the rail and the hotbar exist
  children?: ReactNode;
};

export default function TopBar({
  agents,
  issues,
  selectedSlot,
  connection,
  usage,
  mockScenario,
  children,
}: TopBarProps) {
  const waiting = agents.filter((a) => a.status === "needs_input").length;
  const focused = agents.find((a) => a.slotIndex === selectedSlot);
  const focusedIssue = issues.find((i) => i.number === focused?.issueNumber);

  return (
    <div className="flex h-full items-center gap-4 px-4">
      <Logo />

      {/* The focused agent's issue and branch */}
      {focused && (
        <p className="min-w-0 truncate text-ui-meta">
          <span className="font-bold">
            #{focused.issueNumber} {focusedIssue?.title}
          </span>
          <span className="text-muted-foreground"> · {focused.branch}</span>
        </p>
      )}

      <div className="flex flex-1 items-center justify-center gap-2">
        {children}
      </div>

      <WaitBadge count={waiting} />
      {/* #18: so nobody mistakes mock data for real agents */}
      {mockScenario && (
        <span className="rounded-sm bg-panel-2 px-2 py-1 text-ui-meta">
          Mock: {mockScenario}
        </span>
      )}
      {usage?.fiveHour && <UsageMeter label="5 h" {...usage.fiveHour} />}
      {usage?.week && <UsageMeter label="week" {...usage.week} />}
      <ConnectionStatus status={connection} />
      <HelpPopover />
      <ThemeToggle />
    </div>
  );
}
