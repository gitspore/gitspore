import { useMemo } from "react";
import * as THREE from "three";
import { Line, Outlines, RoundedBox } from "@react-three/drei";

import { useGreenhouseStore } from "@/lib/client/GreenhouseClientProvider";
import { MAP_SPOT } from "./layout";
import { useClickable } from "./useClickable";

//
//
//
// The paper's size and turn on the table, and how high the ink lies
// above the paper's top so it doesn't z-fight
const MAP_WIDTH = 1.3;
const MAP_DEPTH = 0.95;
const MAP_THICKNESS = 0.02;
const MAP_TURN = 0.35;
const INK_Y = MAP_THICKNESS + 0.002;

// Decoration, not real branches: main across the sheet, two branches
// leaving it and one merging back, as [x, z] points on the paper
const MAIN: [number, number][] = [
  [-0.55, 0.25],
  [0.55, 0.25],
];
const BRANCHES: [number, number][][] = [
  [
    [-0.35, 0.25],
    [-0.2, 0.05],
    [0.05, 0.05],
    [0.25, 0.25],
  ],
  [
    [0.0, 0.25],
    [0.15, -0.2],
    [0.5, -0.2],
  ],
];
const COMMITS: [number, number][] = [
  [-0.45, 0.25],
  [-0.1, 0.05],
  [0.25, 0.25],
  [0.3, -0.2],
  [0.5, -0.2],
];

// [x, z] on the paper → a point just above it
function onPaper([x, z]: [number, number]): [number, number, number] {
  return [x, INK_Y, z];
}

// The git map at MAP_SPOT: a sheet of paper with main, two branches and
// their commits drawn on it.
// - a click toggles the side panel's branches tab, like the book toggles
//   the overview terminal; hovering shows a hand and the paper's outline
// - the commit dot shape is built once and shared
export function GitMap({
  paper,
  main,
  branches,
  outline,
}: {
  paper: string;
  main: string;
  branches: string[];
  outline: string;
}) {
  const [x, z] = MAP_SPOT;
  const branchesOpen = useGreenhouseStore(
    (state) => state.layout.sidePanel === "branches",
  );
  const setSidePanel = useGreenhouseStore((state) => state.setSidePanel);
  const { hovered, handlers } = useClickable(() =>
    setSidePanel(branchesOpen ? null : "branches"),
  );
  const dotGeo = useMemo(() => new THREE.CircleGeometry(0.035, 16), []);

  return (
    <group position={[x, 0, z]} rotation-y={MAP_TURN} {...handlers}>
      <RoundedBox
        args={[MAP_WIDTH, MAP_THICKNESS, MAP_DEPTH]}
        radius={0.008}
        position-y={MAP_THICKNESS / 2}
        receiveShadow
      >
        <meshStandardMaterial color={paper} roughness={0.95} />
        {hovered && <Outlines thickness={3} color={outline} />}
      </RoundedBox>
      <Line points={MAIN.map(onPaper)} color={main} lineWidth={3} />
      {BRANCHES.map((points, index) => (
        <Line
          key={index}
          points={points.map(onPaper)}
          color={branches[index % branches.length]}
          lineWidth={2}
        />
      ))}
      {COMMITS.map((point, index) => (
        <mesh
          key={index}
          geometry={dotGeo}
          rotation-x={-Math.PI / 2}
          position={onPaper(point)}
        >
          <meshStandardMaterial color={main} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}
