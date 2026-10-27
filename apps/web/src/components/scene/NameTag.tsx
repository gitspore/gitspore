import * as THREE from "three";
import { Text } from "@react-three/drei";

import { TAG_FONT } from "./fonts";

//
//
//
// stick and card size
const STICK_HEIGHT = 0.55;
const STICK_WIDTH = 0.035;
const CARD_WIDTH = 0.46;
const CARD_HEIGHT = 0.23;
const CARD_THICKNESS = 0.012;
const CARD_Y = 0.6;

export type TagColors = { paper: string; line: string; ink: string };

// A planted pot's name tag:
// a stick in the soil at the pot's back left,
// a paper card on top with "#number",
// turned toward the camera.
// - the card's shadowSide FrontSide, like the pot body
// - the number lies just in front of the card
export function NameTag({
  issueNumber,
  soilY,
  colors,
}: {
  issueNumber: number;
  soilY: number;
  colors: TagColors;
}) {
  return (
    <group
      position={[-0.32, soilY - 0.1, -0.22]}
      rotation={[-0.25, 0.25, 0.08]}
    >
      <mesh position={[0, STICK_HEIGHT / 2, -CARD_THICKNESS]} castShadow>
        <boxGeometry args={[STICK_WIDTH, STICK_HEIGHT, CARD_THICKNESS]} />
        <meshStandardMaterial color={colors.line} roughness={0.9} />
      </mesh>

      <mesh position-y={CARD_Y} castShadow>
        <boxGeometry args={[CARD_WIDTH, CARD_HEIGHT, CARD_THICKNESS]} />
        <meshStandardMaterial
          color={colors.paper}
          roughness={0.85}
          shadowSide={THREE.FrontSide}
        />
      </mesh>
      <Text
        font={TAG_FONT}
        fontSize={0.15}
        color={colors.ink}
        anchorX="center"
        anchorY="middle"
        position={[0, CARD_Y, CARD_THICKNESS / 2 + 0.002]}
      >
        {`#${issueNumber}`}
      </Text>
    </group>
  );
}
