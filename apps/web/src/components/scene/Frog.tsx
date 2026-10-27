import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { POND_SPOT } from "./layout";
import { pointer, seeded } from "./life";
import { paintedParts } from "./shapes";

//
//
//
// A frog at the pond, by day and at night. It sits on a stone of the rim
// or on the lily pad, breathes and blinks, croaks now and then (its
// throat puffs up) and hops to another seat. When the pointer comes near
// it leaps into the water with a plop, and a while later climbs out
// again somewhere else. Everything in the pond's own space (see Pond)

// Where it can sit, in the pond's space, and which way it looks there.
// `water` (in Frog's props) is the height of the water it dives into
export type Seat = { at: THREE.Vector3; heading: number };

// How much bigger than its geometry it is
const SIZE = 1.4;
// A hop: how long and how high, a bit more for each unit it goes
const HOP_SECONDS = 0.3;
const HOP_SECONDS_PER_UNIT = 0.3;
const HOP_HEIGHT = 0.16;
const HOP_HEIGHT_PER_UNIT = 0.12;
// Throat puffs a second while it croaks
const CROAK_RATE = 1.6;
// How near the pointer (on the floor) may come, and how long it stays
// under water (from–to)
const SHY = 1.2;
const UNDER_SECONDS = [6, 12];
// Its eyes, around which they close when it blinks
const EYES_AT = new THREE.Vector3(0, 0.155, 0.09);
// Its throat, around which it puffs
const THROAT_AT = new THREE.Vector3(0, 0.065, 0.11);

type Action = "sit" | "croak" | "hop" | "dive" | "under" | "surface";

// The frog in one painted geometry, facing +z, its feet at the origin: a
// round body tipped nose up, a pale belly and chin, folded hind legs with
// long feet, two thin front legs, bumps for the eyes and dark spots
function bodyGeometry(skin: string, belly: string, spot: string) {
  return paintedParts([
    [
      new THREE.SphereGeometry(1, 14, 10)
        .scale(0.1, 0.065, 0.12)
        .rotateX(-0.35)
        .translate(0, 0.07, 0),
      skin,
    ],
    [
      new THREE.SphereGeometry(1, 10, 8)
        .scale(0.085, 0.05, 0.1)
        .rotateX(-0.35)
        .translate(0, 0.055, 0.015),
      belly,
    ],
    [
      new THREE.SphereGeometry(1, 12, 8)
        .scale(0.08, 0.05, 0.075)
        .translate(0, 0.105, 0.085),
      skin,
    ],
    ...[1, -1].flatMap((side): [THREE.BufferGeometry, string][] => [
      [
        new THREE.SphereGeometry(0.03, 8, 6).translate(
          side * 0.046,
          0.135,
          0.08,
        ),
        skin,
      ],
      [
        new THREE.SphereGeometry(1, 8, 6)
          .scale(0.045, 0.04, 0.085)
          .rotateY(side * 0.3)
          .translate(side * 0.085, 0.04, -0.03),
        skin,
      ],
      [
        new THREE.SphereGeometry(1, 8, 6)
          .scale(0.04, 0.012, 0.065)
          .translate(side * 0.11, 0.01, 0.05),
        skin,
      ],
      [
        new THREE.CylinderGeometry(0.014, 0.016, 0.07, 6)
          .rotateX(0.25)
          .translate(side * 0.045, 0.035, 0.1),
        skin,
      ],
      [
        new THREE.SphereGeometry(1, 6, 4)
          .scale(0.025, 0.01, 0.03)
          .translate(side * 0.05, 0.006, 0.125),
        skin,
      ],
    ]),
    ...[
      [0.035, 0.13, 0],
      [-0.035, 0.122, -0.04],
      [0.01, 0.105, -0.085],
    ].map(([x, y, z]): [THREE.BufferGeometry, string] => [
      new THREE.SphereGeometry(1, 6, 4)
        .scale(0.022, 0.01, 0.025)
        .translate(x, y, z),
      spot,
    ]),
  ]);
}

// The two eyes around EYES_AT: golden balls with dark pupils, looking
// out to the sides and a little ahead
function eyesGeometry(eye: string, dark: string) {
  return paintedParts(
    [1, -1].flatMap((side): [THREE.BufferGeometry, string][] => [
      [
        new THREE.SphereGeometry(0.024, 8, 6).translate(side * 0.052, 0, 0),
        eye,
      ],
      [
        new THREE.SphereGeometry(0.011, 6, 4).translate(
          side * 0.066,
          0.004,
          0.012,
        ),
        dark,
      ],
    ]),
  );
}

// The shortest turn from one heading to another
function turnTo(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export function Frog({
  seats,
  water,
  skin,
  belly,
  spot,
  eye,
  dark,
  splash,
  reducedMotion,
}: {
  seats: Seat[];
  water: number;
  skin: string;
  belly: string;
  spot: string;
  eye: string;
  dark: string;
  splash: (x: number, z: number, size: number) => void;
  reducedMotion: boolean;
}) {
  const random = useMemo(() => seeded(59), []);
  const body = useMemo(
    () => bodyGeometry(skin, belly, spot),
    [skin, belly, spot],
  );
  const eyes = useMemo(() => eyesGeometry(eye, dark), [eye, dark]);
  useEffect(() => () => body.dispose(), [body]);
  useEffect(() => () => eyes.dispose(), [eyes]);

  const root = useRef<THREE.Group>(null);
  const lean = useRef<THREE.Group>(null);
  const lids = useRef<THREE.Group>(null);
  const throat = useRef<THREE.Group>(null);
  // What it does now and since when (age, seconds) and for how long; the
  // seat it sits on (or leaps to); its place, a leap's start and end;
  // where it looks, and how far off its seat's heading; its own clock
  // (for breathing), and a blink running from 1 to 0
  const frog = useRef({
    action: "sit" as Action,
    age: 0,
    length: 3,
    seat: 0,
    position: seats[0].at.clone(),
    from: new THREE.Vector3(),
    to: new THREE.Vector3(),
    heading: seats[0].heading,
    turn: 0,
    time: 0,
    blink: 0,
  });
  const near = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    const group = root.current;
    if (!group) return;
    const state = frog.current;
    const dt = Math.min(delta, 1 / 30);
    if (!reducedMotion) {
      state.age += dt;
      state.time += dt;
    }

    const start = (action: Action, length: number) => {
      state.action = action;
      state.age = 0;
      state.length = length;
    };
    // A leap from where it is to a point, longer leaps take longer
    const leap = (to: THREE.Vector3, action: "hop" | "dive" | "surface") => {
      state.from.copy(state.position);
      state.to.copy(to);
      const distance = Math.hypot(to.x - state.from.x, to.z - state.from.z);
      state.heading = Math.atan2(to.x - state.from.x, to.z - state.from.z);
      start(action, HOP_SECONDS + distance * HOP_SECONDS_PER_UNIT);
    };
    const otherSeat = () =>
      (state.seat + 1 + Math.floor(random() * (seats.length - 1))) %
      seats.length;

    // Pointer near: into the water it goes (unless it's in the air or
    // under already, or nothing moves under reduced motion)
    near.set(pointer.floor.x - POND_SPOT[0], 0, pointer.floor.z - POND_SPOT[1]);
    if (
      (state.action === "sit" || state.action === "croak") &&
      !reducedMotion &&
      pointer.presence.value > 0.5 &&
      Math.hypot(near.x - state.position.x, near.z - state.position.z) < SHY
    ) {
      const seat = seats[state.seat].at;
      leap(new THREE.Vector3(seat.x * 0.35, water, seat.z * 0.35), "dive");
    }

    let lift = 0;
    let leanGoal = 0;
    let stretch = 0;
    let puff = 0.12 * Math.sin(state.time * 5);
    const done = state.age >= state.length;
    switch (state.action) {
      case "sit":
        if (done) {
          const roll = random();
          if (roll < 0.35) {
            start("croak", (2 + Math.floor(random() * 3)) / CROAK_RATE);
          } else if (roll < 0.75) {
            state.seat = otherSeat();
            leap(seats[state.seat].at, "hop");
          } else {
            state.turn = (random() - 0.5) * 0.8;
            start("sit", 2 + random() * 3);
          }
        }
        break;
      case "croak": {
        const swell = Math.max(
          0,
          Math.sin(state.age * CROAK_RATE * Math.PI * 2),
        );
        puff = swell * 0.9;
        stretch = -swell * 0.05;
        if (done) start("sit", 2 + random() * 2);
        break;
      }
      case "hop":
      case "dive":
      case "surface": {
        const along = Math.min(state.age / state.length, 1);
        const distance = state.from.distanceTo(state.to);
        state.position.lerpVectors(state.from, state.to, along);
        lift =
          Math.sin(along * Math.PI) *
          (HOP_HEIGHT + distance * HOP_HEIGHT_PER_UNIT);
        // Nose up as it takes off, down as it lands, long in the air
        leanGoal = -Math.cos(along * Math.PI) * 0.4;
        stretch = Math.sin(along * Math.PI) * 0.3;
        if (!done) break;
        if (state.action === "dive") {
          splash(state.to.x, state.to.z, 1);
          start(
            "under",
            UNDER_SECONDS[0] + random() * (UNDER_SECONDS[1] - UNDER_SECONDS[0]),
          );
        } else {
          state.turn = (random() - 0.5) * 0.8;
          start("sit", 1.5 + random() * 2.5);
        }
        break;
      }
      case "under":
        if (done) {
          // Up it comes in the water before a seat, and climbs out onto it
          state.seat = otherSeat();
          const seat = seats[state.seat].at;
          state.position.set(seat.x * 0.55, water, seat.z * 0.55);
          splash(state.position.x, state.position.z, 0.6);
          leap(seat, "surface");
        }
        break;
    }

    // Sitting, it turns to look the way its seat faces (give or take)
    if (state.action === "sit" || state.action === "croak") {
      const goal = seats[state.seat].heading + state.turn;
      state.heading += turnTo(state.heading, goal) * Math.min(1, dt * 4);
    }

    group.visible = state.action !== "under";
    group.position.set(
      state.position.x,
      state.position.y + lift,
      state.position.z,
    );
    group.rotation.y = state.heading;
    if (lean.current) {
      const airborne = lift > 0;
      lean.current.rotation.x +=
        (leanGoal - lean.current.rotation.x) *
        (airborne ? 1 : Math.min(1, dt * 8));
      lean.current.scale.set(1, 1 - stretch * 0.3, 1 + stretch);
    }
    if (throat.current) throat.current.scale.setScalar(1 + puff);

    // Now and then it blinks, quick, while it sits
    const sitting = state.action === "sit" || state.action === "croak";
    if (
      !reducedMotion &&
      sitting &&
      state.blink === 0 &&
      random() < dt * 0.35
    ) {
      state.blink = 1;
    }
    state.blink = Math.max(0, state.blink - dt * 7);
    if (lids.current) {
      lids.current.scale.y = 1 - Math.sin(state.blink * Math.PI) * 0.85;
    }
  });

  return (
    <group ref={root}>
      <group scale={SIZE}>
        <group ref={lean}>
          <mesh geometry={body} castShadow>
            <meshStandardMaterial vertexColors roughness={0.55} />
          </mesh>
          <group ref={lids} position={EYES_AT}>
            <mesh geometry={eyes}>
              <meshStandardMaterial vertexColors roughness={0.3} />
            </mesh>
          </group>
          <group ref={throat} position={THROAT_AT}>
            <mesh scale={[1, 0.75, 0.85]}>
              <sphereGeometry args={[0.035, 10, 8]} />
              <meshStandardMaterial color={belly} roughness={0.5} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}
