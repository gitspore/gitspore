"use client";

import { useEffect, useState } from "react";

// The logo's beetle in terminal pixels, on its plate, while a terminal waits
// for its agent's first output (#55), like Claude Code's mascot. Rasterised
// from Logo.tsx: # body, s seam, l leaf. Squares, not block characters:
// xterm-style █ get seams between rows. The second frame bends the legs, so
// it walks
const FRAMES = [
  [
    "....................",
    "............lll.....",
    "...........lll......",
    "........####........",
    "........####........",
    "........####........",
    ".......#....#.......",
    "......########......",
    "..##.####ss####.##..",
    "...######ss######...",
    "....####ssss####....",
    "....####ssss####....",
    "....####ssss####....",
    "....####ssss####....",
    "..#######ss#######..",
    "..#..####ss####..#..",
    "......###ss###......",
    ".......######.......",
    "........####........",
    "....................",
  ],
  [
    "....................",
    "............lll.....",
    "...........lll......",
    "........####........",
    "........####........",
    "........####........",
    "..#....#....#.......",
    "..##..########......",
    "...######ss####.....",
    "....#####ss######...",
    "....####ssss######..",
    "....####ssss####....",
    "....####ssss####.#..",
    "....####ssss######..",
    "...######ss######...",
    "..##.####ss####.....",
    "..##..###ss###......",
    ".......######.......",
    "........####........",
    "....................",
  ],
];
const FRAME_MS = 260;
const COLOUR: Record<string, string> = {
  "#": "bg-(--color-plate-ink)",
  s: "bg-(--color-art-logo-seam)",
  l: "bg-(--color-art-logo-leaf)",
};

export function StartingBeetle() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    // Stands still under reduced motion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setFrame((f) => 1 - f), FRAME_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-5 font-mono">
      <div aria-hidden className="grid grid-cols-20 rounded-xl bg-plate p-1.5">
        {FRAMES[frame].flatMap((row, y) =>
          [...row].map((pixel, x) => (
            <span
              key={`${x}-${y}`}
              className={`size-1 ${COLOUR[pixel] ?? ""}`}
            />
          )),
        )}
      </div>
      <div className="text-sm leading-snug">
        <p className="font-bold">gitspore</p>
        <p className="opacity-60">waking the agent…</p>
      </div>
    </div>
  );
}
