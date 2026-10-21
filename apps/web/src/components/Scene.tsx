"use client";
// Three.js needs the browser (WebGL, window), so anything using
// React Three Fiber must be a Client Component.

import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { StatsGl, OrbitControls } from "@react-three/drei";
import { tokens } from "@/theme/tokens";

import { Pots } from "./spike/Pot";
import { useTheme } from "next-themes";
import { RoomLight } from "./spike/RoomLight";
import { Table } from "./spike/Table";

//
//
// Spike meter: draw calls, triangles and GPU geometries of the last frame,
// in a small panel of our own. The panel goes into <body> like StatsGl's,
// above the interface. useFrame runs before this frame is drawn, so
// gl.info still holds the last frame. reset() clears the counters but not
// memory.geometries, so a leak shows as a growing number
function DrawCalls() {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = document.createElement("div");
    el.className =
      "fixed bottom-16 left-3 z-50 bg-black/70 px-2 py-1 font-mono text-xs text-white";
    document.body.appendChild(el);
    box.current = el;
    return () => el.remove();
  }, []);

  useFrame(({ gl }) => {
    const { calls, triangles } = gl.info.render;
    const { geometries } = gl.info.memory;
    gl.info.reset();
    if (box.current) {
      box.current.textContent = `${calls} calls · ${triangles} tris · ${geometries} geos`;
    }
  });
  return null;
}

export function Scene() {
  // The mode: next-themes puts "light" (day) or "dark" (night) on <html>.
  // Spike flags, read once: ?shadows=off and ?orbit=off for the measurements
  const { resolvedTheme } = useTheme();
  const t = resolvedTheme === "light" ? tokens.day : tokens.night;
  const [flags] = useState(() => new URLSearchParams(window.location.search));
  const shadowsOn = flags.get("shadows") !== "off";
  const orbitOn = flags.get("orbit") !== "off";

  // The canvas is created once; a mode change only changes props.
  // - shadows: "percentage" is PCFShadowMap; three 0.186 dropped the soft one
  // - gl: R3F sets the exposure again on the same renderer, no remount
  // - onCreated: bloom draws in several passes, so DrawCalls resets the
  //   counter once per frame
  return (
    <Canvas
      dpr={[1, 2]}
      shadows={shadowsOn ? "percentage" : false}
      camera={{ position: [0, 8.2, 10.6], fov: 32 }}
      gl={{ toneMappingExposure: t.scene.exposure }}
      onCreated={({ gl }) => {
        gl.info.autoReset = false;
      }}
    >
      {/* Sky colour behind everything; distant things fade into the fog
          colour between near and far. Fog's type wants a colour for
          new Fog(), so args holds a dummy; the props set the real one */}
      <color attach="background" args={[t.color.scene["sky-horizon"]]} />
      <fog
        attach="fog"
        args={["#000000"]}
        color={t.color.scene.fog}
        near={t.scene.fog.near}
        far={t.scene.fog.far}
      />

      {/* Light, all from the tokens:
          - RoomLight: soft environment light from all around
          - hemisphere: sky colour from above, ground colour from below
          - key: the strong light from the front left, the only one casting
            shadows, with the prototype's shadow settings (makeLights)
          - fill: weak, from the other side, softens the dark sides of the
            pots. Mounted at night too (intensity 0): a changing light
            count rebuilds every shader */}
      <RoomLight intensity={t.scene.environment} />
      <hemisphereLight
        color={t.color.light["hemi-sky"]}
        groundColor={t.color.light["hemi-ground"]}
        intensity={t.scene.light.hemi}
      />
      <directionalLight
        position={[-6, 10, 6]}
        color={t.color.light.key}
        intensity={t.scene.light.key}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-radius={4}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-camera-near={1}
        shadow-camera-far={30}
      />
      <directionalLight
        position={[7, 4, -3]}
        color={t.color.light.fill}
        intensity={t.scene.light.fill}
      />

      <Pots colors={t.color.scene} />
      <Table wood={t.color.wood} floor={t.color.scene.floor} />

      {orbitOn && <OrbitControls />}

      {/* Spike meters. StatsGl adds its own panel to <body>; the class
          places it. No trackGPU: its timer queries pile up on the HD 530
          and cost 18 ms CPU */}
      <StatsGl
        // trackGPU
        className="fixed bottom-3 left-3 z-50 origin-bottom-left scale-200"
      />
      <DrawCalls />
    </Canvas>
  );
}
