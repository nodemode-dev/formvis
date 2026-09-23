import { createSurface, integral, intersectRect, sizeSurface, translation, unionRect, type Engine, type Pt, type Rect, type Surface } from '../engine';
import { getTool, type Tool, type ToolContext, type ToolPointer, type ViewInfo } from '../extensions/registry';
import { isMac, q, setHidden } from './dom';
import { paint, type StagePaint } from './palette';

const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Ruler thickness in CSS pixels; the rulers lie over the stage's top and left edges, so showing them moves nothing. */
const RULER = 18;

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
  private static readonly brushTools = new Set(['brush', 'spotHealing', 'cloneStamp', 'smear']);
  private tipDragging = false;
  private cursor = '';
  private hover: ToolPointer | null = null;
  private checker: { key: string; pattern: CanvasPattern } | null = null;

  constructor(private readonly host: HTMLElement, private readonly engine: Engine) {
    this.scene = q<HTMLCanvasElement>(host, '.cv-scene');
    this.overlay = q<HTMLCanvasElement>(host, '.cv-overlay-canvas');
    this.rulerH = q<HTMLCanvasElement>(host, '.cv-ruler-h');
    this.rulerV = q<HTMLCanvasElement>(host, '.cv-ruler-v');
    for (const [r, axis] of [[this.rulerH, 'y'], [this.rulerV, 'x']] as const) this.bindRuler(r, axis);
    this.welcome = q(host, '.cv-welcome');
    const s = this.scene.getContext('2d');
    const o = this.overlay.getContext('2d');
    if (!s || !o) throw new Error('2D canvas is unavailable');
    this.sctx = s;
    this.octx = o;
    this.ctx = { engine, view: () => this.viewInfo(), paint: () => paint(), antsPhase: () => this.phase };
    new ResizeObserver(() => this.resize()).observe(host);
    window.addEventListener('resize', () => this.resize());
    engine.on('render', (region) => this.queue(true, true, region));
    for (const k of ['viewport', 'active'] as const) engine.on(k, () => this.queue(true, true));
    for (const k of ['overlay', 'options'] as const) engine.on(k, () => this.queue(false, true));
    engine.on('projects', () => { this.queue(true, true); this.syncAnts(); this.syncWelcome(); this.updateCursor(); });
    engine.on('selection', () => { this.queue(false, true); this.syncAnts(); });
    engine.on('tool', () => { this.queue(false, true); this.updateCursor(); });
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
    for (const c of [this.scene, this.overlay]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
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

  private checkerPattern(pal: StagePaint): CanvasPattern | null {
    const key = `${this.dpr}|${pal.checkerA}|${pal.checkerB}`;
    if (this.checker?.key === key) return this.checker.pattern;
    const cell = Math.max(1, Math.round(8 * this.dpr));
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

  private renderScene(region: Rect | null = null): void {
    this.wantScene = false;
    const g = this.sctx;
    const W = this.scene.width, H = this.scene.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const p = this.engine.current;
    if (!p) { g.clearRect(0, 0, W, H); return; }
    const pal = paint();
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
    if (!vis) return;
    g.save();
    g.beginPath();
    g.rect(vis.x, vis.y, vis.w, vis.h);
    g.clip();
    const pattern = this.checkerPattern(pal);
    if (pattern) {
      pattern.setTransform(new DOMMatrix([1, 0, 0, 1, Math.round(ox), Math.round(oy)]));
      g.fillStyle = pattern;
      g.fillRect(vis.x, vis.y, vis.w, vis.h);
    }
    if (v.zoom >= 2) {
      const d = intersectRect(integral({ x: (vis.x - ox) / z, y: (vis.y - oy) / z, w: vis.w / z, h: vis.h / z }), { x: 0, y: 0, w: p.doc.width, h: p.doc.height });
      if (d) {
        sizeSurface(this.work, d.w, d.h);
        this.engine.compose(this.work, translation(-d.x, -d.y));
        g.imageSmoothingEnabled = false;
        g.drawImage(this.work as CanvasImageSource, 0, 0, d.w, d.h, ox + d.x * z, oy + d.y * z, d.w * z, d.h * z);
      }
    } else {
      sizeSurface(this.work, vis.w, vis.h);
      this.engine.compose(this.work, [z, 0, 0, z, ox - vis.x, oy - vis.y], v.zoom < 0.5 ? 'medium' : 'high');
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
        g.strokeStyle = pal.grid;
        g.beginPath();
        for (let x = step; x < W; x += step) { const sx = Math.round(x0 + x * v.zoom) + 0.5; g.moveTo(sx, y0); g.lineTo(sx, y1); }
        for (let y = step; y < H; y += step) { const sy = Math.round(y0 + y * v.zoom) + 0.5; g.moveTo(x0, sy); g.lineTo(x1, sy); }
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    const draft = this.engine.guideDraft, guides = (p.doc.guides ?? []).map((x, i) => (draft && draft.index === i ? null : x));
    if (vw.guides || draft) {
      g.strokeStyle = pal.accent;
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
    const v = (this.engine.current as NonNullable<Engine['current']>).viewport, pal = paint(), d = this.dpr, step = Stage.rulerStep(v.zoom);
    const minor = step * v.zoom >= 150 ? step / 10 : step / 5;
    for (const [c, horiz] of [[this.rulerH, true], [this.rulerV, false]] as const) {
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
      const first = Math.floor(-pan / v.zoom / minor) * minor;
      for (let t = first; t * v.zoom + pan <= len; t += minor) {
        const s = Math.round(t * v.zoom + pan) + 0.5, isMajor = Math.abs(t / step - Math.round(t / step)) < 1e-6, tick = isMajor ? RULER : RULER / 3;
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
    if (sel || fl) {
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

  private pointer(e: MouseEvent, clicks = 0): ToolPointer {
    const r = this.rect ?? this.host.getBoundingClientRect();
    const screen = { x: e.clientX - r.left, y: e.clientY - r.top };
    const v = this.engine.current?.viewport;
    const pen = 'pointerType' in e && (e as PointerEvent).pointerType === 'pen';
    return { doc: v ? v.toDoc(screen.x, screen.y) : screen, screen, button: e.button, shift: e.shiftKey, alt: e.altKey, mod: isMac ? e.metaKey : e.ctrlKey, clicks, pressure: pen ? Math.min(1, Math.max(0, (e as PointerEvent).pressure)) : 1 };
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
      if (e.ctrlKey || e.metaKey) {
        this.engine.zoomTo(v.zoom * Math.exp(-e.deltaY * unit * 0.0025), this.pointer(e).screen);
        return;
      }
      const horizontal = e.shiftKey && !e.deltaX;
      this.engine.pan(-(horizontal ? e.deltaY : e.deltaX) * unit, -(horizontal ? 0 : e.deltaY) * unit);
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
