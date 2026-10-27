"use client";

import type { Issue } from "@gitspore/shared";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { IssueBody } from "./IssueBody";

// One open issue in the Issues tab. Clicking its text opens the details:
// title, labels, the body and a link to GitHub.

type IssueRowProps = {
  issue: Issue;
  canPlant: boolean;
  onPlant: () => void;
};

export function IssueRow({ issue, canPlant, onPlant }: IssueRowProps) {
  const plantButton = (
    <Button size="sm" disabled={!canPlant} onClick={onPlant}>
      Plant
    </Button>
  );

  return (
    <Popover>
      {/* Two controls side by side (a button can't hold another): details and Plant */}
      <div className="flex items-center gap-3 rounded-lg py-2 pr-3 pl-2 odd:bg-hover has-data-popup-open:outline-2 has-data-popup-open:outline-line">
        <PopoverTrigger
          render={<button type="button" className="min-w-0 flex-1 text-left" />}
        >
          <span className="block truncate text-ui-row font-semibold">
            #{issue.number} {issue.title}
          </span>
          {issue.labels.length > 0 && (
            <span className="block truncate text-ui-meta text-muted-foreground">
              {issue.labels.join(" · ")}
            </span>
          )}
        </PopoverTrigger>

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

      {/* Left of the panel, which sits at the right edge. Never taller than
          the space the viewport leaves; the body scrolls inside. */}
      <PopoverContent
        side="left"
        align="start"
        sideOffset={28}
        className="max-h-[min(36rem,var(--available-height))] w-96 max-w-(--available-width) gap-3 p-3 shadow-lg"
      >
        <PopoverHeader className="gap-2">
          <PopoverTitle>
            {/* On the span, because cn() drops text-ui-* next to a text colour */}
            <span className="text-ui-row font-semibold text-ink">
              <span className="text-muted-foreground">#{issue.number}</span>{" "}
              {issue.title}
            </span>
          </PopoverTitle>
          {issue.labels.length > 0 && (
            <ul className="flex flex-wrap gap-1" aria-label="Labels">
              {issue.labels.map((label) => (
                <li
                  key={label}
                  className="rounded-full bg-panel-2 px-2 py-0.5 text-ui-small text-ink"
                >
                  {label}
                </li>
              ))}
            </ul>
          )}
        </PopoverHeader>

        <div className="-mx-3 min-h-0 overflow-y-auto border-y border-panel-2 px-3 py-3 text-ui-meta text-ink">
          <IssueBody body={issue.body} />
        </div>

        <a
          href={issue.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 self-start text-ui-meta text-line underline-offset-2 hover:underline"
        >
          <ExternalLink aria-hidden className="size-3.5" />
          Open on GitHub
        </a>
      </PopoverContent>
    </Popover>
  );
}
