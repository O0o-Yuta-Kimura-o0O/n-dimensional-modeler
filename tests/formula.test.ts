import { describe, expect, it } from 'vitest';
import { compile } from '../src/core/expr';
import { FORMULA_PRESETS, FormulaError, buildFormula } from '../src/core/formula';
import { shapeCells, sliceShape } from '../src/core/polytope';
import type { Shape } from '../src/core/shape';

const asShape = (r: ReturnType<typeof buildFormula>): Shape => ({ id: 'f', kind: 'formula', label: '', color: '#fff', visible: true, verts: r.verts, edges: r.edges, cells: r.cells });

describe('expression parser', () => {
  it('evaluates precedence, powers, functions, constants and implicit multiplication', () => {
    expect(compile('1 + 2*3^2')({})).toBe(19);
    expect(compile('-2^2')({})).toBe(-4);
    expect(compile('2^3^2')({})).toBe(512);
    expect(compile('2pi')({})).toBeCloseTo(2 * Math.PI, 12);
    expect(compile('3(x+1)')({ x: 1 })).toBe(6);
    expect(compile('atan2(1, 1) * 4')({})).toBeCloseTo(Math.PI, 12);
    expect(compile('max(1, 5, 3) + min(2, -1)')({})).toBe(4);
    expect(compile('sqrt(abs(-16))')({})).toBe(4);
  });

  it('reports useful errors', () => {
    expect(() => compile('1 + ')({})).toThrow(/unexpected/);
    expect(() => compile('(1 + 2')({})).toThrow(/paren/);
    expect(() => compile('2 $ 3')({})).toThrow(/char/);
    expect(() => compile('foo + 1')({})).toThrow(/name/);
    expect(() => compile('atan2(1)')({})).toThrow(/args/);
  });
});

describe('formula shapes', () => {
  it('every preset builds', () => {
    for (const p of FORMULA_PRESETS) {
      const r = buildFormula(p.src, [0.5, 0.2]);
      expect(r.verts.length, p.id).toBeGreaterThan(0);
      expect(r.edges.length, p.id).toBeGreaterThan(0);
    }
  });

  it('a closed parametric circle de-duplicates its seam', () => {
    const r = buildFormula('x = cos(u); y = sin(u); u = 0..2pi, 40');
    expect(r.dim).toBe(2);
    expect(r.verts).toHaveLength(40);
    expect(r.edges).toHaveLength(40);
  });

  it('a torus surface grid closes in both directions', () => {
    const r = buildFormula(FORMULA_PRESETS.find((p) => p.id === 'torus')!.src);
    expect(r.verts).toHaveLength(48 * 18);
    expect(r.edges).toHaveLength(2 * 48 * 18);
  });

  it('inequalities give a solid polytope (4-simplex): 5 vertices, 10 edges', () => {
    const r = buildFormula(FORMULA_PRESETS.find((p) => p.id === 'simplex')!.src);
    expect(r.mode).toBe('polytope');
    expect(r.dim).toBe(4);
    expect(r.verts).toHaveLength(5);
    expect(r.edges).toHaveLength(10);
    expect(shapeCells(asShape(r), 4)[0].k).toBe(4);
  });

  it('chained inequalities: 5-cube, and its slice is a 3-cube', () => {
    const r = buildFormula(FORMULA_PRESETS.find((p) => p.id === 'cube')!.src);
    expect(r.verts).toHaveLength(32);
    expect(r.edges).toHaveLength(80);
    const s = sliceShape(asShape(r), 3, 5, [0, 0, 0, 0, 0]);
    expect(s.verts).toHaveLength(8);
  });

  it('equalities make flat polytopes', () => {
    const r = buildFormula('0 <= x <= 1; 0 <= y <= 1; 0 <= z <= 1; x + y + z = 1.5');
    expect(r.verts).toHaveLength(6); // hexagon
    expect(r.edges).toHaveLength(6);
  });

  it('time variables are detected and change the geometry', () => {
    const src = 'x = u; y = sin(u + t1); u = 0..1, 4';
    const a = buildFormula(src, [0]);
    const b = buildFormula(src, [1]);
    expect(a.usesTime).toBe(true);
    expect(a.verts[0][1]).not.toBeCloseTo(b.verts[0][1], 6);
    expect(buildFormula('x = u; u = 0..1').usesTime).toBe(false);
  });

  const code = (src: string) => {
    try { buildFormula(src); } catch (e) { return e instanceof FormulaError ? `${e.code}@${e.line}` : 'other'; }
    return 'ok';
  };

  it('basic error handling with line numbers', () => {
    expect(code('')).toBe('nothing@0');
    expect(code('u = 0..1')).toBe('nocoord@0');
    expect(code('x = u\nu = 0..1\ny = foo')).toBe('name@3');
    expect(code('x = sin(u\nu = 0..1')).toBe('paren@1');
    expect(code('x*y <= 1')).toBe('linear@1');
    expect(code('x >= 0')).toBe('unbounded@0');
    expect(code('x >= 1; x <= 0')).toBe('emptyset@1');
    expect(code('x = u; u = 0..1, 99999; v = 0..1, 99')).toBe('toomany@0');
    expect(code('hello world')).toBe('syntax@1');
  });
});
