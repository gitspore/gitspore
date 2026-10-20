import { useMemo } from "react";
import * as THREE from "three";

import type { Mode, tokens } from "@/theme/tokens";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

//
//
//

// Everything of one mode, day or night
type ModeTokens = (typeof tokens)[Mode];
type WoodColors = ModeTokens["color"]["wood"];

// The prototype's table (cozyEnv): nine planks, four legs, an apron
// across the front, and the floor. The top of the planks is at y = 0.
const PLANK_COUNT = 9;
// The planks take the four wood colours in turn
const PLANK_WOODS = ["1", "2", "3", "4"] as const;
const LEG_SPOTS = [
  [-3.6, -2.4],
  [3.6, -2.4],
  [-3.6, 3.05],
  [3.6, 3.05],
];

// Try: the plank edges, "rounded" (RoundedBoxGeometry) or "chamfer" (own shape)
const PLANK_EDGE: "rounded" | "chamfer" = "chamfer";

const PLANK_LENGTH = 7.8;
const PLANK_THICKNESS = 0.3;
const PLANK_DEPTH = 0.64;
// The flat cut along each edge, and the slight rounding where it meets the faces
const CHAMFER = 0.03;
const SOFTEN = 0.008;

// A plank with a flat chamfer on every edge, its borders slightly softened
function chamferedPlank() {
  const halfDepth = PLANK_DEPTH / 2;
  const halfThickness = PLANK_THICKNESS / 2;

  // The cross-section, seen from the plank's end: a rectangle with its
  // four corners cut off, so eight corners
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

  // Each corner becomes a tiny curve: it starts SOFTEN before the corner,
  // bends around it and ends SOFTEN after it
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

  // Pushed out along the plank's length. The bevel cuts the same chamfer
  // at both ends; bevelOffset keeps the plank at its size instead of
  // growing by the chamfer on every side
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: PLANK_LENGTH - 2 * CHAMFER,
    curveSegments: 2,
    bevelEnabled: true,
    bevelThickness: CHAMFER,
    bevelSize: CHAMFER,
    bevelOffset: -CHAMFER,
    bevelSegments: 1,
  });
  // Drawn across and pushed along z; turned so the length runs along x
  geometry.rotateY(Math.PI / 2);
  geometry.center();
  return geometry;
}

export function Table({ wood, floor }: { wood: WoodColors; floor: string }) {
  // One box for all planks and one for all legs, like the shared pot shape
  // Try: 0.3 thick instead of 0.14, no apron
  const plankGeo = useMemo(
    () =>
      PLANK_EDGE === "chamfer"
        ? chamferedPlank()
        : // A slightly rounded chamfer: 1 segment, radius 0.03
          new RoundedBoxGeometry(
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
          position={[0, -0.15, -2.27 + index * 0.66]}
        >
          <meshStandardMaterial
            color={wood[PLANK_WOODS[index % PLANK_WOODS.length]]}
            roughness={0.85}
          />
        </mesh>
      ))}
      {LEG_SPOTS.map(([x, z]) => (
        <mesh key={`${x},${z}`} geometry={legGeo} position={[x, -1.05, z]}>
          <meshStandardMaterial color={wood.leg} roughness={0.8} />
        </mesh>
      ))}
      {/* Apron: the board across the front, just under the table top */}
      {/* Try: no apron
      <mesh position={[0, -0.32, 3.34]}>
        <boxGeometry args={[7.8, 0.36, 0.08]} />
        <meshStandardMaterial color={wood["3"]} roughness={0.85} />
      </mesh>
      */}
      {/* Floor: a large plane laid flat, where the legs end */}
      <mesh rotation-x={-Math.PI / 2} position-y={-2}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color={floor} roughness={1} />
      </mesh>
    </group>
  );
}
