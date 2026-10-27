import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { FLOOR_Y } from "./layout";
import { pointer, seeded } from "./life";
import { paintedParts } from "./shapes";

//
//
//
// A robin in the grass left of the table, by day. It looks around, hops
// a few steps, pecks at the ground, looks around again. When the pointer
// comes near it flies off out of the picture, and after a while it comes
// back and lands somewhere else in its patch

// Its patch of meadow (x from–to, z from–to), where the camera sees the
// floor beside the table's left legs, behind the pond
const HOME = [-7.6, -4.9, -2.6, 1.2];
// One hop: how far, how long, how high
const HOP = 0.28;
const HOP_SECONDS = 0.22;
const HOP_HEIGHT = 0.12;
// How near the pointer (on the floor) may come, where it flies off to,
// how long a flight takes, and how long it stays away (from–to)
const SHY = 1.4;
const AWAY = new THREE.Vector3(-15, 5, -9);
const FLIGHT_SECONDS = 1.6;
const GONE_SECONDS = [10, 22];

type Action = "look" | "hop" | "peck" | "leave" | "gone" | "land";

// The body in one painted geometry, facing +z: a round brown body, the
// orange breast, the tail sticking out back and up, two thin legs
function bodyGeometry(brown: string, breast: string, dark: string) {
  return paintedParts([
    [
      new THREE.SphereGeometry(1, 14, 10)
        .scale(0.14, 0.13, 0.19)
        .translate(0, 0.19, 0),
      brown,
    ],
    [
      new THREE.SphereGeometry(1, 12, 8)
        .scale(0.115, 0.11, 0.1)
        .translate(0, 0.18, 0.1),
      breast,
    ],
    [
      new THREE.BoxGeometry(0.07, 0.02, 0.18)
        .rotateX(-0.45)
        .translate(0, 0.25, -0.22),
      brown,
    ],
    [
      new THREE.CylinderGeometry(0.008, 0.008, 0.1, 4).translate(
        0.045,
        0.05,
        0.02,
      ),
      dark,
    ],
    [
      new THREE.CylinderGeometry(0.008, 0.008, 0.1, 4).translate(
        -0.045,
        0.05,
        0.02,
      ),
      dark,
    ],
  ]);
}

// The head, around the neck (its origin): brown crown, orange face, a
// short dark beak, two dark eyes
function headGeometry(brown: string, breast: string, dark: string) {
  return paintedParts([
    [new THREE.SphereGeometry(0.085, 12, 8), brown],
    [new THREE.SphereGeometry(0.068, 10, 8).translate(0, -0.02, 0.035), breast],
    [
      new THREE.ConeGeometry(0.018, 0.07, 6)
        .rotateX(Math.PI / 2)
        .translate(0, -0.005, 0.1),
      dark,
    ],
    [new THREE.SphereGeometry(0.013, 6, 4).translate(0.05, 0.02, 0.055), dark],
    [new THREE.SphereGeometry(0.013, 6, 4).translate(-0.05, 0.02, 0.055), dark],
  ]);
}

export function Robin({
  brown,
  breast,
  dark,
  reducedMotion,
}: {
  brown: string;
  breast: string;
  dark: string;
  reducedMotion: boolean;
}) {
  const random = useMemo(() => seeded(61), []);
  const body = useMemo(
    () => bodyGeometry(brown, breast, dark),
    [brown, breast, dark],
  );
  const head = useMemo(
    () => headGeometry(brown, breast, dark),
    [brown, breast, dark],
  );
  const wing = useMemo(
    () =>
      new THREE.SphereGeometry(1, 10, 6)
        .scale(0.02, 0.07, 0.15)
        .translate(0, -0.05, -0.02),
    [],
  );
  useEffect(() => () => body.dispose(), [body]);
  useEffect(() => () => head.dispose(), [head]);
  useEffect(() => () => wing.dispose(), [wing]);

  const root = useRef<THREE.Group>(null);
  const neck = useRef<THREE.Group>(null);
  const wings = useRef<(THREE.Mesh | null)[]>([]);
  // What it does now and since when (age, seconds) and for how long; its
  // place and heading; a hop's or flight's start and end; where the head
  // looks and how many pecks are left
  const bird = useRef({
    action: "look" as Action,
    age: 0,
    length: 1,
    hops: 0,
    heading: 0.8,
    position: new THREE.Vector3(-6.2, FLOOR_Y, 0),
    from: new THREE.Vector3(),
    to: new THREE.Vector3(),
    look: 0,
    lookGoal: 0,
  });

  useFrame((_, delta) => {
    const group = root.current;
    if (!group) return;
    const state = bird.current;
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
    // A hop: roughly ahead; one that would leave the patch heads back in
    const hop = () => {
      state.heading += (random() - 0.5) * 2.4;
      state.from.copy(state.position);
      state.to.set(
        state.position.x + Math.sin(state.heading) * HOP,
        FLOOR_Y,
        state.position.z + Math.cos(state.heading) * HOP,
      );
      if (
        state.to.x < x0 ||
        state.to.x > x1 ||
        state.to.z < z0 ||
        state.to.z > z1
      ) {
        homeSpot(state.to);
        state.heading = Math.atan2(
          state.to.x - state.from.x,
          state.to.z - state.from.z,
        );
        state.to.sub(state.from).setLength(HOP).add(state.from);
      }
      start("hop", HOP_SECONDS);
    };

    // Pointer near: off it flies (unless it's away already, or nothing
    // moves under reduced motion)
    const settled =
      state.action !== "leave" &&
      state.action !== "gone" &&
      state.action !== "land";
    if (
      settled &&
      !reducedMotion &&
      pointer.presence.value > 0.5 &&
      pointer.floor.distanceTo(state.position) < SHY
    ) {
      state.from.copy(state.position);
      state.to.copy(AWAY);
      start("leave", FLIGHT_SECONDS);
    }

    let lift = 0;
    let pitch = 0;
    let flap = 0;
    const done = state.age >= state.length;
    switch (state.action) {
      case "look":
        if (random() < dt * 1.5) state.lookGoal = (random() - 0.5) * 2.2;
        if (done) {
          const roll = random();
          if (roll < 0.55) {
            state.hops = 1 + Math.floor(random() * 3);
            hop();
          } else if (roll < 0.85) {
            start("peck", 0.3 * (2 + Math.floor(random() * 2)));
          } else {
            start("look", 0.8 + random() * 1.5);
          }
        }
        break;
      case "hop": {
        const along = Math.min(state.age / state.length, 1);
        state.position.lerpVectors(state.from, state.to, along);
        lift = Math.sin(along * Math.PI) * HOP_HEIGHT;
        state.lookGoal = 0;
        if (done) {
          state.hops -= 1;
          if (state.hops > 0) hop();
          else start("look", 0.6 + random() * 1.2);
        }
        break;
      }
      case "peck":
        pitch = Math.max(0, Math.sin((state.age / 0.3) * Math.PI * 2)) * 0.9;
        state.lookGoal = 0;
        if (done) start("look", 0.8 + random() * 1.2);
        break;
      case "leave":
      case "land": {
        const along = Math.min(state.age / state.length, 1);
        const eased =
          state.action === "leave" ? along * along : 1 - (1 - along) ** 2;
        state.position.lerpVectors(state.from, state.to, eased);
        lift = Math.sin(along * Math.PI) * 0.6;
        flap = 1;
        state.heading = Math.atan2(
          state.to.x - state.from.x,
          state.to.z - state.from.z,
        );
        if (done && state.action === "leave") {
          const [least, most] = GONE_SECONDS;
          start("gone", least + random() * (most - least));
        } else if (done) {
          start("look", 1 + random());
        }
        break;
      }
      case "gone":
        if (done) {
          state.from.copy(AWAY);
          homeSpot(state.to);
          start("land", FLIGHT_SECONDS);
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
    state.look += (state.lookGoal - state.look) * Math.min(1, dt * 10);
    if (neck.current) {
      neck.current.rotation.set(pitch, state.look, 0);
    }
    const beat = flap * Math.sin(state.age * 55) * 0.9;
    wings.current.forEach((mesh, index) => {
      if (mesh)
        mesh.rotation.z =
          (index === 0 ? 1 : -1) * (0.1 + Math.max(beat, -0.3) + flap * 0.6);
    });
  });

  return (
    <group ref={root}>
      <mesh geometry={body} castShadow>
        <meshStandardMaterial vertexColors roughness={0.9} />
      </mesh>
      <group ref={neck} position={[0, 0.3, 0.11]}>
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
          <meshStandardMaterial color={brown} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}
