import type { Engine, Project } from '../engine';

export type ArrangeLayout = 'tabs' | '2up-v' | '2up-h' | '3up' | '4up' | '6up';

const KEY = 'formvis.arrange';
const COUNT: Record<ArrangeLayout, number> = { tabs: 0, '2up-v': 1, '2up-h': 1, '3up': 2, '4up': 3, '6up': 5 };
const LAYOUTS = Object.keys(COUNT) as ArrangeLayout[];

interface Tile {
  readonly id: string;
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

  constructor(private readonly col: HTMLElement, private readonly engine: Engine) {
    this.box = document.createElement('div');
    this.box.className = 'cv-view-tiles';
    this.box.hidden = true;
    const stage = col.querySelector('.cv-stage');
    if (stage && stage.nextSibling) col.insertBefore(this.box, stage.nextSibling); else col.appendChild(this.box);
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
    this.box.addEventListener('click', (e) => {
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
    };
    this.clear = clear;
    const ro = new ResizeObserver(() => clear());
    ro.observe(col);
    if (props) ro.observe(props);
    this.apply();
  }

  private clear: () => void = () => undefined;

  setLayout(l: ArrangeLayout): void {
    if (l === this.layout) return;
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

  /** The documents shown as tiles: the next ones after the active one, in open order. */
  private pick(): Project[] {
    const n = COUNT[this.layout], list = this.engine.projects, cur = this.engine.current;
    if (!n || list.length < 2) return [];
    const at = Math.max(0, cur ? list.indexOf(cur) : 0);
    const out: Project[] = [];
    for (let i = 1; i < list.length && out.length < n; i++) out.push(list[(at + i) % list.length]);
    return out;
  }

  private sync(): void {
    const want = this.pick();
    const ids = new Set(want.map((p) => p.id));
    for (const [id, t] of this.tiles) {
      if (ids.has(id)) continue;
      t.ro.disconnect();
      t.root.remove();
      this.tiles.delete(id);
    }
    want.forEach((p, i) => {
      let t = this.tiles.get(p.id);
      if (!t) { t = this.make(p); this.tiles.set(p.id, t); }
      if (t.title.textContent !== p.name) t.title.textContent = p.name;
      if (this.box.children[i] !== t.root) this.box.insertBefore(t.root, this.box.children[i] ?? null);
    });
    this.col.dataset.tiles = String(want.length);
    this.queue();
  }

  private make(p: Project): Tile {
    const root = document.createElement('div');
    root.className = 'cv-view-tile';
    root.dataset.id = p.id;
    const title = document.createElement('div');
    title.className = 'cv-view-tile-title';
    const canvas = document.createElement('canvas');
    canvas.className = 'cv-view-tile-canvas';
    root.append(title, canvas);
    const tile: Tile = { id: p.id, root, title, canvas, drawn: false, ro: new ResizeObserver(() => this.fit(tile)) };
    tile.ro.observe(canvas);
    return tile;
  }

  /** The canvas box changed: match the backing store to it (only when different) and redraw. */
  private fit(t: Tile): void {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(t.canvas.clientWidth * dpr)), h = Math.max(1, Math.round(t.canvas.clientHeight * dpr));
    if (t.canvas.width !== w) t.canvas.width = w;
    if (t.canvas.height !== h) t.canvas.height = h;
    t.drawn = false;
    this.queue();
  }

  private queue(): void {
    if (this.frame || this.layout === 'tabs') return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.paint(); });
  }

  private paint(): void {
    const dpr = window.devicePixelRatio || 1;
    for (const t of this.tiles.values()) {
      if (t.drawn && !this.dirty.has(t.id)) continue;
      const p = this.engine.projects.find((x) => x.id === t.id);
      const ctx = t.canvas.getContext('2d');
      if (!p || !ctx || !t.canvas.width || !t.canvas.height) continue;
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
      this.dirty.delete(t.id);
    }
    // a dirty id with no tile has nothing to draw; forget it, the tile draws fresh when it appears
    for (const id of [...this.dirty]) if (!this.tiles.has(id)) this.dirty.delete(id);
  }
}
