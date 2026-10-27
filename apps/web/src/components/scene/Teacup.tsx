import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { TEACUP_SPOT } from "./layout";
import { paintedParts } from "./shapes";
import { windUniforms } from "./wind";

//
//
//
// A cup of tea on its saucer on the table's back corner, still steaming:
// two soft wisps rise from it, curling more the higher they get, in
// puffs. Each wisp is a plane turned toward the camera, drawn by its
// shader; the time is the wind's, so it stands still under reduced motion

// The cup's outline, turned around its axis: outside up from the foot to
// the rim, then down the inside. TEA_Y is where the tea's surface lies
const CUP_PROFILE = [
  [0, 0.02],
  [0.07, 0.02],
  [0.08, 0.035],
  [0.12, 0.15],
  [0.128, 0.165],
  [0.118, 0.165],
  [0.108, 0.06],
  [0, 0.05],
].map(([x, y]) => new THREE.Vector2(x, y));
const TEA_Y = 0.145;
const STEAM_HEIGHT = 0.7;
// Bigger than life, like the critters, so it reads beside the big pots
const CUP_SIZE = 1.5;

function cupGeometry(cup: string, tea: string) {
  return paintedParts([
    [new THREE.LatheGeometry(CUP_PROFILE, 24), cup],
    [
      new THREE.CylinderGeometry(0.21, 0.17, 0.02, 28).translate(0, 0.01, 0),
      cup,
    ],
    [
      new THREE.TorusGeometry(0.045, 0.012, 6, 12, Math.PI * 1.3)
        .rotateZ(-Math.PI * 0.65)
        .translate(0.135, 0.095, 0),
      cup,
    ],
    [
      new THREE.CircleGeometry(0.113, 20)
        .rotateX(-Math.PI / 2)
        .translate(0, TEA_Y, 0),
      tea,
    ],
  ]);
}

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
uniform float uWindTime;
uniform float uSeed;
varying vec2 vUv;
void main() {
  float y = vUv.y;
  float curl = sin(y * 7.0 - uWindTime * 1.6 + uSeed) * 0.16 * y;
  float width = 0.1 + 0.22 * y;
  float body = smoothstep(width, 0.0, abs(vUv.x - 0.5 - curl));
  float puffs = 0.55 + 0.45 * sin(y * 11.0 - uWindTime * 2.2 + uSeed * 3.0);
  float fade = smoothstep(0.0, 0.12, y) * (1.0 - y);
  gl_FragColor = vec4(uColor, body * puffs * fade * uOpacity);
  #include <colorspace_fragment>
}
`;

export function Teacup({
  cup,
  tea,
  steam,
  steamOpacity,
}: {
  cup: string;
  tea: string;
  steam: string;
  steamOpacity: number;
}) {
  const [x, z] = TEACUP_SPOT;
  const geometry = useMemo(() => cupGeometry(cup, tea), [cup, tea]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const plane = useMemo(
    () =>
      new THREE.PlaneGeometry(0.4, STEAM_HEIGHT).translate(
        0,
        STEAM_HEIGHT / 2,
        0,
      ),
    [],
  );
  useEffect(() => () => plane.dispose(), [plane]);
  const wisps = useMemo(
    () =>
      [0, 1].map(
        (index) =>
          new THREE.ShaderMaterial({
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            uniforms: {
              uColor: { value: new THREE.Color(steam) },
              uOpacity: { value: steamOpacity },
              uWindTime: windUniforms.uWindTime,
              uSeed: { value: index * 2.7 },
            },
            transparent: true,
            depthWrite: false,
          }),
      ),
    [steam, steamOpacity],
  );
  useEffect(() => () => wisps.forEach((wisp) => wisp.dispose()), [wisps]);

  // The steam turns around its upright axis to face the camera
  const steamGroup = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    const group = steamGroup.current;
    if (!group) return;
    group.rotation.y = Math.atan2(camera.position.x - x, camera.position.z - z);
  });

  return (
    <group position={[x, 0, z]} scale={CUP_SIZE}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.3} />
      </mesh>
      <group ref={steamGroup} position-y={TEA_Y}>
        {wisps.map((wisp, index) => (
          <mesh
            key={index}
            geometry={plane}
            material={wisp}
            position-x={(index - 0.5) * 0.06}
            renderOrder={3}
          />
        ))}
      </group>
    </group>
  );
}
