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

    const forced = document.documentElement.dataset.theme;
    const dark = forced ? forced === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    const color = new THREE.Color(dark ? 0xadf377 : 0x4a8a30);

    const group = new THREE.Group();
    scene.add(group);

    const shape = new THREE.IcosahedronGeometry(1.65, 2);
    const wire = new THREE.WireframeGeometry(shape);
    const lineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.62 });
    const mesh = new THREE.LineSegments(wire, lineMat);
    group.add(mesh);

    const count = 420;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const radius = 2.6 + Math.random() * 1.4;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[index * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[index * 3 + 2] = radius * Math.cos(phi);
    }
    const pointsGeo = new THREE.BufferGeometry();
    pointsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const pointsMat = new THREE.PointsMaterial({ color, size: 0.045, transparent: true, opacity: 0.5, sizeAttenuation: true });
    const points = new THREE.Points(pointsGeo, pointsMat);
    group.add(points);

    const pointer = { x: 0, y: 0 };
    const onPointer = (event: PointerEvent) => {
      const rect = target.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      pointer.y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    window.addEventListener('pointermove', onPointer);

    const resize = new ResizeObserver(() => {
      const { clientWidth: width, clientHeight: height } = target;
      if (width && height) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      }
    });
    resize.observe(target);

    let tiltX = 0;
    let tiltY = 0;
    renderer.setAnimationLoop((time) => {
      if (document.hidden) return;
      mesh.rotation.x = 0.32 + Math.sin(time / 4200) * 0.18;
      mesh.rotation.y = time / 6500;
      mesh.rotation.z = Math.sin(time / 7000) * 0.12;
      mesh.scale.setScalar(1 + Math.sin(time / 1600) * 0.035);
      points.rotation.y = -time / 11000;
      tiltX += (pointer.y * 0.18 - tiltX) * 0.05;
      tiltY += (pointer.x * 0.22 - tiltY) * 0.05;
      group.rotation.x = tiltX;
      group.rotation.y = tiltY;
      renderer.render(scene, camera);
    });

    return () => {
      window.removeEventListener('pointermove', onPointer);
      resize.disconnect();
      renderer.setAnimationLoop(null);
      pointsGeo.dispose();
      pointsMat.dispose();
      wire.dispose();
      shape.dispose();
      lineMat.dispose();
      renderer.dispose();
    };
  }, []);
  return <canvas className="scene" ref={canvas} />;
}
