import type { Mat, Vec } from '../core/linalg';

const AXIS_NAMES = ['x', 'y', 'z', 'w', 'v', 'u', 't', 's', 'r', 'q', 'p', 'o', 'n', 'm', 'l', 'k', 'j', 'i', 'h', 'g'];
export const axisName = (i: number): string => AXIS_NAMES[i] ?? `x${i + 1}`;

export interface ViewState {
  /** N×N rotation applied to the first `dim` coordinates. */
  R: Mat;
  zoom: number;
  panX: number;
  panY: number;
  perspective: boolean;
  colorDepth: boolean;
  showVertices: boolean;
  showAxes: boolean;
}

export interface Projected {
  x: number;
  y: number;
  /** view-space z (bigger = closer to the camera) */
  depth: number;
  /** first coordinate beyond 3-D in view space (used for colouring) */
  hyper: number;
}

const HYPER_CAM = 3.2;
const CAM = 5;

/** Maps n-D world points to the screen: rotate → nested perspective (n→…→3) → 3-D camera. */
export class Projector {
  readonly unit: number;
  constructor(
    readonly dim: number,
    readonly view: ViewState,
    readonly width: number,
    readonly height: number,
  ) {
    this.unit = (Math.min(width, height) / 4.2) * view.zoom;
  }

  project(p: Vec): Projected {
    const d = this.dim;
    const R = this.view.R;
    const y = [0, 0, 0];
    for (let i = 0; i < d; i++) {
      let s = 0;
      const row = R[i];
      for (let j = 0; j < d; j++) s += row[j] * (p[j] ?? 0);
      y[i] = s;
    }
    const hyper = d > 3 ? y[3] : 0;
    if (this.view.perspective) {
      for (let k = d - 1; k >= 3; k--) {
        const den = Math.max(0.25, HYPER_CAM - y[k]);
        const f = HYPER_CAM / den;
        for (let i = 0; i < k; i++) y[i] *= f;
      }
    }
    let s = 1;
    if (d >= 3 && this.view.perspective) s = CAM / Math.max(0.3, CAM - y[2]);
    return {
      x: this.width / 2 + this.view.panX + y[0] * s * this.unit,
      y: this.height / 2 + this.view.panY - y[1] * s * this.unit,
      depth: y[2],
      hyper,
    };
  }
}

export interface DrawItem {
  verts: Vec[];
  edges: [number, number][];
  color: string;
  selected: boolean;
  /** 0 = A, 1 = B ... for boolean order badges */
  order: number;
  dimmed: boolean;
  showVerts: boolean;
}

function hexToRgb(h: string): [number, number, number] {
  const m = h.replace('#', '');
  const v = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

const NEG: [number, number, number] = [80, 140, 255];
const POS: [number, number, number] = [255, 70, 120];

export interface RenderResult {
  /** projected vertex positions per draw item (for picking) */
  screen: Projected[][];
}

export function render(ctx: CanvasRenderingContext2D, P: Projector, items: DrawItem[], dpr: number): RenderResult {
  const W = P.width;
  const H = P.height;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  if (P.view.showAxes) drawGrid(ctx, P);

  const screen: Projected[][] = [];
  interface Seg { a: Projected; b: Projected; z: number; col: string; w: number }
  const segs: Seg[] = [];
  let zMin = Infinity;
  let zMax = -Infinity;
  let hMax = 1e-9;
  items.forEach((it) => {
    const pts = it.verts.map((v) => P.project(v));
    screen.push(pts);
    for (const p of pts) {
      zMin = Math.min(zMin, p.depth);
      zMax = Math.max(zMax, p.depth);
      hMax = Math.max(hMax, Math.abs(p.hyper));
    }
  });
  const zr = zMax - zMin > 1e-9 ? zMax - zMin : 1;
  items.forEach((it, ii) => {
    const pts = screen[ii];
    const base = hexToRgb(it.color);
    // dense wire-frames (E8: 6720 edges) need thin, lighter lines to stay readable
    const dens = it.edges.length > 3000 ? 0.4 : it.edges.length > 1000 ? 0.7 : 1;
    for (const [a, b] of it.edges) {
      const pa = pts[a];
      const pb = pts[b];
      if (!pa || !pb) continue;
      const z = (pa.depth + pb.depth) / 2;
      const fog = 0.35 + 0.65 * ((z - zMin) / zr);
      let rgb = base;
      if (P.view.colorDepth && P.dim > 3) {
        const h = (pa.hyper + pb.hyper) / 2 / hMax; // -1..1
        const tgt = h < 0 ? NEG : POS;
        const k = Math.min(1, Math.abs(h)) * 0.75;
        rgb = [0, 1, 2].map((i) => Math.round(base[i] * (1 - k) + tgt[i] * k)) as [number, number, number];
      }
      const alpha = (it.dimmed ? 0.3 : 1) * fog * (dens < 1 ? 0.55 + 0.45 * dens : 1);
      segs.push({ a: pa, b: pb, z, col: `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha.toFixed(3)})`, w: (it.selected ? 2.6 : 1.5) * dens });
    }
  });
  segs.sort((s1, s2) => s1.z - s2.z);
  ctx.lineCap = 'round';
  // glow for selected shapes
  items.forEach((it, ii) => {
    if (!it.selected || it.edges.length > 1000) return;
    const pts = screen[ii];
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    for (const [a, b] of it.edges) {
      if (!pts[a] || !pts[b]) continue;
      ctx.moveTo(pts[a].x, pts[a].y);
      ctx.lineTo(pts[b].x, pts[b].y);
    }
    ctx.stroke();
  });
  for (const s of segs) {
    ctx.strokeStyle = s.col;
    ctx.lineWidth = s.w;
    ctx.beginPath();
    ctx.moveTo(s.a.x, s.a.y);
    ctx.lineTo(s.b.x, s.b.y);
    ctx.stroke();
  }
  items.forEach((it, ii) => {
    if (!it.showVerts && it.edges.length > 0) return;
    const pts = screen[ii];
    ctx.fillStyle = it.color;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.2;
    for (const p of pts) {
      const fog = 0.45 + 0.55 * ((p.depth - zMin) / zr);
      ctx.globalAlpha = (it.dimmed ? 0.35 : 1) * fog;
      ctx.beginPath();
      ctx.arc(p.x, p.y, it.selected ? 4.5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
  // A/B badges
  items.forEach((it, ii) => {
    if (it.order < 0 || screen[ii].length === 0) return;
    let mx = 0;
    let my = Infinity;
    for (const p of screen[ii]) { mx += p.x; my = Math.min(my, p.y); }
    mx /= screen[ii].length;
    const label = String.fromCharCode(65 + it.order);
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.arc(mx, my - 16, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, mx, my - 16);
  });

  if (P.view.showAxes) drawGizmo(ctx, P);
  return { screen };
}

function drawGrid(ctx: CanvasRenderingContext2D, P: Projector): void {
  if (P.dim < 2) {
    if (P.dim === 1) {
      const a = P.project([-3]);
      const b = P.project([3]);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    return;
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const n = 6;
  const step = 0.5;
  // ground grid in the x–z plane (x–y plane in 2-D), y = -1.5 in 3-D
  for (let i = -n; i <= n; i++) {
    const mk = (u: number, v: number): Vec => (P.dim === 2 ? [u, v] : [u, -1.5, v]);
    const a = P.project(mk(i * step, -n * step));
    const b = P.project(mk(i * step, n * step));
    const c = P.project(mk(-n * step, i * step));
    const e = P.project(mk(n * step, i * step));
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.moveTo(c.x, c.y); ctx.lineTo(e.x, e.y);
  }
  ctx.stroke();
}

const AXIS_COLORS = ['#ff5a5f', '#7bd389', '#4dabf7', '#ffd43b', '#da77f2', '#ff922b', '#63e6be', '#a5d8ff', '#ffc9c9', '#d8f5a2'];

function drawGizmo(ctx: CanvasRenderingContext2D, P: Projector): void {
  const d = P.dim;
  if (d === 0) return;
  const cx = 52;
  const cy = P.height - 52;
  const L = 34;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.arc(cx, cy, 46, 0, Math.PI * 2);
  ctx.fill();
  const R = P.view.R;
  const axes: { i: number; x: number; y: number; z: number }[] = [];
  for (let i = 0; i < d; i++) {
    const vx = R[0][i];
    const vy = d >= 2 ? R[1][i] : 0;
    const vz = d >= 3 ? R[2][i] : 0;
    axes.push({ i, x: vx, y: vy, z: vz });
  }
  axes.sort((a, b) => a.z - b.z);
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const a of axes) {
    const col = AXIS_COLORS[a.i % AXIS_COLORS.length];
    const ex = cx + a.x * L;
    const ey = cy - a.y * L;
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.55 + 0.45 * Math.max(0, Math.min(1, (a.z + 1) / 2));
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.fillStyle = col;
    const lx = cx + a.x * (L + 9);
    const ly = cy - a.y * (L + 9);
    ctx.fillText(axisName(a.i), lx, ly);
  }
  ctx.globalAlpha = 1;
}
