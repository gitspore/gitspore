import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { FLOOR_Y } from "./layout";
import { pointer, seeded } from "./life";
import { paintedParts } from "./shapes";

//
//
//
// A small rabbit in the grass right of the table, by day. It sits and
// twitches its ears, hops around in short series, nibbles at the grass,
// and now and then sits up on its hind legs to look around. When the
// pointer comes near it bounds off out of the picture, and after a while
// it hops back in somewhere else in its patch

// Its patch of meadow (x from–to, z from–to), where the camera sees the
// floor beside the table's right legs, clear of the string light's post
const HOME = [4.7, 7.6, -2.2, 2.2];
// One hop: how far, how long, how high
const HOP = 0.4;
const HOP_SECONDS = 0.3;
const HOP_HEIGHT = 0.16;
// One bound when it runs off or comes back: longer, quicker, higher
const BOUND = 0.85;
const BOUND_SECONDS = 0.26;
const BOUND_HEIGHT = 0.3;
// How near the pointer (on the floor) may come, where it runs off to
// (past the fence's right end, out of the picture), and how long it
// stays away (from–to)
const SHY = 1.6;
const AWAY = new THREE.Vector3(14, FLOOR_Y, -1.5);
const GONE_SECONDS = [12, 25];
// Where it leans when it sits up: around its hind feet
const HAUNCH_Z = -0.12;

type Action = "sit" | "hop" | "nibble" | "rear" | "flee" | "gone" | "return";

// The body in one painted geometry, facing +z: round haunches and back,
// a pale chest, big hind feet, small front paws, a white tail
function bodyGeometry(fur: string, pale: string) {
  return paintedParts([
    [
      new THREE.SphereGeometry(1, 16, 12)
        .scale(0.16, 0.15, 0.22)
        .translate(0, 0.17, -0.02),
      fur,
    ],
    ...[1, -1].flatMap((side): [THREE.BufferGeometry, string][] => [
      [
        new THREE.SphereGeometry(1, 10, 8)
          .scale(0.07, 0.09, 0.11)
          .translate(side * 0.1, 0.12, -0.08),
        fur,
      ],
      [
        new THREE.SphereGeometry(1, 8, 6)
          .scale(0.04, 0.025, 0.1)
          .translate(side * 0.09, 0.025, -0.01),
        fur,
      ],
      [
        new THREE.SphereGeometry(1, 8, 6)
          .scale(0.025, 0.05, 0.03)
          .translate(side * 0.05, 0.05, 0.14),
        pale,
      ],
    ]),
    [
      new THREE.SphereGeometry(1, 12, 8)
        .scale(0.1, 0.11, 0.09)
        .translate(0, 0.15, 0.1),
      pale,
    ],
    [new THREE.SphereGeometry(0.055, 10, 8).translate(0, 0.2, -0.24), pale],
  ]);
}

// The head, around the neck (its origin): a round head, a pale muzzle,
// a pink nose, two dark eyes
function headGeometry(fur: string, pale: string, pink: string, dark: string) {
  return paintedParts([
    [
      new THREE.SphereGeometry(1, 14, 10)
        .scale(0.095, 0.09, 0.115)
        .translate(0, 0.03, 0.05),
      fur,
    ],
    [
      new THREE.SphereGeometry(1, 10, 8)
        .scale(0.05, 0.04, 0.04)
        .translate(0, 0.0, 0.13),
      pale,
    ],
    [new THREE.SphereGeometry(0.014, 6, 4).translate(0, 0.02, 0.168), pink],
    [new THREE.SphereGeometry(0.018, 6, 4).translate(0.068, 0.05, 0.09), dark],
    [new THREE.SphereGeometry(0.018, 6, 4).translate(-0.068, 0.05, 0.09), dark],
  ]);
}

// One ear, standing up from its root (the origin): furry outside, pink
// inside (toward +z)
function earGeometry(fur: string, pink: string) {
  return paintedParts([
    [
      new THREE.SphereGeometry(1, 10, 8)
        .scale(0.035, 0.13, 0.018)
        .translate(0, 0.12, 0),
      fur,
    ],
    [
      new THREE.SphereGeometry(1, 8, 6)
        .scale(0.022, 0.1, 0.01)
        .translate(0, 0.12, 0.011),
      pink,
    ],
  ]);
}

export function Rabbit({
  fur,
  pale,
  pink,
  dark,
  reducedMotion,
}: {
  fur: string;
  pale: string;
  pink: string;
  dark: string;
  reducedMotion: boolean;
}) {
  const random = useMemo(() => seeded(83), []);
  const body = useMemo(() => bodyGeometry(fur, pale), [fur, pale]);
  const head = useMemo(
    () => headGeometry(fur, pale, pink, dark),
    [fur, pale, pink, dark],
  );
  const ear = useMemo(() => earGeometry(fur, pink), [fur, pink]);
  useEffect(() => () => body.dispose(), [body]);
  useEffect(() => () => head.dispose(), [head]);
  useEffect(() => () => ear.dispose(), [ear]);

  const root = useRef<THREE.Group>(null);
  const lean = useRef<THREE.Group>(null);
  const neck = useRef<THREE.Group>(null);
  const ears = useRef<(THREE.Group | null)[]>([]);
  // What it does now and since when (age, seconds) and for how long; its
  // place and heading; a hop's start and end and where a run of bounds
  // goes; where the head looks; which ear flicks and how much
  const rabbit = useRef({
    action: "sit" as Action,
    age: 0,
    length: 1.5,
    hops: 0,
    heading: -0.6,
    position: new THREE.Vector3(6, FLOOR_Y, 0.4),
    from: new THREE.Vector3(),
    to: new THREE.Vector3(),
    goal: new THREE.Vector3(),
    look: 0,
    lookGoal: 0,
    lean: 0,
    flickEar: 0,
    flick: 0,
  });

  useFrame((_, delta) => {
    const group = root.current;
    if (!group) return;
    const state = rabbit.current;
    const dt = Math.min(delta, 1 / 30);
    if (!reducedMotion) state.age += dt;

    const start = (action: Action, length: number) => {
      state.action = action;
      state.age = 0;
      state.length = length;
    };
    const [x0, x1, z0, z1] = HOME;
    const homeSpot = (into: THREE.Vector3) =>
      into.set(x0 + random() * (x1 - x0), FLOOR_Y, z0 + random() * (z1 - z0));
    // A jump from where it is toward a point, at most `stride` long
    const jump = (toward: THREE.Vector3, stride: number) => {
      state.from.copy(state.position);
      state.to.subVectors(toward, state.from).setY(0);
      if (state.to.length() > stride) state.to.setLength(stride);
      state.to.add(state.from);
      state.heading = Math.atan2(
        state.to.x - state.from.x,
        state.to.z - state.from.z,
      );
    };
    // A hop: roughly ahead; one that would leave the patch heads back in
    const hop = () => {
      state.heading += (random() - 0.5) * 2;
      state.goal.set(
        state.position.x + Math.sin(state.heading) * HOP,
        FLOOR_Y,
        state.position.z + Math.cos(state.heading) * HOP,
      );
      if (
        state.goal.x < x0 ||
        state.goal.x > x1 ||
        state.goal.z < z0 ||
        state.goal.z > z1
      ) {
        homeSpot(state.goal);
      }
      jump(state.goal, HOP);
      start("hop", HOP_SECONDS);
    };
    // Off it runs, or back it comes, in bounds toward the goal
    const bound = (action: "flee" | "return") => {
      jump(state.goal, BOUND);
      start(action, BOUND_SECONDS);
    };

    // Pointer near: off it runs (unless it's away already, or nothing
    // moves under reduced motion)
    const settled =
      state.action !== "flee" &&
      state.action !== "gone" &&
      state.action !== "return";
    if (
      settled &&
      !reducedMotion &&
      pointer.presence.value > 0.5 &&
      pointer.floor.distanceTo(state.position) < SHY
    ) {
      state.goal.copy(AWAY);
      bound("flee");
    }

    let lift = 0;
    let leanGoal = 0;
    let stretch = 0;
    let earsBack = 0;
    let headDown = 0;
    const done = state.age >= state.length;
    switch (state.action) {
      case "sit":
        if (random() < dt * 0.8) state.lookGoal = (random() - 0.5) * 1.6;
        if (done) {
          const roll = random();
          if (roll < 0.5) {
            state.hops = 1 + Math.floor(random() * 4);
            hop();
          } else if (roll < 0.75) {
            start("nibble", 1.5 + random() * 2);
          } else if (roll < 0.9) {
            start("rear", 1.5 + random() * 1.5);
          } else {
            start("sit", 1 + random() * 2);
          }
        }
        break;
      case "hop":
      case "flee":
      case "return": {
        const along = Math.min(state.age / state.length, 1);
        state.position.lerpVectors(state.from, state.to, along);
        const high = state.action === "hop" ? HOP_HEIGHT : BOUND_HEIGHT;
        lift = Math.sin(along * Math.PI) * high;
        // Nose up as it takes off, down as it lands, long in the air
        leanGoal = -Math.cos(along * Math.PI) * 0.3;
        stretch = Math.sin(along * Math.PI) * 0.18;
        earsBack = state.action === "hop" ? 0.4 : 0.9;
        state.lookGoal = 0;
        if (!done) break;
        if (state.action === "hop") {
          state.hops -= 1;
          if (state.hops > 0) hop();
          else start("sit", 1 + random() * 2);
        } else if (state.position.distanceTo(state.goal) > 0.01) {
          bound(state.action);
        } else if (state.action === "flee") {
          const [least, most] = GONE_SECONDS;
          start("gone", least + random() * (most - least));
        } else {
          start("sit", 1.5 + random());
        }
        break;
      }
      case "nibble":
        headDown = 0.75 + Math.sin(state.age * 16) * 0.06;
        state.lookGoal = 0;
        if (done) start("sit", 0.8 + random() * 1.2);
        break;
      case "rear":
        leanGoal = -0.75;
        headDown = 0.55;
        if (random() < dt * 1.5) state.lookGoal = (random() - 0.5) * 2;
        if (done) start("sit", 0.6 + random());
        break;
      case "gone":
        if (done) {
          state.position.copy(AWAY);
          homeSpot(state.goal);
          bound("return");
        }
        break;
    }

    group.visible = state.action !== "gone";
    group.position.set(
      state.position.x,
      state.position.y + lift,
      state.position.z,
    );
    group.rotation.y = state.heading;
    // Leaning eases in, except in the air, where it follows the jump
    const airborne = lift > 0;
    state.lean +=
      (leanGoal - state.lean) * (airborne ? 1 : Math.min(1, dt * 6));
    if (lean.current) {
      lean.current.rotation.x = state.lean;
      lean.current.scale.set(1, 1 - stretch * 0.4, 1 + stretch);
    }
    state.look += (state.lookGoal - state.look) * Math.min(1, dt * 8);
    if (neck.current) {
      neck.current.rotation.set(headDown, state.look, 0);
    }

    // Now and then one ear flicks, quick and back
    if (!reducedMotion && random() < dt * 0.6) {
      state.flickEar = random() < 0.5 ? 0 : 1;
      state.flick = 1;
    }
    state.flick = Math.max(0, state.flick - dt * 4);
    ears.current.forEach((pivot, index) => {
      if (!pivot) return;
      const side = index === 0 ? 1 : -1;
      const flick =
        index === state.flickEar ? Math.sin(state.flick * Math.PI) * 0.5 : 0;
      pivot.rotation.set(-0.2 - earsBack - flick, 0, side * (0.18 + flick));
    });
  });

  return (
    <group ref={root}>
      <group ref={lean} position={[0, 0, HAUNCH_Z]}>
        <group position={[0, 0, -HAUNCH_Z]}>
          <mesh geometry={body} castShadow>
            <meshStandardMaterial vertexColors roughness={0.95} />
          </mesh>
          <group ref={neck} position={[0, 0.27, 0.12]}>
            <mesh geometry={head} castShadow>
              <meshStandardMaterial vertexColors roughness={0.9} />
            </mesh>
            {[1, -1].map((side, index) => (
              <group
                key={side}
                ref={(pivot) => {
                  ears.current[index] = pivot;
                }}
                position={[side * 0.04, 0.1, 0.02]}
              >
                <mesh geometry={ear} castShadow>
                  <meshStandardMaterial vertexColors roughness={0.9} />
                </mesh>
              </group>
            ))}
          </group>
        </group>
      </group>
    </group>
  );
}
