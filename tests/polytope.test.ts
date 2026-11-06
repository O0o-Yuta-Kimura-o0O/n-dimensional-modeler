import { describe, expect, it } from 'vitest';
import { makePrimitive } from '../src/core/primitives';
import { booleanShapes, cellEdges, shapeCells, sliceShape } from '../src/core/polytope';
import { translateShape } from '../src/core/shape';

const totalLength = (s: { verts: number[][]; edges: [number, number][] }) =>
  s.edges.reduce((acc, [a, b]) => acc + Math.hypot(...s.verts[a].map((x, i) => x - s.verts[b][i])), 0);

const prm = (dim: number, p = 6, q = 4) => ({ dim, p, q });

describe('primitives', () => {
  it('hypercube counts match 2^n vertices and n·2^(n-1) edges', () => {
    for (let n = 0; n <= 6; n++) {
      const s = makePrimitive('hypercube', prm(n), '#fff', 8);
      expect(s.verts.length).toBe(1 << n);
      expect(s.edges.length).toBe(n === 0 ? 0 : n * (1 << (n - 1)));
    }
  });

  it('combinatorial edge detection reproduces primitive edges', () => {
    for (const kind of ['simplex', 'hypercube', 'orthoplex', 'prism', 'pyramid', 'duoprism', 'cell24'] as const) {
      for (const n of [2, 3, 4, 5]) {
        const s = makePrimitive(kind, prm(n), '#fff', 6);
        const [c] = shapeCells(s, 6);
        expect(cellEdges(c).length, `${kind} ${n}D`).toBe(s.edges.length);
      }
    }
  });

  it('works for flat shapes embedded in higher dimensions', () => {
    const s = makePrimitive('polygon', prm(7, 5), '#fff', 7);
    const [c] = shapeCells(s, 7);
    expect(c.k).toBe(2);
    expect(cellEdges(c).length).toBe(5);
  });
});

describe('booleans', () => {
  it('intersection of two offset cubes is a box (3D)', () => {
    const a = makePrimitive('hypercube', prm(3), '#fff', 3);
    const b = makePrimitive('hypercube', prm(3), '#fff', 3);
    translateShape(b, [0.7, 0, 0]);
    const r = booleanShapes('intersect', a, b, 3, '#fff')!;
    expect(r.verts.length).toBe(8);
    expect(r.edges.length).toBe(12);
  });

  it('intersection of two offset tesseracts is a 4D box', () => {
    const a = makePrimitive('hypercube', prm(4), '#fff', 4);
    const b = makePrimitive('hypercube', prm(4), '#fff', 4);
    translateShape(b, [0.5, 0.5, 0.5, 0.5]);
    const r = booleanShapes('intersect', a, b, 4, '#fff')!;
    expect(r.verts.length).toBe(16);
    expect(r.edges.length).toBe(32);
  });

  it('cube minus corner cube keeps only real edges (3D)', () => {
    const a = makePrimitive('hypercube', prm(3), '#fff', 3);
    const b = makePrimitive('hypercube', prm(3), '#fff', 3);
    translateShape(b, [0.7, 0.7, 0.7]);
    const r = booleanShapes('subtract', a, b, 3, '#fff')!;
    // cube with an octant notch: 9·1.4 + 3·0.7 (shortened) + 3·0.7 (notch) + 6·0.7 (faces) = 21.0
    expect(totalLength(r)).toBeCloseTo(21.0, 6);
  });

  it('union of two overlapping squares is an octagon-like outline', () => {
    const a = makePrimitive('hypercube', prm(2), '#fff', 2);
    const b = makePrimitive('hypercube', prm(2), '#fff', 2);
    translateShape(b, [0.7, 0.7]);
    const r = booleanShapes('union', a, b, 2, '#fff')!;
    expect(totalLength(r)).toBeCloseTo(8.4, 6);
  });

  it('union of shifted cubes is one box with no internal split lines', () => {
    const a = makePrimitive('hypercube', prm(3), '#fff', 3);
    const b = makePrimitive('hypercube', prm(3), '#fff', 3);
    translateShape(b, [0.7, 0, 0]);
    const r = booleanShapes('union', a, b, 3, '#fff')!;
    expect(totalLength(r)).toBeCloseTo(4 * 2.1 + 8 * 1.4, 6);
  });

  it('union of shifted tesseracts is one 4D box', () => {
    const a = makePrimitive('hypercube', prm(4), '#fff', 4);
    const b = makePrimitive('hypercube', prm(4), '#fff', 4);
    translateShape(b, [0.7, 0, 0, 0]);
    const r = booleanShapes('union', a, b, 4, '#fff')!;
    expect(totalLength(r)).toBeCloseTo(8 * 2.1 + 24 * 1.4, 6);
  });

  it('slice of a tesseract at w=0 is a cube', () => {
    const a = makePrimitive('hypercube', prm(4), '#fff', 4);
    const s = sliceShape(a, 3, 4, [0, 0, 0, 0]);
    expect(s.verts.length).toBe(8);
    expect(s.edges.length).toBe(12);
  });

  it('slice of a 4-simplex through its interior gives a tetrahedron-type cell', () => {
    const a = makePrimitive('simplex', prm(4), '#fff', 4);
    const s = sliceShape(a, 3, 4, [0, 0, 0, 0]);
    expect(s.verts.length).toBeGreaterThanOrEqual(4);
  });

  it('6D cubes subtract without crashing', () => {
    const a = makePrimitive('hypercube', prm(6), '#fff', 6);
    const b = makePrimitive('hypercube', prm(6), '#fff', 6);
    translateShape(b, [0.7, 0.7, 0.7, 0.7, 0.7, 0.7]);
    const r = booleanShapes('subtract', a, b, 6, '#fff')!;
    expect(r.cells!.length).toBe(6);
  });
});
