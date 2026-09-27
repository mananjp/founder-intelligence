"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Float, Sparkles } from "@react-three/drei";
import { useRef } from "react";
import * as THREE from "three";

function Shape({
  p,
  r,
  s,
  c,
  glass = false,
}: {
  p: [number, number, number];
  r: [number, number, number];
  s: [number, number, number];
  c: string;
  glass?: boolean;
}) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state, delta) => {
    if (!ref.current) return;
    ref.current.rotation.x += delta * 0.06;
    ref.current.rotation.y += delta * 0.09;
    ref.current.position.y =
      p[1] + Math.sin(state.clock.elapsedTime * 0.35 + p[0]) * 0.12;
  });
  return (
    <Float speed={0.7} rotationIntensity={0.08} floatIntensity={0.25}>
      <mesh ref={ref} position={p} rotation={r} scale={s}>
        <boxGeometry args={[1, 2.4, 0.09]} />
        <meshStandardMaterial
          color={c}
          metalness={glass ? 0.35 : 0.92}
          roughness={glass ? 0.28 : 0.14}
          transparent={glass}
          opacity={glass ? 0.72 : 1}
        />
      </mesh>
    </Float>
  );
}

function Rig() {
  const { camera, pointer } = useThree();
  useFrame((_, d) => {
    camera.position.x = THREE.MathUtils.damp(
      camera.position.x,
      pointer.x * 0.45,
      1.4,
      d
    );
    camera.position.y = THREE.MathUtils.damp(
      camera.position.y,
      pointer.y * 0.25,
      1.4,
      d
    );
    camera.lookAt(0, 0, 0);
  });
  return null;
}

function World() {
  return (
    <>
      <ambientLight intensity={0.28} />
      <directionalLight position={[4, 6, 5]} intensity={2.8} />
      <pointLight position={[4, 1, 3]} intensity={22} distance={12} color="#6846ff" />
      <pointLight position={[-5, -2, 2]} intensity={15} distance={11} color="#8cecff" />
      <Shape p={[-5, 2, -4]} r={[0.2, 0.3, -0.45]} s={[1.7, 1.7, 1]} c="#d9dbe2" />
      <Shape p={[5, 2.5, -5]} r={[0.2, -0.5, 0.5]} s={[1.5, 1.9, 1]} c="#6d4cff" glass />
      <Shape p={[4, -3, -3]} r={[-0.4, 0.1, -0.2]} s={[1.2, 2.2, 1]} c="#3b1eff" glass />
      <Shape p={[-4, -3.5, -2]} r={[0.3, 0.5, 0.35]} s={[1, 1.7, 1]} c="#aeb3c0" />
      <Sparkles count={130} scale={[15, 10, 9]} size={1.2} speed={0.12} opacity={0.25} color="#b8aaff" />
      <Rig />
    </>
  );
}

export function Scene() {
  return (
    <div className="scene">
      <Canvas
        camera={{ position: [0, 0, 8], fov: 42 }}
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
      >
        <color attach="background" args={["#000"]} />
        <World />
      </Canvas>
      <div className="scene-vignette" />
    </div>
  );
}
