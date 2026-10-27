import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import { FLOOR_Y, TABLE_BACK, TABLE_FRONT, TABLE_HALF_WIDTH } from "./layout";
import { perches, pointer, seeded } from "./life";
import { WIND_GLSL, windUniforms } from "./wind";

//
//
//
// The floor around the table: earth with moss, tufts of grass, small
// flowers, pebbles and a few mushrooms at the front legs. Everything is
// placed once from a fixed seed, so the garden looks the same on every
// load. Grass and flowers are one draw call each, however many there are

export type GardenColors = {
  floor: string;
  moss: string;
  grassBase: string;
  grassTip: string;
  grassDry: string;
  flowers: string[];
  heart: string;
  pebble: string;
  mushroomCap: string;
  mushroomStem: string;
};

// Where the garden grows, on the floor (x, z): wide to the sides, far
// back, and in front up to under the camera, which sees it when turned
const AREA_X = 15;
const AREA_BACK = -18;
const AREA_FRONT = 14;
// How many tuft places to try; the meadow keeps a share of them
const TUFT_TRIES = 3200;
// The floor plane's size, and the texture painted onto it (pixels a side)
const FLOOR_SIZE = 40;
const FLOOR_TEXTURE = 1024;
// Around the floor the far ground runs on to the horizon, under the fog:
// how far it reaches, and from where the floor fades into it
const FAR_SIZE = 140;
const FAR_FADE = 13;
// The lawn under the meadow is painted coarse, then stretched smooth
const LAWN_TEXTURE = 128;

// One grass blade: a narrow strip, one unit high (each blade scales it to
// its height), tapering to a point, curling forward a little toward the
// tip. Its normals all point up, so blades are lit like the ground they
// stand on instead of flashing dark when they face away from the sun
const BLADE_SEGMENTS = 4;
const BLADE_WIDTH = 0.045;
const BLADE_CURL = 0.12;

function smooth(edge0: number, edge1: number, x: number) {
  return THREE.MathUtils.smoothstep(x, edge0, edge1);
}

// How much meadow grows at (x, z), 0 to 1: almost none under the table,
// thin on the trodden ground around it, then patches of meadow that fade
// out far away (into the fog anyway)
function meadow(x: number, z: number) {
  const outX = Math.max(Math.abs(x) - TABLE_HALF_WIDTH, 0);
  const outZ = Math.max(TABLE_BACK - z, z - TABLE_FRONT, 0);
  const fromTable = Math.hypot(outX, outZ);
  if (fromTable === 0) return 0.06;
  const trodden = smooth(0.3, 2.4, fromTable);
  const patches =
    0.55 +
    0.45 *
      Math.sin(x * 0.55 + Math.sin(z * 0.4) * 1.5) *
      Math.sin(z * 0.47 + x * 0.21);
  const far = 1 - smooth(13, 18, Math.hypot(x, z * 0.9));
  return (0.15 + 0.85 * trodden) * patches * far;
}

type Tuft = { x: number; z: number; size: number };

// The tufts: random places, each kept as often as the meadow there says
function makeTufts(random: () => number) {
  const tufts: Tuft[] = [];
  for (let i = 0; i < TUFT_TRIES; i++) {
    const x = (random() * 2 - 1) * AREA_X;
    const z = AREA_BACK + random() * (AREA_FRONT - AREA_BACK);
    const size = 0.6 + random() * 0.7;
    if (random() < meadow(x, z)) tufts.push({ x, z, size });
  }
  return tufts;
}

function bladeGeometry() {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < BLADE_SEGMENTS; i++) {
    const y = i / BLADE_SEGMENTS;
    const half = (BLADE_WIDTH / 2) * (1 - y);
    const curl = BLADE_CURL * y * y;
    positions.push(-half, y, curl, half, y, curl);
  }
  positions.push(0, 1, BLADE_CURL);
  for (let i = 0; i < BLADE_SEGMENTS - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const last = (BLADE_SEGMENTS - 1) * 2;
  indices.push(last, last + 1, last + 2);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  const normals = positions.map((_, i) => (i % 3 === 1 ? 1 : 0));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}

// How much a butterfly or bee wants one flower in the grass. There are
// many, so each wants little; together they weigh about as much as the
// plants on the table
const FLOWER_PERCH = 0.05;
const PERCH_REACH = 8;

// One small flower, one unit high like a blade: a thin stalk, five petals
// lying flat on top, a round heart. part (0 stalk, 1 petal, 2 heart) tells
// the shader which colour each piece takes; the petals take the flower's
function flowerGeometry() {
  const tag = (geometry: THREE.BufferGeometry, part: number) => {
    const count = geometry.attributes.position.count;
    geometry.setAttribute(
      "part",
      new THREE.Float32BufferAttribute(new Array(count).fill(part), 1),
    );
    geometry.deleteAttribute("uv");
    return geometry.toNonIndexed();
  };

  const stalk = new THREE.PlaneGeometry(0.25, 1).translate(0, 0.5, 0);

  const petals = new THREE.Shape();
  for (let i = 0; i <= 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const x = Math.cos(angle);
    const y = Math.sin(angle);
    if (i === 0) {
      petals.moveTo(x, y);
    } else {
      const before = angle - Math.PI / 5;
      petals.quadraticCurveTo(
        Math.cos(before) * 1.6,
        Math.sin(before) * 1.6,
        x * 0.35,
        y * 0.35,
      );
      petals.lineTo(x, y);
    }
  }
  const head = new THREE.ShapeGeometry(petals, 4)
    .rotateX(-Math.PI / 2)
    .translate(0, 1, 0);
  const heart = new THREE.CircleGeometry(0.35, 10)
    .rotateX(-Math.PI / 2)
    .translate(0, 1.01, 0);

  const merged = mergeGeometries([tag(stalk, 0), tag(head, 1), tag(heart, 2)]);
  const normal = merged.attributes.normal;
  for (let i = 0; i < normal.count; i++) normal.setXYZ(i, 0, 1, 0);
  return merged;
}

// The wind in the grass. In the vertex shader, after the blade is placed
// (instanceMatrix): its root and height come from the matrix, the wind at
// the root pushes it downwind, a flutter shakes it, and the pointer near
// it pushes it away. Each point moves by that times the square of its
// height on the blade, so the root stays put; it sinks a little as it
// bends, so the blade doesn't stretch. The fragment shader colours the
// blade from dark at the root to its own tip colour (instanceColor).
// Flowers use the same bend; their colour comes by part
const SWAY_PARS = /* glsl */ `
${WIND_GLSL}
uniform vec3 uPointer;
uniform float uPointerPush;
attribute float part;
varying float vHeight;
varying float vPart;
`;

const SWAY_VERTEX = /* glsl */ `
vHeight = position.y;
#ifdef FLOWER
  vPart = part;
#endif
vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
vec2 root = instanceMatrix[3].xz;
float height = length(instanceMatrix[1].xyz);
float wind = windAt(root, uWindTime);
float flutter = sin(uWindTime * 2.7 + root.x * 1.7 + root.y * 1.3) * 0.6
  + sin(uWindTime * 4.3 + root.x * 3.1) * 0.25;
vec2 sway = WIND_DIR * (wind * 0.22 + flutter * 0.05)
  + vec2(-WIND_DIR.y, WIND_DIR.x) * flutter * 0.06;
vec2 away = root - uPointer.xz;
float near = 1.0 - smoothstep(0.0, 1.2, length(away));
sway += normalize(away + 0.0001) * near * uPointerPush * 0.8;
vec2 offset = sway * height * position.y * position.y * uWindMotion;
mvPosition.xz += offset;
mvPosition.y -= dot(offset, offset) * 0.5 / max(height, 0.01);
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
`;

const COLOR_PARS = /* glsl */ `
uniform vec3 uGrassBase;
uniform vec3 uHeart;
varying float vHeight;
varying float vPart;
`;

const COLOR_FRAGMENT = /* glsl */ `
#ifdef FLOWER
  diffuseColor.rgb = vPart < 0.5 ? uGrassBase * 1.3
    : vPart < 1.5 ? vColor.rgb : uHeart;
#else
  diffuseColor.rgb = mix(uGrassBase, vColor.rgb, vHeight) * (0.75 + 0.25 * vHeight);
#endif
`;

// A double-sided Lambert material (cheaper than standard, and grass
// needs no shine) with the sway and colour above. A double-sided material
// turns the normal round on the back face, which would light a blade's
// back like the underside of the ground; both faces keep the up normal.
// The uniforms are the material's own, so the colours can change with the
// mode; the program key keeps grass and flowers apart
function windyMaterial(flower: boolean) {
  const uniforms = {
    uGrassBase: { value: new THREE.Color() },
    uHeart: { value: new THREE.Color() },
    uPointer: { value: pointer.floor },
    uPointerPush: pointer.presence,
  };
  const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  if (flower) material.defines = { FLOWER: "" };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, windUniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${SWAY_PARS}`)
      .replace("#include <project_vertex>", SWAY_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${COLOR_PARS}`)
      .replace("#include <color_fragment>", COLOR_FRAGMENT)
      .replace(
        "#include <normal_fragment_begin>",
        "#include <normal_fragment_begin>\nnormal = normalize(vNormal);",
      );
  };
  material.customProgramCacheKey = () => (flower ? "flower" : "grass");
  return { material, uniforms };
}

// The blades of every tuft as instance matrices and tip colours. A tuft's
// blades stand around its middle, the middle ones taller, each leaning out
// a little and turned its own way. Most tips are green, some dry
function grassInstances(
  tufts: Tuft[],
  random: () => number,
  colors: GardenColors,
) {
  const tip = new THREE.Color(colors.grassTip);
  const dry = new THREE.Color(colors.grassDry);
  const matrices: number[] = [];
  const tints: number[] = [];
  const matrix = new THREE.Matrix4();
  const place = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const lean = new THREE.Quaternion();
  const axis = new THREE.Vector3();
  const size = new THREE.Vector3();
  const tint = new THREE.Color();

  for (const tuft of tufts) {
    const blades = 12 + Math.floor(random() * 16);
    const radius = 0.28 * tuft.size;
    for (let b = 0; b < blades; b++) {
      const angle = random() * Math.PI * 2;
      const out = Math.sqrt(random());
      place.set(
        tuft.x + Math.cos(angle) * out * radius,
        FLOOR_Y,
        tuft.z + Math.sin(angle) * out * radius,
      );
      axis.set(Math.sin(angle), 0, -Math.cos(angle));
      lean.setFromAxisAngle(axis, 0.1 + out * 0.35 + random() * 0.1);
      turn.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, random() * Math.PI);
      const height = (0.3 + random() * 0.45) * tuft.size * (1 - 0.35 * out);
      const width = 0.8 + random() * 0.6;
      size.set(width, height, width);
      matrix.compose(place, lean.multiply(turn), size);
      matrices.push(...matrix.elements);

      tint.copy(tip).lerp(dry, random() < 0.15 ? 0.8 : random() * 0.2);
      tint.offsetHSL((random() - 0.5) * 0.04, 0, (random() - 0.5) * 0.08);
      tints.push(tint.r, tint.g, tint.b);
    }
  }
  return {
    matrices: new Float32Array(matrices),
    tints: new Float32Array(tints),
  };
}

// Flowers stand in some tufts, a little above the grass, in the four
// flower colours. Each is a perch for the butterflies and the bee
function flowerInstances(
  tufts: Tuft[],
  random: () => number,
  colors: GardenColors,
) {
  const matrices: number[] = [];
  const tints: number[] = [];
  const spots: THREE.Vector3[] = [];
  const matrix = new THREE.Matrix4();
  const tint = new THREE.Color();
  for (const tuft of tufts) {
    if (random() > 0.2) continue;
    const count = 1 + Math.floor(random() * 2);
    for (let f = 0; f < count; f++) {
      const x = tuft.x + (random() - 0.5) * 0.5;
      const z = tuft.z + (random() - 0.5) * 0.5;
      const height = (0.35 + random() * 0.35) * tuft.size;
      const head = 0.05 + random() * 0.035;
      matrix.makeRotationY(random() * Math.PI * 2);
      matrix.scale(new THREE.Vector3(head, height, head));
      matrix.setPosition(x, FLOOR_Y, z);
      matrices.push(...matrix.elements);
      tint.set(colors.flowers[Math.floor(random() * colors.flowers.length)]);
      tints.push(tint.r, tint.g, tint.b);
      spots.push(new THREE.Vector3(x, FLOOR_Y + height, z));
    }
  }
  return {
    matrices: new Float32Array(matrices),
    tints: new Float32Array(tints),
    spots,
  };
}

// Pebbles on the trodden ground near the table, and the mushrooms: a few
// at each front leg's foot (the back legs hide under the table) and a
// ring in the meadow. [x, z, size] each
function pebbleSpots(random: () => number) {
  const spots: [number, number, number][] = [];
  while (spots.length < 70) {
    const x = (random() * 2 - 1) * 8;
    const z = -9 + random() * 14;
    const outX = Math.max(Math.abs(x) - TABLE_HALF_WIDTH, 0);
    const outZ = Math.max(TABLE_BACK - z, z - TABLE_FRONT, 0);
    const from = Math.hypot(outX, outZ);
    if (from > 0.1 && from < 3 && random() > from / 3) {
      spots.push([x, z, 0.04 + random() * 0.07]);
    }
  }
  return spots;
}

const MUSHROOMS: [number, number, number][] = [
  [-3.85, 3.25, 0.13],
  [-3.62, 3.4, 0.09],
  [-3.95, 3.02, 0.07],
  [3.78, 3.3, 0.11],
  [3.95, 3.1, 0.075],
  [-6.4, -0.8, 0.12],
  [-6.15, -0.45, 0.08],
  [-6.7, -0.4, 0.1],
  [6.9, -6.5, 0.14],
  [6.6, -6.9, 0.09],
];

// The floor's paint: the floor colour, specks of darker and lighter earth,
// and soft moss where the tufts grow, so no tuft stands on bare sand
function floorTexture(tufts: Tuft[], colors: GardenColors, far: THREE.Color) {
  const canvas = document.createElement("canvas");
  canvas.width = FLOOR_TEXTURE;
  canvas.height = FLOOR_TEXTURE;
  const paint = canvas.getContext("2d");
  if (!paint) return null;
  const perUnit = FLOOR_TEXTURE / FLOOR_SIZE;
  const toPixel = (x: number, z: number): [number, number] => [
    (x + FLOOR_SIZE / 2) * perUnit,
    (z + FLOOR_SIZE / 2) * perUnit,
  ];

  paint.fillStyle = colors.floor;
  paint.fillRect(0, 0, FLOOR_TEXTURE, FLOOR_TEXTURE);

  const random = seeded(11);
  for (let i = 0; i < 9000; i++) {
    paint.globalAlpha = 0.05 + random() * 0.08;
    paint.fillStyle = random() < 0.6 ? "black" : "white";
    const size = 1 + random() * 3;
    paint.fillRect(
      random() * FLOOR_TEXTURE,
      random() * FLOOR_TEXTURE,
      size,
      size,
    );
  }

  // The lawn: the meadow's share at each spot as moss, painted on a small
  // canvas and stretched smoothly over the floor, so the meadow's patches
  // read as green ground and the trodden earth stays bare. No tufts (the
  // garden doesn't grow): no lawn either
  const moss = new THREE.Color(colors.moss);
  const [r, g, b] = [moss.r, moss.g, moss.b].map((c) => Math.round(c * 255));
  const lawn = document.createElement("canvas");
  lawn.width = LAWN_TEXTURE;
  lawn.height = LAWN_TEXTURE;
  const lawnPaint = lawn.getContext("2d");
  if (lawnPaint && tufts.length > 0) {
    const pixels = lawnPaint.createImageData(LAWN_TEXTURE, LAWN_TEXTURE);
    for (let i = 0; i < LAWN_TEXTURE * LAWN_TEXTURE; i++) {
      const x = ((i % LAWN_TEXTURE) + 0.5) / LAWN_TEXTURE;
      const z = (Math.floor(i / LAWN_TEXTURE) + 0.5) / LAWN_TEXTURE;
      const share = meadow((x - 0.5) * FLOOR_SIZE, (z - 0.5) * FLOOR_SIZE);
      pixels.data.set([r, g, b, Math.min(255, share * 230)], i * 4);
    }
    lawnPaint.putImageData(pixels, 0, 0);
    paint.globalAlpha = 1;
    paint.imageSmoothingEnabled = true;
    paint.drawImage(lawn, 0, 0, FLOOR_TEXTURE, FLOOR_TEXTURE);
  }

  const rgb = `${r}, ${g}, ${b}`;
  paint.globalAlpha = 1;
  for (const tuft of tufts) {
    const [px, py] = toPixel(tuft.x, tuft.z);
    const radius = (0.35 + tuft.size * 0.5) * perUnit;
    const glow = paint.createRadialGradient(px, py, 0, px, py, radius);
    glow.addColorStop(0, `rgba(${rgb}, 0.55)`);
    glow.addColorStop(1, `rgba(${rgb}, 0)`);
    paint.fillStyle = glow;
    paint.fillRect(px - radius, py - radius, radius * 2, radius * 2);
  }

  // Toward its edge the floor turns into the far ground's colour, so it
  // runs on into the far ground without a seam
  const middle = FLOOR_TEXTURE / 2;
  const fade = paint.createRadialGradient(
    middle,
    middle,
    FAR_FADE * perUnit,
    middle,
    middle,
    (FLOOR_SIZE / 2) * perUnit,
  );
  fade.addColorStop(0, `#${far.getHexString()}00`);
  fade.addColorStop(1, `#${far.getHexString()}`);
  paint.fillStyle = fade;
  paint.fillRect(0, 0, FLOOR_TEXTURE, FLOOR_TEXTURE);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// The garden. Built once (the tufts never move); the colours rebuild only
// the tints and the floor's paint. The shared wind and pointer uniforms
// move grass and flowers.
// grow false (low power, or switched off in the settings): only the bare
// floor, no grass, flowers, pebbles or mushrooms
export function Garden({
  colors,
  grow,
}: {
  colors: GardenColors;
  grow: boolean;
}) {
  const tufts = useMemo(() => (grow ? makeTufts(seeded(3)) : []), [grow]);
  const blade = useMemo(() => bladeGeometry(), []);
  const flower = useMemo(() => flowerGeometry(), []);
  const grassLook = useMemo(() => windyMaterial(false), []);
  const flowerLook = useMemo(() => windyMaterial(true), []);

  const grass = useMemo(
    () => grassInstances(tufts, seeded(5), colors),
    [tufts, colors],
  );
  const flowers = useMemo(
    () => flowerInstances(tufts, seeded(9), colors),
    [tufts, colors],
  );
  // The far ground: earth with some moss in it, only earth without the
  // garden
  const far = useMemo(
    () =>
      new THREE.Color(colors.floor).lerp(
        new THREE.Color(colors.moss),
        grow ? 0.5 : 0,
      ),
    [colors, grow],
  );
  const floorMap = useMemo(
    () => floorTexture(tufts, colors, far),
    [tufts, colors, far],
  );
  const pebbles = useMemo(() => pebbleSpots(seeded(13)), []);

  useEffect(() => {
    for (const { uniforms } of [grassLook, flowerLook]) {
      uniforms.uGrassBase.value.set(colors.grassBase);
      uniforms.uHeart.value.set(colors.heart);
    }
  }, [grassLook, flowerLook, colors]);

  // The flowers are perches while the garden is there; only those the
  // insects reach (the far ones fade into the fog anyway)
  useEffect(() => {
    const keys = flowers.spots.flatMap((spot, index) => {
      if (Math.abs(spot.x) > PERCH_REACH || spot.z < -PERCH_REACH) return [];
      const key = `flower-${index}`;
      perches.set(key, { position: spot, weight: FLOWER_PERCH });
      return [key];
    });
    return () => keys.forEach((key) => perches.delete(key));
  }, [flowers]);

  useEffect(
    () => () => {
      blade.dispose();
      flower.dispose();
      grassLook.material.dispose();
      flowerLook.material.dispose();
    },
    [blade, flower, grassLook, flowerLook],
  );
  useEffect(() => () => floorMap?.dispose(), [floorMap]);

  // The floor receives the shadows; grass and flowers only take them (the
  // blades would cost a lot in the shadow map for shadows no one sees).
  // No frustum culling for them: their bounds don't know about the wind
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={FLOOR_Y} receiveShadow>
        <planeGeometry args={[FLOOR_SIZE, FLOOR_SIZE]} />
        <meshStandardMaterial
          color={floorMap ? "#ffffff" : colors.floor}
          map={floorMap}
          roughness={1}
        />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={FLOOR_Y - 0.02}>
        <circleGeometry args={[FAR_SIZE, 48]} />
        <meshStandardMaterial color={far} roughness={1} />
      </mesh>

      {grow && (
        <>
          <instancedMesh
            key={`grass-${grass.tints.length}`}
            args={[blade, grassLook.material, grass.tints.length / 3]}
            receiveShadow
            frustumCulled={false}
          >
            <instancedBufferAttribute
              attach="instanceMatrix"
              args={[grass.matrices, 16]}
            />
            <instancedBufferAttribute
              attach="instanceColor"
              args={[grass.tints, 3]}
            />
          </instancedMesh>

          <instancedMesh
            key={`flowers-${flowers.tints.length}`}
            args={[flower, flowerLook.material, flowers.tints.length / 3]}
            receiveShadow
            frustumCulled={false}
          >
            <instancedBufferAttribute
              attach="instanceMatrix"
              args={[flowers.matrices, 16]}
            />
            <instancedBufferAttribute
              attach="instanceColor"
              args={[flowers.tints, 3]}
            />
          </instancedMesh>

          <Pebbles spots={pebbles} color={colors.pebble} />
          <Mushrooms cap={colors.mushroomCap} stem={colors.mushroomStem} />
        </>
      )}
    </group>
  );
}

// Pebbles: flattened, faceted lumps, each turned and squashed its own way
function Pebbles({
  spots,
  color,
}: {
  spots: [number, number, number][];
  color: string;
}) {
  const matrices = useMemo(() => {
    const random = seeded(17);
    const matrix = new THREE.Matrix4();
    const out: number[] = [];
    for (const [x, z, size] of spots) {
      matrix.makeRotationY(random() * Math.PI * 2);
      matrix.scale(
        new THREE.Vector3(size * (1 + random() * 0.6), size * 0.55, size),
      );
      matrix.setPosition(x, FLOOR_Y + size * 0.2, z);
      out.push(...matrix.elements);
    }
    return new Float32Array(out);
  }, [spots]);

  return (
    <instancedMesh
      args={[undefined, undefined, spots.length]}
      castShadow
      receiveShadow
    >
      <icosahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color={color} roughness={0.9} flatShading />
      <instancedBufferAttribute attach="instanceMatrix" args={[matrices, 16]} />
    </instancedMesh>
  );
}

// Mushrooms: a pale stem and a round cap, scaled by their size
function Mushrooms({ cap, stem }: { cap: string; stem: string }) {
  const { caps, stems } = useMemo(() => {
    const matrix = new THREE.Matrix4();
    const turn = new THREE.Quaternion();
    const caps: number[] = [];
    const stems: number[] = [];
    MUSHROOMS.forEach(([x, z, size], index) => {
      const tilt = ((index % 3) - 1) * 0.15;
      turn.setFromEuler(new THREE.Euler(tilt, 0, tilt * 0.7));
      const height = size * 1.4;
      matrix.compose(
        new THREE.Vector3(x, FLOOR_Y + height / 2, z),
        turn,
        new THREE.Vector3(size * 0.35, height, size * 0.35),
      );
      stems.push(...matrix.elements);
      matrix.compose(
        new THREE.Vector3(x, FLOOR_Y + height, z),
        turn,
        new THREE.Vector3(size, size * 0.65, size),
      );
      caps.push(...matrix.elements);
    });
    return { caps: new Float32Array(caps), stems: new Float32Array(stems) };
  }, []);

  return (
    <group>
      <instancedMesh
        args={[undefined, undefined, MUSHROOMS.length]}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[0.85, 1, 1, 8]} />
        <meshStandardMaterial color={stem} roughness={0.8} />
        <instancedBufferAttribute attach="instanceMatrix" args={[stems, 16]} />
      </instancedMesh>
      <instancedMesh
        args={[undefined, undefined, MUSHROOMS.length]}
        castShadow
        receiveShadow
      >
        <sphereGeometry args={[1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={cap} roughness={0.55} />
        <instancedBufferAttribute attach="instanceMatrix" args={[caps, 16]} />
      </instancedMesh>
    </group>
  );
}
