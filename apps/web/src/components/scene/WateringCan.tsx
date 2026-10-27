import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

//
//
//
// A small watering can floating beside a working agent's plant (the
// prototype's sign for "working"): it bobs, now and then tips forward and
// sprinkles drops onto the soil, then rights itself again. Each pot's can
// keeps its own rhythm (slot)

// Where it floats, relative to the pot's foot, and how it tips: upright
// it leans a little toward the plant, pouring a lot more
const SPOT: [number, number, number] = [0.66, 1.78, 0.18];
const REST_TILT = 0.2;
const POUR_TILT = 0.75;
// One round: hover, tip forward, pour, tip back (seconds)
const ROUND = 7;
const TIP_SECONDS = 0.6;
const POUR_SECONDS = 2.4;
// Drops: how many fall at once, and how fast
const DROPS = 9;
const FALL_SPEED = 1.7;

// The can in one geometry, for one draw call: a body, a long spout
// pointing to -x (toward the plant) with a rose at its end, a handle
function canGeometry() {
  const body = new THREE.CylinderGeometry(0.17, 0.19, 0.26, 20);
  const spout = new THREE.CylinderGeometry(0.02, 0.035, 0.42, 8)
    .rotateZ(1.0)
    .translate(-0.25, 0.06, 0);
  const rose = new THREE.CylinderGeometry(0.055, 0.025, 0.05, 12)
    .rotateZ(1.0)
    .translate(-0.44, 0.17, 0);
  const handle = new THREE.TorusGeometry(0.11, 0.018, 6, 16, Math.PI)
    .rotateZ(-0.25)
    .translate(0.06, 0.12, 0);
  return mergeGeometries([body, spout, rose, handle]);
}

// How far into its pour the can is, 0 (upright) to 1 (tipped), at time,
// for a round starting at offset
function pourAt(time: number, offset: number) {
  const t = (time + offset) % ROUND;
  const start = ROUND - POUR_SECONDS - 2 * TIP_SECONDS;
  if (t < start) return 0;
  const into = t - start;
  if (into < TIP_SECONDS)
    return THREE.MathUtils.smoothstep(into, 0, TIP_SECONDS);
  if (into < TIP_SECONDS + POUR_SECONDS) return 1;
  return (
    1 -
    THREE.MathUtils.smoothstep(
      into - TIP_SECONDS - POUR_SECONDS,
      0,
      TIP_SECONDS,
    )
  );
}

const rose = new THREE.Vector3();
const matrix = new THREE.Matrix4();

export function WateringCan({
  slot,
  soilY,
  color,
  drop,
  glow,
  reducedMotion,
}: {
  slot: number;
  soilY: number;
  color: string;
  drop: string;
  glow: number;
  reducedMotion: boolean;
}) {
  const geometry = useMemo(() => canGeometry(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const can = useRef<THREE.Mesh>(null);
  const drops = useRef<THREE.InstancedMesh>(null);
  const offset = slot * 2.3;

  // Every frame: bob and tip the can; while it pours, each drop falls from
  // the rose to the soil and starts over, a little spread out
  useFrame(({ clock }) => {
    const mesh = can.current;
    const field = drops.current;
    if (!mesh || !field) return;
    const time = reducedMotion ? 0 : clock.elapsedTime;
    const pour = pourAt(time, offset);
    mesh.position.set(
      SPOT[0],
      SPOT[1] + Math.sin(time * 1.3 + offset) * 0.04,
      SPOT[2],
    );
    mesh.rotation.z = THREE.MathUtils.lerp(REST_TILT, POUR_TILT, pour);
    mesh.updateMatrix();

    field.visible = pour > 0.9 && !reducedMotion;
    if (!field.visible) return;
    rose.set(-0.46, 0.17, 0).applyMatrix4(mesh.matrix);
    for (let i = 0; i < DROPS; i++) {
      const fall = (time * FALL_SPEED + i / DROPS) % 1;
      const spread = 0.04 + fall * 0.12;
      matrix.makeTranslation(
        rose.x + Math.sin(i * 2.4) * spread,
        THREE.MathUtils.lerp(rose.y, soilY, fall * fall),
        rose.z + Math.cos(i * 2.4) * spread,
      );
      field.setMatrixAt(i, matrix);
    }
    field.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <mesh ref={can} geometry={geometry} castShadow>
        <meshStandardMaterial color={color} metalness={0.55} roughness={0.35} />
      </mesh>
      <instancedMesh
        ref={drops}
        args={[undefined, undefined, DROPS]}
        frustumCulled={false}
      >
        <sphereGeometry args={[0.022, 6, 4]} />
        <meshStandardMaterial
          color={drop}
          emissive={drop}
          emissiveIntensity={glow * 0.4}
          transparent
          opacity={0.85}
          roughness={0.1}
        />
      </instancedMesh>
    </group>
  );
}
