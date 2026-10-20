"use client";
// Three.js needs the browser (WebGL, window), so anything using
// React Three Fiber must be a Client Component.

import { useEffect, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { StatsGl, OrbitControls } from "@react-three/drei";
import { tokens } from "@/theme/tokens";

import { Pots } from "./spike/Pot";
import { useTheme } from "next-themes";
import { RoomLight } from "./spike/RoomLight";

// // Night for now, the mode we measure in; part 2 follows the page mode
// const t = tokens.night;
// // const t = tokens.day;

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
  // next-themes puts "light" (day) or "dark" (night) on <html>
  const { resolvedTheme } = useTheme();
  const t = resolvedTheme === "light" ? tokens.day : tokens.night;

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 8.2, 10.6], fov: 32 }}
      // Set again on the same renderer when the mode changes, no remount
      gl={{ toneMappingExposure: t.scene.exposure }}
      // gl={{ toneMappingExposure: 2 }}

      // Bloom draws in several passes, so we reset the counter once per frame
      onCreated={({ gl }) => {
        gl.info.autoReset = false;
        // Spike: should log once, however often the mode is toggled
        console.log("Canvas created");
      }}
    >
      <color attach="background" args={[t.color.scene["sky-horizon"]]} />

      {/* Distant things fade into the fog colour, between near and far */}
      <fog
        attach="fog"
        // The type wants a colour for new Fog(); the props below set the real one
        args={["#000000"]}
        color={t.color.scene.fog}
        near={t.scene.fog.near}
        far={t.scene.fog.far}
      />

      <RoomLight intensity={t.scene.environment} />

      {/* Light from all around: sky colour from above, ground colour from below */}
      <hemisphereLight
        color={t.color.light["hemi-sky"]}
        groundColor={t.color.light["hemi-ground"]}
        intensity={t.scene.light.hemi}
      />

      {/* Key: the strong light from the front left; it casts the shadows in step 5 */}
      <directionalLight
        position={[-6, 10, 6]}
        color={t.color.light.key}
        intensity={t.scene.light.key}
      />

      {/* Fill: weak, from the other side, softens the dark sides of the pots */}
      {/* Mounted at night too (intensity 0): a changing light count rebuilds every shader */}
      <directionalLight
        position={[7, 4, -3]}
        color={t.color.light.fill}
        intensity={t.scene.light.fill}
        // intensity={0.3}
      />

      <Pots colors={t.color.scene} />

      <OrbitControls />

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
