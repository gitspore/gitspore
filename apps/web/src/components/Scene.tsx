"use client";
// Three.js needs the browser (WebGL, window), so anything using
// React Three Fiber must be a Client Component.

import { useEffect, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { StatsGl } from "@react-three/drei";
import { useTheme } from "next-themes";
import * as THREE from "three";
import { useSceneSettings } from "@/lib/sceneSettings";
import { tokens } from "@/theme/tokens";

import { CameraRig } from "./scene/CameraRig";
import { Pots } from "./scene/Pot";
import { RoomLight } from "./scene/RoomLight";
import { Table } from "./scene/Table";
import { Book } from "./scene/Book";
import { Effects } from "./scene/Effects";
import { GitMap } from "./scene/GitMap";
import { SeedPackets } from "./scene/SeedPackets";

//
//
// Development only: the meters. Next writes NODE_ENV into the code when
// it builds, so the production build never mounts them
const DEV = process.env.NODE_ENV === "development";

// Dev meter: draw calls, triangles and GPU geometries of the last frame,
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

// Shadows switched in the settings (#111). R3F turns the shadow map on or
// off, but three.js doesn't rebuild the shaders for it: switched off, the
// last shadows stay frozen; switched on, none appear. needsUpdate makes
// every material compile again on the next frame
function ShadowSwitch({ on }: { on: boolean }) {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        for (const material of [object.material].flat()) {
          material.needsUpdate = true;
        }
      }
    });
  }, [on, scene]);
  return null;
}

export function Scene({
  sceneArea,
}: {
  sceneArea: RefObject<HTMLDivElement | null>;
}) {
  // The mode: next-themes puts "light" (day) or "dark" (night) on <html>.
  // Shadows, glow (bloom), camera motion (orbiting) and fog come from the
  // settings; their URL flags (?shadows=off, ?fx=off, ?orbit=0) override
  // them (#111). ?testing=1, read once, turns on the plant test keys (see Pots)
  const { resolvedTheme } = useTheme();
  const t = resolvedTheme === "light" ? tokens.day : tokens.night;
  const { scene } = useSceneSettings();
  const [testingOn] = useState(
    () => new URLSearchParams(window.location.search).get("testing") === "1",
  );

  // The canvas is created once; a mode change only changes props.
  // - shadows: "percentage" is PCFShadowMap; three 0.186 dropped the soft one
  // - gl: R3F sets the exposure again on the same renderer, no remount
  // - onCreated: bloom draws in several passes, so DrawCalls resets the
  //   counter once per frame
  return (
    <Canvas
      dpr={[1, 2]}
      shadows={scene.shadows ? "percentage" : false}
      gl={{ toneMappingExposure: t.scene.exposure }}
      onCreated={({ gl }) => {
        if (DEV) {
          gl.info.autoReset = false;
        }
      }}
    >
      {/* Sky colour behind everything; distant things fade into the fog
          colour between near and far. Fog's type wants a colour for
          new Fog(), so args holds a dummy; the props set the real one.
          Low power drops the fog; three.js rebuilds the shaders for that */}
      <color attach="background" args={[t.color.scene["sky-horizon"]]} />
      {scene.fog && (
        <fog
          attach="fog"
          args={["#000000"]}
          color={t.color.scene.fog}
          near={t.scene.fog.near}
          far={t.scene.fog.far}
        />
      )}
      <ShadowSwitch on={scene.shadows} />

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

      <Pots
        colors={t.color.scene}
        art={t.color.art.plant}
        testKeys={testingOn}
        ringColors={t.color.status}
        glow={t.scene.glow}
        tag={t.color.tag}
      />
      <Book
        cover={t.color.plate}
        pages={t.color.tag.paper}
        outline={t.color.scene.heart}
        logo={{
          ink: t.color["plate-ink"],
          leaf: t.color.art.logo.leaf,
          seam: t.color.art.logo.seam,
          glow: t.scene.bloom.strength > 0 ? t.scene.glow : 0,
        }}
      />

      <GitMap
        paper={t.color.tag.paper}
        main={t.color["branch-main"]}
        branches={[t.color.agent["1"], t.color.agent["4"]]}
        outline={t.color.scene.heart}
      />

      <SeedPackets
        colors={{
          paper: t.color.packet.paper,
          band: t.color.art.pot.empty,
          title: t.color.packet.title,
          leaf: t.color.packet.leaf,
          ink: t.color.packet.ink,
          muted: t.color.packet.muted,
          outline: t.color.scene.heart,
        }}
      />

      <Table wood={t.color.wood} floor={t.color.scene.floor} />

      <CameraRig sceneArea={sceneArea} orbit={scene.cameraMotion} />
      {/* Bloom only when it shows: by day its strength is 0, so the
          composer would cost a full extra pass for nothing */}
      {scene.glow && t.scene.bloom.strength > 0 && (
        <Effects
          strength={t.scene.bloom.strength}
          threshold={t.scene.bloom.threshold}
        />
      )}

      {/* Dev meters. StatsGl adds its own panel to <body>; the class
          places it. No trackGPU: its timer queries pile up on the HD 530
          and cost 18 ms CPU */}
      {DEV && (
        <StatsGl className="fixed bottom-3 left-3 z-50 origin-bottom-left scale-200" />
      )}
      {DEV && <DrawCalls />}
    </Canvas>
  );
}
