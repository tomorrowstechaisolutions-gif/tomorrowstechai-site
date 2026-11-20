"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * The Core: Tess's presence. A sphere of points that breathes while she
 * waits, tightens when she listens, churns when she thinks and sends waves
 * across its surface when she speaks. The crew orbit it as small lights; a
 * bot that is working right now is amber and moves faster.
 *
 * `getLevel` is read every frame rather than passed as a prop, so her voice
 * can drive the surface sixty times a second without re-rendering React.
 */

export type TessState = "idle" | "listening" | "thinking" | "speaking";

const CYAN = 0x35d6ff;
const AMBER = 0xffb347;
/** [energy, voice] each state settles toward. */
const TARGET: Record<TessState, [number, number]> = { idle: [0.18, 0], listening: [0.45, 0], thinking: [1, 0], speaking: [0.6, 1] };

function cloud(count: number, color: number, size: number, opacity: number) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color, size, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  return { mesh: new THREE.Points(geometry, material), positions, geometry, material };
}

export default function TessCore({ state, getLevel, crew }: { state: TessState; getLevel: () => number; crew: { working: boolean }[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const levelRef = useRef(getLevel);
  const crewRef = useRef(crew);
  useEffect(() => {
    stateRef.current = state;
    levelRef.current = getLevel;
    crewRef.current = crew;
  }, [state, getLevel, crew]);

  const crewCount = crew.length;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      return; // No WebGL: the page still works, without the Core.
    }
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
    camera.position.set(0, 0.25, 6.2);
    // Lifted a little so her words have clear room underneath.
    scene.position.y = 0.42;

    const fit = () => {
      const w = canvas.clientWidth || 1;
      const h = canvas.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // On a narrow screen pull back so the sphere and its orbit still fit.
      camera.position.z = camera.aspect < 1 ? 6.2 / Math.max(camera.aspect, 0.45) : 6.2;
      camera.updateProjectionMatrix();
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);

    const N = 9000;
    const shell = cloud(N, CYAN, 0.024, 0.85);
    const dir = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = i * 2.399963;
      dir[i * 3] = Math.cos(th) * r;
      dir[i * 3 + 1] = y;
      dir[i * 3 + 2] = Math.sin(th) * r;
    }
    const M = 1400;
    const heart = cloud(M, AMBER, 0.028, 0.7);
    const seed: [number, number, number][] = [];
    for (let j = 0; j < M; j++) seed.push([Math.random() * 6.28, Math.acos(2 * Math.random() - 1), 0.15 + Math.random() * 0.4]);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.75, 32, 32),
      new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    const group = new THREE.Group();
    group.add(shell.mesh, heart.mesh, glow);
    scene.add(group);

    const satGeometry = new THREE.SphereGeometry(0.035, 10, 10);
    const sats = Array.from({ length: crewCount }, (_, k) => {
      const mesh = new THREE.Mesh(satGeometry, new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending }));
      scene.add(mesh);
      return { mesh, r: 2.0 + (k % 3) * 0.22, a: k * 0.483 * 6.28, tilt: (k % 5) * 0.35 - 0.7, angle: 0 };
    });

    let energy = 0.18;
    let voice = 0;
    let level = 0;
    let last = 0;
    let raf = 0;

    const frame = (ms: number) => {
      const t = ms / 1000;
      const dt = Math.min(t - last, 0.1);
      last = t;
      const [targetEnergy, targetVoice] = TARGET[stateRef.current];
      energy += (targetEnergy - energy) * Math.min(1, dt * 2.5);
      voice += (targetVoice - voice) * Math.min(1, dt * 4);
      // Her actual voice (or the text arriving) is what moves the surface.
      const heard = Math.max(0, Math.min(1, levelRef.current()));
      level += (heard - level) * Math.min(1, dt * 14);
      const push = voice * (0.25 + level * 1.1);

      const sp = calm ? 0.3 : 0.5 + energy * 2.4;
      const amp = 0.05 + energy * (calm ? 0.06 : 0.2);
      for (let i = 0; i < N; i++) {
        const x = dir[i * 3];
        const y = dir[i * 3 + 1];
        const z = dir[i * 3 + 2];
        const n = Math.sin(x * 3.1 + t * sp) * Math.sin(y * 4.3 - t * sp * 0.8) + Math.sin(z * 5.2 + t * sp * 1.3) * 0.6;
        const rad = 1.3 + n * amp + Math.sin(t * 1.2) * 0.03 + push * 0.17 * Math.sin(y * 9 - t * 11);
        shell.positions[i * 3] = x * rad;
        shell.positions[i * 3 + 1] = y * rad;
        shell.positions[i * 3 + 2] = z * rad;
      }
      shell.geometry.attributes.position.needsUpdate = true;

      for (let j = 0; j < M; j++) {
        const s = seed[j];
        const a1 = s[0] + t * (0.4 + energy * 1.6);
        const rd = s[2] * (1 + push * 0.6);
        heart.positions[j * 3] = Math.sin(s[1]) * Math.cos(a1) * rd;
        heart.positions[j * 3 + 1] = Math.cos(s[1]) * rd;
        heart.positions[j * 3 + 2] = Math.sin(s[1]) * Math.sin(a1) * rd;
      }
      heart.geometry.attributes.position.needsUpdate = true;
      heart.material.opacity = 0.25 + energy * 0.6;
      glow.scale.setScalar(1 + energy * 0.5 + push * 0.35);
      group.rotation.y = t * (0.08 + energy * 0.15);
      group.rotation.x = Math.sin(t * 0.3) * 0.15;

      for (let k = 0; k < sats.length; k++) {
        const sat = sats[k];
        const busy = Boolean(crewRef.current[k]?.working);
        sat.angle += dt * (busy ? 0.7 : 0.12);
        const ang = sat.a + sat.angle;
        sat.mesh.position.set(Math.cos(ang) * sat.r, Math.sin(ang) * sat.r * Math.sin(sat.tilt), Math.sin(ang) * sat.r * Math.cos(sat.tilt));
        sat.mesh.scale.setScalar(busy ? 1.5 + 0.5 * Math.sin(t * 6 + k) : 1);
        sat.mesh.material.color.setHex(busy ? AMBER : CYAN);
        sat.mesh.material.opacity = busy ? 1 : 0.5;
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      shell.geometry.dispose();
      shell.material.dispose();
      heart.geometry.dispose();
      heart.material.dispose();
      glow.geometry.dispose();
      glow.material.dispose();
      satGeometry.dispose();
      for (const sat of sats) sat.mesh.material.dispose();
      renderer.dispose();
    };
  }, [crewCount]);

  return <canvas ref={canvasRef} aria-hidden="true" style={{ width: "100%", height: "100%", display: "block" }} />;
}
