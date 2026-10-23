import { useMemo } from "react";
import * as THREE from "three";

//
//
//
// SVG units → scene units: the beetle (25 units wide with its legs)
// spans about 0.6 of the cover's width
export const BEETLE_SCALE = 0.026;

// How far each layer sits above the one under it, in SVG units: legs
// lowest, then body, the head's plate ring, seam, head, leaf on top
const LAYER_LIFT = 0.04;

// The four legs from the logo's path: [from, to] for each stroke
const LEGS: [[number, number], [number, number]][] = [
  [
    [7.5, 15.5],
    [4, 13.5],
  ],
  [
    [7, 22.5],
    [3.5, 24],
  ],
  [
    [24.5, 15.5],
    [28, 13.5],
  ],
  [
    [25, 22.5],
    [28.5, 24],
  ],
];

// SVG point → shape point: centred on the viewBox middle, y flipped
// (SVG y points down, shape y up)
function flip([x, y]: [number, number]): [number, number] {
  return [x - 16, 16 - y];
}

// An SVG ellipse (centre, radii) as a shape
function ellipseShape(
  center: [number, number],
  radiusX: number,
  radiusY: number,
) {
  const shape = new THREE.Shape();
  shape.absellipse(...flip(center), radiusX, radiusY, 0, Math.PI * 2, false, 0);
  return shape;
}

// An SVG path made of one start point and cubic curves (each
// [x1, y1, x2, y2, x, y], like "C" in the path data) as a closed shape
function curvedShape(start: [number, number], curves: number[][]) {
  const shape = new THREE.Shape();
  shape.moveTo(...flip(start));
  curves.forEach(([x1, y1, x2, y2, x, y]) =>
    shape.bezierCurveTo(...flip([x1, y1]), ...flip([x2, y2]), ...flip([x, y])),
  );
  shape.closePath();
  return shape;
}

// A stroked SVG line with round caps as a capsule shape: a half circle
// around each end, joined by straight sides
function capsuleShape(
  from: [number, number],
  to: [number, number],
  width: number,
) {
  const [fromX, fromY] = flip(from);
  const [toX, toY] = flip(to);
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const shape = new THREE.Shape();
  shape.absarc(
    fromX,
    fromY,
    width / 2,
    angle + Math.PI / 2,
    angle + Math.PI * 1.5,
    false,
  );
  shape.absarc(
    toX,
    toY,
    width / 2,
    angle - Math.PI / 2,
    angle + Math.PI / 2,
    false,
  );
  shape.closePath();
  return shape;
}

// A flat shape: 24 segments per curve keeps the ellipses round
function flat(shape: THREE.Shape) {
  return new THREE.ShapeGeometry(shape, 24);
}

// One flat layer of the emblem: lifted by its layer number, and
// polygonOffset pulls it toward the camera in the depth test, so it always
// wins against the layer (or the board) under it. With glow above 0 it
// gives off its own colour and skips tone mapping, so it stays above the
// bloom threshold and glows
function Layer({
  geometry,
  layer,
  color,
  glow = 0,
}: {
  geometry: THREE.BufferGeometry;
  layer: number;
  color: string;
  glow?: number;
}) {
  return (
    <mesh geometry={geometry} position-z={layer * LAYER_LIFT} receiveShadow>
      <meshStandardMaterial
        color={color}
        roughness={0.6}
        emissive={color}
        emissiveIntensity={glow}
        toneMapped={glow === 0}
        polygonOffset
        polygonOffsetFactor={-layer}
        polygonOffsetUnits={-layer}
      />
    </mesh>
  );
}

// The gitspore beetle as a flat emblem, lying at the parent's origin:
// rotated from the shape plane onto the table, scaled from SVG units;
// every geometry is built once
export function Beetle({
  ink,
  plate,
  leaf,
  seam,
  glow,
}: {
  ink: string;
  plate: string;
  leaf: string;
  seam: string;
  glow: number;
}) {
  const geometries = useMemo(
    () => ({
      legs: LEGS.map(([from, to]) => flat(capsuleShape(from, to, 2.2))),
      body: flat(ellipseShape([16, 19.5], 9.5, 10.5)),
      ring: flat(ellipseShape([16, 7.4], 4.3 + 0.8, 3.4 + 0.8)),
      head: flat(ellipseShape([16, 7.4], 4.3, 3.4)),
      seam: flat(
        curvedShape(
          [16, 11.6],
          [
            [12.4, 15, 12.4, 23.6, 16, 27.6],
            [19.6, 23.6, 19.6, 15, 16, 11.6],
          ],
        ),
      ),
      leaf: flat(
        curvedShape(
          [17, 4.4],
          [
            [18, 1.8, 21.4, 0.9, 24.4, 1.7],
            [22.7, 4.1, 20, 5.2, 17, 4.4],
          ],
        ),
      ),
    }),
    [],
  );

  return (
    <group rotation-x={-Math.PI / 2} scale={BEETLE_SCALE}>
      {geometries.legs.map((geometry, index) => (
        <Layer key={index} geometry={geometry} layer={1} color={ink} />
      ))}
      <Layer geometry={geometries.body} layer={2} color={ink} />
      <Layer geometry={geometries.ring} layer={3} color={plate} />
      <Layer geometry={geometries.seam} layer={4} color={seam} glow={glow} />

      <Layer geometry={geometries.head} layer={5} color={ink} />
      <Layer geometry={geometries.leaf} layer={6} color={leaf} />
    </group>
  );
}
