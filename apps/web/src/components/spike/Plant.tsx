import { useMemo } from "react";
import * as THREE from "three";

//
//
//
// The "working" sprout from the Plant
const HEIGHT = 0.72;
const STEM_R = 0.028;

// 0 = upright; the waiting stages bend it to 0.05, 0.5, 1 later
const BEND = 0;
// How far the leaves point up from flat, less when the stem droops
const ELEV = 0.65 - BEND * 1.6;
// Where the two leaves sit along the stem, 0 = soil, 1 = tip
const LEAF_T = [0.72, 0.8];

// A smooth stem through four points, leaning out in direction dir
function stemCurve(h: number, bend: number, dir: number) {
  const dx = Math.cos(dir);
  const dz = Math.sin(dir);
  // r = how far out from the pot's centre, y = height above the soil
  const V = (r: number, y: number) => new THREE.Vector3(dx * r, y, dz * r);
  return new THREE.CatmullRomCurve3([
    V(0, 0),
    V(0.04 + 0.05 * bend, h * 0.4),
    V(0.1 + 0.42 * bend, h * (0.8 - 0.15 * bend)),
    V(0.14 + 0.72 * bend, h * (1 - 0.95 * bend)),
  ]);
}

// A pointed leaf outline, filled, then curled: tip back, sides up
function leafGeo(len: number, wid: number) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(wid, len * 0.45, 0, len);
  s.quadraticCurveTo(-wid, len * 0.45, 0, 0);
  const g = new THREE.ShapeGeometry(s, 10);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    p.setZ(i, (-0.35 * y * y) / len + 0.6 * x * x);
  }
  g.computeVertexNormals();
  return g;
}

export function Plant({
  slot,
  stem,
  leaf,
}: {
  slot: number;
  stem: string;
  leaf: string;
}) {
  // Each slot leans its own way, so the six plants don't look copied
  const dir = slot * 1.7 + 0.6;

  const curve = useMemo(() => stemCurve(HEIGHT, BEND, dir), [dir]);
  const leafAt = useMemo(() => LEAF_T.map((t) => curve.getPointAt(t)), [curve]);
  // One leaf shape per plant, used by both leaves
  const leafShape = useMemo(() => leafGeo(0.42, 0.19), []);

  return (
    <>
      <mesh>
        <tubeGeometry args={[curve, 24, STEM_R, 6]} />
        <meshStandardMaterial color={stem} roughness={0.8} />
      </mesh>
      {leafAt.map((at, k) => (
        // Turn around the stem first (y), then tilt the leaf up (x)
        <group key={LEAF_T[k]} position={at} rotation-y={dir + k * Math.PI}>
          <mesh geometry={leafShape} rotation-x={Math.PI / 2 - ELEV}>
            <meshStandardMaterial
              color={leaf}
              roughness={0.7}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
    </>
  );
}
