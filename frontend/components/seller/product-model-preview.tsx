"use client";

import { Environment, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, useLayoutEffect } from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";

/** Softer preview response: even fill light, stronger IBL, gentle PBR tweaks so textures read. */
function enhanceLoadedMaterials(root: THREE.Object3D) {
    root.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) {
            return;
        }
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
            if (
                mat instanceof THREE.MeshStandardMaterial ||
                mat instanceof THREE.MeshPhysicalMaterial
            ) {
                mat.envMapIntensity = Math.max(mat.envMapIntensity, 0.85) * 1.2;
                if (typeof mat.roughness === "number" && mat.roughness > 0.25) {
                    mat.roughness = Math.max(0.2, mat.roughness * 0.88);
                }
                mat.needsUpdate = true;
            }
        }
    });
}

const enhancedScenes = new WeakSet<THREE.Object3D>();

function GltfModel({ url }: { url: string }) {
    const gltf = useGLTF(url);
    useLayoutEffect(() => {
        if (enhancedScenes.has(gltf.scene)) {
            return;
        }
        enhancedScenes.add(gltf.scene);
        enhanceLoadedMaterials(gltf.scene);
    }, [gltf.scene, url]);
    return <primitive object={gltf.scene} />;
}

function SceneLights({ compact }: { compact?: boolean }) {
    return (
        <>
            <ambientLight intensity={compact ? 0.52 : 0.42} />
            <hemisphereLight args={["#f2f6ff", "#1a1e28", compact ? 1.05 : 0.95]} />
            <directionalLight position={[4, 6, 4]} intensity={compact ? 0.55 : 0.75} />
            <directionalLight position={[-6, 3, -2]} intensity={0.42} color="#dbe8ff" />
            <directionalLight position={[2, -4, 5]} intensity={0.35} />
            <pointLight position={[-2, 1, 3]} intensity={0.25} distance={12} decay={2} />
            <Environment preset="apartment" environmentIntensity={compact ? 0.95 : 1.05} />
        </>
    );
}

export interface ProductModelPreviewProps {
    modelUrl: string;
    className?: string;
    /** Tighter camera for compact embeds (e.g. seller form cards). */
    compact?: boolean;
}

/**
 * Interactive GLB/GLTF preview (Three.js via React Three Fiber).
 */
export function ProductModelPreview({ modelUrl, className, compact }: ProductModelPreviewProps) {
    const cam = compact
        ? { position: [0.35, 0.45, 1.35] as [number, number, number], fov: 40 }
        : { position: [0, 0.6, 1.85] as [number, number, number], fov: 42 };

    const embed = !!compact;

    return (
        <div className={cn("relative h-full min-h-0 w-full", className)}>
            <Canvas
                className="block! h-full w-full touch-none"
                style={{ width: "100%", height: "100%" }}
                camera={cam}
                dpr={[1, 2]}
                gl={{
                    alpha: embed,
                    antialias: true,
                    toneMapping: THREE.ACESFilmicToneMapping,
                    toneMappingExposure: embed ? 1.02 : 1.08
                }}
            >
                {!embed ? <color attach="background" args={["#0c1018"]} /> : null}
                <Suspense
                    fallback={
                        <mesh>
                            <boxGeometry args={[0.35, 0.35, 0.35]} />
                            <meshBasicMaterial color="#2dd4bf" wireframe />
                        </mesh>
                    }
                >
                    <SceneLights compact={compact} />
                    <GltfModel url={modelUrl} />
                </Suspense>
                <OrbitControls
                    makeDefault
                    enableDamping
                    minDistance={0.6}
                    maxDistance={6}
                    enablePan={!compact}
                />
            </Canvas>
        </div>
    );
}
