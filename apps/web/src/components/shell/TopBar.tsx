"use client";

import type { ReactNode } from "react";
import {
  useGreenhouseStore,
  useMockClient,
} from "@/lib/client/GreenhouseClientProvider";
import type { ConnectionStatus as ClientStatus } from "@/lib/client/GreenhouseClient";
import { agentName } from "@/lib/agentName";
import {
  focusedAgent,
  issueTitle,
  needsInputCount,
  selectAgents,
  selectIssues,
  selectPlan,
} from "@/lib/store/selectors";
import { agentTokens, limitTip } from "@/lib/usageTip";
import { ConnectionStatus, type Connection } from "./ConnectionStatus";
import { Logo } from "./Logo";
import { SettingsButton } from "./SettingsButton";
import { ThemeToggle } from "./ThemeToggle";
import { WaitBadge } from "./WaitBadge";
import { HelpPopover } from "./HelpPopover";
import { UsageMeter } from "./UsageMeter";

// The bar along the top. Agents, selection and connection come from the store.

type TopBarProps = {
  children?: ReactNode;
};

const CONNECTION: Record<ClientStatus["kind"], Connection> = {
  connected: "online",
  reconnecting: "reconnecting",
  offline: "offline",
};

export function TopBar({ children }: TopBarProps) {
  const waiting = useGreenhouseStore(needsInputCount);
  // The agent whose window the user works in (#72)
  const focused = useGreenhouseStore(focusedAgent);
  const focusedTitle = useGreenhouseStore(
    issueTitle(focused?.issueNumber ?? null),
  );
  const connection = useGreenhouseStore((s) => CONNECTION[s.connection.kind]);
  const isMock = useGreenhouseStore((s) => s.mode === "mock");
  // The mock client knows which scenario it plays
  const mockScenario = useMockClient()?.scenarioName;
  const plan = useGreenhouseStore(selectPlan);
  const agents = useGreenhouseStore(selectAgents);
  const issues = useGreenhouseStore(selectIssues);
  const tokens = agentTokens(agents, issues);

  return (
    <div className="flex h-full items-center gap-4 px-4">
      <Logo />

      {/* The focused agent's issue and branch */}
      {focused && (
        <p className="min-w-0 truncate text-ui-meta">
          <span className="font-bold">{agentName(focused, focusedTitle)}</span>
          <span className="text-muted-foreground"> · {focused.branch}</span>
        </p>
      )}

      <div className="flex flex-1 items-center justify-center gap-2">
        {children}
      </div>

      <WaitBadge count={waiting} />
      {/* #18: so nobody mistakes mock data for real agents */}
      {isMock && (
        <span className="rounded-sm bg-panel-2 px-2 py-1 text-ui-meta">
          Mock: {mockScenario}
        </span>
      )}
      {plan?.fiveHour && (
        <UsageMeter
          label="5 h"
          percent={plan.fiveHour.usedPercent}
          resetsAt={plan.fiveHour.resetsAt}
          tip={limitTip("fiveHour", plan.fiveHour, tokens)}
        />
      )}
      {plan?.sevenDay && (
        <UsageMeter
          label="week"
          percent={plan.sevenDay.usedPercent}
          resetsAt={plan.sevenDay.resetsAt}
          tip={limitTip("sevenDay", plan.sevenDay, tokens)}
        />
      )}
      <ConnectionStatus status={connection} />
      <HelpPopover />
      <SettingsButton />
      <ThemeToggle />
    </div>
  );
}
