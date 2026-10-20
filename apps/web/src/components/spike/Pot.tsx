import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";

import {
  Plant,
  PLANT_STATES,
  type PlantState,
  type SceneColors,
} from "./Plant";

//
//
//

type Shapes = {
  bodyGeo: THREE.BufferGeometry;
  soilGeo: THREE.BufferGeometry;
};

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

const POS_POTS = [
  [-2.15, -1.5],
  [0, -1.5],
  [2.15, -1.5],
  [-2.15, 0.42],
  [0, 0.42],
  [2.15, 0.42],
];

function Pot({
  x,
  z,
  slot,
  state,
  colors,
  bodyGeo,
  soilGeo,
}: {
  x: number;
  z: number;
  slot: number;
  state: PlantState;
  colors: SceneColors;
} & Shapes) {
  return (
    <group position={[x, 0, z]}>
      <mesh geometry={bodyGeo}>
        {/* <latheGeometry args={[POT_PROFILE, 24]} /> */}
        <meshStandardMaterial color={colors.pot} roughness={0.9} />
      </mesh>
      {/* Soil: A flat disc just above the pot's inner floor, laid flat */}
      <mesh
        geometry={soilGeo}
        rotation-x={-Math.PI / 2}
        position-y={SOIL_Y + 0.005}
      >
        {/* <circleGeometry args={[SOIL_R, 24]} /> */}
        <meshStandardMaterial color={colors.soil} roughness={1} />
      </mesh>
      {/* The plant stands on the soil, like the prototype's plantHolder */}
      <group position-y={SOIL_Y}>
        <Plant slot={slot} state={state} colors={colors} />
      </group>
    </group>
  );
}

export function Pots({ colors }: { colors: SceneColors }) {
  // Built once while the scene is mounted, shared by all six pots
  const bodyGeo = useMemo(() => new THREE.LatheGeometry(POT_PROFILE, 24), []);
  const soilGeo = useMemo(() => new THREE.CircleGeometry(SOIL_R, 24), []);

  // Spike only: "p" moves all six plants to the next state
  const [stateIndex, setStateIndex] = useState(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Typing in a field or the terminal must not change the plants
      const el = e.target;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === "p") {
        setStateIndex((i) => (i + 1) % PLANT_STATES.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const state = PLANT_STATES[stateIndex];

  return (
    <>
      {POS_POTS.map(([x, z], slot) => (
        <Pot
          key={`${x},${z}`}
          x={x}
          z={z}
          slot={slot}
          bodyGeo={bodyGeo}
          soilGeo={soilGeo}
          state={state}
          colors={colors}
        />
      ))}
    </>
  );
}
