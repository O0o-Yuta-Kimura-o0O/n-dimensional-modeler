/**
 * Animation driven by multiple time dimensions.
 *
 * A shape may carry tracks; each track is bound to one time axis t₁…t₆ (`t` = 0…5).
 * A track only moves when its time axis exists (time-dimension slider > t), so raising the
 * number of time dimensions brings more independent motions to life.
 * All tracks are affine maps, so the whole pose is x ↦ A·x + b and edits can be mapped back.
 */
import type { Mat, Vec } from './linalg';
import { identity, matMul, matVec, zeros } from './linalg';

export type TrackType = 'rotate' | 'boost' | 'translate' | 'oscillate' | 'scale';

export interface Track {
  /** time axis index (0 = t₁) */
  t: number;
  type: TrackType;
  /** rotation / boost plane */
  plane?: [number, number];
  /** angular frequency (rad per unit time) */
  omega?: number;
  /** translation direction */
  vec?: number[];
  /** translate: saw-tooth period (the motion loops) */
  period?: number;
  /** boost: maximum rapidity; scale: relative amplitude */
  amp?: number;
}

export const MAX_TIME_DIMS = 6;

export interface Pose {
  A: Mat;
  b: Vec;
}

/** Affine pose of a shape at the given clock values, or null when nothing moves. */
export function poseOf(tracks: Track[] | undefined, times: number[], timeDims: number, N: number, center: Vec): Pose | null {
  if (!tracks || tracks.length === 0) return null;
  let A: Mat | null = null;
  let b: Vec = zeros(N);
  for (const tr of tracks) {
    if (tr.t >= timeDims) continue;
    const tau = times[tr.t] ?? 0;
    let M: Mat = identity(N);
    let m: Vec = zeros(N);
    const around = (M2: Mat) => {
      // x' = M2 (x − c) + c
      const Mc = matVec(M2, center);
      return center.map((c, i) => c - Mc[i]);
    };
    if ((tr.type === 'rotate' || tr.type === 'boost') && tr.plane) {
      const [i, j] = tr.plane;
      if (i >= N || j >= N) continue;
      if (tr.type === 'rotate') {
        const a = (tr.omega ?? 1) * tau;
        M[i][i] = Math.cos(a); M[j][j] = Math.cos(a); M[i][j] = -Math.sin(a); M[j][i] = Math.sin(a);
      } else {
        // Lorentz boost with rapidity η(τ) = amp·sin(ωτ)
        const eta = (tr.amp ?? 0.8) * Math.sin((tr.omega ?? 1) * tau);
        M[i][i] = Math.cosh(eta); M[j][j] = Math.cosh(eta); M[i][j] = Math.sinh(eta); M[j][i] = Math.sinh(eta);
      }
      m = around(M);
    } else if (tr.type === 'scale') {
      const s = Math.max(0.05, 1 + (tr.amp ?? 0.2) * Math.sin((tr.omega ?? 1) * tau));
      M = identity(N).map((r) => r.map((x) => x * s));
      m = around(M);
    } else if (tr.type === 'translate' && tr.vec) {
      const P = tr.period ?? 2;
      const saw = ((((tau % P) + P) % P) - P / 2);
      m = zeros(N).map((_, i) => (tr.vec![i] ?? 0) * saw);
    } else if (tr.type === 'oscillate' && tr.vec) {
      const k = Math.sin((tr.omega ?? 1) * tau);
      m = zeros(N).map((_, i) => (tr.vec![i] ?? 0) * k);
    } else continue;
    // compose: new(x) = M (A x + b) + m
    A = A ? matMul(M, A) : M;
    b = matVec(M, b).map((x, i) => x + m[i]);
  }
  return A ? { A, b } : null;
}

export function applyPose(p: Pose, verts: Vec[]): Vec[] {
  return verts.map((v) => matVec(p.A, v).map((x, i) => x + p.b[i]));
}

/** Highest time axis used by a shape's tracks (+1), i.e. how many time dimensions it can use. */
export const timeAxesUsed = (tracks: Track[] | undefined): number => (tracks ?? []).reduce((m, t) => Math.max(m, t.t + 1), 0);
