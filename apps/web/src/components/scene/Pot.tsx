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

// pot: the profile (x = radius, y = height) that
// LatheGeometry spins round, the soil disc at the pot's inner floor,
// and the six spots on the table
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

// One pot at its spot: body, soil and the plant.
// - Body: casts and receives shadows. shadowSide FrontSide draws its front
//   faces into the shadow map; the default back faces, with the biases,
//   left a lit sliver at every pot's foot
// - Soil: a flat disc laid just above the pot's inner floor; it receives
//   the plant's shadow
// - The plant stands on the soil
function Pot({
  x,
  z,
  slot,
  state,
  growth,
  wholeScale,
  colors,
  bodyGeo,
  soilGeo,
}: {
  x: number;
  z: number;
  slot: number;
  state: PlantState;
  growth: number;
  wholeScale: boolean;
  colors: SceneColors;
} & Shapes) {
  return (
    <group position={[x, 0, z]}>
      <mesh geometry={bodyGeo} castShadow receiveShadow>
        <meshStandardMaterial
          color={colors.pot}
          roughness={0.9}
          shadowSide={THREE.FrontSide}
        />
      </mesh>
      <mesh
        geometry={soilGeo}
        receiveShadow
        rotation-x={-Math.PI / 2}
        position-y={SOIL_Y + 0.005}
      >
        <meshStandardMaterial color={colors.soil} roughness={1} />
      </mesh>
      <group position-y={SOIL_Y}>
        <Plant
          slot={slot}
          state={state}
          growth={growth}
          colors={colors}
          wholeScale={wholeScale}
        />
      </group>
    </group>
  );
}

// Test keys: the growth values "g" steps through, starting at the
// table's own size (0.5), then bigger, then from small up again
const GROWTH_STEPS = [0.5, 0.75, 1, 0, 0.25];

// All six pots. The two shapes are built once while the scene is mounted
// and shared by all six.
// Test keys, only with ?testing=1: "p" moves all six plants to the next
// state, "g" to the next growth step, "s" switches the whole-plant scale
// on and off. Typing in a field or the terminal must not change the plants
export function Pots({
  colors,
  testKeys,
}: {
  colors: SceneColors;
  testKeys: boolean;
}) {
  const bodyGeo = useMemo(() => new THREE.LatheGeometry(POT_PROFILE, 24), []);
  const soilGeo = useMemo(() => new THREE.CircleGeometry(SOIL_R, 24), []);

  const [stateIndex, setStateIndex] = useState(0);
  const [growthIndex, setGrowthIndex] = useState(0);
  const [wholeScale, setWholeScale] = useState(false);

  useEffect(() => {
    if (!testKeys) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      const el = e.target;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === "p") {
        setStateIndex((i) => (i + 1) % PLANT_STATES.length);
      }
      if (e.key === "g") {
        setGrowthIndex((i) => (i + 1) % GROWTH_STEPS.length);
      }
      if (e.key === "s") {
        setWholeScale((on) => !on);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [testKeys]);
  const state = PLANT_STATES[stateIndex];
  const growth = GROWTH_STEPS[growthIndex];

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
          growth={growth}
          wholeScale={wholeScale}
          colors={colors}
        />
      ))}
    </>
  );
}
