import type { Vec } from './linalg';
import { dot, orthonormalize, pad, scale, sub, zeros } from './linalg';
import type { Shape } from './shape';
import { newId } from './shape';

/** A single convex polytope with explicit combinatorics, in `dim` coordinates. */
interface Poly {
  dim: number;
  verts: Vec[];
  edges: [number, number][];
  facets: number[][];
}

export type PrimitiveKind =
  | 'point'
  | 'simplex'
  | 'hypercube'
  | 'orthoplex'
  | 'polygon'
  | 'prism'
  | 'pyramid'
  | 'duoprism'
  | 'cell24'
  | 'sphere';

export interface PrimitiveParams {
  /** world dimension the primitive is created in */
  dim: number;
  /** polygon sides */
  p: number;
  /** second polygon sides (duoprism) */
  q: number;
}

export const PRIMITIVES: PrimitiveKind[] = ['point', 'simplex', 'hypercube', 'orthoplex', 'polygon', 'prism', 'pyramid', 'duoprism', 'cell24', 'sphere'];

function point(): Poly {
  return { dim: 0, verts: [[]], edges: [], facets: [] };
}

function segment(r = 1): Poly {
  return { dim: 1, verts: [[-r], [r]], edges: [[0, 1]], facets: [[0], [1]] };
}

export function simplex(n: number, r = 1): Poly {
  if (n <= 0) return point();
  // regular simplex: standard basis of R^{n+1} projected onto the hyperplane sum=0
  const N = n + 1;
  const pts: Vec[] = [];
  for (let i = 0; i < N; i++) {
    const v = zeros(N).map((_, j) => (j === i ? 1 : 0) - 1 / N);
    pts.push(v);
  }
  const basis = orthonormalize(pts.slice(0, n));
  let verts = pts.map((p) => basis.map((b) => dot(p, b)));
  const cr = Math.sqrt(dot(verts[0], verts[0]));
  verts = verts.map((v) => scale(v, r / cr));
  // orient so one vertex points "up" (+y) for nicer default views
  const edges: [number, number][] = [];
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) edges.push([i, j]);
  const facets: number[][] = [];
  for (let i = 0; i < N; i++) facets.push([...Array(N).keys()].filter((j) => j !== i));
  return { dim: n, verts, edges, facets };
}

export function hypercube(n: number, h = 0.7): Poly {
  if (n <= 0) return point();
  const V = 1 << n;
  const verts: Vec[] = [];
  for (let m = 0; m < V; m++) verts.push([...Array(n).keys()].map((i) => ((m >> i) & 1 ? h : -h)));
  const edges: [number, number][] = [];
  for (let m = 0; m < V; m++) for (let i = 0; i < n; i++) { const o = m ^ (1 << i); if (o > m) edges.push([m, o]); }
  const facets: number[][] = [];
  for (let i = 0; i < n; i++) {
    facets.push([...Array(V).keys()].filter((m) => !((m >> i) & 1)));
    facets.push([...Array(V).keys()].filter((m) => (m >> i) & 1));
  }
  return { dim: n, verts, edges, facets };
}

export function orthoplex(n: number, r = 1): Poly {
  if (n <= 0) return point();
  if (n === 1) return segment(r);
  const verts: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const a = zeros(n); a[i] = r; verts.push(a);
    const b = zeros(n); b[i] = -r; verts.push(b);
  }
  const edges: [number, number][] = [];
  for (let i = 0; i < 2 * n; i++) for (let j = i + 1; j < 2 * n; j++) if ((i >> 1) !== (j >> 1)) edges.push([i, j]);
  const facets: number[][] = [];
  for (let m = 0; m < 1 << n; m++) facets.push([...Array(n).keys()].map((i) => 2 * i + ((m >> i) & 1)));
  return { dim: n, verts, edges, facets };
}

export function polygon(p: number, r = 1): Poly {
  p = Math.max(3, Math.round(p));
  const verts: Vec[] = [];
  for (let i = 0; i < p; i++) {
    const a = Math.PI / 2 + (2 * Math.PI * i) / p;
    verts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  const edges: [number, number][] = [];
  for (let i = 0; i < p; i++) edges.push([i, (i + 1) % p]);
  return { dim: 2, verts, edges, facets: edges.map((e) => [e[0], e[1]]) };
}

/** Cartesian product A × B (A in the first coordinates, B after). */
export function product(A: Poly, B: Poly): Poly {
  const nb = B.verts.length;
  const id = (i: number, j: number) => i * nb + j;
  const verts: Vec[] = [];
  for (const a of A.verts) for (const b of B.verts) verts.push(a.concat(b));
  const edges: [number, number][] = [];
  for (const [i, i2] of A.edges) for (let j = 0; j < nb; j++) edges.push([id(i, j), id(i2, j)]);
  for (let i = 0; i < A.verts.length; i++) for (const [j, j2] of B.edges) edges.push([id(i, j), id(i, j2)]);
  const facets: number[][] = [];
  for (const f of A.facets) facets.push(f.flatMap((i) => [...Array(nb).keys()].map((j) => id(i, j))));
  for (const g of B.facets) facets.push([...Array(A.verts.length).keys()].flatMap((i) => g.map((j) => id(i, j))));
  return { dim: A.dim + B.dim, verts, edges, facets };
}

/** Pyramid over A: apex in the next coordinate. */
export function pyramid(A: Poly, h = 1.4): Poly {
  const n = A.dim + 1;
  const base = A.verts.map((v) => pad(v, A.dim).concat([-h / 3]));
  const apexIdx = base.length;
  const verts = base.concat([zeros(n).map((_, i) => (i === n - 1 ? (2 * h) / 3 : 0))]);
  const edges = A.edges.concat(A.verts.map((_, i) => [i, apexIdx] as [number, number]));
  const facets = [[...Array(base.length).keys()], ...A.facets.map((f) => f.concat([apexIdx]))];
  if (A.dim === 0) return { dim: 1, verts, edges, facets: [[0], [1]] };
  return { dim: n, verts, edges, facets };
}

export function cell24(): Poly {
  const verts: Vec[] = [];
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) for (const si of [-1, 1]) for (const sj of [-1, 1]) {
    const v = zeros(4); v[i] = si * 0.7; v[j] = sj * 0.7; verts.push(v);
  }
  const edges: [number, number][] = [];
  for (let a = 0; a < 24; a++) for (let b = a + 1; b < 24; b++) {
    const d = sub(verts[a], verts[b]);
    if (Math.abs(dot(d, d) - 2 * 0.49) < 1e-6) edges.push([a, b]);
  }
  const normals: Vec[] = [];
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) { const n = zeros(4); n[i] = s; normals.push(n); }
  for (let m = 0; m < 16; m++) normals.push([0, 1, 2, 3].map((i) => ((m >> i) & 1 ? 0.5 : -0.5)));
  const facets = normals.map((n) => verts.map((v, i) => [dot(n, v), i] as const).filter(([x]) => Math.abs(x - 0.7) < 1e-6).map(([, i]) => i));
  return { dim: 4, verts, edges, facets };
}

/** Wire-frame n-sphere: great circles in every coordinate plane + latitude rings. Not a solid. */
function sphereWire(n: number, r = 1, seg = 48): { verts: Vec[]; edges: [number, number][] } {
  if (n <= 0) return { verts: [[]], edges: [] };
  if (n === 1) return { verts: [[-r], [r]], edges: [[0, 1]] };
  const verts: Vec[] = [];
  const edges: [number, number][] = [];
  const ring = (i: number, j: number, rad: number, k = -1, h = 0) => {
    const s = verts.length;
    for (let t = 0; t < seg; t++) {
      const a = (2 * Math.PI * t) / seg;
      const v = zeros(n);
      v[i] = rad * Math.cos(a);
      v[j] = rad * Math.sin(a);
      if (k >= 0) v[k] = h;
      verts.push(v);
      edges.push([s + t, s + ((t + 1) % seg)]);
    }
  };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) ring(i, j, r);
  for (let k = 2; k < n; k++) for (const h of [-0.75, -0.4, 0.4, 0.75]) ring(0, 1, r * Math.sqrt(1 - h * h), k, h * r);
  return { verts, edges };
}

function toShape(kind: PrimitiveKind, label: string, color: string, D: number, poly: { verts: Vec[]; edges: [number, number][]; facets?: number[][] }, solid: boolean): Shape {
  return {
    id: newId(),
    kind,
    label,
    color,
    visible: true,
    verts: poly.verts.map((v) => pad(v.slice(), D)),
    edges: poly.edges.map((e) => [e[0], e[1]] as [number, number]),
    cells: solid ? [{ verts: [...poly.verts.keys()], facets: (poly.facets ?? []).map((f) => f.slice()) }] : null,
  };
}

export function makePrimitive(kind: PrimitiveKind, prm: PrimitiveParams, color: string, D: number): Shape {
  const n = Math.max(0, prm.dim);
  const p = Math.max(3, Math.min(128, Math.round(prm.p)));
  const q = Math.max(3, Math.min(128, Math.round(prm.q)));
  D = Math.max(D, n, 4);
  switch (kind) {
    case 'point':
      return toShape(kind, '', color, D, point(), true);
    case 'simplex':
      return toShape(kind, `${n}D`, color, D, simplex(n), true);
    case 'hypercube':
      return toShape(kind, `${n}D`, color, D, hypercube(n), true);
    case 'orthoplex':
      return toShape(kind, `${n}D`, color, D, orthoplex(n), true);
    case 'polygon':
      return toShape(kind, `{${p}}`, color, D, polygon(p), true);
    case 'prism': {
      const poly = n <= 2 ? polygon(p) : product(polygon(p), hypercube(n - 2));
      return toShape(kind, `{${p}} ${Math.max(2, n)}D`, color, D, poly, true);
    }
    case 'pyramid': {
      let base = polygon(p);
      if (n > 3) base = product(base, hypercube(n - 3));
      const poly = n <= 2 ? polygon(p) : pyramid(base);
      // apex points "up" (+y): swap axis 1 with the apex axis
      if (n >= 3) poly.verts = poly.verts.map((v) => { const w = v.slice(); [w[1], w[n - 1]] = [v[n - 1], v[1]]; return w; });
      return toShape(kind, `{${p}} ${Math.max(3, n)}D`, color, D, poly, true);
    }
    case 'duoprism': {
      let poly = product(polygon(p, 0.8), polygon(q, 0.8));
      if (n > 4) poly = product(poly, hypercube(n - 4));
      return toShape(kind, `{${p}}×{${q}}`, color, D, poly, true);
    }
    case 'cell24':
      return toShape(kind, '', color, D, cell24(), true);
    case 'sphere':
      return toShape(kind, `S${Math.max(0, n - 1)}`, color, D, sphereWire(n), false);
  }
}
