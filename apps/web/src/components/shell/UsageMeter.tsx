import { Meter } from "@base-ui/react/meter";
import { formatTokens, type TipContent } from "@/lib/usageTip";
import { cn } from "@/lib/utils";
import { UsageTip } from "./UsageTip";

type UsageMeterProps = {
  label: string; // "5 h" | "week"
  percent: number; // 0–100
  resetsAt?: string; // ISO, shown at 100 %
  tokens?: number; // optional
  tip?: TipContent; // opens on hover and keyboard focus
};

type MeterState = "normal" | "warn" | "full";

export function UsageMeter({
  label,
  percent,
  resetsAt,
  tokens,
  tip,
}: UsageMeterProps) {
  const state: MeterState =
    percent >= 100 ? "full" : percent >= 80 ? "warn" : "normal";
  const fill = { normal: "bg-line", warn: "bg-status-review", full: "bg-wait" }[
    state
  ];

  const meter = (
    <Meter.Root
      value={percent}
      // With a tip it can be focused, and has the hover of an unfilled
      // button (components.md, States).
      tabIndex={tip ? 0 : undefined}
      className={cn(
        "flex items-center gap-1 text-ui-meta",
        state === "full" && "text-wait",
        tip &&
          "rounded-lg px-1.5 py-1 outline-none hover:bg-ink/20 focus-visible:ring-3 focus-visible:ring-ring/50",
      )}
    >
      <Meter.Label
        className={`text-nowrap ${state === "full" ? "" : "text-muted-foreground"}`}
      >
        {label}
      </Meter.Label>
      <Meter.Track className="h-2 w-11 overflow-hidden rounded-full bg-panel-2">
        <Meter.Indicator className={`h-full rounded-full ${fill}`} />
      </Meter.Track>
      <Meter.Value className="text-mono-key font-mono tabular-nums" />
      {state === "full" && resetsAt && (
        <span className="text-mono-key font-mono tabular-nums">
          ·{" "}
          {new Date(resetsAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      )}
      {tokens !== undefined && (
        <span className="text-nowrap">
          ·{" "}
          <span className="text-mono-key font-mono tabular-nums">
            {formatTokens(tokens)}
          </span>{" "}
          tokens
        </span>
      )}
    </Meter.Root>
  );

  return tip ? <UsageTip content={tip} trigger={meter} /> : meter;
}
