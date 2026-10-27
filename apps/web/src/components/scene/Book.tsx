import { Outlines, RoundedBox } from "@react-three/drei";

import { useGreenhouseStore } from "@/lib/client/GreenhouseClientProvider";
import { agentByKey } from "@/lib/store/selectors";
import { BOOK_SPOT, BOOK_TURN } from "./layout";
import { useClickable } from "./useClickable";
import { Beetle } from "./Beetle";

//
//
//
// The book's size: the cover's width (x, spine to front edge), depth (z)
// and full height; BOARD is each board's thickness, OVERHANG how far the
// cover sticks out past the pages
const BOOK_WIDTH = 1.1;
const BOOK_DEPTH = 1.5;
const BOOK_HEIGHT = 0.28;
const BOARD = 0.05;
const OVERHANG = 0.05;

const PAGES_WIDTH = BOOK_WIDTH - BOARD - OVERHANG;
const PAGES_DEPTH = BOOK_DEPTH - 2 * OVERHANG;
const PAGES_HEIGHT = BOOK_HEIGHT - 2 * BOARD;

// The overview book, lying on its back at BOOK_SPOT, spine to the left:
// - back board on the table, front board on top, spine joining them
// - the page block between the boards, against the spine, so the cover
//   overhangs it on the three open sides
// - all parts cast and receive shadows
export function Book({
  cover,
  pages,
  outline,
  logo,
}: {
  cover: string;
  pages: string;
  outline: string;
  logo: { ink: string; leaf: string; seam: string; glow: number };
}) {
  const [x, z] = BOOK_SPOT;
  const hasOverview = useGreenhouseStore(
    (state) => agentByKey(0)(state) !== null,
  );
  const pressSlot = useGreenhouseStore((state) => state.pressSlot);
  const { hovered, handlers } = useClickable(
    hasOverview ? () => pressSlot(0) : null,
  );

  return (
    <group position={[x, 0, z]} rotation-y={BOOK_TURN} {...handlers}>
      {[BOARD / 2, BOOK_HEIGHT - BOARD / 2].map((y) => (
        <RoundedBox
          key={y}
          args={[BOOK_WIDTH, BOARD, BOOK_DEPTH]}
          radius={0.02}
          position-y={y}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={cover} roughness={0.7} />
          {hovered && <Outlines thickness={3} color={outline} />}
        </RoundedBox>
      ))}
      <RoundedBox
        args={[BOARD, BOOK_HEIGHT, BOOK_DEPTH]}
        radius={0.02}
        position={[-(BOOK_WIDTH - BOARD) / 2, BOOK_HEIGHT / 2, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={cover} roughness={0.7} />
        {hovered && <Outlines thickness={3} color={outline} />}
      </RoundedBox>
      <mesh
        position={[
          -BOOK_WIDTH / 2 + BOARD + PAGES_WIDTH / 2,
          BOOK_HEIGHT / 2,
          0,
        ]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[PAGES_WIDTH, PAGES_HEIGHT, PAGES_DEPTH]} />
        <meshStandardMaterial color={pages} roughness={0.95} />
        {hovered && <Outlines thickness={3} color={outline} />}
      </mesh>
      {/* The beetle emblem on the front board's top */}
      <group position-y={BOOK_HEIGHT}>
        <Beetle
          ink={logo.ink}
          plate={cover}
          leaf={logo.leaf}
          seam={logo.seam}
          glow={logo.glow}
        />
      </group>
    </group>
  );
}
