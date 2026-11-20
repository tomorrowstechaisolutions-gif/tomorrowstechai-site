import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { STATION_LABEL, type StationId } from "@/lib/crew/stations";
import type { Move } from "./replay";

/**
 * The floor: a room with Tess's Core in the middle, a platform for every
 * system the crew can touch, and one robot per bot.
 *
 * Nothing here decides what a robot does. A robot leaves its dock only when
 * `enqueue` hands it a move, and every move is a step from the crew's log:
 * it flies to that step's station, works there with the step's own words
 * over its head, and goes home when it has nothing left. A refused step
 * shows as a refusal: the robot stops and shakes its head.
 *
 * The glow is kept deliberately calm: tone mapping on, a low bloom strength
 * and a high bloom threshold, so the close-up camera never whites out.
 */

export type FloorBot = { id: string; slug: string; name: string; awake: boolean };
export type CameraMode = "orbit" | "top" | "follow";
export type FloorHandle = {
  enqueue(move: Move): void;
  /** Drop everything queued and send every robot home. */
  clear(): void;
  setAwake(id: string, awake: boolean): void;
  select(id: string): void;
  setCamera(mode: CameraMode): void;
  dispose(): void;
};
export type FloorOptions = {
  bots: FloorBot[];
  stations: StationId[];
  /** The lead's id, so her own steps pulse the Core instead of moving a robot. */
  leadId: string | null;
  onSelect(id: string): void;
  /** What each robot is doing right now (null when docked), whenever that changes. */
  onActivity(now: Record<string, string | null>): void;
};

const CYAN = 0x35d6ff;
const GREEN = 0x4be3a0;
const PINK = 0xff7ab8;
const AMBER = 0xffb347;
const VIOLET = 0xa78bfa;
const RED = 0xff6b6b;

const STATION_COLOR: Record<StationId, number> = { inbox: CYAN, crm: CYAN, social: PINK, bank: AMBER, stripe: AMBER, analytics: VIOLET, library: VIOLET };
type Kind = "sales" | "social" | "finance" | "ops";
const BOT_LOOK: Record<string, { color: number; kind: Kind }> = {
  "follow-through": { color: GREEN, kind: "sales" },
  content: { color: PINK, kind: "social" },
  finance: { color: AMBER, kind: "finance" },
};
export const botColor = (slug: string): string => `#${(BOT_LOOK[slug]?.color ?? CYAN).toString(16).padStart(6, "0")}`;

const css = (hex: number) => `#${hex.toString(16).padStart(6, "0")}`;

type BotState = "dock" | "go" | "work" | "report" | "beam" | "home";
type Bot = {
  def: FloorBot;
  index: number;
  color: number;
  mesh: THREE.Group;
  parts: BotParts;
  x: number;
  z: number;
  dock: { x: number; z: number };
  face: number;
  state: BotState;
  queue: Move[];
  current: Move | null;
  work: number;
  bubble: string;
  bubbleEl: HTMLDivElement;
  tagEl: HTMLDivElement;
  beam: THREE.Line;
};
type BotParts = {
  jet: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
  shadow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  ring: THREE.Mesh;
  eyes: THREE.Mesh[];
  happy: THREE.Mesh[];
  hands: THREE.Group[];
  bits: THREE.Mesh[];
  shell: THREE.MeshPhysicalMaterial;
  glow: THREE.MeshBasicMaterial;
  soft: THREE.MeshBasicMaterial;
  halo?: THREE.Mesh;
  coin?: THREE.Mesh;
};
type Station = { x: number; z: number; holo: THREE.Group; pulse: number };

function stationLabel(text: string, color: string): THREE.Sprite {
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 128;
  const c = cv.getContext("2d");
  if (c) {
    c.font = "600 54px ui-sans-serif, system-ui, Segoe UI";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = color;
    c.fillText(text, 256, 64);
  }
  const texture = new THREE.CanvasTexture(cv);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(2.6, 0.65, 1);
  return sprite;
}

/** The floating shape over a station that says what it is. */
function hologram(id: StationId, color: number): THREE.Group {
  const g = new THREE.Group();
  const wire = new THREE.MeshBasicMaterial({ color, wireframe: true });
  const solid = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
  if (id === "inbox") {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.06), wire));
    const flap = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.3, 4), solid);
    flap.rotation.z = Math.PI;
    flap.position.y = 0.15;
    flap.scale.z = 0.1;
    g.add(flap);
  } else if (id === "crm") {
    for (let k = 0; k < 3; k++) {
      const card = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.07, 0.55), k === 1 ? solid : wire);
      card.position.y = -0.25 + k * 0.25;
      card.rotation.y = k * 0.25;
      g.add(card);
    }
  } else if (id === "social") {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.8, 16, 1, true), wire);
    horn.rotation.z = -Math.PI / 2;
    g.add(horn);
    for (let w = 0; w < 2; w++) {
      const wave = new THREE.Mesh(new THREE.TorusGeometry(0.3 + w * 0.2, 0.02, 6, 24, 1.6), solid);
      wave.position.x = 0.5;
      wave.rotation.y = Math.PI / 2;
      wave.rotation.z = -0.8;
      g.add(wave);
    }
  } else if (id === "bank") {
    for (let c = 0; c < 4; c++) {
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.1, 20), c % 2 ? wire : solid);
      coin.position.y = -0.25 + c * 0.17;
      g.add(coin);
    }
  } else if (id === "stripe") {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.6, 0.05), wire));
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.12, 0.06), solid);
    stripe.position.y = 0.12;
    g.add(stripe);
  } else if (id === "analytics") {
    for (let b = 0; b < 4; b++) {
      const h = 0.3 + b * 0.22;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.16, h, 0.16), b === 3 ? solid : wire);
      bar.position.set(-0.36 + b * 0.24, h / 2 - 0.4, 0);
      g.add(bar);
    }
  } else {
    for (let b = 0; b < 3; b++) {
      const book = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.5), b === 1 ? solid : wire);
      book.position.x = -0.2 + b * 0.2;
      book.rotation.z = b === 2 ? -0.25 : 0;
      g.add(book);
    }
  }
  return g;
}

/** A robot: glossy shell, black glass face with eyes, floating hands, a thruster, and one accessory for its desk. */
function makeBot(scene: THREE.Scene, color: number, kind: Kind): { mesh: THREE.Group; parts: BotParts } {
  const g = new THREE.Group();
  const sy = 1.08;
  const top = 0.36 * sy;
  const shell = new THREE.MeshPhysicalMaterial({ color: 0x4a6478, metalness: 0.35, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12, emissive: 0x0b1822 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x04070a, metalness: 0.9, roughness: 0.06, clearcoat: 1 });
  const glow = new THREE.MeshBasicMaterial({ color });
  const soft = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.36, 36, 26), shell);
  body.scale.set(1, sy, 1);
  g.add(body);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.367, 30, 14, Math.PI * 0.2, Math.PI * 0.6, Math.PI * 0.3, Math.PI * 0.3), glass);
  face.scale.copy(body.scale);
  g.add(face);

  const eyes: THREE.Mesh[] = [];
  const happy: THREE.Mesh[] = [];
  for (const ex of [-0.11, 0.11]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 12), glow);
    eye.position.set(ex, 0.075 * sy, 0.335);
    eye.scale.set(1, 1.4, 0.35);
    g.add(eye);
    eyes.push(eye);
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.013, 6, 14, Math.PI), glow);
    smile.position.set(ex, 0.055 * sy, 0.345);
    smile.visible = false;
    g.add(smile);
    happy.push(smile);
  }
  const seam = new THREE.Mesh(new THREE.TorusGeometry(0.352, 0.012, 8, 40), soft);
  seam.rotation.x = Math.PI / 2;
  seam.position.y = -0.14 * sy;
  g.add(seam);
  const chest = new THREE.Mesh(new THREE.CircleGeometry(0.045, 16), glow);
  chest.position.set(0, -0.2 * sy, 0.3);
  chest.rotation.x = 0.55;
  g.add(chest);

  const hands: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const hand = new THREE.Group();
    hand.add(new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), shell));
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.014, 6, 20), soft);
    band.rotation.y = Math.PI / 2;
    hand.add(band);
    hand.position.set(sx * 0.5, -0.12, 0.1);
    g.add(hand);
    hands.push(hand);
  }

  let halo: THREE.Mesh | undefined;
  let coin: THREE.Mesh | undefined;
  if (kind === "sales") {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.022, 8, 24, Math.PI), shell);
    arc.position.y = 0.06 * sy;
    g.add(arc);
    for (const sx of [-1, 1]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 16), shell);
      cup.rotation.z = Math.PI / 2;
      cup.position.set(sx * 0.37, 0.06 * sy, 0);
      g.add(cup);
    }
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.26, 6), shell);
    boom.rotation.x = 1.25;
    boom.position.set(0.33, -0.05, 0.13);
    g.add(boom);
    const mic = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 10), glow);
    mic.position.set(0.33, -0.09, 0.26);
    g.add(mic);
  } else if (kind === "social") {
    halo = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.018, 8, 36), glow);
    halo.rotation.x = Math.PI / 2 - 0.25;
    halo.position.y = top + 0.2;
    g.add(halo);
  } else if (kind === "finance") {
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6), shell);
    stalk.position.y = top + 0.07;
    g.add(stalk);
    coin = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.025, 24), glow);
    coin.rotation.x = Math.PI / 2;
    coin.position.y = top + 0.24;
    g.add(coin);
  } else {
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), shell);
    antenna.position.y = top + 0.1;
    g.add(antenna);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 10), glow);
    tip.position.y = top + 0.23;
    g.add(tip);
  }

  const jet = new THREE.Mesh(
    new THREE.ConeGeometry(0.17, 0.42, 18, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false })
  );
  jet.rotation.x = Math.PI;
  jet.position.y = -0.36 * sy - 0.2;
  g.add(jet);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.07, 18), shell);
  nozzle.position.y = -0.36 * sy + 0.01;
  g.add(nozzle);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.4, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  g.add(shadow);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.018, 8, 44), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 }));
  ring.rotation.x = Math.PI / 2;
  ring.visible = false;
  g.add(ring);

  // Three bits of "data" that fly from the station into the robot while it works.
  const bits: THREE.Mesh[] = [];
  for (let q = 0; q < 3; q++) {
    const bit = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), soft);
    bit.visible = false;
    scene.add(bit);
    bits.push(bit);
  }
  return { mesh: g, parts: { jet, shadow, ring, eyes, happy, hands, bits, shell, glow, soft, halo, coin } };
}

export function createFloor(canvas: HTMLCanvasElement, overlay: HTMLElement, opts: FloorOptions): FloorHandle {
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x03060a);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x03060a, 0.028);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);

  // Calm glow: strength 0.42, threshold 0.5. Do not raise the first or lower the second.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.42, 0.45, 0.5);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const fit = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  fit();
  const observer = new ResizeObserver(fit);
  observer.observe(canvas);

  scene.add(new THREE.HemisphereLight(0x9fd8ff, 0x0a1622, 3.0));
  const rim = new THREE.DirectionalLight(CYAN, 1.3);
  rim.position.set(-8, 5, -6);
  scene.add(rim);
  const key = new THREE.DirectionalLight(0xbfe8ff, 2.1);
  key.position.set(6, 12, 8);
  scene.add(key);
  const coreLight = new THREE.PointLight(CYAN, 30, 14, 2);
  coreLight.position.set(0, 1.6, 0);
  scene.add(coreLight);

  // Floor
  const ground = new THREE.Mesh(new THREE.CircleGeometry(16, 72), new THREE.MeshStandardMaterial({ color: 0x060a10, metalness: 0.15, roughness: 0.92 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const grid = new THREE.GridHelper(32, 64, 0x123044, 0x0b1a26);
  grid.position.y = 0.01;
  scene.add(grid);
  for (let r = 0; r < 3; r++) {
    const ringMesh = new THREE.Mesh(
      new THREE.RingGeometry(2.2 + r * 2.2, 2.23 + r * 2.2, 96),
      new THREE.MeshBasicMaterial({ color: 0x1b6f8f, transparent: true, opacity: 0.5 - r * 0.12, side: THREE.DoubleSide })
    );
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.02;
    scene.add(ringMesh);
  }

  // The lead: the Core, on a pedestal.
  const N = 4200;
  const coreGeometry = new THREE.BufferGeometry();
  const corePositions = new Float32Array(N * 3);
  const dir = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r0 = Math.sqrt(1 - y * y);
    const th = i * 2.399963;
    dir[i * 3] = Math.cos(th) * r0;
    dir[i * 3 + 1] = y;
    dir[i * 3 + 2] = Math.sin(th) * r0;
  }
  coreGeometry.setAttribute("position", new THREE.BufferAttribute(corePositions, 3));
  const corePoints = new THREE.Points(coreGeometry, new THREE.PointsMaterial({ color: CYAN, size: 0.04, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  corePoints.position.y = 2.1;
  scene.add(corePoints);
  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 24), new THREE.MeshBasicMaterial({ color: 0xe8b877 }));
  heart.position.y = 2.1;
  scene.add(heart);
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.35, 0.5, 6), new THREE.MeshStandardMaterial({ color: 0x0c151f, metalness: 0.4, roughness: 0.6 }));
  pedestal.position.y = 0.25;
  scene.add(pedestal);
  const pedestalRim = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.025, 8, 6), new THREE.MeshBasicMaterial({ color: CYAN }));
  pedestalRim.rotation.x = Math.PI / 2;
  pedestalRim.position.y = 0.51;
  scene.add(pedestalRim);
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.4, 9, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false })
  );
  column.position.y = 5;
  scene.add(column);
  const leadLabel = stationLabel("Tess", css(CYAN));
  leadLabel.position.y = 3.75;
  scene.add(leadLabel);

  // Stations: one platform per system some tool can touch.
  const R = 7.4;
  const stations = new Map<StationId, Station>();
  opts.stations.forEach((id, idx) => {
    const color = STATION_COLOR[id];
    const a = (idx / Math.max(opts.stations.length, 1)) * Math.PI * 2 + 0.39;
    const x = Math.cos(a) * R;
    const z = Math.sin(a) * R;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.4, 0.22, 6), new THREE.MeshStandardMaterial({ color: 0x0c151f, metalness: 0.4, roughness: 0.6 }));
    base.position.y = 0.11;
    g.add(base);
    const baseRim = new THREE.Mesh(new THREE.TorusGeometry(1.27, 0.022, 8, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 }));
    baseRim.rotation.x = Math.PI / 2;
    baseRim.position.y = 0.23;
    g.add(baseRim);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.9, 1.5, 24, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false })
    );
    cone.rotation.x = Math.PI;
    cone.position.y = 1.0;
    g.add(cone);
    const holo = hologram(id, color);
    holo.position.y = 1.75;
    g.add(holo);
    const text = stationLabel(STATION_LABEL[id], css(color));
    text.position.y = 2.75;
    g.add(text);
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.03, 0), new THREE.Vector3(x, 0.03, z)]), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.16 })));
    scene.add(g);
    stations.set(id, { x, z, holo, pulse: 0 });
  });

  // Robots
  const bots: Bot[] = opts.bots.map((def, index) => {
    const look = BOT_LOOK[def.slug] ?? { color: CYAN, kind: "ops" as Kind };
    const a = (index / Math.max(opts.bots.length, 1)) * Math.PI * 2 + 1.1;
    const rad = 3.5 + (index % 2) * 0.7;
    const dock = { x: Math.cos(a) * rad, z: Math.sin(a) * rad };
    const { mesh, parts } = makeBot(scene, look.color, look.kind);
    mesh.position.set(dock.x, 0.75, dock.z);
    scene.add(mesh);
    const bubbleEl = document.createElement("div");
    bubbleEl.dataset.role = "bubble";
    overlay.appendChild(bubbleEl);
    const tagEl = document.createElement("div");
    tagEl.dataset.role = "tag";
    tagEl.textContent = def.name;
    overlay.appendChild(tagEl);
    const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: look.color, transparent: true, opacity: 0.45 }));
    beam.visible = false;
    scene.add(beam);
    return { def: { ...def }, index, color: look.color, mesh, parts, x: dock.x, z: dock.z, dock, face: a + Math.PI, state: "dock", queue: [], current: null, work: 0, bubble: "", bubbleEl, tagEl, beam };
  });
  const byId = new Map(bots.map((b) => [b.def.id, b]));

  let selectedId = bots[0]?.def.id ?? "";
  let cameraMode: CameraMode = "orbit";
  let leadPulse = 0;
  let lastActivity = "";

  const reportActivity = () => {
    const now: Record<string, string | null> = {};
    for (const b of bots) now[b.def.id] = b.state === "dock" ? null : b.bubble || (b.state === "home" ? "heading back to its dock" : "on its way");
    const signature = JSON.stringify(now);
    if (signature === lastActivity) return;
    lastActivity = signature;
    opts.onActivity(now);
  };

  const projected = new THREE.Vector3();
  const toScreen = (x: number, y: number, z: number) => {
    projected.set(x, y, z).project(camera);
    return { x: (projected.x * 0.5 + 0.5) * canvas.clientWidth, y: (-projected.y * 0.5 + 0.5) * canvas.clientHeight, z: projected.z };
  };

  const onClick = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    let best: Bot | null = null;
    let bestDistance = 46;
    for (const b of bots) {
      const s = toScreen(b.x, 0.75, b.z);
      const d = Math.hypot(s.x - (e.clientX - rect.left), s.y - (e.clientY - rect.top));
      if (d < bestDistance) {
        bestDistance = d;
        best = b;
      }
    }
    if (best) {
      selectedId = best.def.id;
      opts.onSelect(selectedId);
    }
  };
  canvas.addEventListener("click", onClick);

  const moveTo = (b: Bot, tx: number, tz: number, dt: number) => {
    const dx = tx - b.x;
    const dz = tz - b.z;
    const dist = Math.hypot(dx, dz);
    const stepSize = 3.1 * dt;
    if (dist > 0.001) b.face = Math.atan2(dx, dz);
    if (dist <= stepSize) {
      b.x = tx;
      b.z = tz;
      return true;
    }
    b.x += (dx / dist) * stepSize;
    b.z += (dz / dist) * stepSize;
    return false;
  };

  /** Take the next thing off a robot's queue, or send it home. */
  const next = (b: Bot) => {
    const move = b.queue.shift() ?? null;
    b.current = move;
    b.bubble = "";
    if (!move) b.state = "home";
    else if (move.station === null || !stations.has(move.station)) b.state = "report";
    else b.state = "go";
  };

  const tick = (dt: number) => {
    for (const b of bots) {
      if (b.state === "dock") {
        if (b.queue.length) next(b);
      } else if (b.state === "go" && b.current?.station) {
        const s = stations.get(b.current.station);
        if (!s) {
          next(b);
          continue;
        }
        const side = ((b.index % 3) - 1) * 0.75;
        const len = Math.hypot(s.x, s.z);
        const nx = s.x / len;
        const nz = s.z / len;
        if (moveTo(b, s.x - nx * 1.9 - nz * side, s.z - nz * 1.9 + nx * side, dt)) {
          b.state = "work";
          // A long queue means the page is catching up: keep each stop short.
          b.work = b.queue.length > 2 ? 1.3 : 2.6;
          b.bubble = b.current.summary;
          s.pulse = 1;
          b.face = Math.atan2(s.x - b.x, s.z - b.z);
        }
      } else if (b.state === "work") {
        b.work -= dt;
        if (b.work <= 0) next(b);
      } else if (b.state === "report") {
        const a = b.index * 0.9;
        if (moveTo(b, Math.cos(a) * 2.0, Math.sin(a) * 2.0, dt)) {
          b.state = "beam";
          b.work = 2.2;
          b.bubble = b.current?.summary ?? "reporting to Tess";
          b.face = Math.atan2(-b.x, -b.z);
        }
      } else if (b.state === "beam") {
        b.work -= dt;
        if (b.work <= 0) next(b);
      } else if (b.state === "home") {
        if (b.queue.length) next(b);
        else if (moveTo(b, b.dock.x, b.dock.z, dt)) {
          b.state = "dock";
          b.current = null;
        }
      }
    }
    reportActivity();
  };

  const cameraPosition = new THREE.Vector3(0, 9, 15);
  const cameraAim = new THREE.Vector3(0, 1.2, 0);
  const wantPosition = new THREE.Vector3();
  const wantAim = new THREE.Vector3();
  const beamFrom = new THREE.Vector3();
  const beamTo = new THREE.Vector3(0, 2.1, 0);
  let busyEase = 0;
  let last = 0;
  let raf = 0;
  // Frame timing for the first few seconds decides whether this machine gets the lighter view.
  let measured = 0;
  let measuredTime = 0;
  let lite = false;

  const frame = (ms: number) => {
    const t = ms / 1000;
    const elapsed = last ? t - last : 0;
    // Capped high enough that a slow machine still keeps pace with the clock.
    const dt = Math.min(elapsed, 0.25);
    last = t;
    if (!lite && measured < 120 && elapsed > 0 && elapsed < 1) {
      measured += 1;
      measuredTime += elapsed;
      // Under about 24 frames a second: drop the glow pass and the extra pixels.
      if (measured === 120 && measuredTime / measured > 0.042) {
        lite = true;
        bloom.enabled = false;
        renderer.setPixelRatio(1);
        fit();
      }
    }
    tick(dt);

    // The Core swells, eased, when a robot reports or Tess herself does something.
    leadPulse = Math.max(0, leadPulse - dt * 0.5);
    const busyNow = bots.some((b) => b.state === "beam") ? 1 : leadPulse;
    busyEase += (busyNow - busyEase) * Math.min(1, dt * 2.5);
    const speed = calm ? 0.4 : 1;
    for (let i = 0; i < N; i++) {
      const x = dir[i * 3];
      const y = dir[i * 3 + 1];
      const z = dir[i * 3 + 2];
      const n = Math.sin(x * 3.1 + t * 1.6 * speed) * Math.sin(y * 4.3 - t * 1.3 * speed) + Math.sin(z * 5.2 + t * 2 * speed) * 0.6;
      const radius = 0.95 + n * (0.1 + busyEase * 0.06);
      corePositions[i * 3] = x * radius;
      corePositions[i * 3 + 1] = y * radius;
      corePositions[i * 3 + 2] = z * radius;
    }
    coreGeometry.attributes.position.needsUpdate = true;
    corePoints.rotation.y = t * 0.25;
    heart.scale.setScalar(1 + Math.sin(t * 2) * 0.06 + busyEase * 0.14);
    coreLight.intensity = 30 + Math.sin(t * 2) * 2.5 + busyEase * 8;

    for (const s of stations.values()) {
      s.pulse = Math.max(0, s.pulse - dt * 0.6);
      s.holo.rotation.y = t * (0.5 + s.pulse * 3);
      s.holo.position.y = 1.75 + Math.sin(t * 1.5 + s.x) * 0.08;
      s.holo.scale.setScalar(1 + s.pulse * 0.18);
    }

    for (const b of bots) {
      const idx = b.index;
      const out = b.state !== "dock";
      const awake = b.def.awake || out;
      const refused = b.state === "work" && b.current?.kind === "refused";
      const m = b.mesh;
      const p = b.parts;
      const hover = awake ? 0.75 + Math.sin(t * (out ? 9 : 2) + idx) * (out ? 0.05 : 0.06) : 0.42;
      m.position.set(b.x, hover, b.z);
      const turn = Math.atan2(Math.sin(b.face - m.rotation.y), Math.cos(b.face - m.rotation.y));
      m.rotation.y += turn * Math.min(1, dt * 8);
      // A refusal: stop and shake the head.
      if (refused) m.rotation.y = b.face + Math.sin(t * 13) * 0.38;
      m.rotation.x = b.state === "go" || b.state === "report" || b.state === "home" ? 0.22 : awake ? 0 : 0.35;
      m.rotation.z = b.state === "work" && !refused ? Math.sin(t * 12) * 0.06 : 0;

      p.shell.color.setHex(awake ? 0x4a6478 : 0x1c2630);
      p.glow.color.setHex(awake ? (refused ? RED : b.color) : 0x2a3540);
      p.soft.color.setHex(awake ? b.color : 0x2a3540);
      p.jet.scale.y = out ? 1 + Math.sin(t * 26 + idx) * 0.18 : 0.6;
      p.jet.material.opacity = awake ? (out ? 0.26 : 0.12) : 0.03;
      p.shadow.material.opacity = awake ? 0.09 : 0.02;

      const blink = Math.sin(t * 0.7 + idx * 1.7) > 0.985 ? 0.1 : 1;
      const glad = b.state === "beam" || b.state === "report";
      const lid = !awake ? 0.12 : refused ? 0.3 : b.state === "work" ? 0.55 : blink;
      for (const eye of p.eyes) {
        eye.visible = !glad;
        eye.scale.y = 1.4 * lid;
      }
      for (const smile of p.happy) smile.visible = glad;
      p.hands.forEach((hand, hi) => {
        const sx = hi ? 1 : -1;
        if (refused) hand.position.set(sx * 0.46, 0.02, 0.2);
        else if (b.state === "work") hand.position.set(sx * 0.26, -0.04 + Math.sin(t * 15 + hi * 3.14) * 0.06, 0.44);
        else if (glad) hand.position.set(sx * 0.52, 0.16 + Math.sin(t * 9 + hi) * 0.05, 0.12);
        else if (!awake) hand.position.set(sx * 0.42, -0.3, 0.04);
        else hand.position.set(sx * 0.5, -0.12 + Math.sin(t * 3 + idx + hi) * 0.03, 0.1);
      });
      if (p.halo) p.halo.rotation.z = t * 1.2;
      if (p.coin) p.coin.rotation.y = t * 2;

      const at = b.state === "work" && !refused && b.current?.station ? stations.get(b.current.station) : undefined;
      p.bits.forEach((bit, bi) => {
        bit.visible = Boolean(at);
        if (!at) return;
        const prog = (t * 0.9 + bi / 3) % 1;
        const ease = prog * prog * (3 - 2 * prog);
        bit.position.set(at.x + (b.x - at.x) * ease, 1.75 + (hover - 1.75) * ease + Math.sin(prog * Math.PI) * 0.5, at.z + (b.z - at.z) * ease);
        bit.rotation.set(t * 3, t * 2, 0);
        bit.scale.setScalar(1 - prog * 0.5);
      });

      p.shadow.position.y = -hover + 0.03;
      p.ring.visible = b.def.id === selectedId;
      p.ring.position.y = -hover + 0.05;
      p.ring.rotation.z = t;

      if (b.state === "beam") {
        b.beam.visible = true;
        b.beam.geometry.setFromPoints([beamFrom.set(b.x, hover, b.z), beamTo]);
      } else b.beam.visible = false;

      const head = toScreen(b.x, hover + 0.75, b.z);
      const feet = toScreen(b.x, hover - 0.75, b.z);
      const visible = head.z < 1;
      const showBubble = visible && Boolean(b.bubble) && (b.state === "work" || b.state === "beam");
      b.bubbleEl.style.opacity = showBubble ? "1" : "0";
      if (showBubble) {
        if (b.bubbleEl.textContent !== b.bubble) b.bubbleEl.textContent = b.bubble;
        const kind = b.current?.kind;
        b.bubbleEl.style.borderColor = kind === "refused" ? css(RED) : kind === "needs_john" ? css(AMBER) : css(b.color);
        b.bubbleEl.style.left = `${head.x}px`;
        b.bubbleEl.style.top = `${head.y - 6}px`;
      }
      b.tagEl.style.display = visible ? "block" : "none";
      b.tagEl.style.left = `${feet.x}px`;
      b.tagEl.style.top = `${feet.y}px`;
      b.tagEl.dataset.selected = b.def.id === selectedId ? "true" : "false";
      b.tagEl.style.opacity = awake ? "1" : "0.5";
    }

    if (cameraMode === "orbit") {
      const a = calm ? 0.6 : t * 0.06;
      wantPosition.set(Math.sin(a) * 16, 8.5, Math.cos(a) * 16);
      wantAim.set(0, 1.2, 0);
    } else if (cameraMode === "top") {
      wantPosition.set(0.01, 24, 6);
      wantAim.set(0, 0, 0);
    } else {
      const sb = byId.get(selectedId) ?? bots[0];
      if (sb) {
        const fl = Math.max(Math.hypot(sb.x, sb.z), 0.01);
        wantPosition.set(sb.x + (sb.x / fl) * 4.2 + 2.2, 4.4, sb.z + (sb.z / fl) * 4.2 + 2.2);
        wantAim.set(sb.x * 0.8, 0.8, sb.z * 0.8);
      }
    }
    cameraPosition.lerp(wantPosition, Math.min(1, dt * 1.6));
    cameraAim.lerp(wantAim, Math.min(1, dt * 2.2));
    camera.position.copy(cameraPosition);
    camera.lookAt(cameraAim);
    composer.render();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    enqueue(move) {
      const bot = byId.get(move.agentId);
      if (bot) {
        bot.queue.push(move);
        return;
      }
      // Tess's own step: no robot moves. The station lights and the Core swells.
      if (move.agentId === opts.leadId) {
        leadPulse = 1;
        const s = move.station ? stations.get(move.station) : undefined;
        if (s) s.pulse = 1;
      }
    },
    clear() {
      for (const b of bots) {
        b.queue = [];
        b.current = null;
        b.bubble = "";
        if (b.state !== "dock") b.state = "home";
      }
    },
    setAwake(id, awake) {
      const bot = byId.get(id);
      if (bot) bot.def.awake = awake;
    },
    select(id) {
      if (byId.has(id)) selectedId = id;
    },
    setCamera(mode) {
      cameraMode = mode;
    },
    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener("click", onClick);
      for (const b of bots) {
        b.bubbleEl.remove();
        b.tagEl.remove();
      }
      scene.traverse((object) => {
        const item = object as THREE.Mesh;
        item.geometry?.dispose?.();
        const material = item.material as THREE.Material | THREE.Material[] | undefined;
        for (const mat of Array.isArray(material) ? material : material ? [material] : []) {
          (mat as THREE.SpriteMaterial).map?.dispose();
          mat.dispose();
        }
      });
      composer.dispose();
      renderer.dispose();
    },
  };
}
