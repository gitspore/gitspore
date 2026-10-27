import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { FLOOR_Y } from "./layout";
import { perches, pickPerch, pointer, seeded } from "./life";

//
//
//
// A bumblebee, by day: it buzzes from flower to flower (a bloom or bud on
// the table above all), hovers in front of each for a moment with a
// little jitter, and moves on. Round and striped, with see-through wings
// beating too fast to see. It dodges the pointer like the butterflies

const SPEED = 1.3;
const HOVER_SECONDS = [1.5, 3.5];
const SHY = 0.6;

// The body: a sphere stretched along z, its vertices coloured in bands
// from head (+z) to tail: dark head, yellow, dark, yellow, dark tail
function bodyGeometry(yellow: string, dark: string) {
  const geometry = new THREE.SphereGeometry(1, 16, 12);
  geometry.scale(0.034, 0.032, 0.05);
  const position = geometry.attributes.position;
  const colors: number[] = [];
  const band = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const along = position.getZ(i) / 0.05;
    const striped =
      along > 0.6 || (along < 0.15 && along > -0.2) || along < -0.7;
    band.set(striped ? dark : yellow);
    colors.push(band.r, band.g, band.b);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

const toward = new THREE.Vector3();
const want = new THREE.Vector3();
const nearest = new THREE.Vector3();

export function Bumblebee({
  yellow,
  dark,
  wingOpacity,
  reducedMotion,
}: {
  yellow: string;
  dark: string;
  wingOpacity: number;
  reducedMotion: boolean;
}) {
  const random = useMemo(() => seeded(31), []);
  const body = useMemo(() => bodyGeometry(yellow, dark), [yellow, dark]);
  const wing = useMemo(
    () =>
      new THREE.CircleGeometry(1, 12)
        .scale(0.03, 0.045, 1)
        .rotateX(-Math.PI / 2)
        .translate(0.028, 0, -0.01),
    [],
  );
  useEffect(() => () => body.dispose(), [body]);
  useEffect(() => () => wing.dispose(), [wing]);

  const group = useRef<THREE.Group>(null);
  const wings = useRef<(THREE.Mesh | null)[]>([]);
  // Where the bee is and where it heads (a perch's front), how long it
  // has hovered there and will hover, and how long since it last dodged
  const bee = useRef({
    position: new THREE.Vector3(-5, 1.5, -2),
    velocity: new THREE.Vector3(),
    goal: new THREE.Vector3(0, 1.5, 0),
    perch: null as string | null,
    hovered: 0,
    stay: 2,
    dodged: 0,
  });

  useFrame(({ clock }, delta) => {
    const root = group.current;
    if (!root) return;
    const state = bee.current;
    const time = clock.elapsedTime;
    const dt = Math.min(delta, 1 / 30);
    if (reducedMotion) {
      root.position.copy(state.position);
      return;
    }

    // On to the next flower: when it has hovered long enough, its flower
    // is gone, or the pointer came too close (a quick hop away first)
    const next = () => {
      state.perch = pickPerch(random, state.perch);
      state.hovered = 0;
      const [least, most] = HOVER_SECONDS;
      state.stay = least + random() * (most - least);
    };
    const perch = state.perch ? perches.get(state.perch) : undefined;
    if (!perch || perch.weight <= 0 || state.hovered > state.stay) next();

    state.dodged += dt;
    pointer.ray.closestPointToPoint(state.position, nearest);
    if (
      pointer.presence.value > 0.5 &&
      state.dodged > 1 &&
      nearest.distanceTo(state.position) < SHY
    ) {
      toward.subVectors(state.position, nearest).normalize();
      state.velocity.addScaledVector(toward, 2.5);
      state.dodged = 0;
      next();
    }

    const target = state.perch ? perches.get(state.perch) : undefined;
    if (target) {
      state.goal.copy(target.position);
      state.goal.y += 0.09;
      state.goal.z += 0.06;
    }
    toward.subVectors(state.goal, state.position);
    const distance = toward.length();
    if (distance < 0.05) state.hovered += dt;
    want
      .copy(toward)
      .normalize()
      .multiplyScalar(SPEED * Math.min(1, distance * 2.5));
    state.velocity.lerp(want, Math.min(1, dt * 4));
    state.position.addScaledVector(state.velocity, dt);
    state.position.y = Math.max(state.position.y, FLOOR_Y + 0.15);

    // The jitter of a bee in the air, on top of where it really is
    root.position.set(
      state.position.x + Math.sin(time * 13.1) * 0.008,
      state.position.y + Math.sin(time * 9.7) * 0.012,
      state.position.z + Math.sin(time * 11.3) * 0.008,
    );
    if (state.velocity.lengthSq() > 0.01) {
      root.rotation.y = Math.atan2(state.velocity.x, state.velocity.z);
    } else if (target) {
      root.rotation.y = Math.atan2(
        target.position.x - state.position.x,
        target.position.z - state.position.z,
      );
    }

    const beat = 0.35 + 0.35 * Math.sin(time * 95);
    wings.current[0]?.rotation.set(0, 0, beat);
    wings.current[1]?.rotation.set(0, 0, -beat);
  });

  return (
    <group ref={group} scale={2.4}>
      <mesh geometry={body} castShadow>
        <meshStandardMaterial vertexColors roughness={1} />
      </mesh>
      {[1, -1].map((side, index) => (
        <group key={side} position-y={0.028}>
          <mesh
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
        </group>
      ))}
    </group>
  );
}
