import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

import { pointer, seeded } from "./life";
import { WIND_GLSL, windUniforms } from "./wind";

//
//
//
// Little lights drifting in the air, all moved on the GPU, one draw call:
// - dust: specks floating in the sun beams by day, twinkling softly
// - fireflies: at night, over the grass and around the table, mostly dark
//   with a slow bright flash each; they drift toward the pointer and
//   circle around it while it moves
// Each mote has a home (position) and four random numbers (seed) that
// give it its own wander, speed and blink

type MoteKind = {
  count: number;
  // the box the homes are in: x, y and z from–to
  box: [number, number, number, number, number, number];
  // how far a mote wanders from home, and its size on screen
  drift: number;
  size: number;
  // 0 = soft twinkle (dust), 1 = dark with flashes (fireflies)
  blink: number;
  // how strongly the pointer pulls (0 = not at all)
  attract: number;
};

export const DUST: MoteKind = {
  count: 170,
  box: [-6, 6, 0.1, 4.5, -4, 3.5],
  drift: 0.45,
  size: 26,
  blink: 0,
  attract: 0.35,
};

export const FIREFLIES: MoteKind = {
  count: 90,
  box: [-8, 8, -1.8, 2.4, -8, 4],
  drift: 0.9,
  size: 110,
  blink: 1,
  attract: 1,
};

const VERTEX = /* glsl */ `
${WIND_GLSL}
attribute vec4 seed;
uniform float uSize;
uniform float uPixelRatio;
uniform float uDrift;
uniform float uBlink;
uniform float uAttract;
uniform float uPresence;
uniform vec3 uRayOrigin;
uniform vec3 uRayDirection;
varying float vBright;

void main() {
  float t = uWindTime;
  vec3 p = position;
  p.x += sin(t * (0.13 + seed.x * 0.2) + seed.y * 6.28) * uDrift;
  p.y += sin(t * (0.21 + seed.z * 0.2) + seed.w * 6.28) * uDrift * 0.5;
  p.z += cos(t * (0.17 + seed.y * 0.2) + seed.x * 6.28) * uDrift;
  p.xz += WIND_DIR * (windAt(p.xz, t) - 0.45) * uDrift * 0.4;

  // the nearest point on the pointer's ray; close motes drift toward it
  // and swing around it
  vec3 nearest = uRayOrigin
    + uRayDirection * max(dot(p - uRayOrigin, uRayDirection), 0.0);
  vec3 toRay = nearest - p;
  float pull = uAttract * uPresence * (1.0 - smoothstep(0.4, 3.0, length(toRay)));
  p += toRay * pull * 0.6;
  p += cross(uRayDirection, toRay) * pull * 0.4 * sin(t * 1.3 + seed.x * 6.28);

  vec4 view = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * view;

  float wave = sin(t * (0.7 + seed.w * 0.9) + seed.z * 20.0) * 0.5 + 0.5;
  vBright = mix(0.55 + 0.45 * wave, 0.08 + pow(wave, 6.0), uBlink);
  gl_PointSize = uSize * (0.6 + seed.x * 0.8) * uPixelRatio / -view.z;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uGlow;
uniform float uOpacity;
varying float vBright;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float halo = smoothstep(0.5, 0.0, d);
  float core = smoothstep(0.16, 0.0, d);
  gl_FragColor = vec4(uColor * uGlow * (halo * 0.5 + core), halo * vBright * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// glow: how bright (above 1 they bloom at night, so fireflies skip tone
// mapping); opacity: how much they show at all
export function Motes({
  kind,
  color,
  glow,
  opacity,
}: {
  kind: MoteKind;
  color: string;
  glow: number;
  opacity: number;
}) {
  const pixelRatio = useThree((state) => state.viewport.dpr);

  const geometry = useMemo(() => {
    const random = seeded(kind.count * 31 + kind.size);
    const [x0, x1, y0, y1, z0, z1] = kind.box;
    const homes: number[] = [];
    const seeds: number[] = [];
    for (let i = 0; i < kind.count; i++) {
      homes.push(
        x0 + random() * (x1 - x0),
        y0 + random() ** 1.6 * (y1 - y0),
        z0 + random() * (z1 - z0),
      );
      seeds.push(random(), random(), random(), random());
    }
    const built = new THREE.BufferGeometry();
    built.setAttribute("position", new THREE.Float32BufferAttribute(homes, 3));
    built.setAttribute("seed", new THREE.Float32BufferAttribute(seeds, 4));
    return built;
  }, [kind]);

  // A new material when the mode changes its colour or glow (rarely).
  // Time, the pointer and its presence are shared uniforms that move on
  // their own
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          ...windUniforms,
          uSize: { value: kind.size },
          uPixelRatio: { value: pixelRatio },
          uDrift: { value: kind.drift },
          uBlink: { value: kind.blink },
          uAttract: { value: kind.attract },
          uPresence: pointer.presence,
          uRayOrigin: { value: pointer.ray.origin },
          uRayDirection: { value: pointer.ray.direction },
          uColor: { value: new THREE.Color(color) },
          uGlow: { value: glow },
          uOpacity: { value: opacity },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: glow <= 1,
      }),
    [kind, color, glow, opacity, pixelRatio],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  return (
    <points geometry={geometry} material={material} frustumCulled={false} />
  );
}
