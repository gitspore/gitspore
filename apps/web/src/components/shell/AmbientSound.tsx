"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

// Ambient sound (#172): birds and wind by day, crickets at night. The loop
// follows the theme like the scene does and cross-fades when it changes.
// Browsers keep audio silent until the first click or key, so it starts
// then; a hidden tab is silent. A missing or broken file stays silent too.
// The files and their licences are in public/sounds.

const TRACKS = { day: "/sounds/day.m4a", night: "/sounds/night.m4a" } as const;
type Mode = keyof typeof TRACKS;
const MODES = Object.keys(TRACKS) as Mode[];

const VOLUME = 0.25;
const FADE_SECONDS = 3;

type Graph = { ctx: AudioContext; gains: Partial<Record<Mode, GainNode>> };

// One gapless loop (an <audio loop> pauses at the seam in some browsers),
// silent until faded in; null when the file is missing or broken
async function loadTrack(ctx: AudioContext, mode: Mode) {
  try {
    const response = await fetch(TRACKS[mode]);
    if (!response.ok) return null;
    const source = ctx.createBufferSource();
    source.buffer = await ctx.decodeAudioData(await response.arrayBuffer());
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain).connect(ctx.destination);
    source.start();
    return gain;
  } catch {
    return null;
  }
}

async function createGraph(): Promise<Graph> {
  const ctx = new AudioContext();
  const gains: Graph["gains"] = {};
  await Promise.all(
    MODES.map(async (mode) => {
      const gain = await loadTrack(ctx, mode);
      if (gain) gains[mode] = gain;
    }),
  );
  return { ctx, gains };
}

// The mode's loop up to VOLUME, the other down to 0, from wherever they are
function fadeTo({ ctx, gains }: Graph, mode: Mode) {
  const now = ctx.currentTime;
  for (const [key, node] of Object.entries(gains)) {
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(node.gain.value, now);
    node.gain.linearRampToValueAtTime(
      key === mode ? VOLUME : 0,
      now + FADE_SECONDS,
    );
  }
}

export function AmbientSound({ enabled }: { enabled: boolean }) {
  const { resolvedTheme } = useTheme();
  const mode: Mode = resolvedTheme === "light" ? "day" : "night";
  const modeRef = useRef(mode);
  // Built once, on the first enable, and kept for the page's life (the
  // shell never unmounts); off only suspends it
  const loading = useRef<Promise<Graph> | null>(null);
  const graph = useRef<Graph | null>(null);

  // Day and night cross-fade
  useEffect(() => {
    modeRef.current = mode;
    if (graph.current) fadeTo(graph.current, mode);
  }, [mode]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;

    // Cheap when already running; a gesture lets a suspended context start
    const resume = () => {
      if (!document.hidden) void graph.current?.ctx.resume();
    };
    const onVisibility = () => {
      if (document.hidden) void graph.current?.ctx.suspend();
      else resume();
    };

    loading.current ??= createGraph();
    void loading.current.then((built) => {
      if (!graph.current) {
        graph.current = built;
        fadeTo(built, modeRef.current);
      }
      if (active) resume();
      else void built.ctx.suspend();
    });

    // Capture, so keys typed into a terminal count as the gesture too
    window.addEventListener("pointerdown", resume, true);
    window.addEventListener("keydown", resume, true);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.removeEventListener("pointerdown", resume, true);
      window.removeEventListener("keydown", resume, true);
      document.removeEventListener("visibilitychange", onVisibility);
      void graph.current?.ctx.suspend();
    };
  }, [enabled]);

  return null;
}
