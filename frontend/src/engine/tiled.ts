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
export const TILE = 2048;

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

export class TiledRaster {
  readonly id = uid();
  version = 0;
  readonly cols: number;
  readonly rows: number;
  private readonly tiles = new Map<number, Tile>();

  constructor(readonly width: number, readonly height: number, readonly tile = TILE) {
    this.cols = Math.ceil(width / tile);
    this.rows = Math.ceil(height / tile);
  }

  /** The bytes its tiles hold: only the tiles something was drawn into. */
  get bytes(): number {
    let n = 0;
    for (const t of this.tiles.values()) n += t.canvas.width * t.canvas.height * 4;
    return n;
  }

  get tileCount(): number { return this.tiles.size; }

  /** Tile (tx, ty), or null when nothing was drawn there; made (transparent) when `make`. Edge tiles are cut to the layer. */
  tileAt(tx: number, ty: number, make = false): Tile | null {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return null;
    const key = ty * this.cols + tx;
    let t = this.tiles.get(key);
    if (!t && make) {
      const canvas = createSurface(Math.min(this.tile, this.width - tx * this.tile), Math.min(this.tile, this.height - ty * this.tile));
      t = { canvas, ctx: ctxOf(canvas) };
      this.tiles.set(key, t);
    }
    return t ?? null;
  }

  /** The pixels of a rectangle, as one picture would give them (transparent where nothing was drawn or past the edge). */
  read(x: number, y: number, w: number, h: number): ImageData {
    const out = new ImageData(w, h);
    for (const [tx, ty] of tilesIn(x, y, w, h, this.tile, this.cols, this.rows)) {
      const t = this.tileAt(tx, ty);
      if (!t) continue;
      const ox = tx * this.tile, oy = ty * this.tile;
      const ix0 = Math.max(x, ox), iy0 = Math.max(y, oy), ix1 = Math.min(x + w, ox + t.canvas.width), iy1 = Math.min(y + h, oy + t.canvas.height);
      if (ix1 <= ix0 || iy1 <= iy0) continue;
      const part = t.ctx.getImageData(ix0 - ox, iy0 - oy, ix1 - ix0, iy1 - iy0), row = (ix1 - ix0) * 4;
      for (let r = 0; r < iy1 - iy0; r++) out.data.set(part.data.subarray(r * row, (r + 1) * row), ((iy0 - y + r) * w + (ix0 - x)) * 4);
    }
    return out;
  }

  /** `img` written at (x, y) as putImageData writes it: replacing, clipped to the layer; tiles made where it lands. */
  write(img: ImageData, x: number, y: number): void {
    for (const [tx, ty] of tilesIn(x, y, img.width, img.height, this.tile, this.cols, this.rows)) {
      const t = this.tileAt(tx, ty, true) as Tile;
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
      t.ctx.save();
      t.ctx.setTransform(1, 0, 0, 1, -tx * this.tile, -ty * this.tile);
      draw(t.ctx);
      t.ctx.restore();
    }
    this.touch();
  }

  /** The layer drawn onto `ctx` through `m` (layer to target, as setTransform's six numbers), tile by tile; exact at a
   *  scale of 1 (see the note at the top for other scales). */
  drawTo(ctx: Ctx2D, m: readonly [number, number, number, number, number, number]): void {
    for (const [key, t] of this.tiles) {
      const tx = key % this.cols, ty = Math.floor(key / this.cols);
      ctx.save();
      ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
      ctx.drawImage(t.canvas, tx * this.tile, ty * this.tile);
      ctx.restore();
    }
  }

  touch(): void { this.version++; }
}
