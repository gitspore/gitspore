"use client";

import { Tooltip } from "@base-ui/react/tooltip";
import type { ReactElement } from "react";
import type { TipContent } from "@/lib/usageTip";
import { cn } from "@/lib/utils";

type UsageTipProps = {
  content: TipContent;
  // The element it opens from, rendered as the tooltip's trigger
  trigger: ReactElement;
};

// The popover with the details of a usage meter (components.md, Usage). A
// tooltip, so it opens on hover and keyboard focus and never takes focus.
export function UsageTip({ content, trigger }: UsageTipProps) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={trigger} />
      <Tooltip.Portal>
        <Tooltip.Positioner side="bottom" sideOffset={8} className="z-50">
          <Tooltip.Popup className="flex w-65 flex-col gap-2 rounded-xl bg-panel p-4 text-ink shadow-lg">
            <p className="text-ui-row">{content.title}</p>
            <dl className="flex flex-col gap-1">
              {content.rows.map((row) => (
                <div
                  key={row.label}
                  className={cn(
                    "flex items-baseline justify-between gap-3",
                    row.total && "mt-1 border-t border-panel-2 pt-2",
                  )}
                >
                  <dt
                    className={cn(
                      "min-w-0 truncate",
                      row.total ? "text-ui-row" : "text-ui-meta",
                    )}
                  >
                    {row.label}
                  </dt>
                  <dd className="text-mono-key font-mono tabular-nums">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
            {content.notes.map((note) => (
              <p key={note} className="text-ui-small text-muted-foreground">
                {note}
              </p>
            ))}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
