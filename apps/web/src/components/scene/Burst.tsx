import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { seeded } from "./life";

//
//
//
// A one-off burst of bits from a pot, played once when it mounts:
// - soil: a puff of crumbs when a seed is planted, quick and heavy
// - petals: when a branch is merged, petals in the bloom's colours fly up
//   and drift down slowly, tumbling
// - dust: when a plant is removed after clean-up, a few dozen tiny bits in
//   the plant's colours drift up and out a little and fade
// Each bit flies on its own throw (direction, speed, spin) under gravity
// and shrinks away at the end. Afterwards nothing is drawn

export type BurstKind = "soil" | "petals" | "dust";

type Recipe = {
  count: number;
  // how fast up (from–to), how fast outward, how hard it falls back, how
  // much air slows it, and how long until it's gone
  up: [number, number];
  out: number;
  gravity: number;
  drag: number;
  seconds: number;
  size: number;
};

const RECIPES: Record<BurstKind, Recipe> = {
  soil: {
    count: 18,
    up: [1.2, 2.2],
    out: 0.9,
    gravity: 7,
    drag: 0.5,
    seconds: 0.9,
    size: 0.035,
  },
  petals: {
    count: 34,
    up: [2, 3.2],
    out: 1.3,
    gravity: 1.6,
    drag: 1.8,
    seconds: 2.6,
    size: 0.085,
  },
  dust: {
    count: 36,
    up: [0.5, 1.1],
    out: 0.7,
    gravity: -0.3,
    drag: 1.6,
    seconds: 1.1,
    size: 0.03,
  },
};

const SEEDS: Record<BurstKind, number> = { soil: 51, petals: 53, dust: 57 };

const place = new THREE.Vector3();
const spin = new THREE.Euler();
const turn = new THREE.Quaternion();
const scale = new THREE.Vector3();
const matrix = new THREE.Matrix4();

export function Burst({
  kind,
  colors,
  y,
}: {
  kind: BurstKind;
  colors: string[];
  y: number;
}) {
  const recipe = RECIPES[kind];
  const mesh = useRef<THREE.InstancedMesh>(null);
  const started = useRef<number | null>(null);

  // Every bit's throw, from a seed of its own kind; the colours go in
  // turn. Soil crumbs are lumps, petals flat ovals
  const throws = useMemo(() => {
    const random = seeded(SEEDS[kind]);
    return [...Array(recipe.count).keys()].map(() => {
      const angle = random() * Math.PI * 2;
      const out = recipe.out * (0.3 + random() * 0.7);
      const [low, high] = recipe.up;
      return {
        velocity: new THREE.Vector3(
          Math.cos(angle) * out,
          low + random() * (high - low),
          Math.sin(angle) * out,
        ),
        spin: new THREE.Vector3(random() * 6, random() * 6, random() * 6),
        size: recipe.size * (0.6 + random() * 0.8),
      };
    });
  }, [kind, recipe]);
  const geometry = useMemo(
    () =>
      kind === "soil" || kind === "dust"
        ? new THREE.IcosahedronGeometry(1, 0)
        : new THREE.SphereGeometry(1, 8, 4).scale(1, 0.25, 0.6),
    [kind],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  useEffect(() => {
    const target = mesh.current;
    if (!target) return;
    const tint = new THREE.Color();
    throws.forEach((_, index) => {
      target.setColorAt(index, tint.set(colors[index % colors.length]));
    });
    if (target.instanceColor) target.instanceColor.needsUpdate = true;
  }, [throws, colors]);

  // Position under drag and gravity, worked out for the bit's age instead
  // of stepped frame by frame, so a slow frame doesn't change the arc
  useFrame(({ clock }) => {
    const target = mesh.current;
    if (!target) return;
    started.current ??= clock.elapsedTime;
    const age = clock.elapsedTime - started.current;
    target.visible = age < recipe.seconds;
    if (!target.visible) return;
    const slowed = (1 - Math.exp(-recipe.drag * age)) / recipe.drag;
    const fade =
      1 - THREE.MathUtils.smoothstep(age, recipe.seconds * 0.6, recipe.seconds);
    throws.forEach((bit, index) => {
      place
        .copy(bit.velocity)
        .multiplyScalar(slowed)
        .setY(bit.velocity.y * slowed - 0.5 * recipe.gravity * age * age);
      place.y = Math.max(place.y + y, y - 0.05);
      spin.set(bit.spin.x * age, bit.spin.y * age, bit.spin.z * age);
      turn.setFromEuler(spin);
      scale.setScalar(bit.size * fade);
      matrix.compose(place, turn, scale);
      target.setMatrixAt(index, matrix);
    });
    target.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, undefined, recipe.count]}
      frustumCulled={false}
      castShadow
    >
      <meshStandardMaterial roughness={0.8} side={THREE.DoubleSide} />
    </instancedMesh>
  );
}
