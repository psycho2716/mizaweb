"use client";

import { Environment, Html, OrbitControls, useGLTF, useProgress } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { cn } from "@/lib/utils";
import type { ProductModelViewerCustomization } from "@/types";

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

function captureMaterialBaselines(root: THREE.Object3D) {
    root.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) {
            return;
        }
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
            if (
                mat instanceof THREE.MeshBasicMaterial ||
                mat instanceof THREE.MeshStandardMaterial ||
                mat instanceof THREE.MeshPhysicalMaterial
            ) {
                mat.userData.mizaBaseColor = mat.color.clone();
            }
            if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
                if (typeof mat.roughness === "number") {
                    mat.userData.mizaBaseRoughness = mat.roughness;
                }
            }
        }
    });
}

function CustomizableGltfModel({
    url,
    customization
}: {
    url: string;
    customization?: ProductModelViewerCustomization;
}) {
    const gltf = useGLTF(url);

    const clonedScene = useMemo(() => {
        const root = clone(gltf.scene) as THREE.Object3D;
        enhanceLoadedMaterials(root);
        captureMaterialBaselines(root);
        return root;
    }, [gltf.scene, url]);

    const scaleUniform = customization?.scaleUniform ?? 1;
    const tintHex = customization?.materialTintHex;
    const tintBlendRaw = customization?.materialTintBlend;
    const roughMult = customization?.finishRoughnessMultiplier;

    useLayoutEffect(() => {
        clonedScene.scale.setScalar(scaleUniform);
    }, [clonedScene, scaleUniform]);

    useLayoutEffect(() => {
        const tint = tintHex ? new THREE.Color(tintHex) : null;
        const lerpStandard =
            tint && tintHex
                ? Math.min(1, Math.max(0, tintBlendRaw ?? 0.82))
                : 0;
        const lerpBasic = tint && tintHex ? Math.min(1, lerpStandard + 0.04) : 0;

        clonedScene.traverse((child) => {
            if (!(child instanceof THREE.Mesh)) {
                return;
            }
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            for (const mat of mats) {
                if (mat instanceof THREE.MeshBasicMaterial) {
                    const base: THREE.Color | undefined = mat.userData.mizaBaseColor;
                    if (base) {
                        if (tint && lerpBasic > 0) {
                            mat.color.copy(base).lerp(tint, lerpBasic);
                        } else {
                            mat.color.copy(base);
                        }
                    }
                    mat.needsUpdate = true;
                }
                if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
                    const base: THREE.Color | undefined = mat.userData.mizaBaseColor;
                    if (base) {
                        if (tint && lerpStandard > 0) {
                            mat.color.copy(base).lerp(tint, lerpStandard);
                        } else {
                            mat.color.copy(base);
                        }
                    }
                    const baseRough: number | undefined = mat.userData.mizaBaseRoughness;
                    if (typeof mat.roughness === "number" && baseRough !== undefined) {
                        if (roughMult !== undefined) {
                            mat.roughness = Math.min(1, Math.max(0.04, baseRough * roughMult));
                        } else {
                            mat.roughness = baseRough;
                        }
                    }
                    mat.needsUpdate = true;
                }
            }
        });
    }, [clonedScene, tintHex, tintBlendRaw, roughMult]);

    return <primitive object={clonedScene} />;
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

function ModelLoadingFallback({ compact }: { compact?: boolean }) {
    const { active, progress } = useProgress();
    const pct = Math.round(progress);
    const showPct = Number.isFinite(pct) && pct > 0;

    return (
        <>
            <Html center style={{ pointerEvents: "none" }}>
                <div
                    className={cn(
                        "rounded-xl border border-(--accent)/30 bg-[#050608]/70 px-4 py-3 text-center shadow-[0_0_0_1px_rgba(45,212,191,0.16),inset_0_1px_0_rgba(255,255,255,0.04)]",
                        compact ? "text-[11px]" : "text-[12px]"
                    )}
                >
                    <p className="font-semibold text-(--accent)">
                        {active ? "Loading 3D..." : "Preparing 3D..."}
                        {showPct ? ` ${pct}%` : null}
                    </p>
                    <p className="mt-0.5 text-(--muted)">Please wait a moment.</p>
                </div>
            </Html>
            <mesh aria-label="3D model loading placeholder">
                <boxGeometry args={[0.35, 0.35, 0.35]} />
                <meshBasicMaterial color="#2dd4bf" wireframe />
            </mesh>
        </>
    );
}

export interface ProductModelPreviewProps {
    modelUrl: string;
    className?: string;
    /** Tighter camera for compact embeds (e.g. seller form cards). */
    compact?: boolean;
    /** Buyer listing: live tint / scale / roughness from selected options. */
    customization?: ProductModelViewerCustomization;
}

/**
 * Interactive GLB/GLTF preview (Three.js via React Three Fiber).
 */
export function ProductModelPreview({ modelUrl, className, compact, customization }: ProductModelPreviewProps) {
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
                    fallback={<ModelLoadingFallback compact={compact} />}
                >
                    <SceneLights compact={compact} />
                    <CustomizableGltfModel url={modelUrl} customization={customization} />
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
