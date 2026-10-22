import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

//
//
//
// Where the ring lies: on the pot's rim top (POT_PROFILE's 0.64–0.74 at
// y 1.1), and how fast it pulses (the prototype's 1.1 s)
export const RING_RADIUS = 0.69;
export const RING_TUBE = 0.035;
const RING_Y = 1.1;
const PULSE_SECONDS = 1.1;

// The glowing ring on a pot's rim.
// It gives off its own colour and skips
// tone mapping, so it blooms at night.
// useFrame sets the brightness on the
// material every frame, without a re-render:
// a wave between 0.3 and 1 of
// glow while it pulses, glow itself otherwise
export function StatusRing({
  geometry,
  color,
  glow,
  pulse,
}: {
  geometry: THREE.BufferGeometry;
  color: string;
  glow: number;
  pulse: boolean;
}) {
  const material = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    if (!material.current) {
      return;
    }
    const wave =
      (Math.sin((clock.elapsedTime * Math.PI * 2) / PULSE_SECONDS) + 1) / 2;
    material.current.emissiveIntensity = pulse
      ? glow * (0.3 + 0.7 * wave)
      : glow;
  });

  return (
    <mesh geometry={geometry} rotation-x={Math.PI / 2} position-y={RING_Y}>
      <meshStandardMaterial
        ref={material}
        color={color}
        emissive={color}
        toneMapped={false}
      />
    </mesh>
  );
}
