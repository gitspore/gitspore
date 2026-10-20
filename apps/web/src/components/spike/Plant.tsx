import { useMemo } from "react";
import * as THREE from "three";
import type { Mode, tokens } from "@/theme/tokens";

//
//
//

// The scene colours of one mode; day and night have the same keys
export type SceneColors = (typeof tokens)[Mode]["color"]["scene"];

const STEM_R = 0.028;
// The one leaf shape every leaf uses; size scales it
const LEAF_LEN = 0.42;
const LEAF_WID = 0.19;

// One leaf: where on the stem (0 = soil, 1 = tip), turned how far
// around it, and how big (0 = hidden, 1 = full leaf)
type Leaf = { at: number; turn: number; size: number };

// Everything that makes a state look the way it does
type Look = {
  height: number;
  // 0 = upright, 1 = drooping right over
  bend: number;
  stem: string;
  leaf: string;
  // Always four, so states can blend leaf by leaf later
  leaves: Leaf[];
};

// Working: two leaves near the top, opposite each other
const SPROUT: Leaf[] = [
  { at: 0.72, turn: 0, size: 1 },
  { at: 0.8, turn: Math.PI, size: 1 },
  { at: 0.8, turn: Math.PI, size: 0 },
  { at: 0.8, turn: Math.PI, size: 0 },
];

// Waiting: four smaller leaves spread up the stem
const SPREAD: Leaf[] = [0, 1, 2, 3].map((k) => ({
  at: 0.35 + k * 0.17,
  turn: k * 2.3,
  size: (0.36 - k * 0.03) / LEAF_LEN,
}));

export const PLANT_STATES = [
  "working",
  "waiting1",
  "waiting2",
  "waiting3",
] as const;
export type PlantState = (typeof PLANT_STATES)[number];

// The table: which look each state has; the colours come from the mode
const LOOKS: Record<PlantState, (c: SceneColors) => Look> = {
  working: (c) => ({
    height: 0.72,
    bend: 0,
    stem: c.stem,
    leaf: c.leaf,
    leaves: SPROUT,
  }),
  waiting1: (c) => ({
    height: 0.72,
    bend: 0.05,
    stem: c["stem-waiting"]["1"],
    leaf: c["leaf-waiting"]["1"],
    leaves: SPREAD,
  }),
  waiting2: (c) => ({
    height: 0.72,
    bend: 0.5,
    stem: c["stem-waiting"]["2"],
    leaf: c["leaf-waiting"]["2"],
    leaves: SPREAD,
  }),
  waiting3: (c) => ({
    height: 0.72,
    bend: 1,
    stem: c["stem-waiting"]["3"],
    leaf: c["leaf-waiting"]["3"],
    leaves: SPREAD,
  }),
};

// A smooth stem through four points, leaning out in direction dir
function stemCurve(h: number, bend: number, dir: number) {
  const dx = Math.cos(dir);
  const dz = Math.sin(dir);
  // r = how far out from the pot's centre, y = height above the soil
  const V = (r: number, y: number) => new THREE.Vector3(dx * r, y, dz * r);
  return new THREE.CatmullRomCurve3([
    V(0, 0),
    V(0.04 + 0.05 * bend, h * 0.4),
    V(0.1 + 0.42 * bend, h * (0.8 - 0.15 * bend)),
    V(0.14 + 0.72 * bend, h * (1 - 0.95 * bend)),
  ]);
}

// A pointed leaf outline, filled, then curled: tip back, sides up
function leafGeo(len: number, wid: number) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(wid, len * 0.45, 0, len);
  s.quadraticCurveTo(-wid, len * 0.45, 0, 0);
  const g = new THREE.ShapeGeometry(s, 10);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    p.setZ(i, (-0.35 * y * y) / len + 0.6 * x * x);
  }
  g.computeVertexNormals();
  return g;
}

export function Plant({
  slot,
  state,
  colors,
}: {
  slot: number;
  state: PlantState;
  colors: SceneColors;
}) {
  // Each slot leans its own way, so the six plants don't look copied
  const dir = slot * 1.7 + 0.6;
  const look = LOOKS[state](colors);
  // How far the leaves point up from flat, less when the stem droops
  const elev = 0.65 - look.bend * 1.6;

  const curve = useMemo(
    () => stemCurve(look.height, look.bend, dir),
    [look.height, look.bend, dir],
  );
  // One leaf shape per plant, used by all its leaves
  const leafShape = useMemo(() => leafGeo(LEAF_LEN, LEAF_WID), []);

  return (
    <>
      <mesh>
        <tubeGeometry args={[curve, 24, STEM_R, 6]} />
        <meshStandardMaterial color={look.stem} roughness={0.8} />
      </mesh>
      {look.leaves.map((l, k) => (
        // Turn around the stem first (y), then tilt the leaf up (x)
        <group
          key={k}
          position={curve.getPointAt(l.at)}
          rotation-y={dir + l.turn}
          scale={l.size}
          visible={l.size > 0}
        >
          <mesh geometry={leafShape} rotation-x={Math.PI / 2 - elev}>
            <meshStandardMaterial
              color={look.leaf}
              roughness={0.7}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
    </>
  );
}
