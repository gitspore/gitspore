import { Outlines, Text } from "@react-three/drei";
import { useShallow } from "zustand/react/shallow";
import type { Issue, ServerError } from "@gitspore/shared";

import { useGreenhouseStore } from "@/lib/client/GreenhouseClientProvider";
import { freeSlots, openIssuesWithoutAgent } from "@/lib/store/selectors";
import { TAG_FONT } from "./fonts";
import { SEED_SPOTS, potAt } from "./layout";
import { useRef, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useSeedDrag } from "./seedDrag";
import { DRAG_PX, useClickable } from "./useClickable";

//
//
//
// packet's size, band.
// the "print" lies above the paper,
// the band's print (SEEDS, leaf) above the band.
const PACKET_WIDTH = 0.52;
const PACKET_DEPTH = 0.68;
const PACKET_THICKNESS = 0.014;
const BAND_DEPTH = 0.18;
const ON_TOP = PACKET_THICKNESS + 0.002;
const ON_BAND = ON_TOP + 0.002;
const TITLE_MAX = 40;

// A dragged packet floats just above the pots' rim (1.1),
// on a flat plane at that height. The pointer's ray
// meets that plane right where the packet shows,
// so the packet stays under the pointer.
// hit: reused for the point, no new vector per move
const DRAG_HEIGHT = 1.2;
const DRAG_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DRAG_HEIGHT);
const hit = new THREE.Vector3();

// The print is laid out on a 256 × 336 canvas
// One canvas pixel in scene units,
// and a canvas point (left, top) →
// a point on the packet's top
// (x right, z toward the front)
const CANVAS_WIDTH = 256;
const CANVAS_HEIGHT = 336;
const CANVAS_PIXEL = PACKET_DEPTH / CANVAS_HEIGHT;

function onPacket(
  left: number,
  top: number,
  height = ON_TOP,
): [number, number, number] {
  return [
    (left / CANVAS_WIDTH - 0.5) * PACKET_WIDTH,
    height,
    (top / CANVAS_HEIGHT - 0.5) * PACKET_DEPTH,
  ];
}

// Long titles are cut with an ellipsis
// the Issues tab shows them whole
function shortTitle(title: string) {
  return title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX - 2)}…` : title;
}

type PacketColors = {
  paper: string;
  band: string;
  title: string;
  leaf: string;
  ink: string;
  muted: string;
  outline: string;
};

// The open issues without an agent
// as seed packets on the front strip:
// the first ones, up to the number of SEED_SPOTS;
//  the Issues tab lists all.
// Keyed by issue number,
// so when one is planted the rest move up a spot.
// A click on any packet toggles the Issues tab
export function SeedPackets({ colors }: { colors: PacketColors }) {
  const issues = useGreenhouseStore(useShallow(openIssuesWithoutAgent));

  const free = useGreenhouseStore(useShallow(freeSlots));

  const dispatchAgent = useGreenhouseStore((state) => state.dispatchAgent);
  const lastError = useGreenhouseStore((state) => state.lastError);

  // The packet just dropped on a pot, and the error there was then.
  // It stays hidden until the agent's patch takes the issue out of
  // the list; a new error (a refused dispatch) shows it again
  const [planting, setPlanting] = useState<{
    issue: number;
    error: ServerError | null;
  } | null>(null);
  if (planting && !issues.some((issue) => issue.number === planting.issue)) {
    setPlanting(null);
  }
  const hidden =
    planting && planting.error === lastError ? planting.issue : null;

  const plant = (issueNumber: number, slot: number) => {
    dispatchAgent(issueNumber, slot);
    setPlanting({ issue: issueNumber, error: lastError });
  };

  const issuesOpen = useGreenhouseStore(
    (state) => state.layout.sidePanel === "issues",
  );
  const setSidePanel = useGreenhouseStore((state) => state.setSidePanel);
  const toggleIssues = () => setSidePanel(issuesOpen ? null : "issues");

  return issues
    .filter((issue) => issue.number !== hidden)
    .slice(0, SEED_SPOTS.length)
    .map((issue, index) => (
      <SeedPacket
        key={issue.number}
        issue={issue}
        spot={SEED_SPOTS[index]}
        free={free}
        colors={colors}
        onOpen={toggleIssues}
        onPlant={(slot) => plant(issue.number, slot)}
      />
    ));
}

// One packet:
// a plain box
// (RoundedBox's smoothed normals shade top
// thin with a round gradient),
// a band at the back with SEEDS and a leaf,
// the number under the band, the title under that.
// - every print part lies flat on the top
// (turned −90° around x)
// - SEEDS is lit (troika's default isn't),
//   so it dims at night and doesn't glow
// - hovering shows a hand and the packet's outline
function SeedPacket({
  issue,
  spot: [x, z, turn],
  free,
  colors,
  onOpen,
  onPlant,
}: {
  issue: Issue;
  spot: [number, number, number];
  free: number[];
  colors: PacketColors;
  onOpen: () => void;
  onPlant: (slot: number) => void;
}) {
  const { hovered, handlers } = useClickable(onOpen);

  const group = useRef<THREE.Group>(null);
  // The press on this packet: where it started on the page,
  // and whether it became a drag. null: not pressed
  const press = useRef<{ x: number; y: number; dragged: boolean } | null>(null);

  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    (event.target as Element).setPointerCapture(event.pointerId);
    press.current = { x: event.clientX, y: event.clientY, dragged: false };
  };

  // Past DRAG_PX:
  // press becomes a drag;
  // from then on the packet follows
  // the point where the pointer's ray
  // meets the table, lifted,
  // without React render
  const onPointerMove = (event: ThreeEvent<PointerEvent>) => {
    const current = press.current;
    if (!current || !group.current) return;
    if (!current.dragged) {
      const moved = Math.hypot(
        event.clientX - current.x,
        event.clientY - current.y,
      );
      if (moved <= DRAG_PX) return;
      current.dragged = true;
      useSeedDrag.getState().start(issue.number);
    }
    if (event.ray.intersectPlane(DRAG_PLANE, hit)) {
      group.current.position.copy(hit);
      // The pot under the packet, if it's free;
      // the store only hears when that changes
      const slot = potAt(hit.x, hit.z);
      const target = slot !== null && free.includes(slot) ? slot : null;
      const drag = useSeedDrag.getState();
      if (target !== drag.target) drag.aim(target);
    }
  };

  // Release or cancel:
  // back to its spot (a jump), drag over
  const finish = () => {
    group.current?.position.set(x, 0, z);
    useSeedDrag.getState().end();
    press.current = null;
  };

  // Released over a free pot: plant there. A target is only
  // set during a drag, so a click never plants
  const onPointerUp = () => {
    const { target } = useSeedDrag.getState();
    if (target !== null) onPlant(target);
    finish();
  };

  const lyingFlat = { "rotation-x": -Math.PI / 2 } as const;

  return (
    <group
      ref={group}
      position={[x, 0, z]}
      rotation-y={turn}
      {...handlers}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={finish}
    >
      <mesh position-y={PACKET_THICKNESS / 2} castShadow receiveShadow>
        <boxGeometry args={[PACKET_WIDTH, PACKET_THICKNESS, PACKET_DEPTH]} />
        <meshStandardMaterial color={colors.paper} roughness={0.85} />
        {hovered && <Outlines thickness={3} color={colors.outline} />}
      </mesh>

      <mesh {...lyingFlat} position={onPacket(128, 46)}>
        <planeGeometry args={[PACKET_WIDTH, BAND_DEPTH]} />
        <meshStandardMaterial color={colors.band} roughness={0.85} />
      </mesh>
      <mesh
        {...lyingFlat}
        rotation-z={-0.6}
        scale={[14 * CANVAS_PIXEL, 30 * CANVAS_PIXEL, 1]}
        position={onPacket(198, 50, ON_BAND)}
      >
        <circleGeometry args={[1, 16]} />
        <meshStandardMaterial color={colors.leaf} roughness={0.8} />
      </mesh>
      <Text
        {...lyingFlat}
        font={TAG_FONT}
        fontSize={30 * CANVAS_PIXEL}
        anchorX="left"
        anchorY="bottom-baseline"
        position={onPacket(22, 58, ON_BAND)}
      >
        SEEDS
        <meshStandardMaterial
          attach="material"
          color={colors.title}
          roughness={0.85}
        />
      </Text>

      <Text
        {...lyingFlat}
        font={TAG_FONT}
        fontSize={76 * CANVAS_PIXEL}
        color={colors.ink}
        anchorX="left"
        anchorY="bottom-baseline"
        position={onPacket(20, 182)}
      >
        {`#${issue.number}`}
      </Text>
      <Text
        {...lyingFlat}
        font={TAG_FONT}
        fontSize={27 * CANVAS_PIXEL}
        lineHeight={32 / 27}
        maxWidth={PACKET_WIDTH - 44 * CANVAS_PIXEL}
        color={colors.muted}
        anchorX="left"
        anchorY="top"
        position={onPacket(22, 208)}
      >
        {shortTitle(issue.title)}
      </Text>
    </group>
  );
}
