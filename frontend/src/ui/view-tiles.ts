import type { DocView, Engine, Project } from '../engine';
import { bindDocView, drawDocView, fitCanvas } from './view-canvas';

export type ArrangeLayout = 'tabs' | '2up-v' | '2up-h' | '3up' | '4up' | '6up';

const KEY = 'formvis.arrange';
const COUNT: Record<ArrangeLayout, number> = { tabs: 0, '2up-v': 1, '2up-h': 1, '3up': 2, '4up': 3, '6up': 5 };
const LAYOUTS = Object.keys(COUNT) as ArrangeLayout[];
/** Editable tiles (36.16): the smallest a tile may be dragged to, in pixels. */
const MIN_TILE = 120;
/** Columns of each grid layout, how many column gutters it has for `k` shown tiles, and whether a second row exists. */
const COLS: Record<ArrangeLayout, number> = { tabs: 0, '2up-v': 2, '2up-h': 1, '3up': 2, '4up': 2, '6up': 3 };
const colGutters = (l: ArrangeLayout, k: number): number => (l === '2up-v' || l === '3up' || l === '4up' ? 1 : l === '6up' ? (k >= 2 ? 2 : 1) : 0);
const hasRow2 = (l: ArrangeLayout, k: number): boolean => (l === '2up-h' ? k >= 1 : l === '3up' || l === '4up' ? k >= 2 : l === '6up' ? k >= 3 : false);
type GutterId = 'v1' | 'v2' | 'h';
interface TileSizes { c1?: number; c2?: number; r1?: number }
interface Entry { readonly key: string; readonly p: Project; readonly view: DocView | null }

interface Tile {
  readonly id: string;
  readonly key: string;
  readonly view: DocView | null;
  readonly root: HTMLElement;
  readonly title: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly ro: ResizeObserver;
  drawn: boolean;
}

/** Window > Arrange. The active document stays the live Stage; the others sit beside it as read-only view tiles. The
 *  tiles container is built once, a tile element exists only while its document is shown, and a redraw touches canvas
 *  pixels only (and the title text when a name changed). */
export class ViewTiles {
  layout: ArrangeLayout = 'tabs';
  private readonly box: HTMLElement;
  private readonly tiles = new Map<string, Tile>();
  private readonly dirty = new Set<string>();   // documents edited since their tile last drew
  private frame = 0;
  private panned = false;   // a press on a view tile travelled: its end is a pan, not a click
  private sizes: TileSizes = {};   // dragged track sizes, kept while the layout stays the same
  private placeFrame = 0;
  private readonly gut: HTMLElement;
  private readonly hs: Record<GutterId, HTMLElement>;

  constructor(private readonly col: HTMLElement, private readonly engine: Engine) {
    this.box = document.createElement('div');
    this.box.className = 'cv-view-tiles';
    this.box.hidden = true;
    const stage = col.querySelector('.cv-stage');
    if (stage && stage.nextSibling) col.insertBefore(this.box, stage.nextSibling); else col.appendChild(this.box);
    // The gutters between tiles: three handles built once, moved in place (never rebuilt) over the grid's gaps.
    this.gut = document.createElement('div');
    this.gut.className = 'cv-gutters';
    this.gut.hidden = true;
    this.hs = { v1: this.handle('v1'), v2: this.handle('v2'), h: this.handle('h') };
    this.gut.append(this.hs.v1, this.hs.v2, this.hs.h);
    col.appendChild(this.gut);
    this.gut.addEventListener('pointerdown', (e) => this.drag(e));
    try {
      const saved = localStorage.getItem(KEY);
      const found = LAYOUTS.find((l) => l === saved);
      if (found) this.layout = found;
    } catch { /* storage unavailable */ }
    for (const ev of ['projects', 'active'] as const) engine.on(ev, () => this.sync());
    for (const ev of ['doc', 'history'] as const) engine.on(ev, () => {
      const cur = engine.current;
      if (cur) this.dirty.add(cur.id);
      this.queue();
    });
    engine.on('render', () => { if (this.dirty.size) this.queue(); });
    this.box.addEventListener('pointerdown', () => { this.panned = false; }, true);
    this.box.addEventListener('click', (e) => {
      if (this.panned) return;
      const hit = e.target instanceof Element ? e.target.closest<HTMLElement>('.cv-view-tile') : null;
      const id = hit?.dataset.id;
      if (id) this.engine.switchTo(id);
    });
    // The properties column opens over the canvas column's right part: tiles keep clear of it, the stage alone
    // passing under it as in one-document view. Measured whenever either column resizes.
    const props = document.querySelector<HTMLElement>('.cv-props-col');
    const clear = (): void => {
      const over = props && !props.hidden ? Math.max(0, Math.round(col.getBoundingClientRect().right - props.getBoundingClientRect().left)) : 0;
      const want = this.layout === 'tabs' ? '' : `${over}px`;
      if (col.style.paddingRight !== want) col.style.paddingRight = want;
      this.queuePlace();
    };
    this.clear = clear;
    const ro = new ResizeObserver(() => clear());
    ro.observe(col);
    if (props) ro.observe(props);
    this.apply();
  }

  private clear: () => void = () => undefined;

  setLayout(l: ArrangeLayout): void {
    this.sizes = {};   // a layout chosen (even the same again) starts from equal tiles
    if (l === this.layout) { this.place(); return; }
    this.layout = l;
    try { localStorage.setItem(KEY, l); } catch { /* storage unavailable */ }
    this.apply();
  }

  private apply(): void {
    this.col.dataset.arrange = this.layout;
    this.box.hidden = this.layout === 'tabs';
    this.clear();
    this.sync();
  }

  /** The views shown as tiles: the current document's own further views first (New Window for Document), then the
   *  next documents after it in open order, each followed by its further views. */
  private pick(): Entry[] {
    const n = COUNT[this.layout], list = this.engine.projects, cur = this.engine.current;
    if (!n) return [];
    const own = (p: Project): Entry[] => this.engine.docViews.of(p.id).filter((v) => !v.floating).map((v) => ({ key: v.id, p, view: v }));
    const out: Entry[] = cur ? own(cur) : [];
    const at = Math.max(0, cur ? list.indexOf(cur) : 0);
    for (let i = 1; i < list.length; i++) {
      const p = list[(at + i) % list.length];
      out.push({ key: p.id, p, view: null }, ...own(p));
    }
    return out.slice(0, n);
  }

  private sync(): void {
    const want = this.pick();
    const keys = new Set(want.map((e) => e.key));
    for (const [key, t] of this.tiles) {
      if (keys.has(key)) continue;
      t.ro.disconnect();
      t.root.remove();
      this.tiles.delete(key);
    }
    want.forEach((e, i) => {
      let t = this.tiles.get(e.key);
      if (!t) { t = this.make(e); this.tiles.set(e.key, t); }
      const name = e.view ? `${e.p.name} (${e.view.n})` : e.p.name;
      if (t.title.textContent !== name) t.title.textContent = name;
      if (this.box.children[i] !== t.root) this.box.insertBefore(t.root, this.box.children[i] ?? null);
    });
    const count = String(want.length);
    if (this.col.dataset.tiles !== count) this.col.dataset.tiles = count;
    this.queue();
    this.queuePlace();
  }

  private make(e: Entry): Tile {
    const root = document.createElement('div');
    root.className = 'cv-view-tile';
    root.dataset.id = e.p.id;
    if (e.view) root.dataset.view = e.view.id;
    const title = document.createElement('div');
    title.className = 'cv-view-tile-title';
    const canvas = document.createElement('canvas');
    canvas.className = 'cv-view-tile-canvas';
    root.append(title, canvas);
    const tile: Tile = { id: e.p.id, key: e.key, view: e.view, root, title, canvas, drawn: false, ro: new ResizeObserver(() => this.fit(tile)) };
    tile.ro.observe(canvas);
    // A further view owns its zoom, pan and rotation: its wheel, drag and double click act on that view alone.
    if (e.view) bindDocView(canvas, e.view, () => { tile.drawn = false; this.queue(); }, () => { this.panned = true; });
    return tile;
  }

  /** The canvas box changed: match the backing store to it (only when different) and redraw. */
  private fit(t: Tile): void {
    fitCanvas(t.canvas);
    t.drawn = false;
    this.queue();
  }

  private queue(): void {
    if (this.frame || this.layout === 'tabs') return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.paint(); });
  }

  private paint(): void {
    const dpr = window.devicePixelRatio || 1;
    const redrawn = new Set<string>();   // a document may show in several tiles: all draw before it stops being dirty
    for (const t of this.tiles.values()) {
      if (t.drawn && !this.dirty.has(t.id)) continue;
      const p = this.engine.projects.find((x) => x.id === t.id);
      const ctx = t.canvas.getContext('2d');
      if (!p || !ctx || !t.canvas.width || !t.canvas.height) continue;
      if (t.view) { drawDocView(this.engine, t.view, t.canvas); t.drawn = true; redrawn.add(t.id); continue; }
      ctx.clearRect(0, 0, t.canvas.width, t.canvas.height);
      const src = this.engine.flattenedOf(p);
      if (src) {
        const pad = 8 * dpr;
        const k = Math.min((t.canvas.width - pad * 2) / src.width, (t.canvas.height - pad * 2) / src.height);
        const w = Math.max(1, src.width * k), h = Math.max(1, src.height * k);
        ctx.imageSmoothingEnabled = k < 2;   // enlarged 2x or more, pixels stay crisp as on the stage
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(src, (t.canvas.width - w) / 2, (t.canvas.height - h) / 2, w, h);
      }
      t.drawn = true;
      redrawn.add(t.id);
    }
    for (const id of redrawn) this.dirty.delete(id);
    // a dirty id with no tile has nothing to draw; forget it, the tile draws fresh when it appears
    const shown = new Set([...this.tiles.values()].map((t) => t.id));
    for (const id of [...this.dirty]) if (!shown.has(id)) this.dirty.delete(id);
  }

  // ---- Editable tiles (DEV_PLAN 36.16): gutters dragged to resize tiles, patched in place ----

  private handle(id: GutterId): HTMLElement {
    const el = document.createElement('div');
    el.className = 'cv-gutter';
    el.dataset.g = id;
    el.hidden = true;
    return el;
  }

  private queuePlace(): void {
    if (this.placeFrame) return;
    this.placeFrame = requestAnimationFrame(() => { this.placeFrame = 0; this.place(); });
  }

  /** The track sizes the dragged sizes allow now: each kept at least MIN_TILE from every other tile. */
  private sized(k: number): TileSizes {
    const l = this.layout, s = this.sizes, out: TileSizes = {};
    const cs = getComputedStyle(this.col);
    const gap = parseFloat(cs.columnGap) || 0;
    const w = this.col.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0) - gap * Math.max(0, COLS[l] - 1);
    const tabs = this.col.querySelector<HTMLElement>('.cv-doc-tabs')?.offsetHeight ?? 0;
    const h = this.col.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0) - tabs - gap * 2;
    const hold = (v: number, hi: number): number => Math.max(MIN_TILE, Math.min(hi, v));
    const nv = colGutters(l, k);
    if (nv >= 1 && s.c1 !== undefined) out.c1 = hold(s.c1, w - MIN_TILE * nv);
    if (nv >= 2 && s.c2 !== undefined) out.c2 = hold(s.c2, w - (out.c1 ?? MIN_TILE) - MIN_TILE);
    if (hasRow2(l, k) && s.r1 !== undefined) out.r1 = hold(s.r1, h - MIN_TILE);
    return out;
  }

  /** Writes the track sizes as custom properties on the column and moves the three handles over the grid's gaps; only
   *  values that differ are written, so a still layout touches nothing. */
  private place(): void {
    const l = this.layout, k = this.tiles.size, show = l !== 'tabs' && k > 0;
    if (this.gut.hidden === show) this.gut.hidden = !show;
    const eff = show ? this.sized(k) : {};
    for (const [name, v] of [['--cv-c1', eff.c1], ['--cv-c2', eff.c2], ['--cv-r1', eff.r1]] as const) {
      const want = v === undefined ? '' : `${Math.round(v)}px`;
      if (this.col.style.getPropertyValue(name) !== want) { if (want) this.col.style.setProperty(name, want); else this.col.style.removeProperty(name); }
    }
    const nv = show ? colGutters(l, k) : 0, row2 = show && hasRow2(l, k);
    const cs = getComputedStyle(this.col);
    const num = (s: string): number[] => (s === 'none' ? [] : s.split(/\s+/).map(parseFloat).filter((n) => Number.isFinite(n)));
    const cols = num(cs.gridTemplateColumns), rows = num(cs.gridTemplateRows), gap = parseFloat(cs.columnGap) || 0;
    const sum = (a: number[], n: number): number => a.slice(0, n).reduce((x, y) => x + y, 0) + gap * Math.max(0, n - 1);
    const width = sum(cols, cols.length), top = (rows[0] ?? 0) + gap, height = sum(rows, rows.length);
    const put = (id: GutterId, on: boolean, x: number, y: number, w: number, h: number): void => {
      const el = this.hs[id];
      if (el.hidden === on) el.hidden = !on;
      if (!on) return;
      const css = [`${Math.round(x)}px`, `${Math.round(y)}px`, `${Math.round(w)}px`, `${Math.round(h)}px`];
      if (el.style.left !== css[0]) el.style.left = css[0];
      if (el.style.top !== css[1]) el.style.top = css[1];
      if (el.style.width !== css[2]) el.style.width = css[2];
      if (el.style.height !== css[3]) el.style.height = css[3];
    };
    const edge = (n: number): number => sum(cols, n) + gap / 2;   // the middle of the gap after column n
    put('v1', nv >= 1 && cols.length > 1, edge(1) - 3, top, 6, height - top);
    put('v2', nv >= 2 && cols.length > 2, edge(2) - 3, top, 6, height - top);
    const hy = (rows[0] ?? 0) + gap + (rows[1] ?? 0) + gap / 2;
    const hx = l === '3up' ? edge(1) : 0;
    put('h', row2 && rows.length > 2, hx, hy - 3, width - hx, 6);
  }

  private drag(e: PointerEvent): void {
    const el = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>('.cv-gutter') : null;
    const id = el?.dataset.g as GutterId | undefined;
    if (!el || !id || e.button !== 0) return;
    e.preventDefault();
    const cs = getComputedStyle(this.col);
    const px = (s: string): number[] => s.split(/\s+/).map(parseFloat);
    const cols = px(cs.gridTemplateColumns), rows = px(cs.gridTemplateRows), k = this.tiles.size;
    // seed from what is on screen, so the first move starts where the gutter stands
    if (id === 'h') this.sizes.r1 = rows[1];
    else { this.sizes.c1 = cols[0]; if (id === 'v2') this.sizes.c2 = cols[1]; }
    const start = { x: e.clientX, y: e.clientY, c1: cols[0], c2: cols[1], r1: rows[1] };
    el.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent): void => {
      if (id === 'h') this.sizes.r1 = start.r1 + (m.clientY - start.y);
      else if (id === 'v1') this.sizes.c1 = start.c1 + (m.clientX - start.x);
      else this.sizes.c2 = start.c2 + (m.clientX - start.x);
      const eff = this.sized(k);   // held to the minimum, and what is held is what is remembered
      if (id === 'h') this.sizes.r1 = eff.r1; else if (id === 'v1') this.sizes.c1 = eff.c1; else this.sizes.c2 = eff.c2;
      this.place();
    };
    const up = (): void => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }
}
