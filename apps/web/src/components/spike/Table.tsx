import { useMemo } from "react";
import * as THREE from "three";

import type { Mode, tokens } from "@/theme/tokens";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

//
//
//

type ModeTokens = (typeof tokens)[Mode];
type WoodColors = ModeTokens["color"]["wood"];

// The table: nine planks with their top at y = 0, taking the four wood
// colours in turn, on four legs (their x, z spots)
const PLANK_COUNT = 9;
const PLANK_WOODS = ["1", "2", "3", "4"] as const;
const LEG_SPOTS = [
  [-3.6, -2.4],
  [3.6, -2.4],
  [-3.6, 3.05],
  [3.6, 3.05],
];

// One plank's size and edge. PLANK_EDGE picks the chamfered shape below
// or a RoundedBoxGeometry. CHAMFER is the cut on every edge, SOFTEN the
// small rounding where the chamfer meets the top and sides
const PLANK_EDGE: "rounded" | "chamfer" = "chamfer";
const PLANK_LENGTH = 7.8;
const PLANK_THICKNESS = 0.3;
const PLANK_DEPTH = 0.64;
const CHAMFER = 0.03;
const SOFTEN = 0.008;

// A plank with a flat chamfer on every edge, in four steps:
// 1. The cross-section, seen from the plank's end: a rectangle with its
//    four corners cut off (eight corners)
// 2. The outline, corner by corner, each corner rounded off with a small
//    curve, so the chamfer meets the top and sides softly
// 3. Pushed out along the plank's length. The bevel cuts the same chamfer
//    at both ends; bevelOffset keeps the cross-section at its size instead
//    of growing by the chamfer, and depth leaves room for both bevels
// 4. Drawn across and pushed along z, so turned to run along x, and
//    centred, so the plank's position is its middle
function chamferedPlank() {
  const halfDepth = PLANK_DEPTH / 2;
  const halfThickness = PLANK_THICKNESS / 2;
  const corners = [
    [-halfDepth + CHAMFER, -halfThickness],
    [halfDepth - CHAMFER, -halfThickness],
    [halfDepth, -halfThickness + CHAMFER],
    [halfDepth, halfThickness - CHAMFER],
    [halfDepth - CHAMFER, halfThickness],
    [-halfDepth + CHAMFER, halfThickness],
    [-halfDepth, halfThickness - CHAMFER],
    [-halfDepth, -halfThickness + CHAMFER],
  ].map(([x, y]) => new THREE.Vector2(x, y));

  const shape = new THREE.Shape();
  corners.forEach((corner, index) => {
    const previous = corners[(index + corners.length - 1) % corners.length];
    const next = corners[(index + 1) % corners.length];
    const towardPrevious = previous.clone().sub(corner).normalize();
    const towardNext = next.clone().sub(corner).normalize();
    const before = corner.clone().addScaledVector(towardPrevious, SOFTEN);
    const after = corner.clone().addScaledVector(towardNext, SOFTEN);
    if (index === 0) {
      shape.moveTo(before.x, before.y);
    } else {
      shape.lineTo(before.x, before.y);
    }
    shape.quadraticCurveTo(corner.x, corner.y, after.x, after.y);
  });
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: PLANK_LENGTH - 2 * CHAMFER,
    curveSegments: 2,
    bevelEnabled: true,
    bevelThickness: CHAMFER,
    bevelSize: CHAMFER,
    bevelOffset: -CHAMFER,
    bevelSegments: 1,
  });
  geometry.rotateY(Math.PI / 2);
  geometry.center();
  return geometry;
}

// One plank shape for all nine planks and one box for all four legs, like
// the shared pot shape. The rounded variant: 1 segment, radius 0.03.
// Planks cast and receive shadows, legs only cast, the floor receives.
// The floor is a large plane laid flat, where the legs end
export function Table({ wood, floor }: { wood: WoodColors; floor: string }) {
  const plankGeo = useMemo(
    () =>
      PLANK_EDGE === "chamfer"
        ? chamferedPlank()
        : new RoundedBoxGeometry(
            PLANK_LENGTH,
            PLANK_THICKNESS,
            PLANK_DEPTH,
            1,
            0.03,
          ),
    [],
  );

  const legGeo = useMemo(() => new THREE.BoxGeometry(0.2, 1.9, 0.2), []);

  return (
    <group>
      {[...Array(PLANK_COUNT).keys()].map((index) => (
        <mesh
          key={index}
          geometry={plankGeo}
          castShadow
          receiveShadow
          position={[0, -PLANK_THICKNESS / 2, -2.27 + index * 0.66]}
        >
          <meshStandardMaterial
            color={wood[PLANK_WOODS[index % PLANK_WOODS.length]]}
            roughness={0.85}
          />
        </mesh>
      ))}
      {LEG_SPOTS.map(([x, z]) => (
        <mesh
          key={`${x},${z}`}
          geometry={legGeo}
          castShadow
          position={[x, -1.05, z]}
        >
          <meshStandardMaterial color={wood.leg} roughness={0.8} />
        </mesh>
      ))}
      <mesh rotation-x={-Math.PI / 2} position-y={-2} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color={floor} roughness={1} />
      </mesh>
    </group>
  );
}
