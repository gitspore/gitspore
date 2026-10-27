import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { Frog, type Seat } from "./Frog";
import { FLOOR_Y, POND_RADIUS, POND_SPOT } from "./layout";
import { seeded } from "./life";
import { paintedParts } from "./shapes";
import { WIND_DIR, windAt, windUniforms } from "./wind";

//
//
//
// A small pond in the grass left of the table, by day and at night: a
// ring of stones around clear water with a dark bed, two lily pads, reeds
// at its back swaying in the wind, two fish swimming slow loops under the
// surface, and the frog (see Frog) on its rim. Now and then a fish
// touches the surface and a ring spreads on the water.
// It sits a little above the floor, so the fish swim between the bed and
// the water's surface; everything here is in its own space, its origin
// on the floor at the pond's middle

// Heights above the floor: the bed, the fish, the water's surface, and
// the top of the flat stones the frog sits on; how far a fish rises when
// it touches the surface
const BED_Y = 0.004;
const FISH_Y = 0.038;
const WATER_Y = 0.09;
const SEAT_Y = 0.11;
const FISH_RISE = 0.015;
// How much longer and wider than their geometry the fish are (not
// higher, they have to fit under the water)
const FISH_SIZE: [number, number, number] = [1.4, 1, 1.4];
// The stones around the rim, and where along it (angle from +x toward
// +z, so negative is the back) the frog's flat seats lie
const STONES = 24;
const SEAT_ANGLES = [-1.6, -0.75, 0.05, 0.85, 1.75];
// The lily pads: x, z, radius; the frog can sit on the first
const LILIES: [number, number, number][] = [
  [-0.22, -0.28, 0.17],
  [0.3, 0.18, 0.12],
];
// Clumps of reeds at the back left: angle on the rim, blades in it
const REEDS: [number, number][] = [
  [-2.35, 7],
  [2.6, 5],
];
// Each fish's loop: its middle (x, z), its radii, how fast it goes round
// (radians a second, the sign is the way round), and where it starts
const FISH = [
  { x: -0.08, z: 0.05, rx: 0.38, rz: 0.3, speed: 0.4, phase: 0 },
  { x: 0.08, z: -0.04, rx: 0.3, rz: 0.36, speed: -0.3, phase: 2.5 },
];
// Rings on the water at once, and how long one spreads
const RIPPLES = 3;
const RIPPLE_SECONDS = 1.6;

// The stones: a ring of lumps around the water, each turned and squashed
// its own way, and a flat one at each of the frog's seats
function stoneMatrices() {
  const random = seeded(31);
  const matrix = new THREE.Matrix4();
  const out: number[] = [];
  const lay = (
    angle: number,
    radius: number,
    y: number,
    size: THREE.Vector3,
  ) => {
    matrix.makeRotationY(random() * Math.PI * 2);
    matrix.scale(size);
    matrix.setPosition(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    out.push(...matrix.elements);
  };
  for (let i = 0; i < STONES; i++) {
    const angle = ((i + random() * 0.6) / STONES) * Math.PI * 2;
    const size = 0.07 + random() * 0.05;
    lay(
      angle,
      POND_RADIUS + 0.03 + random() * 0.04,
      0.05,
      new THREE.Vector3(size * (1 + random() * 0.5), size * 0.6, size),
    );
  }
  for (const angle of SEAT_ANGLES) {
    lay(angle, POND_RADIUS + 0.05, 0.07, new THREE.Vector3(0.14, 0.05, 0.12));
  }
  return new Float32Array(out);
}

// The reeds of one clump around its foot: thin blades leaning out a
// little, the taller ones with a brown head
function reedGeometry(
  reed: string,
  cattail: string,
  blades: number,
  seed: number,
) {
  const random = seeded(seed);
  return paintedParts(
    Array.from({ length: blades }).flatMap(
      (_, index): [THREE.BufferGeometry, string][] => {
        const height = 0.3 + random() * 0.3;
        const tiltX = (random() - 0.5) * 0.4;
        const tiltZ = (random() - 0.5) * 0.4;
        const x = (random() - 0.5) * 0.14;
        const z = (random() - 0.5) * 0.1;
        const stand = (geometry: THREE.BufferGeometry) =>
          geometry.rotateX(tiltX).rotateZ(tiltZ).translate(x, 0, z);
        const blade: [THREE.BufferGeometry, string] = [
          stand(
            new THREE.ConeGeometry(0.012, height, 4).translate(
              0,
              height / 2,
              0,
            ),
          ),
          reed,
        ];
        if (index % 2 === 1) return [blade];
        return [
          blade,
          [
            stand(
              new THREE.CylinderGeometry(0.02, 0.02, 0.08, 6).translate(
                0,
                height * 0.75,
                0,
              ),
            ),
            cattail,
          ],
        ];
      },
    ),
  );
}

// A fish facing +z: a slim body in its colour with a patch of the other
// on its back and two dark eyes. The tail is its own (it wags)
function fishGeometry(color: string, patch: string, dark: string) {
  return paintedParts([
    [new THREE.SphereGeometry(1, 10, 8).scale(0.028, 0.03, 0.075), color],
    [
      new THREE.SphereGeometry(1, 8, 6)
        .scale(0.02, 0.012, 0.03)
        .translate(0, 0.022, 0.005),
      patch,
    ],
    [new THREE.SphereGeometry(0.007, 4, 3).translate(0.02, 0.008, 0.05), dark],
    [new THREE.SphereGeometry(0.007, 4, 3).translate(-0.02, 0.008, 0.05), dark],
  ]);
}

// A tail fin fanning back from its root (the origin), thin and upright
function tailGeometry() {
  return new THREE.ConeGeometry(0.035, 0.06, 4)
    .rotateX(Math.PI / 2)
    .scale(0.2, 1, 1)
    .translate(0, 0, -0.03);
}

// Where a fish is at `angle` on its loop, the loop a little wobbly
function onLoop(
  fish: (typeof FISH)[number],
  angle: number,
  into: THREE.Vector3,
) {
  const wobble = 1 + 0.15 * Math.sin(angle * 2 + fish.phase);
  return into.set(
    fish.x + Math.cos(angle) * fish.rx * wobble,
    FISH_Y,
    fish.z + Math.sin(angle) * fish.rz * wobble,
  );
}

export function Pond({
  water,
  bed,
  stone,
  reed,
  cattail,
  lily,
  ripple,
  waterOpacity,
  frog,
  fish1,
  fish2,
  dark,
  reducedMotion,
}: {
  water: string;
  bed: string;
  stone: string;
  reed: string;
  cattail: string;
  lily: string;
  ripple: string;
  waterOpacity: number;
  frog: { skin: string; belly: string; spot: string; eye: string };
  fish1: string;
  fish2: string;
  dark: string;
  reducedMotion: boolean;
}) {
  const random = useMemo(() => seeded(47), []);
  const stones = useMemo(() => stoneMatrices(), []);
  const reeds = useMemo(
    () =>
      REEDS.map(([, blades], index) =>
        reedGeometry(reed, cattail, blades, 61 + index),
      ),
    [reed, cattail],
  );
  const pads = useMemo(
    () =>
      paintedParts(
        LILIES.map(([x, z, radius], index) => [
          new THREE.CircleGeometry(
            radius,
            16,
            0.3 + index * 2,
            Math.PI * 2 - 0.5,
          )
            .rotateX(-Math.PI / 2)
            .translate(x, 0, z),
          lily,
        ]),
      ),
    [lily],
  );
  const fishes = useMemo(
    () => [fishGeometry(fish1, fish2, dark), fishGeometry(fish2, fish1, dark)],
    [fish1, fish2, dark],
  );
  const tail = useMemo(() => tailGeometry(), []);
  useEffect(
    () => () => reeds.forEach((geometry) => geometry.dispose()),
    [reeds],
  );
  useEffect(() => () => pads.dispose(), [pads]);
  useEffect(
    () => () => fishes.forEach((geometry) => geometry.dispose()),
    [fishes],
  );
  useEffect(() => () => tail.dispose(), [tail]);

  // The frog's seats: the flat stones, facing the water, and the big lily
  // pad, facing the camera
  const seats = useMemo<Seat[]>(
    () => [
      ...SEAT_ANGLES.map((angle) => ({
        at: new THREE.Vector3(
          Math.cos(angle) * (POND_RADIUS + 0.05),
          SEAT_Y,
          Math.sin(angle) * (POND_RADIUS + 0.05),
        ),
        heading: Math.atan2(-Math.cos(angle), -Math.sin(angle)),
      })),
      {
        at: new THREE.Vector3(LILIES[0][0], WATER_Y + 0.005, LILIES[0][1]),
        heading: 0.3,
      },
    ],
    [],
  );

  const reedClumps = useRef<(THREE.Group | null)[]>([]);
  const fishBodies = useRef<(THREE.Group | null)[]>([]);
  const tails = useRef<(THREE.Group | null)[]>([]);
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const ringLooks = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  // Each fish's angle on its loop and how far it is up (1 at the surface,
  // easing back), each ring's age and size, the pond's own clock
  const pond = useRef({
    angles: FISH.map((one) => one.phase),
    rises: FISH.map(() => 0),
    ripples: Array.from({ length: RIPPLES }, () => ({
      age: RIPPLE_SECONDS,
      size: 1,
    })),
    time: 0,
  });
  const place = useMemo(() => new THREE.Vector3(), []);
  const ahead = useMemo(() => new THREE.Vector3(), []);

  // A ring spreading from (x, z) on the water; it takes the oldest ring
  const splash = useCallback((x: number, z: number, size: number) => {
    const state = pond.current;
    let oldest = 0;
    state.ripples.forEach((one, index) => {
      if (one.age > state.ripples[oldest].age) oldest = index;
    });
    state.ripples[oldest].age = 0;
    state.ripples[oldest].size = size;
    rings.current[oldest]?.position.set(x, WATER_Y + 0.002, z);
  }, []);

  useFrame((_, delta) => {
    const state = pond.current;
    const dt = reducedMotion ? 0 : Math.min(delta, 1 / 30);
    state.time += dt;

    // The fish go round their loops, now one a little faster, now slower,
    // wagging their tails; now and then one rises to touch the surface
    FISH.forEach((one, index) => {
      const body = fishBodies.current[index];
      if (!body) return;
      state.angles[index] +=
        dt * one.speed * (1 + 0.3 * Math.sin(state.time * 0.4 + one.phase));
      const angle = state.angles[index];
      onLoop(one, angle, place);
      onLoop(one, angle + Math.sign(one.speed) * 0.01, ahead);
      if (dt > 0 && state.rises[index] === 0 && random() < dt * 0.06) {
        state.rises[index] = 1;
      }
      const rise = state.rises[index];
      if (rise > 0) {
        state.rises[index] = Math.max(0, rise - dt * 0.8);
        if (rise > 0.5 && state.rises[index] <= 0.5)
          splash(place.x, place.z, 0.4);
      }
      body.position.set(
        place.x,
        place.y + Math.sin(rise * Math.PI) * FISH_RISE,
        place.z,
      );
      body.rotation.y = Math.atan2(ahead.x - place.x, ahead.z - place.z);
      const wag = tails.current[index];
      if (wag) wag.rotation.y = Math.sin(state.time * 7 + one.phase) * 0.45;
    });

    // The rings spread and fade
    state.ripples.forEach((one, index) => {
      one.age = Math.min(one.age + dt, RIPPLE_SECONDS);
      const along = one.age / RIPPLE_SECONDS;
      const ring = rings.current[index];
      const look = ringLooks.current[index];
      if (!ring || !look) return;
      ring.visible = along < 1;
      ring.scale.setScalar(one.size * (0.04 + 0.22 * along));
      look.opacity = (1 - along) * 0.7;
    });

    // The reeds bend with the wind, still under reduced motion
    const time = windUniforms.uWindTime.value;
    const motion = windUniforms.uWindMotion.value;
    reedClumps.current.forEach((clump) => {
      if (!clump) return;
      const { x, z } = clump.position;
      const bend =
        (windAt(POND_SPOT[0] + x, POND_SPOT[1] + z, time) - 0.45) *
        0.12 *
        motion;
      clump.rotation.set(bend * WIND_DIR.y, 0, -bend * WIND_DIR.x);
    });
  });

  return (
    <group position={[POND_SPOT[0], FLOOR_Y, POND_SPOT[1]]}>
      <mesh rotation-x={-Math.PI / 2} position-y={BED_Y} receiveShadow>
        <circleGeometry args={[POND_RADIUS + 0.08, 24]} />
        <meshStandardMaterial color={bed} roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={WATER_Y}>
        <circleGeometry args={[POND_RADIUS + 0.03, 24]} />
        <meshStandardMaterial
          color={water}
          transparent
          opacity={waterOpacity}
          depthWrite={false}
          roughness={0.15}
        />
      </mesh>
      <mesh geometry={pads} position-y={WATER_Y + 0.003} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.6} />
      </mesh>
      <instancedMesh
        args={[undefined, undefined, stones.length / 16]}
        castShadow
        receiveShadow
      >
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={stone} roughness={0.9} flatShading />
        <instancedBufferAttribute attach="instanceMatrix" args={[stones, 16]} />
      </instancedMesh>
      {REEDS.map(([angle], index) => (
        <group
          key={angle}
          ref={(clump) => {
            reedClumps.current[index] = clump;
          }}
          position={[
            Math.cos(angle) * (POND_RADIUS + 0.1),
            0,
            Math.sin(angle) * (POND_RADIUS + 0.1),
          ]}
        >
          <mesh geometry={reeds[index]} castShadow>
            <meshStandardMaterial vertexColors roughness={0.8} />
          </mesh>
        </group>
      ))}
      {FISH.map((one, index) => (
        <group
          key={one.phase}
          ref={(body) => {
            fishBodies.current[index] = body;
          }}
          scale={FISH_SIZE}
        >
          <mesh geometry={fishes[index]}>
            <meshStandardMaterial vertexColors roughness={0.4} />
          </mesh>
          <group
            ref={(wag) => {
              tails.current[index] = wag;
            }}
            position-z={-0.065}
          >
            <mesh geometry={tail}>
              <meshStandardMaterial
                color={index === 0 ? fish1 : fish2}
                roughness={0.4}
              />
            </mesh>
          </group>
        </group>
      ))}
      {Array.from({ length: RIPPLES }, (_, index) => (
        <mesh
          key={index}
          ref={(ring) => {
            rings.current[index] = ring;
          }}
          rotation-x={-Math.PI / 2}
          visible={false}
        >
          <ringGeometry args={[0.85, 1, 32]} />
          <meshStandardMaterial
            ref={(look) => {
              ringLooks.current[index] = look;
            }}
            color={ripple}
            transparent
            depthWrite={false}
            roughness={0.3}
          />
        </mesh>
      ))}
      <Frog
        seats={seats}
        water={WATER_Y}
        skin={frog.skin}
        belly={frog.belly}
        spot={frog.spot}
        eye={frog.eye}
        dark={dark}
        splash={splash}
        reducedMotion={reducedMotion}
      />
    </group>
  );
}
