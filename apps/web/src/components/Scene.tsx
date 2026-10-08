"use client";
// Three.js needs the browser (WebGL, window), so anything using
// React Three Fiber must be a Client Component.

import { useRef, useState } from "react";
import type * as THREE from "three";
import { Canvas, useFrame, type ThreeElements } from "@react-three/fiber";
import { OrbitControls, Float, Text, ContactShadows } from "@react-three/drei";

// A single 3D object. JSX tags like <mesh>, <boxGeometry> and
// <meshStandardMaterial> map 1:1 to Three.js classes
// (THREE.Mesh, THREE.BoxGeometry, THREE.MeshStandardMaterial).
// ThreeElements['mesh'] is the prop type of the <mesh> tag, so this
// component accepts everything a <mesh> does (position, rotation, ...).
function SpinningBox(props: ThreeElements["mesh"]) {
  // A ref gives direct access to the underlying THREE.Mesh object.
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const [clicked, setClicked] = useState(false);

  // useFrame runs on every rendered frame (~60x per second).
  // `delta` is the time since the last frame, so the speed is
  // independent of the frame rate. Mutate the object directly here
  // instead of using state, which would re-render React 60x a second.
  useFrame((state, delta) => {
    // The ref is typed as possibly null (it is unset before the first
    // render commits), so narrow it before touching the object.
    if (!meshRef.current) return;
    meshRef.current.rotation.x += delta * 0.5;
    meshRef.current.rotation.y += delta * 0.8;
  });

  return (
    <mesh
      {...props}
      ref={meshRef}
      // Props become properties on the Three.js object:
      // scale={1.5} is the same as mesh.scale.set(1.5, 1.5, 1.5)
      scale={clicked ? 1.5 : 1}
      // Pointer events work like DOM events, via raycasting.
      onClick={() => setClicked(!clicked)}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      {/* args are passed to the constructor: new THREE.BoxGeometry(1, 1, 1) */}
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={hovered ? "hotpink" : "orange"} />
    </mesh>
  );
}

function Ground() {
  return (
    // rotation is in radians: -PI/2 lays the plane flat
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.5, 0]}>
      <planeGeometry args={[20, 20]} />
      <meshStandardMaterial color="#1e293b" />
    </mesh>
  );
}

export default function Scene() {
  return (
    // <Canvas> sets up the renderer, a scene and a camera for you.
    // Everything inside it is 3D, not HTML.
    <Canvas camera={{ position: [0, 2, 6], fov: 50 }}>
      <color attach="background" args={["#0f172a"]} />

      {/* Lights: without them, MeshStandardMaterial renders black */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={1.5} />

      <SpinningBox position={[-1.5, 0, 0]} />

      {/* drei's <Float> makes its children bob up and down */}
      <Float speed={2} floatIntensity={1.5}>
        <mesh position={[1.5, 0, 0]}>
          <sphereGeometry args={[0.7, 32, 32]} />
          <meshStandardMaterial
            color="#38bdf8"
            roughness={0.2}
            metalness={0.5}
          />
        </mesh>
      </Float>

      <Text position={[0, 1.8, 0]} fontSize={0.35} color="white">
        Hover and click the cube
      </Text>

      <Ground />
      <ContactShadows position={[0, -1.49, 0]} opacity={0.6} blur={2} />

      {/* drei helper: drag to rotate, scroll to zoom, right-drag to pan */}
      <OrbitControls />
    </Canvas>
  );
}
