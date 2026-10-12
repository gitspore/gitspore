"use client";

import type { Issue } from "@gitspore/shared";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// One open issue in the Issues tab.

type IssueRowProps = {
  issue: Issue;
  canPlant: boolean;
  onPlant: () => void;
};

export default function IssueRow({ issue, canPlant, onPlant }: IssueRowProps) {
  const plantButton = (
    <Button size="sm" disabled={!canPlant} onClick={onPlant}>
      Plant
    </Button>
  );

  return (
    <div className="flex items-center gap-3 rounded-lg py-2 pr-3 pl-2 odd:bg-hover">
      <div className="min-w-0 flex-1">
        <p className="truncate text-ui-row font-semibold">
          #{issue.number} {issue.title}
        </p>
        {issue.labels.length > 0 && (
          <p className="truncate text-ui-meta text-muted-foreground">
            {issue.labels.join(" · ")}
          </p>
        )}
      </div>

      {canPlant ? (
        plantButton
      ) : (
        // A disabled button gets no mouse events, so the span shows the tooltip
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex" />}>
            {plantButton}
          </TooltipTrigger>
          <TooltipContent>All six pots are taken</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
