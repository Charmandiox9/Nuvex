'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export function LoginScene() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: target, alpha: true, antialias: true }); }
    catch { return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    camera.position.z = 7;
    const shape = new THREE.IcosahedronGeometry(1.65, 2);
    const wire = new THREE.WireframeGeometry(shape);
    const forced = document.documentElement.dataset.theme;
    const dark = forced ? forced === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    const material = new THREE.LineBasicMaterial({ color: dark ? 0xadf377 : 0x4a8a30, transparent: true, opacity: 0.6 });
    const mesh = new THREE.LineSegments(wire, material);
    scene.add(mesh);
    const resize = new ResizeObserver(() => {
      const { clientWidth: width, clientHeight: height } = target;
      if (width && height) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      }
    });
    resize.observe(target);
    renderer.setAnimationLoop((time) => {
      if (document.hidden) return;
      mesh.rotation.x = 0.32 + Math.sin(time / 4200) * 0.18;
      mesh.rotation.y = time / 6500;
      mesh.rotation.z = Math.sin(time / 7000) * 0.12;
      mesh.scale.setScalar(1 + Math.sin(time / 1600) * 0.035);
      renderer.render(scene, camera);
    });
    return () => {
      resize.disconnect();
      renderer.setAnimationLoop(null);
      wire.dispose();
      shape.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);
  return <canvas className="scene" ref={canvas} />;
}
