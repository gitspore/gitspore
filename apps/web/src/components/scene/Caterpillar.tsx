import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { PEBBLE_SEED, pebbleSpots } from "./Garden";
import { FLOOR_Y } from "./layout";
import { seeded } from "./life";

//
//
//
// A small caterpillar crawling on the ground in front of the table, day
// and night: a head with two dots for eyes and a few green segments, going
// slowly round a little oval path like an inchworm, each segment drawing
// up and stretching out in a wave that runs from the tail to the head.
// The oval is the first of CENTERS that keeps clear of the pebbles. Two
// instanced meshes (body, eyes). Under reduced motion it rests

// Where the oval may be (x, z): bare ground in front of the table, clear
// of the mushrooms, the ants' trail and the worm's patches
const CENTERS = [
  [5.0, 4.5],
  [5.7, 4.1],
  [-5.0, 4.7],
  [2.2, 4.7],
  [-1.6, 4.8],
  [0.4, 5.1],
];
// The oval's half width and depth
const REACH_X = 0.5;
const REACH_Z = 0.26;
// How far from a pebble's edge it stays
const PEBBLE_GAP = 0.1;
// Its segments after the head: how many, how thick, how far apart (at rest)
const SEGMENTS = 6;
const RADIUS = 0.05;
const SPACING = RADIUS * 1.5;
// The head and the eyes, relative to RADIUS
const HEAD = 1.15;
const EYE = 0.28;
// How fast it goes (units a second) and how fast its wave runs (a second)
const SPEED = 0.07;
const WAVE = 2.4;
// How much a segment rises into its arch (relative to RADIUS), how much the
// spacing draws in at the top of it
const ARCH = 0.9;
const DRAW = 0.35;

const SPHERE_COUNT = SEGMENTS + 1;

export function Caterpillar({
  body,
  band,
  head,
  dark,
  reducedMotion,
}: {
  body: string;
  band: string;
  head: string;
  dark: string;
  reducedMotion: boolean;
}) {
  const sphere = useMemo(() => new THREE.SphereGeometry(1, 8, 6), []);
  useEffect(() => () => sphere.dispose(), [sphere]);

  // The oval's centre: the first spot where the whole path is clear
  const center = useMemo(() => {
    const pebbles = pebbleSpots(seeded(PEBBLE_SEED));
    const clear = ([cx, cz]: number[]) => {
      for (let step = 0; step < 24; step++) {
        const angle = (step / 24) * Math.PI * 2;
        const x = cx + Math.cos(angle) * REACH_X;
        const z = cz + Math.sin(angle) * REACH_Z;
        const hit = pebbles.some(
          ([px, pz, size]) =>
            Math.hypot(x - px, z - pz) < size * 1.6 + RADIUS * 2 + PEBBLE_GAP,
        );
        if (hit) return false;
      }
      return true;
    };
    return CENTERS.find(clear) ?? CENTERS[CENTERS.length - 1];
  }, []);

  const bodyMesh = useRef<THREE.InstancedMesh>(null);
  const eyeMesh = useRef<THREE.InstancedMesh>(null);
  // Where the head is on the oval (angle), and the wave
  const crawl = useRef({ angle: Math.PI * 0.3 });

  // Each sphere's colour: the head, then the segments in turn
  useEffect(() => {
    const mesh = bodyMesh.current;
    if (!mesh) return;
    const paint = new THREE.Color();
    mesh.setColorAt(0, paint.set(head));
    for (let i = 1; i < SPHERE_COUNT; i++) {
      mesh.setColorAt(i, paint.set(i % 2 === 0 ? band : body));
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [body, band, head]);

  // Scratch objects, so the frames allocate nothing
  const scratch = useMemo(
    () => ({
      matrix: new THREE.Matrix4(),
      turn: new THREE.Quaternion(),
      size: new THREE.Vector3(),
      place: new THREE.Vector3(),
      yaw: new THREE.Euler(),
      eye: new THREE.Vector3(),
    }),
    [],
  );

  useFrame(({ clock }, delta) => {
    const bodies = bodyMesh.current;
    const eyes = eyeMesh.current;
    if (!bodies || !eyes) return;
    const state = crawl.current;
    const dt = Math.min(delta, 1 / 30);
    const { matrix, turn, size, place, yaw, eye } = scratch;
    const time = reducedMotion ? 0 : clock.elapsedTime;
    const mean = (REACH_X + REACH_Z) / 2;

    // The head goes on a little faster as it stretches out
    const stretch = reducedMotion ? 0 : 0.5 + 0.5 * Math.sin(time * WAVE);
    state.angle += reducedMotion
      ? 0
      : ((SPEED * (0.4 + stretch * 1.2)) / mean) * dt;

    // Segment i behind the head, going the other way round the oval; the
    // wave (a phase per segment) lifts it into an arch and draws it in
    let angle = state.angle;
    for (let i = 0; i < SPHERE_COUNT; i++) {
      if (i > 0) {
        const phase = Math.sin(time * WAVE * 2 - i * 0.9) * 0.5 + 0.5;
        angle -= (SPACING * (1 - DRAW * phase)) / mean;
      }
      const lift = reducedMotion
        ? 0
        : i === 0
          ? 0.25 * RADIUS
          : ARCH * RADIUS * (Math.sin(time * WAVE * 2 - i * 0.9) * 0.5 + 0.5);
      const radius = (i === 0 ? HEAD : 1 - i * 0.04) * RADIUS;
      place.set(
        center[0] + Math.cos(angle) * REACH_X,
        FLOOR_Y + radius * 0.9 + lift,
        center[1] + Math.sin(angle) * REACH_Z,
      );
      // Facing along the oval (the way the head goes: increasing angle)
      const tx = -Math.sin(angle) * REACH_X;
      const tz = Math.cos(angle) * REACH_Z;
      yaw.set(0, Math.atan2(tx, tz), 0);
      turn.setFromEuler(yaw);
      size.setScalar(radius);
      matrix.compose(place, turn, size);
      bodies.setMatrixAt(i, matrix);

      if (i === 0) {
        // The eyes, either side of the front of the head
        for (let side = 0; side < 2; side++) {
          eye
            .set((side === 0 ? -1 : 1) * 0.42, 0.38, 0.8)
            .multiplyScalar(radius)
            .applyQuaternion(turn)
            .add(place);
          size.setScalar(EYE * radius);
          matrix.compose(eye, turn, size);
          eyes.setMatrixAt(side, matrix);
        }
      }
    }
    bodies.instanceMatrix.needsUpdate = true;
    eyes.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh
        ref={bodyMesh}
        args={[sphere, undefined, SPHERE_COUNT]}
        frustumCulled={false}
        castShadow
      >
        <meshStandardMaterial roughness={0.55} />
      </instancedMesh>
      <instancedMesh
        ref={eyeMesh}
        args={[sphere, undefined, 2]}
        frustumCulled={false}
      >
        <meshStandardMaterial color={dark} roughness={0.4} />
      </instancedMesh>
    </>
  );
}
