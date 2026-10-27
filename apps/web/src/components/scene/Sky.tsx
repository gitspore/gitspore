import { useEffect, useMemo } from "react";
import * as THREE from "three";

import type { Mode, tokens } from "@/theme/tokens";

import { WIND_DIR, windUniforms } from "./wind";

//
//
//
// The sky around the garden, so the meadow doesn't end in a flat colour:
// a gradient from the horizon up, clouds drifting with the wind by day,
// stars and the moon at night, and on the horizon a ring of far hills
// with a row of trees in front, both fading into the haze toward their
// feet. All of it is one big sphere seen from inside and drawn by its
// shader, one draw call and no textures; it is drawn first and never
// writes depth, so everything else simply covers it

const RADIUS = 150;
// Where the moon stands (back right, a little up) and how big it shows
// (the cosine of its radius, about 2°)
const MOON = new THREE.Vector3(0.5, 0.3, -0.8).normalize();
const MOON_SIZE = Math.cos(THREE.MathUtils.degToRad(2));

const VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// e: how high the point is over the horizon (0 on it, 1 straight up);
// a: its direction around the horizon. The hills and trees are heights
// over a: waves with whole numbers of turns, so the ring closes
const FRAGMENT = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uHaze;
uniform vec3 uHillFar;
uniform vec3 uHillNear;
uniform vec3 uCloud;
uniform vec3 uMoon;
uniform vec3 uStar;
uniform vec3 uMoonDir;
uniform vec2 uWindDir;
uniform float uMoonSize;
uniform float uClouds;
uniform float uStars;
uniform float uWindTime;
varying vec3 vDir;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float hash(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}
float fbm(vec2 p) {
  float sum = 0.0;
  float weight = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += weight * noise(p);
    p = p * 2.03 + 17.0;
    weight *= 0.5;
  }
  return sum;
}

float hills(float a) {
  return 0.05 + 0.03 * sin(a * 2.0 + 1.3) + 0.018 * sin(a * 5.0 + 0.4)
    + 0.008 * sin(a * 11.0 + 2.0);
}
float trees(float a) {
  float big = sqrt(abs(sin(a * 46.0 + sin(a * 7.0) * 1.5)));
  float small = sqrt(abs(sin(a * 83.0 + sin(a * 5.0) * 2.0)));
  float crowns = max(big * (0.6 + 0.4 * sin(a * 9.0)), small * 0.55);
  return 0.012 + 0.01 * sin(a * 3.0 + 4.0) + 0.016 * crowns;
}

void main() {
  vec3 dir = normalize(vDir);
  float e = dir.y;
  float a = atan(dir.z, dir.x);
  float edge = fwidth(e) * 1.2;

  vec3 sky = mix(uHorizon, uTop, smoothstep(0.02, 0.3, e));
  sky = mix(sky, uHaze, (1.0 - smoothstep(0.0, 0.06, e)) * 0.5);

  // Clouds: noise on a flat ceiling over the garden, thinning toward the
  // horizon, drifting downwind
  float cover = 0.0;
  if (uClouds > 0.0 && e > 0.0) {
    vec2 p = dir.xz / (e + 0.25) * 2.0 + uWindDir * uWindTime * 0.03;
    float n = fbm(p);
    cover = smoothstep(0.5, 0.75, n) * smoothstep(0.03, 0.12, e) * uClouds;
    vec3 cloud = uCloud * (0.86 + 0.14 * smoothstep(0.55, 0.85, n));
    sky = mix(sky, cloud, cover);
  }

  // Stars: one in a few cells of a grid around the sky, each twinkling at
  // its own pace; the moon a soft-edged disc with a faint glow, a little
  // mottled. Clouds hide both
  if (uStars > 0.0) {
    vec3 p = dir * 260.0;
    vec3 cell = floor(p);
    float h = hash(cell);
    if (h > 0.965) {
      vec3 spot = cell + 0.5
        + (vec3(hash(cell + 1.3), hash(cell + 2.7), hash(cell + 4.1)) - 0.5) * 0.6;
      float twinkle = 0.6 + 0.4 * sin(uWindTime * (1.0 + h * 3.0) + h * 80.0);
      float bright = 0.35 + 0.65 * fract(h * 37.0);
      float star = smoothstep(0.24, 0.0, length(p - spot)) * twinkle * bright;
      sky += uStar * star * smoothstep(0.02, 0.15, e) * (1.0 - cover) * uStars;
    }
    float m = dot(dir, uMoonDir);
    float disc = smoothstep(uMoonSize, uMoonSize + 0.00004, m);
    float mottle = 0.86 + 0.14 * noise(dir.xy * 900.0);
    float halo = pow(max(m, 0.0), 300.0) * 0.3 + pow(max(m, 0.0), 30.0) * 0.06;
    sky = mix(sky, uMoon * mottle, disc * uStars * (1.0 - cover * 0.7));
    sky += uMoon * halo * uStars * (1.0 - cover * 0.5);
  }

  // The far hills, then the trees in front, darker toward the top and
  // fading into the haze toward their feet
  float far = hills(a);
  float near = trees(a);
  vec3 farColor = mix(uHillFar, uHaze, smoothstep(far, -0.05, e) * 0.75);
  vec3 nearColor = mix(uHillNear, uHaze, smoothstep(near, -0.05, e) * 0.6);
  sky = mix(sky, farColor, 1.0 - smoothstep(far - edge, far + edge, e));
  sky = mix(sky, nearColor, 1.0 - smoothstep(near - edge, near + edge, e));

  // Under the horizon only haze, where the fogged ground meets the sky
  sky = mix(sky, uHaze, smoothstep(-0.01, -0.06, e));

  gl_FragColor = vec4(sky, 1.0);
  #include <colorspace_fragment>
}
`;

type ModeTokens = (typeof tokens)[Mode];

// The material is new with the mode (its colours); the time is the
// wind's, so clouds and stars stand still under reduced motion
export function Sky({ t }: { t: ModeTokens }) {
  const scene = t.color.scene;
  const geometry = useMemo(() => new THREE.SphereGeometry(RADIUS, 48, 24), []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const material = useMemo(() => {
    const color = (value: string) => ({ value: new THREE.Color(value) });
    return new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uTop: color(scene["sky-top"]),
        uHorizon: color(scene["sky-horizon"]),
        uHaze: color(scene.fog),
        uHillFar: color(scene["hill-far"]),
        uHillNear: color(scene["hill-near"]),
        uCloud: color(scene.cloud),
        uMoon: color(scene.moon),
        uStar: color(scene.star),
        uMoonDir: { value: MOON },
        uMoonSize: { value: MOON_SIZE },
        uWindDir: { value: WIND_DIR },
        uClouds: { value: t.scene.clouds },
        uStars: { value: t.scene.stars },
        uWindTime: windUniforms.uWindTime,
      },
      side: THREE.BackSide,
      depthWrite: false,
    });
  }, [scene, t.scene.clouds, t.scene.stars]);
  useEffect(() => () => material.dispose(), [material]);

  return (
    <mesh
      geometry={geometry}
      material={material}
      renderOrder={-1}
      frustumCulled={false}
    />
  );
}
