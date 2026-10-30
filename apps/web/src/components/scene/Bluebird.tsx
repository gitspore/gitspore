import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { FLOOR_Y } from "./layout";
import { seeded } from "./life";
import { paintedParts } from "./shapes";

//
//
//
// A bluebird on the fence behind the table, by day. It sits on the top
// rail for a while, looks around, then flies a loop over
// the garden and lands on the rail again, somewhere else

// The fence's top rail: its radius (as in Surroundings), its height, and
// the angles where the bird may sit (clear of the gate straight behind
// the table)
const RAIL_RADIUS = 11.98;
const RAIL_Y = FLOOR_Y + 1;
const PERCHES = [-2.55, -2.2, -1.9, -1.25, -0.95, -0.65];
// How long it sits (from–to), how long a flight takes, how far in from the
// fence a flight swings and how high it goes
const SIT_SECONDS = [7, 16];
const FLIGHT_SECONDS = 7;
const SWING = 6.5;
const CLIMB = 2.6;

type Action = "sit" | "fly";

const perch = (angle: number, into: THREE.Vector3) =>
  into.set(
    Math.cos(angle) * RAIL_RADIUS,
    RAIL_Y,
    Math.sin(angle) * RAIL_RADIUS,
  );

// The body in one painted geometry, facing +z: a round blue body, a pale
// belly, the tail sticking out back, two thin legs
function bodyGeometry(blue: string, belly: string, dark: string) {
  return paintedParts([
    [
      new THREE.SphereGeometry(1, 14, 10)
        .scale(0.13, 0.12, 0.18)
        .translate(0, 0.19, 0),
      blue,
    ],
    [
      new THREE.SphereGeometry(1, 12, 8)
        .scale(0.105, 0.09, 0.15)
        .translate(0, 0.15, 0.03),
      belly,
    ],
    [
      new THREE.BoxGeometry(0.07, 0.02, 0.2)
        .rotateX(-0.3)
        .translate(0, 0.21, -0.25),
      blue,
    ],
    [
      new THREE.CylinderGeometry(0.008, 0.008, 0.1, 4).translate(
        0.04,
        0.05,
        0.02,
      ),
      dark,
    ],
    [
      new THREE.CylinderGeometry(0.008, 0.008, 0.1, 4).translate(
        -0.04,
        0.05,
        0.02,
      ),
      dark,
    ],
  ]);
}

// The head, around the neck (its origin): blue crown, pale cheeks, a
// short dark beak, two dark eyes
function headGeometry(blue: string, belly: string, dark: string) {
  return paintedParts([
    [new THREE.SphereGeometry(0.08, 12, 8), blue],
    [new THREE.SphereGeometry(0.06, 10, 8).translate(0, -0.03, 0.03), belly],
    [
      new THREE.ConeGeometry(0.016, 0.06, 6)
        .rotateX(Math.PI / 2)
        .translate(0, -0.005, 0.095),
      dark,
    ],
    [new THREE.SphereGeometry(0.012, 6, 4).translate(0.046, 0.02, 0.05), dark],
    [new THREE.SphereGeometry(0.012, 6, 4).translate(-0.046, 0.02, 0.05), dark],
  ]);
}

export function Bluebird({
  blue,
  belly,
  dark,
  reducedMotion,
  seed = 97,
  perches = PERCHES,
}: {
  blue: string;
  belly: string;
  dark: string;
  reducedMotion: boolean;
  seed?: number;
  perches?: number[];
}) {
  const random = useMemo(() => seeded(seed), [seed]);
  const body = useMemo(
    () => bodyGeometry(blue, belly, dark),
    [blue, belly, dark],
  );
  const head = useMemo(
    () => headGeometry(blue, belly, dark),
    [blue, belly, dark],
  );
  const wing = useMemo(
    () =>
      new THREE.SphereGeometry(1, 10, 6)
        .scale(0.02, 0.07, 0.17)
        .translate(0, -0.05, -0.02),
    [],
  );
  useEffect(() => () => body.dispose(), [body]);
  useEffect(() => () => head.dispose(), [head]);
  useEffect(() => () => wing.dispose(), [wing]);

  const root = useRef<THREE.Group>(null);
  const neck = useRef<THREE.Group>(null);
  const wings = useRef<(THREE.Mesh | null)[]>([]);
  // What it does now and since when (age, seconds) and for how long; the
  // perch it sits on or flies from and to (angles); how it sits (heading),
  // where the head looks
  const bird = useRef({
    action: "sit" as Action,
    age: 0,
    length: 8,
    from: perches[2],
    to: perches[2],
    side: 1,
    heading: Math.PI / 2,
    look: 0,
    lookGoal: 0,
    position: perch(perches[2], new THREE.Vector3()),
    ahead: new THREE.Vector3(),
  });

  useFrame((_, delta) => {
    const group = root.current;
    if (!group) return;
    const state = bird.current;
    const dt = Math.min(delta, 1 / 30);
    if (!reducedMotion) state.age += dt;

    // A point on the flight at 0..1: the angle moves on from perch to
    // perch with a wobble, the radius dips in over the garden and back,
    // the bird climbs and settles down with its feet first
    const path = (along: number, into: THREE.Vector3) => {
      const arc = Math.sin(along * Math.PI);
      const angle =
        state.from +
        (state.to - state.from) * along +
        state.side * Math.sin(along * Math.PI * 2) * 0.5;
      const radius = RAIL_RADIUS - SWING * arc ** 0.8;
      return into.set(
        Math.cos(angle) * radius,
        RAIL_Y + CLIMB * arc ** 0.7,
        Math.sin(angle) * radius,
      );
    };

    let flap = 0;
    const done = state.age >= state.length;
    if (state.action === "sit") {
      if (random() < dt * 0.9) state.lookGoal = (random() - 0.5) * 2;
      if (done && !reducedMotion) {
        const others = perches.filter(
          (angle) => Math.abs(angle - state.from) > 0.6,
        );
        state.to = others[Math.floor(random() * others.length)];
        state.side = random() < 0.5 ? 1 : -1;
        state.action = "fly";
        state.age = 0;
        state.length = FLIGHT_SECONDS;
      }
    } else {
      const along = Math.min(state.age / state.length, 1);
      path(along, state.position);
      path(Math.min(along + 0.02, 1), state.ahead);
      if (along < 1) {
        state.heading = Math.atan2(
          state.ahead.x - state.position.x,
          state.ahead.z - state.position.z,
        );
      }
      flap = along < 0.94 ? 1 : (1 - along) / 0.06;
      state.lookGoal = 0;
      if (done) {
        // Landed: sits along the rail, one way or the other
        state.from = state.to;
        perch(state.from, state.position);
        state.heading =
          Math.atan2(Math.cos(state.from), -Math.sin(state.from)) +
          (random() < 0.5 ? 0 : Math.PI);
        state.action = "sit";
        state.age = 0;
        const [least, most] = SIT_SECONDS;
        state.length = least + random() * (most - least);
      }
    }

    group.position.copy(state.position);
    group.rotation.y = state.heading;
    state.look += (state.lookGoal - state.look) * Math.min(1, dt * 8);
    if (neck.current) neck.current.rotation.set(0, state.look, 0);
    const beat = flap * Math.sin(state.age * 20) * 0.9;
    wings.current.forEach((mesh, index) => {
      if (mesh)
        mesh.rotation.z =
          (index === 0 ? 1 : -1) * (0.1 + Math.max(beat, -0.3) + flap * 0.6);
    });
  });

  return (
    <group ref={root} position={perch(perches[2], new THREE.Vector3())}>
      <mesh geometry={body} castShadow>
        <meshStandardMaterial vertexColors roughness={0.9} />
      </mesh>
      <group ref={neck} position={[0, 0.3, 0.1]}>
        <mesh geometry={head} castShadow>
          <meshStandardMaterial vertexColors roughness={0.8} />
        </mesh>
      </group>
      {[1, -1].map((side, index) => (
        <mesh
          key={side}
          ref={(mesh) => {
            wings.current[index] = mesh;
          }}
          geometry={wing}
          position={[side * 0.12, 0.26, 0]}
          castShadow
        >
          <meshStandardMaterial color={blue} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}
