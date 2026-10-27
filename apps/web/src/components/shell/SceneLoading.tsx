"use client";

import { useState, type ReactNode, type TransitionEvent } from "react";

// While the scene loads (fonts, garden, the shaders compiling on the first
// frames) a veil covers the empty canvas, and a seedling grows in its pot in
// the middle of the scene's free area. When the scene is ready both fade
// out, then unmount.
// The seedling only moves by transform and opacity: the browser runs those
// off the main thread, so it keeps growing while the shaders compile.
// Under reduced motion it stands still, fully grown.

// Fades out once ready, then is gone
function FadeOut({
  ready,
  className,
  children,
}: {
  ready: boolean;
  className: string;
  children?: ReactNode;
}) {
  const [gone, setGone] = useState(false);
  if (gone) return null;

  function end(event: TransitionEvent) {
    if (ready && event.target === event.currentTarget) setGone(true);
  }

  return (
    <div
      className={`${className} transition-opacity duration-500 ${ready ? "opacity-0" : "opacity-100"}`}
      onTransitionEnd={end}
      aria-hidden={ready}
    >
      {children}
    </div>
  );
}

// Covers the canvas
export function SceneVeil({ ready }: { ready: boolean }) {
  return <FadeOut ready={ready} className="absolute inset-0 bg-panel-2" />;
}

// A leaf from its base to its tip, pointing right (flipped: left)
function Leaf({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 20 12"
      className={flip ? "size-full -scale-x-100" : "size-full"}
      aria-hidden
    >
      <path
        d="M0 6 C5 -1 15 -1 20 6 C15 13 5 13 0 6Z"
        fill="var(--color-art-plant-leaf)"
      />
    </svg>
  );
}

// The seedling in its pot and a line of text, centred in its parent.
// The drawing is 64 units a side; the parts are placed in percent of it
export function SceneLoader({ ready }: { ready: boolean }) {
  return (
    <FadeOut
      ready={ready}
      className="grid size-full place-items-center content-center gap-3"
    >
      <div role="status" className="contents">
        <div className="relative size-24">
          {/* The stem grows up from the soil */}
          <div
            className="absolute"
            style={{ left: "47.5%", bottom: "42%", width: "5%", height: "34%" }}
          >
            <div className="size-full origin-bottom rounded-full bg-(--color-art-plant-stem) motion-safe:animate-sprout-stem" />
          </div>
          {/* Two leaves unfold at its top, the right one a moment later */}
          <div
            className="absolute"
            style={{
              right: "50%",
              top: "24%",
              width: "24%",
              height: "14%",
              rotate: "25deg",
              transformOrigin: "right center",
            }}
          >
            <div className="size-full origin-right motion-safe:animate-sprout-leaf">
              <Leaf flip />
            </div>
          </div>
          <div
            className="absolute"
            style={{
              left: "50%",
              top: "18%",
              width: "26%",
              height: "15%",
              rotate: "-20deg",
              transformOrigin: "left center",
            }}
          >
            <div className="size-full origin-left motion-safe:animate-sprout-leaf motion-safe:[animation-delay:150ms]">
              <Leaf />
            </div>
          </div>
          {/* The pot: rim and body, with the soil in its mouth */}
          <svg
            viewBox="0 0 64 64"
            className="absolute inset-0 size-full"
            aria-hidden
          >
            <path
              d="M15 43 H49 L45.5 59 Q45 62 42 62 H22 Q19 62 18.5 59 Z"
              fill="var(--color-art-pot-clay)"
            />
            <rect
              x="11"
              y="36"
              width="42"
              height="8"
              rx="2.5"
              fill="var(--color-art-pot-clay)"
            />
            <rect
              x="15"
              y="44"
              width="34"
              height="1.6"
              fill="var(--color-art-pot-line)"
              opacity="0.35"
            />
            <ellipse
              cx="32"
              cy="37"
              rx="18"
              ry="2"
              fill="var(--color-art-pot-line)"
            />
          </svg>
        </div>
        <p className="font-title text-title-logo text-ink">
          Your garden is growing…
        </p>
      </div>
    </FadeOut>
  );
}
