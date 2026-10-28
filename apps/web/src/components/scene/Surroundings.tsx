import { useEffect, useMemo } from "react";
import * as THREE from "three";
import {
  mergeGeometries,
  mergeVertices,
} from "three/addons/utils/BufferGeometryUtils.js";

import type { Mode, tokens } from "@/theme/tokens";

import { FLOOR_Y } from "./layout";
import { seeded } from "./life";
import { paintedParts } from "./shapes";
import { WIND_GLSL, windUniforms } from "./wind";

//
//
//
// The garden around the meadow, so it doesn't end in an empty field:
// a rail fence in an arc behind the table with a gate in it, a stepping
// stone path from the table to the gate, bushes along the fence, a
// garden shed with a rain barrel, a wheelbarrow, a corner of stacked pots
// by the table, and behind it all trees, round ones and pines, swaying a
// little in the wind and fading into the fog.
// Everything stands out of the camera's usual view (it looks down on the
// table) and comes into sight when the view is turned flatter. Trees and
// bushes are instanced, some bushes with berries or blossoms, the props
// one mesh each: about a dozen draw calls

type ModeTokens = (typeof tokens)[Mode];

// A place around the table: an angle (0 = right, -π/2 = straight back)
// and a distance from the middle
function spot(angle: number, distance: number): [number, number] {
  return [Math.cos(angle) * distance, Math.sin(angle) * distance];
}

// Where trees and bushes may stand: behind the table and on both sides,
// a little toward the front
const AROUND_FROM = -Math.PI - 0.4;
const AROUND_TO = 0.4;
const TREES = 40;
const BUSHES = 28;

// The fence: an arc behind the table, from angle to angle, a post every
// POST_STEP units, and the gate (a gap) straight behind the table
const FENCE_RADIUS = 12;
const FENCE_FROM = -Math.PI + 0.3;
const FENCE_TO = -0.3;
const POST_STEP = 1.5;
const GATE = -Math.PI / 2;
const GATE_HALF = 0.09;

// The props: the shed behind the fence at the back left (its front turned
// to the table), the wheelbarrow inside the fence at the back right, the
// potting corner close to the table's back left corner
export const SHED_SPOT = spot(-2.25, 15.5);
const BARROW_SPOT: [number, number] = [5.8, -9.2];
const POTS_SPOT: [number, number] = [-5.7, -4.9];

// Turned around y so its front (+z) looks at the middle of the table
function facingMiddle([x, z]: [number, number]) {
  return Math.atan2(-x, -z);
}

function smooth(edge0: number, edge1: number, x: number) {
  return THREE.MathUtils.smoothstep(x, edge0, edge1);
}

//
// Trees and bushes. Their shapes are 1 unit tall (bushes about 1 wide);
// each instance scales them. Crowns and bushes are lumpy balls; their
// colour attribute is a shade the instance colour is multiplied with,
// darker below, lighter on top, which reads as the light through leaves
//

// A ball with bumps, smooth-shaded: the icosahedron's corners are merged,
// pushed in and out by a few waves, and given new normals
function lumpyBall(radius: number, detail: number, seed: number) {
  const plain = new THREE.IcosahedronGeometry(1, detail);
  plain.deleteAttribute("normal");
  plain.deleteAttribute("uv");
  const ball = mergeVertices(plain);
  plain.dispose();
  const position = ball.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const bump =
      1 +
      0.1 * Math.sin(x * 5 + seed) * Math.sin(y * 4 + seed * 1.3) +
      0.06 * Math.sin(z * 7 + seed * 0.7) * Math.sin(x * 6 - seed);
    position.setXYZ(i, x * radius * bump, y * radius * bump, z * radius * bump);
  }
  ball.computeVertexNormals();
  return ball;
}

// Merges the parts and shades them by height, from low to high
function shaded(parts: THREE.BufferGeometry[], low: number, high: number) {
  const merged = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  const position = merged.attributes.position;
  const shades = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const shade = 0.6 + 0.55 * smooth(low, high, position.getY(i));
    shades.set([shade, shade, shade], i * 3);
  }
  merged.setAttribute("color", new THREE.BufferAttribute(shades, 3));
  return merged;
}

// A round tree's crown: a few balls clustered high on the trunk
function crownGeometry() {
  const balls: [number, number, number, number][] = [
    [0.24, 0, 0.72, 0],
    [0.19, 0.17, 0.62, 0.05],
    [0.18, -0.16, 0.64, -0.06],
    [0.17, 0.02, 0.6, 0.17],
    [0.16, 0.04, 0.9, -0.05],
    [0.14, -0.06, 0.6, -0.17],
  ];
  return shaded(
    balls.map(([radius, x, y, z], i) =>
      lumpyBall(radius, 2, i * 1.7).translate(x, y, z),
    ),
    0.45,
    1,
  );
}

// A pine: three cones stacked on a short trunk
function pineGeometry() {
  const cones: [number, number, number][] = [
    [0.22, 0.42, 0.14],
    [0.17, 0.36, 0.36],
    [0.12, 0.32, 0.57],
  ];
  return shaded(
    cones.map(([radius, height, base]) =>
      new THREE.ConeGeometry(radius, height, 9).translate(
        0,
        base + height / 2,
        0,
      ),
    ),
    0.1,
    0.9,
  );
}

// A bush: three balls, the middle one biggest, a little flattened
const BUSH_BALLS: [number, number, number, number][] = [
  [0.5, 0, 0.35, 0],
  [0.38, 0.42, 0.25, 0.1],
  [0.36, -0.38, 0.24, -0.08],
];
const BUSH_FLAT = 0.85;

function bushBalls() {
  return BUSH_BALLS.map(([radius, x, y, z], i) =>
    lumpyBall(radius, 1, i * 2.3 + 5)
      .scale(1, BUSH_FLAT, 1)
      .translate(x, y, z),
  );
}

function bushGeometry() {
  return shaded(bushBalls(), 0, 0.8);
}

// A trunk: 1 unit tall, 1 unit wide at the foot, narrower at the top;
// each tree scales it to its own
const TRUNK = new THREE.CylinderGeometry(0.7, 1, 1, 7).translate(0, 0.5, 0);

type Tree = {
  x: number;
  z: number;
  size: number;
  width: number;
  turn: number;
  tint: number;
  pine: boolean;
};

// The trees at random places (from a fixed seed): round ones from 17
// units out, pines further back, none too close to another or the shed
function plantTrees(random: () => number) {
  const trees: Tree[] = [];
  for (let i = 0; trees.length < TREES && i < 2000; i++) {
    const pine = trees.length % 3 === 2;
    const angle = AROUND_FROM + random() * (AROUND_TO - AROUND_FROM);
    const [x, z] = spot(angle, (pine ? 21 : 17) + random() * 16);
    const crowded =
      trees.some((tree) => Math.hypot(tree.x - x, tree.z - z) < 3.6) ||
      Math.hypot(x - SHED_SPOT[0], z - SHED_SPOT[1]) < 4.5;
    if (crowded) continue;
    trees.push({
      x,
      z,
      size: pine ? 8 + random() * 4 : 6 + random() * 3,
      width: 0.85 + random() * 0.3,
      turn: random() * Math.PI * 2,
      tint: random(),
      pine,
    });
  }
  return trees;
}

type Bush = { x: number; z: number; size: number; turn: number; tint: number };

// The bushes along the fence, inside and out, away from the gate
function plantBushes(random: () => number) {
  const bushes: Bush[] = [];
  for (let i = 0; bushes.length < BUSHES && i < 2000; i++) {
    const angle = AROUND_FROM + random() * (AROUND_TO - AROUND_FROM);
    if (Math.abs(angle - GATE) < 0.25) continue;
    const [x, z] = spot(angle, 9.5 + random() * 5.5);
    const crowded =
      bushes.some((bush) => Math.hypot(bush.x - x, bush.z - z) < 1.6) ||
      Math.hypot(x - SHED_SPOT[0], z - SHED_SPOT[1]) < 3 ||
      Math.hypot(x - BARROW_SPOT[0], z - BARROW_SPOT[1]) < 1.6;
    if (crowded) continue;
    bushes.push({
      x,
      z,
      size: 0.9 + random() * 0.9,
      turn: random() * Math.PI * 2,
      tint: random(),
    });
  }
  return bushes;
}

// Instance matrices and colours for a set of things
function instances(
  items: {
    x: number;
    z: number;
    turn: number;
    scale: THREE.Vector3;
    y?: number;
  }[],
  colors: THREE.Color[],
) {
  const matrices = new Float32Array(items.length * 16);
  const tints = new Float32Array(items.length * 3);
  const matrix = new THREE.Matrix4();
  const turn = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  items.forEach((item, i) => {
    turn.setFromAxisAngle(up, item.turn);
    matrix.compose(
      new THREE.Vector3(item.x, item.y ?? FLOOR_Y, item.z),
      turn,
      item.scale,
    );
    matrix.toArray(matrices, i * 16);
    colors[i].toArray(tints, i * 3);
  });
  return { matrices, tints, count: items.length };
}

// Crowns, pines and bushes sway in the shared wind: each point moves
// downwind by how far above the trunk's top it is (shape units over
// 0.4), times the tree's height, plus a slow rocking of its own. Lambert,
// with the shades and instance colours.
// root, height and y are GLSL: a tree reads them from its instance and
// the point, a berry or blossom from its bush (aBush), so it moves with
// the bush's surface where it sits
function swayVertex(root: string, height: string, y: string) {
  return /* glsl */ `
vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
vec2 root = ${root};
float wind = windAt(root, uWindTime);
float rock = sin(uWindTime * 1.1 + root.x * 0.37 + root.y * 0.23);
float bend = max(${y} - 0.4, 0.0) * ${height} * 0.12;
mvPosition.xz += WIND_DIR * (wind * 0.35 + rock * 0.08) * bend * uWindMotion;
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
`;
}

function swayingMaterial() {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, windUniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${WIND_GLSL}`)
      .replace(
        "#include <project_vertex>",
        swayVertex(
          "instanceMatrix[3].xz",
          "length(instanceMatrix[1].xyz)",
          "position.y",
        ),
      );
  };
  material.customProgramCacheKey = () => "tree";
  return material;
}

//
// Berries and blossoms on some of the bushes: small shapes on the bush's
// outside, each instance placed by its bush's matrix times its own spot,
// swaying with the bush (see swayVertex). Two draw calls for all of them
//

const BERRIED = 0.2;
const BLOOMING = 0.2;
const BERRY_CLUSTERS = 16;
const BLOSSOMS = 22;

// A place on a bush's outside, in the bush's own units: the point and
// the way out of the surface there
type Spot = { at: THREE.Vector3; out: THREE.Vector3 };

// Points on the bush's balls that are inside no other ball, not too low
// and not facing the ground, a little apart from each other
function bushSpots(count: number, random: () => number) {
  const balls = bushBalls();
  const spots: Spot[] = [];
  const corners = [0, 1, 2].map(() => new THREE.Vector3());
  const triangle = new THREE.Triangle();
  const other = new THREE.Vector3();
  for (let i = 0; spots.length < count && i < count * 60; i++) {
    const ball = Math.floor(random() * balls.length);
    const position = balls[ball].attributes.position;
    const index = balls[ball].index!;
    const face = Math.floor((random() * index.count) / 3);
    corners.forEach((corner, k) =>
      corner.fromBufferAttribute(position, index.getX(face * 3 + k)),
    );
    triangle.set(corners[0], corners[1], corners[2]);
    let u = random();
    let v = random();
    if (u + v > 1) [u, v] = [1 - u, 1 - v];
    const at = corners[0]
      .clone()
      .addScaledVector(other.subVectors(corners[1], corners[0]), u)
      .addScaledVector(other.subVectors(corners[2], corners[0]), v);
    const out = triangle.getNormal(new THREE.Vector3());
    if (at.y < 0.2 || out.y < -0.15) continue;
    const covered = BUSH_BALLS.some(([radius, x, y, z], j) => {
      if (j === ball) return false;
      other.set(x, y, z).sub(at);
      other.y /= BUSH_FLAT;
      return other.length() < radius * 1.12;
    });
    if (covered || spots.some((spot) => spot.at.distanceTo(at) < 0.12)) {
      continue;
    }
    spots.push({ at, out });
  }
  balls.forEach((ball) => ball.dispose());
  return spots;
}

// Three berries in a little cluster, around +y (the way out)
function berryGeometry() {
  const parts = [
    [0, 0.03, 0.045, 0.042],
    [0.06, 0.025, -0.02, 0.036],
    [-0.055, 0.02, -0.03, 0.036],
  ].map(([x, y, z, radius]) =>
    new THREE.IcosahedronGeometry(radius, 1).translate(x, y, z),
  );
  const merged = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  return merged;
}

// A five-pointed blossom facing +y, cupped a little, with a round heart
// in its middle; aHeart marks the heart, coloured apart from the petals
function blossomGeometry() {
  const star = new THREE.Shape(
    Array.from({ length: 10 }, (_, i) => {
      const angle = (i / 10) * Math.PI * 2;
      const radius = i % 2 === 0 ? 0.11 : 0.05;
      return new THREE.Vector2(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
      );
    }),
  );
  const petals = new THREE.ShapeGeometry(star).rotateX(-Math.PI / 2);
  const position = petals.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const reach = Math.hypot(position.getX(i), position.getZ(i));
    position.setY(i, reach * reach * 2);
  }
  petals.computeVertexNormals();
  const heart = new THREE.CircleGeometry(0.035, 7)
    .rotateX(-Math.PI / 2)
    .translate(0, 0.01, 0);
  const parts = [petals, heart].map((part, i) => {
    part.deleteAttribute("uv");
    const marks = new Float32Array(part.attributes.position.count).fill(i);
    return part.setAttribute("aHeart", new THREE.BufferAttribute(marks, 1));
  });
  const merged = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  return merged;
}

// Lambert with instance colours, swaying with the bush from aBush (its
// root x and z, its size, and how high on it the spot is); with a heart,
// the points marked by aHeart take the heart's colour
function bushDecorMaterial(heart: { value: THREE.Color } | null) {
  const material = new THREE.MeshLambertMaterial({
    side: heart ? THREE.DoubleSide : THREE.FrontSide,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, windUniforms, heart && { uHeart: heart });
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>\n${WIND_GLSL}\nattribute vec4 aBush;\n` +
          (heart ? "attribute float aHeart;\nuniform vec3 uHeart;\n" : ""),
      )
      .replace(
        "#include <color_vertex>",
        heart
          ? "#include <color_vertex>\nvColor.rgb = mix(vColor.rgb, uHeart, aHeart);"
          : "#include <color_vertex>",
      )
      .replace(
        "#include <project_vertex>",
        swayVertex("aBush.xy", "aBush.z", "aBush.w"),
      );
  };
  material.customProgramCacheKey = () =>
    heart ? "bush-blossom" : "bush-berry";
  return material;
}

type Decor = { bush: Bush; spot: Spot; spin: number; tint: number };

// Which bushes bear berries and which bloom (from their own seed, so the
// bushes stay where they are), and the spots on each. A bush's berries
// are each their own shade, its blossoms all one colour
function decorateBushes(bushes: Bush[], random: () => number) {
  const berries: Decor[] = [];
  const blossoms: Decor[] = [];
  const picks = bushes.map(() => [random(), random()]);
  for (const [i, bush] of bushes.entries()) {
    const [pick, tint] = picks[i];
    if (pick >= BERRIED + BLOOMING) continue;
    const berried = pick < BERRIED;
    const spots = bushSpots(berried ? BERRY_CLUSTERS : BLOSSOMS, random);
    for (const spot of spots) {
      (berried ? berries : blossoms).push({
        bush,
        spot,
        spin: random() * Math.PI * 2,
        tint: berried ? random() : tint,
      });
    }
  }
  return { berries, blossoms };
}

// Instance matrices and colours for berries or blossoms: the bush's
// matrix times the spot's, the shape lifted off the surface
function decorInstances(items: Decor[], colors: THREE.Color[], lift: number) {
  const matrices = new Float32Array(items.length * 16);
  const tints = new Float32Array(items.length * 3);
  const bushMatrix = new THREE.Matrix4();
  const spotMatrix = new THREE.Matrix4();
  const turn = new THREE.Quaternion();
  const spin = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  items.forEach(({ bush, spot, ...item }, i) => {
    bushMatrix.compose(
      new THREE.Vector3(bush.x, FLOOR_Y, bush.z),
      turn.setFromAxisAngle(up, bush.turn),
      new THREE.Vector3().setScalar(bush.size),
    );
    spotMatrix.compose(
      spot.at.clone().addScaledVector(spot.out, lift),
      turn
        .setFromUnitVectors(up, spot.out)
        .multiply(spin.setFromAxisAngle(up, item.spin)),
      one,
    );
    bushMatrix.multiply(spotMatrix).toArray(matrices, i * 16);
    colors[Math.floor(item.tint * colors.length)].toArray(tints, i * 3);
  });
  return { matrices, tints, count: items.length };
}

// The shape for berries or blossoms with each instance's aBush
function decorGeometry(shape: THREE.BufferGeometry, items: Decor[]) {
  const bushes = new Float32Array(items.length * 4);
  items.forEach(({ bush, spot }, i) =>
    bushes.set([bush.x, bush.z, bush.size, spot.at.y], i * 4),
  );
  return shape.setAttribute(
    "aBush",
    new THREE.InstancedBufferAttribute(bushes, 4),
  );
}

//
// The props, each one geometry of painted parts
//

type PropColors = {
  post: string;
  rail: string;
  wall: string;
  plank: string;
  roof: string;
  door: string;
  trim: string;
  metal: string;
  pot: string;
  soil: string;
  water: string;
  stone: string;
  barrow: string;
  leaf: string;
  flowers: string[];
};

type Part = [THREE.BufferGeometry, string | null];

const box = (
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

// Moves parts made around (0, 0) to their place on the floor, turned
function placed(parts: Part[], [x, z]: [number, number], turn: number) {
  return parts.map(([geometry, color]): Part => [
    geometry.rotateY(turn).translate(x, FLOOR_Y, z),
    color,
  ]);
}

// The fence: posts with a pointed cap, leaning a little each their own
// way, and two rails from post to post, but not across the gate
function fenceParts(colors: PropColors, random: () => number): Part[] {
  const parts: Part[] = [];
  const steps = Math.round(
    ((FENCE_TO - FENCE_FROM) * FENCE_RADIUS) / POST_STEP,
  );
  const step = (FENCE_TO - FENCE_FROM) / steps;
  const angles: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = FENCE_FROM + step * i;
    if (Math.abs(angle - GATE) > GATE_HALF) angles.push(angle);
  }
  const posts = angles.map((angle) => spot(angle, FENCE_RADIUS));
  posts.forEach(([x, z], i) => {
    const lean = (random() - 0.5) * 0.08;
    const post = [
      box(0.13, 1.25, 0.13, 0, 0.62, 0),
      new THREE.ConeGeometry(0.1, 0.14, 4)
        .rotateY(Math.PI / 4)
        .translate(0, 1.32, 0),
    ];
    for (const part of post) {
      part.rotateZ(lean).rotateY(-angles[i]).translate(x, FLOOR_Y, z);
      parts.push([part, colors.post]);
    }
  });
  for (let i = 0; i < posts.length - 1; i++) {
    if (angles[i + 1] - angles[i] > step * 1.5) continue;
    const [x0, z0] = posts[i];
    const [x1, z1] = posts[i + 1];
    const length = Math.hypot(x1 - x0, z1 - z0) + 0.1;
    const heading = -Math.atan2(z1 - z0, x1 - x0);
    for (const height of [0.45, 0.95]) {
      parts.push([
        new THREE.BoxGeometry(length, 0.1, 0.05)
          .rotateY(heading)
          .translate((x0 + x1) / 2, FLOOR_Y + height, (z0 + z1) / 2),
        colors.rail,
      ]);
    }
  }
  return parts;
}

// Flat stones from behind the table to the gate, wandering a little
function pathParts(colors: PropColors, random: () => number): Part[] {
  const parts: Part[] = [];
  for (let z = -3.6; z > -FENCE_RADIUS + 0.4; z -= 0.85) {
    const x = Math.sin(z * 0.45) * 0.5 + (random() - 0.5) * 0.2;
    parts.push([
      new THREE.CylinderGeometry(0.32, 0.36, 0.08, 7)
        .scale(1 + random() * 0.3, 1, 0.75 + random() * 0.2)
        .rotateY(random() * Math.PI)
        .translate(x, FLOOR_Y + 0.02, z),
      colors.stone,
    ]);
  }
  return parts;
}

// The shed: plank walls, a gable roof with a ridge, white corners, a
// door with its frame and knob, a cross-barred window with a flower box,
// a round window in the gable, a step, and a rain barrel at its side.
// The panes are apart (shedWindows), so they can light up at night
const SHED_W = 3;
const SHED_D = 2.4;
const SHED_H = 2.2;

function shedParts(colors: PropColors): Part[] {
  const W = SHED_W;
  const D = SHED_D;
  const H = SHED_H;
  const RISE = 1;
  const front = D / 2;
  const parts: Part[] = [];

  parts.push([box(W, H, D, 0, H / 2, 0), colors.wall]);
  for (let x = -1.3; x <= 1.31; x += 0.325) {
    parts.push([box(0.025, H, 0.01, x, H / 2, front + 0.005), colors.plank]);
  }
  const gable = new THREE.Shape();
  gable.moveTo(-W / 2, 0);
  gable.lineTo(W / 2, 0);
  gable.lineTo(0, RISE);
  gable.closePath();
  parts.push([
    new THREE.ExtrudeGeometry(gable, {
      depth: D,
      bevelEnabled: false,
    }).translate(0, H, -D / 2),
    colors.wall,
  ]);

  // Each roof half lies along its slope, lifted off it by half its
  // thickness and reaching out past the walls
  const slope = Math.atan2(RISE, W / 2);
  const length = Math.hypot(RISE, W / 2) + 0.3;
  for (const side of [1, -1]) {
    parts.push([
      new THREE.BoxGeometry(length, 0.12, D + 0.5)
        .rotateZ(-slope * side)
        .translate(
          side * (W / 4 + Math.cos(slope) * 0.15 + Math.sin(slope) * 0.06),
          H + RISE / 2 - Math.sin(slope) * 0.15 + Math.cos(slope) * 0.06,
          0,
        ),
      colors.roof,
    ]);
  }
  parts.push([box(0.16, 0.16, D + 0.5, 0, H + RISE + 0.06, 0), colors.trim]);

  for (const x of [-W / 2, W / 2]) {
    for (const z of [-D / 2, D / 2]) {
      parts.push([box(0.12, H, 0.12, x, H / 2, z), colors.trim]);
    }
  }

  parts.push(
    [box(0.97, 1.85, 0.03, -0.6, 0.925, front + 0.015), colors.trim],
    [box(0.85, 1.75, 0.05, -0.6, 0.875, front + 0.03), colors.door],
    [
      new THREE.SphereGeometry(0.045, 8, 6).translate(-0.3, 0.9, front + 0.07),
      colors.metal,
    ],
    [box(0.82, 0.72, 0.04, 0.72, 1.4, front + 0.02), colors.trim],
    [box(0.04, 0.56, 0.07, 0.72, 1.4, front + 0.03), colors.trim],
    [box(0.66, 0.04, 0.07, 0.72, 1.4, front + 0.03), colors.trim],
    [box(0.88, 0.2, 0.24, 0.72, 0.94, front + 0.12), colors.pot],
    [
      new THREE.TorusGeometry(0.2, 0.035, 6, 16).translate(
        0,
        H + 0.38,
        front + 0.04,
      ),
      colors.trim,
    ],
    [box(1.1, 0.1, 0.55, -0.6, 0.05, front + 0.35), colors.stone],
  );
  colors.flowers.forEach((flower, i) => {
    const x = 0.42 + i * (0.6 / Math.max(colors.flowers.length - 1, 1));
    parts.push(
      [
        new THREE.SphereGeometry(0.09, 8, 6).translate(x, 1.06, front + 0.1),
        colors.leaf,
      ],
      [
        new THREE.SphereGeometry(0.06, 8, 6).translate(x, 1.14, front + 0.16),
        flower,
      ],
    );
  });

  // The rain barrel by the front right corner
  const barrel: [number, number] = [W / 2 + 0.55, front - 0.4];
  parts.push(
    [
      new THREE.CylinderGeometry(0.42, 0.38, 1, 14).translate(
        barrel[0],
        0.5,
        barrel[1],
      ),
      colors.plank,
    ],
    [
      new THREE.CircleGeometry(0.39, 14)
        .rotateX(-Math.PI / 2)
        .translate(barrel[0], 0.95, barrel[1]),
      colors.water,
    ],
  );
  for (const y of [0.22, 0.78]) {
    parts.push([
      new THREE.TorusGeometry(0.42, 0.025, 5, 20)
        .rotateX(Math.PI / 2)
        .translate(barrel[0], y, barrel[1]),
      colors.metal,
    ]);
  }
  return parts;
}

// The shed's two panes, in the shed's own place (its front toward +z)
function shedWindows(glass: string) {
  const front = SHED_D / 2;
  return paintedParts([
    [box(0.66, 0.56, 0.05, 0.72, 1.4, front + 0.03), glass],
    [
      new THREE.CylinderGeometry(0.19, 0.19, 0.04, 16)
        .rotateX(Math.PI / 2)
        .translate(0, SHED_H + 0.38, front + 0.02),
      glass,
    ],
  ]);
}

// The lamplight falling out of the window onto the grass: a soft round
// glow, added onto the ground
const SPILL_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SPILL_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  float fade = 1.0 - smoothstep(0.0, 1.0, length(vUv - 0.5) * 2.0);
  gl_FragColor = vec4(uColor * fade * fade * uOpacity, 1.0);
  #include <colorspace_fragment>
}
`;

// The wheelbarrow: a tub with a heap of soil and a trowel stuck in it,
// a wheel in front, two handles and two legs at the back
function barrowParts(colors: PropColors): Part[] {
  const parts: Part[] = [
    [
      new THREE.CylinderGeometry(0.55, 0.36, 0.4, 4)
        .rotateY(Math.PI / 4)
        .scale(1.4, 1, 1)
        .translate(0, 0.55, 0),
      colors.barrow,
    ],
    [
      new THREE.SphereGeometry(0.45, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)
        .scale(1.25, 0.45, 0.85)
        .translate(0, 0.7, 0),
      colors.soil,
    ],
    [box(0.04, 0.32, 0.03, 0.15, 0.95, 0.05), colors.post],
    [box(0.12, 0.16, 0.02, 0.15, 0.75, 0.05), colors.metal],
    [
      new THREE.TorusGeometry(0.22, 0.06, 6, 14).translate(0.95, 0.24, 0),
      colors.metal,
    ],
    [
      new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8)
        .rotateX(Math.PI / 2)
        .translate(0.95, 0.24, 0),
      colors.metal,
    ],
  ];
  for (const z of [-0.3, 0.3]) {
    parts.push(
      [
        new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6)
          .rotateZ(Math.PI / 2 - 0.22)
          .translate(-0.55, 0.62, z),
        colors.post,
      ],
      [box(0.05, 0.42, 0.05, -0.45, 0.21, z), colors.metal],
    );
  }
  return parts;
}

// The potting corner: a tower of nested pots, one lying on its side,
// a small one upright, and a wooden crate of seedlings: four plank sides
// round a floor of soil, three small plants in it
const POT_PROFILE = [
  [0, 0],
  [0.2, 0],
  [0.27, 0.4],
  [0.31, 0.4],
  [0.31, 0.48],
  [0.27, 0.48],
  [0.24, 0.1],
  [0, 0.1],
].map(([x, y]) => new THREE.Vector2(x, y));

function pottingParts(colors: PropColors): Part[] {
  const pot = () => new THREE.LatheGeometry(POT_PROFILE, 16);
  return [
    [pot(), colors.pot],
    [pot().translate(0, 0.13, 0), colors.pot],
    [pot().translate(0, 0.26, 0), colors.pot],
    [
      pot()
        .rotateZ(Math.PI / 2 - 0.15)
        .translate(0.8, 0.31, 0.3),
      colors.pot,
    ],
    [pot().scale(0.7, 0.7, 0.7).translate(0.25, 0, -0.55), colors.pot],
    [
      new THREE.CircleGeometry(0.17, 12)
        .rotateX(-Math.PI / 2)
        .translate(0.25, 0.3, -0.55),
      colors.soil,
    ],
    ...crateParts(colors, -0.95, 0.05),
  ];
}

function crateParts(colors: PropColors, x: number, z: number): Part[] {
  const W = 0.8;
  const D = 0.55;
  const H = 0.36;
  const parts: Part[] = [
    [box(W, H, 0.05, x, H / 2, z + D / 2), colors.rail],
    [box(W, H, 0.05, x, H / 2, z - D / 2), colors.rail],
    [box(0.05, H, D, x + W / 2, H / 2, z), colors.rail],
    [box(0.05, H, D, x - W / 2, H / 2, z), colors.rail],
    [box(W, 0.03, D, x, H * 0.75, z), colors.soil],
  ];
  for (const side of [1, -1]) {
    parts.push([
      box(W + 0.02, 0.03, 0.06, x, H * 0.5, z + side * (D / 2)),
      colors.plank,
    ]);
  }
  for (const [dx, dz, size] of [
    [-0.22, 0.08, 1],
    [0.02, -0.1, 0.8],
    [0.24, 0.06, 0.9],
  ]) {
    parts.push(
      [
        new THREE.ConeGeometry(0.08 * size, 0.24 * size, 6).translate(
          x + dx,
          H * 0.75 + 0.12 * size,
          z + dz,
        ),
        colors.leaf,
      ],
      [
        new THREE.SphereGeometry(0.07 * size, 8, 6)
          .scale(1.4, 0.6, 1)
          .translate(x + dx, H * 0.75 + 0.2 * size, z + dz),
        colors.leaf,
      ],
    );
  }
  return parts;
}

export function Surroundings({ t }: { t: ModeTokens }) {
  const scene = t.color.scene;

  const trees = useMemo(() => plantTrees(seeded(21)), []);
  const bushes = useMemo(() => plantBushes(seeded(23)), []);

  const crown = useMemo(() => crownGeometry(), []);
  const pine = useMemo(() => pineGeometry(), []);
  const bush = useMemo(() => bushGeometry(), []);
  const swaying = useMemo(() => swayingMaterial(), []);
  useEffect(
    () => () => {
      crown.dispose();
      pine.dispose();
      bush.dispose();
      swaying.dispose();
    },
    [crown, pine, bush, swaying],
  );

  // Berries and blossoms on some of the bushes; the blossoms' heart
  // colour is a uniform, set from the mode
  const decor = useMemo(() => decorateBushes(bushes, seeded(92)), [bushes]);
  const berry = useMemo(
    () => decorGeometry(berryGeometry(), decor.berries),
    [decor],
  );
  const blossom = useMemo(
    () => decorGeometry(blossomGeometry(), decor.blossoms),
    [decor],
  );
  const heart = useMemo(() => ({ value: new THREE.Color() }), []);
  const berrying = useMemo(() => bushDecorMaterial(null), []);
  const blooming = useMemo(() => bushDecorMaterial(heart), [heart]);
  useEffect(() => {
    heart.value.set(scene.blossom.heart);
  }, [heart, scene.blossom.heart]);
  useEffect(
    () => () => {
      berry.dispose();
      blossom.dispose();
      berrying.dispose();
      blooming.dispose();
    },
    [berry, blossom, berrying, blooming],
  );

  // Instances: each round tree a crown and a trunk, each pine a pine and
  // a shorter trunk, each bush a bush; their colours from the mode
  const planted = useMemo(() => {
    const crowns = Object.values(scene.tree.crown).map(
      (color) => new THREE.Color(color),
    );
    const leafy = Object.values(scene.bush).map((c) => new THREE.Color(c));
    const pineColor = new THREE.Color(scene.tree.pine);
    const trunkColor = new THREE.Color(scene.tree.trunk);
    const round = trees.filter((tree) => !tree.pine);
    const pines = trees.filter((tree) => tree.pine);
    const sized = (tree: Tree) =>
      new THREE.Vector3(
        tree.size * tree.width,
        tree.size,
        tree.size * tree.width,
      );
    return {
      crowns: instances(
        round.map((tree) => ({ ...tree, scale: sized(tree) })),
        round.map((tree) => crowns[Math.floor(tree.tint * crowns.length)]),
      ),
      pines: instances(
        pines.map((tree) => ({ ...tree, scale: sized(tree) })),
        pines.map(() => pineColor),
      ),
      trunks: instances(
        trees.map((tree) => {
          const thick = tree.size * (tree.pine ? 0.028 : 0.04);
          const tall = tree.size * (tree.pine ? 0.22 : 0.62);
          return { ...tree, scale: new THREE.Vector3(thick, tall, thick) };
        }),
        trees.map(() => trunkColor),
      ),
      bushes: instances(
        bushes.map((b) => ({
          ...b,
          scale: new THREE.Vector3().setScalar(b.size),
        })),
        bushes.map((b) => leafy[Math.floor(b.tint * leafy.length)]),
      ),
      berries: decorInstances(
        decor.berries,
        Object.values(scene.berry).map((c) => new THREE.Color(c)),
        0.01,
      ),
      blossoms: decorInstances(
        decor.blossoms,
        Object.values(scene.blossom.petal).map((c) => new THREE.Color(c)),
        0.015,
      ),
    };
  }, [trees, bushes, decor, scene]);

  // The props, rebuilt with the mode's colours
  const props = useMemo(() => {
    const colors: PropColors = {
      post: t.color.wood.leg,
      rail: t.color.wood["2"],
      wall: t.color.wood["4"],
      plank: t.color.wood["3"],
      roof: scene.shed.roof,
      door: scene.shed.door,
      trim: scene.shed.trim,
      metal: scene.metal,
      pot: scene.pot,
      soil: scene.soil,
      water: scene.drop,
      stone: scene.pebble,
      barrow: scene["watering-can"],
      leaf: scene.leaf,
      flowers: Object.values(scene.wildflower),
    };
    const random = seeded(29);
    return {
      far: paintedParts([
        ...fenceParts(colors, random),
        ...pathParts(colors, random),
        ...placed(shedParts(colors), SHED_SPOT, facingMiddle(SHED_SPOT)),
        ...placed(barrowParts(colors), BARROW_SPOT, 2.3),
      ]),
      near: paintedParts(placed(pottingParts(colors), POTS_SPOT, 0.5)),
    };
  }, [t, scene]);
  useEffect(
    () => () => {
      props.far.dispose();
      props.near.dispose();
    },
    [props],
  );

  // At night (when the string lights are on) the shed's lamp is lit: its
  // panes glow, skipping tone mapping so they bloom, and its light falls
  // on the grass in front
  const lit = t.scene.lamps;
  const lamp = t.color.light["lamp-glow"];
  const windows = useMemo(() => shedWindows(scene.glass), [scene.glass]);
  useEffect(() => () => windows.dispose(), [windows]);
  const spill = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SPILL_VERTEX,
        fragmentShader: SPILL_FRAGMENT,
        uniforms: {
          uColor: { value: new THREE.Color(lamp) },
          uOpacity: { value: 0.35 },
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [lamp],
  );
  useEffect(() => () => spill.dispose(), [spill]);

  // Instanced meshes get new keys when their counts change, like the grass
  return (
    <group>
      {(
        [
          ["crowns", crown, swaying, planted.crowns],
          ["pines", pine, swaying, planted.pines],
          ["bushes", bush, swaying, planted.bushes],
          ["berries", berry, berrying, planted.berries],
          ["blossoms", blossom, blooming, planted.blossoms],
        ] as const
      ).map(([name, geometry, material, set]) => (
        <instancedMesh
          key={`${name}-${set.count}`}
          args={[geometry, material, set.count]}
          frustumCulled={false}
        >
          <instancedBufferAttribute
            attach="instanceMatrix"
            args={[set.matrices, 16]}
          />
          <instancedBufferAttribute
            attach="instanceColor"
            args={[set.tints, 3]}
          />
        </instancedMesh>
      ))}
      <instancedMesh
        key={`trunks-${planted.trunks.count}`}
        args={[TRUNK, undefined, planted.trunks.count]}
        frustumCulled={false}
      >
        <meshLambertMaterial />
        <instancedBufferAttribute
          attach="instanceMatrix"
          args={[planted.trunks.matrices, 16]}
        />
        <instancedBufferAttribute
          attach="instanceColor"
          args={[planted.trunks.tints, 3]}
        />
      </instancedMesh>

      <group
        position={[SHED_SPOT[0], FLOOR_Y, SHED_SPOT[1]]}
        rotation-y={facingMiddle(SHED_SPOT)}
      >
        <mesh geometry={windows}>
          <meshStandardMaterial
            vertexColors
            roughness={0.2}
            emissive={lamp}
            emissiveIntensity={t.scene.glow * 3 * lit}
            toneMapped={lit === 0}
          />
        </mesh>
        {lit > 0 && (
          <mesh
            material={spill}
            rotation-x={-Math.PI / 2}
            position={[0.4, 0.03, SHED_D / 2 + 1.3]}
          >
            <planeGeometry args={[3.2, 2.6]} />
          </mesh>
        )}
      </group>
      <mesh geometry={props.far}>
        <meshStandardMaterial vertexColors roughness={0.85} />
      </mesh>
      <mesh geometry={props.near} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.85} />
      </mesh>
    </group>
  );
}
