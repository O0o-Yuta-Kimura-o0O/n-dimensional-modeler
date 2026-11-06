import type { Vec } from '../core/linalg';
import { add, identity, matMul, planeRotation, scale as vscale, solve2, zeros } from '../core/linalg';
import type { Shape } from '../core/shape';
import { cloneShape, mergeShapes, nextColor, padShape, rotateShape, scaleShape, shapeCenter, translateShape, usedDim } from '../core/shape';
import type { PrimitiveKind } from '../core/primitives';
import { PRIMITIVES, makePrimitive } from '../core/primitives';
import type { BoolOp } from '../core/polytope';
import { booleanShapes } from '../core/polytope';
import type { PhysicsKind } from '../core/physics';
import { PHYSICS, PHYSICS_DIM, makePhysics } from '../core/physics';
import type { SliceJob } from '../core/sliceWorker';
import type { DrawItem, Projected } from '../render/view';
import { Projector, axisName, render } from '../render/view';
import type { Key } from '../i18n';
import { LANGS, getLang, onLangChange, setLang, t, translateDom } from '../i18n';
import type { AppState } from './state';
import { defaultRotation, ensureStorage, fitRotationToDim, initialState } from './state';

const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
const STORE_KEY = 'ndm.scene.v0';
const MAX_VERTS = 20000;

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

const GLYPH: Record<PrimitiveKind | PhysicsKind, string> = {
  point: '•', simplex: '△', hypercube: '□', orthoplex: '◇', polygon: '⬡', prism: '⬢',
  pyramid: '▲', duoprism: '⊞', cell24: '✳', sphere: '○',
  lightcone: '⧗', hopf: '◎', calabiyau: '❀', quasicrystal: '✦', e8: '✺', string10: '≋',
};

type SliceGeo = { verts: Vec[]; edges: [number, number][] };

export class App {
  S: AppState = initialState();
  canvas = $<HTMLCanvasElement>('view');
  ctx = this.canvas.getContext('2d')!;
  dpr = 1;
  W = 0;
  H = 0;
  projector!: Projector;
  /** what was drawn last frame (for picking) */
  drawn: { shapeId: string; verts: Vec[]; edges: [number, number][]; screen: Projected[]; editable: boolean }[] = [];
  undoStack: string[] = [];
  redoStack: string[] = [];
  dirty = true;
  sliceCache = new Map<string, SliceGeo>();
  /** last finished slice per shape – shown while a new one is being computed */
  lastSlice = new Map<string, SliceGeo>();
  sliceQueue: SliceJob[] = [];
  slicePending = new Set<string>();
  sliceBusy: string | null = null;
  sliceWorker: Worker | null = null;
  saveTimer = 0;

  constructor() {
    this.load();
    this.buildStaticUi();
    onLangChange(() => this.refreshTexts());
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.bindPointer();
    this.bindKeys();
    this.refreshAll();
    const loop = () => {
      if (this.S.autoRotate) this.autoStep();
      if (this.dirty) this.draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ───────────────────────────── persistence / history
  serialize(): string {
    const S = this.S;
    return JSON.stringify({
      app: 'n-dimensional-modeler',
      version: VERSION,
      dim: S.dim,
      maxDim: S.maxDim,
      N: S.N,
      shapes: S.shapes,
    });
  }

  applyScene(json: string, keepView = false): boolean {
    try {
      const o = JSON.parse(json);
      if (!o || !Array.isArray(o.shapes)) return false;
      const S = this.S;
      S.maxDim = Math.max(1, Math.min(20, o.maxDim ?? 10));
      ensureStorage(S, Math.max(o.N ?? 10, S.maxDim));
      S.shapes = (o.shapes as Shape[]).filter((s) => Array.isArray(s.verts));
      for (const s of S.shapes) padShape(s, S.N);
      if (!keepView) {
        S.dim = Math.max(0, Math.min(S.maxDim, o.dim ?? 3));
        fitRotationToDim(S);
      }
      S.selected = S.selected.filter((id) => S.shapes.some((s) => s.id === id));
      this.touch();
      return true;
    } catch {
      return false;
    }
  }

  load(): void {
    try {
      const j = localStorage.getItem(STORE_KEY);
      if (j && this.applyScene(j)) return;
    } catch { /* ignore */ }
    // first start: a tesseract-ready scene
    const S = this.S;
    S.shapes.push(makePrimitive('hypercube', { dim: 3, p: 6, q: 4 }, nextColor(), S.N));
  }

  scheduleSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      try { localStorage.setItem(STORE_KEY, this.serialize()); } catch { /* quota */ }
    }, 400);
  }

  /** call BEFORE a mutation */
  snapshot(): void {
    this.undoStack.push(JSON.stringify(this.S.shapes));
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(JSON.stringify(this.S.shapes));
    this.S.shapes = JSON.parse(prev);
    this.afterHistory();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(JSON.stringify(this.S.shapes));
    this.S.shapes = JSON.parse(next);
    this.afterHistory();
  }

  afterHistory(): void {
    for (const s of this.S.shapes) padShape(s, this.S.N);
    this.S.selected = this.S.selected.filter((id) => this.S.shapes.some((s) => s.id === id));
    this.touch();
    this.refreshShapes();
  }

  /** geometry changed */
  touch(): void {
    this.S.rev++;
    this.resetSlices();
    this.dirty = true;
    this.scheduleSave();
  }

  // ───────────────────────────── UI construction
  buildStaticUi(): void {
    $('ver').textContent = `v${VERSION}`;
    const ls = $<HTMLSelectElement>('langSel');
    for (const [code, l] of Object.entries(LANGS)) {
      const o = document.createElement('option');
      o.value = code;
      o.textContent = l.name;
      ls.appendChild(o);
    }
    ls.value = getLang();
    ls.onchange = () => setLang(ls.value);

    const list = $('primList');
    for (const k of PRIMITIVES) {
      const b = document.createElement('button');
      b.dataset.prim = k;
      b.innerHTML = `<span class="glyph">${GLYPH[k]}</span><span class="nm"></span>`;
      b.onclick = () => this.addPrimitive(k);
      list.appendChild(b);
    }
    const phys = $('physList');
    for (const k of PHYSICS) {
      const b = document.createElement('button');
      b.dataset.phys = k;
      b.innerHTML = `<span class="glyph">${GLYPH[k]}</span><span class="nm"></span><span class="dimtag">${PHYSICS_DIM[k]}D</span>`;
      b.onclick = () => this.addPhysics(k);
      phys.appendChild(b);
    }
    const inP = $<HTMLInputElement>('inP');
    const inQ = $<HTMLInputElement>('inQ');
    inP.onchange = () => { this.S.p = clampInt(inP.value, 3, 64, 6); inP.value = String(this.S.p); };
    inQ.onchange = () => { this.S.q = clampInt(inQ.value, 3, 64, 4); inQ.value = String(this.S.q); };

    // dimension
    const ds = $<HTMLInputElement>('dimSlider');
    ds.oninput = () => this.setDim(Number(ds.value));
    const md = $<HTMLInputElement>('maxDim');
    md.onchange = () => this.setMaxDim(clampInt(md.value, 1, 20, 10));

    // tools
    $('segTool').querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.onclick = () => { this.S.tool = b.dataset.tool as AppState['tool']; this.refreshTools(); this.dirty = true; };
    });
    $('tMulti').onclick = () => { this.S.multi = !this.S.multi; this.refreshTools(); };
    document.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach((b) => {
      b.onclick = () => this.togglePanel(b.dataset.panel!);
    });
    document.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((b) => {
      b.onclick = () => this.togglePanel(b.dataset.close!, false);
    });
    if (window.innerWidth > 900) { this.togglePanel('panelAdd', true); this.togglePanel('panelShapes', true); }

    $<HTMLSelectElement>('axisSel').onchange = (e) => { this.S.axisLock = Number((e.target as HTMLSelectElement).value); };
    $<HTMLSelectElement>('rotSel').onchange = (e) => { this.S.rotAxis = Number((e.target as HTMLSelectElement).value); };

    // view settings
    $('segMode').querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.onclick = () => { this.S.mode = b.dataset.mode as AppState['mode']; this.refreshView(); this.dirty = true; };
    });
    $('segProj').querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.onclick = () => { this.S.view.perspective = b.dataset.proj === 'persp'; this.refreshView(); this.dirty = true; };
    });
    const so = $<HTMLInputElement>('sliceOff');
    so.oninput = () => {
      if (this.S.dim < this.S.N) this.S.sliceOffset[this.S.dim] = Number(so.value);
      this.resetSlices();
      this.dirty = true;
    };
    const bindChk = (id: string, get: () => boolean, set: (v: boolean) => void) => {
      const c = $<HTMLInputElement>(id);
      c.checked = get();
      c.onchange = () => { set(c.checked); this.dirty = true; };
    };
    bindChk('chkVerts', () => this.S.view.showVertices, (v) => (this.S.view.showVertices = v));
    bindChk('chkDepth', () => this.S.view.colorDepth, (v) => (this.S.view.colorDepth = v));
    bindChk('chkAxes', () => this.S.view.showAxes, (v) => (this.S.view.showAxes = v));
    bindChk('chkAuto', () => this.S.autoRotate, (v) => (this.S.autoRotate = v));
    $('btnResetView').onclick = () => {
      const v = this.S.view;
      v.R = defaultRotation(this.S.N);
      fitRotationToDim(this.S);
      v.zoom = 1; v.panX = 0; v.panY = 0;
      this.dirty = true;
    };

    // top bar
    $('btnUndo').onclick = () => this.undo();
    $('btnRedo').onclick = () => this.redo();
    $('btnHelp').onclick = () => $<HTMLDialogElement>('helpDlg').showModal();
    const fm = $('fileMenu');
    $('btnFile').onclick = (e) => { e.stopPropagation(); fm.hidden = !fm.hidden; };
    document.addEventListener('click', () => { fm.hidden = true; });
    $('btnExport').onclick = () => this.exportScene();
    $('btnImport').onclick = () => $<HTMLInputElement>('fileIn').click();
    $<HTMLInputElement>('fileIn').onchange = (e) => this.importScene(e);
    $('btnNew').onclick = () => {
      if (!confirm(t('confirmClear'))) return;
      this.snapshot();
      this.S.shapes = [];
      this.S.selected = [];
      this.touch();
      this.refreshShapes();
    };

    // selection panel
    $('rotMinus').onclick = () => this.rotateSelected(-1);
    $('rotPlus').onclick = () => this.rotateSelected(1);
    $('scUp').onclick = () => this.scaleSelected(1.1, -1);
    $('scDown').onclick = () => this.scaleSelected(1 / 1.1, -1);
    $('stUp').onclick = () => this.scaleSelected(1.1, Number($<HTMLSelectElement>('stretchAxis').value));
    $('stDown').onclick = () => this.scaleSelected(1 / 1.1, Number($<HTMLSelectElement>('stretchAxis').value));
    const ci = $<HTMLInputElement>('colorIn');
    ci.onfocus = () => this.snapshot();
    ci.oninput = () => { for (const s of this.selShapes()) s.color = ci.value; this.touch(); this.refreshShapeList(); };
    $('btnDup').onclick = () => this.duplicateSelected();
    $('btnDel').onclick = () => this.deleteSelected();
    $('btnDeselect').onclick = () => { this.S.selected = []; this.refreshShapes(); this.dirty = true; };
    $('bUnion').onclick = () => this.doBoolean('union');
    $('bInter').onclick = () => this.doBoolean('intersect');
    $('bSub').onclick = () => this.doBoolean('subtract');
    $('bMerge').onclick = () => this.doMerge();
  }

  togglePanel(id: string, force?: boolean): void {
    const p = $(id);
    const open = force ?? !p.classList.contains('open');
    if (open && window.innerWidth <= 760) document.querySelectorAll('.panel.open').forEach((o) => o !== p && o.classList.remove('open'));
    p.classList.toggle('open', open);
    document.querySelectorAll<HTMLButtonElement>(`[data-panel="${id}"]`).forEach((b) => b.classList.toggle('on', open));
  }

  refreshAll(): void {
    this.refreshTexts();
    this.refreshDim();
    this.refreshTools();
    this.refreshView();
    this.refreshShapes();
  }

  refreshTexts(): void {
    translateDom();
    document.title = `${t('appTitle')} v${VERSION}`;
    $('primList').querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.querySelector('.nm')!.textContent = t(`prim_${b.dataset.prim}` as Key);
    });
    $('physList').querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.querySelector('.nm')!.textContent = t(`prim_${b.dataset.phys}` as Key);
      b.title = t(`desc_${b.dataset.phys}` as Key);
    });
    this.refreshDim();
    this.refreshShapes();
  }

  refreshDim(): void {
    const S = this.S;
    const ds = $<HTMLInputElement>('dimSlider');
    ds.max = String(S.maxDim);
    ds.value = String(S.dim);
    $('dimOut').textContent = String(S.dim);
    $('dimBig').textContent = String(S.dim);
    $<HTMLInputElement>('maxDim').value = String(S.maxDim);
    $('createNote').textContent = t('createIn', { d: S.dim });
    const used = S.shapes.reduce((m, s) => Math.max(m, usedDim(s)), 0);
    $('hudInfo').textContent = used > S.dim ? t('hiddenInfo', { d: S.dim }) : '';

    // axis selectors
    const axisOpts = (sel: HTMLSelectElement, n: number, extra?: [string, string]) => {
      const prev = sel.value;
      sel.innerHTML = '';
      if (extra) sel.add(new Option(extra[1], extra[0]));
      for (let i = 0; i < n; i++) sel.add(new Option(axisName(i), String(i)));
      if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
    };
    const lock = $<HTMLSelectElement>('axisSel');
    axisOpts(lock, S.maxDim, ['-1', t('free')]);
    lock.value = String(S.axisLock < S.maxDim ? S.axisLock : -1);
    S.axisLock = Number(lock.value);
    const rot = $<HTMLSelectElement>('rotSel');
    rot.innerHTML = '';
    rot.add(new Option(t('rot3d'), '-1'));
    for (let i = 3; i < S.dim; i++) rot.add(new Option(t('rotHyper', { axis: axisName(i) }), String(i)));
    if (S.rotAxis >= S.dim) S.rotAxis = -1;
    rot.value = String(S.rotAxis);
    const ra = $<HTMLSelectElement>('rotA');
    const rb = $<HTMLSelectElement>('rotB');
    axisOpts(ra, Math.max(2, S.dim));
    axisOpts(rb, Math.max(2, S.dim));
    if (!ra.value || Number(ra.value) >= Math.max(2, S.dim)) ra.value = '0';
    if (!rb.value || rb.value === ra.value) rb.value = ra.value === '1' ? '0' : '1';
    axisOpts($<HTMLSelectElement>('stretchAxis'), S.maxDim);
    // primitive availability
    $('primList').querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      const k = b.dataset.prim as PrimitiveKind;
      b.disabled = this.estimateVerts(k) > MAX_VERTS;
    });
    this.refreshView();
  }

  refreshTools(): void {
    $('segTool').querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.classList.toggle('on', b.dataset.tool === this.S.tool));
    $('tMulti').classList.toggle('on', this.S.multi);
  }

  refreshView(): void {
    const S = this.S;
    $('segMode').querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.classList.toggle('on', b.dataset.mode === S.mode));
    $('segProj').querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.classList.toggle('on', (b.dataset.proj === 'persp') === S.view.perspective));
    const sliceRow = $('sliceRow');
    const showSlice = S.mode === 'slice' && S.dim < S.N;
    sliceRow.style.display = showSlice ? '' : 'none';
    if (showSlice) {
      $('sliceLabel').textContent = t('sliceOffset', { axis: axisName(S.dim) });
      $<HTMLInputElement>('sliceOff').value = String(S.sliceOffset[S.dim] ?? 0);
    }
  }

  refreshShapes(): void {
    this.refreshShapeList();
    const sel = this.selShapes();
    $('selBox').hidden = sel.length === 0;
    if (sel.length) $<HTMLInputElement>('colorIn').value = sel[sel.length - 1].color;
    const used = this.S.shapes.reduce((m, s) => Math.max(m, usedDim(s)), 0);
    $('hudInfo').textContent = used > this.S.dim ? t('hiddenInfo', { d: this.S.dim }) : '';
  }

  shapeName(s: Shape): string {
    const base = s.kind in GLYPH ? t(`prim_${s.kind}` as Key) : t(`kind_${s.kind}` as Key);
    return s.label ? `${base} ${s.label}` : base;
  }

  refreshShapeList(): void {
    const ul = $('shapeList');
    ul.innerHTML = '';
    if (this.S.shapes.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = t('noShapes');
      ul.appendChild(li);
      return;
    }
    for (const s of this.S.shapes) {
      const li = document.createElement('li');
      const si = this.S.selected.indexOf(s.id);
      if (si >= 0) li.classList.add('sel');
      const sw = document.createElement('span');
      sw.className = 'sw';
      sw.style.background = s.color;
      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = this.shapeName(s);
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = `${s.verts.length}v`;
      li.append(sw, nm);
      if (si >= 0 && this.S.selected.length > 1) {
        const b = document.createElement('span');
        b.className = 'badge';
        b.textContent = String.fromCharCode(65 + si);
        li.append(b);
      }
      li.append(meta);
      const eye = document.createElement('button');
      eye.className = 'eye';
      eye.textContent = s.visible ? '◉' : '○';
      eye.title = t('visible');
      eye.onclick = (e) => { e.stopPropagation(); s.visible = !s.visible; this.touch(); this.refreshShapeList(); };
      li.append(eye);
      li.onclick = () => this.selectShape(s.id, this.S.multi);
      ul.appendChild(li);
    }
  }

  toast(msg: string, ms = 2400): void {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout((el as unknown as { _t: number })._t);
    (el as unknown as { _t: number })._t = window.setTimeout(() => el.classList.remove('show'), ms);
  }

  // ───────────────────────────── dimension
  setDim(d: number): void {
    const S = this.S;
    S.dim = Math.max(0, Math.min(S.maxDim, d));
    ensureStorage(S, S.maxDim);
    fitRotationToDim(S);
    this.resetSlices();
    this.refreshDim();
    this.dirty = true;
  }

  setMaxDim(m: number): void {
    const S = this.S;
    S.maxDim = m;
    ensureStorage(S, m);
    if (S.dim > m) S.dim = m;
    fitRotationToDim(S);
    this.refreshDim();
    this.scheduleSave();
    this.dirty = true;
  }

  // ───────────────────────────── shapes
  estimateVerts(k: PrimitiveKind): number {
    const n = this.S.dim;
    const p = this.S.p;
    const q = this.S.q;
    switch (k) {
      case 'hypercube': return 2 ** n;
      case 'prism': return p * 2 ** Math.max(0, n - 2);
      case 'pyramid': return p * 2 ** Math.max(0, n - 3) + 1;
      case 'duoprism': return p * q * 2 ** Math.max(0, n - 4);
      case 'orthoplex': return n > 16 ? Infinity : 2 * n;
      case 'sphere': return 48 * ((n * (n - 1)) / 2 + 4 * Math.max(0, n - 2));
      default: return n + 1;
    }
  }

  addPrimitive(k: PrimitiveKind): void {
    const n = this.estimateVerts(k);
    if (n > MAX_VERTS) { this.toast(t('tooBig', { n })); return; }
    this.snapshot();
    const s = makePrimitive(k, { dim: this.S.dim, p: this.S.p, q: this.S.q }, nextColor(), this.S.N);
    padShape(s, this.S.N);
    this.S.shapes.push(s);
    if (this.S.multi) this.S.selected.push(s.id);
    else this.S.selected = [s.id];
    this.touch();
    this.refreshShapes();
    this.refreshDim();
    if (window.innerWidth <= 760) this.togglePanel('panelAdd', false);
  }

  /** Physics sample: switches to its native dimension and a fitting view. */
  addPhysics(k: PhysicsKind): void {
    const S = this.S;
    const dim = PHYSICS_DIM[k];
    if (dim > S.maxDim) S.maxDim = dim;
    ensureStorage(S, Math.max(S.maxDim, dim));
    this.snapshot();
    const s = makePhysics(k, nextColor(), S.N);
    padShape(s, S.N);
    S.shapes.push(s);
    if (S.multi) S.selected.push(s.id);
    else S.selected = [s.id];
    S.dim = dim;
    if (k === 'e8') {
      // the Petrie projection lives in the x–y plane: look straight at it
      S.view.R = identity(S.N);
      S.view.perspective = false;
    } else {
      S.view.R = defaultRotation(S.N);
      S.view.perspective = k !== 'quasicrystal';
      // light cone: put time (w) on the screen's vertical axis, like the textbook picture
      if (k === 'lightcone') S.view.R = matMul(S.view.R, planeRotation(S.N, 1, 3, Math.PI / 2));
    }
    S.view.zoom = k === 'string10' ? 0.5 : 1;
    S.view.panX = 0;
    S.view.panY = 0;
    fitRotationToDim(S);
    this.touch();
    this.refreshDim();
    this.refreshView();
    this.refreshShapes();
    this.toast(t(`desc_${k}` as Key), 9000);
    if (window.innerWidth <= 760) this.togglePanel('panelAdd', false);
  }

  selShapes(): Shape[] {
    return this.S.selected.map((id) => this.S.shapes.find((s) => s.id === id)).filter((s): s is Shape => !!s);
  }

  selectShape(id: string | null, additive: boolean): void {
    const S = this.S;
    if (!id) { if (!additive) S.selected = []; }
    else if (additive) {
      const i = S.selected.indexOf(id);
      if (i >= 0) S.selected.splice(i, 1);
      else S.selected.push(id);
    } else S.selected = [id];
    this.refreshShapes();
    this.dirty = true;
  }

  rotateSelected(sign: number): void {
    const sel = this.selShapes();
    if (!sel.length) { this.toast(t('needOne')); return; }
    const a = Number($<HTMLSelectElement>('rotA').value);
    const b = Number($<HTMLSelectElement>('rotB').value);
    if (a === b) return;
    this.snapshot();
    for (const s of sel) rotateShape(s, a, b, (sign * Math.PI) / 12, this.S.N);
    this.touch();
  }

  scaleSelected(f: number, axis: number): void {
    const sel = this.selShapes();
    if (!sel.length) { this.toast(t('needOne')); return; }
    this.snapshot();
    for (const s of sel) scaleShape(s, f, this.S.N, axis);
    this.touch();
    this.refreshDim();
  }

  duplicateSelected(): void {
    const sel = this.selShapes();
    if (!sel.length) return;
    this.snapshot();
    const ids: string[] = [];
    for (const s of sel) {
      const c = cloneShape(s);
      c.color = nextColor();
      const d = zeros(this.S.N);
      d[0] = 0.3;
      translateShape(c, d);
      this.S.shapes.push(c);
      ids.push(c.id);
    }
    this.S.selected = ids;
    this.touch();
    this.refreshShapes();
  }

  deleteSelected(): void {
    if (!this.S.selected.length) return;
    this.snapshot();
    this.S.shapes = this.S.shapes.filter((s) => !this.S.selected.includes(s.id));
    this.S.selected = [];
    this.touch();
    this.refreshShapes();
    this.refreshDim();
  }

  doBoolean(op: BoolOp): void {
    const sel = this.selShapes();
    if (sel.length !== 2) { this.toast(t('needTwo')); return; }
    const [a, b] = sel;
    if (!a.cells || !b.cells) { this.toast(t('needSolid')); return; }
    const D = Math.max(1, usedDim(a), usedDim(b));
    this.toast('…');
    setTimeout(() => {
      const r = booleanShapes(op, a, b, D, a.color);
      if (!r) { this.toast(t('emptyResult')); return; }
      padShape(r, this.S.N);
      this.snapshot();
      const idx = this.S.shapes.indexOf(a);
      this.S.shapes = this.S.shapes.filter((s) => s !== a && s !== b);
      this.S.shapes.splice(Math.min(idx, this.S.shapes.length), 0, r);
      this.S.selected = [r.id];
      this.touch();
      this.refreshShapes();
      this.toast(`${t(`kind_${op}` as Key)} · ${t('stats', { v: r.verts.length, e: r.edges.length })}`);
    }, 30);
  }

  doMerge(): void {
    const sel = this.selShapes();
    if (sel.length < 2) { this.toast(t('needTwo')); return; }
    this.snapshot();
    const m = mergeShapes(sel, sel[0].color);
    const idx = this.S.shapes.indexOf(sel[0]);
    this.S.shapes = this.S.shapes.filter((s) => !sel.includes(s));
    this.S.shapes.splice(Math.min(idx, this.S.shapes.length), 0, m);
    this.S.selected = [m.id];
    this.touch();
    this.refreshShapes();
  }

  exportScene(): void {
    const blob = new Blob([this.serialize()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ndm-scene-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  importScene(e: Event): void {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    f.text().then((txt) => {
      this.snapshot();
      if (!this.applyScene(txt)) { this.undoStack.pop(); this.toast(t('importError')); return; }
      this.refreshAll();
    });
    input.value = '';
  }

  // ───────────────────────────── rendering
  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.W = r.width;
    this.H = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    this.dirty = true;
  }

  /** Forget all cross-sections (geometry, dimension or slice position changed). */
  resetSlices(): void {
    this.sliceCache.clear();
    this.sliceQueue = [];
    this.slicePending.clear();
    if (this.sliceBusy && this.sliceWorker) {
      // a stale heavy job is running: throw the worker away instead of waiting
      this.sliceWorker.terminate();
      this.sliceWorker = null;
    }
    this.sliceBusy = null;
  }

  ensureSliceWorker(): Worker {
    if (!this.sliceWorker) {
      this.sliceWorker = new Worker(new URL('../core/sliceWorker.ts', import.meta.url), { type: 'module' });
      this.sliceWorker.onmessage = (e: MessageEvent<SliceGeo & { key: string }>) => {
        const { key, verts, edges } = e.data;
        if (key === this.sliceBusy) {
          this.sliceCache.set(key, { verts, edges });
          this.lastSlice.set(key.split('|')[0], { verts, edges });
          this.slicePending.delete(key);
          this.sliceBusy = null;
          this.dirty = true;
          this.pumpSlices();
        }
      };
    }
    return this.sliceWorker;
  }

  pumpSlices(): void {
    if (this.sliceBusy) return;
    const job = this.sliceQueue.shift();
    $('hud').classList.toggle('busy', !!job);
    if (!job) return;
    this.sliceBusy = job.key;
    this.ensureSliceWorker().postMessage(job);
  }

  geometryFor(s: Shape): { verts: Vec[]; edges: [number, number][]; editable: boolean } {
    const S = this.S;
    if (S.mode === 'slice' && S.dim < usedDim(s)) {
      if (!s.cells) return { verts: [], edges: [], editable: false };
      const D = Math.max(usedDim(s), S.dim);
      const key = `${s.id}|${S.rev}|${S.dim}|${S.sliceOffset.slice(0, D).join(',')}`;
      const g = this.sliceCache.get(key);
      if (g) return { ...g, editable: false };
      if (!this.slicePending.has(key)) {
        this.slicePending.add(key);
        this.sliceQueue.push({ key, shape: JSON.parse(JSON.stringify(s)), d: S.dim, D, offsets: S.sliceOffset.slice() });
        this.pumpSlices();
      }
      return { ...(this.lastSlice.get(s.id) ?? { verts: [], edges: [] }), editable: false };
    }
    return { verts: s.verts, edges: s.edges, editable: true };
  }

  draw(): void {
    this.dirty = false;
    const S = this.S;
    this.projector = new Projector(S.dim, S.view, this.W, this.H);
    const items: DrawItem[] = [];
    this.drawn = [];
    const multiSel = S.selected.length > 1;
    for (const s of S.shapes) {
      if (!s.visible) continue;
      const g = this.geometryFor(s);
      const si = S.selected.indexOf(s.id);
      items.push({
        verts: g.verts,
        edges: g.edges,
        color: s.color,
        selected: si >= 0,
        order: multiSel ? si : -1,
        dimmed: false,
        showVerts: S.view.showVertices || (S.tool === 'vertex' && g.editable),
      });
      this.drawn.push({ shapeId: s.id, verts: g.verts, edges: g.edges, screen: [], editable: g.editable });
    }
    const res = render(this.ctx, this.projector, items, this.dpr);
    res.screen.forEach((sc, i) => (this.drawn[i].screen = sc));
  }

  autoStep(): void {
    const S = this.S;
    const d = S.dim;
    if (d < 2) return;
    const rot = (i: number, j: number, a: number) => this.rotateView(i, j, a);
    if (d === 2) rot(0, 1, 0.004);
    else {
      rot(0, 2, 0.003);
      for (let k = 3; k < d; k++) rot(k % 3, k, 0.004 + 0.001 * (k - 3));
    }
  }

  rotateView(i: number, j: number, a: number): void {
    const S = this.S;
    if (i >= S.dim || j >= S.dim) return;
    const G = planeRotation(S.N, i, j, a);
    S.view.R = matMul(G, S.view.R);
    this.dirty = true;
  }

  // ───────────────────────────── picking
  pickVertex(x: number, y: number, preferSelected: boolean): { shapeId: string; index: number } | null {
    let best: { shapeId: string; index: number } | null = null;
    let bd = 18 * 18;
    for (const d of this.drawn) {
      if (!d.editable) continue;
      const bonus = preferSelected && this.S.selected.includes(d.shapeId) ? 0.5 : 1;
      d.screen.forEach((p, i) => {
        const dd = ((p.x - x) ** 2 + (p.y - y) ** 2) * bonus;
        if (dd < bd) { bd = dd; best = { shapeId: d.shapeId, index: i }; }
      });
    }
    return best;
  }

  pickShape(x: number, y: number): string | null {
    let best: string | null = null;
    let bd = 12;
    for (const d of this.drawn) {
      for (const [a, b] of d.edges) {
        const pa = d.screen[a];
        const pb = d.screen[b];
        if (!pa || !pb) continue;
        const dist = segDist(x, y, pa.x, pa.y, pb.x, pb.y);
        if (dist < bd) { bd = dist; best = d.shapeId; }
      }
      if (d.edges.length === 0) for (const p of d.screen) {
        const dist = Math.hypot(p.x - x, p.y - y);
        if (dist < bd) { bd = dist; best = d.shapeId; }
      }
    }
    return best;
  }

  /** Convert a screen-space drag (px) at world point x into a world displacement. */
  screenToWorldDelta(x: Vec, dx: number, dy: number): Vec | null {
    const S = this.S;
    const P = this.projector;
    const N = S.N;
    const d = S.dim;
    const eps = 1e-3;
    const p0 = P.project(x);
    const jac = (u: Vec): [number, number] => {
      const p1 = P.project(add(x, vscale(u, eps)));
      return [(p1.x - p0.x) / eps, (p1.y - p0.y) / eps];
    };
    if (S.axisLock >= 0) {
      const u = zeros(N);
      u[S.axisLock] = 1;
      const j = jac(u);
      const jj = j[0] * j[0] + j[1] * j[1];
      let tt: number;
      if (S.axisLock >= d || jj < 1e-4 * P.unit * P.unit) tt = (dx - dy) / P.unit; // hidden axis: drag right/up = +
      else tt = (j[0] * dx + j[1] * dy) / jj;
      return vscale(u, tt);
    }
    if (d === 0) return null;
    const R = S.view.R;
    const u0 = zeros(N);
    const u1 = zeros(N);
    for (let k = 0; k < d; k++) { u0[k] = R[0][k]; if (d >= 2) u1[k] = R[1][k]; }
    const j0 = jac(u0);
    if (d === 1) return vscale(u0, j0[0] !== 0 ? dx / j0[0] : 0);
    const j1 = jac(u1);
    const sol = solve2(j0[0], j1[0], j0[1], j1[1], dx, dy);
    if (!sol) return null;
    return add(vscale(u0, sol[0]), vscale(u1, sol[1]));
  }

  // ───────────────────────────── pointer handling
  bindPointer(): void {
    const c = this.canvas;
    const pointers = new Map<number, { x: number; y: number }>();
    type Drag =
      | { kind: 'rotate' }
      | { kind: 'pan' }
      | { kind: 'vertex'; shapeId: string; index: number }
      | { kind: 'shape'; ids: string[] }
      | { kind: 'pinch'; dist: number; cx: number; cy: number; zoom: number };
    let drag: Drag | null = null;
    let start = { x: 0, y: 0 };
    let last = { x: 0, y: 0 };
    let moved = false;
    let snap = false;
    const pos = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      const p = pos(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        drag = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, zoom: this.S.view.zoom };
        moved = true;
        return;
      }
      if (pointers.size > 2) return;
      start = p;
      last = p;
      moved = false;
      snap = false;
      const S = this.S;
      if (e.button === 2 || e.button === 1 || e.shiftKey) { drag = { kind: 'pan' }; return; }
      if (S.tool === 'vertex') {
        const v = this.pickVertex(p.x, p.y, true);
        if (v) { drag = { kind: 'vertex', ...v }; return; }
      }
      if (S.tool === 'move') {
        const id = this.pickShape(p.x, p.y);
        if (id) {
          if (!S.selected.includes(id)) this.selectShape(id, S.multi);
          drag = { kind: 'shape', ids: S.selected.slice() };
          return;
        }
      }
      drag = { kind: 'rotate' };
    });

    c.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      const p = pos(e);
      pointers.set(e.pointerId, p);
      if (!drag) return;
      const S = this.S;
      if (drag.kind === 'pinch') {
        if (pointers.size < 2) return;
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        S.view.zoom = clamp(drag.zoom * (dist / Math.max(1, drag.dist)), 0.1, 20);
        S.view.panX += cx - drag.cx;
        S.view.panY += cy - drag.cy;
        drag.cx = cx;
        drag.cy = cy;
        this.dirty = true;
        return;
      }
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      if (Math.hypot(p.x - start.x, p.y - start.y) > 4) moved = true;
      if (!moved) return;
      last = p;
      if (drag.kind === 'rotate') {
        const d = S.dim;
        if (d >= 3) {
          if (S.rotAxis >= 3) {
            this.rotateView(0, S.rotAxis, -dx * 0.01);
            this.rotateView(1, S.rotAxis, dy * 0.01);
          } else {
            this.rotateView(0, 2, -dx * 0.01);
            this.rotateView(1, 2, dy * 0.01);
          }
        } else if (d === 2) this.rotateView(0, 1, -dx * 0.01);
      } else if (drag.kind === 'pan') {
        S.view.panX += dx;
        S.view.panY += dy;
        this.dirty = true;
      } else if (drag.kind === 'vertex') {
        const sh = S.shapes.find((s) => s.id === (drag as { shapeId: string }).shapeId);
        if (!sh) return;
        const v = sh.verts[drag.index];
        const delta = this.screenToWorldDelta(v, dx, dy);
        if (!delta) return;
        if (!snap) { this.snapshot(); snap = true; }
        sh.verts[drag.index] = add(v, delta);
        this.touch();
      } else if (drag.kind === 'shape') {
        const shapes = drag.ids.map((id) => S.shapes.find((s) => s.id === id)).filter((s): s is Shape => !!s);
        if (!shapes.length) return;
        const delta = this.screenToWorldDelta(shapeCenter(shapes[0], S.N), dx, dy);
        if (!delta) return;
        if (!snap) { this.snapshot(); snap = true; }
        for (const s of shapes) translateShape(s, delta);
        this.touch();
      }
    });

    const end = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (drag?.kind === 'pinch') {
        if (pointers.size === 0) drag = null;
        else { drag = null; }
        return;
      }
      if (!moved && drag && drag.kind !== 'pan') {
        // tap = select
        const p = pos(e);
        const id = this.pickShape(p.x, p.y) ?? (this.pickVertex(p.x, p.y, false)?.shapeId ?? null);
        this.selectShape(id, this.S.multi || e.ctrlKey || e.metaKey);
      }
      if (snap) { this.refreshDim(); }
      drag = null;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = Math.exp(-e.deltaY * 0.0015);
      const r = c.getBoundingClientRect();
      const mx = e.clientX - r.left - this.W / 2 - this.S.view.panX;
      const my = e.clientY - r.top - this.H / 2 - this.S.view.panY;
      const z0 = this.S.view.zoom;
      const z1 = clamp(z0 * f, 0.1, 20);
      // zoom towards the cursor
      this.S.view.panX -= mx * (z1 / z0 - 1);
      this.S.view.panY -= my * (z1 / z0 - 1);
      this.S.view.zoom = z1;
      this.dirty = true;
    }, { passive: false });
  }

  bindKeys(): void {
    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); this.redo(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { this.deleteSelected(); return; }
      if (e.key === 'ArrowUp' || e.key === ']') { this.setDim(this.S.dim + 1); return; }
      if (e.key === 'ArrowDown' || e.key === '[') { this.setDim(this.S.dim - 1); return; }
      if (e.key === '1') { this.S.tool = 'view'; this.refreshTools(); }
      if (e.key === '2') { this.S.tool = 'move'; this.refreshTools(); }
      if (e.key === '3') { this.S.tool = 'vertex'; this.refreshTools(); this.dirty = true; }
      if (e.key === 'Escape') { this.S.selected = []; this.refreshShapes(); this.dirty = true; }
    });
  }
}

function clamp(x: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, x));
}

function clampInt(v: string, a: number, b: number, def: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? clamp(n, a, b) : def;
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const L = vx * vx + vy * vy;
  let tt = L > 0 ? ((px - ax) * vx + (py - ay) * vy) / L : 0;
  tt = clamp(tt, 0, 1);
  return Math.hypot(px - (ax + tt * vx), py - (ay + tt * vy));
}
