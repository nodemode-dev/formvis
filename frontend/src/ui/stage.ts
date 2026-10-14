import { applyLut } from '../engine/colour-lut';
import { applyDuotoneLut, duotoneLut } from '../engine/duotone';
import { createSurface, integral, intersectRect, sizeSurface, translation, unionRect, type AlphaChannel, type Engine, type Pt, type Rect, type Surface } from '../engine';
import type { Project } from '../engine/project';
import { getTool, type Tool, type ToolContext, type ToolPointer, type ViewInfo } from '../extensions/registry';
import { isMac, q, setHidden } from './dom';
import { paint, type StagePaint } from './palette';
import type { DisplayLayer, ScreenDisplay } from '../gpu/display';
import { documentFallback } from '../gpu/fallback';

const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Ruler thickness in CSS pixels; the rulers lie over the stage's top and left edges, so showing them moves nothing. */
const RULER = 18;

import { drawSlices } from '../extensions/tools/slice';

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
  private space = false;
  /** right-drag with these resizes the brush tip. */
  private static readonly brushTools = new Set(['brush', 'spotHealing', 'remove', 'cloneStamp', 'smear']);
  private tipDragging = false;
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

  constructor(private readonly host: HTMLElement, private readonly engine: Engine) {
    this.scene = q<HTMLCanvasElement>(host, '.cv-scene');
    this.gpuCanvases = Array.from(host.querySelectorAll<HTMLCanvasElement>('.cv-scene-gpu'));
    this.overlay = q<HTMLCanvasElement>(host, '.cv-overlay-canvas');
    this.rulerH = q<HTMLCanvasElement>(host, '.cv-ruler-h');
    this.rulerV = q<HTMLCanvasElement>(host, '.cv-ruler-v');
    for (const [r, axis] of [[this.rulerH, 'y'], [this.rulerV, 'x']] as const) this.bindRuler(r, axis);
    this.welcome = q(host, '.cv-welcome');
    const s = this.scene.getContext('2d');
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
    for (const k of ['overlay', 'options'] as const) engine.on(k, () => this.queue(false, true));
    engine.on('projects', () => { this.queue(true, true); this.syncAnts(); this.syncWelcome(); this.updateCursor(); });
    engine.on('selection', () => { this.queue(false, true); this.syncAnts(); });
    engine.on('tool', () => { this.queue(false, true); this.updateCursor(); });
    this.bindTouch();   // 1.58.6: before the tools' handling, so a gesture's fingers never reach them
    this.bindPointer();
    this.syncWelcome();
    this.resize();
  }

  private tool(): Tool | undefined { return getTool(this.engine.tool); }

  private viewInfo(): ViewInfo {
    const v = this.engine.current?.viewport;
    const zoom = v?.zoom ?? 1, px = v?.panX ?? 0, py = v?.panY ?? 0;
    return {
      zoom, dpr: this.dpr, width: this.cssW, height: this.cssH,
      toScreen: (p) => ({ x: p.x * zoom + px, y: p.y * zoom + py }),
      toDoc: (p) => ({ x: (p.x - px) / zoom, y: (p.y - py) / zoom }),
    };
  }

  private resize(): void {
    const r = this.host.getBoundingClientRect();
    this.rect = r;
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (w === this.cssW && h === this.cssH && dpr === this.dpr) return;
    this.cssW = w;
    this.cssH = h;
    if (dpr !== this.dpr) this.checker = null;
    this.dpr = dpr;
    for (const c of [this.scene, this.overlay, ...this.gpuCanvases]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    this.rulerH.width = Math.round(w * dpr); this.rulerH.height = Math.round(RULER * dpr);
    this.rulerV.width = Math.round(RULER * dpr); this.rulerV.height = Math.round(h * dpr);
    this.engine.setViewSize(w, h);
    this.renderScene();
    this.renderOverlay();
  }

  restyle(): void { this.checker = null; this.queue(true, true); }

  /** The document region the next scene frame must repaint: undefined nothing pending, null everything, else the
   *  union of the stroke regions reported since the last frame. Any full request wins until the frame runs. */
  private pending: Rect | null | undefined = undefined;

  private queue(scene: boolean, overlay: boolean, region: Rect | null = null): void {
    this.wantScene ||= scene;
    this.wantOverlay ||= overlay;
    if (scene) this.pending = region && this.pending !== null ? (this.pending ? unionRect(this.pending, region) : region) : null;
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const region = this.pending ?? null;
      this.pending = undefined;
      if (this.wantScene) this.renderScene(region);
      if (this.wantOverlay) this.renderOverlay();
    });
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
      const vz = p.viewport.zoom * this.dpr, gl = this.engine.gpuLayers({ matrix: [vz, 0, 0, vz, p.viewport.panX * this.dpr, p.viewport.panY * this.dpr], width: W, height: H });   // the view, for a giant document's tiles (1.62.9)
      const reason = (this.engine.view.patternPreview || this.engine.view.pixelArt ? 'Pattern Preview and Pixel Art Preview are drawn on the CPU' : null) ?? (this.engine.viewTransform ?'Proof Colors and colour-managed viewing are drawn on the CPU' : null) ?? (p.doc.mode === 'duotone' ? 'Duotone documents are drawn on the CPU' : null) ?? (p.doc.mode === 'multichannel' ? 'Multichannel documents are drawn on the CPU' : null) ?? documentFallback(gl, W, H, { maxTexture: this.gpu.maxTexture, memoryBytes: this.gpuLimit }) ?? ('layers' in gl ? this.gpu.unsupported?.(gl.layers) ?? null : null);
      if (!reason && 'layers' in gl) gpuLayers = gl.layers;
      if (reason !== this.gpuReason) {
        this.gpuReason = reason;
        console.info(reason ? `formvis: drawing on the CPU, because ${reason}` : 'formvis: drawing on the GPU (WebGPU)');
        this.gpuState?.(reason);
      }
      if (gpuLayers) region = null;
    }
    this.showGpu(!!gpuLayers);
    const v = p.viewport;
    const z = v.zoom * this.dpr, ox = v.panX * this.dpr, oy = v.panY * this.dpr;
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
        g.globalAlpha = alpha;
        g.strokeStyle = Stage.prefs.gridColor || pal.grid;
        g.beginPath();
        for (let x = step; x < W; x += step) { const sx = Math.round(x0 + x * v.zoom) + 0.5; g.moveTo(sx, y0); g.lineTo(sx, y1); }
        for (let y = step; y < H; y += step) { const sy = Math.round(y0 + y * v.zoom) + 0.5; g.moveTo(x0, sy); g.lineTo(x1, sy); }
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    const draft = this.engine.guideDraft, guides = (p.doc.guides ?? []).map((x, i) => (draft && draft.index === i ? null : x));
    if (vw.guides || draft) {
      g.strokeStyle = Stage.prefs.guideColor || pal.accent;
      g.beginPath();
      for (const x of [...guides, draft].filter((q): q is NonNullable<typeof q> => !!q && (vw.guides || q === draft))) {
        if (x.axis === 'x') { const sx = Math.round(v.panX + x.at * v.zoom) + 0.5; g.moveTo(sx, 0); g.lineTo(sx, this.cssH); }
        else { const sy = Math.round(v.panY + x.at * v.zoom) + 0.5; g.moveTo(0, sy); g.lineTo(this.cssW, sy); }
      }
      g.stroke();
    }
    g.restore();
  }

  /** A major tick step in document pixels at least 60 screen pixels apart, from 1, 2, 5 and their powers of ten. */
  /** Preferences the stage draws with (set by the app from Preferences): the checkerboard's cell, what the wheel does,
   *  the rulers' units, and the grid's and guides' colours ('' is the theme's). */
  static prefs: { cell: number; zoomWheel: boolean; rulerUnits: 'px' | 'in' | 'cm' | 'mm' | '%'; gridColor: string; guideColor: string } = { cell: 8, zoomWheel: false, rulerUnits: 'px', gridColor: '', guideColor: '' };

  static unturn(x: number, y: number, w: number, h: number, deg: number): { x: number; y: number } {
    if (!deg) return { x, y };
    const a = (-deg * Math.PI) / 180, cx = w / 2, cy = h / 2, dx = x - cx, dy = y - cy;
    return { x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a) };
  }

  /** The drawing surfaces turned as the view is (CSS, about the stage's centre); every renderer draws as it always has. */
  private turn(): void {
    const deg = this.engine.current?.viewport.rotation ?? 0, t = deg ? `rotate(${deg}deg)` : '';
    for (const c of Array.from(this.host.querySelectorAll<HTMLElement>(':scope > canvas'))) if (c.style.transform !== t) c.style.transform = t;
    this.host.classList.toggle('is-turned', !!deg);
  }

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
    // ticks at round steps of that unit, as Photoshop's.
    const res = p.doc.resolution || 72, u = Stage.prefs.rulerUnits;
    for (const [c, horiz] of [[this.rulerH, true], [this.rulerV, false]] as const) {
      const k = u === 'in' ? res : u === 'cm' ? res / 2.54 : u === 'mm' ? res / 25.4 : u === '%' ? (horiz ? p.doc.width : p.doc.height) / 100 : 1;
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
      const first = Math.floor(-pan / zk / minor) * minor;
      for (let t = first; t * zk + pan <= len; t += minor) {
        const s = Math.round(t * zk + pan) + 0.5, isMajor = Math.abs(t / step - Math.round(t / step)) < 1e-6, tick = isMajor ? RULER : RULER / 3;
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
    t.fillStyle = 'rgba(255, 0, 0, 0.5)';
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
    const sel = p.selection, fl = sel ? null : this.engine.floatingOutline(p);
    // Notes and counts (1.49.6), shown whatever the tool, as Photoshop's: a note as a small sticky square (the one open
    // highlighted), a count as its number by a dot, dark over light so they read on any image.
    {
      const d = this.dpr;
      g.save(); g.setTransform(d, 0, 0, d, 0, 0);
      for (const n of p.doc.notes ?? []) {
        const q = v.toScreen(n.x, n.y), on = n.id === this.engine.activeNote;
        g.fillStyle = on ? pal.accent : '#f5c542'; g.strokeStyle = pal.antsB; g.lineWidth = 1;
        g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q.x + 16, q.y); g.lineTo(q.x + 16, q.y + 11); g.lineTo(q.x + 11, q.y + 16); g.lineTo(q.x, q.y + 16); g.closePath(); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(q.x + 4, q.y + 5); g.lineTo(q.x + 12, q.y + 5); g.moveTo(q.x + 4, q.y + 9); g.lineTo(q.x + 10, q.y + 9); g.strokeStyle = 'rgba(0,0,0,0.55)'; g.stroke();
      }
      g.font = '600 12px Inter, system-ui, sans-serif';
      (p.doc.counts ?? []).forEach((c, i) => {
        const q = v.toScreen(c.x, c.y);
        g.fillStyle = pal.accent; g.beginPath(); g.arc(q.x, q.y, 3, 0, Math.PI * 2); g.fill();
        g.lineWidth = 3; g.strokeStyle = pal.antsB; g.strokeText(String(i + 1), q.x + 5, q.y - 5);
        g.fillStyle = pal.antsA; g.fillText(String(i + 1), q.x + 5, q.y - 5);
      });
      g.restore();
    }
    // Empty frames (the Frame tool) show their placeholder, as Photoshop's: the outline and a cross, never exported.
    for (const f of p.doc.layers) {
      if (!f.frame || !f.visible || p.doc.layers.some((c) => c.parentId === f.id)) continue;
      const r = f.frame, a = v.toScreen(r.x, r.y), b = v.toScreen(r.x + r.w, r.y + r.h), d = this.dpr;
      g.save(); g.setTransform(d, 0, 0, d, 0, 0); g.lineWidth = 1; g.strokeStyle = pal.antsB; g.globalAlpha = 0.7;
      g.beginPath();
      if (r.shape === 'ellipse') g.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, (b.x - a.x) / 2, (b.y - a.y) / 2, 0, 0, Math.PI * 2); else g.rect(a.x + 0.5, a.y + 0.5, b.x - a.x, b.y - a.y);
      g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.moveTo(b.x, a.y); g.lineTo(a.x, b.y);
      g.stroke(); g.restore();
    }
    for (const a of this.engine.shownAlphas(p)) {
      const d = this.dpr;
      g.setTransform(v.zoom * d, 0, 0, v.zoom * d, v.panX * d, v.panY * d); g.imageSmoothingEnabled = v.zoom < 1; g.drawImage(this.alphaTint(p, a), 0, 0); g.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (this.engine.quickMask || this.engine.quickMaskLive) {
      // Quick Mask, or a Selection Brush stroke in progress: a red tint where nothing is selected, in place of the outline; live while a stroke paints it.
      const src = this.quickTint(p);
      if (src) { const d = this.dpr; g.setTransform(v.zoom * d, 0, 0, v.zoom * d, v.panX * d, v.panY * d); g.imageSmoothingEnabled = v.zoom < 1; g.drawImage(src, 0, 0); g.setTransform(1, 0, 0, 1, 0, 0); }
    } else if (sel || fl) {
      const shift = this.engine.outlineShift(p);
      const d = this.dpr;
      const view = new DOMMatrix([v.zoom * d, 0, 0, v.zoom * d, (v.panX + (shift?.dx ?? 0) * v.zoom) * d, (v.panY + (shift?.dy ?? 0) * v.zoom) * d]);
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
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawGuides(g, pal);
    if (this.engine.view.slices && this.tool()?.id !== 'slice' && p.doc.slices?.length) drawSlices(g, p.doc.slices, v.panX, v.panY, v.zoom, pal.accent);
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
    const need = (!!this.engine.current?.selection || this.engine.floatingSelection) && !REDUCED;
    if (need && !this.antsTimer) this.antsTimer = window.setInterval(() => { this.phase = (this.phase + 1) % 8; this.queue(false, true); }, 140);
    else if (!need && this.antsTimer) { window.clearInterval(this.antsTimer); this.antsTimer = 0; }
  }

  /** Pressure from 0 to 1 (DEV_PLAN 28.1): a pen's own; a touch's when the screen reports force; a Force Touch
   *  trackpad's in WebKit (the macOS app), read from `webkitForce`, where 1 is the click and 2 the deep press; else 1. */
  static pressureOf(e: MouseEvent, pen: boolean): number {
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

  private pointer(e: MouseEvent, clicks = 0): ToolPointer {
    const r = this.rect ?? this.host.getBoundingClientRect();
    const v = this.engine.current?.viewport;
    // Rotate View turns the drawing surfaces about the stage's centre; a pointer is turned back into their space, so
    // every tool lands where it points at any angle.
    const screen = Stage.unturn(e.clientX - r.left, e.clientY - r.top, r.width, r.height, v?.rotation ?? 0);
    const pen = 'pointerType' in e && (e as PointerEvent).pointerType === 'pen';
    return { doc: v ? v.toDoc(screen.x, screen.y) : screen, screen, button: e.button, shift: e.shiftKey, alt: e.altKey, mod: isMac ? e.metaKey : e.ctrlKey, clicks, pressure: Stage.pressureOf(e, pen),
      pose: pen ? { tiltX: (e as PointerEvent).tiltX || 0, tiltY: (e as PointerEvent).tiltY || 0, twist: (e as PointerEvent).twist || 0 } : undefined };
  }

  /** Drag out of a ruler to place a guide: the top ruler makes horizontal guides, the left one vertical guides. The
   *  guide lands only when released over the view past the ruler; guides locked or hidden take none. */
  private bindRuler(r: HTMLCanvasElement, axis: 'x' | 'y'): void {
    let id: number | null = null;
    const at = (e: PointerEvent): { doc: Pt; inside: boolean } => {
      const b = this.rect ?? this.host.getBoundingClientRect(), sx = e.clientX - b.left, sy = e.clientY - b.top, v = this.engine.current?.viewport;
      const doc = v ? v.toDoc(sx, sy) : { x: sx, y: sy };
      return { doc, inside: sx >= 0 && sy >= 0 && sx <= b.width && sy <= b.height && (axis === 'y' ? sy > RULER : sx > RULER) };
    };
    r.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !this.engine.current || this.engine.view.guidesLocked) return;
      e.preventDefault();
      r.setPointerCapture(e.pointerId);
      id = e.pointerId;
      const p = at(e).doc;
      this.engine.guideDraft = { axis, at: axis === 'x' ? p.x : p.y, index: null };
      this.engine.emit('overlay', null);
    });
    r.addEventListener('pointermove', (e) => {
      const d = this.engine.guideDraft;
      if (id !== e.pointerId || !d) return;
      const p = at(e).doc;
      d.at = axis === 'x' ? p.x : p.y;
      this.engine.emit('overlay', null);
    });
    const end = (e: PointerEvent, cancel: boolean): void => {
      if (id !== e.pointerId) return;
      id = null;
      const d = this.engine.guideDraft, where = at(e);
      this.engine.guideDraft = null;
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
    return v.toDoc(clientX - r.left, clientY - r.top);
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
    else this.setCursor(this.tool()?.cursor?.(this.ctx, p) ?? 'default');
  }

  setSpace(on: boolean): void {
    if (this.space === on) return;
    this.space = on;
    this.updateCursor();
  }

  toolKeydown(e: KeyboardEvent): boolean { return this.tool()?.keydown?.(this.ctx, e) ?? false; }

  cancelTool(): void { this.tool()?.cancel?.(this.ctx); }

  /** Touch gestures (1.58.6, the parity plan's L12), as on a tablet: one finger works the tool; a second finger undoes
   *  whatever the first began and starts a gesture, in which the fingers' spread zooms about their midpoint, the
   *  midpoint's travel pans, and turning them turns the view once past 10 degrees (a pinch alone never turns it). A
   *  quick tap of two fingers undoes, of three redoes, as Procreate and Photoshop on iPad. Capture-phase listeners, so
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
      if (e.pointerType !== 'touch') return;
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
      this.engine.pan(dx * Math.cos(ra) - dy * Math.sin(ra), dx * Math.sin(ra) + dy * Math.cos(ra));
      // Zoom by the spread about the midpoint, which stays under the fingers.
      this.engine.zoomTo(g.z0 * (q.d / Math.max(1, g.d0)), Stage.unturn(q.mx, q.my, r.width, r.height, this.engine.current?.viewport.rotation ?? 0));
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
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body) active.blur();
      e.preventDefault();
      const p = this.pointer(e, e.detail);
      if (e.button === 1 || (e.button === 0 && this.space)) {
        o.setPointerCapture(e.pointerId);
        this.dragId = e.pointerId;
        this.panLast = p.screen;
        this.updateCursor(p);
        return;
      }
      if (e.button === 2 && Stage.brushTools.has(this.tool()?.id ?? '') && !this.space && this.engine.beginTipDrag(p.doc, p.screen.x)) {
        o.setPointerCapture(e.pointerId);
        this.dragId = e.pointerId;
        this.tipDragging = true;
        return;
      }
      if (e.button !== 0) return;
      o.setPointerCapture(e.pointerId);
      this.dragId = e.pointerId;
      const gi = this.tool()?.id === 'move' ? this.engine.guideAt(p.screen) : null;
      if (gi !== null) {
        const g = (this.engine.current?.doc.guides ?? [])[gi];
        this.engine.guideDraft = { axis: g.axis, at: g.at, index: gi };
        this.engine.emit('overlay', null);
        return;
      }
      this.tool()?.down?.(this.ctx, p);
      this.updateCursor(p);
    });
    o.addEventListener('pointermove', (e) => {
      if (this.dragId === e.pointerId) {
        if (this.panLast) {
          const p = this.pointer(e);
          this.engine.pan(p.screen.x - this.panLast.x, p.screen.y - this.panLast.y);
          this.panLast = p.screen;
          return;
        }
        if (this.tipDragging) { this.engine.updateTipDrag(this.pointer(e).screen.x, e.shiftKey); return; }
        const gd = this.engine.guideDraft;
        if (gd && gd.index !== null) { const pd = this.pointer(e).doc; gd.at = gd.axis === 'x' ? pd.x : pd.y; this.engine.emit('overlay', null); return; }
        const t = this.tool();
        if (!t?.move) return;
        const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
        for (const ev of events.length ? events : [e]) t.move(this.ctx, this.pointer(ev));
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
      if (o.hasPointerCapture(e.pointerId)) o.releasePointerCapture(e.pointerId);
      const p = this.pointer(e);
      if (this.panLast) { this.panLast = null; this.updateCursor(p); return; }
      if (this.tipDragging) { this.tipDragging = false; this.engine.endTipDrag(); this.updateCursor(p); return; }
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
      const t = this.tool();
      if (cancel) t?.cancel?.(this.ctx);
      else t?.up?.(this.ctx, p);
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
      const v = this.engine.current?.viewport;
      if (!v) return;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.cssH : 1;
      // Preferences > Tools > Zoom with Scroll Wheel swaps the two: the wheel zooms and Ctrl or Cmd with it scrolls.
      if ((e.ctrlKey || e.metaKey) !== Stage.prefs.zoomWheel) {
        this.engine.zoomTo(v.zoom * Math.exp(-e.deltaY * unit * 0.0025), this.pointer(e).screen);
        return;
      }
      const horizontal = e.shiftKey && !e.deltaX;
      // Scrolling moves the image the way the pointer sees it, the view turned or not.
      const px = -(horizontal ? e.deltaY : e.deltaX) * unit, py = -(horizontal ? 0 : e.deltaY) * unit, ra = (-v.rotation * Math.PI) / 180;
      this.engine.pan(px * Math.cos(ra) - py * Math.sin(ra), px * Math.sin(ra) + py * Math.cos(ra));
    }, { passive: false });
    // WebKit (Safari and the macOS desktop WebView) reports a trackpad pinch as gesture events, not Ctrl+wheel. Like
    // the magnify, it zooms about the pointer, here by the gesture's scale since it began.
    let pinch: { z0: number } | null = null;
    const gesture = (e: Event): { scale: number; clientX: number; clientY: number } => e as unknown as { scale: number; clientX: number; clientY: number };
    o.addEventListener('gesturestart', (e) => { e.preventDefault(); pinch = { z0: this.engine.current?.viewport.zoom ?? 1 }; });
    o.addEventListener('gesturechange', (e) => {
      e.preventDefault();
      const g = gesture(e);
      if (!pinch || !this.engine.current || !(g.scale > 0)) return;
      const r = o.getBoundingClientRect();
      this.engine.zoomTo(pinch.z0 * g.scale, { x: g.clientX - r.left, y: g.clientY - r.top });
    });
    o.addEventListener('gestureend', (e) => { e.preventDefault(); pinch = null; });
    o.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
