import { describe, expect, it } from 'vitest';
import { applyPose, poseOf, timeAxesUsed } from '../src/core/anim';
import { PHYSICS, PHYSICS_ANIM, makePhysics } from '../src/core/physics';
import { centroid, invert, matMul, matVec, norm } from '../src/core/linalg';

const N = 10;

describe('time-dimension animation', () => {
  it('tracks only play when their time axis exists', () => {
    const tr = PHYSICS_ANIM.e8;
    const times = [1, 2, 3, 4, 5, 6];
    expect(poseOf(tr, times, 0, N, new Array(N).fill(0))).toBeNull();
    const p1 = poseOf(tr, times, 1, N, new Array(N).fill(0))!;
    // only the x–y (Petrie) rotation is active with one time dimension
    expect(p1.A[2][2]).toBeCloseTo(1, 12);
    expect(p1.A[0][0]).toBeCloseTo(Math.cos((2 * Math.PI) / 30), 12);
  });

  it('E8 and the 10-D sample use all six time axes, every sample animates', () => {
    expect(timeAxesUsed(PHYSICS_ANIM.e8)).toBe(6);
    expect(timeAxesUsed(PHYSICS_ANIM.string10)).toBe(6);
    for (const k of PHYSICS) expect(timeAxesUsed(makePhysics(k, '#fff', N).anim)).toBeGreaterThan(0);
  });

  it('Lorentz boost keeps the light cone on the light cone (w² = x² + y² + z²)', () => {
    const s = makePhysics('lightcone', '#fff', N);
    const boostOnly = PHYSICS_ANIM.lightcone.filter((t) => t.type === 'boost').map((t) => ({ ...t, t: 0 }));
    const p = poseOf(boostOnly, [0.7], 1, N, centroid(s.verts, N))!;
    const moved = applyPose(p, s.verts);
    for (const v of moved) {
      const interval = v[3] * v[3] - (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
      // apex and the rim spheres lie on the cone |x| = |t|
      expect(Math.abs(interval)).toBeLessThan(1e-9);
    }
  });

  it('Hopf rotations keep every point on the unit 3-sphere', () => {
    const s = makePhysics('hopf', '#fff', N);
    const p = poseOf(s.anim, [1.3, 0.4, 2.2], 3, N, centroid(s.verts, N))!;
    for (const v of applyPose(p, s.verts)) expect(norm(v.slice(0, 4))).toBeCloseTo(1, 9);
  });

  it('pose is invertible so edits made on an animated shape map back exactly', () => {
    const s = makePhysics('string10', '#fff', N);
    const p = poseOf(s.anim, [0.3, 1.1, 2.0, 0.7, 1.9, 0.5], 6, N, centroid(s.verts, N))!;
    const inv = invert(p.A)!;
    const I = matMul(inv, p.A);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) expect(I[i][j]).toBeCloseTo(i === j ? 1 : 0, 9);
    const d = [0.1, -0.2, 0.3, 0, 0, 0, 0, 0, 0, 0];
    expect(matVec(p.A, matVec(inv, d))[2]).toBeCloseTo(0.3, 9);
  });

  it('light-cone wave: the time-1 translation loops', () => {
    const tr = PHYSICS_ANIM.lightcone.filter((t) => t.type === 'translate');
    const P = tr[0].period!;
    const a = poseOf(tr, [0.4], 1, N, new Array(N).fill(0))!;
    const b = poseOf(tr, [0.4 + P], 1, N, new Array(N).fill(0))!;
    expect(a.b[3]).toBeCloseTo(b.b[3], 9);
  });
});
