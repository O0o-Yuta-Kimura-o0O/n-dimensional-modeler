/**
 * Physics / quantum sample shapes that are most naturally described in 4 or more dimensions.
 * Each builder returns explicit vertices + edges (+ facets when the sample is a convex solid).
 */
import type { Vec } from './linalg';
import { complement, dot, matVec, orthonormalize, pad, zeros } from './linalg';
import { hypercube, polygon, product } from './primitives';
import type { Shape } from './shape';
import { newId } from './shape';

export type PhysicsKind = 'lightcone' | 'hopf' | 'calabiyau' | 'quasicrystal' | 'e8' | 'string10';
export const PHYSICS: PhysicsKind[] = ['lightcone', 'hopf', 'calabiyau', 'quasicrystal', 'e8', 'string10'];

/** Native dimension of each sample. */
export const PHYSICS_DIM: Record<PhysicsKind, number> = {
  lightcone: 4,
  hopf: 4,
  calabiyau: 4,
  quasicrystal: 6,
  e8: 8,
  string10: 10,
};

interface Geo {
  verts: Vec[];
  edges: [number, number][];
  /** one entry per convex cell; null = wire-frame only */
  cells: { verts: number[]; facets: number[][] }[] | null;
}

// ───────────────────────────────── light cone (Minkowski space-time, axes x y z + t=w)

/** Convex UV-sphere polyhedron (planar trapezoids + cap triangles). */
function uvSphere(nLat: number, nLon: number, r: number): { verts: Vec[]; edges: [number, number][]; facets: number[][] } {
  const verts: Vec[] = [[0, r, 0]];
  for (let i = 1; i < nLat; i++) {
    const th = (Math.PI * i) / nLat;
    for (let j = 0; j < nLon; j++) {
      const ph = (2 * Math.PI * j) / nLon;
      verts.push([r * Math.sin(th) * Math.cos(ph), r * Math.cos(th), r * Math.sin(th) * Math.sin(ph)]);
    }
  }
  const south = verts.length;
  verts.push([0, -r, 0]);
  const id = (i: number, j: number) => 1 + (i - 1) * nLon + (((j % nLon) + nLon) % nLon);
  const edges: [number, number][] = [];
  const facets: number[][] = [];
  for (let j = 0; j < nLon; j++) {
    edges.push([0, id(1, j)]);
    edges.push([south, id(nLat - 1, j)]);
    facets.push([0, id(1, j), id(1, j + 1)]);
    facets.push([south, id(nLat - 1, j), id(nLat - 1, j + 1)]);
  }
  for (let i = 1; i < nLat; i++) {
    for (let j = 0; j < nLon; j++) {
      edges.push([id(i, j), id(i, j + 1)]);
      if (i + 1 < nLat) {
        edges.push([id(i, j), id(i + 1, j)]);
        facets.push([id(i, j), id(i, j + 1), id(i + 1, j + 1), id(i + 1, j)]);
      }
    }
  }
  return { verts, edges, facets };
}

function lightCone(): Geo {
  const T = 1.1; // extent in time
  const s = uvSphere(6, 16, T); // light travels distance |t| (c = 1)
  const verts: Vec[] = [[0, 0, 0, 0]]; // the event "here and now"
  const edges: [number, number][] = [];
  const cells: Geo['cells'] = [];
  for (const sign of [1, -1]) {
    const off = verts.length;
    for (const v of s.verts) verts.push([v[0], v[1], v[2], sign * T]);
    const base = s.verts.map((_, i) => off + i);
    for (const [a, b] of s.edges) edges.push([off + a, off + b]);
    base.forEach((i, k) => { if (k % 2 === 0 || k === 0) edges.push([0, i]); });
    cells.push({ verts: [0, ...base], facets: [base, ...s.facets.map((f) => [0, ...f.map((i) => off + i)])] });
  }
  return { verts, edges, cells };
}

// ───────────────────────────────── Hopf fibration S³ → S² (qubit states → Bloch sphere)

function hopf(): Geo {
  const verts: Vec[] = [];
  const edges: [number, number][] = [];
  const seg = 64;
  const fiber = (theta: number, phi: number) => {
    const s0 = verts.length;
    const c = Math.cos(theta / 2);
    const s = Math.sin(theta / 2);
    for (let k = 0; k < seg; k++) {
      const psi = (2 * Math.PI * k) / seg;
      verts.push([c * Math.cos(psi), c * Math.sin(psi), s * Math.cos(psi + phi), s * Math.sin(psi + phi)]);
      edges.push([s0 + k, s0 + ((k + 1) % seg)]);
    }
  };
  // fibres over points of the Bloch sphere: two poles + four latitude circles
  fiber(0, 0);
  fiber(Math.PI, 0);
  for (const theta of [Math.PI / 4, Math.PI / 2.2, Math.PI / 1.6, (3 * Math.PI) / 4]) {
    for (let j = 0; j < 10; j++) fiber(theta, (2 * Math.PI * j) / 10);
  }
  return { verts, edges, cells: null };
}

// ───────────────────────────────── Calabi–Yau: quintic z1⁵ + z2⁵ = 1 in C² ≅ R⁴

function cpow(re: number, im: number, p: number): [number, number] {
  const r = Math.hypot(re, im);
  if (r === 0) return [0, 0];
  const a = Math.atan2(im, re) * p;
  const m = r ** p;
  return [m * Math.cos(a), m * Math.sin(a)];
}

function calabiYau(n = 5): Geo {
  const verts: Vec[] = [];
  const edges: [number, number][] = [];
  const nx = 9;
  const ny = 9;
  for (let k1 = 0; k1 < n; k1++) for (let k2 = 0; k2 < n; k2++) {
    const off = verts.length;
    const p1 = (2 * Math.PI * k1) / n;
    const p2 = (2 * Math.PI * k2) / n;
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const x = (Math.PI / 2) * (i / (nx - 1));
      const y = -1 + (2 * j) / (ny - 1);
      // cos(x+iy), sin(x+iy)
      const [c1, c2] = cpow(Math.cos(x) * Math.cosh(y), -Math.sin(x) * Math.sinh(y), 2 / n);
      const [s1, s2] = cpow(Math.sin(x) * Math.cosh(y), Math.cos(x) * Math.sinh(y), 2 / n);
      const z1 = [c1 * Math.cos(p1) - c2 * Math.sin(p1), c1 * Math.sin(p1) + c2 * Math.cos(p1)];
      const z2 = [s1 * Math.cos(p2) - s2 * Math.sin(p2), s1 * Math.sin(p2) + s2 * Math.cos(p2)];
      verts.push([z1[0], z2[0], z1[1], z2[1]]);
      if (i > 0) edges.push([off + (i - 1) * ny + j, off + i * ny + j]);
      if (j > 0) edges.push([off + i * ny + j - 1, off + i * ny + j]);
    }
  }
  return { verts, edges, cells: null };
}

// ───────────────────────────────── icosahedral quasicrystal: 6-cube in cut-and-project orientation

/** 6×6 orthogonal matrix: first 3 rows = physical ("parallel") space, last 3 = perpendicular space. */
export function icosahedralBasis(): number[][] {
  const g = (1 + Math.sqrt(5)) / 2;
  const axes = [[0, 1, g], [0, -1, g], [1, g, 0], [-1, g, 0], [g, 0, 1], [g, 0, -1]].map((a) => {
    const l = Math.hypot(a[0], a[1], a[2]);
    return a.map((x) => x / l);
  });
  // rows of P: component c of every axis / √2  → orthonormal rows
  const P = [0, 1, 2].map((c) => axes.map((a) => a[c] / Math.SQRT2));
  return P.concat(complement(P, 6));
}

function quasicrystal(): Geo {
  const c = hypercube(6, 0.6);
  const M = icosahedralBasis();
  return { verts: c.verts.map((v) => matVec(M, v)), edges: c.edges, cells: [{ verts: [...c.verts.keys()], facets: c.facets }] };
}

// ───────────────────────────────── E8 root polytope (Gosset 4₂₁), Petrie projection on x–y

export function e8Roots(): Vec[] {
  const r: Vec[] = [];
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) for (const a of [-1, 1]) for (const b of [-1, 1]) {
    const v = zeros(8); v[i] = a; v[j] = b; r.push(v);
  }
  for (let m = 0; m < 256; m++) {
    let neg = 0;
    const v = zeros(8).map((_, i) => { const s = (m >> i) & 1; neg += s; return s ? -0.5 : 0.5; });
    if (neg % 2 === 0) r.push(v);
  }
  return r;
}

/** Orthonormal basis whose first two vectors span the Coxeter (Petrie) plane of E8. */
export function e8PetrieBasis(): number[][] {
  const simple: Vec[] = [[0.5, -0.5, -0.5, -0.5, -0.5, -0.5, -0.5, 0.5]];
  const e = (i: number) => { const v = zeros(8); v[i] = 1; return v; };
  simple.push(e(0).map((x, i) => x + e(1)[i]));
  for (let i = 0; i < 6; i++) simple.push(e(i + 1).map((x, k) => x - e(i)[k]));
  // Coxeter element c = s1 s2 … s8
  const apply = (x: Vec): Vec => {
    let y = x.slice();
    for (let k = simple.length - 1; k >= 0; k--) {
      const a = simple[k];
      const d = dot(y, a);
      y = y.map((t, i) => t - d * a[i]);
    }
    return y;
  };
  const h = 30;
  const seed = [0.31, 0.17, 0.53, 0.11, 0.71, 0.29, 0.43, 0.97];
  const u = zeros(8);
  const w = zeros(8);
  let x = seed.slice();
  for (let k = 0; k < h; k++) {
    const a = (2 * Math.PI * k) / h;
    for (let i = 0; i < 8; i++) { u[i] += Math.cos(a) * x[i]; w[i] += Math.sin(a) * x[i]; }
    x = apply(x);
  }
  const plane = orthonormalize([u, w]);
  return plane.concat(complement(plane, 8));
}

/** E8 lattice vectors of squared norm 4 and 8 – the facet normals of 4₂₁. */
function e8FacetNormals(): { n: Vec; max: number }[] {
  const out: { n: Vec; max: number }[] = [];
  const roots = new Set(e8Roots().map((r) => r.map((x) => x * 2).join(',')));
  const rec = (vals: number[], acc: number[], sq: number, target: number, cb: (v: number[]) => void) => {
    if (acc.length === 8) { if (sq === target) cb(acc.slice()); return; }
    for (const x of vals) {
      const s2 = sq + x * x;
      if (s2 > target) continue;
      acc.push(x);
      rec(vals, acc, s2, target, cb);
      acc.pop();
    }
  };
  for (const target of [4, 8]) {
    const push = (v: number[]) => {
      if (target === 8 && roots.has(v.join(','))) return; // 2 × root – not a facet direction
      out.push({ n: v, max: target === 4 ? 2 : 3 });
    };
    // integer vectors with even coordinate sum
    rec([-2, -1, 0, 1, 2], [], 0, target, (v) => { if (v.reduce((a, b) => a + b, 0) % 2 === 0) push(v); });
    // half-integer vectors (x ∈ ±½, ±3/2, ±5/2) with even coordinate sum
    rec([-2.5, -1.5, -0.5, 0.5, 1.5, 2.5], [], 0, target, (v) => { if (Math.round(v.reduce((a, b) => a + b, 0)) % 2 === 0) push(v); });
  }
  return out;
}

function e8(): Geo {
  const roots = e8Roots();
  const edges: [number, number][] = [];
  for (let i = 0; i < roots.length; i++) for (let j = i + 1; j < roots.length; j++) {
    if (Math.abs(dot(roots[i], roots[j]) - 1) < 1e-9) edges.push([i, j]);
  }
  const facets: number[][] = [];
  for (const f of e8FacetNormals()) {
    const on: number[] = [];
    roots.forEach((r, i) => { if (Math.abs(dot(f.n, r) - f.max) < 1e-9) on.push(i); });
    facets.push(on);
  }
  const B = e8PetrieBasis();
  const verts = roots.map((r) => matVec(B, r).map((x) => x * 1.15));
  return { verts, edges, cells: [{ verts: [...roots.keys()], facets }] };
}

// ───────────────────────────────── superstring space-time: M⁴ × T⁶ (10-D)

function string10(): Geo {
  const space = hypercube(4, 0.7);
  const ring = polygon(5, 0.22);
  const t6 = product(ring, product(ring, ring));
  const g = product(space, t6);
  return { verts: g.verts, edges: g.edges, cells: [{ verts: [...g.verts.keys()], facets: g.facets }] };
}

const BUILDERS: Record<PhysicsKind, () => Geo> = { lightcone: lightCone, hopf, calabiyau: () => calabiYau(5), quasicrystal, e8, string10 };

export function makePhysics(kind: PhysicsKind, color: string, D: number): Shape {
  const g = BUILDERS[kind]();
  const N = Math.max(D, PHYSICS_DIM[kind]);
  return {
    id: newId(),
    kind,
    label: `${PHYSICS_DIM[kind]}D`,
    color,
    visible: true,
    verts: g.verts.map((v) => pad(v.slice(), N)),
    edges: g.edges,
    cells: g.cells,
  };
}
