// Small dense linear-algebra helpers for arbitrary dimension.
export type Vec = number[];
export type Mat = number[][]; // row-major, Mat[row][col]

export const EPS = 1e-7;

export const zeros = (n: number): Vec => new Array(n).fill(0);

export function pad(v: Vec, n: number): Vec {
  if (v.length >= n) return v;
  return v.concat(zeros(n - v.length));
}

export const add = (a: Vec, b: Vec): Vec => a.map((x, i) => x + (b[i] ?? 0));
export const sub = (a: Vec, b: Vec): Vec => a.map((x, i) => x - (b[i] ?? 0));
export const scale = (a: Vec, s: number): Vec => a.map((x) => x * s);
export function dot(a: Vec, b: Vec): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}
export const norm = (a: Vec): number => Math.sqrt(dot(a, a));
export const lerp = (a: Vec, b: Vec, t: number): Vec => a.map((x, i) => x + (b[i] - x) * t);

export function centroid(pts: Vec[], n: number): Vec {
  const c = zeros(n);
  if (pts.length === 0) return c;
  for (const p of pts) for (let i = 0; i < n; i++) c[i] += p[i] ?? 0;
  return c.map((x) => x / pts.length);
}

export function identity(n: number): Mat {
  const m: Mat = [];
  for (let i = 0; i < n; i++) {
    const r = zeros(n);
    r[i] = 1;
    m.push(r);
  }
  return m;
}

export function matVec(m: Mat, v: Vec): Vec {
  return m.map((row) => dot(row, v));
}

export function matMul(a: Mat, b: Mat): Mat {
  const n = a.length;
  const k = b.length;
  const m = b[0]?.length ?? 0;
  const out: Mat = [];
  for (let i = 0; i < n; i++) {
    const r = zeros(m);
    for (let t = 0; t < k; t++) {
      const av = a[i][t];
      if (av === 0) continue;
      const br = b[t];
      for (let j = 0; j < m; j++) r[j] += av * br[j];
    }
    out.push(r);
  }
  return out;
}

export const transpose = (m: Mat): Mat => (m[0] ?? []).map((_, j) => m.map((r) => r[j]));

/** Givens rotation in plane (i, j) by angle a, size n. */
export function planeRotation(n: number, i: number, j: number, a: number): Mat {
  const m = identity(n);
  const c = Math.cos(a);
  const s = Math.sin(a);
  m[i][i] = c;
  m[j][j] = c;
  m[i][j] = -s;
  m[j][i] = s;
  return m;
}

/**
 * Gram–Schmidt. Returns an orthonormal basis of span(vectors), dropping
 * vectors that are (numerically) dependent. `tol` is relative to the largest input norm.
 */
export function orthonormalize(vectors: Vec[], tol = 1e-9, start: Vec[] = []): Vec[] {
  const basis: Vec[] = start.map((v) => v.slice());
  let maxN = 0;
  for (const v of vectors) maxN = Math.max(maxN, norm(v));
  const thr = Math.max(tol * Math.max(maxN, 1e-300), 1e-12);
  for (const v0 of vectors) {
    let v = v0.slice();
    // two passes for stability
    for (let pass = 0; pass < 2; pass++) {
      for (const b of basis) {
        const d = dot(v, b);
        for (let i = 0; i < v.length; i++) v[i] -= d * b[i];
      }
    }
    const nv = norm(v);
    if (nv > thr) basis.push(v.map((x) => x / nv));
  }
  return basis.slice(start.length);
}

/** Numerical rank of a set of vectors. */
export const rank = (vectors: Vec[], tol = 1e-7): number => orthonormalize(vectors, tol).length;

/** Orthonormal basis of the affine hull directions of points. */
export function affineBasis(pts: Vec[], n: number, tol = 1e-7): { origin: Vec; basis: Vec[] } {
  const origin = centroid(pts, n);
  const dirs = pts.map((p) => sub(pad(p, n), origin));
  return { origin, basis: orthonormalize(dirs, tol) };
}

/** Orthonormal complement of `basis` inside R^n. */
export function complement(basis: Vec[], n: number): Vec[] {
  const std: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const e = zeros(n);
    e[i] = 1;
    std.push(e);
  }
  return orthonormalize(std, 1e-9, basis);
}

/** Re-orthonormalise the rows of a square matrix (keeps it a rotation). */
export function reorthonormalize(m: Mat): Mat {
  const n = m.length;
  const rows = orthonormalize(m, 1e-12);
  if (rows.length === n) return rows;
  // fill missing rows with complement
  return rows.concat(complement(rows, n)).slice(0, n);
}

/** Solve the 2x2 system [a b; c d] x = r. */
export function solve2(a: number, b: number, c: number, d: number, r0: number, r1: number): [number, number] | null {
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-14) return null;
  return [(r0 * d - b * r1) / det, (a * r1 - c * r0) / det];
}
