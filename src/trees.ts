import * as THREE from "three";

import type { Kind } from "./looks";

export type Rng = () => number;

export function rng(seed: number): Rng {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A woody segment; shade 1 is the darker bark of the trunk and main limbs. */
export type Limb = { a: THREE.Vector3; b: THREE.Vector3; r: number; shade: 0 | 1 };
/** A blossom or leaflet: where it rests on the tree, its turn and its size. */
export type Leaf = { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3; tint?: string };
export type Tree = { limbs: Limb[]; leaves: Leaf[]; top: number; reach: number };

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const pick = (r: Rng, [a, b]: [number, number]) => lerp(a, b, r());
const heading = (az: number, el: number) => V(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
const tumble = (r: Rng) => new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * Math.PI, r() * Math.PI, r() * Math.PI));

function inBall(r: Rng) {
  const th = r() * Math.PI * 2;
  const ph = Math.acos(2 * r() - 1);
  const k = Math.cbrt(r());
  return V(k * Math.sin(ph) * Math.cos(th), k * Math.cos(ph), k * Math.sin(ph) * Math.sin(th));
}

type Fork = { depth: number; first: number; spread: [number, number]; decay: [number, number]; lift: number; triple: number };

/** Broadleaf branching; children are spaced around the parent so the crown doesn't lean. */
function fork(r: Rng, f: Fork, limbs: Limb[], tips: THREE.Vector3[], a: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number) {
  const b = a.clone().addScaledVector(dir, len);
  limbs.push({ a: a.clone(), b, r: rad, shade: depth < 2 ? 1 : 0 });
  if (depth >= f.depth) {
    tips.push(b);
    return;
  }
  if (depth >= f.depth - 2) tips.push(a.clone().lerp(b, 0.6));
  const n = depth === 0 ? f.first : r() < f.triple ? 3 : 2;
  const u = V().crossVectors(dir, Math.abs(dir.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0)).normalize();
  const v = V().crossVectors(dir, u);
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 + r() * 0.7 + depth * 1.3;
    const tilt = pick(r, f.spread);
    const next = dir
      .clone()
      .multiplyScalar(Math.cos(tilt))
      .addScaledVector(u, Math.cos(az) * Math.sin(tilt))
      .addScaledVector(v, Math.sin(az) * Math.sin(tilt));
    next.y = Math.max(next.y, f.lift);
    fork(r, f, limbs, tips, b, next.normalize(), len * pick(r, f.decay), rad * 0.66, depth + 1);
  }
}

/** Blossom clouds around the branch tips. */
function crown(r: Rng, tips: THREE.Vector3[], n: number, radius: [number, number], squash: number, size: [number, number]): Leaf[] {
  return Array.from({ length: n }, () => {
    const o = inBall(r).multiplyScalar(pick(r, radius));
    o.y *= squash;
    const s = pick(r, size);
    return { p: tips[Math.floor(r() * tips.length)].clone().add(o), q: tumble(r), s: V(s, s, s) };
  });
}

// Guayacán: blooms with no leaves at all, so the crown is pure yellow on bare limbs.
function guayacan(r: Rng, span: number, n: number) {
  const h = span * 0.8;
  const limbs: Limb[] = [];
  const tips: THREE.Vector3[] = [];
  const f: Fork = { depth: 5, first: 3, spread: [0.5, 0.95], decay: [0.68, 0.8], lift: 0.12, triple: 0.3 };
  fork(r, f, limbs, tips, V(), V(r() * 0.1 - 0.05, 1, r() * 0.1 - 0.05).normalize(), h * 0.3, h * 0.032, 0);
  return { limbs, leaves: crown(r, tips, n, [h * 0.03, h * 0.085], 0.75, [0.55, 1]) };
}

// Jacaranda: a vase of upright limbs with a wide, airy, flat-bottomed haze of blue.
function jacaranda(r: Rng, span: number, n: number) {
  const h = span * 0.74;
  const limbs: Limb[] = [];
  const tips: THREE.Vector3[] = [];
  const f: Fork = { depth: 5, first: 4, spread: [0.42, 0.72], decay: [0.72, 0.84], lift: 0.3, triple: 0.2 };
  fork(r, f, limbs, tips, V(), V(0, 1, 0), h * 0.22, h * 0.028, 0);
  return { limbs, leaves: crown(r, tips, n, [h * 0.05, h * 0.11], 0.5, [0.4, 0.75]) };
}

// Flamboyán: short trunk, limbs that run out almost flat, and a red umbrella on top.
function flamboyan(r: Rng, span: number, n: number) {
  const h = span * 0.6;
  const base = V(0, h * 0.26, 0);
  const limbs: Limb[] = [{ a: V(), b: base, r: h * 0.045, shade: 1 }];
  const tips: THREE.Vector3[] = [];
  const arms = 5;
  for (let i = 0; i < arms; i++) {
    const az = (i / arms) * Math.PI * 2 + r() * 0.5;
    const end = base.clone().addScaledVector(heading(az, pick(r, [0.35, 0.55])), h * pick(r, [0.28, 0.34]));
    limbs.push({ a: base, b: end, r: h * 0.026, shade: 1 });
    const subs = r() < 0.5 ? 3 : 2;
    for (let j = 0; j < subs; j++) {
      const az2 = az + (j - (subs - 1) / 2) * 0.7 + (r() - 0.5) * 0.3;
      const end2 = end.clone().addScaledVector(heading(az2, pick(r, [0.12, 0.3])), h * pick(r, [0.18, 0.24]));
      limbs.push({ a: end, b: end2, r: h * 0.014, shade: 0 });
      tips.push(end2);
      for (let k = 0; k < 2; k++) {
        const end3 = end2.clone().addScaledVector(heading(az2 + (k - 0.5) * 0.8, pick(r, [0.05, 0.2])), h * 0.12);
        limbs.push({ a: end2, b: end3, r: h * 0.007, shade: 0 });
        tips.push(end3);
      }
    }
  }
  const R = Math.max(...tips.map((t) => Math.hypot(t.x, t.z))) + h * 0.06;
  const cy = Math.max(...tips.map((t) => t.y)) + h * 0.03;
  const leaves: Leaf[] = Array.from({ length: n }, () => {
    const rr = R * Math.sqrt(r());
    const a = r() * Math.PI * 2;
    const x = rr * Math.cos(a);
    const z = rr * Math.sin(a);
    const y = cy + h * 0.1 * (1 - (rr / R) ** 2) + (r() - 0.5) * h * 0.08 + h * 0.025 * Math.sin(x * 0.35) * Math.cos(z * 0.3);
    const s = pick(r, [0.5, 0.9]);
    return { p: V(x, y, z), q: tumble(r), s: V(s, s, s) };
  });
  return { limbs, leaves };
}

// Royal palm: a pale, gently curved column and a head of drooping fronds made of leaflets.
function palm(r: Rng, span: number, n: number) {
  const h = span * 0.9;
  const limbs: Limb[] = [];
  const lean = heading(r() * Math.PI * 2, 0).multiplyScalar(h * 0.1);
  const p0 = V();
  const p1 = V(lean.x * 0.15, h * 0.45, lean.z * 0.15);
  const p2 = V(lean.x, h * 0.8, lean.z);
  const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
  const segs = 16;
  for (let i = 0; i < segs; i++) {
    limbs.push({ a: curve.getPoint(i / segs), b: curve.getPoint((i + 1) / segs), r: h * lerp(0.024, 0.016, i / segs), shade: (i % 2) as 0 | 1 });
  }
  const crownAt = p2.clone().add(V(0, h * 0.01, 0));

  const fronds = 12;
  const shape = Array.from({ length: fronds }, (_, i) => ({
    az: (i / fronds) * Math.PI * 2 + (r() - 0.5) * 0.3,
    el: pick(r, [0.2, 0.85]),
    len: h * pick(r, [0.34, 0.44]),
  }));
  const along = (f: (typeof shape)[number], s: number) => {
    const d = f.len * s;
    return crownAt.clone().add(V(Math.cos(f.az) * Math.cos(f.el) * d, Math.sin(f.el) * d - f.len * 0.55 * s * s, Math.sin(f.az) * Math.cos(f.el) * d));
  };
  for (const f of shape) for (let k = 0; k < 6; k++) limbs.push({ a: along(f, k / 6), b: along(f, (k + 1) / 6), r: h * 0.004, shade: 0 });

  const X = V(1, 0, 0);
  const leaves: Leaf[] = [];
  // A few coconuts tucked under the crown.
  for (let i = 0; i < Math.min(8, n); i++) {
    const a = (i / 8) * Math.PI * 2;
    leaves.push({ p: crownAt.clone().add(V(Math.cos(a) * h * 0.022, -h * 0.025 - r() * h * 0.015, Math.sin(a) * h * 0.022)), q: tumble(r), s: V(0.7, 0.7, 0.7), tint: "#6b4a22" });
  }
  for (let i = leaves.length; i < n; i++) {
    const f = shape[i % fronds];
    const s = 0.08 + 0.92 * r();
    const side = r() < 0.5 ? -1 : 1;
    const perp = V(-Math.sin(f.az), 0, Math.cos(f.az)).multiplyScalar(side);
    const ell = f.len * 0.17 * Math.sin(Math.PI * (0.15 + 0.85 * s)) + 0.3;
    const dir = perp.clone().add(V(0, -0.45, 0)).normalize();
    const p = along(f, s).addScaledVector(dir, ell * 0.5);
    leaves.push({ p, q: new THREE.Quaternion().setFromUnitVectors(X, dir), s: V(ell, 0.07, 0.22) });
  }
  return { limbs, leaves };
}

const GROWERS = { guayacan, jacaranda, palm, flamboyan };

/** Grows `kind` to fit a plot `span` wide, with exactly `n` leaves. */
export function grow(kind: Kind, r: Rng, span: number, n: number): Tree {
  const { limbs, leaves } = GROWERS[kind](r, span, n);
  let top = 0;
  let reach = 0;
  for (const l of leaves) {
    l.p.y = Math.max(l.p.y, 1.2);
    top = Math.max(top, l.p.y + l.s.y);
    reach = Math.max(reach, Math.hypot(l.p.x, l.p.z) + Math.max(l.s.x, l.s.z) * 0.5);
  }
  return { limbs, leaves, top, reach };
}
