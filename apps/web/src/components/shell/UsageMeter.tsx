import { Meter } from "@base-ui/react/meter";

type UsageMeterProps = {
  label: string; // "5 h" | "week"
  percent: number; // 0–100
  resetsAt?: string; // ISO, shown at 100 %
  tokens?: number; // optional
};

type MeterState = "normal" | "warn" | "full";

// 701000 -> "701k", 20800000 -> "20.8M"
const formatTokens = (n: number) =>
  new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 })
    .format(n)
    .replace("K", "k");

export function UsageMeter({
  label,
  percent,
  resetsAt,
  tokens,
}: UsageMeterProps) {
  const state: MeterState =
    percent >= 100 ? "full" : percent >= 80 ? "warn" : "normal";
  const fill = { normal: "bg-line", warn: "bg-status-review", full: "bg-wait" }[
    state
  ];

  return (
    <Meter.Root
      value={percent}
      className={`flex items-center gap-1 text-ui-meta ${state === "full" ? "text-wait" : ""}`}
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
}
