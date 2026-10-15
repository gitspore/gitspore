import type { ReactNode } from "react";
import { Scan } from "lucide-react";
import {
  BranchIcon,
  SeedPacketIcon,
  SproutIcon,
} from "@/components/icons/RailIcons";
import type { MainMode, SidePanelTab } from "@/lib/layout";
import { RailBookmark } from "./RailBookmark";

// The bookmarks on the left edge: the three side panel tabs and scene/focus.
// Icons from Penpot (components/icons/RailIcons.tsx); focus still uses lucide
// until its icon is exported.

const TABS: { tab: SidePanelTab; label: string; icon: ReactNode }[] = [
  { tab: "agents", label: "Agents", icon: <SproutIcon /> },
  { tab: "issues", label: "Issues", icon: <SeedPacketIcon /> },
  { tab: "branches", label: "Branches", icon: <BranchIcon /> },
];

type ToolRailProps = {
  sidePanel: SidePanelTab | null;
  // Clicking the open bookmark again closes the panel (null)
  onSidePanelChange: (tab: SidePanelTab | null) => void;
  mode: MainMode;
  onToggleMode: () => void;
  waitingCount: number;
};

export function ToolRail({
  sidePanel,
  onSidePanelChange,
  mode,
  onToggleMode,
  waitingCount,
}: ToolRailProps) {
  return (
    <div className="flex flex-col gap-2">
      {TABS.map(({ tab, label, icon }) => (
        <RailBookmark
          key={tab}
          label={label}
          icon={icon}
          open={sidePanel === tab}
          onClick={() => onSidePanelChange(sidePanel === tab ? null : tab)}
          count={tab === "agents" ? waitingCount : 0}
        />
      ))}

      <RailBookmark
        className="mt-5"
        label={
          mode === "focus" ? "Back to the scene" : "Focus on the terminals"
        }
        icon={<Scan />}
        open={mode === "focus"}
        onClick={onToggleMode}
      />
    </div>
  );
}
