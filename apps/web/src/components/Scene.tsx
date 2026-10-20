"use client";
// Three.js needs the browser (WebGL, window), so anything using
// React Three Fiber must be a Client Component.

import { useEffect, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { StatsGl } from "@react-three/drei";
import { tokens } from "@/theme/tokens";

import { Pots } from "./spike/Pot";

// Night for now, the mode we measure in; part 2 follows the page mode
const t = tokens.night;
// const t = tokens.day;

// Draw calls and triangles of the last frame,
// in a small panel of our own
function DrawCalls() {
  const box = useRef<HTMLDivElement>(null);

  // The panel goes into <body> like StatsGl's, above the interface
  useEffect(() => {
    const el = document.createElement("div");
    el.className =
      "fixed bottom-16 left-3 z-50 bg-black/70 px-2 py-1 font-mono text-xs text-white";
    document.body.appendChild(el);
    box.current = el;
    return () => el.remove();
  }, []);

  useFrame(({ gl }) => {
    // Runs before this frame is drawn, so info still holds the last frame
    const { calls, triangles } = gl.info.render;
    // Geometries on the GPU; reset() doesn't clear it, so a leak shows here
    const { geometries } = gl.info.memory;
    gl.info.reset();
    if (box.current) {
      box.current.textContent = `${calls} calls · ${triangles} tris · ${geometries} geos`;
    }
  });
  return null;
}

export function Scene() {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 8.2, 10.6], fov: 32 }}

      // Bloom draws in several passes, so we reset the counter once per frame
      onCreated={({ gl }) => {
        gl.info.autoReset = false;
      }}
    >
      <color attach="background" args={[t.color.scene["sky-horizon"]]} />

      <hemisphereLight
        args={[
          t.color.light["hemi-sky"],
          t.color.light["hemi-ground"],
          t.scene.light.hemi,
        ]}
      />
      <directionalLight
        position={[-6, 10, 6]}
        color={t.color.light.key}
        intensity={t.scene.light.key}
      />

      <Pots colors={t.color.scene} />

      {/* StatsGl adds its own panel to <body>; the class places it */}
      {/* No trackGPU: its timer queries pile up on the HD 530 and cost 18 ms CPU */}

      <StatsGl
        // trackGPU
        className="fixed bottom-3 left-3 z-50 origin-bottom-left scale-200"
      />

      <DrawCalls />
    </Canvas>
  );
}
