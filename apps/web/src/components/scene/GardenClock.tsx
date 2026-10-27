import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { FLOOR_Y } from "./layout";
import { pointer } from "./life";
import { windUniforms } from "./wind";

//
//
//
// The floor as a plane, for where the pointer's ray meets it
const FLOOR = new THREE.Plane(new THREE.Vector3(0, 1, 0), -FLOOR_Y);

// How long the pointer counts as present after it last moved, in seconds,
// and how fast its presence fades in and out
const PRESENT_FOR = 1.5;
const PRESENCE_SPEED = 4;

// The garden's clock, mounted once in the scene. Every frame:
// - the wind's time for every wind shader; under reduced motion the time
//   stands still and motion is 0, so nothing sways
// - the pointer's ray and presence for the critters and the grass. R3F
//   keeps state.pointer in the canvas's -1..1 coordinates; the camera's
//   view offset is in its projection, so the ray matches what is drawn
export function GardenClock({ reducedMotion }: { reducedMotion: boolean }) {
  const last = useRef({ x: 0, y: 0, movedAt: -Infinity });

  useFrame((state, delta) => {
    const time = state.clock.elapsedTime;
    windUniforms.uWindMotion.value = reducedMotion ? 0 : 1;
    if (!reducedMotion) windUniforms.uWindTime.value = time;

    const { x, y } = state.pointer;
    if (x !== last.current.x || y !== last.current.y) {
      last.current = { x, y, movedAt: time };
    }
    state.raycaster.setFromCamera(state.pointer, state.camera);
    pointer.ray.copy(state.raycaster.ray);
    pointer.ray.intersectPlane(FLOOR, pointer.floor);

    const present = time - last.current.movedAt < PRESENT_FOR ? 1 : 0;
    const step = 1 - Math.exp(-PRESENCE_SPEED * delta);
    pointer.presence.value += (present - pointer.presence.value) * step;
  });

  return null;
}
