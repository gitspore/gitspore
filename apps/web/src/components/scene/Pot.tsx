import { useEffect, memo, useMemo, useState } from "react";
import * as THREE from "three";
import { Outlines, useCursor } from "@react-three/drei";

import {
  useGreenhouseStore,
  useNowSelect,
} from "@/lib/client/GreenhouseClientProvider";
import { wiltStage, type WiltStage } from "@/lib/store/wilting";

import { agentBySlot } from "@/lib/store/selectors";
import { POT_SPOTS } from "./layout";
import {
  Plant,
  PLANT_STATES,
  type PlantState,
  type ArtColors,
  type SceneColors,
} from "./Plant";

import { STATUS_VISUALS, WILT_PLANTS } from "./statusVisuals";
import type { AgentStatus } from "@gitspore/shared";

//
//
//
type Shapes = {
  bodyGeo: THREE.BufferGeometry;
  soilGeo: THREE.BufferGeometry;
};

// pot: the profile (x = radius, y = height)
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

// What a plant shows: its state, growth and whole-plant scale. The test
// keys set all three for every pot
type PlantLook = { state: PlantState; growth: number; wholeScale: boolean };

// An agent's plant look, from its status; a waiting agent's from how
// long it has waited
function agentLook(status: AgentStatus, stage: WiltStage | null): PlantLook {
  const visual = STATUS_VISUALS[status];
  const state = stage ? WILT_PLANTS[stage] : visual.plant;
  return { state, growth: visual.growth, wholeScale: false };
}

// memo: a re-render above (AppShell)
// skips pots whose props didn't change
//
// Pot contains:
// pot at slot spot:
// body, soil if agent plant,
//
// Each pot reads only its own agent from the store,
// a change to one agent re-renders only that pot.
// With ?testing=1 the test look wins,
// and every pot shows a plant.
//
// - Body: casts and receives shadows.
// shadowSide FrontSide draws its front
// faces into the shadow map,
// the default back faces, with the biases,
// left a lit sliver at every pot's foot
//
// - Soil: flat disc laid just above the pot's inner floor
// receives plant's shadow
//
// - The plant stands on the soil
//
// - The whole group takes the clicks: a click on any part of an
// occupied pot opens its agent's window; hovering shows a hand
// and an outline
const Pot = memo(function Pot({
  slot,
  test,
  colors,
  art,
  bodyGeo,
  soilGeo,
}: {
  slot: number;
  test: PlantLook | null;
  colors: SceneColors;
  art: ArtColors;
} & Shapes) {
  const agent = useGreenhouseStore(agentBySlot(slot));
  const [x, z] = POT_SPOTS[slot];
  const stage = useNowSelect((now) =>
    agent && now !== 0 ? wiltStage(agent, now) : null,
  );
  const look = test ?? (agent ? agentLook(agent.status, stage) : null);

  const openWindow = useGreenhouseStore((state) => state.openWindow);
  const [hovered, setHovered] = useState(false);
  useCursor(hovered && agent !== null);

  return (
    <group
      position={[x, 0, z]}
      onClick={(event) => {
        event.stopPropagation();
        if (agent) openWindow(agent.id);
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <mesh geometry={bodyGeo} castShadow receiveShadow>
        <meshStandardMaterial
          color={colors.pot}
          roughness={0.9}
          shadowSide={THREE.FrontSide}
        />
        {hovered && agent && <Outlines thickness={3} color={colors.heart} />}
      </mesh>
      <mesh
        geometry={soilGeo}
        receiveShadow
        rotation-x={-Math.PI / 2}
        position-y={SOIL_Y + 0.005}
      >
        <meshStandardMaterial color={colors.soil} roughness={1} />
      </mesh>
      {look && (
        <group position-y={SOIL_Y}>
          <Plant
            slot={slot}
            state={look.state}
            growth={look.growth}
            colors={colors}
            art={art}
            wholeScale={look.wholeScale}
          />
        </group>
      )}
    </group>
  );
});

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
  art,
  testKeys,
}: {
  colors: SceneColors;
  art: ArtColors;
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
  const test = testKeys
    ? {
        state: PLANT_STATES[stateIndex],
        growth: GROWTH_STEPS[growthIndex],
        wholeScale,
      }
    : null;

  return (
    <>
      {POT_SPOTS.map((_, slot) => (
        <Pot
          key={slot}
          slot={slot}
          test={test}
          bodyGeo={bodyGeo}
          soilGeo={soilGeo}
          colors={colors}
          art={art}
        />
      ))}
    </>
  );
}
