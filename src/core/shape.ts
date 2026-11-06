import type { Vec } from './linalg';
import type { Track } from './anim';
import { add, centroid, matVec, pad, planeRotation, sub, scale as vscale } from './linalg';

/**
 * A convex cell of a solid. It references vertices of the owning shape by index.
 * `facets` lists, for each facet ((k-1)-face, k = cell dimension), the vertex indices on it.
 * The plane equations are always recomputed from the current vertex positions, so
 * dragging vertices keeps the solid description usable for booleans and slicing.
 */
export interface Cell {
  verts: number[];
  facets: number[][];
}

export interface Shape {
  id: string;
  /** primitive key or 'boolean' / 'merge' – used for the display name */
  kind: string;
  /** human readable parameters, e.g. "{6}" */
  label: string;
  color: string;
  visible: boolean;
  verts: Vec[];
  edges: [number, number][];
  /** convex decomposition; null = wireframe-only (e.g. hypersphere). */
  cells: Cell[] | null;
  /** animation tracks bound to time dimensions */
  anim?: Track[];
}

let idCounter = 0;
export function newId(): string {
  idCounter++;
  return `s${Date.now().toString(36)}${idCounter.toString(36)}`;
}

export const PALETTE = ['#4cc9f0', '#f72585', '#b8f35a', '#ffb703', '#9d4edd', '#06d6a0', '#ff7b54', '#e9ecef'];
let colorIdx = 0;
let activePalette = PALETTE;
/** Themes provide their own palette for newly created shapes. */
export const setPalette = (p: string[]): void => { activePalette = p.length ? p : PALETTE; };
export const nextColor = (): string => activePalette[colorIdx++ % activePalette.length];

export function cloneShape(s: Shape): Shape {
  return {
    ...s,
    id: newId(),
    verts: s.verts.map((v) => v.slice()),
    edges: s.edges.map((e) => [e[0], e[1]] as [number, number]),
    cells: s.cells ? s.cells.map((c) => ({ verts: c.verts.slice(), facets: c.facets.map((f) => f.slice()) })) : null,
    anim: s.anim ? JSON.parse(JSON.stringify(s.anim)) : undefined,
  };
}

/** Make sure every vertex has at least n coordinates (never truncates – no information is lost). */
export function padShape(s: Shape, n: number): void {
  for (let i = 0; i < s.verts.length; i++) if (s.verts[i].length < n) s.verts[i] = pad(s.verts[i], n);
}

/** Highest coordinate index actually used (+1). */
export function usedDim(s: Shape, tol = 1e-12): number {
  let d = 0;
  for (const v of s.verts) for (let i = v.length - 1; i >= d; i--) if (Math.abs(v[i]) > tol) { d = i + 1; break; }
  return d;
}

export function shapeCenter(s: Shape, n: number): Vec {
  return centroid(s.verts, n);
}

export function translateShape(s: Shape, delta: Vec): void {
  const n = Math.max(delta.length, s.verts[0]?.length ?? 0);
  s.verts = s.verts.map((v) => add(pad(v, n), pad(delta, n)));
}

export function rotateShape(s: Shape, i: number, j: number, angle: number, n: number): void {
  padShape(s, n);
  const c = shapeCenter(s, n);
  const r = planeRotation(n, i, j, angle);
  s.verts = s.verts.map((v) => add(matVec(r, sub(v, c)), c));
}

export function scaleShape(s: Shape, f: number, n: number, axis = -1): void {
  padShape(s, n);
  const c = shapeCenter(s, n);
  s.verts = s.verts.map((v) => {
    if (axis < 0) return add(vscale(sub(v, c), f), c);
    const w = v.slice();
    w[axis] = c[axis] + (v[axis] - c[axis]) * f;
    return w;
  });
}

/** Combine several shapes into one (no boolean – just keeps everything). */
export function mergeShapes(shapes: Shape[], color: string): Shape {
  const out: Shape = { id: newId(), kind: 'merge', label: '', color, visible: true, verts: [], edges: [], cells: [] };
  let solid = true;
  for (const s of shapes) {
    const off = out.verts.length;
    out.verts.push(...s.verts.map((v) => v.slice()));
    out.edges.push(...s.edges.map((e) => [e[0] + off, e[1] + off] as [number, number]));
    if (s.cells) out.cells!.push(...s.cells.map((c) => ({ verts: c.verts.map((x) => x + off), facets: c.facets.map((f) => f.map((x) => x + off)) })));
    else solid = false;
  }
  if (!solid) out.cells = null;
  return out;
}
