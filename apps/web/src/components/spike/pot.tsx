import * as THREE from "three";

const POT_PROFILE = [
  [0, 0],
  [0.47, 0],
  [0.5, 0.04],
  [0.62, 0.86],
  [0.72, 0.88],
  [0.74, 1.05],
  [0.71, 1.1],
  [0.64, 1.1],
  [0.62, 1.0],
  [0.6, 0.97],
  [0, 0.97],
].map(([x, y]) => new THREE.Vector2(x, y));

const SOIL_Y = 0.97;
const SOIL_R = 0.61;

export function Pot({ pot, soil }: { pot: string; soil: string }) {
  return (
    <>
      <mesh>
        <latheGeometry args={[POT_PROFILE, 24]} />
        <meshStandardMaterial color={pot} roughness={0.9} />
      </mesh>
      {/* A flat disc just above the pot's inner floor, laid flat */}
      <mesh rotation-x={-Math.PI / 2} position-y={SOIL_Y + 0.005}>
        <circleGeometry args={[SOIL_R, 40]} />
        <meshStandardMaterial color={soil} roughness={1} />
      </mesh>
    </>
  );
}
