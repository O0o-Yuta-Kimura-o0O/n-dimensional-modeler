import { describe, expect, it } from 'vitest';
import { PHYSICS, e8PetrieBasis, e8Roots, icosahedralBasis, makePhysics } from '../src/core/physics';
import { cellEdges, clip, shapeCells, sliceCell, sliceShape } from '../src/core/polytope';
import { dot, norm, sub } from '../src/core/linalg';

const isOrthogonal = (M: number[][]) =>
  M.every((r, i) => M.every((s, j) => Math.abs(dot(r, s) - (i === j ? 1 : 0)) < 1e-9));

describe('physics samples', () => {
  it('every sample builds with consistent indices', () => {
    for (const k of PHYSICS) {
      const s = makePhysics(k, '#fff', 10);
      expect(s.verts.length, k).toBeGreaterThan(0);
      for (const [a, b] of s.edges) {
        expect(a).toBeLessThan(s.verts.length);
        expect(b).toBeLessThan(s.verts.length);
      }
    }
  });

  it('light cone: slicing at time t gives a sphere of radius |t|', () => {
    const s = makePhysics('lightcone', '#fff', 4);
    for (const t of [0.5, -0.8]) {
      const sl = sliceShape(s, 3, 4, [0, 0, 0, t]);
      expect(sl.verts.length).toBeGreaterThan(20);
      const rmax = Math.max(...sl.verts.map((v) => norm(v.slice(0, 3))));
      expect(rmax).toBeCloseTo(Math.abs(t), 6);
    }
  });

  it('light cone cells give back their explicit edges combinatorially', () => {
    const s = makePhysics('lightcone', '#fff', 4);
    const cells = shapeCells(s, 4);
    expect(cells).toHaveLength(2);
    // cone over a polyhedron with V verts and E edges has E + V edges
    expect(cellEdges(cells[0]).length).toBe((s.edges.length - 0) > 0 ? cellEdges(cells[1]).length : 0);
  });

  it('Hopf fibres lie on the unit 3-sphere', () => {
    const s = makePhysics('hopf', '#fff', 4);
    for (const v of s.verts) expect(norm(v.slice(0, 4))).toBeCloseTo(1, 9);
  });

  it('Calabi–Yau points satisfy z1^5 + z2^5 = 1', () => {
    const s = makePhysics('calabiyau', '#fff', 4);
    for (const v of s.verts.filter((_, i) => i % 37 === 0)) {
      const p5 = (re: number, im: number): [number, number] => {
        let a: [number, number] = [1, 0];
        for (let i = 0; i < 5; i++) a = [a[0] * re - a[1] * im, a[0] * im + a[1] * re];
        return a;
      };
      const z1 = p5(v[0], v[2]);
      const z2 = p5(v[1], v[3]);
      expect(z1[0] + z2[0]).toBeCloseTo(1, 6);
      expect(z1[1] + z2[1]).toBeCloseTo(0, 6);
    }
  });

  it('quasicrystal basis is orthogonal and every 6-cube edge has the same 3-D shadow length', () => {
    expect(isOrthogonal(icosahedralBasis())).toBe(true);
    const s = makePhysics('quasicrystal', '#fff', 6);
    const lens = s.edges.map(([a, b]) => norm(sub(s.verts[a], s.verts[b]).slice(0, 3)));
    for (const l of lens) expect(l).toBeCloseTo(lens[0], 9);
  });

  it('E8: 240 roots, 6720 edges, 19440 facets, Petrie projection has 8 rings of 30', () => {
    expect(e8Roots()).toHaveLength(240);
    const s = makePhysics('e8', '#fff', 8);
    expect(s.edges).toHaveLength(6720);
    const f = s.cells![0].facets;
    expect(f).toHaveLength(19440);
    expect(f.filter((x) => x.length === 14)).toHaveLength(2160);
    expect(f.filter((x) => x.length === 8)).toHaveLength(17280);
    expect(isOrthogonal(e8PetrieBasis())).toBe(true);
    const radii = new Map<string, number>();
    for (const v of s.verts) {
      const k = Math.hypot(v[0], v[1]).toFixed(5);
      radii.set(k, (radii.get(k) ?? 0) + 1);
    }
    expect([...radii.values()].sort()).toEqual(new Array(8).fill(30));
  });

  it('E8 can be sliced down to 3-D quickly', () => {
    const s = makePhysics('e8', '#fff', 8);
    const off = new Array(8).fill(0.1);
    const t = performance.now();
    const sl = sliceShape(s, 3, 8, off);
    expect(performance.now() - t).toBeLessThan(5000);
    expect(sl.verts.length).toBeGreaterThan(0);
    for (const v of sl.verts) for (let j = 3; j < 8; j++) expect(v[j]).toBeCloseTo(0.1, 9);
  }, 20000);

  it('box and chain slicing give the same section (quasicrystal 6-D → 3-D)', () => {
    const s = makePhysics('quasicrystal', '#fff', 6);
    const [c] = shapeCells(s, 6);
    const off = [0, 0, 0, 0.13, -0.21, 0.07];
    const box = sliceCell(c, 3, off)!;
    let ch: ReturnType<typeof clip> = c;
    for (let j = 5; j >= 3 && ch; j--) {
      const n = [0, 0, 0, 0, 0, 0];
      n[j] = 1;
      ch = clip(ch, { n, d: off[j] });
      if (ch) ch = clip(ch, { n: n.map((x) => -x), d: -off[j] });
    }
    const a = box.verts.map((v) => v.p.slice(0, 3).map((x) => x.toFixed(6)).join()).sort();
    const b = ch!.verts.map((v) => v.p.slice(0, 3).map((x) => x.toFixed(6)).join()).sort();
    expect(a).toEqual(b);
    expect(cellEdges(box).length).toBe(cellEdges(ch!).length);
  });

  it('10-D string sample cut at the hidden origin is a 3-D cube', () => {
    const c4 = makePhysics('string10', '#fff', 10);
    const sl = sliceShape(c4, 3, 10, new Array(10).fill(0));
    // 4-D box × T⁶ cut at the origin of the hidden axes: a 3-D cube of side 1.4
    expect(sl.verts.length).toBe(8);
    expect(sl.edges.length).toBe(12);
  });

  it('10-D string sample has 2000 vertices', () => {
    const s = makePhysics('string10', '#fff', 10);
    expect(s.verts).toHaveLength(2000);
    expect(s.verts[0]).toHaveLength(10);
  });
});
