import type { ReactNode } from "react";
import { GitBranch, List, Package, Scan } from "lucide-react";
import type { MainMode, SidePanelTab } from "@/lib/layout";
import RailBookmark from "./RailBookmark";

// The bookmarks on the left edge: the three side panel tabs and scene/focus.
// Icons as in layout.html: agents list, seed packet, branch, focus corners.

const TABS: { tab: SidePanelTab; label: string; icon: ReactNode }[] = [
  { tab: "agents", label: "Agents", icon: <List /> },
  { tab: "issues", label: "Issues", icon: <Package /> },
  { tab: "branches", label: "Branches", icon: <GitBranch /> },
];

type ToolRailProps = {
  sidePanel: SidePanelTab | null;
  // Clicking the open bookmark again closes the panel (null)
  onSidePanelChange: (tab: SidePanelTab | null) => void;
  mode: MainMode;
  onToggleMode: () => void;
  waitingCount: number;
};

export default function ToolRail({
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

      <div className="h-4" />

      <RailBookmark
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
