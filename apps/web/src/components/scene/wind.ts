import * as THREE from "three";

//
//
//
// The wind over the garden, one for grass, flowers, plants and the string
// lights: a breeze that swells and eases, and every few seconds a gust
// rolling across the scene from the back left to the front right. The grass
// left of the table bends first, the pots a moment later.
// windAt is the maths for the CPU (a handful of plants), WIND_GLSL the same
// for the shaders (thousands of grass blades). Change both together.

// Where the wind blows to on the floor (x, z), a unit vector: mostly
// sideways, so the sway reads from the camera
export const WIND_DIR = new THREE.Vector2(0.86, 0.51);

// A gust every 1 / GUST_RATE seconds (about 9), rolling GUST_RATE /
// GUST_SPREAD units a second (about 3) across the floor
const GUST_RATE = 0.11;
const GUST_SPREAD = 0.035;

// Shared by every wind shader and read by the plants each frame. Wind
// (in Scene) sets both once per frame:
// - time: the seconds the wind has blown
// - motion: 1, or 0 under prefers-reduced-motion, which stills it all
export const windUniforms = {
  uWindTime: { value: 0 },
  uWindMotion: { value: 1 },
};

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

// How hard the wind blows at (x, z): about 0.25 to 0.65 between gusts,
// up to about 2 in a strong gust. Each gust has its own strength
// (gustSize), so they don't all look the same
export function windAt(x: number, z: number, time: number) {
  const along = x * WIND_DIR.x + z * WIND_DIR.y;
  const breeze = 0.45 + 0.2 * Math.sin(time * 0.6 - along * 0.35);
  const wave = time * GUST_RATE - along * GUST_SPREAD;
  const phase = wave - Math.floor(wave);
  const gustSize = 0.6 + 0.4 * Math.sin(Math.floor(wave) * 2.3);
  const gust = smoothstep(0, 0.12, phase) * (1 - smoothstep(0.12, 0.42, phase));
  return breeze + 1.3 * gust * gustSize;
}

// windAt for the shaders, with the uniforms above. A wind shader adds
// `...windUniforms` to its uniforms and this text before its main()
export const WIND_GLSL = /* glsl */ `
uniform float uWindTime;
uniform float uWindMotion;
const vec2 WIND_DIR = vec2(${WIND_DIR.x}, ${WIND_DIR.y});

float windAt(vec2 p, float time) {
  float along = dot(p, WIND_DIR);
  float breeze = 0.45 + 0.2 * sin(time * 0.6 - along * 0.35);
  float wave = time * ${GUST_RATE} - along * ${GUST_SPREAD};
  float phase = fract(wave);
  float gustSize = 0.6 + 0.4 * sin(floor(wave) * 2.3);
  float gust = smoothstep(0.0, 0.12, phase) * (1.0 - smoothstep(0.12, 0.42, phase));
  return breeze + 1.3 * gust * gustSize;
}
`;
