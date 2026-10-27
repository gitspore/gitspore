import { useState } from "react";
import * as THREE from "three";

//
//
//
// What the garden's critters share, outside React: nothing here re-renders
// anything, the critters read it in their useFrame.

// The pointer as a ray from the camera through it, where that ray meets
// the floor, and how present it is: 1 while it moves over the scene,
// fading to 0 when it rests or leaves. GardenClock updates it every
// frame. Butterflies flee from it, fireflies drift toward it, the grass
// bends away from it. presence is a { value } so shaders can take it as
// a uniform as it is
export const pointer = {
  ray: new THREE.Ray(),
  floor: new THREE.Vector3(),
  presence: { value: 0 },
};

// When the scene showed, on its clock: set once the first frames are
// drawn and the loading veil lifts (SceneReady), null before. The plants
// wait for it to grow in, so the veil doesn't hide their growing
export const reveal = { at: null as number | null };

// Where an insect can land or hover:a plant's tip (it moves with the
// plant, so the plant writes it every frame), a flower in the grass, a
// string light's bulb. Keyed by who owns it, so a plant can take its own
// out again. weight: how much a butterfly or bee wants it (0 = never)
export type Perch = { position: THREE.Vector3; weight: number };
export const perches = new Map<string, Perch>();

// A perch picked at random by weight, but not `except` (where the insect
// sits now). null when there is none
export function pickPerch(
  random: () => number,
  except?: string | null,
): string | null {
  let total = 0;
  for (const [key, perch] of perches) {
    if (key !== except) total += perch.weight;
  }
  let left = random() * total;
  for (const [key, perch] of perches) {
    if (key === except || perch.weight <= 0) continue;
    left -= perch.weight;
    if (left <= 0) return key;
  }
  return null;
}

// A small seeded random generator (mulberry32): the same seed gives the
// same numbers on every load, so the grass grows in the same places and
// render stays pure (no Math.random during render)
export function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// prefers-reduced-motion, read once like the camera does: the wind stops,
// insects rest, nothing pops or bursts
export function useReducedMotion() {
  const [reduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  return reduced;
}
