import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { FLOOR_Y } from "./layout";
import { seeded } from "./life";
import { SHED_SPOT } from "./Surroundings";

//
//
//
// At night, now and then, a pair of eyes shines in the dark behind the
// fence: something low among the bushes, or an owl up in a tree. The eyes
// open, look around a little, blink, and after a few seconds close and
// are gone, to turn up somewhere else a while later. A few pairs, each on
// its own time. They glow (no tone mapping, no fog), so the night's bloom
// catches them. Off under reduced motion

const PAIRS = 3;
// An eye's size, and how far apart a pair's eyes are (half)
const EYE_SIZE = 0.08;
const EYE_GAP = 0.13;
// How long a pair watches, and how long it stays away (seconds)
const WATCH = [3, 7] as const;
const AWAY = [5, 16] as const;
// How fast the eyes open and close, and how long a blink takes
const OPEN_SPEED = 4;
const BLINK_SECONDS = 0.14;

type Watcher = {
  position: THREE.Vector3;
  watching: boolean;
  timer: number;
  open: number;
  blinkIn: number;
  blink: number;
  seed: number;
};

function between(random: () => number, [low, high]: readonly [number, number]) {
  return low + random() * (high - low);
}

// A new place deep behind the fence, mostly on the right (from back right
// round to the right side), now and then anywhere behind: mostly low among
// the bushes and trunks, sometimes high in a tree; never in the shed
const RIGHT_SHARE = 0.8;

function hideout(random: () => number, position: THREE.Vector3) {
  for (let i = 0; i < 20; i++) {
    const angle =
      random() < RIGHT_SHARE
        ? -1.35 + random() * 1.6
        : -Math.PI + 0.3 + random() * (Math.PI - 0.6);
    const owl = random() < 0.3;
    const distance = owl ? 20 + random() * 6 : 18 + random() * 7;
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    if (Math.hypot(x - SHED_SPOT[0], z - SHED_SPOT[1]) < 3) continue;
    const height = owl ? 3 + random() * 1.5 : 0.35 + random() * 0.45;
    return position.set(x, FLOOR_Y + height, z);
  }
  return position;
}

// Spares for useFrame, so it makes no new objects
const matrix = new THREE.Matrix4();
const turn = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);
const side = new THREE.Vector3();
const place = new THREE.Vector3();
const size = new THREE.Vector3();

export function Eyes({ color }: { color: string }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const random = useMemo(() => seeded(31), []);
  const geometry = useMemo(() => new THREE.SphereGeometry(1, 10, 8), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  // Brighter than the colour itself, so it blooms
  const glow = useMemo(
    () => new THREE.Color(color).multiplyScalar(1.8),
    [color],
  );

  // Each pair starts away, the first soon, the others later
  const watchers = useRef<Watcher[]>([]);

  useFrame(({ camera, clock }, delta) => {
    const eyes = mesh.current;
    if (!eyes) return;
    const dt = Math.min(delta, 1 / 30);
    const time = clock.elapsedTime;
    if (watchers.current.length === 0) {
      watchers.current = Array.from({ length: PAIRS }, (_, i) => ({
        position: new THREE.Vector3(),
        watching: false,
        timer: 3 + i * 5 + random() * 3,
        open: 0,
        blinkIn: 0,
        blink: 0,
        seed: random() * 10,
      }));
    }

    watchers.current.forEach((watcher, i) => {
      watcher.timer -= dt;
      if (!watcher.watching && watcher.open < 0.01 && watcher.timer <= 0) {
        hideout(random, watcher.position);
        watcher.watching = true;
        watcher.timer = between(random, WATCH);
        watcher.blinkIn = 0.8 + random() * 1.5;
      } else if (watcher.watching && watcher.timer <= 0) {
        watcher.watching = false;
        watcher.timer = between(random, AWAY);
      }
      const goal = watcher.watching ? 1 : 0;
      watcher.open += (goal - watcher.open) * (1 - Math.exp(-OPEN_SPEED * dt));

      // A blink now and then: shut for a moment, then open again
      watcher.blinkIn -= dt;
      if (watcher.blinkIn <= 0) {
        watcher.blink = BLINK_SECONDS;
        watcher.blinkIn = 1.5 + random() * 2.5;
      }
      watcher.blink = Math.max(0, watcher.blink - dt);
      const shut = watcher.blink > 0 ? 0.1 : 1;

      // The pair faces the camera, side by side across its view, and
      // glances left and right
      const { position, seed } = watcher;
      const facing = Math.atan2(
        camera.position.x - position.x,
        camera.position.z - position.z,
      );
      turn.setFromAxisAngle(up, facing);
      side.set(Math.cos(facing), 0, -Math.sin(facing));
      const glance = Math.sin(time * 0.6 + seed) * 0.06;
      const opened = watcher.open < 0.01 ? 0 : watcher.open * shut;
      size.set(EYE_SIZE * 1.25, EYE_SIZE * opened, EYE_SIZE * 0.4);
      for (const [k, way] of [
        [0, -1],
        [1, 1],
      ]) {
        place.copy(position).addScaledVector(side, way * EYE_GAP + glance);
        matrix.compose(place, turn, size);
        eyes.setMatrixAt(i * 2 + k, matrix);
      }
    });
    eyes.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, undefined, PAIRS * 2]}
      frustumCulled={false}
    >
      <meshBasicMaterial color={glow} toneMapped={false} fog={false} />
    </instancedMesh>
  );
}
