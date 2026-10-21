import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useFrame } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";

//
//
//

// A rectangle on the page in CSS pixels, like getBoundingClientRect
type Area = { x: number; y: number; width: number; height: number };
const SIDES = ["x", "y", "width", "height"] as const;

// camera: where it stands, direction, and lens
// Below WIDE (width / height) the lens widens so all six pots fit.
// SPEED: framing following free area speed
const POSITION: [number, number, number] = [0, 8.2, 10.6];
const TARGET: [number, number, number] = [0, 0.2, 0.55];
const FOV = 32;
const WIDE = 1.6;
const SPEED = 9;

// The fixed camera frames the table into "sceneArea":
// the part of the page that panels and windows leave free.
// ?orbit=1 adds OrbitControls with the prototype's limits
export function CameraRig({
  sceneArea,
  orbit,
}: {
  sceneArea: RefObject<HTMLDivElement | null>;
  orbit: boolean;
}) {
  // goal: the free area as last measured
  // current: the area the camera frames now
  // With reduced motion framing jumps
  const camera = useRef<THREE.PerspectiveCamera>(null);
  const goal = useRef<Area | null>(null);
  const current = useRef<Area | null>(null);
  const [reducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  // Turn the camera toward the table once, before the first frame
  useLayoutEffect(() => {
    camera.current?.lookAt(...TARGET);
  }, []);

  // Measure free area size changes
  // (window resize, side panel, terminal band).
  // A hidden area (focus mode) measures 0 × 0 and
  // is skipped, so the camera keeps its last framing
  useEffect(() => {
    const element = sceneArea.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        goal.current = {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        };
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [sceneArea]);

  // Every frame, like the prototype's applyCamera:
  // 1. Ease current toward goal (or jump, the first time and with reduced
  //    motion). Until the first measurement, the whole canvas is the goal
  // 2. The lens: the aspect of the free area, so nothing stretches, and a
  //    wider fov when the area is narrower than WIDE
  // 3. The view offset: the camera's picture is the free area's size, and
  //    the canvas shows it shifted to the free area's spot
  useFrame((state, delta) => {
    const lens = camera.current;
    if (!lens) {
      return;
    }
    const area = goal.current ?? {
      x: 0,
      y: 0,
      width: state.size.width,
      height: state.size.height,
    };
    if (!current.current || reducedMotion) {
      current.current = { ...area };
    } else {
      const step = 1 - Math.exp(-SPEED * delta);
      for (const side of SIDES) {
        current.current[side] += (area[side] - current.current[side]) * step;
      }
    }

    const { x, y, width, height } = current.current;
    const aspect = width / height;
    const halfTan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    lens.aspect = aspect;
    lens.fov =
      aspect >= WIDE
        ? FOV
        : Math.min(
            70,
            THREE.MathUtils.radToDeg(2 * Math.atan((halfTan * WIDE) / aspect)),
          );

    lens.setViewOffset(
      width,
      height,
      -x,
      -y,
      state.size.width,
      state.size.height,
    );
  });

  // manual: R3F leaves aspect alone on resize; useFrame sets it
  return (
    <>
      <PerspectiveCamera
        ref={camera}
        makeDefault
        manual
        fov={FOV}
        near={0.1}
        far={200}
        position={POSITION}
      />
      {orbit && (
        <OrbitControls
          target={TARGET}
          enablePan={false}
          enableDamping
          minDistance={8}
          maxDistance={16}
          minAzimuthAngle={-0.45}
          maxAzimuthAngle={0.45}
          minPolarAngle={0.55}
          maxPolarAngle={1.15}
        />
      )}
    </>
  );
}
