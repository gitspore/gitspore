import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import type { Mode, tokens } from "@/theme/tokens";

import { POT_SPOTS } from "./layout";
import { perches, reveal, useReducedMotion, type Perch } from "./life";
import { paintedParts } from "./shapes";
import { WIND_DIR, windAt } from "./wind";

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
const STEM_R = 0.032;
const LEAF_LEN = 0.42;
const LEAF_WID = 0.19;
const PETAL_TURNS = [0, 1, 2, 3, 4].map((i) => (i * 2 * Math.PI) / 5);
const PETAL_TILT = 0.35;

// The stem's tube: steps along it, sides around it. It tapers toward the
// tip, to this share of STEM_R
const STEM_STEPS = 24;
const STEM_SIDES = 8;
const STEM_TIP = 0.5;

// Bud and flower size on top of their own shapes, so they read from afar
const TIP_SCALE = 1.8;

// How fast a plant moves to a new look: after 0.2 s about two
// thirds of the way, after 0.6 s about 95 %
const SPEED = 5;
// A spare colour to hold the target, so useFrame creates no new objects
const target = new THREE.Color();

// The plant in the wind: how far the tip moves per unit of wind, and the
// spring that carries it there, a little bouncy, so a gust makes it swing
// back past upright before it settles (stiffness, damping)
const SWAY = 0.055;
const SPRING = 28;
const DAMPING = 3.2;
// A touch (the pointer arriving over the pot) shakes the plant this hard
const TOUCH_KICK = 0.7;

// The waiting plant's wiggle (components.md, Motion): ±8° every 0.7 s.
// While waiting is fresh it wiggles fully, drooping it wiggles a little
// (tired), yellow it has given up
const WIGGLE_ANGLE = THREE.MathUtils.degToRad(8);
const WIGGLE_SECONDS = 0.7;

// A plant growing in: a quick spring from nothing that overshoots a bit,
// one pot after the other when the page opens
const POP_SPRING = 90;
const POP_DAMPING = 9;
const POP_DELAY = 0.15;

// Per state: how much it gives to the wind (a dead or wilted plant hangs
// stiff or limp, a healthy one sways), how much it wiggles, and how much
// insects want its tip (a bloom most, a bare stalk never)
const MOTION: Record<
  PlantState,
  { give: number; wiggle: number; perch: number }
> = {
  working: { give: 1, wiggle: 0, perch: 1 },
  waiting1: { give: 0.9, wiggle: 1, perch: 0.5 },
  waiting2: { give: 0.55, wiggle: 0.4, perch: 0.5 },
  waiting3: { give: 0.3, wiggle: 0, perch: 0.3 },
  error: { give: 0.25, wiggle: 0, perch: 0 },
  done: { give: 0.85, wiggle: 0, perch: 3 },
  merged: { give: 1, wiggle: 0, perch: 6 },
};

// The stem bends in its shader: each point moves sideways by the sway
// times the square of how far up the stem it is (the tube's uv.x, 0 at the
// soil, 1 at the tip), so the foot stays put and the tip swings most. The
// leaves and the tip follow the same curve in useFrame. On the way up it
// also draws in along its normal, so the stem tapers. The shadow's depth
// material gets the same change, so the shadow sways along
const TAPER = (STEM_R * (1 - STEM_TIP)).toFixed(4);

function bendStem(sway: { value: THREE.Vector2 }) {
  return (shader: THREE.WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uSway = sway;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform vec2 uSway;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
transformed -= normal * ${TAPER} * uv.x;
transformed.xz += uSway * uv.x * uv.x;`,
      );
  };
}

// One leaf: where on the stem (0 = soil, 1 = tip), turned how far
// around it, how big (0 = hidden, 1 = full leaf), and from which
// growth on it shows (leaves without from are always there)
type Leaf = { at: number; turn: number; size: number; from?: number };

// Everything that makes a state look the way it does. bend: 0 = upright,
// 1 = drooping right over. leaves: always four, so states blend leaf by leaf
// bud, bloom:
// size of bud or flower (0 or missing = none)
// foot: size of the small leaves around the stem's foot (0 or missing =
// none)

type Look = {
  height: number;
  bend: number;
  stem: string;
  leaf: string;
  leaves: Leaf[];
  bud?: number;
  bloom?: number;
  foot?: number;
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
      foot: 1,
    }),
    waiting1: (colors) => ({
      height: 0.72,
      bend: 0.05,
      stem: colors["stem-waiting"]["1"],
      leaf: colors["leaf-waiting"]["1"],
      leaves: SPREAD,
      foot: 0.8,
    }),
    waiting2: (colors) => ({
      height: 0.72,
      bend: 0.5,
      stem: colors["stem-waiting"]["2"],
      leaf: colors["leaf-waiting"]["2"],
      leaves: SPREAD,
      foot: 0.65,
    }),
    waiting3: (colors) => ({
      height: 0.72,
      bend: 1,
      stem: colors["stem-waiting"]["3"],
      leaf: colors["leaf-waiting"]["3"],
      leaves: SPREAD,
      foot: 0.5,
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
      foot: 1,
    }),
    merged: (colors) => ({
      height: 0.95,
      bend: 0,
      stem: colors.stem,
      leaf: colors.leaf,
      bloom: 1,
      leaves: FULL,
      foot: 1,
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

// A thin sheet from its base (y 0) to its tip, as a grid: rows along it
// (t, 0 to 1) and points across it (u, -1 to 1, closer together around
// the middle, for a fine midrib). place puts each point, paint colours it
const SHEET_ROWS = 12;
const SHEET_ACROSS = [-1, -0.55, -0.12, 0, 0.12, 0.55, 1];

function sheet(
  place: (t: number, u: number, point: THREE.Vector3) => void,
  paint: (t: number, u: number, color: THREE.Color) => void,
) {
  const across = SHEET_ACROSS.length;
  const positions: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  const point = new THREE.Vector3();
  const color = new THREE.Color();
  for (let row = 0; row <= SHEET_ROWS; row++) {
    const t = row / SHEET_ROWS;
    for (const u of SHEET_ACROSS) {
      place(t, u, point);
      paint(t, u, color);
      positions.push(point.x, point.y, point.z);
      colors.push(color.r, color.g, color.b);
    }
  }
  for (let row = 0; row < SHEET_ROWS; row++) {
    for (let col = 0; col < across - 1; col++) {
      const a = row * across + col;
      const b = a + across;
      index.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

// A pointed leaf, widest a little below the middle, curled (tip back,
// sides up), folded along its midrib, its edge a little wavy. Its colours
// are shades the material's colour is multiplied with: darker at the
// base, a light midrib
function leafGeo(len: number, wid: number) {
  return sheet(
    (t, u, point) => {
      const x = u * 0.5 * wid * Math.sin(Math.PI * t ** 0.75);
      const y = t * len;
      const wave = Math.sin(t * 17) * 0.006 * Math.abs(u);
      const curl = (-0.35 * y * y) / len + 0.6 * x * x;
      point.set(x, y, curl + 0.45 * Math.abs(x) + wave);
    },
    (t, u, color) => {
      const shade =
        (0.7 + 0.3 * THREE.MathUtils.smoothstep(t, 0, 0.7)) *
        (u === 0 ? 1.25 : 1);
      color.setScalar(shade);
    },
  );
}

// Three small leaves around the stem's foot, lying out over the soil,
// each turned its own way
function footGeometry() {
  return paintedParts(
    [0, 1, 2].map((i) => [
      leafGeo(LEAF_LEN * 0.6, LEAF_WID * 0.7)
        .rotateX(-Math.PI / 2 + 0.5 + i * 0.12)
        .rotateY(i * 2.2 + 0.4),
      null,
    ]),
  );
}

// The bud: a closed tulip turned from its outline, with five seams down
// it where its petals meet, and three small sepals cupping its foot
const BUD_PROFILE = [
  [0, 0],
  [0.03, 0.006],
  [0.052, 0.035],
  [0.06, 0.075],
  [0.052, 0.115],
  [0.03, 0.15],
  [0.008, 0.172],
  [0, 0.175],
].map(([x, y]) => new THREE.Vector2(x, y));

function budGeometry(bud: string, seam: string, sepal: string) {
  const body = new THREE.LatheGeometry(BUD_PROFILE, 20);
  const position = body.attributes.position;
  const base = new THREE.Color(bud);
  const line = new THREE.Color(seam);
  const paint = new THREE.Color();
  const colors: number[] = [];
  for (let i = 0; i < position.count; i++) {
    const angle = Math.atan2(position.getZ(i), position.getX(i));
    const seamShare =
      THREE.MathUtils.smoothstep(Math.cos(angle * 5), 0.75, 1) *
      THREE.MathUtils.smoothstep(position.getY(i), 0.02, 0.1);
    paint.copy(base).lerp(line, seamShare * 0.6);
    colors.push(paint.r, paint.g, paint.b);
  }
  body.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

  // Each sepal stands up with its cupped side to the bud, leaning out a
  // little
  const sepals = [0, 1, 2].map((i): [THREE.BufferGeometry, string] => {
    const out = (i * 2 * Math.PI) / 3 + 0.4;
    return [
      leafGeo(0.08, 0.05)
        .rotateX(-0.35)
        .rotateY(Math.atan2(-Math.cos(out), -Math.sin(out)))
        .translate(Math.cos(out) * 0.028, 0, Math.sin(out) * 0.028),
      sepal,
    ];
  });
  return paintedParts([[body, null], ...sepals]);
}

// A petal: rounder than a leaf, cupped, darker toward the heart
function petalGeo(len: number, wid: number, petal: string, heart: string) {
  const tip = new THREE.Color(petal);
  const foot = new THREE.Color(petal).lerp(new THREE.Color(heart), 0.45);
  return sheet(
    (t, u, point) => {
      const x = u * 0.5 * wid * Math.sqrt(Math.sin(Math.PI * t ** 0.7));
      const y = t * len;
      point.set(x, y, 1.6 * x * x - 0.25 * y * y);
    },
    (t, _, color) => {
      color.copy(foot).lerp(tip, THREE.MathUtils.smoothstep(t, 0, 0.5));
    },
  );
}

// The bloom: five petals around a domed heart, and five smaller ones
// between them, standing up more, like an opening cup. Each petal lies
// flat (pointing away from the heart, cup up), is tilted up, pushed out
// and turned to its place
function bloomGeometry(petal: string, heart: string) {
  const ring = (
    len: number,
    wid: number,
    tilt: number,
    out: number,
    lift: number,
    turn: number,
  ) =>
    PETAL_TURNS.map((petalTurn): [THREE.BufferGeometry, null] => [
      petalGeo(len, wid, petal, heart)
        .rotateX(-Math.PI / 2 + tilt)
        .translate(0, lift, -out)
        .rotateY(petalTurn + turn),
      null,
    ]);
  return paintedParts([
    ...ring(0.15, 0.12, PETAL_TILT, 0.02, 0, 0),
    ...ring(0.1, 0.09, PETAL_TILT * 2.2, 0.012, 0.01, Math.PI / 5),
    [
      new THREE.SphereGeometry(0.04, 12, 8)
        .scale(1, 0.6, 1)
        .translate(0, 0.014, 0),
      heart,
    ],
  ]);
}

// Scale a part to its size; hidden once it's nearly gone, like the leaves
function showSized(group: THREE.Group | null, size: number) {
  if (!group) return;
  group.scale.setScalar(size);
  group.visible = size > 0.01;
}

// One plant: a stem tube and four leaves. The props give the target look;
// useFrame eases the meshes toward it, so a change never remounts anything.
// On top of the look the plant lives: it sways in the wind, wiggles while
// it waits, shivers when touched, and grows in when it first appears
export function Plant({
  slot,
  state,
  growth,
  wholeScale,
  touched,
  colors,
  art,
}: {
  slot: number;
  state: PlantState;
  growth: number;
  wholeScale: boolean;
  touched: boolean;
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
  const reducedMotion = useReducedMotion();

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
    foot: start.foot ?? 0,
    bloom: start.bloom ?? 0,
  });
  const leafGroups = useRef<(THREE.Group | null)[]>([]);
  const leafMeshes = useRef<(THREE.Mesh | null)[]>([]);
  const stemMesh = useRef<THREE.Mesh>(null);
  const plantRoot = useRef<THREE.Group>(null);
  const tipGroup = useRef<THREE.Group>(null);
  const budGroup = useRef<THREE.Group>(null);
  const footGroup = useRef<THREE.Group>(null);
  const bloomGroup = useRef<THREE.Group>(null);

  // The plant's life, in a ref like now:
  // - sway: the tip's offset (x, z) and its speed, on the wind's spring
  // - rustle: 1 right after a touch, fading to 0; the leaves shiver
  // - wiggle: how hard it wiggles now, easing toward its state's
  // - pop: the grow-in spring's size and speed, and how long it still
  //   waits (null: decided on the first frame). Under reduced motion the
  //   plant is simply there
  const life = useRef({
    sway: new THREE.Vector2(),
    swaySpeed: new THREE.Vector2(),
    rustle: 0,
    wiggle: 0,
    pop: reducedMotion ? 1 : 0,
    popSpeed: 0,
    popWait: null as number | null,
  });

  // The stem's sway for its shader, and the shadow's depth material bent
  // the same way. Both freed with the plant, like its last tube
  const swayUniform = useMemo(() => ({ value: new THREE.Vector2() }), []);
  const bend = useMemo(() => bendStem(swayUniform), [swayUniform]);
  const stemDepth = useMemo(() => {
    const material = new THREE.MeshDepthMaterial();
    material.onBeforeCompile = bend;
    return material;
  }, [bend]);
  useEffect(() => () => stemDepth.dispose(), [stemDepth]);

  // When the plant goes away, free the tube useFrame made last
  useEffect(() => {
    const stem = stemMesh.current;
    return () => stem?.geometry.dispose();
  }, []);

  // The tip as a perch for the insects while the plant stands. useFrame
  // keeps its place and weight; until the plant has grown in it has none
  const perch = useRef<Perch>({ position: new THREE.Vector3(), weight: 0 });
  useEffect(() => {
    const key = `plant-${slot}`;
    perches.set(key, perch.current);
    return () => {
      perches.delete(key);
    };
  }, [slot]);

  // A touch (the pointer arriving over the pot) kicks the sway sideways
  // across the view and makes the leaves rustle
  useEffect(() => {
    if (!touched || reducedMotion) return;
    life.current.swaySpeed.x += TOUCH_KICK;
    life.current.rustle = 1;
  }, [touched, reducedMotion]);

  // One leaf shape per plant, used by all its leaves; bud and bloom new
  // with the mode's colours
  const leafShape = useMemo(() => leafGeo(LEAF_LEN, LEAF_WID), []);
  useEffect(() => () => leafShape.dispose(), [leafShape]);
  const footShape = useMemo(() => footGeometry(), []);
  useEffect(() => () => footShape.dispose(), [footShape]);
  const budShape = useMemo(
    () => budGeometry(art.bud, art["bud-line"], colors.leaf),
    [art, colors.leaf],
  );
  useEffect(() => () => budShape.dispose(), [budShape]);
  const bloomShape = useMemo(
    () => bloomGeometry(art.petal, art.heart),
    [art.petal, art.heart],
  );
  useEffect(() => () => bloomShape.dispose(), [bloomShape]);

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
  // Then the life on top, see below

  useFrame(({ clock }, delta) => {
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

    const stem = stemMesh.current;
    if (moving && stem) {
      cur.curve = overRim(stemCurve(cur.height, cur.bend, dir), cur.scale);
      const old = stem.geometry;
      stem.geometry = new THREE.TubeGeometry(
        cur.curve,
        STEM_STEPS,
        STEM_R,
        STEM_SIDES,
      );
      old.dispose();
    }

    // The life. dt is capped, so the first frame after a hidden tab
    // doesn't fling the springs
    // - sway: the wind at this pot, times how much this state gives,
    //   pushes the tip downwind; flutter adds a small quick shiver across
    //   it. The spring follows, overshoots a little, settles
    // - wiggle: ±8° around the soil, sideways to the camera
    // - pop: waits for the scene to show, then (one pot after the other
    //   while the page opens, a moment after the soil puff when planted
    //   later) springs to full size
    const live = life.current;
    const motion = MOTION[state];
    const time = clock.elapsedTime;
    const dt = Math.min(delta, 1 / 30);
    const [potX, potZ] = POT_SPOTS[slot];
    const wind = reducedMotion
      ? 0
      : windAt(potX, potZ, time) * motion.give * SWAY;
    const flutter =
      Math.sin(time * 2.3 + slot * 1.9) * Math.sin(time * 1.7 + slot) * wind;
    const goalX = WIND_DIR.x * wind - WIND_DIR.y * flutter * 0.25;
    const goalZ = WIND_DIR.y * wind + WIND_DIR.x * flutter * 0.25;
    live.swaySpeed.x +=
      (SPRING * (goalX - live.sway.x) - DAMPING * live.swaySpeed.x) * dt;
    live.swaySpeed.y +=
      (SPRING * (goalZ - live.sway.y) - DAMPING * live.swaySpeed.y) * dt;
    live.sway.addScaledVector(live.swaySpeed, dt);
    swayUniform.value.copy(live.sway);
    live.rustle = Math.max(0, live.rustle - delta * 1.5);

    live.wiggle += ((reducedMotion ? 0 : motion.wiggle) - live.wiggle) * step;

    if (reducedMotion) {
      live.pop = 1;
    } else if (reveal.at === null) {
      // Still loading: wait
    } else if (live.popWait === null) {
      live.popWait =
        time - reveal.at < 2 ? POP_DELAY * (slot + 1) : POP_DELAY * 3;
    } else if (live.popWait > 0) {
      live.popWait -= delta;
    } else {
      live.popSpeed +=
        (POP_SPRING * (1 - live.pop) - POP_DAMPING * live.popSpeed) * dt;
      live.pop += live.popSpeed * dt;
    }

    const root = plantRoot.current;
    if (root) {
      root.scale.setScalar(cur.scale * Math.max(live.pop, 0.001));
      root.visible = live.pop > 0.01;
      root.rotation.z =
        -Math.sin((time * 2 * Math.PI) / WIGGLE_SECONDS) *
        WIGGLE_ANGLE *
        live.wiggle;
    }

    // The leaves sit on the swaying stem (the shader's bend at their place
    // on it) and shiver: slowly in the breeze, harder in a gust, quick and
    // wide right after a touch
    const elev = 0.65 - cur.bend * 1.6;
    const shiver = reducedMotion ? 0 : 0.05 + wind * 1.2;

    look.leaves.forEach((goal, i) => {
      const leaf = cur.leaves[i];
      leaf.at += (goal.at - leaf.at) * step;
      leaf.turn += (goal.turn - leaf.turn) * step;
      leaf.size += (goal.size - leaf.size) * step;

      const group = leafGroups.current[i];
      if (group) {
        cur.curve.getPointAt(leaf.at, group.position);
        const bent = leaf.at * leaf.at;
        group.position.x += live.sway.x * bent;
        group.position.z += live.sway.y * bent;

        group.rotation.y = dir + leaf.turn;
        group.scale.setScalar(leaf.size);
        group.visible = leaf.size > 0.01;
      }
      const mesh = leafMeshes.current[i];
      if (mesh) {
        mesh.rotation.x =
          Math.PI / 2 -
          elev +
          Math.sin(time * (3.1 + i * 0.7) + i * 2.1 + slot) * shiver +
          Math.sin(time * 19 + i * 1.3) * live.rustle * 0.3;
      }
    });

    // The tip rides the stem's end and nods with the sway; the bloom turns
    // slowly. Its place in the world is the insects' perch
    cur.bud += ((look.bud ?? 0) - cur.bud) * step;
    cur.foot += ((look.foot ?? 0) - cur.foot) * step;
    cur.bloom += ((look.bloom ?? 0) - cur.bloom) * step;
    const tip = tipGroup.current;
    if (tip) {
      cur.curve.getPointAt(1, tip.position);
      tip.position.x += live.sway.x;
      tip.position.z += live.sway.y;
      tip.rotation.z = -live.sway.x * 2.5;
      tip.rotation.x = live.sway.y * 2.5;
      tip.getWorldPosition(perch.current.position);
    }
    perch.current.weight = live.pop > 0.9 ? motion.perch : 0;
    showSized(budGroup.current, cur.bud);
    showSized(footGroup.current, cur.foot);
    showSized(bloomGroup.current, cur.bloom);
    if (bloomGroup.current && !reducedMotion) {
      bloomGroup.current.rotation.y = time * 0.15;
    }
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
  // and sizes bud and bloom, each one mesh
  // (budGeometry, bloomGeometry).
  // The foot leaves take the leaves' colour
  // like the others (the last leaf material)
  return (
    <group ref={plantRoot}>
      <mesh ref={stemMesh} castShadow customDepthMaterial={stemDepth}>
        <tubeGeometry args={[startCurve, STEM_STEPS, STEM_R, STEM_SIDES]} />
        <meshStandardMaterial
          ref={stemMat}
          color={start.stem}
          roughness={0.8}
          onBeforeCompile={bend}
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
              vertexColors
              roughness={0.7}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}

      <group ref={footGroup}>
        <mesh geometry={footShape} castShadow>
          <meshStandardMaterial
            ref={(mat) => {
              leafMats.current[start.leaves.length] = mat;
            }}
            color={start.leaf}
            vertexColors
            roughness={0.7}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>

      <group ref={tipGroup} scale={TIP_SCALE}>
        <group ref={budGroup}>
          <mesh geometry={budShape} castShadow>
            <meshStandardMaterial
              vertexColors
              roughness={0.6}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
        <group ref={bloomGroup}>
          <mesh geometry={bloomShape} castShadow>
            <meshStandardMaterial
              vertexColors
              roughness={0.6}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      </group>
    </group>
  );
}
