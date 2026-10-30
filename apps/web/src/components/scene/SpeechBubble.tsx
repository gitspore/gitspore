import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Billboard, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";

import type { WiltStage } from "@/lib/store/wilting";

import { TAG_FONT } from "./fonts";
import type { TagColors } from "./NameTag";

//
//
//
// bubble size and the tail's tip below it
const WIDTH = 1.5;
const HEIGHT = 0.5;
const RADIUS = 0.2;
const TAIL_HALF = 0.1;
const TAIL_LENGTH = 0.22;
const BORDER = 0.035;
// the bubble's height above the soil, its tail tip at the plant's crown
const BUBBLE_Y = 1.95;

// How far a stage wobbles the bubble (rad) and how fast (rad/s): more
// insistent the longer the agent has waited
const WOBBLE: Record<WiltStage, { angle: number; speed: number }> = {
  pulse: { angle: 0.03, speed: 4 },
  droop: { angle: 0.07, speed: 6 },
  yellow: { angle: 0.12, speed: 9 },
};

// The words are German on purpose (the garden's humour)
const SAY = "gieß mich!!!";

// A rounded rectangle whose bottom edge has a tail pointing down, the tip at
// (0, 0); grown by `grow` on every side for the outline
function bubbleShape(grow: number) {
  const w = WIDTH / 2 + grow;
  const r = RADIUS + grow;
  const bottom = TAIL_LENGTH - grow;
  const top = TAIL_LENGTH + HEIGHT + grow;
  const s = new THREE.Shape();
  s.moveTo(-w + r, bottom);
  s.lineTo(-TAIL_HALF - grow, bottom);
  s.lineTo(0, grow ? -grow : 0);
  s.lineTo(TAIL_HALF + grow, bottom);
  s.lineTo(w - r, bottom);
  s.quadraticCurveTo(w, bottom, w, bottom + r);
  s.lineTo(w, top - r);
  s.quadraticCurveTo(w, top, w - r, top);
  s.lineTo(-w + r, top);
  s.quadraticCurveTo(-w, top, -w, top - r);
  s.lineTo(-w, bottom + r);
  s.quadraticCurveTo(-w, bottom, -w + r, bottom);
  return s;
}

// A thirsty plant's cartoon speech bubble "gieß mich!!!" above the pot,
// turned toward the camera, its tail pointing down at the plant.
// - the tag's paper, line and ink colours
// - wobbles by wilt stage, written to a ref in useFrame (no React state);
// with reduced motion it stands still
export function SpeechBubble({
  soilY,
  stage,
  colors,
  reducedMotion,
}: {
  soilY: number;
  stage: WiltStage;
  colors: TagColors;
  reducedMotion: boolean;
}) {
  const wobble = useRef<THREE.Group>(null);
  const [fill, border] = useMemo(
    () => [
      new THREE.ShapeGeometry(bubbleShape(0)),
      new THREE.ShapeGeometry(bubbleShape(BORDER)),
    ],
    [],
  );

  useFrame(({ clock }) => {
    const group = wobble.current;
    if (!group || reducedMotion) {
      return;
    }
    const { angle, speed } = WOBBLE[stage];
    group.rotation.z = Math.sin(clock.elapsedTime * speed) * angle;
  });

  return (
    <Billboard position-y={soilY + BUBBLE_Y}>
      {/* pivot at the tail tip, so the bubble swings above the plant */}
      <group ref={wobble}>
        <mesh geometry={border} position-z={-0.002}>
          <meshBasicMaterial color={colors.line} toneMapped={false} />
        </mesh>
        <mesh geometry={fill}>
          <meshBasicMaterial color={colors.paper} toneMapped={false} />
        </mesh>
        <Text
          font={TAG_FONT}
          fontSize={0.24}
          color={colors.ink}
          anchorX="center"
          anchorY="middle"
          position={[0, TAIL_LENGTH + HEIGHT / 2, 0.002]}
        >
          {SAY}
        </Text>
      </group>
    </Billboard>
  );
}
