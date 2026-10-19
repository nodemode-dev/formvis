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
  lastZoom: number;
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
    let known = new Set(engine.projects.map((p) => p.id));
    engine.on('projects', () => {
      const fresh = engine.projects.filter((p) => !known.has(p.id));
      known = new Set(engine.projects.map((p) => p.id));
      if (!FloatViews.prefs.asTabs) for (const p of fresh) if (!engine.docViews.list.some((v) => v.floating && v.projectId === p.id)) this.open(p.id);
      this.sync();
    });
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

  /** Cascade: the floating frames step down and right from the top left, all one size, the last on top. */
  cascade(): void {
    const r = this.col.getBoundingClientRect();
    const w = Math.max(MIN_W, Math.min(440, r.width - 64)), h = Math.max(MIN_H, Math.min(340, r.height - 96));
    let i = 0;
    for (const v of this.engine.docViews.list.filter((x) => x.floating)) {
      v.floating = { x: 32 + (i % 6) * 28, y: 48 + (i % 6) * 28, w, h };
      const f = this.frames.get(v.id);
      if (f) { this.place(f); this.raise(f); }
      i += 1;
    }
    this.stale = true;
    this.queue();
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
    const f: Frame = { view, root, name, canvas, drawn: false, lastZoom: view.viewport.zoom, ro: new ResizeObserver(() => { fitCanvas(canvas); f.drawn = false; this.queue(); }) };
    f.ro.observe(canvas);
    bindDocView(canvas, view, () => { f.drawn = false; this.zoomFit(f); this.queue(); }, () => undefined);
    x.addEventListener('click', () => this.engine.closeView(view.id));
    root.addEventListener('pointerdown', (e) => {
      this.raise(f);
      const edge = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>('.cv-float-edge')?.dataset.e as Edge | undefined : undefined;
      if (edge) this.gesture(e, f, edge);
      else if (e.target instanceof Node && bar.contains(e.target) && !x.contains(e.target)) this.gesture(e, f, null);
    });
    return f;
  }

  /** Preferences > General and Workspace: Zoom Resizes Windows sizes a floating window to the picture at its new zoom (held to the column); Enable Floating Document Window Docking lets a window dropped on the tab bar go back to its tab. */
  static prefs = { zoomResize: false, docking: true, asTabs: true };

  /** A floating window whose zoom just changed takes the size of the picture at that zoom, centred in the window. */
  private zoomFit(f: Frame): void {
    const v = f.view.viewport, z = v.zoom;
    if (z === f.lastZoom) return;
    f.lastZoom = z;
    const p = this.engine.projects.find((x) => x.id === f.view.projectId), r = f.view.floating;
    if (!FloatViews.prefs.zoomResize || !p || !r) return;
    const w = Math.max(MIN_W, Math.min(this.col.clientWidth, Math.round(p.doc.width * z))), h = Math.max(MIN_H, Math.min(this.col.clientHeight, Math.round(p.doc.height * z) + BAR));
    if (w === Math.round(r.w) && h === Math.round(r.h)) return;
    f.view.floating = this.inside({ ...r, w, h });
    this.place(f);
    v.width = w; v.height = h - BAR;
    v.panX = Math.round((w - p.doc.width * z) / 2); v.panY = Math.round((h - BAR - p.doc.height * z) / 2);
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
      if (!edge) this.tabsOver(m.clientX, m.clientY);
    };
    const up = (u: PointerEvent): void => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      const dock = !edge && u.type === 'pointerup' && this.tabsOver(u.clientX, u.clientY);
      this.tabsOver(-1, -1);
      if (dock) this.engine.closeView(f.view.id);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  }

  /** Whether the point is over the document tabs while docking is on, marking the tabs as the drop target in place. */
  private tabsOver(x: number, y: number): boolean {
    const tabs = document.querySelector('.cv-doc-tabs');
    if (!tabs) return false;
    const r = tabs.getBoundingClientRect(), over = FloatViews.prefs.docking && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    tabs.classList.toggle('is-dock-target', over);
    return over;
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
