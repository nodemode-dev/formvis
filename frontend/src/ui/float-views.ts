import type { DocView, Engine, FloatRect } from '../engine';
import { bindDocView, drawDocView, fitCanvas } from './view-canvas';

const MIN_W = 180, MIN_H = 120, BAR = 26;
const EDGES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const;
type Edge = typeof EDGES[number];

interface Frame {
  readonly view: DocView;
  readonly root: HTMLElement;
  readonly name: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly ro: ResizeObserver;
  drawn: boolean;
}

/** Window > Arrange > Float in Window, Float All in Windows (DEV_PLAN 36.16): further views of open documents as
 *  draggable, resizable frames inside the stage column, above the tiles. Each frame has its own canvas view (the
 *  DocView's zoom, pan and rotation) of the shared document, so an edit shows in it. The layer is built once; a frame
 *  exists only while its view floats, and moving or resizing patches its styles in place. */
export class FloatViews {
  private readonly layer: HTMLElement;
  private readonly frames = new Map<string, Frame>();
  private frame = 0;
  private stale = false;
  private top = 0;

  constructor(private readonly col: HTMLElement, private readonly engine: Engine) {
    this.layer = document.createElement('div');
    this.layer.className = 'cv-floats';
    this.layer.hidden = true;
    col.appendChild(this.layer);
    engine.on('projects', () => this.sync());
    for (const ev of ['doc', 'history'] as const) engine.on(ev, () => { this.stale = true; this.queue(); });
    engine.on('render', () => { if (this.stale) this.queue(); });
    new ResizeObserver(() => this.keepInside()).observe(col);
    this.sync();
  }

  /** Float in Window: the document (the current one by default) gets a floating view of its own. */
  open(id: string | null = null): void {
    const n = this.frames.size;
    const r = this.col.getBoundingClientRect();
    const w = Math.max(MIN_W, Math.min(440, r.width - 64)), h = Math.max(MIN_H, Math.min(340, r.height - 96));
    this.engine.openView(id, { x: 32 + (n % 6) * 28, y: 48 + (n % 6) * 28, w, h });
  }

  /** Float All in Windows: every open document without a floating view gets one. */
  openAll(): void {
    const had = new Set(this.engine.docViews.list.filter((v) => v.floating).map((v) => v.projectId));
    for (const p of this.engine.projects) if (!had.has(p.id)) this.open(p.id);
  }

  /** Consolidate back: every floating view closes; the documents stay in their tabs. */
  consolidate(): void {
    for (const v of this.engine.docViews.list.filter((x) => x.floating)) this.engine.closeView(v.id);
  }

  get count(): number { return this.engine.docViews.list.filter((v) => v.floating).length; }

  private sync(): void {
    const want = this.engine.docViews.list.filter((v) => v.floating);
    const ids = new Set(want.map((v) => v.id));
    for (const [id, f] of this.frames) {
      if (ids.has(id)) continue;
      f.ro.disconnect();
      f.root.remove();
      this.frames.delete(id);
    }
    for (const v of want) {
      let f = this.frames.get(v.id);
      if (!f) { f = this.make(v); this.frames.set(v.id, f); this.layer.appendChild(f.root); this.raise(f); }
      const p = this.engine.projects.find((x) => x.id === v.projectId);
      const name = p ? `${p.name} (${v.n})` : '';
      if (f.name.textContent !== name) f.name.textContent = name;
      this.place(f);
    }
    if (this.layer.hidden === (want.length > 0)) this.layer.hidden = want.length === 0;
    this.stale = true;
    this.queue();
  }

  private make(view: DocView): Frame {
    const root = document.createElement('div');
    root.className = 'cv-float';
    const bar = document.createElement('div');
    bar.className = 'cv-float-bar';
    const name = document.createElement('div');
    name.className = 'cv-float-name';
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'cv-float-x';
    x.setAttribute('aria-label', 'Consolidate to tab');
    x.title = 'Consolidate to tab';
    x.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 2l6 6M8 2l-6 6"/></svg>';
    bar.append(name, x);
    const canvas = document.createElement('canvas');
    canvas.className = 'cv-float-canvas';
    root.append(bar, canvas);
    for (const e of EDGES) {
      const h = document.createElement('div');
      h.className = 'cv-float-edge';
      h.dataset.e = e;
      root.appendChild(h);
    }
    const f: Frame = { view, root, name, canvas, drawn: false, ro: new ResizeObserver(() => { fitCanvas(canvas); f.drawn = false; this.queue(); }) };
    f.ro.observe(canvas);
    bindDocView(canvas, view, () => { f.drawn = false; this.queue(); }, () => undefined);
    x.addEventListener('click', () => this.engine.closeView(view.id));
    root.addEventListener('pointerdown', (e) => {
      this.raise(f);
      const edge = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>('.cv-float-edge')?.dataset.e as Edge | undefined : undefined;
      if (edge) this.gesture(e, f, edge);
      else if (e.target instanceof Node && bar.contains(e.target) && !x.contains(e.target)) this.gesture(e, f, null);
    });
    return f;
  }

  private raise(f: Frame): void {
    this.top += 1;
    f.root.style.setProperty('--cv-fz', String(this.top));
  }

  /** Patches the frame's box from its view's rectangle; only values that differ are written. */
  private place(f: Frame): void {
    const r = f.view.floating;
    if (!r) return;
    const css: Array<[string, string]> = [['left', `${Math.round(r.x)}px`], ['top', `${Math.round(r.y)}px`], ['width', `${Math.round(r.w)}px`], ['height', `${Math.round(r.h)}px`]];
    for (const [k, v] of css) if (f.root.style.getPropertyValue(k) !== v) f.root.style.setProperty(k, v);
  }

  /** Moves (edge null: the title bar) or resizes (an edge or corner) a frame under the pointer. */
  private gesture(e: PointerEvent, f: Frame, edge: Edge | null): void {
    const r0 = f.view.floating;
    if (!r0 || e.button !== 0) return;
    e.preventDefault();
    const start = { ...r0 }, sx = e.clientX, sy = e.clientY;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent): void => {
      const dx = m.clientX - sx, dy = m.clientY - sy;
      const next: FloatRect = { ...start };
      if (!edge) { next.x = start.x + dx; next.y = start.y + dy; }
      else {
        if (edge.includes('e')) next.w = Math.max(MIN_W, start.w + dx);
        if (edge.includes('s')) next.h = Math.max(MIN_H, start.h + dy);
        if (edge.includes('w')) { next.w = Math.max(MIN_W, start.w - dx); next.x = start.x + start.w - next.w; }
        if (edge.includes('n')) { next.h = Math.max(MIN_H, start.h - dy); next.y = start.y + start.h - next.h; }
      }
      f.view.floating = this.inside(next);
      this.place(f);
    };
    const up = (): void => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  }

  /** Keeps a rectangle's title bar reachable inside the column. */
  private inside(r: FloatRect): FloatRect {
    const W = this.col.clientWidth, H = this.col.clientHeight;
    const w = Math.min(r.w, Math.max(MIN_W, W)), h = Math.min(r.h, Math.max(MIN_H, H));
    return { x: Math.max(-(w - 60), Math.min(r.x, W - 60)), y: Math.max(0, Math.min(r.y, Math.max(0, H - BAR))), w, h };
  }

  private keepInside(): void {
    for (const f of this.frames.values()) {
      const r = f.view.floating;
      if (!r) continue;
      f.view.floating = this.inside(r);
      this.place(f);
    }
  }

  private queue(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.paint(); });
  }

  private paint(): void {
    for (const f of this.frames.values()) {
      if (f.drawn && !this.stale) continue;
      if (!f.canvas.width || !f.canvas.height) continue;
      drawDocView(this.engine, f.view, f.canvas);
      f.drawn = true;
    }
    this.stale = false;
  }
}
