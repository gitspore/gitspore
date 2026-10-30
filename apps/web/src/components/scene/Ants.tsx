import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { FLOOR_Y } from "./layout";
import { seeded } from "./life";
import { paintedParts } from "./shapes";

//
//
//
// A few ants by day, on a winding trail through the earth left of the
// table: from their little nest out to the mushrooms at the left front
// leg and back. Each walks its own pace, stops now and then, and turns
// at the ends; the ones coming home carry a crumb. All in two instanced
// meshes, ants and crumbs

// The trail on the floor (x, z), from the nest to the mushrooms
const TRAIL = [
  [-6.1, 2.95],
  [-5.65, 3.2],
  [-5.15, 2.9],
  [-4.65, 3.15],
  [-4.15, 3.05],
];
const ANTS = 10;
// Walking speed (units a second, from–to), how far apart the two ways
// walk, and how much they wander from the trail
const SPEED = [0.09, 0.14];
const LANE = 0.025;
const WANDER = 0.012;
// How much bigger than life they are drawn, so they read from the camera
const SIZE = 1.6;
// The nest: a low mound of earth
const NEST_RADIUS = 0.13;

type Ant = {
  // How far along the trail (0 at the nest, 1 at the mushrooms), which
  // way it walks, how fast, how long it still stands, and whether it
  // carries a crumb
  along: number;
  way: number;
  speed: number;
  rest: number;
  carrying: boolean;
  phase: number;
};

// One ant, facing +z, standing on the origin: abdomen, thorax and head in
// a row, three legs a side, two antennae
function antGeometry(body: string) {
  const leg = (side: number, z: number, splay: number) =>
    new THREE.CylinderGeometry(0.0022, 0.0022, 0.03, 3)
      .rotateZ(side * 1.15)
      .rotateY(side * splay)
      .translate(side * 0.013, 0.008, z);
  const antenna = (side: number) =>
    new THREE.CylinderGeometry(0.0018, 0.0018, 0.026, 3)
      .rotateX(1.1)
      .rotateY(side * 0.45)
      .translate(side * 0.006, 0.024, 0.053);
  return paintedParts([
    [
      new THREE.SphereGeometry(1, 8, 6)
        .scale(0.012, 0.011, 0.018)
        .translate(0, 0.014, -0.026),
      body,
    ],
    [
      new THREE.SphereGeometry(1, 6, 4)
        .scale(0.006, 0.006, 0.011)
        .translate(0, 0.013, 0.003),
      body,
    ],
    [
      new THREE.SphereGeometry(1, 6, 5)
        .scale(0.008, 0.007, 0.008)
        .translate(0, 0.015, 0.024),
      body,
    ],
    ...[1, -1].flatMap((side): [THREE.BufferGeometry, string][] => [
      [leg(side, 0.008, -0.5), body],
      [leg(side, 0.002, 0), body],
      [leg(side, -0.004, 0.5), body],
      [antenna(side), body],
    ]),
  ]);
}

export function Ants({
  body,
  crumb,
  nest,
  reducedMotion,
}: {
  body: string;
  crumb: string;
  nest: string;
  reducedMotion: boolean;
}) {
  const geometry = useMemo(() => antGeometry(body), [body]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const trail = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        TRAIL.map(([x, z]) => new THREE.Vector3(x, FLOOR_Y, z)),
      ),
    [],
  );

  const ants = useRef<THREE.InstancedMesh>(null);
  const crumbs = useRef<THREE.InstancedMesh>(null);
  // Spread along the trail from the start, half each way
  const crowd = useRef<Ant[]>(
    (() => {
      const random = seeded(71);
      return Array.from({ length: ANTS }, (_, index) => {
        const way = index % 2 === 0 ? 1 : -1;
        return {
          along: random(),
          way,
          speed: SPEED[0] + random() * (SPEED[1] - SPEED[0]),
          rest: 0,
          carrying: way < 0,
          phase: random() * Math.PI * 2,
        };
      });
    })(),
  );
  const random = useMemo(() => seeded(73), []);

  // Scratch objects, so the frames allocate nothing
  const scratch = useMemo(
    () => ({
      matrix: new THREE.Matrix4(),
      turn: new THREE.Quaternion(),
      size: new THREE.Vector3(),
      none: new THREE.Vector3(),
      place: new THREE.Vector3(),
      tangent: new THREE.Vector3(),
      carried: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
    }),
    [],
  );

  useFrame(({ clock }, delta) => {
    const antMesh = ants.current;
    const crumbMesh = crumbs.current;
    if (!antMesh || !crumbMesh) return;
    const { matrix, turn, size, none, place, tangent, carried, up } = scratch;
    const dt = reducedMotion ? 0 : Math.min(delta, 1 / 30);
    const length = trail.getLength();
    const time = clock.elapsedTime;

    crowd.current.forEach((ant, index) => {
      if (ant.rest > 0) {
        ant.rest -= dt;
      } else {
        ant.along += (ant.way * ant.speed * dt) / length;
        if (dt > 0 && random() < dt * 0.15) ant.rest = 0.3 + random() * 0.9;
      }
      // At the mushrooms it picks up a crumb, at the nest it drops it
      // (only when still heading out of the trail: an ant resting at the
      // end is clamped there and must not turn again every frame)
      if ((ant.way > 0 && ant.along >= 1) || (ant.way < 0 && ant.along <= 0)) {
        ant.along = THREE.MathUtils.clamp(ant.along, 0, 1);
        ant.way = -ant.way;
        ant.carrying = ant.way < 0;
        ant.rest = 0.4 + random() * 0.6;
      }

      trail.getPointAt(ant.along, place);
      trail.getTangentAt(ant.along, tangent);
      // Out on one side of the trail, home on the other, wandering a bit
      const side = ant.way * LANE + Math.sin(time * 3 + ant.phase) * WANDER;
      place.x += tangent.z * side;
      place.z -= tangent.x * side;
      const heading =
        Math.atan2(tangent.x * ant.way, tangent.z * ant.way) +
        Math.sin(time * 7 + ant.phase) * 0.25 * (dt > 0 ? 1 : 0);
      turn.setFromAxisAngle(up, heading);
      size.setScalar(SIZE);
      matrix.compose(place, turn, size);
      antMesh.setMatrixAt(index, matrix);

      // The crumb held up in front of its head
      carried
        .set(0, 0.026, 0.05)
        .multiplyScalar(SIZE)
        .applyQuaternion(turn)
        .add(place);
      matrix.compose(carried, turn, ant.carrying ? size : none);
      crumbMesh.setMatrixAt(index, matrix);
    });
    antMesh.instanceMatrix.needsUpdate = true;
    crumbMesh.instanceMatrix.needsUpdate = true;
  });

  const [nestX, nestZ] = TRAIL[0];
  return (
    <>
      <instancedMesh
        ref={ants}
        args={[geometry, undefined, ANTS]}
        frustumCulled={false}
        castShadow
      >
        <meshStandardMaterial vertexColors roughness={0.5} />
      </instancedMesh>
      <instancedMesh
        ref={crumbs}
        args={[undefined, undefined, ANTS]}
        frustumCulled={false}
      >
        <icosahedronGeometry args={[0.011, 0]} />
        <meshStandardMaterial color={crumb} roughness={0.9} flatShading />
      </instancedMesh>
      <mesh
        position={[nestX, FLOOR_Y, nestZ]}
        scale={[NEST_RADIUS, NEST_RADIUS * 0.35, NEST_RADIUS]}
        receiveShadow
      >
        <sphereGeometry args={[1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={nest} roughness={1} flatShading />
      </mesh>
    </>
  );
}
