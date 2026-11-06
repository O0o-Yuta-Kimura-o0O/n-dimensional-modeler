/**
 * N-dimensional convex-cell engine.
 *
 * Every solid is a union of convex cells. A cell is handled here as a "working cell":
 * vertex positions + for each vertex the set of supporting planes it lies on.
 * Edges are recovered combinatorially (u,v is an edge iff no other vertex lies on every
 * plane that contains both u and v), which works in any dimension and for flat cells
 * (e.g. a polygon living inside 7-D space).
 *
 * Booleans:
 *   A ∩ B  = clip A by every plane of B (and B's affine-hull equalities)
 *   A \ B  = ⋃_i  A ∩ {h_1≤0 … h_{i-1}≤0} ∩ {h_i ≥ 0}      (convex decomposition)
 *   A ∪ B  = A ∪ (B \ A)
 */
import type { Vec } from './linalg';
import { affineBasis, complement, dot, lerp, norm, orthonormalize, pad, rank, scale, sub } from './linalg';
import type { Cell, Shape } from './shape';
import { newId } from './shape';

export interface Plane {
  n: Vec; // n·x <= d
  d: number;
}

export interface WVert {
  p: Vec;
  F: Set<number>;
}

export interface WCell {
  D: number;
  verts: WVert[];
  planes: Plane[];
  eqs: Plane[]; // n·x = d (affine hull)
  k: number; // intrinsic dimension
  _edges?: [number, number][];
}

function tolFor(pts: Vec[]): number {
  let m = 1;
  for (const p of pts) for (const x of p) m = Math.max(m, Math.abs(x));
  return 1e-7 * m;
}

/** Build a working cell from a shape cell (positions in world coordinates, dimension D). */
export function workCell(shape: Shape, cell: Cell, D: number): WCell | null {
  const pts = cell.verts.map((i) => pad(shape.verts[i], D).slice(0, D));
  if (pts.length === 0) return null;
  const { origin, basis } = affineBasis(pts, D);
  const k = basis.length;
  const comp = complement(basis, D);
  const eqs = comp.map((e) => ({ n: e, d: dot(e, origin) }));
  const local = new Map<number, number>();
  cell.verts.forEach((g, i) => local.set(g, i));
  const verts: WVert[] = pts.map((p) => ({ p, F: new Set<number>() }));
  const planes: Plane[] = [];
  for (const f of cell.facets) {
    const fi = f.map((g) => local.get(g)).filter((x): x is number => x !== undefined);
    if (fi.length === 0) continue;
    const q0 = pts[fi[0]];
    const fb = orthonormalize(fi.slice(1).map((i) => sub(pts[i], q0)), 1e-7);
    // vector from facet towards the centroid, restricted to the hull and orthogonal to the facet
    let v = sub(origin, q0);
    for (const e of comp) v = sub(v, scale(e, dot(v, e)));
    for (const b of fb) v = sub(v, scale(b, dot(v, b)));
    const nv = norm(v);
    if (nv < 1e-10) continue;
    const n = scale(v, -1 / nv);
    // conservative offset so every vertex is inside even if the facet got bent by editing
    let d = -Infinity;
    for (const i of fi) d = Math.max(d, dot(n, pts[i]));
    const pi = planes.length;
    planes.push({ n, d });
    for (const i of fi) verts[i].F.add(pi);
  }
  return { D, verts, planes, eqs, k };
}

export function shapeCells(shape: Shape, D: number): WCell[] {
  if (!shape.cells) return [];
  const out: WCell[] = [];
  for (const c of shape.cells) {
    const w = workCell(shape, c, D);
    if (w) out.push(w);
  }
  return out;
}

/**
 * Combinatorial edge detection: u–v is an edge iff no other vertex lies on every plane that
 * contains both. Uses an inverted index (plane → vertices) so only vertex pairs that share
 * at least k−1 planes are examined; this keeps polytopes with many facets (E8: 19440) fast.
 *
 * With `subset`, only pairs inside the subset are tested and only subset vertices are
 * considered as blockers – valid when every subset vertex lies on a common plane.
 */
function edgesAmong(c: WCell, subset: number[] | null): [number, number][] {
  const idx = subset ?? c.verts.map((_, i) => i);
  const V = idx.length;
  const edges: [number, number][] = [];
  if (V < 2) return edges;
  if (V === 2 && !subset) return [[0, 1]];
  const need = Math.max(0, c.k - 1);
  const planeVerts = new Map<number, number[]>();
  for (const i of idx) c.verts[i].F.forEach((p) => {
    let l = planeVerts.get(p);
    if (!l) planeVerts.set(p, (l = []));
    l.push(i);
  });
  const isEdge = (u: number, v: number, common: number[]): boolean => {
    if (common.length === 0) return V === 2;
    let best = planeVerts.get(common[0])!;
    for (const p of common) { const l = planeVerts.get(p)!; if (l.length < best.length) best = l; }
    for (const w of best) {
      if (w === u || w === v) continue;
      const F = c.verts[w].F;
      let all = true;
      for (const p of common) if (!F.has(p)) { all = false; break; }
      if (all) return false;
    }
    return true;
  };
  const counts = new Map<number, number>();
  for (let a = 0; a < V; a++) {
    const u = idx[a];
    const Fu = c.verts[u].F;
    if (need === 0) {
      for (let b = a + 1; b < V; b++) {
        const v = idx[b];
        const common = [...Fu].filter((p) => c.verts[v].F.has(p));
        if (isEdge(u, v, common)) edges.push([u, v]);
      }
      continue;
    }
    counts.clear();
    Fu.forEach((p) => {
      for (const v of planeVerts.get(p)!) if (v > u) counts.set(v, (counts.get(v) ?? 0) + 1);
    });
    counts.forEach((cnt, v) => {
      if (cnt < need) return;
      const Fv = c.verts[v].F;
      const common: number[] = [];
      Fu.forEach((p) => { if (Fv.has(p)) common.push(p); });
      if (isEdge(u, v, common)) edges.push([u, v]);
    });
  }
  return edges;
}

export function cellEdges(c: WCell): [number, number][] {
  if (!c._edges) c._edges = edgesAmong(c, null);
  return c._edges;
}

function recomputeHull(c: WCell): void {
  const pts = c.verts.map((v) => v.p);
  const { origin, basis } = affineBasis(pts, c.D);
  c.k = pts.length ? basis.length : -1;
  c.eqs = complement(basis, c.D).map((e) => ({ n: e, d: dot(e, origin) }));
}

/** Drop planes that touch fewer than k vertices – they cannot be facets any more. */
function prunePlanes(c: WCell): void {
  if (c.k < 1) return;
  const cnt = new Map<number, number>();
  for (const v of c.verts) v.F.forEach((p) => cnt.set(p, (cnt.get(p) ?? 0) + 1));
  const dead = new Set<number>();
  cnt.forEach((n, p) => { if (n < c.k) dead.add(p); });
  if (dead.size === 0) return;
  for (const v of c.verts) dead.forEach((p) => v.F.delete(p));
}

/** Clip a cell by the half-space n·x <= d. Returns null when empty. Edges are updated incrementally. */
export function clip(c: WCell, h: Plane, ownPlanes = false): WCell | null {
  const tol = tolFor(c.verts.map((v) => v.p));
  const s = c.verts.map((v) => dot(h.n, v.p) - h.d);
  let anyIn = false;
  let anyOut = false;
  for (const x of s) {
    if (x < -tol) anyIn = true;
    if (x > tol) anyOut = true;
  }
  if (!anyOut) return c; // fully inside (or touching)
  const hasOn = s.some((x) => Math.abs(x) <= tol);
  if (!anyIn && !hasOn) return null;
  const oldEdges = cellEdges(c);
  const pi = c.planes.length;
  // ownPlanes: the caller owns `c` exclusively, so the plane list can grow in place
  const planes = ownPlanes ? c.planes : c.planes.concat([h]);
  if (ownPlanes) planes.push(h);
  const verts: WVert[] = [];
  const keep = new Array<number>(c.verts.length).fill(-1);
  const face: number[] = [];
  c.verts.forEach((v, i) => {
    if (s[i] <= tol) {
      const F = new Set(v.F);
      keep[i] = verts.length;
      if (Math.abs(s[i]) <= tol) { F.add(pi); face.push(verts.length); }
      verts.push({ p: v.p, F });
    }
  });
  const edges: [number, number][] = [];
  for (const [a, b] of oldEdges) {
    const sa = s[a];
    const sb = s[b];
    if (keep[a] >= 0 && keep[b] >= 0) {
      edges.push([keep[a], keep[b]]);
    } else if (anyIn && ((sa < -tol && sb > tol) || (sa > tol && sb < -tol))) {
      const t = sa / (sa - sb);
      const F = new Set<number>();
      c.verts[a].F.forEach((p) => { if (c.verts[b].F.has(p)) F.add(p); });
      F.add(pi);
      const ni = verts.length;
      verts.push({ p: lerp(c.verts[a].p, c.verts[b].p, t), F });
      face.push(ni);
      edges.push([sa < 0 ? keep[a] : keep[b], ni]);
    }
  }
  if (verts.length === 0) return null;
  const out: WCell = { D: c.D, verts, planes, eqs: [], k: 0 };
  recomputeHull(out);
  if (anyIn && face.length >= 2) {
    // new edges can only appear inside the cut face (all its vertices lie on plane pi)
    const seen = new Set(edges.map(([a, b]) => (a < b ? `${a}_${b}` : `${b}_${a}`)));
    for (const [a, b] of edgesAmong(out, face)) {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (!seen.has(key)) { seen.add(key); edges.push([a, b]); }
    }
  }
  out._edges = edges;
  prunePlanes(out);
  return out;
}

const flip = (h: Plane): Plane => ({ n: scale(h.n, -1), d: -h.d });

function constraintsOf(b: WCell): Plane[] {
  const out = b.planes.slice();
  for (const e of b.eqs) {
    out.push(e);
    out.push(flip(e));
  }
  return out;
}

export function intersectCell(a: WCell, b: WCell): WCell | null {
  let r: WCell | null = a;
  for (const h of constraintsOf(b)) {
    r = clip(r, h);
    if (!r) return null;
  }
  return r;
}

export function subtractCell(a: WCell, b: WCell): WCell[] {
  const inter = intersectCell(a, b);
  if (!inter || inter.k < a.k) return [a];
  const pieces: WCell[] = [];
  let rest: WCell | null = a;
  for (const h of constraintsOf(b)) {
    if (!rest) break;
    const piece = clip(rest, flip(h));
    // a piece lying entirely on h's plane is not part of {h > 0}
    if (piece && piece.k === a.k && !liesOn(piece, h)) pieces.push(piece);
    rest = clip(rest, h);
    if (!rest || rest.k < a.k) break;
  }
  return pieces;
}

function liesOn(c: WCell, h: Plane): boolean {
  const tol = tolFor(c.verts.map((v) => v.p));
  return c.verts.every((v) => Math.abs(dot(h.n, v.p) - h.d) <= tol);
}

export function intersectCells(A: WCell[], B: WCell[]): WCell[] {
  const out: WCell[] = [];
  const k = Math.min(maxK(A), maxK(B));
  for (const a of A) for (const b of B) {
    const r = intersectCell(a, b);
    if (r && r.k >= 0 && r.k >= Math.min(a.k, b.k, k)) out.push(r);
  }
  // when the full-dimensional intersection is empty keep lower-dimensional contact pieces
  return out;
}

export function subtractCells(A: WCell[], B: WCell[]): WCell[] {
  let cur = A;
  for (const b of B) cur = cur.flatMap((a) => subtractCell(a, b));
  return cur;
}

export function unionCells(A: WCell[], B: WCell[]): WCell[] {
  return A.concat(subtractCells(B, A));
}

const maxK = (cs: WCell[]): number => cs.reduce((m, c) => Math.max(m, c.k), -1);

function insideCell(c: WCell, p: Vec, tol: number): boolean {
  for (const e of c.eqs) if (Math.abs(dot(e.n, p) - e.d) > tol) return false;
  for (const h of c.planes) if (dot(h.n, p) - h.d > tol) return false;
  return true;
}

export type BoolOp = 'union' | 'intersect' | 'subtract';

/**
 * Convert working cells back into a Shape. Vertices are de-duplicated, facets are
 * re-derived and the displayed wire-frame is filtered so that edges which only exist
 * because of the internal convex decomposition are hidden.
 */
export function cellsToShape(cells: WCell[], base: Partial<Shape>): Shape {
  const D = cells[0]?.D ?? 0;
  const allPts = cells.flatMap((c) => c.verts.map((v) => v.p));
  const tol = tolFor(allPts) * 10;
  const q = 1 / Math.max(tol * 10, 1e-9);
  const keyOf = (p: Vec) => p.map((x) => Math.round(x * q)).join(',');
  const map = new Map<string, number>();
  const verts: Vec[] = [];
  const idx = (p: Vec): number => {
    const key = keyOf(p);
    let i = map.get(key);
    if (i === undefined) {
      i = verts.length;
      verts.push(p.slice());
      map.set(key, i);
    }
    return i;
  };
  const outCells: Cell[] = [];
  const K = maxK(cells);
  /** Valid facet planes of each cell (index into c.planes). */
  const facetPlanes: number[][] = [];
  cells.forEach((c) => {
    const g = c.verts.map((v) => idx(v.p));
    const cf: number[][] = [];
    const fp: number[] = [];
    c.planes.forEach((_h, pi) => {
      const on: number[] = [];
      c.verts.forEach((v, vi) => { if (v.F.has(pi)) on.push(vi); });
      if (on.length < Math.max(1, c.k)) return;
      const fpts = on.map((vi) => c.verts[vi].p);
      if (c.k >= 1 && rank(fpts.slice(1).map((p) => sub(p, fpts[0]))) !== c.k - 1) return;
      cf.push(Array.from(new Set(on.map((vi) => g[vi]))));
      fp.push(pi);
    });
    facetPlanes.push(fp);
    outCells.push({ verts: Array.from(new Set(g)), facets: cf });
  });

  const edgeSet = new Map<string, [number, number]>();
  const addEdge = (u: number, v: number) => {
    if (u === v) return;
    const key = u < v ? `${u}_${v}` : `${v}_${u}`;
    if (!edgeSet.has(key)) edgeSet.set(key, u < v ? [u, v] : [v, u]);
  };

  if (cells.length <= 1 || K < 2) {
    cells.forEach((c) => {
      const g = c.verts.map((v) => idx(v.p));
      for (const [a, b] of cellEdges(c)) addEdge(g[a], g[b]);
    });
  } else {
    // 1) boundary pieces: every facet minus the parts covered from outside by other cells
    let size = 0;
    for (const p of verts) size = Math.max(size, norm(p));
    const delta = 1e-5 * Math.max(1, size);
    const itol = 1e-7 * Math.max(1, size);
    interface Piece { cell: WCell; n: Vec; d: number }
    const pieces: Piece[] = [];
    cells.forEach((c, ci) => {
      const { basis } = affineBasis(c.verts.map((v) => v.p), D);
      for (const pi of facetPlanes[ci]) {
        const h = c.planes[pi];
        let n = new Array(D).fill(0) as Vec;
        for (const b of basis) { const t = dot(h.n, b); for (let i = 0; i < D; i++) n[i] += b[i] * t; }
        const nn = norm(n);
        if (nn < 1e-12) continue;
        n = scale(n, 1 / nn);
        const fverts = c.verts.filter((v) => v.F.has(pi)).map((v) => ({ p: v.p, F: v.F }));
        const face: WCell = { D, verts: fverts, planes: c.planes, eqs: [], k: 0 };
        recomputeHull(face);
        let parts: WCell[] = [face];
        cells.forEach((o, oi) => {
          if (oi === ci || parts.length === 0) return;
          const next: WCell[] = [];
          for (const part of parts) {
            const inter = intersectCell(part, o);
            if (!inter || inter.k < part.k) { next.push(part); continue; }
            const ctr = centroidOf(inter.verts.map((v) => v.p), D);
            const probe = ctr.map((x, i) => x + n[i] * delta);
            if (!insideCell(o, probe, itol)) { next.push(part); continue; } // o is on the same side
            next.push(...subtractCell(part, o));
          }
          parts = next;
        });
        for (const part of parts) pieces.push({ cell: part, n, d: dot(n, part.verts[0].p) });
      }
    });
    // 2) candidate edges = edges of boundary pieces, split at T-junctions
    const cand: [number, number][] = [];
    const pieceVerts = new Set<number>();
    for (const pc of pieces) {
      const g = pc.cell.verts.map((v) => idx(v.p));
      g.forEach((x) => pieceVerts.add(x));
      if (pc.cell.k <= 0) continue;
      for (const [a, b] of cellEdges(pc.cell)) if (g[a] !== g[b]) cand.push([g[a], g[b]]);
    }
    const pv = Array.from(pieceVerts);
    const seen = new Set<string>();
    const subEdges: [number, number][] = [];
    for (const [a, b] of cand) {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const pa = verts[a];
      const dir = sub(verts[b], pa);
      const L2 = dot(dir, dir);
      const splits: [number, number][] = [[0, a], [1, b]];
      for (const o of pv) {
        if (o === a || o === b) continue;
        const w = sub(verts[o], pa);
        const t = dot(w, dir) / L2;
        if (t <= 1e-9 || t >= 1 - 1e-9) continue;
        const off = sub(w, scale(dir, t));
        if (norm(off) < itol * 100) splits.push([t, o]);
      }
      splits.sort((x, y) => x[0] - y[0]);
      for (let i = 0; i + 1 < splits.length; i++) subEdges.push([splits[i][1], splits[i + 1][1]]);
    }
    // 3) keep sub-edges where the boundary is not locally flat
    for (const [a, b] of subEdges) {
      const pa = verts[a];
      const pb = verts[b];
      const mid = lerp(pa, pb, 0.5);
      const normals: Vec[] = [];
      for (const pc of pieces) {
        if (Math.abs(dot(pc.n, pa) - pc.d) > itol * 100 || Math.abs(dot(pc.n, pb) - pc.d) > itol * 100) continue;
        if (!insideCell(pc.cell, mid, itol * 100)) continue;
        normals.push(pc.n);
      }
      if (normals.length > 0 && rank(normals, 1e-4) >= K - 1) addEdge(a, b);
    }
  }
  const edges = Array.from(edgeSet.values());

  return {
    id: newId(),
    kind: base.kind ?? 'boolean',
    label: base.label ?? '',
    color: base.color ?? '#ffffff',
    visible: true,
    verts,
    edges,
    cells: outCells,
  };
}

function centroidOf(pts: Vec[], D: number): Vec {
  const c = new Array(D).fill(0);
  for (const p of pts) for (let i = 0; i < D; i++) c[i] += p[i];
  return c.map((x) => x / Math.max(1, pts.length));
}

export function booleanShapes(op: BoolOp, a: Shape, b: Shape, D: number, color: string): Shape | null {
  const A = shapeCells(a, D);
  const B = shapeCells(b, D);
  let r: WCell[];
  if (op === 'intersect') r = intersectCells(A, B);
  else if (op === 'subtract') r = subtractCells(A, B);
  else r = unionCells(A, B);
  r = r.filter((c) => c.verts.length > 0);
  if (r.length === 0) return null;
  return cellsToShape(r, { kind: op, color });
}

/**
 * Cross-section of a solid with the flat { x_j = offset_j for j >= d }.
 * Returns only vertices + edges for display (in D coordinates).
 */
export function sliceShape(shape: Shape, d: number, D: number, offsets: number[]): { verts: Vec[]; edges: [number, number][] } {
  const cells = shapeCells(shape, D);
  const out: WCell[] = [];
  // Two strategies with very different cost profiles (measured on E8, 19440 facets):
  //  - box clipping in R^d: fast for d <= 3, explodes for larger d
  //  - clipping the full cell by the hidden-axis hyperplanes: steady, better for d >= 4
  const useBox = d <= 3;
  for (const c of cells) {
    const r = useBox ? sliceCell(c, d, offsets) : sliceCellChain(c, d, offsets);
    if (r) out.push(r);
  }
  if (out.length === 0) return { verts: [], edges: [] };
  const s = cellsToShape(out, {});
  if (!useBox) return { verts: s.verts, edges: s.edges };
  const hidden = new Array(Math.max(0, D - d)).fill(0).map((_, i) => offsets[d + i] ?? 0);
  return { verts: s.verts.map((v) => v.concat(hidden)), edges: s.edges };
}

/** Cross-section by clipping the cell itself with x_j = offset_j for every hidden axis j. */
function sliceCellChain(c: WCell, d: number, offsets: number[]): WCell | null {
  let r: WCell | null = c;
  for (let j = c.D - 1; j >= d && r; j--) {
    const n = new Array(c.D).fill(0);
    n[j] = 1;
    const o = offsets[j] ?? 0;
    r = clip(r, { n, d: o });
    if (r) r = clip(r, { n: scale(n, -1), d: -o });
  }
  return r;
}

/** Axis-aligned box as a working cell in R^d (vertices carry their box facets). */
export function boxCell(lo: Vec, hi: Vec): WCell {
  const d = lo.length;
  const planes: Plane[] = [];
  for (let i = 0; i < d; i++) {
    const n = new Array(d).fill(0);
    n[i] = -1;
    planes.push({ n, d: -lo[i] });
    const m = new Array(d).fill(0);
    m[i] = 1;
    planes.push({ n: m, d: hi[i] });
  }
  const verts: WVert[] = [];
  const edges: [number, number][] = [];
  for (let mask = 0; mask < 1 << d; mask++) {
    const p: Vec = [];
    const F = new Set<number>();
    for (let i = 0; i < d; i++) {
      const up = (mask >> i) & 1;
      p.push(up ? hi[i] : lo[i]);
      F.add(2 * i + up);
      const o = mask ^ (1 << i);
      if (o > mask) edges.push([mask, o]);
    }
    verts.push({ p, F });
  }
  return { D: d, verts, planes, eqs: [], k: d, _edges: edges };
}

/**
 * Cross-section of a cell with { x_j = offsets_j, j >= d }, computed directly in R^d:
 * a bounding box is clipped by every facet plane restricted to the visible coordinates.
 * This stays cheap even for polytopes with tens of thousands of facets in high dimension.
 */
export function sliceCell(c: WCell, d: number, offsets: number[]): WCell | null {
  const D = c.D;
  const tol = tolFor(c.verts.map((v) => v.p));
  const restrict = (h: Plane): Plane | 'skip' | 'empty' => {
    const n = h.n.slice(0, d);
    let rhs = h.d;
    for (let j = d; j < D; j++) rhs -= h.n[j] * (offsets[j] ?? 0);
    if (norm(n) < 1e-12) return rhs < -tol ? 'empty' : 'skip';
    return { n, d: rhs };
  };
  if (d === 0) {
    const p = new Array(D).fill(0).map((_, j) => offsets[j] ?? 0);
    return insideCell(c, p, tol) ? { D: 0, verts: [{ p: [], F: new Set() }], planes: [], eqs: [], k: 0, _edges: [] } : null;
  }
  const lo = new Array(d).fill(Infinity);
  const hi = new Array(d).fill(-Infinity);
  for (const v of c.verts) for (let i = 0; i < d; i++) { lo[i] = Math.min(lo[i], v.p[i]); hi[i] = Math.max(hi[i], v.p[i]); }
  const margin = 0.05 * Math.max(1, ...hi.map((x, i) => x - lo[i]));
  let r: WCell | null = boxCell(lo.map((x) => x - margin), hi.map((x) => x + margin));
  // equalities first: they collapse flat cells early
  const cons: Plane[] = c.eqs.flatMap((e) => [e, flip(e)]).concat(c.planes);
  for (const h of cons) {
    const rh = restrict(h);
    if (rh === 'skip') continue;
    if (rh === 'empty') return null;
    r = clip(r, rh, true);
    if (!r) return null;
  }
  return r;
}
