/**
 * Shapes from formulas.
 *
 *  Parametric (any line has a range "name = a..b"):
 *      x = cos(u)            coordinates: x y z w, or x1 … x20
 *      y = sin(u)
 *      u = 0..2pi, 64        parameter range (and optional sample count)
 *    1 parameter → curve, 2 → surface grid, 3+ → volume lattice. Wire-frame.
 *
 *  Inequalities (linear constraints, no ranges):
 *      x + y + z + w <= 1
 *      0 <= x <= 1           chains are allowed; "=" gives an equality
 *    → a convex polytope (a real solid: booleans and cross-sections work).
 *
 *  Both: constants "r = 2", comments "# …", ";" separates statements,
 *  t1 … t6 are the clocks of the time dimensions (0 when that time axis does not exist).
 */
import type { Vec } from './linalg';
import type { Compiled, Env } from './expr';
import { ExprError, compile } from './expr';
import type { Plane } from './polytope';
import { boxCell, cellsToShape, clip } from './polytope';
import type { Cell } from './shape';

export type FormulaErrorCode =
  | ExprError['code']
  | 'range' | 'nocoord' | 'nothing' | 'linear' | 'unbounded' | 'emptyset' | 'toomany' | 'syntax';

export class FormulaError extends Error {
  constructor(
    readonly line: number,
    readonly code: FormulaErrorCode,
    readonly detail = '',
  ) {
    super(`line ${line}: ${code} ${detail}`);
  }
}

export interface FormulaResult {
  mode: 'parametric' | 'polytope';
  dim: number;
  verts: Vec[];
  edges: [number, number][];
  cells: Cell[] | null;
  /** formula reads t1…t6 → geometry changes with time */
  usesTime: boolean;
  /** short description for the shape list */
  label: string;
}

const AXIS_ALIAS: Record<string, number> = { x: 0, y: 1, z: 2, w: 3 };
const TIME_VARS = ['t1', 't2', 't3', 't4', 't5', 't6'];
const MAX_POINTS = 30000;
const BIG = 1000;

/** Coordinate index for a name (x y z w, x1…x20), or -1. */
export function coordIndex(name: string): number {
  if (name in AXIS_ALIAS) return AXIS_ALIAS[name];
  const m = /^x([1-9]|1[0-9]|20)$/.exec(name);
  return m ? Number(m[1]) - 1 : -1;
}

interface Stmt { line: number; text: string }

function statements(src: string): Stmt[] {
  const out: Stmt[] = [];
  src.split(/\r?\n/).forEach((raw, i) => {
    const noComment = raw.replace(/(#|\/\/).*$/, '');
    for (const part of noComment.split(';')) {
      const text = part.trim();
      if (text) out.push({ line: i + 1, text });
    }
  });
  return out;
}

function wrap<T>(line: number, f: () => T): T {
  try {
    return f();
  } catch (e) {
    if (e instanceof ExprError) throw new FormulaError(line, e.code, e.detail);
    throw e;
  }
}

const CMP = /(<=|>=|≤|≥|<|>|=)/;

export function buildFormula(src: string, times: number[] = []): FormulaResult {
  const st = statements(src);
  if (st.length === 0) throw new FormulaError(0, 'nothing');
  const env: Env = {};
  TIME_VARS.forEach((n, i) => (env[n] = times[i] ?? 0));
  const isParametric = st.some((s) => s.text.includes('..'));
  return isParametric ? parametric(st, env) : polytope(st, env);
}

/** "name = expr" where name is not a coordinate: a constant, evaluated immediately. */
function tryConstant(s: Stmt, env: Env, used: Set<string>): boolean {
  const m = /^([A-Za-z_][A-Za-z_0-9]*)\s*=\s*([^=<>≤≥]+)$/.exec(s.text);
  if (!m || coordIndex(m[1]) >= 0 || m[2].includes('..')) return false;
  const f = wrap(s.line, () => compile(m[2], used));
  env[m[1]] = wrap(s.line, () => f(env));
  return true;
}

function parametric(st: Stmt[], env: Env): FormulaResult {
  const used = new Set<string>();
  const coords: { idx: number; f: Compiled; line: number }[] = [];
  const params: { name: string; a: number; b: number; n: number | null }[] = [];
  for (const s of st) {
    const range = /^([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.+?)\s*\.\.\s*([^,]+?)\s*(?:,\s*(\d+))?\s*$/.exec(s.text);
    if (range) {
      const [, name, ea, eb, en] = range;
      if (coordIndex(name) >= 0) throw new FormulaError(s.line, 'range', name);
      const a = wrap(s.line, () => compile(ea, used)(env));
      const b = wrap(s.line, () => compile(eb, used)(env));
      if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) throw new FormulaError(s.line, 'range', s.text);
      params.push({ name, a, b, n: en ? Math.max(1, Math.min(2000, Number(en))) : null });
      continue;
    }
    const m = /^([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.+)$/.exec(s.text);
    if (!m) throw new FormulaError(s.line, 'syntax', s.text);
    const ci = coordIndex(m[1]);
    if (ci >= 0) {
      coords.push({ idx: ci, f: wrap(s.line, () => compile(m[2], used)), line: s.line });
    } else if (!tryConstant(s, env, used)) throw new FormulaError(s.line, 'syntax', s.text);
  }
  if (coords.length === 0) throw new FormulaError(0, 'nocoord');
  const dim = Math.max(...coords.map((c) => c.idx)) + 1;
  const P = params.length;
  const defN = P === 1 ? 120 : P === 2 ? 36 : P === 3 ? 10 : 6;
  const counts = params.map((p) => (p.n ?? defN) + 1); // samples include both ends
  const total = counts.reduce((a, b) => a * b, 1);
  if (total > MAX_POINTS) throw new FormulaError(0, 'toomany', String(total));

  // sample the grid (row-major over parameters)
  const raw: (Vec | null)[] = [];
  const idx = new Array(P).fill(0);
  for (let k = 0; k < total; k++) {
    let r = k;
    for (let j = P - 1; j >= 0; j--) { idx[j] = r % counts[j]; r = Math.floor(r / counts[j]); }
    params.forEach((p, j) => (env[p.name] = counts[j] === 1 ? p.a : p.a + ((p.b - p.a) * idx[j]) / (counts[j] - 1)));
    const v = new Array(dim).fill(0);
    let ok = true;
    for (const c of coords) {
      const x = wrap(c.line, () => c.f(env));
      if (!Number.isFinite(x)) { ok = false; break; }
      v[c.idx] = x;
    }
    raw.push(ok ? v : null);
  }
  // de-duplicate (closes periodic curves/surfaces) and connect grid neighbours
  const key = (v: Vec) => v.map((x) => Math.round(x * 1e7)).join(',');
  const map = new Map<string, number>();
  const verts: Vec[] = [];
  const id = raw.map((v) => {
    if (!v) return -1;
    const kk = key(v);
    let i = map.get(kk);
    if (i === undefined) { i = verts.length; verts.push(v); map.set(kk, i); }
    return i;
  });
  const edgeSet = new Set<string>();
  const edges: [number, number][] = [];
  const stride = counts.map((_, j) => counts.slice(j + 1).reduce((a, b) => a * b, 1));
  for (let k = 0; k < total; k++) {
    let r = k;
    for (let j = P - 1; j >= 0; j--) { idx[j] = r % counts[j]; r = Math.floor(r / counts[j]); }
    for (let j = 0; j < P; j++) {
      if (idx[j] + 1 >= counts[j]) continue;
      const a = id[k];
      const b = id[k + stride[j]];
      if (a < 0 || b < 0 || a === b) continue;
      const ek = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (!edgeSet.has(ek)) { edgeSet.add(ek); edges.push([a, b]); }
    }
  }
  return {
    mode: 'parametric',
    dim,
    verts,
    edges,
    cells: null,
    usesTime: TIME_VARS.some((t) => used.has(t)),
    label: `f(${params.map((p) => p.name).join(',')}) ${dim}D`,
  };
}

function polytope(st: Stmt[], env: Env): FormulaResult {
  const used = new Set<string>();
  interface Lin { line: number; a: number[]; b: number; op: string }
  const pending: { line: number; parts: string[] }[] = [];
  let dim = 0;
  for (const s of st) {
    if (!CMP.test(s.text)) throw new FormulaError(s.line, 'syntax', s.text);
    if (tryConstant(s, env, used)) continue;
    const parts = s.text.split(CMP).map((x) => x.trim());
    if (parts.length < 3 || parts.some((x, i) => i % 2 === 0 && x === '')) throw new FormulaError(s.line, 'syntax', s.text);
    // which coordinates appear?
    for (let i = 0; i < parts.length; i += 2) {
      const names = new Set<string>();
      wrap(s.line, () => compile(parts[i], names));
      names.forEach((n) => { const ci = coordIndex(n); if (ci >= 0) dim = Math.max(dim, ci + 1); });
    }
    pending.push({ line: s.line, parts });
  }
  if (pending.length === 0) throw new FormulaError(0, 'nothing');
  if (dim === 0) throw new FormulaError(0, 'nocoord');
  const coordNames = Array.from({ length: dim }, (_, i) => (i < 4 ? 'xyzw'[i] : `x${i + 1}`));
  const evalAt = (f: Compiled, p: Vec): number => {
    const e: Env = { ...env };
    p.forEach((x, i) => { e[coordNames[i]] = x; e[`x${i + 1}`] = x; });
    return f(e);
  };
  const lins: Lin[] = [];
  for (const { line, parts } of pending) {
    for (let i = 0; i + 2 < parts.length; i += 2) {
      const lhs = wrap(line, () => compile(parts[i], used));
      const rhs = wrap(line, () => compile(parts[i + 2], used));
      const f = (p: Vec) => wrap(line, () => evalAt(lhs, p) - evalAt(rhs, p));
      const zero = new Array(dim).fill(0);
      const b = f(zero);
      const a = zero.map((_, k) => { const e = zero.slice(); e[k] = 1; return f(e) - b; });
      // linearity check at two pseudo-random points
      for (const seed of [0.37, -1.91]) {
        const p = zero.map((_, k) => Math.sin(seed * (k + 1) * 12.9898) * 3);
        const lin = b + a.reduce((s, ak, k) => s + ak * p[k], 0);
        const val = f(p);
        if (!Number.isFinite(val) || Math.abs(val - lin) > 1e-6 * (1 + Math.abs(val))) throw new FormulaError(line, 'linear', parts.slice(i, i + 3).join(' '));
      }
      lins.push({ line, a, b, op: parts[i + 1] });
    }
  }
  // build the polytope: clip a big box by every half-space
  let cell = boxCell(new Array(dim).fill(-BIG), new Array(dim).fill(BIG));
  const planesOf = (l: Lin): Plane[] => {
    // constraint: a·x + b  (op)  0
    const le: Plane = { n: l.a, d: -l.b };
    const ge: Plane = { n: l.a.map((x) => -x), d: l.b };
    if (l.op === '<=' || l.op === '<' || l.op === '≤') return [le];
    if (l.op === '>=' || l.op === '>' || l.op === '≥') return [ge];
    return [le, ge];
  };
  for (const l of lins) {
    if (l.a.every((x) => Math.abs(x) < 1e-12)) {
      // constant constraint like 0 <= 1
      const ok = planesOf(l).every((h) => h.d >= -1e-9);
      if (!ok) throw new FormulaError(l.line, 'emptyset');
      continue;
    }
    for (const h of planesOf(l)) {
      const r = clip(cell, h, true);
      if (!r) throw new FormulaError(l.line, 'emptyset');
      cell = r;
    }
  }
  if (cell.verts.some((v) => v.p.some((x) => Math.abs(x) > BIG * 0.999))) throw new FormulaError(0, 'unbounded');
  const sh = cellsToShape([cell], { kind: 'formula' });
  return {
    mode: 'polytope',
    dim,
    verts: sh.verts,
    edges: sh.edges,
    cells: sh.cells,
    usesTime: TIME_VARS.some((t) => used.has(t)),
    label: `${lins.length}≤ ${dim}D`,
  };
}

/** Ready-made examples for the formula window. */
export const FORMULA_PRESETS: { id: string; src: string }[] = [
  { id: 'torus', src: '# torus (3D)\nR = 1.2; r = 0.45\nx = (R + r*cos(v))*cos(u)\ny = r*sin(v)\nz = (R + r*cos(v))*sin(u)\nu = 0..2pi, 48\nv = 0..2pi, 18' },
  { id: 'clifford', src: '# Clifford torus (4D) – flat torus on the 3-sphere\nx = cos(u)/sqrt(2)*1.6\ny = sin(u)/sqrt(2)*1.6\nz = cos(v)/sqrt(2)*1.6\nw = sin(v)/sqrt(2)*1.6\nu = 0..2pi, 32\nv = 0..2pi, 32' },
  { id: 'helix', src: '# helix that also winds through w (4D)\nx = cos(u)\nz = sin(u)\ny = u/8 - 0.8\nw = 0.6*sin(3u)\nu = 0..4pi, 400' },
  { id: 'mobius', src: '# Möbius strip (3D)\nx = (1 + s/2*cos(u/2))*cos(u)\nz = (1 + s/2*cos(u/2))*sin(u)\ny = s/2*sin(u/2)\nu = 0..2pi, 64\ns = -1..1, 6' },
  { id: 'wave', src: '# travelling wave – animate with time dims ≥ 1\nx = u\nz = v\ny = 0.3*sin(3u - 2t1)*cos(2v + t2)\nu = -1.5..1.5, 30\nv = -1.5..1.5, 30' },
  { id: 'simplex', src: '# 4-simplex from inequalities (solid)\nx >= -0.5; y >= -0.5; z >= -0.5; w >= -0.5\nx + y + z + w <= 1.2' },
  { id: 'cube', src: '# 5-cube from chained inequalities (solid)\n-0.7 <= x <= 0.7\n-0.7 <= y <= 0.7\n-0.7 <= z <= 0.7\n-0.7 <= w <= 0.7\n-0.7 <= x5 <= 0.7' },
  { id: 'slab', src: '# moving cut – a cube sliced by a plane that sweeps with t1\n-0.8 <= x <= 0.8; -0.8 <= y <= 0.8; -0.8 <= z <= 0.8\nx + y + z <= 1.5*sin(t1)' },
];
