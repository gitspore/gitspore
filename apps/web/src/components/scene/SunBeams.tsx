import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { windUniforms } from "./wind";

//
//
//
// Soft shafts of light falling across the table from the key light (sun by
// day, moon at night): long glowing strips, added onto what's behind them,
// fading out at their edges and ends. Each turns around its own length to
// face the camera, so it never shows as a thin line. Their strength
// breathes slowly, like light through moving leaves

// Where the light comes from (the key light's position in Scene); the
// beams run along this direction
const SUN = new THREE.Vector3(-6, 10, 6).normalize();
// Each beam: where it meets the table (x, z), how wide, how long
const BEAMS: [number, number, number, number][] = [
  [-2.9, -0.6, 0.9, 9],
  [-0.4, -1.8, 0.55, 10],
  [1.4, 0.4, 1.2, 9],
  [3.3, -1.2, 0.7, 10],
];

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
uniform float uSeed;
varying vec2 vUv;
void main() {
  float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
  float along = smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.45, vUv.y);
  float breathe = 0.7 + 0.3 * sin(uTime * 0.25 + uSeed * 4.0)
    * sin(uTime * 0.17 + uSeed * 2.0);
  float alpha = smoothstep(0.0, 0.8, across) * along * breathe * uOpacity;
  gl_FragColor = vec4(uColor * alpha, 1.0);
  #include <colorspace_fragment>
}
`;

// One material per beam (its own seed), the same plane for all. Colour
// and opacity come from the mode: warm sun by day, pale moon at night;
// a new mode makes new materials
export function SunBeams({
  color,
  opacity,
}: {
  color: string;
  opacity: number;
}) {
  const plane = useMemo(
    () => new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0),
    [],
  );
  const materials = useMemo(
    () =>
      BEAMS.map(
        (_, index) =>
          new THREE.ShaderMaterial({
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            uniforms: {
              uColor: { value: new THREE.Color(color) },
              uOpacity: { value: opacity },
              uTime: windUniforms.uWindTime,
              uSeed: { value: index * 1.7 },
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            fog: false,
          }),
      ),
    [color, opacity],
  );
  const meshes = useRef<(THREE.Mesh | null)[]>([]);

  useEffect(() => () => plane.dispose(), [plane]);
  useEffect(
    () => () => materials.forEach((material) => material.dispose()),
    [materials],
  );

  // Turn each beam around its length toward the camera: its y axis runs
  // along the light, its z axis (the plane's face) points as straight at
  // the camera as that allows
  const toCamera = useMemo(() => new THREE.Vector3(), []);
  const across = useMemo(() => new THREE.Vector3(), []);
  const basis = useMemo(() => new THREE.Matrix4(), []);
  useFrame(({ camera }) => {
    meshes.current.forEach((mesh) => {
      if (!mesh) return;
      toCamera.subVectors(camera.position, mesh.position);
      toCamera.addScaledVector(SUN, -toCamera.dot(SUN)).normalize();
      across.crossVectors(SUN, toCamera);
      basis.makeBasis(across, SUN, toCamera);
      mesh.quaternion.setFromRotationMatrix(basis);
    });
  });

  return BEAMS.map(([x, z, width, length], index) => (
    <mesh
      key={index}
      ref={(mesh) => {
        meshes.current[index] = mesh;
      }}
      geometry={plane}
      material={materials[index]}
      position={[x, 0, z]}
      scale={[width, length, 1]}
      frustumCulled={false}
      renderOrder={2}
    />
  ));
}
