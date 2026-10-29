import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

//
//
//
// Where the ring lies: on the pot's rim top (POT_PROFILE's 0.64–0.74 at
// y 1.1), and how fast it pulses (the prototype's 1.1 s)
export const RING_RADIUS = 0.69;
export const RING_TUBE = 0.035;
const RING_Y = 1.1;
const PULSE_SECONDS = 1.1;
// One lap of the clean-up glow, and how wide its bright arc is (radians)
const SPIN_SECONDS = 1.4;
const ARC_WIDTH = Math.PI / 2;
const ARC_FLOOR = 0.15;

// The glowing ring on a pot's rim.
// It gives off its own colour and skips
// tone mapping, so it blooms at night.
// useFrame sets the brightness on the
// material every frame, without a re-render:
// a wave between 0.3 and 1 of
// glow while it pulses, glow itself otherwise
export function StatusRing({
  geometry,
  color,
  glow,
  pulse,
  spin = false,
}: {
  geometry: THREE.BufferGeometry;
  color: string;
  glow: number;
  pulse: boolean;
  // A bright arc circling the rim (the clean-up); a steady ring
  // when the caller leaves it off for reduced motion
  spin?: boolean;
}) {
  const material = useRef<THREE.MeshStandardMaterial>(null);
  const uniform = useRef({ value: 0 });

  useFrame(({ clock }) => {
    if (!material.current) {
      return;
    }
    uniform.current.value =
      ((clock.elapsedTime * Math.PI * 2) / SPIN_SECONDS) % (Math.PI * 2);
    const wave =
      (Math.sin((clock.elapsedTime * Math.PI * 2) / PULSE_SECONDS) + 1) / 2;
    material.current.emissiveIntensity = pulse
      ? glow * (0.3 + 0.7 * wave)
      : glow;
  });

  return (
    <mesh geometry={geometry} rotation-x={Math.PI / 2} position-y={RING_Y}>
      <meshStandardMaterial
        ref={material}
        color={color}
        emissive={color}
        toneMapped={false}
        onBeforeCompile={
          spin ? (shader) => addArc(shader, uniform.current) : undefined
        }
        customProgramCacheKey={() => (spin ? "ring-arc" : "ring")}
      />
    </mesh>
  );
}

// The ring is a torus lying in the XY plane (rotated up by the mesh): the angle
// round it is atan(y, x) of the object position. The fragment's emission is
// scaled by how near that angle is behind the arc's head: full at the head,
// ARC_FLOOR once the tail has passed.
function addArc(
  shader: THREE.WebGLProgramParametersWithUniforms,
  angle: { value: number },
) {
  shader.uniforms.uArcAngle = angle;
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      `#include <common>
      varying vec3 vRingPos;`,
    )
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vRingPos = position;`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      `#include <common>
      varying vec3 vRingPos;
      uniform float uArcAngle;`,
    )
    .replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      float behind = mod(uArcAngle - atan(vRingPos.y, vRingPos.x), 6.2831853);
      float arc = 1.0 - smoothstep(0.0, ${ARC_WIDTH.toFixed(4)}, behind);
      totalEmissiveRadiance *= ${ARC_FLOOR.toFixed(2)} + ${(1 - ARC_FLOOR).toFixed(2)} * arc;`,
    );
}
