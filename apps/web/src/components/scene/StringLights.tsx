import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { FLOOR_Y, TABLE_BACK, TABLE_HALF_WIDTH } from "./layout";
import { windAt, windUniforms } from "./wind";

//
//
//
// Two garden posts behind the table's back corners, and a string of
// bulbs sagging between them. By day the bulbs are plain glass; at night
// they glow warm and twinkle, and two warm lights under them light the
// table (scene.light.lamp in the tokens; 0 by day)

// The posts: where they stand (x, z), how thick and how high their tops are
const POST_X = TABLE_HALF_WIDTH + 0.35;
const POST_Z = TABLE_BACK - 0.2;
const POST_SIZE = 0.13;
const POST_TOP = 3.1;
// The wire hangs from just under the post tops and sags this far in the
// middle; BULBS hang along it, BULB_DROP below the wire
const WIRE_TOP = POST_TOP - 0.15;
const SAG = 0.85;
const BULBS = 15;
const BULB_DROP = 0.07;
// The two warm lights: below and in front of the wire, halfway in from
// each post, so they light the back pots and the table
const LAMP_SPOTS: [number, number, number][] = [
  [-POST_X / 2, WIRE_TOP - SAG - 0.2, POST_Z + 1.2],
  [POST_X / 2, WIRE_TOP - SAG - 0.2, POST_Z + 1.2],
];

// The wire as a smooth curve: a parabola from post to post, in the swing
// group's own space (its origin is the line between the post tops)
function wireCurve() {
  const points = [...Array(9).keys()].map((i) => {
    const along = i / 8;
    const x = -POST_X + along * POST_X * 2;
    const y = -SAG * 4 * along * (1 - along);
    return new THREE.Vector3(x, y, 0);
  });
  return new THREE.CatmullRomCurve3(points);
}

// Where the bulbs hang, in the world, without the swing: for the moths
export function bulbSpots() {
  const curve = wireCurve();
  return [...Array(BULBS).keys()].map((i) => {
    const point = curve.getPointAt((i + 1) / (BULBS + 1));
    return new THREE.Vector3(point.x, WIRE_TOP + point.y - BULB_DROP, POST_Z);
  });
}

// Each bulb twinkles on its own: the vertex shader gives every instance
// its own slow wave (gl_InstanceID), the fragment shader scales the glow
// by it. Time is the wind's, so it stands still under reduced motion
function twinkle(shader: THREE.WebGLProgramParametersWithUniforms) {
  Object.assign(shader.uniforms, windUniforms);
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      "#include <common>\nuniform float uWindTime;\nvarying float vTwinkle;",
    )
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
float id = float(gl_InstanceID);
vTwinkle = 0.75 + 0.25 * sin(uWindTime * (1.1 + mod(id, 3.0) * 0.4) + id * 2.4);`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", "#include <common>\nvarying float vTwinkle;")
    .replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vTwinkle;",
    );
}

export type LampColors = {
  post: string;
  wire: string;
  bulb: string;
  glow: string;
  light: string;
};

// lit: 0 by day, 1 at night (scene.lamps). glow: the mode's emissive
// strength; lit bulbs skip tone mapping so they bloom.
// The swing group hangs at the post tops and turns around the line
// between them, so the wire's ends stay on the posts while the gusts
// push the string back and forth
export function StringLights({
  colors,
  lit,
  glow,
  lampIntensity,
}: {
  colors: LampColors;
  lit: number;
  glow: number;
  lampIntensity: number;
}) {
  const swing = useRef<THREE.Group>(null);
  const curve = useMemo(() => wireCurve(), []);
  const bulbs = useMemo(() => {
    const matrix = new THREE.Matrix4();
    const out: number[] = [];
    for (let i = 0; i < BULBS; i++) {
      const point = curve.getPointAt((i + 1) / (BULBS + 1));
      matrix.makeTranslation(point.x, point.y - BULB_DROP, 0);
      out.push(...matrix.elements);
    }
    return new Float32Array(out);
  }, [curve]);

  useFrame(({ clock }) => {
    if (!swing.current) return;
    const time = windUniforms.uWindMotion.value ? clock.elapsedTime : 0;
    swing.current.rotation.x = (windAt(0, POST_Z, time) - 0.45) * 0.09;
  });

  return (
    <group>
      {[-POST_X, POST_X].map((x) => (
        <mesh
          key={x}
          position={[x, (FLOOR_Y + POST_TOP) / 2, POST_Z]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[POST_SIZE, POST_TOP - FLOOR_Y, POST_SIZE]} />
          <meshStandardMaterial color={colors.post} roughness={0.85} />
        </mesh>
      ))}

      <group ref={swing} position={[0, WIRE_TOP, POST_Z]}>
        <mesh>
          <tubeGeometry args={[curve, 64, 0.008, 4]} />
          <meshStandardMaterial color={colors.wire} roughness={0.6} />
        </mesh>
        <instancedMesh args={[undefined, undefined, BULBS]}>
          <sphereGeometry args={[0.05, 12, 8]} />
          <meshStandardMaterial
            color={colors.bulb}
            roughness={0.35}
            emissive={colors.glow}
            emissiveIntensity={glow * 2 * lit}
            toneMapped={lit === 0}
            onBeforeCompile={twinkle}
          />
          <instancedBufferAttribute
            attach="instanceMatrix"
            args={[bulbs, 16]}
          />
        </instancedMesh>
      </group>

      {LAMP_SPOTS.map((spot) => (
        <pointLight
          key={spot[0]}
          position={spot}
          color={colors.light}
          intensity={lampIntensity}
          distance={11}
          decay={1.4}
        />
      ))}
    </group>
  );
}
