import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { FLOOR_Y, TABLE_FRONT, TABLE_HALF_WIDTH } from "./layout";
import { paintedParts } from "./shapes";

//
//
//
// A snail on the front of the right front table leg, so slow you only
// notice after a while that it has moved: it creeps up the leg, turns
// around under the table top, and creeps back down. Its body stretches a
// little with every step

// Where it crawls: the leg's front face (x, z), from just above the floor
// to just under the table top, and how fast (units a second)
const LEG_X = TABLE_HALF_WIDTH - 0.3;
const FACE_Z = TABLE_FRONT - 0.18;
const LOW = FLOOR_Y + 0.25;
const HIGH = -0.45;
const CRAWL = 0.018;
const TURN_SECONDS = 4;
// Bigger than life, so it reads from the camera
const SIZE = 1.6;

// The snail, crawling toward +y with its belly on the leg (-z): a long
// soft body, a head with two eye stalks, and the shell on its back with
// a dark spiral band painted around it
function snailGeometry(shell: string, body: string, dark: string) {
  const coil = new THREE.SphereGeometry(1, 16, 12).scale(0.065, 0.085, 0.085);
  const position = coil.attributes.position;
  const light = new THREE.Color(shell);
  const band = new THREE.Color(dark).lerp(light, 0.4);
  const colors: number[] = [];
  for (let i = 0; i < position.count; i++) {
    const angle = Math.atan2(position.getZ(i), position.getY(i));
    const out = Math.hypot(position.getY(i), position.getZ(i)) / 0.085;
    const turn = (angle / (Math.PI * 2) + out * 1.5 + 1) % 0.5;
    const paint = turn < 0.12 ? band : light;
    colors.push(paint.r, paint.g, paint.b);
  }
  coil.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  coil.translate(0, -0.02, 0.085);

  const stalk = (side: number) =>
    new THREE.CylinderGeometry(0.005, 0.006, 0.07, 4)
      .rotateX(0.5)
      .translate(side * 0.016, 0.155, 0.05);
  const eye = (side: number) =>
    new THREE.SphereGeometry(0.009, 6, 4).translate(side * 0.016, 0.185, 0.068);

  return paintedParts([
    [
      new THREE.CapsuleGeometry(0.028, 0.2, 3, 8)
        .scale(1, 1, 0.7)
        .translate(0, 0.02, 0.02),
      body,
    ],
    [new THREE.SphereGeometry(0.032, 8, 6).translate(0, 0.13, 0.03), body],
    [stalk(1), body],
    [stalk(-1), body],
    [eye(1), dark],
    [eye(-1), dark],
    [coil, null],
  ]);
}

export function Snail({
  shell,
  body,
  dark,
  reducedMotion,
}: {
  shell: string;
  body: string;
  dark: string;
  reducedMotion: boolean;
}) {
  const geometry = useMemo(
    () => snailGeometry(shell, body, dark),
    [shell, body, dark],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  const root = useRef<THREE.Group>(null);
  const crawler = useRef<THREE.Group>(null);
  // How high it is, which way it crawls (1 up, -1 down), and how far
  // through a turn it is (0: not turning)
  const snail = useRef({ y: LOW + 0.3, way: 1, turning: 0 });

  useFrame(({ clock }, delta) => {
    const group = root.current;
    const inner = crawler.current;
    if (!group || !inner) return;
    const state = snail.current;
    const dt = reducedMotion ? 0 : Math.min(delta, 1 / 30);

    if (state.turning > 0) {
      state.turning += dt / TURN_SECONDS;
      if (state.turning >= 1) {
        state.turning = 0;
        state.way = -state.way;
      }
    } else {
      state.y += state.way * CRAWL * dt;
      if (
        (state.way > 0 && state.y > HIGH) ||
        (state.way < 0 && state.y < LOW)
      ) {
        state.turning = dt / TURN_SECONDS;
      }
    }

    // Facing up the leg is a turn of 0, down a half turn, around the axis
    // out of the leg's face
    const facing = state.way > 0 ? 0 : Math.PI;
    group.position.set(LEG_X, state.y, FACE_Z);
    group.rotation.z = facing + state.turning * Math.PI;
    const stretch = reducedMotion
      ? 0
      : Math.sin(clock.elapsedTime * 1.4) * 0.05;
    inner.scale.set(SIZE, SIZE * (1 + stretch), SIZE);
  });

  return (
    <group ref={root}>
      <group ref={crawler} scale={SIZE}>
        <mesh geometry={geometry} castShadow>
          <meshStandardMaterial vertexColors roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}
