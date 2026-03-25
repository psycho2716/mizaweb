"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import type { GlbViewerProps } from "@/types";

export function GlbViewer({ modelUrl }: GlbViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !modelUrl) return;

    const width = el.clientWidth || 640;
    const height = 400;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0.8, 0.6, 2.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(typeof window !== "undefined" ? window.devicePixelRatio : 1, 2));
    el.appendChild(renderer.domElement);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(4, 6, 6);
    scene.add(keyLight);
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const loader = new GLTFLoader();
    let disposed = false;
    loader.load(
      modelUrl,
      (gltf) => {
        if (disposed) return;
        scene.add(gltf.scene);
      },
      undefined,
      () => {
        /* ignore load errors here; parent shows message */
      }
    );

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      controls.dispose();
      renderer.dispose();
      if (el.contains(renderer.domElement)) {
        el.removeChild(renderer.domElement);
      }
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
    };
  }, [modelUrl]);

  return <div ref={containerRef} className="w-full min-h-[400px] rounded-xl border border-zinc-200 bg-zinc-100" />;
}
