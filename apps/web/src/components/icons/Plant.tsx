import type { ReactNode, SVGProps } from "react";
import { cn } from "@/lib/utils";

// The 2D plant from Penpot (component `plant`, state × pot), for the hotbar
// slot and the agent row (#101). Only the shapes are kept; the colours are
// the color.art.* tokens, the same day and night. The size comes from the
// parent. The wilted plant is drawn at the others' scale, so every pot
// stands on the same line.

export type PlantKind =
  "working" | "waiting" | "wilted" | "review" | "merged" | "empty";

type PlantProps = SVGProps<SVGSVGElement> & {
  kind: PlantKind;
  // With the pot (hotbar slot) or the plant alone (agent row)
  pot?: boolean;
  // Waiting in the agent row: the plant rocks on its stem (components.md, Motion)
  wiggle?: boolean;
};

const stem = (d: string, stroke: string, round = true) => (
  <path
    d={d}
    fill="none"
    stroke={`var(--color-art-plant-${stroke})`}
    strokeWidth={2.53}
    strokeLinecap={round ? "round" : undefined}
  />
);

// The leaf on the review and merged stems
const sideLeaf = (
  <path
    d="M22 22C27.5 17.6 31.9 19.8 33 23.1C28.6 26.4 24.2 25.3 22 22Z"
    fill="var(--color-art-plant-leaf)"
  />
);

// Five petals around the heart, each turned along its angle
const PETALS = [0, 72, 144, 216, 288].map((angle) => {
  const rad = (angle * Math.PI) / 180;
  return {
    angle,
    cx: 22 + Math.cos(rad) * 4.95,
    cy: 11 + Math.sin(rad) * 4.95,
  };
});

const PLANTS: Record<Exclude<PlantKind, "empty">, ReactNode> = {
  working: (
    <>
      {stem("M22 29.7V14.3", "stem")}
      <path
        d="M22 19.8C28.6 13.2 35.2 15.4 36.3 19.8C30.8 24.2 25.3 23.1 22 19.8ZM22 16.5C15.4 11 9.9 13.2 8.8 17.6C14.3 20.9 18.7 19.8 22 16.5Z"
        fill="var(--color-art-plant-leaf)"
      />
    </>
  ),
  waiting: (
    <>
      {stem("M22 29.7C22 22 26.4 16.5 31.9 18.7", "droop-stem")}
      <path
        d="M31.9 18.7C35.2 22 34.1 27.5 30.8 28.6C29.7 25.3 29.7 22 31.9 18.7ZM23.1 23.1C17.6 23.1 14.3 27.5 16.5 30.8C19.8 29.7 22 27.5 23.1 23.1Z"
        fill="var(--color-art-plant-droop-leaf)"
      />
    </>
  ),
  wilted: (
    <path
      d="M22 29.7L19.8 16.5L14.3 13.2M20.9 22L26.4 18.7"
      fill="none"
      stroke="var(--color-art-plant-bare)"
      strokeWidth={2.64}
      strokeLinecap="round"
    />
  ),
  review: (
    <>
      {stem("M22 29.7V14.3", "stem", false)}
      {sideLeaf}
      <path
        d="M22 15.4C18.15 13.2 18.15 6.6 22 4.4C25.85 6.6 25.85 13.2 22 15.4Z"
        fill="var(--color-art-plant-bud)"
        stroke="var(--color-art-plant-bud-line)"
        strokeWidth={1.15}
      />
    </>
  ),
  merged: (
    <>
      {stem("M22 29.7V13.2", "stem", false)}
      {sideLeaf}
      {PETALS.map(({ angle, cx, cy }) => (
        <ellipse
          key={angle}
          cx={cx}
          cy={cy}
          rx={3.96}
          ry={2.86}
          fill="var(--color-art-plant-petal)"
          transform={`rotate(${angle} ${cx} ${cy})`}
        />
      ))}
      <circle cx={22} cy={11} r={2.64} fill="var(--color-art-plant-heart)" />
    </>
  ),
};

// The pot: body and rim. Empty, only its outline at half opacity
function Pot({ empty }: { empty: boolean }) {
  const look = empty
    ? { fill: "none", stroke: "var(--color-art-pot-empty)", strokeWidth: 1.6 }
    : {
        fill: "var(--color-art-pot-clay)",
        stroke: "var(--color-art-pot-line)",
        strokeWidth: 1.72,
      };
  return (
    <g opacity={empty ? 0.5 : undefined}>
      <path d="M9.9 28.6H34.1L31.35 40.7H12.65Z" {...look} />
      <rect x={8.8} y={26.4} width={26.4} height={4.4} rx={1} {...look} />
    </g>
  );
}

export function Plant({
  kind,
  pot = true,
  wiggle = false,
  className,
  ...props
}: PlantProps) {
  return (
    <svg
      viewBox="0 0 44 44"
      aria-hidden
      className={cn("overflow-visible", className)}
      {...props}
    >
      {kind !== "empty" && (
        // Rocks around the foot of the stem, on the rim
        <g
          className={cn(
            "origin-[22px_29.7px]",
            wiggle && "motion-safe:animate-wiggle",
          )}
        >
          {PLANTS[kind]}
        </g>
      )}
      {pot && <Pot empty={kind === "empty"} />}
    </svg>
  );
}
