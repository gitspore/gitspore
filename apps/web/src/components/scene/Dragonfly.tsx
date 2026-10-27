import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { perches, pickPerch, pointer, seeded } from "./life";
import { paintedParts } from "./shapes";

//
//
//
// A dragonfly, by day: it stands still in the air, bobbing a little, then
// darts off to another spot in one quick stroke, and stands still again.
// Now and then it settles on a plant's tip for a while, wings flat. The
// pointer coming near makes it dart away at once

// Where it patrols (x, y, z from–to), how far one dart goes (from–to),
// and how long a dart and a hover take (from–to)
const AREA = [-7, 7, 0.9, 2.6, -6, 2.5];
const DART = [1.5, 3.2];
const DART_SECONDS = [0.4, 0.65];
const HOVER_SECONDS = [0.6, 2.2];
const PERCH_SECONDS = [2, 5];
const SHY = 0.8;
const near = new THREE.Vector3();

// The body, facing +z: a round thorax, a long thin tail behind it, the
// head in front with two big dark eyes
function bodyGeometry(color: string, dark: string) {
  return paintedParts([
    [
      new THREE.SphereGeometry(1, 10, 8)
        .scale(0.03, 0.03, 0.04)
        .translate(0, 0, 0.03),
      color,
    ],
    [
      new THREE.CylinderGeometry(0.008, 0.013, 0.26, 6)
        .rotateX(Math.PI / 2)
        .translate(0, 0, -0.12),
      color,
    ],
    [new THREE.SphereGeometry(0.022, 8, 6).translate(0.018, 0.005, 0.08), dark],
    [
      new THREE.SphereGeometry(0.022, 8, 6).translate(-0.018, 0.005, 0.08),
      dark,
    ],
  ]);
}

// One side's two wings, long thin ovals reaching out along +x, the front
// one ahead of the hind one; the other side is the same, mirrored
function wingsGeometry() {
  const front = new THREE.CircleGeometry(1, 12)
    .scale(0.16, 0.03, 1)
    .rotateX(-Math.PI / 2)
    .rotateY(-0.12)
    .translate(0.15, 0.012, 0.045);
  const hind = new THREE.CircleGeometry(1, 12)
    .scale(0.15, 0.034, 1)
    .rotateX(-Math.PI / 2)
    .rotateY(0.15)
    .translate(0.14, 0.012, -0.005);
  return paintedParts([
    [front, null],
    [hind, null],
  ]);
}

export function Dragonfly({
  color,
  dark,
  wingOpacity,
  reducedMotion,
}: {
  color: string;
  dark: string;
  wingOpacity: number;
  reducedMotion: boolean;
}) {
  const random = useMemo(() => seeded(71), []);
  const body = useMemo(() => bodyGeometry(color, dark), [color, dark]);
  const wing = useMemo(() => wingsGeometry(), []);
  useEffect(() => () => body.dispose(), [body]);
  useEffect(() => () => wing.dispose(), [wing]);

  const root = useRef<THREE.Group>(null);
  const wings = useRef<(THREE.Mesh | null)[]>([]);
  // What it does (hover, dart, perch), since when and for how long, the
  // dart's start and end, its heading, and the perch it heads for
  const fly = useRef({
    action: "hover" as "hover" | "dart" | "perch",
    age: 0,
    length: 1,
    from: new THREE.Vector3(-3, 1.6, -3),
    to: new THREE.Vector3(-3, 1.6, -3),
    position: new THREE.Vector3(-3, 1.6, -3),
    heading: 0,
    perch: null as string | null,
  });

  useFrame(({ clock }, delta) => {
    const group = root.current;
    if (!group) return;
    const state = fly.current;
    const time = clock.elapsedTime;
    if (reducedMotion) {
      group.position.copy(state.position);
      return;
    }
    state.age += Math.min(delta, 1 / 30);
    const between = ([least, most]: number[]) =>
      least + random() * (most - least);

    // A dart: to a perch now and then, else to a spot a dart's length
    // away inside the area
    const dart = () => {
      state.from.copy(state.position);
      state.perch = random() < 0.25 ? pickPerch(random) : null;
      const perch = state.perch ? perches.get(state.perch) : undefined;
      if (perch) {
        state.to.copy(perch.position);
        state.to.y += 0.04;
      } else {
        const angle = random() * Math.PI * 2;
        const reach = between(DART);
        const [x0, x1, y0, y1, z0, z1] = AREA;
        state.to.set(
          THREE.MathUtils.clamp(state.from.x + Math.cos(angle) * reach, x0, x1),
          THREE.MathUtils.clamp(state.from.y + (random() - 0.5), y0, y1),
          THREE.MathUtils.clamp(state.from.z + Math.sin(angle) * reach, z0, z1),
        );
      }
      state.heading = Math.atan2(
        state.to.x - state.from.x,
        state.to.z - state.from.z,
      );
      state.action = "dart";
      state.age = 0;
      state.length = between(DART_SECONDS);
    };

    pointer.ray.closestPointToPoint(state.position, near);
    const startled =
      pointer.presence.value > 0.5 &&
      state.action !== "dart" &&
      near.distanceTo(state.position) < SHY;

    if (startled) {
      dart();
    } else if (state.action === "dart") {
      const along = Math.min(state.age / state.length, 1);
      const eased = 1 - (1 - along) ** 3;
      state.position.lerpVectors(state.from, state.to, eased);
      if (along >= 1) {
        state.action = state.perch ? "perch" : "hover";
        state.age = 0;
        state.length = between(state.perch ? PERCH_SECONDS : HOVER_SECONDS);
      }
    } else if (state.action === "perch") {
      const perch = state.perch ? perches.get(state.perch) : undefined;
      if (perch) state.position.copy(perch.position).y += 0.04;
      if (!perch || perch.weight <= 0 || state.age > state.length) dart();
    } else if (state.age > state.length) {
      dart();
    }

    // Hovering it bobs and sways its heading a little; the wings shiver,
    // except while it sits
    const hovering = state.action === "hover";
    group.position.copy(state.position);
    if (hovering) group.position.y += Math.sin(time * 3.1) * 0.025;
    group.rotation.y =
      state.heading + (hovering ? Math.sin(time * 0.9) * 0.3 : 0);
    const shiver =
      state.action === "perch" ? -0.08 : Math.sin(time * 90) * 0.35;
    wings.current.forEach((mesh, index) => {
      if (mesh) mesh.rotation.z = (index === 0 ? 1 : -1) * shiver;
    });
  });

  return (
    <group ref={root} scale={1.4}>
      <mesh geometry={body} castShadow>
        <meshStandardMaterial vertexColors roughness={0.4} metalness={0.2} />
      </mesh>
      {[1, -1].map((side, index) => (
        <mesh
          key={side}
          ref={(mesh) => {
            wings.current[index] = mesh;
          }}
          geometry={wing}
          scale-x={side}
        >
          <meshStandardMaterial
            transparent
            opacity={wingOpacity}
            depthWrite={false}
            side={THREE.DoubleSide}
            roughness={0.2}
          />
        </mesh>
      ))}
    </group>
  );
}
