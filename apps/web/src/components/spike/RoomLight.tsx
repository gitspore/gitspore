import { useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

//
//
//

// The prototype's environment: a small made-up room, blurred into soft light
// from all around. Built once; the mode only changes how strong it is.
export function RoomLight({ intensity }: { intensity: number }) {
  const gl = useThree((state) => state.gl);

  const map = useMemo(() => {
    const generator = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    // 0.04: a little extra blur, like the prototype
    const texture = generator.fromScene(room, 0.04).texture;
    // The room and the generator's helpers are no longer needed
    room.dispose();
    generator.dispose();
    return texture;
  }, [gl]);

  return <Environment map={map} environmentIntensity={intensity} />;
}
