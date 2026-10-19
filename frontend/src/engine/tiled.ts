/* A layer's pixels as tiles (1.62.2, DEV_PLAN 26.6a, the register's M5).

   A browser canvas holds at most 2^28 pixels (268 MP), so past that one canvas cannot hold a layer at all: a 30,000 by
   20,000 document (600 MP) needs its layers in pieces. A TiledRaster keeps TILE by TILE tiles, made only where something
   is drawn (an empty tile is transparent and costs nothing), and reads, writes and draws across tile edges as one
   picture would. This stage is the layer itself; the stages after it (26.6b to h) give it to the compositor, the disk,
   painting, filters and export, undo and the GPU display. Documents up to 2^28 pixels keep their single-canvas layers.

   One limit, stated rather than hidden: drawTo at a scale other than 1, with smoothing, samples past a tile's edge into
   transparency and can leave hairline seams between tiles; 26.6b gives each tile a one-pixel apron of its neighbours'
   pixels for that. At actual size (the scale painting and filters work at) drawTo is exact. */

import { createSurface, ctxOf, type Ctx2D, type Surface } from './surface';
import { uid } from './types';

/** A tile's side: 2,048 pixels, 16 MB, small enough to page and large enough to keep the count down (600 MP is 150). */
export let TILE = 2048;
/** Preferences > Performance > Cache Tile Size: the side of the tiles of giant layers made from now on (each tile is one
 *  GPU texture); a power of two from 512 to 4096. Tiles already made keep their own side. */
export const TILE_SIZES: readonly number[] = [512, 1024, 2048, 4096];
export function setTileSize(px: number): void { TILE = TILE_SIZES.includes(px) ? px : 2048; }

/** The tiles a rectangle touches, row by row, within a grid of `cols` by `rows` tiles of side `tile`. */
export function tilesIn(x: number, y: number, w: number, h: number, tile: number, cols: number, rows: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  if (w <= 0 || h <= 0) return out;
  const tx0 = Math.max(0, Math.floor(x / tile)), ty0 = Math.max(0, Math.floor(y / tile));
  const tx1 = Math.min(cols - 1, Math.floor((x + w - 1) / tile)), ty1 = Math.min(rows - 1, Math.floor((y + h - 1) / tile));
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) out.push([tx, ty]);
  return out;
}

interface Tile { canvas: Surface; ctx: Ctx2D }
/** A tile on the engine's disk (1.62.4, DEV_PLAN 26.6c): its key in the store, and a preview at a sixteenth of its side
 *  that the view draws until the tile is back. */
interface PagedTile { key: string; preview: Surface; w: number; h: number }
/** The store tiles go to: the engine's undo store, as the app hands it to the engine. */
export interface TileStore { put(bytes: Uint8Array<ArrayBuffer>): Promise<string>; get(key: string): Promise<ArrayBuffer>; drop(key: string): void; dropMany?(keys: string[]): void }
export const PREVIEW = 16;

export class TiledRaster {
  readonly id = uid();
  version = 0;
  readonly cols: number;
  readonly rows: number;
  private readonly tiles = new Map<number, Tile>();
  private readonly paged = new Map<number, PagedTile>();
  /** When each tile was last used (a drawing or a frame), for least-recently-used paging; the frame counter marks the
   *  tiles the last drawTo drew, which are in view and never paged. */
  private readonly used = new Map<number, number>();
  private clock = 0;
  private frame = -1;
  /** Each tile's own version, so a page-out that a drawing overtook is abandoned rather than kept stale. */
  private readonly tileVersion = new Map<number, number>();
  /** Asked for a tile on disk a drawing wanted (1.62.4): the engine brings it back and redraws. */
  onMissing: ((t: TiledRaster, key: number) => void) | null = null;
  /** The colour an empty tile reads and draws as, red, green, blue and alpha 0 to 255 (1.62.3, DEV_PLAN 26.6b): a
   *  600 MP white background costs nothing until something is drawn into it. Null is transparent. */
  base: [number, number, number, number] | null = null;

  constructor(readonly width: number, readonly height: number, readonly tile = TILE) {
    this.cols = Math.ceil(width / tile);
    this.rows = Math.ceil(height / tile);
  }

  /** The bytes its tiles hold: only the tiles something was drawn into. */
  get bytes(): number {
    let n = this.residentBytes;
    for (const p of this.paged.values()) n += p.preview.width * p.preview.height * 4;   // a tile on disk keeps its preview
    return n;
  }

  /** The bytes of the tiles in memory (not their previews): what paging keeps within its share. */
  get residentBytes(): number {
    let n = 0;
    for (const t of this.tiles.values()) n += t.canvas.width * t.canvas.height * 4;
    for (const c of this.levels.values()) n += c.image.width * c.image.height * 4;   // the GPU's reduced copies (1.62.9)
    return n;
  }

  get pagedCount(): number { return this.paged.size; }

  get tileCount(): number { return this.tiles.size; }

  /** Tile (tx, ty), or null when nothing was drawn there; made (transparent) when `make`. Edge tiles are cut to the layer. */
  tileAt(tx: number, ty: number, make = false): Tile | null {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return null;
    const key = ty * this.cols + tx;
    // On disk: never read as empty nor drawn over as a new tile, which would lose its pixels (1.62.4); bring it back.
    if (this.paged.has(key)) throw new Error(`Tile ${tx}, ${ty} of this layer is on disk: bring it back first (ensure).`);
    this.used.set(key, ++this.clock);
    let t = this.tiles.get(key);
    if (!t && make) {
      const canvas = createSurface(Math.min(this.tile, this.width - tx * this.tile), Math.min(this.tile, this.height - ty * this.tile));
      t = { canvas, ctx: ctxOf(canvas) };
      if (this.base) { t.ctx.fillStyle = this.baseCss(); t.ctx.fillRect(0, 0, canvas.width, canvas.height); }   // as it read before
      this.tiles.set(key, t);
    }
    return t ?? null;
  }

  /** The pixels of a rectangle, as one picture would give them (transparent where nothing was drawn or past the edge). */
  read(x: number, y: number, w: number, h: number): ImageData {
    const out = new ImageData(w, h);
    for (const [tx, ty] of tilesIn(x, y, w, h, this.tile, this.cols, this.rows)) {
      const t = this.tileAt(tx, ty), ox = tx * this.tile, oy = ty * this.tile;
      const tw = Math.min(this.tile, this.width - ox), th = Math.min(this.tile, this.height - oy);
      const ix0 = Math.max(x, ox), iy0 = Math.max(y, oy), ix1 = Math.min(x + w, ox + tw), iy1 = Math.min(y + h, oy + th);
      if (ix1 <= ix0 || iy1 <= iy0) continue;
      if (!t) {   // empty: its base colour, or transparent
        if (this.base) for (let yy = iy0; yy < iy1; yy++) for (let xx = ix0; xx < ix1; xx++) out.data.set(this.base, ((yy - y) * w + (xx - x)) * 4);
        continue;
      }
      const part = t.ctx.getImageData(ix0 - ox, iy0 - oy, ix1 - ix0, iy1 - iy0), row = (ix1 - ix0) * 4;
      for (let r = 0; r < iy1 - iy0; r++) out.data.set(part.data.subarray(r * row, (r + 1) * row), ((iy0 - y + r) * w + (ix0 - x)) * 4);
    }
    return out;
  }

  /** `img` written at (x, y) as putImageData writes it: replacing, clipped to the layer; tiles made where it lands. */
  write(img: ImageData, x: number, y: number): void {
    for (const [tx, ty] of tilesIn(x, y, img.width, img.height, this.tile, this.cols, this.rows)) {
      const t = this.tileAt(tx, ty, true) as Tile;
      this.bumpTile(tx, ty);
      const ox = tx * this.tile, oy = ty * this.tile;
      const ix0 = Math.max(x, ox), iy0 = Math.max(y, oy), ix1 = Math.min(x + img.width, ox + t.canvas.width), iy1 = Math.min(y + img.height, oy + t.canvas.height);
      if (ix1 > ix0 && iy1 > iy0) t.ctx.putImageData(img, x - ox, y - oy, ix0 - x, iy0 - y, ix1 - ix0, iy1 - iy0);
    }
    this.touch();
  }

  /** `draw` run on every tile the rectangle (x, y, w, h) touches, made where missing, each context moved so the drawing
   *  is in layer coordinates. Exact for axis-aligned fills and clears. Not for antialiased paths: the browser may draw a
   *  path cut by a tile's edge another way than the whole path, so edge pixels differ slightly (measured over white:
   *  99.8% of values within 2 levels, at most 45 at a few edge pixels). Antialiased drawing (strokes, shapes, text)
   *  therefore goes through one scratch canvas over its bounds and is then written into the tiles, which is exact. */
  drawOn(x: number, y: number, w: number, h: number, draw: (ctx: Ctx2D) => void): void {
    for (const [tx, ty] of tilesIn(Math.floor(x), Math.floor(y), Math.ceil(x + w) - Math.floor(x), Math.ceil(y + h) - Math.floor(y), this.tile, this.cols, this.rows)) {
      const t = this.tileAt(tx, ty, true) as Tile;
      this.bumpTile(tx, ty);
      t.ctx.save();
      t.ctx.setTransform(1, 0, 0, 1, -tx * this.tile, -ty * this.tile);
      draw(t.ctx);
      t.ctx.restore();
    }
    this.touch();
  }

  /** The layer drawn onto `ctx` through `m` (layer to target pixels, as setTransform's six numbers), tile by tile, an
   *  empty tile as the base colour (1.62.3). Unrotated and unflipped (the canvas view), each tile goes to whole target
   *  pixels, so neighbours meet exactly at any zoom with no seam, and at a scale of 1 with a whole-pixel offset it is a
   *  copy; tiles outside the target are skipped. Rotated or flipped, tiles are drawn through `m`, and may seam at a
   *  scale other than 1. The caller's alpha and composite operation apply. */
  drawTo(ctx: Ctx2D, m: readonly [number, number, number, number, number, number]): void {
    const cw = ctx.canvas.width, ch = ctx.canvas.height, straight = m[1] === 0 && m[2] === 0 && m[0] > 0 && m[3] > 0;
    // At a sixteenth of actual size or less a tile on disk's preview is all the view can show, so it is not asked
    // for, and such a view (the Navigator's) does not count as one the tiles are in (1.62.4).
    const full = Math.hypot(m[0], m[1]) > 1 / PREVIEW, stamp = ++this.clock;
    if (full) this.inView.clear();
    for (let ty = 0; ty < this.rows; ty++) {
      for (let tx = 0; tx < this.cols; tx++) {
        const key = ty * this.cols + tx, t = this.tiles.get(key) ?? null, pg = this.paged.get(key) ?? null;
        if (!t && !pg && !this.base) continue;
        const ox = tx * this.tile, oy = ty * this.tile, tw = Math.min(this.tile, this.width - ox), th = Math.min(this.tile, this.height - oy);
        if (straight) {
          const x0 = Math.round(m[0] * ox + m[4]), x1 = Math.round(m[0] * (ox + tw) + m[4]), y0 = Math.round(m[3] * oy + m[5]), y1 = Math.round(m[3] * (oy + th) + m[5]);
          if (x1 <= 0 || y1 <= 0 || x0 >= cw || y0 >= ch || x1 === x0 || y1 === y0) continue;
          if (t || pg) { this.used.set(key, stamp); if (full) this.inView.add(key); }
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          if (t) ctx.drawImage(t.canvas, 0, 0, tw, th, x0, y0, x1 - x0, y1 - y0);
          else if (pg) { ctx.drawImage(pg.preview, 0, 0, pg.preview.width, pg.preview.height, x0, y0, x1 - x0, y1 - y0); if (full) this.onMissing?.(this, key); }
          else { ctx.fillStyle = this.baseCss(); ctx.fillRect(x0, y0, x1 - x0, y1 - y0); }
          ctx.restore();
        } else {
          if (t || pg) { this.used.set(key, stamp); if (full) this.inView.add(key); }
          ctx.save();
          ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
          if (t) ctx.drawImage(t.canvas, ox, oy);
          else if (pg) { ctx.drawImage(pg.preview, ox, oy, tw, th); if (full) this.onMissing?.(this, key); }
          else { ctx.fillStyle = this.baseCss(); ctx.fillRect(ox, oy, tw, th); }
          ctx.restore();
        }
      }
    }
  }

  /** Tiles a full-detail view last drew: never paged while they are on screen (1.62.4). */
  private readonly inView = new Set<number>();

  /** The tile in memory least recently used and not in view, or null (1.62.4). */
  leastUsed(): number | null {
    let best: number | null = null, at = Infinity;
    for (const key of this.tiles.keys()) {
      if (this.inView.has(key)) continue;
      const u = this.used.get(key) ?? 0;
      if (u < at) { at = u; best = key; }
    }
    return best;
  }

  /** Tile `key` to the store with a preview kept, its canvas freed only once stored; abandoned (the stored copy
   *  dropped) if it was drawn into meanwhile or came into view. True when it went. */
  async pageOut(key: number, store: TileStore): Promise<boolean> {
    const t = this.tiles.get(key);
    if (!t || this.paged.has(key)) return false;
    const w = t.canvas.width, h = t.canvas.height, v = this.tileVersion.get(key) ?? 0, d = t.ctx.getImageData(0, 0, w, h).data;
    const preview = createSurface(Math.max(1, Math.ceil(w / PREVIEW)), Math.max(1, Math.ceil(h / PREVIEW))), pc = ctxOf(preview);
    pc.imageSmoothingQuality = 'high';
    pc.drawImage(t.canvas, 0, 0, preview.width, preview.height);
    // Rendered now (1.63.0): the browser records a drawImage and keeps a snapshot of the source, here the whole 16 MB
    // tile, until the canvas next draws for real, which a tile on disk's preview may never do; a one-pixel read draws it
    // and lets the snapshot go (paging had kept every tile it sent to disk: 1.8 GB after six rows of 30,000 pixels).
    pc.getImageData(0, 0, 1, 1);
    const stored = await store.put(new Uint8Array(d.buffer, d.byteOffset, d.length) as Uint8Array<ArrayBuffer>);
    if ((this.tileVersion.get(key) ?? 0) !== v || this.inView.has(key) || this.tiles.get(key) !== t) { store.drop(stored); return false; }
    this.paged.set(key, { key: stored, preview, w, h });
    this.tiles.delete(key);
    this.dropLevel(key);
    t.canvas.width = 0;
    t.canvas.height = 0;
    return true;
  }

  private readonly bringing = new Map<number, Promise<void>>();

  /** Tile `key` back from the store, fetched once however many ask, the stored copy then dropped (1.62.4). */
  pageIn(key: number, store: TileStore): Promise<void> {
    const p = this.paged.get(key);
    if (!p) return Promise.resolve();
    let job = this.bringing.get(key);
    if (!job) {
      job = store.get(p.key).then((buf) => {
        const canvas = createSurface(p.w, p.h), ctx = ctxOf(canvas);
        ctx.putImageData(new ImageData(new Uint8ClampedArray(buf), p.w, p.h), 0, 0);
        this.tiles.set(key, { canvas, ctx });
        this.paged.delete(key);
        this.used.set(key, ++this.clock);
        store.drop(p.key);
        p.preview.width = 0;
        p.preview.height = 0;
      }).finally(() => this.bringing.delete(key));
      this.bringing.set(key, job);
    }
    return job;
  }

  /** Whether any tile a rectangle touches is on disk (1.62.5: undo brings them back before writing there). */
  pagedIn(x: number, y: number, w: number, h: number): boolean {
    return tilesIn(x, y, w, h, this.tile, this.cols, this.rows).some(([tx, ty]) => this.paged.has(ty * this.cols + tx));
  }

  /** Every tile a rectangle touches brought back, before a read, a write or drawing there. */
  async ensure(x: number, y: number, w: number, h: number, store: TileStore): Promise<void> {
    await Promise.all(tilesIn(x, y, w, h, this.tile, this.cols, this.rows).map(([tx, ty]) => this.pageIn(ty * this.cols + tx, store)));
  }

  /** A copy of this layer's tiles, made one tile at a time: a tile in memory is copied, a tile on disk is fetched and stored again under
   *  a key of its own, and the copy's tiles go to disk as it fills so its share of memory stays within `share`. Edits must be held while
   *  it runs; once it returns, the copy no longer changes whatever happens to this layer. Free it with `release`. */
  async snapshot(store: TileStore, share: () => number): Promise<TiledRaster> {
    const out = new TiledRaster(this.width, this.height, this.tile);
    out.base = this.base ? [...this.base] : null;
    const keys = [...new Set([...this.tiles.keys(), ...this.paged.keys()])].sort((a, b) => a - b);
    try {
      for (const key of keys) {
        let t = this.tiles.get(key);
        if (!t) {
          const p = this.paged.get(key);
          if (p) {
            let buf: ArrayBuffer | null = null;
            try { buf = await store.get(p.key); } catch { buf = null; }
            if (buf) {
              const stored = await store.put(new Uint8Array(buf.slice(0)) as Uint8Array<ArrayBuffer>), preview = createSurface(p.preview.width, p.preview.height);
              ctxOf(preview).drawImage(p.preview as CanvasImageSource, 0, 0);
              out.paged.set(key, { key: stored, preview, w: p.w, h: p.h });
              continue;
            }
            t = this.tiles.get(key);
          }
        }
        if (!t) continue;
        const canvas = createSurface(t.canvas.width, t.canvas.height), ctx = ctxOf(canvas);
        ctx.drawImage(t.canvas as CanvasImageSource, 0, 0);
        out.tiles.set(key, { canvas, ctx });
        out.used.set(key, ++out.clock);
        while (out.residentBytes > share()) { const k = out.leastUsed(); if (k === null || !(await out.pageOut(k, store))) break; }
      }
    } catch (err) { out.release(store); throw err; }
    return out;
  }

  /** A snapshot's tiles freed: the canvases emptied and the stored copies dropped. */
  release(store: TileStore): void {
    for (const t of this.tiles.values()) { t.canvas.width = 0; t.canvas.height = 0; }
    this.tiles.clear();
    for (const p of this.paged.values()) { p.preview.width = 0; p.preview.height = 0; }
    this.dropAll(store);
    this.paged.clear();
  }

  /** Every stored tile dropped from the store (its document closing). */
  dropAll(store: TileStore): void {
    const keys = [...this.paged.values()].map((p) => p.key);   // in one request where the store can (1.63.0)
    if (store.dropMany) { if (keys.length) store.dropMany(keys); } else for (const k of keys) store.drop(k);
    for (const key of [...this.levels.keys()]) this.dropLevel(key);
  }

  /** A tile's version, rising with every drawing into it (the GPU display uploads a tile's texture again when it does). */
  versionOf(key: number): number { return this.tileVersion.get(key) ?? 0; }

  /** Whether a tile is in memory, on the engine's disk, or empty (never drawn into). */
  stateOf(key: number): 'resident' | 'paged' | 'empty' { return this.tiles.has(key) ? 'resident' : this.paged.has(key) ? 'paged' : 'empty'; }

  private readonly levels = new Map<number, { k: number; version: number; image: Surface }>();
  private baseImage: Surface | null = null;
  private baseFor = '';

  /** A tile for a display showing it at 1/2^k of its side or less (1.62.9, DEV_PLAN 26.6g, the GPU per tile): k of 0 is
   *  the tile itself; above, a reduced copy made when first asked and kept until the tile changes or leaves memory, so a
   *  frame's textures stay about one screen's worth at any zoom. A tile on disk gives its preview (a sixteenth of its
   *  side) at k of 4 or more, null below (the caller asks for it back); an empty tile null. `sx` and `sy` are the
   *  tile's pixels per pixel of the image. */
  levelOf(key: number, k: number): { image: Surface; version: number; sx: number; sy: number } | null {
    const v = this.versionOf(key), t = this.tiles.get(key);
    if (!t) {
      const pg = this.paged.get(key);
      return pg && 2 ** k >= PREVIEW ? { image: pg.preview, version: v, sx: pg.w / pg.preview.width, sy: pg.h / pg.preview.height } : null;
    }
    if (k <= 0) return { image: t.canvas, version: v, sx: 1, sy: 1 };
    const c = this.levels.get(key), W = t.canvas.width, H = t.canvas.height;
    if (!c || c.k !== k || c.version !== v) {
      if (c) { c.image.width = 0; c.image.height = 0; }
      const image = createSurface(Math.max(1, Math.round(W / 2 ** k)), Math.max(1, Math.round(H / 2 ** k))), g = ctxOf(image);
      g.imageSmoothingQuality = 'high';
      g.drawImage(t.canvas, 0, 0, image.width, image.height);
      g.getImageData(0, 0, 1, 1);   // drawn now, letting go of the tile's snapshot (as pageOut's preview, 1.63.0)
      this.levels.set(key, { k, version: v, image });
      return { image, version: v, sx: W / image.width, sy: H / image.height };
    }
    return { image: c.image, version: v, sx: W / c.image.width, sy: H / c.image.height };
  }

  /** The base colour as a 1-by-1 picture (an empty tile on the GPU, stretched over it), or null when transparent. */
  baseSurface(): Surface | null {
    if (!this.base) return null;
    const css = this.baseCss();
    if (!this.baseImage || this.baseFor !== css) {
      this.baseImage = createSurface(1, 1);
      const g = ctxOf(this.baseImage);
      g.fillStyle = css;
      g.fillRect(0, 0, 1, 1);
      this.baseFor = css;
    }
    return this.baseImage;
  }

  /** Tiles a display showed (the GPU per tile), stamped as drawTo stamps those it draws: used now and, shown at more
   *  than a sixteenth of actual size, in view, which paging never sends to disk. */
  touchView(keys: number[], full: boolean): void {
    const stamp = ++this.clock;
    if (full) this.inView.clear();
    for (const key of keys) { this.used.set(key, stamp); if (full) this.inView.add(key); }
  }

  private dropLevel(key: number): void {
    const c = this.levels.get(key);
    if (c) { c.image.width = 0; c.image.height = 0; this.levels.delete(key); }
  }

  private bumpTile(tx: number, ty: number): void {
    const key = ty * this.cols + tx;
    this.tileVersion.set(key, (this.tileVersion.get(key) ?? 0) + 1);
  }

  private baseCss(): string {
    const b = this.base ?? [0, 0, 0, 0];
    return `rgba(${b[0]}, ${b[1]}, ${b[2]}, ${b[3] / 255})`;
  }

  touch(): void { this.version++; }
}
