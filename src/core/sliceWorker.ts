/// <reference lib="webworker" />
// Computes cross-sections off the main thread so heavy polytopes (e.g. E8) never freeze the UI.
import { sliceShape } from './polytope';
import type { Shape } from './shape';

export interface SliceJob {
  key: string;
  shape: Shape;
  d: number;
  D: number;
  offsets: number[];
}

self.onmessage = (e: MessageEvent<SliceJob>) => {
  const { key, shape, d, D, offsets } = e.data;
  const r = sliceShape(shape, d, D, offsets);
  (self as unknown as Worker).postMessage({ key, verts: r.verts, edges: r.edges });
};
