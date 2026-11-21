'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

function glowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.32, 'rgba(255,255,255,0.62)');
    gradient.addColorStop(0.7, 'rgba(255,255,255,0.16)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export function LoginScene() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: target, alpha: true, antialias: true, powerPreference: 'high-performance' });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearAlpha(0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
    camera.position.z = 7.2;

    const forced = document.documentElement.dataset.theme;
    const dark = forced ? forced === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    const accent = new THREE.Color(dark ? 0xadf377 : 0x3c7d24);
    const soft = new THREE.Color(dark ? 0x7fc46a : 0x88ad6b);
    const glow = glowTexture();

    const root = new THREE.Group();
    scene.add(root);

    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glow, color: accent, transparent: true, opacity: dark ? 0.3 : 0.2,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.setScalar(6.6);
    halo.position.z = -0.4;
    root.add(halo);

    const core = new THREE.Group();
    root.add(core);

    const shellShape = new THREE.IcosahedronGeometry(1.55, 2);
    const shellWire = new THREE.WireframeGeometry(shellShape);
    const shellMaterial = new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: dark ? 0.72 : 0.64 });
    const shell = new THREE.LineSegments(shellWire, shellMaterial);
    core.add(shell);

    const innerShape = new THREE.IcosahedronGeometry(1.16, 1);
    const innerMaterial = new THREE.MeshBasicMaterial({
      color: accent, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const inner = new THREE.Mesh(innerShape, innerMaterial);
    core.add(inner);

    const seedShape = new THREE.IcosahedronGeometry(0.76, 0);
    const seedWire = new THREE.WireframeGeometry(seedShape);
    const seedMaterial = new THREE.LineBasicMaterial({ color: soft, transparent: true, opacity: 0.5 });
    const seed = new THREE.LineSegments(seedWire, seedMaterial);
    core.add(seed);

    const orbits = new THREE.Group();
    root.add(orbits);
    const orbitMaterial = new THREE.MeshBasicMaterial({
      color: soft, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const orbitShape = new THREE.TorusGeometry(2.5, 0.005, 6, 280);
    const ringTilts: [number, number, number][] = [
      [0.44, 0.16, 0.1],
      [-0.58, 0.92, -0.34],
      [1.18, -0.36, 0.52],
    ];
    const rings = ringTilts.map(([x, y, z]) => {
      const ring = new THREE.Mesh(orbitShape, orbitMaterial);
      ring.rotation.set(x, y, z);
      orbits.add(ring);
      return ring;
    });

    const nodes = new THREE.Group();
    root.add(nodes);
    const nodePositions = new Float32Array(6 * 3);
    for (let index = 0; index < 6; index += 1) {
      const angle = (index / 6) * Math.PI * 2;
      nodePositions[index * 3] = Math.cos(angle) * 2.5;
      nodePositions[index * 3 + 1] = Math.sin(angle) * 0.42;
      nodePositions[index * 3 + 2] = Math.sin(angle) * 2.5;
    }
    const nodeGeometry = new THREE.BufferGeometry();
    nodeGeometry.setAttribute('position', new THREE.BufferAttribute(nodePositions, 3));
    const nodeMaterial = new THREE.PointsMaterial({
      color: accent, size: 0.28, map: glow, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    const nodePoints = new THREE.Points(nodeGeometry, nodeMaterial);
    nodes.add(nodePoints);

    const count = 560;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const radius = 1.9 + Math.random() * 1.6;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[index * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[index * 3 + 2] = radius * Math.cos(phi);
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMaterial = new THREE.PointsMaterial({
      color: soft, size: 0.075, map: glow, transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    root.add(particles);

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
    const haloOpacity = dark ? 0.3 : 0.2;
    renderer.setAnimationLoop((time) => {
      if (document.hidden) return;
      const seconds = time / 1000;
      shell.rotation.set(0.2 + Math.sin(seconds * 0.32) * 0.1, seconds * 0.18, Math.sin(seconds * 0.24) * 0.08);
      inner.rotation.set(seconds * 0.11, -seconds * 0.26, 0);
      seed.rotation.set(-seconds * 0.34, seconds * 0.4, seconds * 0.12);
      core.scale.setScalar(1 + Math.sin(seconds * 1.15) * 0.035);
      rings[0].rotation.z = 0.1 + seconds * 0.09;
      rings[1].rotation.z = -0.34 - seconds * 0.06;
      rings[2].rotation.z = 0.52 + seconds * 0.05;
      nodes.rotation.set(Math.sin(seconds * 0.42) * 0.14, -seconds * 0.26, 0);
      particles.rotation.set(Math.sin(seconds * 0.19) * 0.08, seconds * 0.05, 0);
      (halo.material as THREE.SpriteMaterial).opacity = haloOpacity + Math.sin(seconds * 0.9) * 0.04;
      tiltX += (pointer.y * 0.16 - tiltX) * 0.05;
      tiltY += (pointer.x * 0.2 - tiltY) * 0.05;
      root.rotation.set(tiltX, tiltY, 0);
      renderer.render(scene, camera);
    });

    return () => {
      window.removeEventListener('pointermove', onPointer);
      resize.disconnect();
      renderer.setAnimationLoop(null);
      root.clear();
      shellShape.dispose();
      shellWire.dispose();
      shellMaterial.dispose();
      innerShape.dispose();
      innerMaterial.dispose();
      seedShape.dispose();
      seedWire.dispose();
      seedMaterial.dispose();
      orbitShape.dispose();
      orbitMaterial.dispose();
      nodeGeometry.dispose();
      nodeMaterial.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
      (halo.material as THREE.SpriteMaterial).dispose();
      glow.dispose();
      renderer.dispose();
    };
  }, []);
  return <canvas className="scene" ref={canvas} />;
}
