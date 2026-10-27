import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useCursor } from "@react-three/drei";
import * as THREE from "three";

import {
  BOOK_SPOT,
  MAP_SPOT,
  POT_SPOTS,
  SEED_SPOTS,
  TABLE_BACK,
  TEACUP_SPOT,
  TABLE_FRONT,
  TABLE_HALF_WIDTH,
} from "./layout";
import { seeded } from "./life";

//
//
//
// A ladybug living on the table. It crawls slowly, wandering, around the
// pots, the book, the map and the seed packets, stops now and then, and
// turns back at the edge. Point at it and it plays dead; click it and it
// opens its wings and flies off in an arc to somewhere else on the table

// Crawling speed (units a second), how hard it turns, and where it may go:
// the table top, less a margin at the edge
const CRAWL = 0.11;
const TURN = 2.2;
const EDGE = 0.25;
// What it walks around: [x, z, radius]. The pots' rims, the book, the map,
// the cup of tea and the seed packets' spots
const OBSTACLES: [number, number, number][] = [
  ...POT_SPOTS.map(([x, z]): [number, number, number] => [x, z, 0.85]),
  [BOOK_SPOT[0], BOOK_SPOT[1], 0.95],
  [MAP_SPOT[0], MAP_SPOT[1], 0.8],
  [TEACUP_SPOT[0], TEACUP_SPOT[1], 0.5],
  ...SEED_SPOTS.map(([x, z]): [number, number, number] => [x, z, 0.4]),
];
// How much bigger than life it is drawn, so it reads from the camera
const SIZE = 1.5;
// A flight: how long, and how high the arc goes
const FLIGHT_SECONDS = 1.8;
const FLIGHT_HEIGHT = 1.1;

// Is (x, z) a place to crawl: on the table and clear of everything?
function free(x: number, z: number) {
  if (Math.abs(x) > TABLE_HALF_WIDTH - EDGE) return false;
  if (z < TABLE_BACK + EDGE || z > TABLE_FRONT - EDGE) return false;
  return OBSTACLES.every(([ox, oz, r]) => Math.hypot(x - ox, z - oz) > r);
}

// A free spot at random (the gaps between the pots are free)
function freeSpot(random: () => number): [number, number] {
  for (let i = 0; i < 200; i++) {
    const x = (random() * 2 - 1) * (TABLE_HALF_WIDTH - EDGE);
    const z =
      TABLE_BACK + EDGE + random() * (TABLE_FRONT - TABLE_BACK - 2 * EDGE);
    if (free(x, z)) return [x, z];
  }
  return [0, -0.6];
}

// The shell: half a sphere, its vertices dark where they fall on one of
// the spots or on the seam down the middle, red elsewhere. Spots as
// (x, z) on the unit shell
const SPOTS: [number, number][] = [
  [0.45, 0.35],
  [-0.45, 0.35],
  [0.55, -0.3],
  [-0.55, -0.3],
  [0.25, -0.7],
  [-0.25, -0.7],
];

function shellGeometry(red: string, dark: string) {
  const geometry = new THREE.SphereGeometry(
    1,
    20,
    12,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  );
  const position = geometry.attributes.position;
  const colors: number[] = [];
  const paint = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const onSpot = SPOTS.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < 0.2);
    const onSeam = Math.abs(x) < 0.05 && z < 0.75;
    paint.set(onSpot || onSeam ? dark : red);
    colors.push(paint.r, paint.g, paint.b);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.scale(0.05, 0.038, 0.06);
  return geometry;
}

export function Ladybug({
  red,
  dark,
  wingOpacity,
  reducedMotion,
}: {
  red: string;
  dark: string;
  wingOpacity: number;
  reducedMotion: boolean;
}) {
  const random = useMemo(() => seeded(41), []);
  const shell = useMemo(() => shellGeometry(red, dark), [red, dark]);
  useEffect(() => () => shell.dispose(), [shell]);
  // A wing: a long oval hinged at the middle of the back, mirrored for
  // the left one
  const wing = useMemo(
    () =>
      new THREE.CircleGeometry(1, 12)
        .scale(0.04, 0.065, 1)
        .rotateX(-Math.PI / 2)
        .translate(0.04, 0, -0.015),
    [],
  );
  useEffect(() => () => wing.dispose(), [wing]);

  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const wings = useRef<(THREE.Mesh | null)[]>([]);
  // Where it is and faces, whether it crawls, rests or flies (and for how
  // long), and the flight's start and end
  const bug = useRef({
    x: -1.1,
    z: -0.5,
    heading: 0.6,
    rest: 0,
    walked: 0,
    flight: -1,
    from: new THREE.Vector2(),
    to: new THREE.Vector2(),
  });

  // Pointed at: a hand, and it stops (plays dead). Clicked: off it flies.
  // stopPropagation, so the pot or table under it doesn't take the click
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const onClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    const state = bug.current;
    if (state.flight >= 0 || reducedMotion) return;
    state.from.set(state.x, state.z);
    state.to.set(...freeSpot(random));
    state.flight = 0;
  };

  useFrame(({ clock }, delta) => {
    const root = group.current;
    if (!root) return;
    const state = bug.current;
    const time = clock.elapsedTime;
    const dt = Math.min(delta, 1 / 30);
    let lift = 0;
    let crawling = false;

    if (reducedMotion) {
      // still, where it is
    } else if (state.flight >= 0) {
      // Flying: along the arc, turned toward where it lands
      state.flight += dt / FLIGHT_SECONDS;
      const along = Math.min(state.flight, 1);
      const eased = along * along * (3 - 2 * along);
      state.x = THREE.MathUtils.lerp(state.from.x, state.to.x, eased);
      state.z = THREE.MathUtils.lerp(state.from.y, state.to.y, eased);
      lift = Math.sin(along * Math.PI) * FLIGHT_HEIGHT;
      state.heading = Math.atan2(
        state.to.x - state.from.x,
        state.to.y - state.from.y,
      );
      if (along >= 1) state.flight = -1;
    } else if (hovered) {
      // playing dead
    } else if (state.rest > 0) {
      state.rest -= dt;
    } else {
      // Crawling: wander a little left and right; if the way ahead isn't
      // free, turn away until it is. Every few seconds, a rest
      crawling = true;
      state.heading += Math.sin(time * 0.7 + Math.sin(time * 0.23) * 3) * dt;
      const aheadX = state.x + Math.sin(state.heading) * 0.2;
      const aheadZ = state.z + Math.cos(state.heading) * 0.2;
      if (!free(aheadX, aheadZ)) {
        state.heading += TURN * dt;
      } else {
        state.x += Math.sin(state.heading) * CRAWL * dt;
        state.z += Math.cos(state.heading) * CRAWL * dt;
      }
      state.walked += dt;
      if (state.walked > 6 && random() < dt * 0.3) {
        state.rest = 1 + random() * 3;
        state.walked = 0;
      }
    }

    root.position.set(state.x, lift, state.z);
    root.rotation.y = state.heading;
    // A waddle while it crawls
    if (body.current) {
      body.current.rotation.z = crawling ? Math.sin(time * 16) * 0.08 : 0;
    }
    const flying = state.flight >= 0;
    const beat = 0.6 + 0.4 * Math.sin(time * 80);
    wings.current.forEach((wing, index) => {
      if (!wing) return;
      wing.visible = flying;
      wing.rotation.z = (index === 0 ? 1 : -1) * beat;
    });
  });

  return (
    <group ref={group} scale={SIZE}>
      <group ref={body}>
        <mesh geometry={shell} castShadow>
          <meshStandardMaterial vertexColors roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.012, 0.058]} castShadow>
          <sphereGeometry args={[0.024, 10, 8]} />
          <meshStandardMaterial color={dark} roughness={0.6} />
        </mesh>
      </group>
      {[1, -1].map((side, index) => (
        <mesh
          key={side}
          ref={(mesh) => {
            wings.current[index] = mesh;
          }}
          geometry={wing}
          position-y={0.04}
          scale-x={side}
          visible={false}
        >
          <meshStandardMaterial
            transparent
            opacity={wingOpacity}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
      {/* A bigger, invisible target, so the small bug is easy to hit.
          An invisible material is never drawn but still takes the ray */}
      <mesh
        position-y={0.04}
        onClick={onClick}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[0.16, 8, 6]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </group>
  );
}
