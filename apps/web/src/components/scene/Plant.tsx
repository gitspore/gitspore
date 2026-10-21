import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import type { Mode, tokens } from "@/theme/tokens";

//
//
//

// The scene colours of one mode; day and night have the same keys
export type SceneColors = (typeof tokens)[Mode]["color"]["scene"];
// The plant colours of one mode: bare stalk, bud, petals
export type ArtColors = (typeof tokens)[Mode]["color"]["art"]["plant"];

// stem's radius, leaf shape's length and width;
// each leaf scales the shape by its size.
// flower:
// five petals evenly around the heart, each turned this far
// around the tip, and slightly raised:
// (PETAL_TILT) like an opening cup
const STEM_R = 0.028;
const LEAF_LEN = 0.42;
const LEAF_WID = 0.19;
const PETAL_TURNS = [0, 1, 2, 3, 4].map((i) => (i * 2 * Math.PI) / 5);
const PETAL_TILT = 0.35;

// How fast a plant moves to a new look: after 0.2 s about two
// thirds of the way, after 0.6 s about 95 %
const SPEED = 5;
// A spare colour to hold the target, so useFrame creates no new objects
const target = new THREE.Color();

// One leaf: where on the stem (0 = soil, 1 = tip), turned how far
// around it, how big (0 = hidden, 1 = full leaf), and from which
// growth on it shows (leaves without from are always there)
type Leaf = { at: number; turn: number; size: number; from?: number };

// Everything that makes a state look the way it does. bend: 0 = upright,
// 1 = drooping right over. leaves: always four, so states blend leaf by leaf
// bud, bloom:
// size of bud or flower (0 or missing = none)

type Look = {
  height: number;
  bend: number;
  stem: string;
  leaf: string;
  leaves: Leaf[];
  bud?: number;
  bloom?: number;
};

// Working: two leaves near the top, opposite each other, and two more
// lower down once the plant has grown (from)
const SPROUT: Leaf[] = [
  { at: 0.72, turn: 0, size: 1 },
  { at: 0.8, turn: Math.PI, size: 1 },
  { at: 0.45, turn: Math.PI / 2, size: 0.85, from: 0.75 },
  { at: 0.3, turn: -Math.PI / 2, size: 0.75, from: 1 },
];

// Done and merged: the sprout's leaves, the lower one always there,
// the lowest one gone (size 0), so three leaves
const FULL: Leaf[] = [
  { at: 0.72, turn: 0, size: 1 },
  { at: 0.8, turn: Math.PI, size: 1 },
  { at: 0.45, turn: Math.PI / 2, size: 0.85 },
  { at: 0.3, turn: -Math.PI / 2, size: 0 },
];

// Error: the sprout's places, every leaf hidden
const BARE: Leaf[] = SPROUT.map((leaf) => ({ ...leaf, size: 0 }));

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
  "error",
  "done",
  "merged",
] as const;

export type PlantState = (typeof PLANT_STATES)[number];

// The table: which look each state has; the colours come from the mode
const LOOKS: Record<PlantState, (colors: SceneColors, art: ArtColors) => Look> =
  {
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
    error: (_, art) => ({
      height: 0.8,
      bend: 0.3,
      stem: art.bare,
      leaf: art.bare,
      leaves: BARE,
    }),
    done: (colors) => ({
      height: 0.95,
      bend: 0,
      stem: colors.stem,
      leaf: colors.leaf,
      bud: 1,
      leaves: FULL,
    }),
    merged: (colors) => ({
      height: 0.95,
      bend: 0,
      stem: colors.stem,
      leaf: colors.leaf,
      bloom: 1,
      leaves: FULL,
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

// A smooth stem through four points, leaning out in direction dir.
// V(r, y): a point r out from the pot's centre, y above the soil
function stemCurve(h: number, bend: number, dir: number) {
  const dx = Math.cos(dir);
  const dz = Math.sin(dir);
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
// Untouched stems keep their own curve.
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

// Scale a part to its size; hidden once it's nearly gone, like the leaves
function showSized(group: THREE.Group | null, size: number) {
  if (!group) return;
  group.scale.setScalar(size);
  group.visible = size > 0.01;
}

// One plant: a stem tube and four leaves. The props give the target look;
// useFrame eases the meshes toward it, so a change never remounts anything
export function Plant({
  slot,
  state,
  growth,
  wholeScale,
  colors,
  art,
}: {
  slot: number;
  state: PlantState;
  growth: number;
  wholeScale: boolean;
  colors: SceneColors;
  art: ArtColors;
}) {
  // The target look.
  // Each slot leans its own way (dir).
  // The state's entry in the table,
  // filled with this mode's colours,
  // then grown.
  // On top, the plant scaled by growth, on
  const dir = slot * 1.7 + 0.6;
  const makeLook = LOOKS[state];
  const tableLook = makeLook(colors, art);
  const look = grow(tableLook, growth);
  const scaleGoal = wholeScale ? 0.85 + 0.3 * growth : 1;

  // The starting point: the look of the first render and its stem, at
  // whole-plant scale 1 (see now). The JSX only sets this starting point;
  // then useFrame moves everything toward look
  const [start] = useState(look);
  const startCurve = useMemo(
    () => overRim(stemCurve(start.height, start.bend, dir), 1),
    [start, dir],
  );

  // What useFrame changes, kept in refs so nothing re-renders:
  // - the real Three materials, for their colours
  // - now: where the plant is right now, on its way from start to look.
  //   Copies, because useFrame changes them and the table must stay as it is
  // - the leaf groups (place, turn, size) and leaf meshes (tilt)
  // - stem mesh, which gets a new tube while it bends
  // - the group around the whole plant, for the extra scale
  // - the tip group, which follows the stem's tip, with bud and bloom in it

  const stemMat = useRef<THREE.MeshStandardMaterial>(null);
  const leafMats = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const now = useRef({
    scale: 1,
    height: start.height,
    bend: start.bend,
    curve: startCurve,
    leaves: start.leaves.map((leaf) => ({ ...leaf })),
    bud: start.bud ?? 0,
    bloom: start.bloom ?? 0,
  });
  const leafGroups = useRef<(THREE.Group | null)[]>([]);
  const leafMeshes = useRef<(THREE.Mesh | null)[]>([]);
  const stemMesh = useRef<THREE.Mesh>(null);
  const plantRoot = useRef<THREE.Group>(null);
  const tipGroup = useRef<THREE.Group>(null);
  const budGroup = useRef<THREE.Group>(null);
  const bloomGroup = useRef<THREE.Group>(null);

  // When the plant goes away, free the tube useFrame made last
  useEffect(() => {
    const stem = stemMesh.current;
    return () => stem?.geometry.dispose();
  }, []);

  // One leaf shape per plant, used by all its leaves
  const leafShape = useMemo(() => leafGeo(LEAF_LEN, LEAF_WID), []);
  const petalShape = useMemo(() => new THREE.SphereGeometry(0.07, 12, 8), []);

  // Every frame: move colours, bend and leaves a step toward the current
  // look. step is the share of the remaining way to go in this frame.
  // - The stem is rebuilt only while bend,
  // the old tube's GPU memory is freed
  // - elev: how far the leaves point up from flat,
  // less when the stem droops
  // - A leaf shrinking to 0 never quite gets there,
  // so it's hidden below 0.01
  // - Bud and bloom ride on stem's tip.
  //  they grow in and out like leaves

  useFrame((_, delta) => {
    const step = 1 - Math.exp(-SPEED * delta);

    stemMat.current?.color.lerp(target.set(look.stem), step);
    target.set(look.leaf);
    for (const mat of leafMats.current) mat?.color.lerp(target, step);

    const cur = now.current;
    const moving =
      Math.abs(look.bend - cur.bend) > 0.001 ||
      Math.abs(look.height - cur.height) > 0.001 ||
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
      old.dispose();
    }

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
        group.visible = leaf.size > 0.01;
      }
      const mesh = leafMeshes.current[i];
      if (mesh) mesh.rotation.x = Math.PI / 2 - elev;
    });

    cur.bud += ((look.bud ?? 0) - cur.bud) * step;
    cur.bloom += ((look.bloom ?? 0) - cur.bloom) * step;
    const tip = tipGroup.current;
    if (tip) cur.curve.getPointAt(1, tip.position);
    showSized(budGroup.current, cur.bud);
    showSized(bloomGroup.current, cur.bloom);
  });

  // The stem and the leaves.
  // Each leaf's group turns it around the stem (y),
  // its mesh tilts it up (x); useFrame sets both,
  // and place and size.
  // Stem and leaves cast shadows
  // but don't receive them: the double-sided
  // leaves would risk shadow acne
  // The tip:
  // useFrame keeps it on the stem's end
  // and sizes bud and bloom.
  // Bud: a sphere stretched up, sitting on the tip.
  // Bloom: a heart with five flattened petals
  // pushed out and tilted up
  return (
    <group ref={plantRoot}>
      <mesh ref={stemMesh} castShadow>
        <tubeGeometry args={[startCurve, 24, STEM_R, 6]} />
        <meshStandardMaterial
          ref={stemMat}
          color={start.stem}
          roughness={0.8}
        />
      </mesh>
      {start.leaves.map((_, i) => (
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
            castShadow
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

      <group ref={tipGroup}>
        <group ref={budGroup}>
          <mesh position-y={0.08} scale={[1, 1.6, 1]} castShadow>
            <sphereGeometry args={[0.06, 12, 8]} />
            <meshStandardMaterial color={art.bud} roughness={0.6} />
          </mesh>
        </group>
        <group ref={bloomGroup}>
          <mesh castShadow>
            <sphereGeometry args={[0.045, 12, 8]} />
            <meshStandardMaterial color={art.heart} roughness={0.6} />
          </mesh>
          {PETAL_TURNS.map((turn) => (
            <group key={turn} rotation-y={turn}>
              <mesh
                geometry={petalShape}
                position-x={0.08}
                rotation-z={PETAL_TILT}
                scale={[1, 0.3, 0.55]}
                castShadow
              >
                <meshStandardMaterial color={art.petal} roughness={0.6} />
              </mesh>
            </group>
          ))}
        </group>
      </group>
    </group>
  );
}
