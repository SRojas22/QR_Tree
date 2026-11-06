import * as THREE from "three";
import { cellCenter, encode } from "./code";
import { LOOKS, type Kind, type Look } from "./looks";
import { grow, hash, rng } from "./trees";

// An isometric tree standing on a film negative whose frame is a QR code.
// Folding drops every blossom into a module of the code and pulls the limbs
// back into the ground; the camera swings overhead so it can be scanned.
// The idea comes from tree.icqr.com.

export type Mode = "tree" | "code";

/** Colours of the film negative the tree stands on. */
export type Film = {
  /** The dark film border. */
  ink: string;
  /** The paper the code is printed on. */
  paper: string;
  /** The faint print of the code under the tree. */
  print: string;
  /** Sprocket holes. */
  hole: string;
  /** Edge print along the film. */
  edge: string;
};

export type TreeOptions = {
  /** Which tree to grow. Defaults to "guayacan". */
  kind?: Kind;
  /** Printed along the film edge. Defaults to the tree's name. */
  label?: string;
  /** Overrides for the tree's colours. */
  look?: Partial<Look>;
  /** The two lines of film edge print, or false for none. */
  edgeText?: [string[], string[]] | false;
};

export type QRTreeOptions = TreeOptions & {
  /** Where to start. Defaults to "tree". */
  mode?: Mode;
  /** Seconds a full tree ↔ code transition takes. Defaults to 1.15. */
  duration?: number;
  /** Overrides for the film colours. */
  film?: Partial<Film>;
  /** Soft shadows while the tree stands. Defaults to true. */
  shadows?: boolean;
  /** Highest device pixel ratio to render at. Defaults to 2. */
  maxPixelRatio?: number;
  /** Resize with the canvas. Defaults to true. */
  autoResize?: boolean;
  /** Stop rendering while the canvas is off screen. Defaults to true. */
  pauseOffscreen?: boolean;
  /** Snap between modes and keep the tree still. Defaults to the user's prefers-reduced-motion setting. */
  reducedMotion?: boolean;
};

export const FILM: Film = {
  ink: "#141215",
  paper: "#f4efe5",
  print: "#d6ccb9",
  hole: "#0f3a2b",
  edge: "#f5a524",
};

const RIM = 3.2; // film border around the code, in modules
const LEAF_H = 0.3; // height of a settled module; uniform so every top lights the same
const TILE_TOP = 0.05;
const ISO_AZ = Math.PI / 4;
const ISO_EL = 0.6;
const TOP_EL = Math.PI / 2 - 1e-4;

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => t * t * (3 - 2 * t);
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type Built = ReturnType<typeof build>;

/**
 * Renders a QR code as a tree into a canvas.
 *
 * ```ts
 * const tree = new QRTree(canvas, { value: "https://example.com", kind: "jacaranda" });
 * canvas.onclick = () => tree.toggle();
 * ```
 */
export class QRTree {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1000, 1000);
  private hemi = new THREE.HemisphereLight("#fff8ec", "#3b5a44", 0.9);
  private key = new THREE.DirectionalLight("#fff1dc", 1.7);
  private ambient = new THREE.AmbientLight("#ffffff", 0.35);
  private built: Built | null = null;
  private film: Film;
  private duration: number;
  private still: boolean;
  private morph = 0;
  private target = 0;
  private time = 0;
  private last = 0;
  private raf = 0;
  private paused = false;
  private hidden = false;
  private disposed = false;
  private posed = -1;
  private watchers: { disconnect: () => void }[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    options: QRTreeOptions & { value: string },
  ) {
    const { value, mode = "tree", duration = 1.15, film, shadows = true, maxPixelRatio = 2, autoResize = true, pauseOffscreen = true } = options;
    this.film = { ...FILM, ...film };
    this.duration = Math.max(duration, 1e-3);
    this.still = options.reducedMotion ?? (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.key.castShadow = shadows;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0005;
    this.key.shadow.normalBias = 0.02;
    this.scene.add(this.hemi, this.key, this.key.target, this.ambient);

    if (autoResize && typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => this.resize());
      ro.observe(canvas);
      this.watchers.push(ro);
    }
    if (pauseOffscreen && typeof IntersectionObserver !== "undefined") {
      const io = new IntersectionObserver(([e]) => {
        this.hidden = !e.isIntersecting;
        this.run();
      });
      io.observe(canvas);
      this.watchers.push(io);
    }

    this.show(value, options);
    this.jump(mode);
    this.resize();
    this.last = performance.now();
    this.loop();
  }

  /** Plants a new tree for `value`. Keeps the current mode; call jump() first to grow it from its code. */
  show(value: string, options: TreeOptions = {}) {
    if (this.built) {
      this.scene.remove(this.built.group);
      this.built.dispose();
    }
    this.built = build(value, options, this.film);
    this.scene.add(this.built.group);
    const cam = this.key.shadow.camera;
    const ext = this.built.outer + 4;
    Object.assign(cam, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 600 });
    cam.updateProjectionMatrix();
    this.posed = -1;
  }

  /** The mode it is in, or heading to. */
  get mode(): Mode {
    return this.target > 0.5 ? "code" : "tree";
  }

  /** Animates to `mode`. */
  setMode(mode: Mode) {
    this.target = mode === "code" ? 1 : 0;
  }

  /** Animates to the other mode and returns it. */
  toggle(): Mode {
    this.target = 1 - this.target;
    return this.mode;
  }

  /** Snaps to `mode` with no transition. */
  jump(mode: Mode) {
    this.morph = this.target = mode === "code" ? 1 : 0;
    this.posed = -1;
  }

  /** Stops (or restarts) the render loop, e.g. while the page is hidden. */
  setPaused(paused: boolean) {
    this.paused = paused;
    this.run();
  }

  /** Matches the drawing buffer to the canvas's CSS size. Called for you unless `autoResize` is off. */
  resize() {
    this.renderer.setSize(this.canvas.clientWidth || 1, this.canvas.clientHeight || 1, false);
  }

  /** Frees the GPU resources. The instance can't be used afterwards. */
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    for (const w of this.watchers) w.disconnect();
    this.built?.dispose();
    this.renderer.dispose();
  }

  private run() {
    if (this.disposed) return;
    cancelAnimationFrame(this.raf);
    if (!this.paused && !this.hidden) {
      this.last = performance.now();
      this.loop();
    }
  }

  private loop = () => {
    if (this.disposed || this.paused || this.hidden) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = this.still ? 0 : Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.time += dt;

    if (this.still) this.morph = this.target;
    else if (this.morph !== this.target) {
      const step = dt / this.duration;
      this.morph = this.target > this.morph ? Math.min(this.target, this.morph + step) : Math.max(this.target, this.morph - step);
    }
    const b = this.built;
    if (b) {
      // Once it is a code nothing moves, so stop rewriting the instances.
      if (this.morph < 1 || this.posed !== 1) b.pose(this.morph, this.time);
      this.posed = this.morph;
      b.drift(dt, this.time, this.still ? 0 : (1 - this.morph) ** 2);
      this.frame(b);
    }
    this.renderer.render(this.scene, this.camera);
  };

  // Fits the plot (and the crown, while it stands) to the canvas at the current angle.
  private frame(b: Built) {
    const e = ease(this.morph);
    const az = lerp(ISO_AZ, 0, e);
    const el = lerp(ISO_EL, TOP_EL, e);
    const dir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    const fwd = dir.clone().negate();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd);

    const pts: THREE.Vector3[] = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0, -1]) pts.push(new THREE.Vector3(sx * b.outer, y, sz * b.outer));
    const h = b.top * (1 - e);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const x = Math.cos(a) * b.reach;
      const z = Math.sin(a) * b.reach;
      pts.push(new THREE.Vector3(x, h * 0.55, z), new THREE.Vector3(x * 0.6, h, z * 0.6));
    }
    let w0 = Infinity, w1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of pts) {
      const w = p.dot(right);
      const v = p.dot(up);
      w0 = Math.min(w0, w); w1 = Math.max(w1, w);
      v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const aspect = (this.canvas.clientWidth || 1) / (this.canvas.clientHeight || 1);
    const half = Math.max((v1 - v0) / 2, (w1 - w0) / 2 / aspect) * 1.04;
    const c = this.camera;
    c.left = -half * aspect;
    c.right = half * aspect;
    c.top = half;
    c.bottom = -half;
    c.updateProjectionMatrix();
    const center = right.multiplyScalar((w0 + w1) / 2).add(up.multiplyScalar((v0 + v1) / 2));
    c.position.copy(center).addScaledVector(dir, 200);
    c.up.set(0, 1, 0);
    c.lookAt(center);

    // Flat, bright light for the code: no shadows across modules, paper blown to white.
    this.key.intensity = lerp(1.7, 0.1, e);
    this.key.shadow.intensity = 1 - e;
    this.ambient.intensity = lerp(0.35, 2.2, e);
    this.hemi.intensity = lerp(0.9, 0.3, e);
    this.key.position.set(-50, 90, 45);
  }
}

function edgePrint(lines: string[], color: string) {
  const c = document.createElement("canvas");
  c.width = 3072;
  c.height = 96;
  const g = c.getContext("2d")!;
  g.fillStyle = color;
  g.font = "600 56px ui-monospace, Menlo, monospace";
  g.textBaseline = "middle";
  const step = c.width / lines.length;
  lines.forEach((t, i) => g.fillText(t, i * step + 40, c.height / 2));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function build(text: string, options: TreeOptions, film: Film) {
  const kind = options.kind ?? "guayacan";
  const look: Look = { ...LOOKS[kind], ...options.look };
  const code = encode(text);
  const r = rng(hash(text + kind));
  const half = code.span / 2;
  const outer = half + RIM;
  const group = new THREE.Group();
  const trash: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(x: T) => (trash.push(x), x);

  // ---- the film: dark border, sprocket holes, edge print, paper frame ----
  const slab = new THREE.Mesh(keep(new THREE.BoxGeometry(outer * 2, 1, outer * 2)), keep(new THREE.MeshLambertMaterial({ color: film.ink })));
  slab.position.y = -0.54;
  slab.receiveShadow = true;
  const plate = new THREE.Mesh(keep(new THREE.BoxGeometry(code.span, 0.3, code.span)), keep(new THREE.MeshLambertMaterial({ color: film.paper })));
  plate.position.y = -0.17;
  plate.receiveShadow = true;
  group.add(slab, plate);

  const holesPerSide = Math.floor((outer * 2) / 1.7);
  const holes = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(0.8, 0.02, 1.05)), keep(new THREE.MeshBasicMaterial({ color: film.hole })), holesPerSide * 2);
  const m = new THREE.Matrix4();
  for (let i = 0; i < holesPerSide; i++) {
    const x = -outer + 0.85 + i * ((outer * 2 - 1.7) / (holesPerSide - 1));
    holes.setMatrixAt(i * 2, m.makeTranslation(x, -0.03, -(half + RIM * 0.5)));
    holes.setMatrixAt(i * 2 + 1, m.makeTranslation(x, -0.03, half + RIM * 0.5));
  }
  group.add(holes);

  const tag = (options.label ?? look.name).toUpperCase();
  const lines = options.edgeText ?? [
    ["◂ QR 400", `${tag}  ▸ 1A`, look.where.toUpperCase(), "▸ 2"],
    [`▸ 3A  ${tag}`, "QR 400 ▸", look.name.toUpperCase(), "4A"],
  ];
  if (lines)
    lines.forEach((line, i) => {
      const geo = keep(new THREE.PlaneGeometry(outer * 2 * 0.9, RIM * 0.5));
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, keep(new THREE.MeshBasicMaterial({ map: keep(edgePrint(line, film.edge)), transparent: true, depthWrite: false })));
      mesh.rotation.y = i ? -Math.PI / 2 : Math.PI / 2;
      mesh.position.set(i ? half + RIM * 0.5 : -(half + RIM * 0.5), -0.025, 0);
      group.add(mesh);
    });

  // Dark modules printed faintly on the paper, so the code shows under the tree.
  const tiles = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(1, 0.08, 1)), keep(new THREE.MeshLambertMaterial({ color: film.print })), code.cells.length);
  tiles.receiveShadow = true;
  code.cells.forEach(([col, row], i) => {
    const { x, z } = cellCenter(code, col, row);
    tiles.setMatrixAt(i, m.makeTranslation(x, TILE_TOP - 0.04, z));
  });
  group.add(tiles);

  // ---- the tree: four blossoms per dark module ----
  const n = code.cells.length * 4;
  const tree = grow(kind, r, code.span, n);

  // Pair leaves with modules by angle around the trunk, so each blossom falls
  // roughly below where it hung instead of flying across the tree.
  const byAngle = (x: number, z: number) => Math.atan2(z, x);
  const leafOrder = tree.leaves.map((l, i) => [byAngle(l.p.x, l.p.z), i] as const).sort((a, b) => a[0] - b[0]);
  const cellOrder = code.cells
    .map(([col, row]) => cellCenter(code, col, row))
    .map((c) => [byAngle(c.x, c.z), c] as const)
    .sort((a, b) => a[0] - b[0]);

  const tp = new Float32Array(n * 3), mp = new Float32Array(n * 3);
  const ts = new Float32Array(n * 3);
  const tq: THREE.Quaternion[] = new Array(n);
  const spin: THREE.Vector3[] = new Array(n);
  const tc = new Float32Array(n * 3), mc = new Float32Array(n * 3);
  const phase = new Float32Array(n), delay = new Float32Array(n), lift = new Float32Array(n);
  const bloom = look.bloom.map((c) => new THREE.Color(c));
  const deep = look.deep.map((c) => new THREE.Color(c));
  const swirl = r() < 0.5 ? -1 : 1;

  leafOrder.forEach(([, i], k) => {
    const l = tree.leaves[i];
    const cell = cellOrder[Math.floor(k / 4)][1];
    const slot = k % 4;
    tp.set([l.p.x, l.p.y, l.p.z], i * 3);
    ts.set([l.s.x, l.s.y, l.s.z], i * 3);
    tq[i] = l.q;
    mp.set([cell.x + ((slot % 2) - 0.5) * 0.5, TILE_TOP + LEAF_H / 2, cell.z + (Math.floor(slot / 2) - 0.5) * 0.5], i * 3);
    const from = l.tint ? new THREE.Color(l.tint) : bloom[Math.floor(r() * bloom.length)];
    tc.set([from.r, from.g, from.b], i * 3);
    phase[i] = r() * Math.PI * 2;
    // Blossoms come off from the top down, so the tree regrows from the bottom up.
    delay[i] = 0.22 * (1 - clamp01(l.p.y / tree.top)) + r() * 0.08;
    lift[i] = 0.6 + r() * 1.4;
    spin[i] = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
  });
  // One tone per module, so each block reads as a single flat square.
  cellOrder.forEach((_, k) => {
    const tone = deep[Math.floor(r() * deep.length)];
    for (let s = 0; s < 4; s++) {
      const i = leafOrder[k * 4 + s][1];
      mc.set([tone.r, tone.g, tone.b], i * 3);
    }
  });

  const leaves = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(1, 1, 1)), keep(new THREE.MeshLambertMaterial()), n);
  leaves.castShadow = true;
  leaves.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(leaves);

  const limbGeo = keep(new THREE.CylinderGeometry(0.75, 1, 1, 6));
  const limbs = new THREE.InstancedMesh(limbGeo, keep(new THREE.MeshLambertMaterial()), tree.limbs.length);
  limbs.castShadow = true;
  const bark = look.bark.map((c) => new THREE.Color(c));
  const farthest = Math.max(...tree.limbs.map((l) => l.a.length()), 1);
  const limbOrder = tree.limbs.map((l) => l.a.length() / farthest);
  tree.limbs.forEach((l, i) => limbs.setColorAt(i, bark[l.shade]));
  group.add(limbs);

  const pos = new THREE.Vector3(), scl = new THREE.Vector3(), q = new THREE.Quaternion(), turn = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0), ID = new THREE.Quaternion(), dir = new THREE.Vector3(), color = new THREE.Color();
  let painted = -1;

  const pose = (t: number, time: number) => {
    for (let i = 0; i < n; i++) {
      const e = ease(clamp01((t - delay[i]) / 0.7));
      const o = i * 3;
      const sway = (1 - e) * 0.35 * (tp[o + 1] / tree.top) * Math.sin(time * 1.2 + phase[i]);
      let x = lerp(tp[o] + sway, mp[o], e);
      let z = lerp(tp[o + 2] + sway * 0.6, mp[o + 2], e);
      const y = lerp(tp[o + 1], mp[o + 1], e) + Math.sin(e * Math.PI) * lift[i];
      // Blossoms swirl around the trunk on the way down.
      const a = Math.sin(e * Math.PI) * 0.6 * swirl;
      [x, z] = [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)];
      pos.set(x, y, z);
      scl.set(lerp(ts[o], 0.52, e), lerp(ts[o + 1], LEAF_H, e), lerp(ts[o + 2], 0.52, e));
      q.slerpQuaternions(tq[i], ID, e).premultiply(turn.setFromAxisAngle(spin[i], Math.sin(e * Math.PI) * 2.2));
      leaves.setMatrixAt(i, m.compose(pos, q, scl));
      if (painted !== t) leaves.setColorAt(i, color.setRGB(lerp(tc[o], mc[o], e), lerp(tc[o + 1], mc[o + 1], e), lerp(tc[o + 2], mc[o + 2], e)));
    }
    leaves.instanceMatrix.needsUpdate = true;
    if (painted !== t && leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
    painted = t;

    // Limbs pull back along themselves, outermost first, until the trunk sinks away.
    let any = false;
    tree.limbs.forEach((l, i) => {
      const k = 1 - smooth(clamp01((t - (1 - limbOrder[i]) * 0.35) / 0.25));
      dir.copy(l.b).sub(l.a);
      const len = dir.length() * k;
      dir.normalize();
      pos.copy(l.a).addScaledVector(dir, len / 2);
      scl.set(l.r * Math.min(1, k * 3), Math.max(len, 1e-4), l.r * Math.min(1, k * 3));
      q.setFromUnitVectors(UP, dir);
      limbs.setMatrixAt(i, m.compose(pos, q, scl));
      any ||= k > 0.01;
    });
    limbs.visible = any;
    limbs.instanceMatrix.needsUpdate = true;
    leaves.castShadow = t < 0.98;
  };

  // ---- petals drifting down while the tree stands ----
  const PETALS = 60;
  const petalMat = keep(new THREE.MeshLambertMaterial({ transparent: true }));
  const petals = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(0.42, 0.06, 0.3)), petalMat, PETALS);
  petals.frustumCulled = false;
  const pst = new Float32Array(PETALS * 5); // x, y, z, speed, phase
  const respawn = (i: number, y: number) => {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * tree.reach * 0.9;
    pst.set([Math.cos(a) * d, y, Math.sin(a) * d, 1.4 + r() * 1.6, r() * Math.PI * 2], i * 5);
  };
  for (let i = 0; i < PETALS; i++) {
    respawn(i, r() * tree.top);
    petals.setColorAt(i, bloom[i % bloom.length]);
  }
  group.add(petals);

  const drift = (dt: number, time: number, vis: number) => {
    petalMat.opacity = vis;
    petals.visible = vis > 0.02;
    if (!petals.visible) return;
    for (let i = 0; i < PETALS; i++) {
      const o = i * 5;
      pst[o + 1] -= pst[o + 3] * dt;
      if (pst[o + 1] < 0.15) respawn(i, tree.top * (0.6 + r() * 0.4));
      const ph = pst[o + 4];
      pos.set(pst[o] + Math.sin(time * 0.9 + ph) * 0.8, pst[o + 1], pst[o + 2] + Math.cos(time * 0.7 + ph) * 0.8);
      q.setFromEuler(new THREE.Euler(time * 1.3 + ph, time * 0.8, ph));
      petals.setMatrixAt(i, m.compose(pos, q, scl.set(1, 1, 1)));
    }
    petals.instanceMatrix.needsUpdate = true;
  };

  const dispose = () => {
    for (const x of trash) x.dispose();
    for (const mesh of [holes, tiles, leaves, limbs, petals]) mesh.dispose();
  };

  return { group, outer, top: tree.top, reach: tree.reach, pose, drift, dispose };
}
