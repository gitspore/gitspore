import { Outlines, Text } from "@react-three/drei";
import { useShallow } from "zustand/react/shallow";
import type { Issue } from "@gitspore/shared";

import { useGreenhouseStore } from "@/lib/client/GreenhouseClientProvider";
import { openIssuesWithoutAgent } from "@/lib/store/selectors";
import { TAG_FONT } from "./fonts";
import { SEED_SPOTS } from "./layout";
import { useClickable } from "./useClickable";

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
  const issuesOpen = useGreenhouseStore(
    (state) => state.layout.sidePanel === "issues",
  );
  const setSidePanel = useGreenhouseStore((state) => state.setSidePanel);
  const toggleIssues = () => setSidePanel(issuesOpen ? null : "issues");

  return issues
    .slice(0, SEED_SPOTS.length)
    .map((issue, index) => (
      <SeedPacket
        key={issue.number}
        issue={issue}
        spot={SEED_SPOTS[index]}
        colors={colors}
        onOpen={toggleIssues}
      />
    ));
}

// One packet: a plain box (RoundedBox's smoothed normals shade a top this
// thin with a round gradient), a band at the back with SEEDS and a leaf,
// the number under the band, the title under that.
// - every print part lies flat on the top (turned −90° around x)
// - SEEDS is lit (troika's default isn't),
//   so it dims at night and doesn't glow
// - hovering shows a hand and the packet's outline
function SeedPacket({
  issue,
  spot: [x, z, turn],
  colors,
  onOpen,
}: {
  issue: Issue;
  spot: [number, number, number];
  colors: PacketColors;
  onOpen: () => void;
}) {
  const { hovered, handlers } = useClickable(onOpen);
  const lyingFlat = { "rotation-x": -Math.PI / 2 } as const;

  return (
    <group position={[x, 0, z]} rotation-y={turn} {...handlers}>
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
