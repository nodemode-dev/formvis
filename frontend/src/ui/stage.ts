import { applyLut } from '../engine/colour-lut';
import { LUT3_N, viewLut3 } from '../engine/lut';
import { applyDuotoneLut, duotoneLut } from '../engine/duotone';
import { corners, createSurface, integral, intersectRect, sizeSurface, tracePath, translation, unionRect, type AlphaChannel, type Engine, type Pt, type Rect, type Surface } from '../engine';
import type { Project } from '../engine/project';
import { dialogTool } from '../extensions/dialog-tool';
import { getTool, type Tool, type ToolContext, type ToolPointer, type ViewInfo } from '../extensions/registry';
import { isMac, q, setHidden, setText } from './dom';
import { stickyModifiers } from './modifier-keys';
import { paint, type StagePaint } from './palette';
import type { DisplayLayer, ScreenDisplay } from '../gpu/display';
import { documentFallback } from '../gpu/fallback';
import { frameTrace, framePacing } from '../gpu/frame-trace';
import { LINE_DASH, loadPrefs, type LineStyle } from './prefs';

const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Ruler thickness in CSS pixels; the rulers lie over the stage's top and left edges, so showing them moves nothing. */
const RULER = 18;
const TILE_PX = 256;
/** Tools that draw the work path themselves; View > Show > Target Path draws it for the others. */
const PATH_TOOLS = new Set(['pen', 'curvaturePen', 'freeformPen', 'pathSelect', 'directSelect', 'convertPoint', 'path']);

import { drawSlices } from '../extensions/tools/slice';
import { extraShown, onExtras, selectionTintOn } from './view-extras';

export class Stage {
  readonly ctx: ToolContext;
  private readonly scene: HTMLCanvasElement;
  private readonly overlay: HTMLCanvasElement;
  private readonly rulerH: HTMLCanvasElement;
  private readonly rulerV: HTMLCanvasElement;
  private readonly sctx: CanvasRenderingContext2D;
  private readonly octx: CanvasRenderingContext2D;
  private readonly welcome: HTMLElement;
  private readonly work: Surface = createSurface(1, 1);
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private rect: DOMRect | null = null;
  private frame = 0;
  private wantScene = false;
  private wantOverlay = false;
  private phase = 0;
  private antsTimer = 0;
  private dragId: number | null = null;
  private panLast: Pt | null = null;
  private zoomDrag: { at: Pt; y: number; z0: number } | null = null;
  private space = false;
  private readonly bars: { h: HTMLElement; v: HTMLElement; ht: HTMLElement; vt: HTMLElement };
  private readonly pills: { zoom: HTMLElement; flip: HTMLElement; turn: HTMLElement; view: HTMLElement };
  /** Shared by every drag-based tool: near the stage's edge the view scrolls and the tool is told the new document point. */
  private edge: { ev: PointerEvent; timer: number } | null = null;
  private static readonly noEdgeTools = new Set(['hand', 'zoom']);
  private flickTrail: { t: number; x: number; y: number }[] = [];
  /** right-drag with these resizes the brush tip. */
  private static readonly brushTools = new Set(['brush', 'pencil', 'eraser', 'spotHealing', 'remove', 'cloneStamp', 'smear']);
  private tipDragging = false;
  /** The tool to return to when the stroke made with a pen's eraser end is over. */
  private penBack: Engine['tool'] | null = null;
  /** Cmd or Ctrl held on a press inside the selection moves its pixels from these tools (with Alt, a copy), as the Move tool does. */
  private static readonly pixelMoveTools = new Set(['marquee', 'lasso', 'objectSelect', 'wand', 'quickSelect', 'selectionBrush', 'brush', 'pencil', 'eraser', 'bucket', 'gradient', 'dodge', 'burn', 'sponge', 'smear', 'cloneStamp', 'spotHealing', 'healingBrush']);
  private pixelDrag: Pt | null = null;
  private cursor = '';
  private hover: ToolPointer | null = null;
  private checker: { key: string; pattern: CanvasPattern } | null = null;
  /** The GPU display (Phase 18.2b) when the chosen renderer is WebGPU; the scene canvas then draws only the edge and
   *  pixel grid, and a document the GPU path cannot draw yet falls back here, its reason reported through `gpuState`. */
  private readonly gpuCanvases: HTMLCanvasElement[];
  private gpu: ScreenDisplay | null = null;
  private gpuLimit = 0;
  private gpuState: ((reason: string | null) => void) | null = null;
  private gpuReason: string | null | undefined = undefined;
  private rgbCache = new Map<string, [number, number, number]>();
  /** A kept snapshot's picture drawn over the document on the overlay: whole while the Peek key is held, or as the right half of a split whose divider is dragged. */
  private cmp: { split: boolean; docId: string; surf: Surface; x: number } | null = null;
  private cmpCache: { key: string; surf: Surface } | null = null;
  private cmpDrag: number | null = null;

  constructor(private readonly host: HTMLElement, private readonly engine: Engine) {
    this.scene = q<HTMLCanvasElement>(host, '.cv-scene');
    this.gpuCanvases = Array.from(host.querySelectorAll<HTMLCanvasElement>('.cv-scene-gpu'));
    this.overlay = q<HTMLCanvasElement>(host, '.cv-overlay-canvas');
    this.rulerH = q<HTMLCanvasElement>(host, '.cv-ruler-h');
    this.rulerV = q<HTMLCanvasElement>(host, '.cv-ruler-v');
    for (const [r, axis] of [[this.rulerH, 'y'], [this.rulerV, 'x']] as const) this.bindRuler(r, axis);
    this.welcome = q(host, '.cv-welcome');
    const mk = (cls: string, text = ''): HTMLElement => { const n = document.createElement('div'); n.className = cls; if (text) n.textContent = text; n.hidden = true; host.appendChild(n); return n; };
    const bar = (axis: 'h' | 'v'): { track: HTMLElement; thumb: HTMLElement } => {
      const track = mk(`cv-sb cv-sb-${axis}`), thumb = document.createElement('div');
      thumb.className = 'cv-sb-thumb';
      track.appendChild(thumb);
      return { track, thumb };
    };
    const bh = bar('h'), bv = bar('v');
    this.bars = { h: bh.track, v: bv.track, ht: bh.thumb, vt: bv.thumb };
    this.bindBar(bh.track, bh.thumb, 'x');
    this.bindBar(bv.track, bv.thumb, 'y');
    const pillBox = mk('cv-pills');
    pillBox.hidden = false;
    const pill = (): HTMLElement => { const n = document.createElement('span'); n.className = 'cv-pill'; n.hidden = true; pillBox.appendChild(n); return n; };
    this.pills = { zoom: pill(), flip: pill(), turn: pill(), view: pill() };
    const s = this.scene.getContext('2d', { desynchronized: loadPrefs().lowLatency });
    const o = this.overlay.getContext('2d');
    if (!s || !o) throw new Error('2D canvas is unavailable');
    this.sctx = s;
    // A GPU reset (a lost device, a driver restart) also resets 2D canvases, which the browser renders through the
    // GPU process: their contents are gone when the context comes back, so everything is drawn again then.
    for (const c of [this.scene, this.overlay, this.rulerH, this.rulerV]) c.addEventListener('contextrestored', () => this.queue(true, true));
    this.octx = o;
    this.ctx = { engine, view: () => this.viewInfo(), paint: () => paint(), antsPhase: () => this.phase };
    new ResizeObserver(() => this.resize()).observe(host);
    window.addEventListener('resize', () => this.resize());
    engine.on('render', (region) => this.queue(true, true, region));
    for (const k of ['viewport', 'active', 'projects'] as const) engine.on(k, () => { this.turn(); this.queue(true, true); });
    for (const k of ['overlay', 'doc'] as const) engine.on(k, () => this.turn());   // Pixel Aspect Ratio Correction or the ratio changed (35.4c); a style compare when nothing did
    for (const k of ['overlay', 'options'] as const) engine.on(k, () => this.queue(false, true));
    onExtras(() => { this.queue(false, true); this.syncAnts(); });
    engine.on('projects', () => { this.queue(true, true); this.syncAnts(); this.syncWelcome(); this.updateCursor(); });
    engine.on('selection', () => { this.queue(false, true); this.syncAnts(); });
    engine.on('tool', () => { this.queue(false, true); this.updateCursor(); });
    for (const k of ['viewport', 'active', 'projects', 'doc', 'options'] as const) engine.on(k, () => this.syncChrome());
    this.bindTouch();   // 1.58.6: before the tools' handling, so a gesture's fingers never reach them
    this.bindDivider();
    for (const k of ['history', 'active', 'projects'] as const) engine.on(k, () => { this.cmpCache = null; if (this.cmp && this.cmp.docId !== this.engine.current?.doc.id) this.compare(null); });
    this.bindPointer();
    this.syncWelcome();
    this.resize();
  }

  /** A canvas scrollbar's thumb as fractions of the track: the document plus half a view of overscroll each side is the scroll range. */
  static barSpan(pan: number, size: number, docPx: number, flip: boolean): { a: number; len: number } {
    const content = Math.max(1, docPx + size), len = Math.min(1, size / content);
    const a = (-pan + size / 2) / content;
    return { a: Math.min(1 - len, Math.max(0, flip ? 1 - a - len : a)), len };
  }

  /** Scrollbars (when turned on), and the status pills over the canvas: patched in place. */
  private syncChrome(): void {
    const p = this.engine.current, v = p?.viewport;
    const on = !!p && !!v && this.engine.canvasScrollbars && !v.rotation;
    setHidden(this.bars.h, !on);
    setHidden(this.bars.v, !on);
    if (p && v && on) {
      const h = Stage.barSpan(v.panX, this.cssW, p.doc.width * v.zoom, v.flipped), w = Stage.barSpan(v.panY, this.cssH, p.doc.height * v.zoom, false);
      const hw = `${Math.round(h.len * this.cssW)}px`, hx = `translateX(${Math.round(h.a * this.cssW)}px)`, vh = `${Math.round(w.len * this.cssH)}px`, vy = `translateY(${Math.round(w.a * this.cssH)}px)`;
      if (this.bars.ht.style.width !== hw) this.bars.ht.style.width = hw;
      if (this.bars.ht.style.transform !== hx) this.bars.ht.style.transform = hx;
      if (this.bars.vt.style.height !== vh) this.bars.vt.style.height = vh;
      if (this.bars.vt.style.transform !== vy) this.bars.vt.style.transform = vy;
    }
    const pl = this.pills, e = this.engine;
    setHidden(pl.zoom, !p);
    if (p && v) setText(pl.zoom, `${Math.round(v.zoom * 10000) / 100}%`);
    setHidden(pl.flip, !v?.flipped);
    if (v?.flipped) setText(pl.flip, 'Flipped');
    setHidden(pl.turn, !v?.rotation);
    if (v?.rotation) setText(pl.turn, `${Math.round(v.rotation * 10) / 10} deg`);
    const modes = [e.viewTransform ? 'Proof' : '', e.view.patternPreview ? 'Pattern' : '', e.view.pixelArt ? 'Pixel Art' : ''].filter(Boolean).join(' ');
    setHidden(pl.view, !modes);
    if (modes) setText(pl.view, modes);
  }

  /** A scrollbar thumb drags the view; a press on the track pages it. */
  private bindBar(track: HTMLElement, thumb: HTMLElement, axis: 'x' | 'y'): void {
    let drag: { id: number; at: number } | null = null;
    const geometry = (): { size: number; content: number; sign: number } | null => {
      const p = this.engine.current;
      if (!p) return null;
      const size = axis === 'x' ? this.cssW : this.cssH, content = (axis === 'x' ? p.doc.width : p.doc.height) * p.viewport.zoom + size;
      return { size, content, sign: axis === 'x' && p.viewport.flipped ? -1 : 1 };
    };
    const move = (d: number): void => this.engine.pan(axis === 'x' ? d : 0, axis === 'y' ? d : 0);
    track.addEventListener('pointerdown', (e) => {
      const g = geometry();
      if (!g || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      this.engine.stopFlick();
      if (e.target === thumb) { thumb.setPointerCapture(e.pointerId); drag = { id: e.pointerId, at: axis === 'x' ? e.clientX : e.clientY }; return; }
      const t = thumb.getBoundingClientRect(), before = axis === 'x' ? e.clientX < t.left : e.clientY < t.top;
      move((before ? 1 : -1) * g.sign * g.size * 0.9);
    });
    thumb.addEventListener('pointermove', (e) => {
      const g = geometry();
      if (!drag || drag.id !== e.pointerId || !g) return;
      const at = axis === 'x' ? e.clientX : e.clientY;
      move(-((at - drag.at) / g.size) * g.content * g.sign);
      drag.at = at;
    });
    const end = (e: PointerEvent): void => { if (drag?.id === e.pointerId) drag = null; };
    thumb.addEventListener('pointerup', end);
    thumb.addEventListener('pointercancel', end);
  }

  /** The view's pan for a movement on screen, in the drawing surfaces' space (the view's turn and flip taken off). */
  private surfaceDelta(dx: number, dy: number): Pt {
    const v = this.engine.current?.viewport, a = (-(v?.rotation ?? 0) * Math.PI) / 180;
    return { x: (dx * Math.cos(a) - dy * Math.sin(a)) * (v?.flipped ? -1 : 1), y: dx * Math.sin(a) + dy * Math.cos(a) };
  }

  /** Auto-scroll for every drag-based tool: within 12 px of the stage's edge, every 60 Hz tick pans by 2 plus 0.4 times
   *  the distance past the margin (at most 40) and the tool gets a move at the same pointer, now over a new document point. */
  private edgeDelta(ev: PointerEvent): Pt {
    const r = this.rect ?? this.host.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top, m = 12;
    const speed = (past: number): number => Math.min(40, 2 + 0.4 * past);
    const axis = (pos: number, size: number): number => (pos < m ? speed(m - pos) : pos > size - m ? -speed(pos - (size - m)) : 0);
    return { x: axis(x, r.width), y: axis(y, r.height) };
  }

  private flickBy(vx: number, vy: number): void {
    if (!REDUCED && Math.hypot(vx, vy) >= 0.3) this.engine.flick(vx, vy);
  }

  private stopEdge(): void {
    if (this.edge) window.clearInterval(this.edge.timer);
    this.edge = null;
  }

  private edgeScroll(ev: PointerEvent): void {
    if (Stage.noEdgeTools.has(this.engine.tool)) return;
    const d = this.edgeDelta(ev);
    if (!d.x && !d.y) { this.stopEdge(); return; }
    if (this.edge) { this.edge.ev = ev; return; }
    const st = { ev, timer: 0 };
    st.timer = window.setInterval(() => {
      const dd = this.edgeDelta(st.ev), t = this.tool();
      if ((!dd.x && !dd.y) || this.dragId === null || !t?.move) { this.stopEdge(); return; }
      const s = this.surfaceDelta(dd.x, dd.y);
      this.engine.pan(s.x, s.y);
      t.move(this.ctx, this.pointer(st.ev));
    }, 1000 / 60);
    this.edge = st;
  }

  private tool(): Tool | undefined { return dialogTool() ?? getTool(this.engine.tool); }

  private viewInfo(): ViewInfo {
    const v = this.engine.current?.viewport;
    const zoom = v?.zoom ?? 1, px = v?.panX ?? 0, py = v?.panY ?? 0;
    return {
      zoom, dpr: this.dpr, width: this.cssW, height: this.cssH,
      toScreen: (p) => ({ x: p.x * zoom + px, y: p.y * zoom + py }),
      toDoc: (p) => ({ x: (p.x - px) / zoom, y: (p.y - py) / zoom }),
    };
  }

  /** How far the drawing surfaces reach past the stage on each side, in CSS pixels (1.85.2): a turned view (Rotate
   *  View) or a narrowed pixel aspect turns or squeezes the surfaces about the stage's centre, so they are made large
   *  enough to cover the whole stage at any angle; unturned they are exactly the stage. Every renderer draws shifted by
   *  this margin, so a stage point and its document point are unchanged. */
  private offX = 0;
  private offY = 0;

  private resize(): void {
    const r = this.host.getBoundingClientRect();
    this.rect = r;
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    const deg = this.engine.current?.viewport.rotation ?? 0, par = Stage.parOf(this.engine);
    const cover = deg || par < 1 ? Math.ceil(Math.hypot(w, h) / Math.min(1, par)) : 0;
    const offX = cover ? Math.ceil((cover - w) / 2) : 0, offY = cover ? Math.ceil((cover - h) / 2) : 0;
    if (w === this.cssW && h === this.cssH && dpr === this.dpr && offX === this.offX && offY === this.offY) return;
    this.cssW = w;
    this.cssH = h;
    this.offX = offX;
    this.offY = offY;
    if (dpr !== this.dpr) this.checker = null;
    this.dpr = dpr;
    for (const c of [this.scene, this.overlay, ...this.gpuCanvases]) {
      c.width = Math.round((w + 2 * offX) * dpr); c.height = Math.round((h + 2 * offY) * dpr);
      const left = offX ? `${-offX}px` : '', top = offY ? `${-offY}px` : '', cw = offX ? `${w + 2 * offX}px` : '', ch = offY ? `${h + 2 * offY}px` : '';
      if (c.style.left !== left) c.style.left = left;
      if (c.style.top !== top) c.style.top = top;
      if (c.style.width !== cw) c.style.width = cw;
      if (c.style.height !== ch) c.style.height = ch;
    }
    this.rulerH.width = Math.round(w * dpr); this.rulerH.height = Math.round(RULER * dpr);
    this.rulerV.width = Math.round(RULER * dpr); this.rulerV.height = Math.round(h * dpr);
    this.engine.setViewSize(w, h);
    this.syncChrome();
    this.renderScene();
    this.renderOverlay();
  }

  restyle(): void { this.checker = null; this.queue(true, true); this.syncAnts(); }

  /** The stage as the person sees it (get_image view editor): the drawing surfaces, the GPU ones when shown, with the overlay on top, cut to the stage. */
  capture(): HTMLCanvasElement | null {
    if (!this.cssW || !this.cssH || !this.engine.current) return null;
    const out = document.createElement('canvas');
    out.width = Math.round(this.cssW * this.dpr); out.height = Math.round(this.cssH * this.dpr);
    const g = out.getContext('2d');
    if (!g) return null;
    const dx = -Math.round(this.offX * this.dpr), dy = -Math.round(this.offY * this.dpr);
    for (const c of [...this.gpuCanvases.filter((x) => !x.hidden && x.style.display !== 'none'), this.scene, this.overlay]) g.drawImage(c, dx, dy);
    return out;
  }

  /** The document region the next scene frame must repaint: undefined nothing pending, null everything, else the
   *  union of the stroke regions reported since the last frame. Any full request wins until the frame runs. */
  private pending: Rect | null | undefined = undefined;

  private queue(scene: boolean, overlay: boolean, region: Rect | null = null): void {
    this.wantScene ||= scene;
    this.wantOverlay ||= overlay;
    if (scene) this.pending = region && this.pending !== null ? (this.pending ? unionRect(this.pending, region) : region) : null;
    if (this.frame) return;
    const asked = frameTrace.on ? performance.now() : 0;
    const tick = (now: number): void => {
      if (framePacing.minMs > 0 && now - framePacing.last < framePacing.minMs - 2) { this.frame = requestAnimationFrame(tick); return; }
      framePacing.last = now;
      this.frame = 0;
      const region = this.pending ?? null;
      this.pending = undefined;
      const traced = frameTrace.on, t0 = traced ? performance.now() : 0, scene = this.wantScene;
      if (this.wantScene) this.renderScene(region);
      if (this.wantOverlay) this.renderOverlay();
      if (traced && asked) frameTrace.record(asked, t0, performance.now(), scene ? (this.gpu && !this.gpuReason ? 'gpu' : 'cpu') : 'overlay');
    };
    this.frame = requestAnimationFrame(tick);
  }

  private syncWelcome(): void { setHidden(this.welcome, this.engine.projects.length > 0); }

  /** Draw through the GPU display (or stop, with null); `limitBytes` is Preferences' GPU memory limit, and `onState`
   *  hears the reason a document falls back to the CPU, or null when the GPU draws it. */
  setGpu(display: ScreenDisplay | null, limitBytes: number, onState: ((reason: string | null) => void) | null): void {
    this.gpu = display;
    this.gpuLimit = limitBytes;
    this.gpuState = onState;
    this.gpuReason = undefined;
    this.showGpu(false);
    this.queue(true, false);
  }

  /** Only the active display's canvas shows, and only while it draws the frame. */
  private showGpu(on: boolean): void {
    for (const c of this.gpuCanvases) setHidden(c, !(on && c === this.gpu?.canvas));
  }

  /** A CSS colour as bytes, for the GPU's checkerboard. */
  private rgb(css: string): [number, number, number] {
    let v = this.rgbCache.get(css);
    if (!v) {
      const c = createSurface(1, 1), g = c.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
      g.fillStyle = css;
      g.fillRect(0, 0, 1, 1);
      const d = g.getImageData(0, 0, 1, 1).data;
      v = [d[0], d[1], d[2]];
      this.rgbCache.set(css, v);
    }
    return v;
  }

  private checkerPattern(pal: StagePaint): CanvasPattern | null {
    const key = `${this.dpr}|${pal.checkerA}|${pal.checkerB}|${Stage.prefs.cell}`;
    if (this.checker?.key === key) return this.checker.pattern;
    const cell = Math.max(1, Math.round(Stage.prefs.cell * this.dpr));
    const tile = createSurface(cell * 2, cell * 2);
    const c = tile.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
    c.fillStyle = pal.checkerA;
    c.fillRect(0, 0, cell * 2, cell * 2);
    c.fillStyle = pal.checkerB;
    c.fillRect(cell, 0, cell, cell);
    c.fillRect(0, cell, cell, cell);
    const pattern = this.sctx.createPattern(tile as CanvasImageSource, 'repeat');
    if (!pattern) return null;
    this.checker = { key, pattern };
    return pattern;
  }

  /** Proof Colors and a colour-managed view (1.53.5, H2): the composed region through the view's lookup table. */
  private applyView(w: number, h: number): void {
    const v = this.engine.viewTransform;
    // A duotone document (31.3) keeps grey pixels and is shown as its inks overprinted, before any view transform.
    const duo = this.engine.current?.doc.mode === 'duotone' ? this.engine.current.doc.duotone ?? null : null;
    if ((!v && !duo) || w <= 0 || h <= 0) return;
    const c = (this.work as unknown as { getContext(k: '2d'): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null }).getContext('2d');
    if (!c) return;
    const img = c.getImageData(0, 0, w, h);
    if (duo) {
      if (this.duoCache?.key !== duo) this.duoCache = { key: duo, lut: duotoneLut(duo) };
      applyDuotoneLut(img.data, this.duoCache.lut);
    }
    if (v) applyLut(img.data, v.lut, v.gamut);
    c.putImageData(img, 0, 0);
  }
  private duoCache: { key: object; lut: Uint8Array } | null = null;

  private renderScene(region: Rect | null = null): void {
    this.wantScene = false;
    const g = this.sctx;
    const W = this.scene.width, H = this.scene.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const p = this.engine.current;
    if (!p) { g.clearRect(0, 0, W, H); this.showGpu(false); return; }
    if (this.engine.view.patternPreview) region = null;   // tiles around the document make every frame a full redraw
    const pal = paint();
    // The GPU display draws the whole frame when it can draw this document; otherwise the CPU path below, with the
    // reason reported once each time it changes.
    let gpuLayers: DisplayLayer[] | null = null;
    if (this.gpu) {
      const vz = p.viewport.zoom * this.dpr, gl = this.engine.gpuLayers({ matrix: [vz, 0, 0, vz, (p.viewport.panX + this.offX) * this.dpr, (p.viewport.panY + this.offY) * this.dpr], width: W, height: H });   // the view, for a giant document's tiles (1.62.9)
      // A view transform without the gamut warning goes on the GPU as a last 3D table over the stack (1.86.2); before,
      // any view transform sent the whole canvas to the CPU, which in the desktop app on a Mac was every frame.
      const vt = this.engine.viewTransform, viewTable = vt && !vt.gamut ? viewLut3(vt.lut) : null;
      let reason = (this.engine.view.patternPreview || this.engine.view.pixelArt ? 'Pattern Preview and Pixel Art Preview are drawn on the CPU' : null) ?? (vt && !viewTable ? 'the gamut warning is drawn on the CPU' : null) ?? (p.doc.mode === 'duotone' ? 'Duotone documents are drawn on the CPU' : null) ?? (p.doc.mode === 'multichannel' ? 'Multichannel documents are drawn on the CPU' : null) ?? documentFallback(gl, W, H, { maxTexture: this.gpu.maxTexture, memoryBytes: this.gpuLimit }) ?? ('layers' in gl ? this.gpu.unsupported?.(gl.layers) ?? null : null);
      if (!reason && 'layers' in gl) {
        gpuLayers = gl.layers;
        if (viewTable) {
          const view: DisplayLayer = { image: null, lut: viewTable, lut3: true, version: 0, width: LUT3_N * LUT3_N, height: LUT3_N, matrix: [1, 0, 0, 1, 0, 0], opacity: 1, blend: 'normal' };
          const why = this.gpu.unsupported?.([view]) ?? null;
          if (why) reason = why;
          else gpuLayers = [...gl.layers, view];
        }
        if (reason) gpuLayers = null;
      }
      if (reason !== this.gpuReason) {
        this.gpuReason = reason;
        console.info(reason ? `formvis: drawing on the CPU, because ${reason}` : 'formvis: drawing on the GPU (WebGPU)');
        this.gpuState?.(reason);
      }
      if (gpuLayers) region = null;
    }
    this.showGpu(!!gpuLayers);
    const v = p.viewport;
    const z = v.zoom * this.dpr, ox = (v.panX + this.offX) * this.dpr, oy = (v.panY + this.offY) * this.dpr;
    const docRect = { x: ox, y: oy, w: p.doc.width * z, h: p.doc.height * z };
    let vis = intersectRect(integral(docRect), { x: 0, y: 0, w: W, h: H });
    if (region) {
      // A stroke frame: the region it changed, a pixel wider each way for the resampling, over the scene as it stands.
      vis = vis && intersectRect(vis, integral({ x: ox + region.x * z - 1, y: oy + region.y * z - 1, w: region.w * z + 2, h: region.h * z + 2 }));
      if (!vis) return;
      g.clearRect(vis.x, vis.y, vis.w, vis.h);
    } else {
      g.clearRect(0, 0, W, H);
      g.lineWidth = 1;
      g.strokeStyle = pal.edge;
      g.strokeRect(Math.round(docRect.x) - 0.5, Math.round(docRect.y) - 0.5, Math.round(docRect.w) + 1, Math.round(docRect.h) + 1);
    }
    if (!vis) { if (gpuLayers) this.showGpu(false); return; }
    g.save();
    g.beginPath();
    g.rect(vis.x, vis.y, vis.w, vis.h);
    g.clip();
    const pattern = gpuLayers ? null : this.checkerPattern(pal);
    if (pattern) {
      pattern.setTransform(new DOMMatrix([1, 0, 0, 1, Math.round(ox), Math.round(oy)]));
      g.fillStyle = pattern;
      g.fillRect(vis.x, vis.y, vis.w, vis.h);
    }
    if (gpuLayers && this.gpu) {
      this.gpu.document?.(p.doc.width, p.doc.height);
      this.gpu.render(gpuLayers, [z, 0, 0, z, ox, oy], v.zoom, [vis.x, vis.y, vis.x + vis.w, vis.y + vis.h],
        { a: this.rgb(pal.checkerA), b: this.rgb(pal.checkerB), cell: Math.max(1, Math.round(Stage.prefs.cell * this.dpr)), origin: [Math.round(ox), Math.round(oy)] });
    } else if (v.zoom >= 2 || this.engine.view.pixelArt) {
      // Pixel Art Preview takes this crisp branch at every zoom: composed at 1x, then scaled with smoothing off, so
      // zooming out is a nearest-neighbour downscale.
      const d =intersectRect(integral({ x: (vis.x - ox) / z, y: (vis.y - oy) / z, w: vis.w / z, h: vis.h / z }), { x: 0, y: 0, w: p.doc.width, h: p.doc.height });
      if (d) {
        sizeSurface(this.work, d.w, d.h);
        this.engine.compose(this.work, translation(-d.x, -d.y));
        this.applyView(d.w, d.h);
        g.imageSmoothingEnabled = false;
        g.drawImage(this.work as CanvasImageSource, 0, 0, d.w, d.h, ox + d.x * z, oy + d.y * z, d.w * z, d.h * z);
      }
    } else {
      sizeSurface(this.work, vis.w, vis.h);
      this.engine.compose(this.work, [z, 0, 0, z, ox - vis.x, oy - vis.y], v.zoom < 0.5 ? 'medium' : 'high');
      this.applyView(vis.w, vis.h);
      g.drawImage(this.work as CanvasImageSource, vis.x, vis.y);
    }
    if (this.engine.showPixelGrid && v.zoom >= 8) {
      g.strokeStyle = pal.grid;
      g.beginPath();
      const x0 = Math.floor((vis.x - ox) / z), x1 = Math.ceil((vis.x + vis.w - ox) / z);
      const y0 = Math.floor((vis.y - oy) / z), y1 = Math.ceil((vis.y + vis.h - oy) / z);
      for (let x = x0; x <= x1; x++) { const sx = Math.round(ox + x * z) + 0.5; g.moveTo(sx, vis.y); g.lineTo(sx, vis.y + vis.h); }
      for (let y = y0; y <= y1; y++) { const sy = Math.round(oy + y * z) + 0.5; g.moveTo(vis.x, sy); g.lineTo(vis.x + vis.w, sy); }
      g.stroke();
    }
    g.restore();
    if (this.engine.view.patternPreview && docRect.w >= 1 && docRect.h >= 1) {
      // Pattern Preview: the composed document once per frame (at most about 4096 px a side, stretched beyond that),
      // drawn again in the eight neighbouring positions across the whole scene.
      // Zoomed in (2x or more) or Pixel Art: composed at the document's own pixels and drawn crisp, as the document is.
      const crisp = v.zoom >= 2 || this.engine.view.pixelArt, base = crisp ? 1 : z;
      const s = Math.min(1, 4096 / Math.max(p.doc.width * base, p.doc.height * base));
      const tw = Math.max(1, Math.round(p.doc.width * base * s)), th = Math.max(1, Math.round(p.doc.height * base * s));
      sizeSurface(this.work, tw, th);
      this.engine.compose(this.work, [base * s, 0, 0, base * s, 0, 0], 'high');
      this.applyView(tw, th);
      const dw = Math.round(docRect.w), dh = Math.round(docRect.h);
      g.save();
      g.beginPath();
      g.rect(0, 0, W, H);
      g.clip();
      g.imageSmoothingEnabled = !crisp;
      for (let ty = -1; ty <= 1; ty++) {
        for (let tx = -1; tx <= 1; tx++) {
          if (tx === 0 && ty === 0) continue;
          const x = Math.round(docRect.x) + tx * dw, y = Math.round(docRect.y) + ty * dh;
          if (x >= W || y >= H || x + dw <= 0 || y + dh <= 0) continue;
          g.drawImage(this.work as CanvasImageSource, 0, 0, tw, th, x, y, dw, dh);
        }
      }
      g.restore();
    }
  }

  /** The layout grid over the canvas (every spacing, fainter every subdivision) and the guides across the view, with
   *  a guide being dragged drawn where it would land. */
  private drawGuides(g: CanvasRenderingContext2D, pal: StagePaint): void {
    const p = this.engine.current, vw = this.engine.view;
    if (!p) return;
    const v = p.viewport, W = p.doc.width, H = p.doc.height, x0 = v.panX, y0 = v.panY, x1 = v.panX + W * v.zoom, y1 = v.panY + H * v.zoom;
    g.save();
    g.lineWidth = 1;
    if (vw.grid) {
      const major = Math.max(1, vw.gridSpacing), sub = major / Math.max(1, vw.gridSubdivisions);
      for (const [step, alpha] of [[sub, 0.35], [major, 0.9]] as const) {
        if (step * v.zoom < 4) continue;
        g.globalAlpha = alpha * Stage.prefs.gridOpacity / 100;
        g.strokeStyle = Stage.prefs.gridColor || pal.grid;
        g.setLineDash(LINE_DASH[Stage.prefs.gridStyle]);
        g.beginPath();
        for (let x = step; x < W; x += step) { const sx = Math.round(x0 + x * v.zoom) + 0.5; g.moveTo(sx, y0); g.lineTo(sx, y1); }
        for (let y = step; y < H; y += step) { const sy = Math.round(y0 + y * v.zoom) + 0.5; g.moveTo(x0, sy); g.lineTo(x1, sy); }
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    if (vw.tileGrid && v.zoom * TILE_PX >= 6) {
      // Developer tile grid: the 256 px tiles giant layers and the GPU pages in, with the tile count in the corner.
      g.strokeStyle = pal.accent;
      g.globalAlpha = 0.7;
      g.setLineDash([4, 3]);
      g.beginPath();
      for (let x = TILE_PX; x < W; x += TILE_PX) { const sx = Math.round(x0 + x * v.zoom) + 0.5; g.moveTo(sx, y0); g.lineTo(sx, y1); }
      for (let y = TILE_PX; y < H; y += TILE_PX) { const sy = Math.round(y0 + y * v.zoom) + 0.5; g.moveTo(x0, sy); g.lineTo(x1, sy); }
      g.stroke();
      g.setLineDash([]);
      g.globalAlpha = 1;
      g.fillStyle = pal.accent;
      g.font = '11px sans-serif';
      g.fillText(`${Math.ceil(W / TILE_PX)} x ${Math.ceil(H / TILE_PX)} tiles of ${TILE_PX} px`, Math.max(x0, 0) + 6, Math.max(y0, 0) + 14);
    }
    if (frameTrace.on) {
      g.fillStyle = pal.accent;
      g.font = '11px sans-serif';
      g.fillText(frameTrace.summary(120), 8 - this.offX, 16 - this.offY);
    }
    const draft = this.engine.guideDraft, guides = (p.doc.guides ?? []).map((x, i) => (draft && draft.index === i ? null : x));
    if (vw.guides || draft) {
      const picked = new Set(this.engine.selectedGuides);
      const shown = [...guides, draft].map((q, i) => (!q || (!vw.guides && q !== draft) || ('board' in q && q.board && !vw.artboardGuides) ? null : { axis: q.axis, at: q.at, color: 'color' in q ? q.color : undefined, board: 'board' in q && q.board ? p.layer(q.board)?.artboard ?? null : null, sel: picked.has(i) })).filter((q): q is NonNullable<typeof q> => !!q);
      const line = (x: (typeof shown)[number]): void => {
        const b = x.board;
        if (x.axis === 'x') { const sx = Math.round(v.panX + x.at * v.zoom) + 0.5; g.moveTo(sx, b ? v.panY + b.y * v.zoom : -this.offY); g.lineTo(sx, b ? v.panY + (b.y + b.h) * v.zoom : this.cssH + this.offY); }
        else { const sy = Math.round(v.panY + x.at * v.zoom) + 0.5; g.moveTo(b ? v.panX + b.x * v.zoom : -this.offX, sy); g.lineTo(b ? v.panX + (b.x + b.w) * v.zoom : this.cssW + this.offX, sy); }
      };
      if (shown.some((x) => x.sel)) {
        g.save();
        g.strokeStyle = pal.accent;
        g.globalAlpha = 0.35;
        g.lineWidth = 5;
        g.setLineDash([]);
        g.beginPath();
        for (const x of shown) if (x.sel) line(x);
        g.stroke();
        g.restore();
      }
      for (const colour of new Set(shown.map((x) => x.color ?? ''))) {
        g.strokeStyle = colour || Stage.prefs.guideColor || pal.accent;
        g.setLineDash(LINE_DASH[Stage.prefs.guideStyle]);
        g.beginPath();
        for (const x of shown) if ((x.color ?? '') === colour) line(x);
        g.stroke();
      }
    }
    g.restore();
  }

  /** A major tick step in document pixels at least 60 screen pixels apart, from 1, 2, 5 and their powers of ten. */
  /** Preferences the stage draws with (set by the app from Preferences): the checkerboard's cell, what the wheel does,
   *  the rulers' units, and the grid's and guides' colours ('' is the theme's). */
  static prefs: { cell: number; zoomWheel: boolean; rulerUnits: 'px' | 'in' | 'cm' | 'mm' | '%' | 'col'; gridColor: string; guideColor: string; gridStyle: LineStyle; guideStyle: LineStyle; gridOpacity: number } = { cell: 8, zoomWheel: false, rulerUnits: 'px', gridColor: '', guideColor: '', gridStyle: 'solid', guideStyle: 'solid', gridOpacity: 100 };
  /** Preferences > Cursors, Enhanced Controls and Units & Rulers: Other Cursors precise, trackpad pinch and rotate, touch gestures, and a column plus its gutter in millimeters. */
  static controls = { preciseOther: false, pinch: true, rotate: false, touch: true, colMm: 19.2, colWidthMm: 15, penEraser: true };

  /** A pen's eraser end: Pointer Events report it as button 5 or, while in contact, the buttons bit 32. */
  static isPenEraser(e: PointerEvent): boolean { return e.pointerType === 'pen' && (e.button === 5 || (e.buttons & 32) !== 0); }

  /** A stage point back to the unturned, unstretched drawing surfaces: the view's rotation taken off about the centre,
   *  then the pixel aspect stretch `par` (35.4c) taken off horizontally about the centre. */
  static unturn(x: number, y: number, w: number, h: number, deg: number, par = 1, flip = false): { x: number; y: number } {
    let p = { x, y };
    if (deg) {
      const a = (-deg * Math.PI) / 180, cx = w / 2, cy = h / 2, dx = x - cx, dy = y - cy;
      p = { x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a) };
    }
    if (par !== 1 && par > 0) p = { x: w / 2 + (p.x - w / 2) / par, y: p.y };
    return flip ? { x: w - p.x, y: p.y } : p;
  }

  /** The pixel aspect stretch the canvas shows with (View > Pixel Aspect Ratio Correction on a non-square document). */
  static parOf(engine: Engine): number {
    const r = engine.current?.doc.pixelAspect;
    return engine.view.parCorrection && r && r > 0 ? r : 1;
  }

  /** The drawing surfaces turned as the view is (CSS, about the stage's centre); every renderer draws as it always has.
   *  Pixel Aspect Ratio Correction (35.4c) stretches them horizontally the same way, before the turn, so every
   *  renderer, overlay and tool keeps drawing in square pixels and the pointer is mapped back by `unturn`. */
  private turn(): void {
    const deg = this.engine.current?.viewport.rotation ?? 0, par = Stage.parOf(this.engine);
    const t = [deg ? `rotate(${deg}deg)` : '', par !== 1 ? `scaleX(${par})` : '', this.engine.current?.viewport.flipped ? 'scaleX(-1)' : ''].filter(Boolean).join(' ');
    this.resize();   // the surfaces grow to cover the stage at this angle (1.85.2); the rulers stay put
    for (const c of Array.from(this.host.querySelectorAll<HTMLElement>(':scope > canvas.cv-canvas'))) if (c.style.transform !== t) c.style.transform = t;
    this.host.classList.toggle('is-turned', !!deg);
  }

  /** The ruler zero point of each open document, in document pixels; dragged from the rulers' corner, reset by a double-click there. */
  private static readonly rulerOrigins = new WeakMap<object, Pt>();
  static rulerOrigin(project: object | null | undefined): Pt { return (project && Stage.rulerOrigins.get(project)) || { x: 0, y: 0 }; }

  static rulerStep(zoom: number): number {
    for (let k = 0; k < 8; k++) for (const m of [1, 2, 5]) { const s = m * 10 ** k; if (s * zoom >= 60) return s; }
    return 1e8;
  }

  /** The rulers along the top and left, in document pixels from the canvas origin, shown when View > Rulers is on. */
  private renderRulers(): void {
    const show = this.engine.view.rulers && !!this.engine.current;
    setHidden(this.rulerH, !show);
    setHidden(this.rulerV, !show);
    if (!show) return;
    const p = this.engine.current as NonNullable<Engine['current']>, v = p.viewport, pal = paint(), d = this.dpr;
    // Preferences > Units & Rulers: each ruler in the chosen unit (the document's resolution; percent of its side), its
    // ticks at round steps of that unit.
    const res = p.doc.resolution || 72, u = Stage.prefs.rulerUnits, origin = Stage.rulerOrigin(p);
    for (const [c, horiz] of [[this.rulerH, true], [this.rulerV, false]] as const) {
      const k = u === 'in' ? res : u === 'cm' ? res / 2.54 : u === 'mm' ? res / 25.4 : u === 'col' ? (res / 25.4) * Stage.controls.colMm : u === '%' ? (horiz ? p.doc.width : p.doc.height) / 100 : 1;
      const zk = v.zoom * k, step = Stage.rulerStep(zk), minor = step * zk >= 150 ? step / 10 : step / 5;
      const g = c.getContext('2d');
      if (!g) continue;
      const len = horiz ? this.cssW : this.cssH, pan = horiz ? v.panX : v.panY;
      g.setTransform(d, 0, 0, d, 0, 0);
      g.fillStyle = pal.rulerBg;
      g.fillRect(0, 0, horiz ? len : RULER, horiz ? RULER : len);
      g.strokeStyle = pal.rulerLine;
      g.fillStyle = pal.rulerText;
      g.font = '9px system-ui, sans-serif';
      g.lineWidth = 1;
      g.beginPath();
      if (horiz) { g.moveTo(0, RULER - 0.5); g.lineTo(len, RULER - 0.5); } else { g.moveTo(RULER - 0.5, 0); g.lineTo(RULER - 0.5, len); }
      const o0 = (horiz ? origin.x : origin.y) / k, first = Math.floor((-pan / zk - o0) / minor) * minor;
      for (let t = first; (t + o0) * zk + pan <= len; t += minor) {
        const s = Math.round((t + o0) * zk + pan) + 0.5, isMajor = Math.abs(t / step - Math.round(t / step)) < 1e-6, tick = isMajor ? RULER : RULER / 3;
        if (horiz) { g.moveTo(s, RULER - tick); g.lineTo(s, RULER); } else { g.moveTo(RULER - tick, s); g.lineTo(RULER, s); }
        if (isMajor) {
          const label = String(Math.round(t));
          if (horiz) g.fillText(label, s + 2, 9);
          else { g.save(); g.translate(9, s + 2); g.rotate(-Math.PI / 2); g.textAlign = 'right'; g.fillText(label, 0, 0); g.restore(); }
        }
      }
      g.stroke();
    }
  }

  private tint: { key: unknown; canvas: HTMLCanvasElement } | null = null;
  /** The Quick Mask tint: red at half strength less the selection's coverage (or the live stroke's), cached by source. */
  private quickTint(p: Project): HTMLCanvasElement | null {
    const live = this.engine.quickMaskLive, sel = p.selection;
    if (!live && !sel) return null;   // nothing selected yet: all is, so no tint
    const key = live ? null : sel;
    if (key && this.tint?.key === key) return this.tint.canvas;
    const W = p.doc.width, H = p.doc.height, prev = this.tint?.canvas ?? null;
    const c = prev && prev.width === W && prev.height === H ? prev : document.createElement('canvas');
    c.width = W; c.height = H;
    const t = c.getContext('2d') as CanvasRenderingContext2D;
    t.globalCompositeOperation = 'source-over';
    t.fillStyle = 'rgba(255, 0, 0, 0.5)';
    t.fillRect(0, 0, W, H);
    t.globalCompositeOperation = 'destination-out';
    if (live) t.drawImage(live as CanvasImageSource, 0, 0);
    else if (sel) { const m = new ImageData(sel.w, sel.h); for (let i = 0; i < sel.data.length; i++) m.data[i * 4 + 3] = sel.data[i]; const tmp = document.createElement('canvas'); tmp.width = sel.w; tmp.height = sel.h; (tmp.getContext('2d') as CanvasRenderingContext2D).putImageData(m, 0, 0); t.drawImage(tmp, sel.x, sel.y); }
    t.globalCompositeOperation = 'source-over';
    this.tint = { key, canvas: c };
    return c;
  }

  private readonly alphaTints = new WeakMap<AlphaChannel, HTMLCanvasElement>();
  /** An alpha channel shown from the Channels panel: red at half strength where it selects nothing, as Quick Mask's tint. */
  private alphaTint(p: Project, a: AlphaChannel): HTMLCanvasElement {
    const W = p.doc.width, H = p.doc.height, hit = this.alphaTints.get(a);
    if (hit && hit.width === W && hit.height === H) return hit;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const t = c.getContext('2d') as CanvasRenderingContext2D;
    const k = a.color ?? { r: 255, g: 0, b: 0 }, op = (a.opacity ?? 50) / 100;
    t.fillStyle = `rgba(${k.r}, ${k.g}, ${k.b}, ${op})`;
    if (a.indicates === 'selected') {
      if (a.mask) { t.drawImage(a.mask.surface() as CanvasImageSource, a.mask.x, a.mask.y); t.globalCompositeOperation = 'source-in'; t.fillRect(0, 0, W, H); }
      this.alphaTints.set(a, c);
      return c;
    }
    t.fillRect(0, 0, W, H);
    t.globalCompositeOperation = 'destination-out';
    if (a.mask) t.drawImage(a.mask.surface() as CanvasImageSource, a.mask.x, a.mask.y);
    this.alphaTints.set(a, c);
    return c;
  }

  private renderOverlay(): void {
    this.wantOverlay = false;
    const g = this.octx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.overlay.width, this.overlay.height);
    this.renderRulers();
    const p = this.engine.current;
    if (!p) return;
    const pal = paint();
    const v = p.viewport;
    if (this.cmp && this.cmp.docId === p.doc.id) this.drawCompare(g, pal, v);
    const sel = p.selection, fl = sel ? null : this.engine.floatingOutline(p);
    // Notes and counts (1.49.6), shown whatever the tool: a note as a small sticky square (the one open
    // highlighted), a count as its number by a dot, dark over light so they read on any image.
    {
      const d = this.dpr;
      g.save(); g.setTransform(d, 0, 0, d, this.offX * d, this.offY * d);
      for (const n of extraShown('notes') ? p.doc.notes ?? [] : []) {
        const q = v.toScreen(n.x, n.y), on = n.id === this.engine.activeNote;
        g.fillStyle = on ? pal.accent : n.color ?? '#f5c542'; g.strokeStyle = pal.antsB; g.lineWidth = 1;
        g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q.x + 16, q.y); g.lineTo(q.x + 16, q.y + 11); g.lineTo(q.x + 11, q.y + 16); g.lineTo(q.x, q.y + 16); g.closePath(); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(q.x + 4, q.y + 5); g.lineTo(q.x + 12, q.y + 5); g.moveTo(q.x + 4, q.y + 9); g.lineTo(q.x + 10, q.y + 9); g.strokeStyle = 'rgba(0,0,0,0.55)'; g.stroke();
      }
      const look = this.engine.measureOpts, groups = p.doc.countGroups ?? [], seen = new Map<string, number>();
      g.font = `600 ${look.countLabel}px Inter, system-ui, sans-serif`;
      (extraShown('counts') ? p.doc.counts ?? [] : []).forEach((c) => {
        const gr = groups.find((k) => k.id === c.g) ?? groups[0], key = gr?.id ?? '', n = (seen.get(key) ?? 0) + 1;
        seen.set(key, n);
        if (gr?.hidden) return;
        const q = v.toScreen(c.x, c.y), r = look.countMarker;
        g.fillStyle = gr?.color ?? pal.accent; g.beginPath(); g.arc(q.x, q.y, r, 0, Math.PI * 2); g.fill();
        g.lineWidth = 3; g.strokeStyle = pal.antsB; g.strokeText(String(n), q.x + r + 2, q.y - r - 2);
        g.fillStyle = pal.antsA; g.fillText(String(n), q.x + r + 2, q.y - r - 2);
      });
      g.restore();
    }
    // Empty frames (the Frame tool) show their placeholder: the outline and a cross, never exported.
    for (const f of p.doc.layers) {
      if (!f.frame || !f.visible || p.doc.layers.some((c) => c.parentId === f.id)) continue;
      const r = f.frame, a = v.toScreen(r.x, r.y), b = v.toScreen(r.x + r.w, r.y + r.h), d = this.dpr;
      g.save(); g.setTransform(d, 0, 0, d, this.offX * d, this.offY * d); g.lineWidth = 1; g.strokeStyle = pal.antsB; g.globalAlpha = 0.7;
      g.beginPath();
      if (r.shape === 'ellipse') g.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, (b.x - a.x) / 2, (b.y - a.y) / 2, 0, 0, Math.PI * 2); else g.rect(a.x + 0.5, a.y + 0.5, b.x - a.x, b.y - a.y);
      g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.moveTo(b.x, a.y); g.lineTo(a.x, b.y);
      g.stroke(); g.restore();
    }
    for (const a of this.engine.shownAlphas(p)) {
      const d = this.dpr;
      g.setTransform(v.zoom * d, 0, 0, v.zoom * d, (v.panX + this.offX) * d, (v.panY + this.offY) * d); g.imageSmoothingEnabled = v.zoom < 1; g.drawImage(this.alphaTint(p, a), 0, 0); g.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (this.engine.quickMask || this.engine.quickMaskLive || (selectionTintOn() && sel && !fl && extraShown('selectionEdges'))) {
      // Quick Mask, a Selection Brush stroke in progress, or the tint display choice: a red tint where nothing is selected, in place of the outline; live while a stroke paints it.
      const src = this.quickTint(p);
      if (src) { const d = this.dpr; g.setTransform(v.zoom * d, 0, 0, v.zoom * d, (v.panX + this.offX) * d, (v.panY + this.offY) * d); g.imageSmoothingEnabled = v.zoom < 1; g.drawImage(src, 0, 0); g.setTransform(1, 0, 0, 1, 0, 0); }
    } else if ((sel || fl) && extraShown('selectionEdges')) {
      const shift = this.engine.outlineShift(p);
      const d = this.dpr;
      const view = new DOMMatrix([v.zoom * d, 0, 0, v.zoom * d, (v.panX + this.offX + (shift?.dx ?? 0) * v.zoom) * d, (v.panY + this.offY + (shift?.dy ?? 0) * v.zoom) * d]);
      const path = new Path2D();
      if (fl) path.addPath(fl.selection.outline(), view.multiply(new DOMMatrix([...fl.m])));
      else if (sel) path.addPath(sel.outline(), view);
      g.lineWidth = 1;
      g.setLineDash([4 * d, 4 * d]);
      g.strokeStyle = pal.antsB;
      g.lineDashOffset = -this.phase * d;
      g.stroke(path);
      g.strokeStyle = pal.antsA;
      g.lineDashOffset = -(this.phase + 4) * d;
      g.stroke(path);
      g.setLineDash([]);
    }
    g.setTransform(this.dpr, 0, 0, this.dpr, this.offX * this.dpr, this.offY * this.dpr);
    this.drawGuides(g, pal);
    const edged = this.engine.activeLayer;
    if (edged?.raster && edged.visible && extraShown('layerEdges')) {
      const c = corners(edged.transform).map((u) => v.toScreen(u.x, u.y));
      g.save(); g.lineWidth = 1; g.strokeStyle = pal.accent;
      g.beginPath(); g.moveTo(c[0].x + 0.5, c[0].y + 0.5); for (let i = 1; i < 4; i++) g.lineTo(c[i].x + 0.5, c[i].y + 0.5); g.closePath(); g.stroke(); g.restore();
    }
    const target = extraShown('targetPath') && !PATH_TOOLS.has(this.tool()?.id ?? '') ? this.engine.workPath : null;
    if (target) {
      g.save(); g.lineWidth = 1; g.strokeStyle = pal.accent;
      g.stroke(tracePath(target, (u) => v.toScreen(u.x, u.y)));
      g.restore();
    }
    if (this.engine.view.slices && this.tool()?.id !== 'slice' && p.doc.slices?.length) drawSlices(g, p.doc.slices, v.panX, v.panY, v.zoom, pal.accent, this.engine.activeSlice, p.doc, this.engine.view.autoSlices);
    this.tool()?.overlay?.(this.ctx, g);
    const ring = this.engine.sampleRing;
    if (ring) {
      const cx = v.panX + ring.at.x * v.zoom, cy = v.panY + ring.at.y * v.zoom, r = 43;
      g.save();
      g.lineWidth = 24;
      g.strokeStyle = 'rgb(115, 115, 115)';
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 16;
      for (const [c, top] of [[ring.sampled, true], [ring.original, false]] as const) {
        g.save();
        g.beginPath();
        g.rect(cx - 58, top ? cy - 58 : cy, 116, 58);
        g.clip();
        g.strokeStyle = `rgb(${c.r}, ${c.g}, ${c.b})`;
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.stroke();
        g.restore();
      }
      g.restore();
    }
  }

  private syncAnts(): void {
    const need = (!!this.engine.current?.selection || this.engine.floatingSelection) && !REDUCED && Stage.animate && extraShown('selectionEdges') && !(selectionTintOn() && !this.engine.floatingSelection);
    if (need && !this.antsTimer) this.antsTimer = window.setInterval(() => { this.phase = (this.phase + 1) % 8; this.queue(false, true); }, 140);
    else if (!need && this.antsTimer) { window.clearInterval(this.antsTimer); this.antsTimer = 0; }
  }

  /** Pressure from 0 to 1 (DEV_PLAN 28.1): a pen's own; a touch's when the screen reports force; a Force Touch
   *  trackpad's in WebKit (the macOS app), read from `webkitForce`, where 1 is the click and 2 the deep press; else 1. */
  static pressureOf(e: MouseEvent, pen: boolean): number {
    if (!Stage.usePressure) return 1;
    const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
    const pe = e as PointerEvent;
    if (pen) return clamp01(pe.pressure);
    if (pe.pointerType === 'touch' && pe.pressure > 0 && pe.pressure !== 0.5) return clamp01(pe.pressure);
    // A plain mouse in WebKit also reports a force of exactly 1 at every click, so the trackpad's reading is used only
    // once a press past the click has shown the device measures force.
    const force = (e as MouseEvent & { webkitForce?: number }).webkitForce;
    if (typeof force === 'number' && force > 1.001) Stage.forceSeen = true;
    if (Stage.forceSeen && typeof force === 'number' && force >= 1) return clamp01(force - 1);
    return 1;
  }

  private static forceSeen = false;
  /** Preferences: pen pressure, tilt and twist reach the tools (off: a full-pressure stroke), and the marching ants run. */
  static usePressure = true;
  static animate = true;

  private pointer(e: MouseEvent, clicks = 0): ToolPointer {
    const r = this.rect ?? this.host.getBoundingClientRect();
    const v = this.engine.current?.viewport;
    // Rotate View turns the drawing surfaces about the stage's centre; a pointer is turned back into their space, so
    // every tool lands where it points at any angle.
    const kx = this.cssW && r.width ? this.cssW / r.width : 1, ky = this.cssH && r.height ? this.cssH / r.height : 1;   // the drawing surfaces are whole pixels; a fractional box (interface zoom) is mapped onto them
    const screen = Stage.unturn((e.clientX - r.left) * kx, (e.clientY - r.top) * ky, r.width * kx, r.height * ky, v?.rotation ?? 0, Stage.parOf(this.engine), !!v?.flipped);
    const pen = 'pointerType' in e && (e as PointerEvent).pointerType === 'pen';
    return { doc: v ? v.toDoc(screen.x, screen.y) : screen, screen, button: e.button, shift: e.shiftKey || stickyModifiers.active('shift'), alt: e.altKey || stickyModifiers.active('alt'), mod: (isMac ? e.metaKey : e.ctrlKey) || stickyModifiers.active('mod'), clicks, pressure: Stage.pressureOf(e, pen),
      pose: pen && Stage.usePressure ? { tiltX: (e as PointerEvent).tiltX || 0, tiltY: (e as PointerEvent).tiltY || 0, twist: (e as PointerEvent).twist || 0, wheel: Math.max(0, Math.min(1, (((e as PointerEvent).tangentialPressure || 0) + 1) / 2)) } : undefined };
  }

  /** Drag out of a ruler to place a guide: the top ruler makes horizontal guides, the left one vertical guides. The
   *  guide lands only when released over the view past the ruler; guides locked or hidden take none. */
  private bindRuler(r: HTMLCanvasElement, axis: 'x' | 'y'): void {
    let id: number | null = null;
    const at = (e: PointerEvent): { doc: Pt; inside: boolean } => {
      const b = this.rect ?? this.host.getBoundingClientRect(), sx = e.clientX - b.left, sy = e.clientY - b.top, v = this.engine.current?.viewport;
      const s = Stage.unturn(sx, sy, b.width, b.height, v?.rotation ?? 0, Stage.parOf(this.engine), !!v?.flipped);   // the guide under the pointer in a turned or stretched view (35.4c)
      const doc = v ? v.toDoc(s.x, s.y) : { x: sx, y: sy };
      return { doc, inside: sx >= 0 && sy >= 0 && sx <= b.width && sy <= b.height && (axis === 'y' ? sy > RULER : sx > RULER) };
    };
    let zero = false;
    const corner = (e: MouseEvent): boolean => { const b = this.rect ?? this.host.getBoundingClientRect(); return e.clientX - b.left < RULER && e.clientY - b.top < RULER; };
    const setZero = (e: MouseEvent): void => {
      const pr = this.engine.current;
      if (!pr) return;
      const b = this.rect ?? this.host.getBoundingClientRect(), v = pr.viewport, s = Stage.unturn(e.clientX - b.left, e.clientY - b.top, b.width, b.height, v.rotation ?? 0, Stage.parOf(this.engine), !!v.flipped), d = v.toDoc(s.x, s.y);
      Stage.rulerOrigins.set(pr, { x: Math.round(d.x), y: Math.round(d.y) });
      this.renderRulers();
    };
    r.addEventListener('dblclick', (e) => {
      const pr = this.engine.current;
      if (!pr || !corner(e)) return;
      Stage.rulerOrigins.delete(pr);
      this.renderRulers();
    });
    r.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !this.engine.current) return;
      if (corner(e)) { e.preventDefault(); r.setPointerCapture(e.pointerId); id = e.pointerId; zero = true; setZero(e); return; }
      if (this.engine.view.guidesLocked) return;
      e.preventDefault();
      r.setPointerCapture(e.pointerId);
      id = e.pointerId;
      const p = at(e).doc;
      this.engine.guideDraft = { axis, at: axis === 'x' ? p.x : p.y, index: null };
      this.engine.emit('overlay', null);
    });
    r.addEventListener('pointermove', (e) => {
      if (zero && id === e.pointerId) { setZero(e); return; }
      const d = this.engine.guideDraft;
      if (id !== e.pointerId || !d) return;
      const p = at(e).doc, far = -1e9, sp = this.engine.snapPoint(axis === 'x' ? { x: p.x, y: far } : { x: far, y: p.y });
      d.at = axis === 'x' ? sp.x : sp.y;
      this.engine.emit('overlay', null);
    });
    const end = (e: PointerEvent, cancel: boolean): void => {
      if (id !== e.pointerId) return;
      id = null;
      if (zero) { zero = false; return; }
      const d = this.engine.guideDraft, where = at(e);
      this.engine.guideDraft = null;
      this.engine.snapPoint({ x: 0, y: 0 }, true);
      if (!cancel && d && where.inside) { if (!this.engine.view.guides) this.engine.setView({ guides: true }); this.engine.addGuide(axis, d.at); }
      else this.engine.emit('overlay', null);
    };
    r.addEventListener('pointerup', (e) => end(e, false));
    r.addEventListener('pointercancel', (e) => end(e, true));
  }

  docPoint(clientX: number, clientY: number): Pt | null {
    const r = this.rect ?? this.host.getBoundingClientRect();
    const v = this.engine.current?.viewport;
    if (!v || clientX < r.left || clientY < r.top || clientX > r.right || clientY > r.bottom) return null;
    const kx = this.cssW && r.width ? this.cssW / r.width : 1, ky = this.cssH && r.height ? this.cssH / r.height : 1;
    const s = Stage.unturn((clientX - r.left) * kx, (clientY - r.top) * ky, r.width * kx, r.height * ky, v.rotation ?? 0, Stage.parOf(this.engine), v.flipped);   // turned and stretched views (35.4c)
    return v.toDoc(s.x, s.y);
  }

  private setCursor(c: string): void {
    if (c === this.cursor) return;
    this.cursor = c;
    this.overlay.style.cursor = c;
  }

  private updateCursor(p: ToolPointer | null = this.hover): void {
    if (!this.engine.current) this.setCursor('default');
    else if (this.panLast) this.setCursor('grabbing');
    else if (this.space) this.setCursor('grab');
    else { const c = this.tool()?.cursor?.(this.ctx, p) ?? 'default'; this.setCursor(c === 'default' && Stage.controls.preciseOther ? 'crosshair' : c); }
  }

  setSpace(on: boolean): void {
    if (this.space === on) return;
    this.space = on;
    this.updateCursor();
  }

  /** Which comparison is showing: the whole snapshot (peek), the split, or none. */
  get comparing(): 'peek' | 'split' | null { return this.cmp ? (this.cmp.split ? 'split' : 'peek') : null; }

  /** Shows the document as a kept snapshot holds it (the oldest when `id` is left out) without touching history: whole
   *  (peek) or as the right half of a split with a draggable divider; null puts the current state back. False when no snapshot is kept. */
  compare(mode: 'peek' | 'split' | null, id?: string): boolean {
    if (!mode) { if (this.cmp) { this.cmp = null; this.queue(false, true); } return true; }
    const p = this.engine.current;
    if (!p) return false;
    const key = `${p.doc.id}|${id ?? ''}`;
    if (this.cmpCache?.key !== key) {
      const surf = this.engine.snapshotPicture(id);
      if (!surf) return false;
      this.cmpCache = { key, surf };
    }
    this.cmp = { split: mode === 'split', docId: p.doc.id, surf: this.cmpCache.surf, x: this.cmp?.split ? this.cmp.x : Math.round(this.cssW / 2) };
    this.queue(false, true);
    return true;
  }

  /** The split's divider: a press within 8 px of it drags it, and never reaches the tool. */
  private bindDivider(): void {
    const o = this.overlay, at = (e: PointerEvent): number => e.clientX - (this.rect ?? this.host.getBoundingClientRect()).left;
    o.addEventListener('pointerdown', (e) => {
      if (!this.cmp?.split || Math.abs(at(e) - this.cmp.x) > 8) return;
      e.preventDefault(); e.stopImmediatePropagation();
      o.setPointerCapture(e.pointerId);
      this.cmpDrag = e.pointerId;
    });
    o.addEventListener('pointermove', (e) => {
      if (this.cmpDrag === e.pointerId && this.cmp) { this.cmp.x = Math.max(0, Math.min(this.cssW, Math.round(at(e)))); this.queue(false, true); e.stopImmediatePropagation(); }
    });
    const end = (e: PointerEvent): void => { if (this.cmpDrag === e.pointerId) { this.cmpDrag = null; e.stopImmediatePropagation(); } };
    o.addEventListener('pointerup', end);
    o.addEventListener('pointercancel', end);
  }

  private drawCompare(g: CanvasRenderingContext2D, pal: StagePaint, v: { zoom: number; panX: number; panY: number }): void {
    const c = this.cmp;
    if (!c) return;
    const d = this.dpr, sw = c.surf.width, sh = c.surf.height;
    g.save();
    g.setTransform(d, 0, 0, d, this.offX * d, this.offY * d);
    if (c.split) { g.beginPath(); g.rect(c.x, -this.offY, this.cssW + 2 * this.offX, this.cssH + 2 * this.offY); g.clip(); }
    const cp = this.checkerPattern(pal);
    if (cp) { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = cp; g.fillRect((v.panX + this.offX) * d, (v.panY + this.offY) * d, sw * v.zoom * d, sh * v.zoom * d); g.restore(); }
    g.imageSmoothingEnabled = v.zoom < 1;
    g.transform(v.zoom, 0, 0, v.zoom, v.panX, v.panY);
    g.drawImage(c.surf as CanvasImageSource, 0, 0);
    g.restore();
    if (!c.split) return;
    g.save();
    g.setTransform(d, 0, 0, d, this.offX * d, this.offY * d);
    const mid = this.cssH / 2;
    g.fillStyle = pal.accent;
    g.fillRect(c.x - 1, -this.offY, 2, this.cssH + 2 * this.offY);
    g.beginPath(); g.arc(c.x, mid, 11, 0, Math.PI * 2); g.fill();
    g.strokeStyle = pal.antsB; g.lineWidth = 2;
    g.beginPath(); g.moveTo(c.x - 3, mid - 4); g.lineTo(c.x - 7, mid); g.lineTo(c.x - 3, mid + 4); g.moveTo(c.x + 3, mid - 4); g.lineTo(c.x + 7, mid); g.lineTo(c.x + 3, mid + 4); g.stroke();
    g.restore();
  }

  toolKeydown(e: KeyboardEvent): boolean {
    if ((isMac ? e.metaKey : e.ctrlKey) && !e.repeat && Stage.pixelMoveTools.has(this.tool()?.id ?? '') && !this.pixelDrag) {
      const step = e.shiftKey ? 10 : 1, d = e.key === 'ArrowLeft' ? [-step, 0] : e.key === 'ArrowRight' ? [step, 0] : e.key === 'ArrowUp' ? [0, -step] : e.key === 'ArrowDown' ? [0, step] : null;
      if (d && this.engine.nudgePixels(d[0], d[1], e.altKey)) return true;
    }
    return this.tool()?.keydown?.(this.ctx, e) ?? false;
  }

  /** True when the tool in use holds something Edit > Undo takes back before any history step (probe: only asks). */
  toolUndo(probe = false): boolean { return this.tool()?.undoPending?.(this.ctx, probe) ?? false; }

  cancelTool(): void {
    if (this.pixelDrag) { this.pixelDrag = null; this.engine.cancelPixelMove(); return; }
    this.tool()?.cancel?.(this.ctx);
  }

  /** Touch gestures (1.58.6, the parity plan's L12), as on a tablet: one finger works the tool; a second finger undoes
   *  whatever the first began and starts a gesture, in which the fingers' spread zooms about their midpoint, the
   *  midpoint's travel pans, and turning them turns the view once past 10 degrees (a pinch alone never turns it). A
   *  quick tap of two fingers undoes, of three redoes, as tablet painting apps do. Capture-phase listeners, so
   *  the tools never see a gesture's fingers; pens and mice pass straight through. */
  private bindTouch(): void {
    const o = this.overlay, touches = new Map<number, { x: number; y: number; x0: number; y0: number; t: number }>();
    let g: { d0: number; a0: number; mx: number; my: number; z0: number; r0: number; turning: boolean; t0: number; moved: boolean; fingers: number } | null = null;
    // Fingers are measured against the stage's host, which never turns, as `pointer` does: the overlay itself is
    // turned with the view, so its box grows and moves as the view turns.
    const box = (): DOMRect => this.rect ?? this.host.getBoundingClientRect();
    const local = (e: PointerEvent): { x: number; y: number } => { const r = box(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const pair = (): { d: number; ang: number; mx: number; my: number } => {
      const [a, b] = [...touches.values()];
      return { d: Math.hypot(b.x - a.x, b.y - a.y), ang: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    };
    const baseline = (): void => {
      if (!g || touches.size !== 2) return;
      const v = this.engine.current?.viewport, q = pair();
      Object.assign(g, { d0: q.d, a0: q.ang, mx: q.mx, my: q.my, z0: v?.zoom ?? 1, r0: v?.rotation ?? 0, turning: false });
    };
    o.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || !Stage.controls.touch) return;
      const p = local(e);
      touches.set(e.pointerId, { ...p, x0: p.x, y0: p.y, t: performance.now() });
      if (touches.size < 2 && !g) return;   // one finger: the tool, as ever
      e.stopImmediatePropagation(); e.preventDefault();
      if (!g) {
        // A second finger: what the first began is cancelled, so a gesture leaves no mark.
        if (this.dragId !== null) {
          const id = this.dragId;
          this.dragId = null; this.panLast = null; this.tool()?.cancel?.(this.ctx);
          if (o.hasPointerCapture(id)) o.releasePointerCapture(id);
        }
        // A finger that was already drawing (it has travelled, or went down earlier) means this is no tap.
        const all = [...touches.values()];
        g = { d0: 1, a0: 0, mx: 0, my: 0, z0: 1, r0: 0, turning: false, t0: Math.min(...all.map((f) => f.t)), moved: all.some((f) => Math.hypot(f.x - f.x0, f.y - f.y0) > 10), fingers: touches.size };
        baseline();
      } else { g.fingers = Math.max(g.fingers, touches.size); baseline(); }
      o.setPointerCapture(e.pointerId);
    }, true);
    // A finger's new position, and the gesture's step from it. A lift runs it too with the lift's own position, since
    // the browser can deliver a finger's last move with its lift (the turn and spread would otherwise stop short).
    const step = (e: PointerEvent): void => {
      const t = touches.get(e.pointerId);
      if (!t || !g) return;
      const p = local(e);
      t.x = p.x; t.y = p.y;
      if (Math.hypot(t.x - t.x0, t.y - t.y0) > 10) g.moved = true;
      const v = this.engine.current?.viewport;
      if (touches.size !== 2 || !v) return;
      const q = pair(), r = box();
      // Pan by the midpoint's travel, turned into the view's frame as the wheel and the middle button do.
      const dx = q.mx - g.mx, dy = q.my - g.my, ra = (-v.rotation * Math.PI) / 180;
      g.mx = q.mx; g.my = q.my;
      this.engine.pan((dx * Math.cos(ra) - dy * Math.sin(ra)) * (v.flipped ? -1 : 1), dx * Math.sin(ra) + dy * Math.cos(ra));
      // Zoom by the spread about the midpoint, which stays under the fingers.
      this.engine.zoomTo(g.z0 * (q.d / Math.max(1, g.d0)), Stage.unturn(q.mx, q.my, r.width, r.height, this.engine.current?.viewport.rotation ?? 0, Stage.parOf(this.engine), v.flipped));
      // Turn once the fingers have turned past 10 degrees.
      const turn = ((q.ang - g.a0) * 180) / Math.PI, wrapped = ((turn + 540) % 360) - 180;
      if (!g.turning && Math.abs(wrapped) > 10) g.turning = true;
      if (g.turning) this.engine.setViewRotation(g.r0 + wrapped);
    };
    o.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch' || !touches.has(e.pointerId)) return;
      if (!g) { const t = touches.get(e.pointerId), p = local(e); if (t) { t.x = p.x; t.y = p.y; } return; }
      e.stopImmediatePropagation();
      step(e);
    }, true);
    const lift = (e: PointerEvent): void => {
      if (e.pointerType !== 'touch' || !touches.has(e.pointerId)) return;
      if (g && e.type === 'pointerup') step(e);   // the finger's last position first
      touches.delete(e.pointerId);
      if (!g) return;
      e.stopImmediatePropagation();
      if (o.hasPointerCapture(e.pointerId)) o.releasePointerCapture(e.pointerId);
      if (touches.size === 0) {
        // A quick tap: two fingers undo, three redo.
        if (!g.moved && performance.now() - g.t0 < 350 && e.type === 'pointerup') { if (g.fingers === 2) this.engine.undo(); else if (g.fingers === 3) this.engine.redo(); }
        g = null;
      } else baseline();   // with one finger left the gesture holds (no stroke) until it lifts
    };
    o.addEventListener('pointerup', lift, true);
    o.addEventListener('pointercancel', lift, true);
  }

  private bindPointer(): void {
    const o = this.overlay;
    o.addEventListener('pointerdown', (e) => {
      if (this.dragId !== null || !this.engine.current) return;
      this.engine.stopFlick();
      this.flickTrail = [];
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body) active.blur();
      e.preventDefault();
      const p = this.pointer(e, e.detail);
      const eraserEnd = Stage.controls.penEraser && Stage.isPenEraser(e);
      if (this.penBack && !eraserEnd) { const back = this.penBack; this.penBack = null; this.engine.setTool(back); }
      if (eraserEnd) {
        p.button = 0;
        if (this.engine.tool !== 'eraser') { this.penBack = this.engine.tool; this.engine.setTool('eraser'); }
      }
      if (e.button === 1 || (e.button === 0 && this.space)) {
        o.setPointerCapture(e.pointerId);
        this.dragId = e.pointerId;
        this.panLast = p.screen;
        // Ctrl or Cmd with the middle button, or with Space held, drags to zoom about the first point (up zooms in).
        this.zoomDrag = (e.ctrlKey || e.metaKey) ? { at: p.screen, y: p.screen.y, z0: this.engine.current?.viewport.zoom ?? 1 } : null;
        this.updateCursor(p);
        return;
      }
      // Right-drag, or Ctrl+Option-drag on the Mac (where Ctrl-click is a right click that never arrives as one), sizes the tip.
      const tipKeys = e.button === 2 || (isMac && e.button === 0 && e.ctrlKey && e.altKey && !e.metaKey);
      if (tipKeys && Stage.brushTools.has(this.tool()?.id ?? '') && !this.space && this.engine.beginTipDrag(p.doc, p.screen.x, p.screen.y)) {
        o.setPointerCapture(e.pointerId);
        this.dragId = e.pointerId;
        this.tipDragging = true;
        return;
      }
      if (e.button !== 0 && !eraserEnd) return;
      // Ctrl+Alt+Cmd (Ctrl+Alt+Shift off the Mac) picks the layer under the pointer with any tool; Cmd+Shift-click with
      // the Move tool adds or removes it from the selection.
      if (e.ctrlKey && e.altKey && (isMac ? e.metaKey : e.shiftKey)) {
        const hit = this.engine.layerAt(p.doc);
        if (hit) this.engine.selectLayer(hit);
        return;
      }
      if (p.mod && p.shift && !p.alt && this.tool()?.id === 'move' && !this.engine.current?.selection?.valueAt(Math.floor(p.doc.x), Math.floor(p.doc.y))) {
        const hit = this.engine.layerAt(p.doc);
        if (hit) { this.engine.selectLayer(hit, 'toggle'); return; }
      }
      o.setPointerCapture(e.pointerId);
      this.dragId = e.pointerId;
      const gi = this.tool()?.id === 'move' ? this.engine.guideAt(p.screen) : null;
      if (gi !== null) {
        const g = (this.engine.current?.doc.guides ?? [])[gi];
        this.engine.selectGuide(gi, p.shift);
        this.engine.guideDraft = { axis: g.axis, at: g.at, index: gi };
        this.engine.emit('overlay', null);
        return;
      }
      if (this.tool()?.id === 'move') this.engine.clearGuideSelection();
      if (p.mod && Stage.pixelMoveTools.has(this.tool()?.id ?? '')) {
        const sel = this.engine.current?.selection;
        if (sel && sel.valueAt(Math.floor(p.doc.x), Math.floor(p.doc.y)) >= 128 && this.engine.beginPixelMove(p.alt)) { this.pixelDrag = { x: p.doc.x, y: p.doc.y }; return; }
      }
      this.tool()?.down?.(this.ctx, p);
      this.updateCursor(p);
    });
    o.addEventListener('pointermove', (e) => {
      if (this.dragId === e.pointerId) {
        if (this.panLast) {
          const p = this.pointer(e);
          if (this.zoomDrag) { this.engine.zoomTo(this.zoomDrag.z0 * Math.exp((this.zoomDrag.y - p.screen.y) * 0.01), this.zoomDrag.at); return; }
          this.engine.pan(p.screen.x - this.panLast.x, p.screen.y - this.panLast.y);
          this.panLast = p.screen;
          this.flickTrail.push({ t: performance.now(), x: p.screen.x, y: p.screen.y });
          if (this.flickTrail.length > 8) this.flickTrail.shift();
          return;
        }
        if (this.tipDragging) { const q = this.pointer(e).screen; this.engine.updateTipDrag(q.x, e.shiftKey, q.y); return; }
        const gd = this.engine.guideDraft;
        if (gd && gd.index !== null) { const pd = this.pointer(e).doc; gd.at = gd.axis === 'x' ? pd.x : pd.y; this.engine.emit('overlay', null); return; }
        if (this.pixelDrag) {
          const pd = this.pointer(e).doc;
          let dx = pd.x - this.pixelDrag.x, dy = pd.y - this.pixelDrag.y;
          if (e.shiftKey) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0; }
          this.engine.movePixelsBy(dx, dy);
          return;
        }
        const t = this.tool();
        if (!t?.move) return;
        const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
        for (const ev of events.length ? events : [e]) t.move(this.ctx, this.pointer(ev));
        this.edgeScroll(e);
        return;
      }
      if (this.dragId !== null) return;
      const p = this.pointer(e);
      this.hover = p;
      this.tool()?.hover?.(this.ctx, p);
      this.updateCursor(p);
    });
    const finish = (e: PointerEvent, cancel: boolean): void => {
      if (this.dragId !== e.pointerId) return;
      this.dragId = null;
      this.stopEdge();
      if (o.hasPointerCapture(e.pointerId)) o.releasePointerCapture(e.pointerId);
      const p = this.pointer(e);
      stickyModifiers.endGesture();   // a modifier tapped for the next gesture is spent once it ends
      if (this.panLast) {
        const trail = this.flickTrail, last = trail[trail.length - 1], first = trail.find((s) => last && last.t - s.t <= 100);
        if (!this.zoomDrag && last && first && first !== last && performance.now() - last.t < 80) this.flickBy((last.x - first.x) / (last.t - first.t), (last.y - first.y) / (last.t - first.t));
        this.flickTrail = [];
        this.panLast = null; this.zoomDrag = null; this.updateCursor(p); return;
      }
      if (this.tipDragging) {
        this.tipDragging = false;
        const click = !cancel && (this.engine.tipDrag?.moved ?? 99) < 4;
        this.engine.endTipDrag();
        if (click && this.engine.brushRightClick === 'picker') this.engine.uiHooks.brushPicker?.(e.clientX, e.clientY);
        this.updateCursor(p);
        return;
      }
      const gd = this.engine.guideDraft;
      if (gd && gd.index !== null) {
        this.engine.guideDraft = null;
        const off = p.screen.x < 0 || p.screen.y < 0 || p.screen.x > this.cssW || p.screen.y > this.cssH;
        const onRuler = this.engine.view.rulers && (gd.axis === 'x' ? p.screen.x < RULER : p.screen.y < RULER);
        if (cancel) this.engine.emit('overlay', null);
        else if (off || onRuler) this.engine.removeGuide(gd.index);
        else this.engine.moveGuide(gd.index, gd.at);
        return;
      }
      if (this.pixelDrag) { this.pixelDrag = null; if (cancel) this.engine.cancelPixelMove(); else this.engine.endPixelMove(); this.updateCursor(p); return; }
      const t = this.tool();
      if (cancel) t?.cancel?.(this.ctx);
      else t?.up?.(this.ctx, p);
      if (this.penBack) { const back = this.penBack; this.penBack = null; this.engine.setTool(back); }
      this.updateCursor(p);
    };
    o.addEventListener('pointerup', (e) => finish(e, false));
    o.addEventListener('pointercancel', (e) => finish(e, true));
    o.addEventListener('lostpointercapture', (e) => finish(e, true));
    o.addEventListener('pointerleave', () => {
      if (this.dragId !== null) return;
      this.hover = null;
      this.tool()?.hover?.(this.ctx, null);
    });
    o.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.engine.stopFlick();
      if (this.tool()?.wheel?.(this.ctx, e)) return;
      const v = this.engine.current?.viewport;
      if (!v) return;
      if (!Stage.controls.pinch && e.ctrlKey && !Number.isInteger(e.deltaY)) return;   // a trackpad pinch arrives as Ctrl+wheel with fractional steps
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.cssH : 1;
      // Preferences > Tools > Zoom with Scroll Wheel swaps the two: the wheel zooms and Ctrl or Cmd with it scrolls.
      // Alt with the wheel always zooms at the pointer (some systems turn Alt+wheel into a sideways delta).
      if (e.altKey || (e.ctrlKey || e.metaKey) !== Stage.prefs.zoomWheel) {
        this.engine.zoomTo(v.zoom * Math.exp(-(e.deltaY || e.deltaX) * unit * 0.0025), this.pointer(e).screen);
        return;
      }
      const horizontal = e.shiftKey && !e.deltaX;
      // Scrolling moves the image the way the pointer sees it, the view turned or not.
      const px = -(horizontal ? e.deltaY : e.deltaX) * unit, py = -(horizontal ? 0 : e.deltaY) * unit, ra = (-v.rotation * Math.PI) / 180;
      this.engine.pan((px * Math.cos(ra) - py * Math.sin(ra)) * (v.flipped ? -1 : 1), px * Math.sin(ra) + py * Math.cos(ra));
    }, { passive: false });
    // WebKit (Safari and the macOS desktop WebView) reports a trackpad pinch as gesture events, not Ctrl+wheel. Like
    // the magnify, it zooms about the pointer, here by the gesture's scale since it began.
    let pinch: { z0: number; r0: number } | null = null;
    const gesture = (e: Event): { scale: number; rotation?: number; clientX: number; clientY: number } => e as unknown as { scale: number; rotation?: number; clientX: number; clientY: number };
    o.addEventListener('gesturestart', (e) => { e.preventDefault(); pinch = { z0: this.engine.current?.viewport.zoom ?? 1, r0: this.engine.current?.viewport.rotation ?? 0 }; });
    o.addEventListener('gesturechange', (e) => {
      e.preventDefault();
      const g = gesture(e);
      if (!pinch || !this.engine.current || !(g.scale > 0)) return;
      if (Stage.controls.rotate && typeof g.rotation === 'number') this.engine.setViewRotation(pinch.r0 + g.rotation);   // Enhanced Controls: the trackpad turns the view
      if (!Stage.controls.pinch) return;
      const r = o.getBoundingClientRect();
      this.engine.zoomTo(pinch.z0 * g.scale, { x: g.clientX - r.left, y: g.clientY - r.top });
    });
    o.addEventListener('gestureend', (e) => { e.preventDefault(); pinch = null; });
    o.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const gi = this.engine.guideAt(this.pointer(e).screen, 4, true);
      if (gi === null || !this.engine.uiHooks.guideMenu) return;
      e.stopPropagation();
      if (!this.engine.selectedGuides.includes(gi)) this.engine.selectGuide(gi);
      this.engine.uiHooks.guideMenu(e.clientX, e.clientY);
    });
  }
}
