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
// around it, how big (0 = hidden, 1 = full leaf), and from which
// growth on it shows (leaves without from are always there)
type Leaf = { at: number; turn: number; size: number; from?: number };

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
  // More leaves lower down once the plant has grown
  { at: 0.45, turn: Math.PI / 2, size: 0.85, from: 0.75 },
  { at: 0.3, turn: -Math.PI / 2, size: 0.75, from: 1 },
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

// Growth 0..1 on top of the table: 0.5 is the table as it is,
// less is a younger, smaller plant, more is taller with bigger leaves.
// Leaves with a from only show once the plant has grown that far
function grow(look: Look, growth: number): Look {
  const leafScale = 0.7 + 0.6 * growth;
  return {
    ...look,
    height: look.height * (0.75 + 0.5 * growth),
    leaves: look.leaves.map((leaf) => ({
      ...leaf,
      size: growth >= (leaf.from ?? 0) ? leaf.size * leafScale : 0,
    })),
  };
}

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

// The pot's rim seen from the soil: how far out it starts and ends
// (with room for the stem's thickness), and how high a stem crossing
// it must stay: rim top 0.13 above the soil, plus the stem's radius
// and a small gap
const RIM_IN = 0.56;
const RIM_OUT = 0.8;
const RIM_CLEAR = 0.13 + STEM_R + 0.015;

// A drooping stem must lie over the rim, not run through it.
// Take 17 evenly spaced points along the stem, lift the ones that are
// over the rim but too low, and draw a new smooth curve through them.
// scale is the whole-plant scale, because the rim doesn't scale with it
function overRim(curve: THREE.CatmullRomCurve3, scale: number) {
  const points = curve.getSpacedPoints(16);
  let lifted = false;
  for (const point of points) {
    const out = Math.hypot(point.x, point.z) * scale;
    if (out > RIM_IN && out < RIM_OUT && point.y * scale < RIM_CLEAR) {
      point.y = RIM_CLEAR / scale;
      lifted = true;
    }
  }
  // Untouched stems keep their own curve
  return lifted ? new THREE.CatmullRomCurve3(points) : curve;
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
  growth,
  wholeScale,
  colors,
}: {
  slot: number;
  state: PlantState;
  growth: number;
  wholeScale: boolean;
  colors: SceneColors;
}) {
  // Each slot leans its own way
  const dir = slot * 1.7 + 0.6;
  // The target look: the state's entry in the table, filled with this
  // mode's colours, then grown
  const makeLook = LOOKS[state];
  const tableLook = makeLook(colors);
  const look = grow(tableLook, growth);
  // The extra layer: the whole plant scaled by growth, when it's on
  const scaleGoal = wholeScale ? 0.85 + 0.3 * growth : 1;

  // The look of the first render.
  // The JSX only sets this starting point.
  // then useFrame moves everything toward look
  const [start] = useState(look);

  // The stem of the first render; useFrame bends it from there
  const startCurve = useMemo(
    // The whole-plant scale starts at 1 (see now)
    () => overRim(stemCurve(start.height, start.bend, dir), 1),
    [start, dir],
  );
  // The real Three materials,
  // so useFrame can change their colours
  const stemMat = useRef<THREE.MeshStandardMaterial>(null);
  const leafMats = useRef<(THREE.MeshStandardMaterial | null)[]>([]);

  // Where the plant is right now, on its way from start to look.
  // Copies, because useFrame changes them and the table must stay as it is
  const now = useRef({
    scale: 1,
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
  // The group around the whole plant, for the extra scale
  const plantRoot = useRef<THREE.Group>(null);

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
      Math.abs(look.height - cur.height) > 0.001 ||
      // the rim's place in plant space shifts when the plant scales
      Math.abs(scaleGoal - cur.scale) > 0.001;
    cur.bend += (look.bend - cur.bend) * step;
    cur.height += (look.height - cur.height) * step;
    cur.scale += (scaleGoal - cur.scale) * step;
    plantRoot.current?.scale.setScalar(cur.scale);

    const stem = stemMesh.current;
    if (moving && stem) {
      cur.curve = overRim(stemCurve(cur.height, cur.bend, dir), cur.scale);
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
    <group ref={plantRoot}>
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
    </group>
  );
}
