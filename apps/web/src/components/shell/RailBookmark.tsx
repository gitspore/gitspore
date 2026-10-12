import type { ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// One bookmark on the left edge.

type RailBookmarkProps = {
  label: string;
  icon: ReactNode;
  open: boolean;
  onClick: () => void;
  // Number of waiting agents, shown as a red count badge
  count?: number;
};

export default function RailBookmark({
  label,
  icon,
  open,
  onClick,
  count = 0,
}: RailBookmarkProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            aria-pressed={open}
            onClick={onClick}
            className={cn(
              "relative flex h-13 items-center justify-end rounded-r-lg pr-4 shadow-sm transition-[width] duration-150 [&_svg]:size-5",
              open
                ? "w-bookmark-width-open bg-primary text-primary-foreground"
                : "w-bookmark-width bg-plate text-plate-ink hover:w-bookmark-width-hover",
            )}
          />
        }
      >
        {icon}
        {count > 0 && (
          <span className="absolute -top-2 -right-2 grid size-5 place-items-center rounded-sm bg-wait text-wait-ink ring-2 ring-panel">
            <span className="text-ui-count">{count}</span>
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
