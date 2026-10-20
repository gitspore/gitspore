import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
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

// How fast a plant moves to a new look: after 0.2 s about two
// thirds of the way, after 0.6 s about 95 %
const SPEED = 5;
// A spare colour to hold the target, so useFrame creates no new objects
const target = new THREE.Color();

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
const SPREAD: Leaf[] = [0, 1, 2, 3].map((i) => ({
  at: 0.35 + i * 0.17,
  turn: i * 2.3,
  size: (0.36 - i * 0.03) / LEAF_LEN,
}));

export const PLANT_STATES = [
  "working",
  "waiting1",
  "waiting2",
  "waiting3",
] as const;
export type PlantState = (typeof PLANT_STATES)[number];

// The table: which look each state has; the colours come from the mode
const LOOKS: Record<PlantState, (colors: SceneColors) => Look> = {
  working: (colors) => ({
    height: 0.95,
    bend: 0,
    stem: colors.stem,
    leaf: colors.leaf,
    leaves: SPROUT,
  }),
  waiting1: (colors) => ({
    height: 0.72,
    bend: 0.05,
    stem: colors["stem-waiting"]["1"],
    leaf: colors["leaf-waiting"]["1"],
    leaves: SPREAD,
  }),
  waiting2: (colors) => ({
    height: 0.72,
    bend: 0.5,
    stem: colors["stem-waiting"]["2"],
    leaf: colors["leaf-waiting"]["2"],
    leaves: SPREAD,
  }),
  waiting3: (colors) => ({
    height: 0.72,
    bend: 1,
    stem: colors["stem-waiting"]["3"],
    leaf: colors["leaf-waiting"]["3"],
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
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(wid, len * 0.45, 0, len);
  shape.quadraticCurveTo(-wid, len * 0.45, 0, 0);
  const geo = new THREE.ShapeGeometry(shape, 10);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    pos.setZ(i, (-0.35 * y * y) / len + 0.6 * x * x);
  }
  geo.computeVertexNormals();
  return geo;
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
  // Each slot leans its own way
  const dir = slot * 1.7 + 0.6;
  const look = LOOKS[state](colors);

  // The look of the first render.
  // The JSX only sets this starting point.
  // then useFrame moves everything toward look
  const [start] = useState(look);

  // The stem of the first render; useFrame bends it from there
  const startCurve = useMemo(
    () => stemCurve(start.height, start.bend, dir),
    [start, dir],
  );
  // The real Three materials,
  // so useFrame can change their colours
  const stemMat = useRef<THREE.MeshStandardMaterial>(null);
  const leafMats = useRef<(THREE.MeshStandardMaterial | null)[]>([]);

  // Where the plant is right now, on its way from start to look.
  // Copies, because useFrame changes them and the table must stay as it is
  const now = useRef({
    height: start.height,
    bend: start.bend,
    curve: startCurve,
    leaves: start.leaves.map((leaf) => ({ ...leaf })),
  });
  // The leaf groups (place, turn, size) and leaf meshes (tilt)
  const leafGroups = useRef<(THREE.Group | null)[]>([]);
  const leafMeshes = useRef<(THREE.Mesh | null)[]>([]);
  // The stem mesh, so useFrame can give it a new tube while it bends
  const stemMesh = useRef<THREE.Mesh>(null);

  // When the plant goes away, free the tube useFrame made last
  useEffect(() => {
    const stem = stemMesh.current;
    return () => stem?.geometry.dispose();
  }, []);

  // One leaf shape per plant, used by all its leaves
  const leafShape = useMemo(() => leafGeo(LEAF_LEN, LEAF_WID), []);

  // Every frame: move colours, bend and leaves a step toward the current look
  useFrame((_, delta) => {
    // The share of the remaining way to go in this frame
    const step = 1 - Math.exp(-SPEED * delta);

    stemMat.current?.color.lerp(target.set(look.stem), step);
    target.set(look.leaf);
    for (const mat of leafMats.current) mat?.color.lerp(target, step);

    const cur = now.current;
    // The stem:
    // rebuild only while it still has a visible way to go
    const moving =
      Math.abs(look.bend - cur.bend) > 0.001 ||
      Math.abs(look.height - cur.height) > 0.001;
    cur.bend += (look.bend - cur.bend) * step;
    cur.height += (look.height - cur.height) * step;

    const stem = stemMesh.current;
    if (moving && stem) {
      cur.curve = stemCurve(cur.height, cur.bend, dir);
      const old = stem.geometry;
      stem.geometry = new THREE.TubeGeometry(cur.curve, 24, STEM_R, 6);
      // Free the old tube's memory on the GPU
      old.dispose();
    }

    // How far the leaves point up from flat,
    // less when the stem droops
    const elev = 0.65 - cur.bend * 1.6;

    look.leaves.forEach((goal, i) => {
      const leaf = cur.leaves[i];
      leaf.at += (goal.at - leaf.at) * step;
      leaf.turn += (goal.turn - leaf.turn) * step;
      leaf.size += (goal.size - leaf.size) * step;

      const group = leafGroups.current[i];
      if (group) {
        cur.curve.getPointAt(leaf.at, group.position);

        group.rotation.y = dir + leaf.turn;
        group.scale.setScalar(leaf.size);
        // A leaf shrinking to 0 never quite gets there
        group.visible = leaf.size > 0.01;
      }
      const mesh = leafMeshes.current[i];
      if (mesh) mesh.rotation.x = Math.PI / 2 - elev;
    });
  });

  return (
    <>
      <mesh ref={stemMesh}>
        <tubeGeometry args={[startCurve, 24, STEM_R, 6]} />

        <meshStandardMaterial
          ref={stemMat}
          color={start.stem}
          roughness={0.8}
        />
      </mesh>
      {start.leaves.map((_, i) => (
        // Turn around the stem first (y),
        // then tilt the leaf up (x).
        // useFrame sets both, and place and size
        <group
          key={i}
          ref={(group) => {
            leafGroups.current[i] = group;
          }}
        >
          <mesh
            ref={(mesh) => {
              leafMeshes.current[i] = mesh;
            }}
            geometry={leafShape}
          >
            <meshStandardMaterial
              ref={(mat) => {
                leafMats.current[i] = mat;
              }}
              color={start.leaf}
              roughness={0.7}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
    </>
  );
}
