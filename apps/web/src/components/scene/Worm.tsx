import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { PEBBLE_SEED, pebbleSpots } from "./Garden";
import { FLOOR_Y } from "./layout";
import { pointer, seeded } from "./life";

//
//
//
// A small worm that now and then peeks out of the earth near the table,
// day and night: it pokes up out of a little hole, wiggles, turns to look
// around, and slips back in. Then the ground is still for a while, until
// it comes up somewhere else. One worm, a row of round segments in one
// instanced mesh. When the pointer comes near it slips back in at once

// Where it may come up (x from–to, z from–to): bare earth the camera sees
// beside and behind the table, clear of the table top, the robin's and
// the rabbit's patches, the ants' trail, the light posts and the mushrooms
const PATCHES = [
  [4.4, 6.0, 2.6, 3.3],
  [-6.2, -4.8, -4.6, -3.2],
  [4.8, 6.2, -4.6, -3.0],
  [-3.2, 3.2, -6.2, -5.5],
];
// How far from a pebble's edge it stays
const PEBBLE_GAP = 0.08;
// Its segments: how many, how thick, how far apart, and how much of it
// comes out of the ground at most
const SEGMENTS = 22;
const RADIUS = 0.04;
const SPACING = RADIUS * 0.55;
const LENGTH = 0.42;
// Which segments (from the tip) make its thicker band
const BAND = [5, 6, 7];
// How long it takes to come up and to slip back in, how long it stays out
// (from–to), and how long the ground is still in between (from–to)
const RISE_SECONDS = 1.2;
const SINK_SECONDS = 0.8;
const OUT_SECONDS = [3, 6];
const WAIT_SECONDS = [14, 40];
const FIRST_WAIT_SECONDS = [6, 14];
// How near the pointer (on the floor) may come before it slips back in
const SHY = 1.2;
// The hole around it
const HOLE_RADIUS = 0.075;

type Phase = "wait" | "rise" | "out" | "sink";

const between = (random: () => number, [least, most]: number[]) =>
  least + random() * (most - least);

export function Worm({
  body,
  band,
  hole,
  reducedMotion,
}: {
  body: string;
  band: string;
  hole: string;
  reducedMotion: boolean;
}) {
  const random = useMemo(() => seeded(59), []);
  const pebbles = useMemo(() => pebbleSpots(seeded(PEBBLE_SEED)), []);
  const segment = useMemo(() => new THREE.SphereGeometry(1, 8, 6), []);
  useEffect(() => () => segment.dispose(), [segment]);

  const segments = useRef<THREE.InstancedMesh>(null);
  const holeMesh = useRef<THREE.Mesh>(null);
  // What it does now and since when (age, seconds) and for how long; where
  // its hole is; how far it is out (0 to 1); which way it looks, where
  // that is going, and its slow lean
  const worm = useRef({
    phase: "wait" as Phase,
    age: 0,
    length: between(random, FIRST_WAIT_SECONDS),
    spot: new THREE.Vector3(),
    out: 0,
    look: 0,
    lookGoal: 0,
    lean: 0,
    leanGoal: 0,
  });

  // Each segment's colour: the band a little way down from the tip
  useEffect(() => {
    const mesh = segments.current;
    if (!mesh) return;
    const paint = new THREE.Color();
    for (let i = 0; i < SEGMENTS; i++) {
      mesh.setColorAt(i, paint.set(BAND.includes(i) ? band : body));
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [body, band]);

  // Scratch objects, so the frames allocate nothing
  const scratch = useMemo(
    () => ({
      matrix: new THREE.Matrix4(),
      turn: new THREE.Quaternion(),
      size: new THREE.Vector3(),
      place: new THREE.Vector3(),
      yaw: new THREE.Euler(),
    }),
    [],
  );

  useFrame(({ clock }, delta) => {
    const mesh = segments.current;
    if (!mesh) return;
    const state = worm.current;
    const dt = Math.min(delta, 1 / 30);
    state.age += dt;

    const start = (phase: Phase, length: number) => {
      state.phase = phase;
      state.age = 0;
      state.length = length;
    };
    // A spot in one of the patches, between the pebbles
    const pickSpot = () => {
      for (let tries = 0; tries < 30; tries++) {
        const [x0, x1, z0, z1] = PATCHES[Math.floor(random() * PATCHES.length)];
        const x = x0 + random() * (x1 - x0);
        const z = z0 + random() * (z1 - z0);
        const clear = pebbles.every(
          ([px, pz, size]) =>
            Math.hypot(x - px, z - pz) > size * 1.6 + RADIUS + PEBBLE_GAP,
        );
        if (clear) {
          state.spot.set(x, FLOOR_Y, z);
          return;
        }
      }
    };

    // Pointer near: back in it goes
    if (
      !reducedMotion &&
      (state.phase === "rise" || state.phase === "out") &&
      pointer.presence.value > 0.5 &&
      pointer.floor.distanceTo(state.spot) < SHY
    ) {
      start("sink", SINK_SECONDS * 0.5);
    }

    const along = Math.min(state.age / state.length, 1);
    const done = state.age >= state.length;
    // Under reduced motion it is there or not: no coming up, no wiggle
    switch (state.phase) {
      case "wait":
        state.out = 0;
        if (done) {
          pickSpot();
          state.look = state.lookGoal = random() * Math.PI * 2;
          state.lean = 0;
          state.leanGoal = (random() - 0.5) * 0.8;
          start("rise", reducedMotion ? 0 : RISE_SECONDS);
        }
        break;
      case "rise": {
        // Eases out, with a little push now and then as it works its way up
        const eased = 1 - (1 - along) ** 2;
        state.out = reducedMotion
          ? 1
          : eased * (0.92 + 0.08 * Math.sin(along * Math.PI * 3));
        if (done) start("out", between(random, OUT_SECONDS));
        break;
      }
      case "out":
        state.out = 1;
        if (random() < dt * 0.7) {
          state.lookGoal += (random() - 0.5) * 2.4;
          state.leanGoal = (random() - 0.5) * 0.9;
        }
        if (done) start("sink", reducedMotion ? 0 : SINK_SECONDS);
        break;
      case "sink": {
        const from = state.out;
        state.out = reducedMotion ? 0 : Math.min(from, (1 - along) ** 1.5);
        if (done) {
          state.out = 0;
          start("wait", between(random, WAIT_SECONDS));
        }
        break;
      }
    }

    const still = reducedMotion ? 0 : 1;
    state.look += (state.lookGoal - state.look) * Math.min(1, dt * 2) * still;
    state.lean += (state.leanGoal - state.lean) * Math.min(1, dt * 1.5) * still;

    // The hole shows while it is out, opening as it comes up
    if (holeMesh.current) {
      holeMesh.current.visible = state.phase !== "wait";
      holeMesh.current.position.set(
        state.spot.x,
        FLOOR_Y + 0.004,
        state.spot.z,
      );
      holeMesh.current.scale.setScalar(
        Math.max(0.01, Math.min(1, state.out * 3)),
      );
    }

    // The body, from the ground up: each segment's height along it (u),
    // its bend a mix of the slow lean and a wave running up to the tip,
    // more the higher up. Turned around y by where it looks
    const { matrix, turn, size, place, yaw } = scratch;
    const time = clock.elapsedTime;
    const height = state.out * LENGTH;
    const wiggle = still * state.out;
    yaw.set(0, state.look, 0);
    turn.setFromEuler(yaw);
    let x = 0;
    let y = 0;
    let z = 0;
    let lastU = 0;
    for (let i = SEGMENTS - 1; i >= 0; i--) {
      const u = height - i * SPACING;
      const tip = i === 0 ? 0.72 : i === 1 ? 0.9 : 1;
      const thick = BAND.includes(i) ? 1.12 : 1;
      const radius = RADIUS * tip * thick;
      if (u < -radius) {
        matrix.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, matrix);
        continue;
      }
      if (u <= 0) {
        // Still in the ground, straight under the hole
        place.set(0, u, 0);
      } else {
        const step = u - lastU;
        const t = (lastU + step / 2) / LENGTH;
        const sway =
          state.lean * t + Math.sin(time * 5 - t * 5) * 0.55 * t * t * wiggle;
        const nod = Math.sin(time * 3.3 - t * 4 + 1) * 0.3 * t * t * wiggle;
        const dx = Math.sin(sway);
        const dz = Math.sin(nod);
        const dy = Math.sqrt(Math.max(0, 1 - dx * dx - dz * dz));
        x += dx * step;
        y += dy * step;
        z += dz * step;
        lastU = u;
        place.set(x, y, z);
      }
      place.applyQuaternion(turn).add(state.spot);
      size.setScalar(radius);
      matrix.compose(place, turn, size);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = state.phase !== "wait";
  });

  return (
    <>
      <instancedMesh
        ref={segments}
        args={[segment, undefined, SEGMENTS]}
        frustumCulled={false}
        visible={false}
        castShadow
      >
        <meshStandardMaterial roughness={0.45} />
      </instancedMesh>
      <mesh ref={holeMesh} rotation-x={-Math.PI / 2} visible={false}>
        <circleGeometry args={[HOLE_RADIUS, 10]} />
        <meshStandardMaterial color={hole} roughness={1} />
      </mesh>
    </>
  );
}
