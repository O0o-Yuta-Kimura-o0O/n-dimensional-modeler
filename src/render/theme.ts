/**
 * Visual themes: CSS variables for the UI plus drawing parameters for the canvas.
 * Fonts are system font stacks only, so the app works offline (later as a phone app).
 */

export interface CanvasStyle {
  bgInner: string;
  bgOuter: string;
  grid: string;
  /** every n-th grid line drawn stronger (0 = off) */
  gridMajor: number;
  gridMajorColor: string;
  /** base edge width in CSS px */
  line: number;
  /** shadow blur for a glow (0 = none) */
  glow: number;
  /** 'lighter' gives additive neon light */
  composite: GlobalCompositeOperation;
  /** how shape colours are drawn: mixed towards `tint` by `mix` (0 = original colour) */
  tint: string;
  mix: number;
  vertexStroke: string;
  selectHalo: string;
  /** depth colours for coordinates beyond 3-D (negative / positive side) */
  neg: string;
  pos: string;
  /** minimum opacity for the farthest edges */
  fog: number;
  axis: string[];
  gizmoBg: string;
  font: string;
}

export interface Theme {
  id: string;
  dark: boolean;
  css: Record<string, string>;
  canvas: CanvasStyle;
  /** colours for newly created shapes */
  palette: string[];
}

const SANS = "system-ui, -apple-system, 'Hiragino Sans', 'Noto Sans JP', 'Segoe UI', sans-serif";
const MONO = "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, 'Hiragino Sans', monospace";
const MINCHO = "'Hiragino Mincho ProN', 'Yu Mincho', 'YuMincho', 'Noto Serif JP', 'Songti SC', serif";
const DIDONE = "'Didot', 'Bodoni 72', 'Bodoni MT', 'Hiragino Mincho ProN', 'Noto Serif JP', Georgia, serif";

const AXIS_DEFAULT = ['#ff5a5f', '#7bd389', '#4dabf7', '#ffd43b', '#da77f2', '#ff922b', '#63e6be', '#a5d8ff', '#ffc9c9', '#d8f5a2'];

export const THEMES: Theme[] = [
  {
    id: 'dark',
    dark: true,
    css: {
      '--bg': '#0d1117', '--bg2': '#151b24', '--panel': 'rgba(21,27,36,0.92)', '--line': '#2a3442',
      '--text': '#e6edf3', '--muted': '#8b98a8', '--accent': '#4cc9f0', '--accent2': '#f72585', '--danger': '#ff5a5f',
      '--on-bg': '#1d3a4a', '--hover': '#3d4b5e', '--font': SANS, '--font-head': SANS, '--radius': '10px',
      '--canvas-bg': 'radial-gradient(ellipse at 50% 40%, #131c28 0%, #0d1117 70%)', '--badge-glow': 'rgba(76,201,240,0.4)',
      '--letter': '0', '--head-transform': 'none', '--toast-bg': 'rgba(0,0,0,0.82)',
    },
    canvas: {
      bgInner: '#131c28', bgOuter: '#0d1117', grid: 'rgba(255,255,255,0.06)', gridMajor: 0, gridMajorColor: '',
      line: 1.5, glow: 0, composite: 'source-over', tint: '#ffffff', mix: 0, vertexStroke: 'rgba(255,255,255,0.85)',
      selectHalo: 'rgba(255,255,255,0.12)', neg: '#508cff', pos: '#ff4678', fog: 0.35, axis: AXIS_DEFAULT,
      gizmoBg: 'rgba(0,0,0,0.35)', font: SANS,
    },
    palette: ['#4cc9f0', '#f72585', '#b8f35a', '#ffb703', '#9d4edd', '#06d6a0', '#ff7b54', '#e9ecef'],
  },
  {
    id: 'light',
    dark: false,
    css: {
      '--bg': '#f4f6f9', '--bg2': '#ffffff', '--panel': 'rgba(255,255,255,0.94)', '--line': '#d9dee6',
      '--text': '#18202c', '--muted': '#5f6b7a', '--accent': '#0a6cdf', '--accent2': '#d6336c', '--danger': '#d63031',
      '--on-bg': '#e3efff', '--hover': '#b8c2cf', '--font': SANS, '--font-head': SANS, '--radius': '10px',
      '--canvas-bg': 'radial-gradient(ellipse at 50% 40%, #ffffff 0%, #eef1f5 75%)', '--badge-glow': 'rgba(10,108,223,0.18)',
      '--letter': '0', '--head-transform': 'none', '--toast-bg': 'rgba(24,32,44,0.9)',
    },
    canvas: {
      bgInner: '#ffffff', bgOuter: '#eef1f5', grid: 'rgba(20,30,50,0.07)', gridMajor: 0, gridMajorColor: '',
      line: 1.5, glow: 0, composite: 'source-over', tint: '#0b1220', mix: 0.3, vertexStroke: 'rgba(255,255,255,0.95)',
      selectHalo: 'rgba(10,108,223,0.15)', neg: '#1f6feb', pos: '#e5326b', fog: 0.45, axis: ['#e03131', '#2f9e44', '#1971c2', '#e8590c', '#9c36b5', '#c2255c', '#0c8599', '#5c7cfa', '#f08c00', '#66a80f'],
      gizmoBg: 'rgba(255,255,255,0.8)', font: SANS,
    },
    palette: ['#0a6cdf', '#d6336c', '#2b8a3e', '#e67700', '#7048e8', '#0c8599', '#c92a2a', '#495057'],
  },
  {
    id: 'blueprint',
    dark: true,
    css: {
      '--bg': '#0a2540', '--bg2': '#0d2d4f', '--panel': 'rgba(10,37,64,0.9)', '--line': 'rgba(190,225,255,0.28)',
      '--text': '#eaf4ff', '--muted': '#9fc0de', '--accent': '#ffffff', '--accent2': '#ffd166', '--danger': '#ff8fa3',
      '--on-bg': 'rgba(255,255,255,0.14)', '--hover': 'rgba(255,255,255,0.55)', '--font': MONO, '--font-head': MONO, '--radius': '2px',
      '--canvas-bg': 'linear-gradient(#0b2a4a, #0a2540)', '--badge-glow': 'rgba(255,255,255,0.25)',
      '--letter': '0.06em', '--head-transform': 'uppercase', '--toast-bg': 'rgba(6,26,46,0.95)',
    },
    canvas: {
      bgInner: '#0b2a4a', bgOuter: '#0a2540', grid: 'rgba(200,230,255,0.07)', gridMajor: 4, gridMajorColor: 'rgba(200,230,255,0.18)',
      line: 1.1, glow: 0, composite: 'source-over', tint: '#f0f8ff', mix: 0.72, vertexStroke: '#0a2540',
      selectHalo: 'rgba(255,209,102,0.22)', neg: '#7fd3ff', pos: '#ffd166', fog: 0.5, axis: ['#ffffff', '#ffd166', '#7fd3ff', '#ff8fa3', '#c3f0ca', '#e0c3fc', '#ffffff', '#ffd166', '#7fd3ff', '#ff8fa3'],
      gizmoBg: 'rgba(255,255,255,0.06)', font: MONO,
    },
    palette: ['#ffffff', '#ffd166', '#7fd3ff', '#ff8fa3', '#c3f0ca', '#e0c3fc', '#ffe5b4', '#a0e7e5'],
  },
  {
    id: 'sumi',
    dark: false,
    css: {
      '--bg': '#f2ede3', '--bg2': '#faf7f0', '--panel': 'rgba(250,247,240,0.95)', '--line': '#d8cfbf',
      '--text': '#1c1a17', '--muted': '#7a7166', '--accent': '#b7282e', '--accent2': '#1c1a17', '--danger': '#b7282e',
      '--on-bg': '#efe2d0', '--hover': '#a99d8b', '--font': MINCHO, '--font-head': MINCHO, '--radius': '3px',
      '--canvas-bg': 'radial-gradient(ellipse at 50% 35%, #faf6ee 0%, #ece5d8 85%)', '--badge-glow': 'rgba(183,40,46,0)',
      '--letter': '0.04em', '--head-transform': 'none', '--toast-bg': 'rgba(28,26,23,0.92)',
    },
    canvas: {
      bgInner: '#faf6ee', bgOuter: '#ece5d8', grid: 'rgba(60,50,40,0.06)', gridMajor: 0, gridMajorColor: '',
      line: 1.25, glow: 0, composite: 'source-over', tint: '#1c1a17', mix: 0.78, vertexStroke: '#faf7f0',
      selectHalo: 'rgba(183,40,46,0.16)', neg: '#2f4f6f', pos: '#b7282e', fog: 0.3, axis: ['#b7282e', '#3c6e47', '#2f4f6f', '#a0782c', '#5b4a7a', '#1c1a17', '#b7282e', '#3c6e47', '#2f4f6f', '#a0782c'],
      gizmoBg: 'rgba(250,247,240,0.85)', font: MINCHO,
    },
    palette: ['#b7282e', '#1c1a17', '#2f4f6f', '#3c6e47', '#a0782c', '#5b4a7a', '#7a7166', '#8c2f39'],
  },
  {
    id: 'neon',
    dark: true,
    css: {
      '--bg': '#07060b', '--bg2': '#100e18', '--panel': 'rgba(16,14,24,0.86)', '--line': '#2a2340',
      '--text': '#f3eefe', '--muted': '#9a8fbd', '--accent': '#19f0ff', '--accent2': '#ff2bd6', '--danger': '#ff3864',
      '--on-bg': 'rgba(255,43,214,0.16)', '--hover': '#ff2bd6', '--font': SANS, '--font-head': SANS, '--radius': '14px',
      '--canvas-bg': 'radial-gradient(ellipse at 50% 120%, #2a0b3d 0%, #07060b 60%)', '--badge-glow': 'rgba(255,43,214,0.8)',
      '--letter': '0.02em', '--head-transform': 'none', '--toast-bg': 'rgba(16,14,24,0.92)',
    },
    canvas: {
      bgInner: '#1a0826', bgOuter: '#07060b', grid: 'rgba(255,43,214,0.10)', gridMajor: 0, gridMajorColor: '',
      line: 1.3, glow: 9, composite: 'lighter', tint: '#ffffff', mix: 0.1, vertexStroke: 'rgba(255,255,255,0.9)',
      selectHalo: 'rgba(25,240,255,0.10)', neg: '#19f0ff', pos: '#ff2bd6', fog: 0.3, axis: ['#ff2bd6', '#19f0ff', '#b4ff39', '#ffe600', '#9d6bff', '#ff7a18', '#19f0ff', '#ff2bd6', '#b4ff39', '#ffe600'],
      gizmoBg: 'rgba(0,0,0,0.5)', font: SANS,
    },
    palette: ['#19f0ff', '#ff2bd6', '#b4ff39', '#ffe600', '#9d6bff', '#ff7a18', '#00ffa3', '#ff5c8a'],
  },
  {
    id: 'obsidian',
    dark: true,
    css: {
      '--bg': '#0b0a09', '--bg2': '#141210', '--panel': 'rgba(20,18,16,0.93)', '--line': '#2e2922',
      '--text': '#efe7d6', '--muted': '#9a8f7c', '--accent': '#d4b26a', '--accent2': '#e9d9b0', '--danger': '#d9776b',
      '--on-bg': 'rgba(212,178,106,0.14)', '--hover': '#d4b26a', '--font': SANS, '--font-head': DIDONE, '--radius': '0px',
      '--canvas-bg': 'radial-gradient(ellipse at 50% 30%, #1a1714 0%, #0b0a09 70%)', '--badge-glow': 'rgba(212,178,106,0.35)',
      '--letter': '0.08em', '--head-transform': 'uppercase', '--toast-bg': 'rgba(20,18,16,0.95)',
    },
    canvas: {
      bgInner: '#1a1714', bgOuter: '#0b0a09', grid: 'rgba(212,178,106,0.06)', gridMajor: 0, gridMajorColor: '',
      line: 1.05, glow: 2, composite: 'source-over', tint: '#e8cf93', mix: 0.55, vertexStroke: '#0b0a09',
      selectHalo: 'rgba(212,178,106,0.15)', neg: '#8fa3b8', pos: '#d4b26a', fog: 0.3, axis: ['#d4b26a', '#efe7d6', '#9a8f7c', '#c98b6b', '#8fa3b8', '#b7a57a', '#d4b26a', '#efe7d6', '#9a8f7c', '#c98b6b'],
      gizmoBg: 'rgba(0,0,0,0.4)', font: DIDONE,
    },
    palette: ['#d4b26a', '#efe7d6', '#c98b6b', '#8fa3b8', '#b7a57a', '#9a8f7c', '#e9d9b0', '#a8604f'],
  },
  {
    // Nord: polar night + frost + aurora
    id: 'nord',
    dark: true,
    css: {
      '--bg': '#2e3440', '--bg2': '#353c4a', '--panel': 'rgba(59,66,82,0.92)', '--line': '#4c566a',
      '--text': '#eceff4', '--muted': '#a3adbf', '--accent': '#88c0d0', '--accent2': '#b48ead', '--danger': '#bf616a',
      '--on-bg': 'rgba(136,192,208,0.18)', '--hover': '#81a1c1', '--font': SANS, '--font-head': SANS, '--radius': '8px',
      '--canvas-bg': 'radial-gradient(ellipse at 50% 30%, #3b4252 0%, #2e3440 75%)', '--badge-glow': 'rgba(136,192,208,0.35)',
      '--letter': '0.01em', '--head-transform': 'none', '--toast-bg': 'rgba(46,52,64,0.95)',
    },
    canvas: {
      bgInner: '#3b4252', bgOuter: '#2e3440', grid: 'rgba(216,222,233,0.06)', gridMajor: 0, gridMajorColor: '',
      line: 1.4, glow: 0, composite: 'source-over', tint: '#d8dee9', mix: 0.15, vertexStroke: '#2e3440',
      selectHalo: 'rgba(136,192,208,0.18)', neg: '#5e81ac', pos: '#d08770', fog: 0.35, axis: ['#bf616a', '#a3be8c', '#81a1c1', '#ebcb8b', '#b48ead', '#d08770', '#8fbcbb', '#88c0d0', '#bf616a', '#a3be8c'],
      gizmoBg: 'rgba(46,52,64,0.6)', font: SANS,
    },
    palette: ['#88c0d0', '#a3be8c', '#ebcb8b', '#b48ead', '#d08770', '#8fbcbb', '#bf616a', '#e5e9f0'],
  },
  {
    // Sakura: blossom white, plum ink, leaf-green accent
    id: 'sakura',
    dark: false,
    css: {
      '--bg': '#fbf4f5', '--bg2': '#fffafa', '--panel': 'rgba(255,250,250,0.94)', '--line': '#efd9de',
      '--text': '#3d2b33', '--muted': '#8f727c', '--accent': '#c2185b', '--accent2': '#6a8f3b', '--danger': '#c62828',
      '--on-bg': '#fbe3ea', '--hover': '#e4a9bb', '--font': SANS, '--font-head': MINCHO, '--radius': '16px',
      '--canvas-bg': 'radial-gradient(ellipse at 50% 35%, #fffafb 0%, #f8e7ec 80%)', '--badge-glow': 'rgba(194,24,91,0.15)',
      '--letter': '0.02em', '--head-transform': 'none', '--toast-bg': 'rgba(61,43,51,0.92)',
    },
    canvas: {
      bgInner: '#fffafb', bgOuter: '#f8e7ec', grid: 'rgba(194,24,91,0.06)', gridMajor: 0, gridMajorColor: '',
      line: 1.35, glow: 0, composite: 'source-over', tint: '#5a2a3c', mix: 0.35, vertexStroke: '#fffafa',
      selectHalo: 'rgba(194,24,91,0.12)', neg: '#7b6fb0', pos: '#e0457b', fog: 0.35, axis: ['#d6336c', '#6a8f3b', '#7b6fb0', '#e08a2c', '#a64d79', '#3d2b33', '#d6336c', '#6a8f3b', '#7b6fb0', '#e08a2c'],
      gizmoBg: 'rgba(255,250,250,0.85)', font: SANS,
    },
    palette: ['#e0457b', '#a64d79', '#6a8f3b', '#7b6fb0', '#e08a2c', '#c2185b', '#5a2a3c', '#d48aa5'],
  },
  {
    // Swiss / International Typographic Style: white, black, one red
    id: 'swiss',
    dark: false,
    css: {
      '--bg': '#ffffff', '--bg2': '#ffffff', '--panel': 'rgba(255,255,255,0.97)', '--line': '#111111',
      '--text': '#111111', '--muted': '#6b6b6b', '--accent': '#e30613', '--accent2': '#111111', '--danger': '#e30613',
      '--on-bg': '#111111', '--hover': '#e30613', '--font': "'Helvetica Neue', Helvetica, Arial, 'Hiragino Sans', 'Noto Sans JP', sans-serif", '--font-head': "'Helvetica Neue', Helvetica, Arial, 'Hiragino Sans', sans-serif", '--radius': '0px',
      '--canvas-bg': '#ffffff', '--badge-glow': 'rgba(0,0,0,0)',
      '--letter': '-0.01em', '--head-transform': 'none', '--toast-bg': 'rgba(17,17,17,0.95)',
    },
    canvas: {
      bgInner: '#ffffff', bgOuter: '#ffffff', grid: 'rgba(0,0,0,0.07)', gridMajor: 2, gridMajorColor: 'rgba(0,0,0,0.13)',
      line: 1.6, glow: 0, composite: 'source-over', tint: '#111111', mix: 0.85, vertexStroke: '#ffffff',
      selectHalo: 'rgba(227,6,19,0.18)', neg: '#111111', pos: '#e30613', fog: 0.55, axis: ['#e30613', '#111111', '#6b6b6b', '#e30613', '#111111', '#6b6b6b', '#e30613', '#111111', '#6b6b6b', '#e30613'],
      gizmoBg: 'rgba(255,255,255,0.9)', font: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    },
    palette: ['#111111', '#e30613', '#6b6b6b', '#111111', '#e30613', '#9a9a9a', '#111111', '#e30613'],
  },
  {
    // Terminal: green phosphor CRT
    id: 'terminal',
    dark: true,
    css: {
      '--bg': '#050a05', '--bg2': '#0a120a', '--panel': 'rgba(8,16,8,0.92)', '--line': '#1d3a1d',
      '--text': '#b8f5b0', '--muted': '#5f9a58', '--accent': '#39ff14', '--accent2': '#ffb000', '--danger': '#ff5f56',
      '--on-bg': 'rgba(57,255,20,0.12)', '--hover': '#39ff14', '--font': MONO, '--font-head': MONO, '--radius': '0px',
      '--canvas-bg': 'radial-gradient(ellipse at 50% 50%, #0c1a0c 0%, #050a05 80%)', '--badge-glow': 'rgba(57,255,20,0.6)',
      '--letter': '0.02em', '--head-transform': 'uppercase', '--toast-bg': 'rgba(5,10,5,0.95)',
    },
    canvas: {
      bgInner: '#0c1a0c', bgOuter: '#050a05', grid: 'rgba(57,255,20,0.07)', gridMajor: 0, gridMajorColor: '',
      line: 1.15, glow: 5, composite: 'lighter', tint: '#39ff14', mix: 0.82, vertexStroke: '#050a05',
      selectHalo: 'rgba(255,176,0,0.14)', neg: '#1fbf3f', pos: '#ffb000', fog: 0.3, axis: ['#39ff14', '#ffb000', '#8cff7a', '#39ff14', '#ffb000', '#8cff7a', '#39ff14', '#ffb000', '#8cff7a', '#39ff14'],
      gizmoBg: 'rgba(0,0,0,0.5)', font: MONO,
    },
    palette: ['#39ff14', '#ffb000', '#8cff7a', '#00e5a0', '#c6ff00', '#ffd866', '#39ff14', '#ffb000'],
  },
  {
    // Sunset: indigo dusk sky, coral and gold
    id: 'sunset',
    dark: true,
    css: {
      '--bg': '#1b1430', '--bg2': '#241a3d', '--panel': 'rgba(36,26,61,0.88)', '--line': '#43335f',
      '--text': '#fdeee4', '--muted': '#bfa5b8', '--accent': '#ff8a5b', '--accent2': '#ffc86b', '--danger': '#ff5d73',
      '--on-bg': 'rgba(255,138,91,0.18)', '--hover': '#ff8a5b', '--font': SANS, '--font-head': SANS, '--radius': '12px',
      '--canvas-bg': 'linear-gradient(180deg, #1b1430 0%, #3a1f4d 45%, #a24a5f 85%, #f08a5d 100%)', '--badge-glow': 'rgba(255,138,91,0.5)',
      '--letter': '0.01em', '--head-transform': 'none', '--toast-bg': 'rgba(27,20,48,0.94)',
    },
    canvas: {
      bgInner: '#3a1f4d', bgOuter: '#1b1430', grid: 'rgba(255,200,107,0.08)', gridMajor: 0, gridMajorColor: '',
      line: 1.4, glow: 2, composite: 'source-over', tint: '#fff1e0', mix: 0.2, vertexStroke: '#1b1430',
      selectHalo: 'rgba(255,200,107,0.16)', neg: '#7a6cff', pos: '#ffc86b', fog: 0.35, axis: ['#ff8a5b', '#ffc86b', '#c58bff', '#ff5d73', '#7ad7f0', '#fdeee4', '#ff8a5b', '#ffc86b', '#c58bff', '#ff5d73'],
      gizmoBg: 'rgba(27,20,48,0.55)', font: SANS,
    },
    palette: ['#ff8a5b', '#ffc86b', '#c58bff', '#ff5d73', '#7ad7f0', '#fdeee4', '#f2a6c8', '#ffd9a8'],
  },
];

export const themeById = (id: string): Theme => THEMES.find((t) => t.id === id) ?? THEMES[0];

/** Apply CSS variables + `data-theme` to the document. */
export function applyThemeCss(th: Theme): void {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(th.css)) root.style.setProperty(k, v);
  root.dataset.theme = th.id;
  root.style.colorScheme = th.dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', th.css['--bg2']);
}

function hexToRgb(h: string): [number, number, number] {
  const m = h.replace('#', '');
  const v = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Shape colour as drawn in this theme (mixed towards the theme's ink / light colour). */
export function themedRgb(hex: string, st: CanvasStyle): [number, number, number] {
  const c = hexToRgb(hex);
  if (st.mix <= 0) return c;
  const t = hexToRgb(st.tint);
  return [0, 1, 2].map((i) => Math.round(c[i] * (1 - st.mix) + t[i] * st.mix)) as [number, number, number];
}

export const rgbOf = hexToRgb;
