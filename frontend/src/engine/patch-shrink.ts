import type { PixelPatch } from './history';
import { Raster } from './surface';

/** Copy-on-write for undo steps (DEV_PLAN 36.18, P25): a step that wrote a whole layer, or a large rectangle, but
 *  changed only a part of it keeps just the parts that differ. A patch is first cut to the box of changed pixels; when
 *  that box is still mostly unchanged, only its changed 256 px tiles are kept, one patch each. What was not stored is
 *  what the layer holds both before and after, so undo and redo write the same bytes as before. */

export const SHRINK_FROM = 65_536;   // pixels; smaller patches cost less to keep than to compare
const TILE = 256;
const SPARSE = 0.6;   // tiles are split out only when under this share of the box's tiles changed

function words(d: Uint8ClampedArray): Uint32Array | null {
  return d.byteOffset % 4 === 0 && d.byteLength % 4 === 0 ? new Uint32Array(d.buffer, d.byteOffset, d.byteLength / 4) : null;
}

function cut(src: ImageData, x: number, y: number, w: number, h: number): ImageData {
  if (x === 0 && y === 0 && w === src.width && h === src.height) return src;
  const out = new ImageData(w, h), sw = src.width * 4;
  for (let r = 0; r < h; r++) out.data.set(src.data.subarray((y + r) * sw + x * 4, (y + r) * sw + (x + w) * 4), r * w * 4);
  return out;
}

/** The patch as a list of patches that keep only the differing pixels; the patch itself when nothing can be saved. */
export function shrinkPatch(q: PixelPatch): PixelPatch[] {
  if (q.lazy || q.redo || q.paged || q.disk || !(q.raster instanceof Raster)) return [q];
  const b = q.before, a = q.after, W = b.width, H = b.height;
  if (a.width !== W || a.height !== H || W * H < SHRINK_FROM) return [q];
  const wb = words(b.data), wa = words(a.data);
  if (!wb || !wa) return [q];
  const tx = Math.ceil(W / TILE), ty = Math.ceil(H / TILE), hit = new Uint8Array(tx * ty);
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    const o = y * W;
    let lo = -1, hi = -1;
    for (let x = 0; x < W; x++) if (wb[o + x] !== wa[o + x]) { lo = x; break; }
    if (lo < 0) continue;
    for (let x = W - 1; x >= lo; x--) if (wb[o + x] !== wa[o + x]) { hi = x; break; }
    if (lo < x0) x0 = lo;
    if (hi > x1) x1 = hi;
    if (y < y0) y0 = y;
    y1 = y;
    const row = Math.floor(y / TILE) * tx;
    for (let t = Math.floor(lo / TILE); t <= Math.floor(hi / TILE); t++) hit[row + t] = 1;
  }
  const keep = (x: number, y: number, w: number, h: number): PixelPatch => ({ raster: q.raster, x: q.x + x, y: q.y + y, before: cut(b, x, y, w, h), after: cut(a, x, y, w, h) });
  if (x1 < 0) return [keep(0, 0, 1, 1)];   // nothing changed: one pixel stands in, so the step still counts
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  let tiles = 0, boxTiles = 0;
  for (let j = Math.floor(y0 / TILE); j <= Math.floor(y1 / TILE); j++) for (let i = Math.floor(x0 / TILE); i <= Math.floor(x1 / TILE); i++) { boxTiles++; tiles += hit[j * tx + i]; }
  if (tiles >= boxTiles * SPARSE || boxTiles < 2) {
    return bw * bh >= W * H ? [q] : [keep(x0, y0, bw, bh)];
  }
  const out: PixelPatch[] = [];
  for (let j = 0; j < ty; j++) for (let i = 0; i < tx; i++) if (hit[j * tx + i]) out.push(keep(i * TILE, j * TILE, Math.min(TILE, W - i * TILE), Math.min(TILE, H - j * TILE)));
  return out;
}
