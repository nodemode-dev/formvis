import { createSurface, integral, intersectRect, sizeSurface, translation, type Engine, type Pt, type Surface } from '../engine';
import { getTool, type Tool, type ToolContext, type ToolPointer, type ViewInfo } from '../extensions/registry';
import { isMac, q, setHidden } from './dom';
import { paint, type StagePaint } from './palette';

const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Stage {
  readonly ctx: ToolContext;
  private readonly scene: HTMLCanvasElement;
  private readonly overlay: HTMLCanvasElement;
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
  private cursor = '';
  private hover: ToolPointer | null = null;
  private checker: { key: string; pattern: CanvasPattern } | null = null;

  constructor(private readonly host: HTMLElement, private readonly engine: Engine) {
    this.scene = q<HTMLCanvasElement>(host, '.cv-scene');
    this.overlay = q<HTMLCanvasElement>(host, '.cv-overlay-canvas');
    this.welcome = q(host, '.cv-welcome');
    const s = this.scene.getContext('2d');
    const o = this.overlay.getContext('2d');
    if (!s || !o) throw new Error('2D canvas is unavailable');
    this.sctx = s;
    this.octx = o;
    this.ctx = { engine, view: () => this.viewInfo(), paint: () => paint(), antsPhase: () => this.phase };
    new ResizeObserver(() => this.resize()).observe(host);
    window.addEventListener('resize', () => this.resize());
    for (const k of ['render', 'viewport', 'active'] as const) engine.on(k, () => this.queue(true, true));
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
    this.engine.setViewSize(w, h);
    this.renderScene();
    this.renderOverlay();
  }

  restyle(): void { this.checker = null; this.queue(true, true); }

  private queue(scene: boolean, overlay: boolean): void {
    this.wantScene ||= scene;
    this.wantOverlay ||= overlay;
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.wantScene) this.renderScene();
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

  private renderScene(): void {
    this.wantScene = false;
    const g = this.sctx;
    const W = this.scene.width, H = this.scene.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    const p = this.engine.current;
    if (!p) return;
    const pal = paint();
    const v = p.viewport;
    const z = v.zoom * this.dpr, ox = v.panX * this.dpr, oy = v.panY * this.dpr;
    const docRect = { x: ox, y: oy, w: p.doc.width * z, h: p.doc.height * z };
    g.lineWidth = 1;
    g.strokeStyle = pal.edge;
    g.strokeRect(Math.round(docRect.x) - 0.5, Math.round(docRect.y) - 0.5, Math.round(docRect.w) + 1, Math.round(docRect.h) + 1);
    const vis = intersectRect(integral(docRect), { x: 0, y: 0, w: W, h: H });
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

  private renderOverlay(): void {
    this.wantOverlay = false;
    const g = this.octx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.overlay.width, this.overlay.height);
    const p = this.engine.current;
    if (!p) return;
    const pal = paint();
    const v = p.viewport;
    const sel = p.selection;
    if (sel) {
      const shift = this.engine.outlineShift(p);
      const d = this.dpr;
      const m = new DOMMatrix([v.zoom * d, 0, 0, v.zoom * d, (v.panX + (shift?.dx ?? 0) * v.zoom) * d, (v.panY + (shift?.dy ?? 0) * v.zoom) * d]);
      const path = new Path2D();
      path.addPath(sel.outline(), m);
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
    const need = !!this.engine.current?.selection && !REDUCED;
    if (need && !this.antsTimer) this.antsTimer = window.setInterval(() => { this.phase = (this.phase + 1) % 8; this.queue(false, true); }, 140);
    else if (!need && this.antsTimer) { window.clearInterval(this.antsTimer); this.antsTimer = 0; }
  }

  private pointer(e: MouseEvent, clicks = 0): ToolPointer {
    const r = this.rect ?? this.host.getBoundingClientRect();
    const screen = { x: e.clientX - r.left, y: e.clientY - r.top };
    const v = this.engine.current?.viewport;
    return { doc: v ? v.toDoc(screen.x, screen.y) : screen, screen, button: e.button, shift: e.shiftKey, alt: e.altKey, mod: isMac ? e.metaKey : e.ctrlKey, clicks };
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
      if (e.button !== 0) return;
      o.setPointerCapture(e.pointerId);
      this.dragId = e.pointerId;
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
    o.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
