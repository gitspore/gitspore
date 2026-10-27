import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { FLOOR_Y } from "./layout";
import { perches, pickPerch, pointer, seeded } from "./life";

//
//
//
// Butterflies by day, moths at night. Both flutter on a wandering path
// with their wings beating; a butterfly flies to a perch (a plant's tip,
// a bloom most of all, or a flower in the grass), lands, rides the plant
// as it sways, opens and closes its wings, and flies on. A moth circles a
// string light's bulb instead and never lands. Both flee from the pointer.
// Everything moves in useFrame on plain objects; nothing re-renders

// Where they may fly: x, y and z from–to
const BOUNDS: [number, number, number, number, number, number] = [
  -9,
  9,
  FLOOR_Y + 0.3,
  4.2,
  -10,
  5,
];
// How fast (units a second), how quickly they turn toward where they want
// to go, how close the pointer may come before they flee, and how long
// they keep fleeing
const SPEED = 0.9;
const TURN = 2.5;
const SHY = 0.7;
const FLEE_SECONDS = 1.4;

export type FlierKind = "butterfly" | "moth";

// One flier's state:
// - perch: the perch it heads for or sits on (null: wandering to goal)
// - rest: seconds left sitting (0: flying); flee: seconds left fleeing
// - flap: the wings' phase; wander: its own offset for the wandering path
type Flier = {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  goal: THREE.Vector3;
  perch: string | null;
  bulb: number;
  rest: number;
  flee: number;
  flap: number;
  wander: number;
  timer: number;
};

// A wing painted on a small canvas: the hinge on the left edge, the tip on
// the right, the canvas's top is the wing's back. A butterfly's has a
// big forewing and a round hindwing, a dark rim and white dots; a moth's
// is one soft pale triangle with darker specks
function wingTexture(kind: FlierKind, color: string, edge: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const paint = canvas.getContext("2d");
  if (!paint) return null;

  const outline = new Path2D();
  if (kind === "butterfly") {
    outline.moveTo(2, 62);
    outline.bezierCurveTo(30, 66, 110, 120, 124, 104);
    outline.bezierCurveTo(128, 80, 100, 66, 70, 62);
    outline.bezierCurveTo(100, 54, 112, 18, 84, 10);
    outline.bezierCurveTo(52, 4, 18, 30, 2, 58);
  } else {
    outline.moveTo(2, 70);
    outline.bezierCurveTo(40, 100, 100, 110, 122, 92);
    outline.bezierCurveTo(118, 60, 70, 36, 2, 40);
  }
  outline.closePath();

  paint.fillStyle = color;
  paint.fill(outline);
  paint.save();
  paint.clip(outline);
  if (kind === "butterfly") {
    paint.lineWidth = 14;
    paint.strokeStyle = edge;
    paint.stroke(outline);
    paint.fillStyle = "white";
    for (const [x, y, r] of [
      [112, 100, 4],
      [100, 108, 3],
      [92, 16, 3.5],
    ]) {
      paint.beginPath();
      paint.arc(x, y, r, 0, Math.PI * 2);
      paint.fill();
    }
    const body = paint.createLinearGradient(0, 0, 50, 0);
    body.addColorStop(0, edge);
    body.addColorStop(1, "rgba(0, 0, 0, 0)");
    paint.globalAlpha = 0.5;
    paint.fillStyle = body;
    paint.fillRect(0, 0, 50, 128);
  } else {
    paint.globalAlpha = 0.25;
    paint.fillStyle = edge;
    const random = seeded(4);
    for (let i = 0; i < 40; i++) {
      paint.fillRect(random() * 128, 40 + random() * 70, 3, 2);
    }
  }
  paint.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// A random point inside the bounds, a little nearer the table than not
function wanderGoal(random: () => number, goal: THREE.Vector3) {
  const [x0, x1, y0, y1, z0, z1] = BOUNDS;
  return goal.set(
    (x0 + random() * (x1 - x0)) * 0.7,
    y0 + 0.5 + random() * (y1 - y0 - 0.5),
    (z0 + random() * (z1 - z0)) * 0.7,
  );
}

const toward = new THREE.Vector3();
const want = new THREE.Vector3();
const nearest = new THREE.Vector3();

// The fliers of one kind, each with its own colour (one wing texture per
// colour). bulbs: where the moths circle (the string lights)
export function Butterflies({
  kind,
  colors,
  edge,
  bulbs,
  reducedMotion,
}: {
  kind: FlierKind;
  colors: string[];
  edge: string;
  bulbs: THREE.Vector3[];
  reducedMotion: boolean;
}) {
  const butterfly = kind === "butterfly";
  const size = butterfly ? 1.8 : 1.3;
  const random = useMemo(() => seeded(butterfly ? 21 : 23), [butterfly]);

  const fliers = useRef<Flier[]>([]);
  const groups = useRef<(THREE.Group | null)[]>([]);
  const leftWings = useRef<(THREE.Mesh | null)[]>([]);
  const rightWings = useRef<(THREE.Mesh | null)[]>([]);

  // The wing: a plane in the floor's plane, hinged on its left edge
  // (x = 0), the head end toward +z. The left wing is the same, mirrored
  const wing = useMemo(
    () =>
      new THREE.PlaneGeometry(0.1, 0.12)
        .rotateX(-Math.PI / 2)
        .translate(0.05, 0, 0),
    [],
  );
  const body = useMemo(
    () => new THREE.CapsuleGeometry(0.009, 0.06, 2, 6).rotateX(Math.PI / 2),
    [],
  );
  const textures = useMemo(
    () => colors.map((color) => wingTexture(kind, color, edge)),
    [kind, colors, edge],
  );

  useEffect(
    () => () => {
      wing.dispose();
      body.dispose();
    },
    [wing, body],
  );
  useEffect(
    () => () => textures.forEach((texture) => texture?.dispose()),
    [textures],
  );

  useFrame(({ clock }, delta) => {
    const time = clock.elapsedTime;
    const dt = Math.min(delta, 1 / 30);

    // On the first frame each flier starts somewhere in the air, wandering
    if (fliers.current.length !== colors.length) {
      fliers.current = colors.map((_, index) => ({
        position: wanderGoal(random, new THREE.Vector3()),
        velocity: new THREE.Vector3(),
        goal: wanderGoal(random, new THREE.Vector3()),
        perch: null,
        bulb: index % Math.max(bulbs.length, 1),
        rest: 0,
        flee: 0,
        flap: random() * 10,
        wander: random() * 10,
        timer: 2 + random() * 4,
      }));
    }

    fliers.current.forEach((flier, index) => {
      const group = groups.current[index];
      if (!group) return;

      // Under reduced motion they sit still where they are, wings open
      if (reducedMotion) {
        group.position.copy(flier.position);
        return;
      }

      // Too close to the pointer: off, away from it and up
      pointer.ray.closestPointToPoint(flier.position, nearest);
      if (
        pointer.presence.value > 0.5 &&
        flier.flee <= 0 &&
        nearest.distanceTo(flier.position) < SHY
      ) {
        toward.subVectors(flier.position, nearest).setY(0).normalize();
        flier.goal
          .copy(flier.position)
          .addScaledVector(toward, 2.2)
          .setY(flier.position.y + 1);
        flier.perch = null;
        flier.rest = 0;
        flier.flee = FLEE_SECONDS;
      }
      flier.flee = Math.max(0, flier.flee - dt);

      // Butterflies: sitting, or picking where to go next
      const perch = flier.perch ? perches.get(flier.perch) : undefined;
      if (butterfly && flier.perch && (!perch || perch.weight <= 0)) {
        flier.perch = null;
        flier.rest = 0;
      }
      if (butterfly && flier.rest > 0 && perch) {
        flier.rest -= dt;
        flier.position.copy(perch.position).y += 0.03;
        flier.velocity.set(0, 0, 0);
      } else if (butterfly) {
        // A perch it can't reach in time (the wind, the pointer) it gives up
        flier.timer -= dt;
        if (perch && flier.timer < -8) {
          flier.perch = null;
        } else if (perch) {
          flier.goal.copy(perch.position).y += 0.03;
        } else if (
          flier.flee <= 0 &&
          (flier.timer <= 0 || flier.position.distanceTo(flier.goal) < 0.3)
        ) {
          flier.perch = random() < 0.75 ? pickPerch(random) : null;
          if (!flier.perch) wanderGoal(random, flier.goal);
          flier.timer = 5 + random() * 6;
        }
      } else {
        // Moths: circle a bulb for a while, then another one
        flier.timer -= dt;
        if (flier.timer <= 0 && bulbs.length) {
          flier.bulb = Math.floor(random() * bulbs.length);
          flier.timer = 4 + random() * 6;
        }
        const bulb = bulbs[flier.bulb];
        if (bulb && flier.flee <= 0) {
          const turn = time * (1.6 + index * 0.3) + flier.wander;
          flier.goal.set(
            bulb.x + Math.cos(turn) * 0.28,
            bulb.y + Math.sin(turn * 1.7) * 0.12,
            bulb.z + Math.sin(turn) * 0.28,
          );
        }
      }

      // Flying: steer toward the goal, slowing as it nears a perch, with a
      // wobble that bobs up on every wing beat. Close enough to its perch,
      // it lands
      const sitting = butterfly && flier.rest > 0;
      if (!sitting) {
        toward.subVectors(flier.goal, flier.position);
        const distance = toward.length();
        const speed =
          SPEED * (flier.flee > 0 ? 2.4 : 1) * Math.min(1, distance * 1.8);
        want.copy(toward).normalize().multiplyScalar(speed);
        const w = flier.wander;
        const wobble = Math.min(1, distance);
        want.x += Math.sin(time * 1.7 + w) * 0.5 * wobble;
        want.y +=
          Math.cos(flier.flap) * 0.35 + Math.sin(time * 2.3 + w) * 0.2 * wobble;
        want.z += Math.cos(time * 1.3 + w * 2) * 0.5 * wobble;
        flier.velocity.lerp(want, Math.min(1, dt * TURN));
        flier.position.addScaledVector(flier.velocity, dt);
        const [x0, x1, y0, y1, z0, z1] = BOUNDS;
        flier.position.set(
          THREE.MathUtils.clamp(flier.position.x, x0, x1),
          THREE.MathUtils.clamp(flier.position.y, y0, y1),
          THREE.MathUtils.clamp(flier.position.z, z0, z1),
        );
        if (butterfly && perch && distance < 0.05) {
          flier.rest = 3 + random() * 6;
        }
      }

      // The wings: fast beats in flight; sitting, a slow open and close.
      // A moth's beat faster and less wide
      flier.flap += dt * (sitting ? 1.4 : butterfly ? 42 : 70);
      const open = 0.5 + 0.5 * Math.sin(flier.flap);
      const angle = sitting
        ? 0.3 + 0.9 * open
        : (butterfly ? 0.1 : 0.2) + (butterfly ? 1.2 : 0.7) * open;
      rightWings.current[index]?.rotation.set(0, 0, angle);
      leftWings.current[index]?.rotation.set(0, 0, -angle);

      group.position.copy(flier.position);
      if (flier.velocity.lengthSq() > 0.0004) {
        group.rotation.y = Math.atan2(flier.velocity.x, flier.velocity.z);
      }
    });
  });

  return colors.map((color, index) => (
    <group
      key={`${color}-${index}`}
      ref={(group) => {
        groups.current[index] = group;
      }}
      scale={size}
    >
      <mesh geometry={body}>
        <meshStandardMaterial color={edge} roughness={0.8} />
      </mesh>
      {[1, -1].map((side) => (
        <mesh
          key={side}
          ref={(mesh) => {
            (side > 0 ? rightWings : leftWings).current[index] = mesh;
          }}
          geometry={wing}
          scale-x={side}
        >
          <meshStandardMaterial
            map={textures[index]}
            alphaTest={0.5}
            side={THREE.DoubleSide}
            roughness={0.8}
          />
        </mesh>
      ))}
    </group>
  ));
}
