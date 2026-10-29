import { useEffect, memo, useMemo, useState } from "react";
import * as THREE from "three";
import { Outlines } from "@react-three/drei";
import { useClickable } from "./useClickable";

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

import type { AgentStatus } from "@gitspore/shared";
import {
  RING_COLORS,
  STATUS_VISUALS,
  WILT_PLANTS,
  type RingColor,
} from "./statusVisuals";
import { RING_RADIUS, RING_TUBE, StatusRing } from "./StatusRing";
import { NameTag, type TagColors } from "./NameTag";
import { useSeedDrag } from "./seedDrag";
import { Burst, type BurstKind } from "./Burst";
import { useReducedMotion } from "./life";
import { WateringCan } from "./WateringCan";

//
//
//
type Shapes = {
  bodyGeo: THREE.BufferGeometry;
  soilGeo: THREE.BufferGeometry;
  ringGeo: THREE.BufferGeometry;
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
// and an outline. A press that moved more than DRAG_PX before the
// release was an orbit drag, not a click
const Pot = memo(function Pot({
  slot,
  test,
  colors,
  art,
  ringColors,
  glow,
  bodyGeo,
  soilGeo,
  ringGeo,
  tag,
}: {
  slot: number;
  test: PlantLook | null;
  colors: SceneColors;
  art: ArtColors;
  ringColors: Record<RingColor, string>;
  glow: number;
  tag: TagColors;
} & Shapes) {
  const agent = useGreenhouseStore(agentBySlot(slot));
  const [x, z] = POT_SPOTS[slot];
  const stage = useNowSelect((now) =>
    agent && now !== 0 ? wiltStage(agent, now) : null,
  );
  const look = test ?? (agent ? agentLook(agent.status, stage) : null);
  // The rim ring from the agent's status,
  // pulsing in the first wilt stage;
  // none while the test keys run
  const ring = !test && agent ? RING_COLORS[agent.status] : null;

  const openWindow = useGreenhouseStore((state) => state.openWindow);
  const { hovered, handlers } = useClickable(
    agent ? (shift) => openWindow(agent.id, { alone: !shift }) : null,
  );
  // During a seed packet drag: the outline marks the free pot
  // the packet would land in, and hovering doesn't outline
  // (a planted pot isn't a place to drop)
  const targeted = useSeedDrag((state) => state.target === slot);
  const dragging = useSeedDrag((state) => state.issue !== null);
  const outlined = targeted || (hovered && !dragging);

  // A burst when something happens to this pot while the page is open:
  // soil flies up when an agent is planted, petals when its branch is
  // merged. The pot keeps what it saw last and compares while rendering;
  // on page load it has seen everything, so nothing bursts
  const reducedMotion = useReducedMotion();
  const seeing = { id: agent?.id ?? null, merged: agent?.status === "merged" };
  const [seen, setSeen] = useState(seeing);
  const [burst, setBurst] = useState<{ kind: BurstKind; count: number }>();
  if (seen.id !== seeing.id || seen.merged !== seeing.merged) {
    setSeen(seeing);
    const count = (burst?.count ?? 0) + 1;
    if (seeing.id && seeing.id !== seen.id) {
      setBurst({ kind: "soil", count });
    } else if (seeing.merged && !seen.merged) {
      setBurst({ kind: "petals", count });
    }
  }

  return (
    <group position={[x, 0, z]} {...handlers}>
      <mesh geometry={bodyGeo} castShadow receiveShadow>
        <meshStandardMaterial
          color={colors.pot}
          roughness={0.9}
          shadowSide={THREE.FrontSide}
        />
        {outlined && <Outlines thickness={3} color={colors.heart} />}
      </mesh>
      <mesh
        geometry={soilGeo}
        receiveShadow
        rotation-x={-Math.PI / 2}
        position-y={SOIL_Y + 0.005}
      >
        <meshStandardMaterial color={colors.soil} roughness={1} />
      </mesh>
      {ring && (
        <StatusRing
          geometry={ringGeo}
          color={ringColors[ring]}
          glow={glow}
          pulse={stage === "pulse"}
        />
      )}

      {agent?.issueNumber != null && (
        <NameTag issueNumber={agent.issueNumber} soilY={SOIL_Y} colors={tag} />
      )}

      {look && (
        <group position-y={SOIL_Y}>
          <Plant
            slot={slot}
            state={look.state}
            growth={look.growth}
            colors={colors}
            art={art}
            wholeScale={look.wholeScale}
            touched={hovered}
          />
        </group>
      )}

      {agent?.status === "working" && (
        <WateringCan
          slot={slot}
          soilY={SOIL_Y}
          color={colors["watering-can"]}
          drop={colors.drop}
          glow={glow}
          reducedMotion={reducedMotion}
        />
      )}
      {burst && !reducedMotion && (
        <Burst
          key={burst.count}
          kind={burst.kind}
          colors={
            burst.kind === "soil" ? [colors.soil] : [art.petal, art.heart]
          }
          y={SOIL_Y}
        />
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
  ringColors,
  glow,
  tag,
  testKeys,
}: {
  colors: SceneColors;
  art: ArtColors;
  ringColors: Record<RingColor, string>;
  glow: number;
  tag: TagColors;
  testKeys: boolean;
}) {
  const bodyGeo = useMemo(() => new THREE.LatheGeometry(POT_PROFILE, 24), []);
  const soilGeo = useMemo(() => new THREE.CircleGeometry(SOIL_R, 24), []);
  const ringGeo = useMemo(
    () => new THREE.TorusGeometry(RING_RADIUS, RING_TUBE, 10, 64),
    [],
  );

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
          ringGeo={ringGeo}
          ringColors={ringColors}
          glow={glow}
          tag={tag}
        />
      ))}
    </>
  );
}
