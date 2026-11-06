import type { Shape } from '../core/shape';
import { padShape } from '../core/shape';
import { identity, pad, reorthonormalize } from '../core/linalg';
import type { ViewState } from '../render/view';

export type Tool = 'view' | 'move' | 'vertex';
export type ViewMode = 'project' | 'slice';

export interface AppState {
  dim: number;
  maxDim: number;
  /** storage dimension: every vector has at least this many coordinates */
  N: number;
  shapes: Shape[];
  /** selection order matters: [A, B] for booleans */
  selected: string[];
  tool: Tool;
  multi: boolean;
  /** -1 = ordinary 3-D trackball; k >= 3 = drag rotates through axis k */
  rotAxis: number;
  /** -1 = screen plane, otherwise world axis index */
  axisLock: number;
  mode: ViewMode;
  sliceOffset: number[];
  p: number;
  q: number;
  autoRotate: boolean;
  view: ViewState;
  /** bumps on every geometry change (cache key) */
  rev: number;
}

export function initialState(): AppState {
  const N = 10;
  return {
    dim: 3,
    maxDim: 10,
    N,
    shapes: [],
    selected: [],
    tool: 'view',
    multi: false,
    rotAxis: -1,
    axisLock: -1,
    mode: 'project',
    sliceOffset: new Array(N).fill(0),
    p: 6,
    q: 4,
    autoRotate: false,
    view: {
      R: defaultRotation(N),
      zoom: 1,
      panX: 0,
      panY: 0,
      perspective: true,
      colorDepth: true,
      showVertices: false,
      showAxes: true,
    },
    rev: 0,
  };
}

/** A slightly tilted default camera so 3-D shapes don't look flat. */
export function defaultRotation(N: number): number[][] {
  const R = identity(N);
  const a = -0.5; // yaw (x–z)
  const b = 0.35; // pitch (y–z)
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
  // R = Rx(b) * Ry(a) on the first three axes
  const ry = [[ca, 0, -sa], [0, 1, 0], [sa, 0, ca]];
  const rx = [[1, 0, 0], [0, cb, -sb], [0, sb, cb]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    let s = 0;
    for (let k = 0; k < 3; k++) s += rx[i][k] * ry[k][j];
    R[i][j] = s;
  }
  return R;
}

/** Grow storage dimension (never shrinks – information is preserved). */
export function ensureStorage(S: AppState, n: number): void {
  if (n <= S.N) return;
  const old = S.N;
  S.N = n;
  for (const s of S.shapes) padShape(s, n);
  const R = identity(n);
  for (let i = 0; i < old; i++) for (let j = 0; j < old; j++) R[i][j] = S.view.R[i][j];
  S.view.R = R;
  S.sliceOffset = pad(S.sliceOffset, n);
}

/**
 * Restrict the view rotation to the first `dim` axes: the top-left block is re-orthonormalised
 * and the rest reset to identity, so hidden coordinates never leak into the picture.
 */
export function fitRotationToDim(S: AppState): void {
  const N = S.N;
  const d = S.dim;
  const R = identity(N);
  if (d > 0) {
    const block = S.view.R.slice(0, d).map((r) => r.slice(0, d));
    const ortho = reorthonormalize(block);
    for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) R[i][j] = ortho[i][j];
  }
  S.view.R = R;
}
