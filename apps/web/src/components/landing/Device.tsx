"use client";

import { Float, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useRef } from "react";

function ScreenUI({ tablet }: { tablet: boolean }) {
  return (
    <group position={[0, 0, 0.125]}>
      <mesh>
        <planeGeometry args={tablet ? [3.15, 4.55] : [2.2, 4.75]} />
        <meshStandardMaterial color="#07070d" roughness={0.28} metalness={0.15} />
      </mesh>
      <mesh position={[0, 0.9, 0.015]}>
        <planeGeometry args={tablet ? [2.55, 0.42] : [1.7, 0.42]} />
        <meshBasicMaterial color="#15121f" />
      </mesh>
      <mesh position={[0, 0.15, 0.015]}>
        <planeGeometry args={tablet ? [2.55, 0.95] : [1.7, 1.05]} />
        <meshBasicMaterial color="#11101a" />
      </mesh>
      <mesh position={[0, -1.05, 0.015]}>
        <planeGeometry args={tablet ? [2.55, 0.5] : [1.7, 0.55]} />
        <meshBasicMaterial color="#171327" />
      </mesh>
      <mesh position={[tablet ? 0.45 : -0.1, 0.15, 0.03]}>
        <planeGeometry args={[tablet ? 0.75 : 0.55, 0.07]} />
        <meshBasicMaterial color="#7b5cff" />
      </mesh>
      <mesh position={[tablet ? -0.6 : -0.45, 0.15, 0.03]}>
        <planeGeometry args={[0.45, 0.07]} />
        <meshBasicMaterial color="#8cecff" />
      </mesh>
    </group>
  );
}

function DeviceModel({ tablet }: { tablet: boolean }) {
  const g = useRef<THREE.Group>(null);
  const { pointer } = useThree();
  useFrame((_, d) => {
    if (!g.current) return;
    g.current.rotation.y = THREE.MathUtils.damp(
      g.current.rotation.y,
      -0.2 + pointer.x * 0.12,
      2,
      d
    );
    g.current.rotation.x = THREE.MathUtils.damp(
      g.current.rotation.x,
      pointer.y * -0.07,
      2,
      d
    );
  });
  return (
    <Float speed={1.1} rotationIntensity={0.04} floatIntensity={0.5}>
      <group ref={g} rotation={[0, -0.2, 0.06]} scale={tablet ? 1.18 : 1}>
        <RoundedBox
          args={tablet ? [3.5, 5, 0.22] : [2.6, 5.45, 0.2]}
          radius={0.25}
          smoothness={4}
        >
          <meshStandardMaterial color="#bfc2ca" metalness={0.95} roughness={0.18} />
        </RoundedBox>
        <ScreenUI tablet={tablet} />
        <mesh position={[0, tablet ? 2.35 : 2.55, 0.15]}>
          <boxGeometry args={[0.5, 0.055, 0.025]} />
          <meshStandardMaterial color="#050507" />
        </mesh>
      </group>
    </Float>
  );
}

export function Device({ tablet = false }: { tablet?: boolean }) {
  return (
    <div className={tablet ? "device tablet-device" : "device"}>
      <Canvas
        camera={{ position: [0, 0, 8], fov: 35 }}
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
      >
        <ambientLight intensity={0.45} />
        <directionalLight position={[4, 6, 5]} intensity={3} />
        <pointLight position={[3, 1, 3]} intensity={12} color="#7b5cff" />
        <DeviceModel tablet={tablet} />
      </Canvas>
      <div className="device-ui">
        <div className="ui-top">
          <span>FI / WORKSPACE</span>
          <span>LIVE</span>
        </div>
        <div className="ui-title">
          Evidence workspace<span>.</span>
        </div>
        <div className="ui-score">
          <small>EVIDENCE STATUS</small>
          <strong>
            62% <i>covered</i>
          </strong>
          <div className="bar">
            <b />
          </div>
          <em>Signals verified &nbsp; • &nbsp; gaps visible</em>
        </div>
        <div className="ui-grid">
          <span>
            Market map
            <br />
            <b>12 segments</b>
          </span>
          <span>
            Customer
            <br />
            <b>184 signals</b>
          </span>
          <span>
            Competitors
            <br />
            <b>27 mapped</b>
          </span>
          <span>
            Assumptions
            <br />
            <b>8 untested</b>
          </span>
        </div>
        <div className="ui-trace">
          DECISION TRACE
          <br />
          <b>Test pricing before building.</b>
        </div>
      </div>
    </div>
  );
}
