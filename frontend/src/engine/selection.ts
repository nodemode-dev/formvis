import { createSurface, ctxOf, type Ctx2D, type Surface } from './surface';
import { integral, intersectRect } from './geometry';
import type { Rect } from './types';

export type SelectionMode = 'replace' | 'add' | 'subtract' | 'intersect';

/** The outline of the pixels where `mask` reaches `threshold`, as closed loops along pixel edges, offset by (ox, oy).
 *  Boundary edges are first merged into maximal horizontal and vertical runs, each oriented so the selected side lies
 *  to its right (outer loops clockwise, holes counter-clockwise); runs are then linked end to start into loops. Where
 *  two selected pixels touch only at a corner, the right turn is taken, so they stay separate loops. */
export interface OutlineSink { moveTo(x: number, y: number): void; lineTo(x: number, y: number): void; closePath(): void; rect(x: number, y: number, w: number, h: number): void }

export function traceOutline<T extends OutlineSink = Path2D>(mask: Uint8Array, width: number, height: number, ox: number, oy: number, threshold = 128, path: T = new Path2D() as unknown as T): T {
  if (!width || !height) return path;
  const corners = width + 1, on = new Uint8Array(width * height);
  for (let i = 0; i < on.length; i++) on[i] = mask[i] >= threshold ? 1 : 0;
  const runStart: number[] = [], runEnd: number[] = [], runDir: number[] = [];
  const open = new Map<number, number>();
  const addRun = (sx: number, sy: number, ex: number, ey: number, dir: number): void => {
    const start = sy * corners + sx;
    open.set(start * 4 + dir, runStart.length);
    runStart.push(start);
    runEnd.push(ey * corners + ex);
    runDir.push(dir);
  };
  // One row-major sweep over consecutive row pairs (the rows before the first and after the last count as empty).
  // Wherever the pair differs there is a horizontal edge: top edges run east, bottom edges west. Vertical runs on
  // each column boundary stay open (1 south for right edges, 2 north for left edges) and can only start or stop at a
  // boundary beside a pixel that differs from the one above it, so only those boundaries are re-examined.
  const openKind = new Uint8Array(corners), openFrom = new Int32Array(corners), empty = new Uint8Array(width);
  const closeColumn = (x: number, y: number): void => {
    if (openKind[x] === 1) addRun(x, openFrom[x], x, y, 1);
    else if (openKind[x] === 2) addRun(x, y, x, openFrom[x], 3);
  };
  let prev = empty;
  for (let y = 0; y <= height; y++) {
    const cur = y < height ? on.subarray(y * width, (y + 1) * width) : empty;
    let x = 0;
    while (x < width) {
      if (prev[x] === cur[x]) { x++; continue; }
      const b = cur[x], first = x;
      while (x < width && cur[x] === b && prev[x] !== b) x++;
      if (b) addRun(first, y, x, y, 0); else addRun(x, y, first, y, 2);
      if (y === height) continue;
      for (let xb = first; xb <= x; xb++) {
        const left = xb > 0 ? cur[xb - 1] : 0, right = xb < width ? cur[xb] : 0;
        const kind = left === right ? 0 : left ? 1 : 2;
        if (kind === openKind[xb]) continue;
        closeColumn(xb, y);
        openKind[xb] = kind;
        openFrom[xb] = y;
      }
    }
    prev = cur;
    if (runStart.length > 4_000_000) { path.rect(ox, oy, width, height); return path; }
  }
  for (let xb = 0; xb <= width; xb++) closeColumn(xb, height);
  for (let r0 = 0; r0 < runStart.length; r0++) {
    const origin = runStart[r0], firstDir = runDir[r0];
    if (open.get(origin * 4 + firstDir) !== r0) continue;
    open.delete(origin * 4 + firstDir);
    path.moveTo((origin % corners) + ox, Math.floor(origin / corners) + oy);
    let run = r0;
    for (;;) {
      const at = runEnd[run], dir = runDir[run];
      path.lineTo((at % corners) + ox, Math.floor(at / corners) + oy);
      let next = -1, closed = false;
      for (const turn of [1, 0, 3]) {
        const d = (dir + turn) % 4;
        if (at === origin && d === firstDir) { closed = true; break; }
        const candidate = open.get(at * 4 + d);
        if (candidate !== undefined) { next = candidate; open.delete(at * 4 + d); break; }
      }
      if (closed || next < 0) break;
      run = next;
    }
    path.closePath();
  }
  return path;
}

/** A selection: 8-bit coverage (0 unselected, 255 fully selected) over a rectangle of the document. */
export class SelectionMask {
  private surf: Surface | null = null;
  private traced: Path2D | null = null;

  constructor(readonly x: number, readonly y: number, readonly w: number, readonly h: number, readonly data: Uint8Array) {}

  get bytes(): number { return this.data.length; }
  get rect(): Rect { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  /** Coverage at a document point; 0 outside the mask's rectangle. */
  valueAt(px: number, py: number): number {
    const i = Math.floor(px) - this.x, j = Math.floor(py) - this.y;
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return 0;
    return this.data[j * this.w + i];
  }

  /** The mask as a surface: white everywhere, the coverage in the alpha channel. Built once, then kept. */
  surface(): Surface {
    if (this.surf) return this.surf;
    const s = createSurface(this.w, this.h), ctx = ctxOf(s);
    const img = ctx.createImageData(this.w, this.h), px = img.data;
    for (let i = 0; i < this.data.length; i++) {
      const o = i * 4;
      px[o] = 255;
      px[o + 1] = 255;
      px[o + 2] = 255;
      px[o + 3] = this.data[i];
    }
    ctx.putImageData(img, 0, 0);
    this.surf = s;
    return s;
  }

  /** The outline of the selected area as a path in document coordinates. Traced once, then kept. */
  outline(): Path2D {
    if (!this.traced) this.traced = traceOutline(this.data, this.w, this.h, this.x, this.y);
    return this.traced;
  }

  /** A mask over the given rectangle trimmed to the bounding box of its non-zero values; null when nothing is selected. */
  static cropped(x: number, y: number, w: number, h: number, data: Uint8Array): SelectionMask | null {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        if (!data[j * w + i]) continue;
        if (i < x0) x0 = i;
        if (i > x1) x1 = i;
        if (j < y0) y0 = j;
        if (j > y1) y1 = j;
      }
    }
    if (x1 < 0) return null;
    const nw = x1 - x0 + 1, nh = y1 - y0 + 1;
    if (nw === w && nh === h) return new SelectionMask(x, y, w, h, data);
    const out = new Uint8Array(nw * nh);
    for (let j = 0; j < nh; j++) {
      const from = (y0 + j) * w + x0;
      out.set(data.subarray(from, from + nw), j * nw);
    }
    return new SelectionMask(x + x0, y + y0, nw, nh, out);
  }

  /** Coverage taken from the alpha channel of RGBA pixels; with `hard`, alpha of 128 or more is fully selected. */
  static fromAlpha(x: number, y: number, w: number, h: number, rgba: Uint8ClampedArray, hard = false): SelectionMask | null {
    const data = new Uint8Array(w * h);
    for (let i = 0; i < data.length; i++) { const a = rgba[i * 4 + 3]; data[i] = hard ? (a >= 128 ? 255 : 0) : a; }
    return SelectionMask.cropped(x, y, w, h, data);
  }

  /** Rasterises whatever `draw` paints (in document coordinates) inside `bounds` into a mask. */
  static fromPath(docW: number, docH: number, bounds: Rect, draw: (ctx: Ctx2D) => void, antialias = true): SelectionMask | null {
    const grown = integral({ x: bounds.x - 1, y: bounds.y - 1, w: bounds.w + 2, h: bounds.h + 2 });
    const r = intersectRect(grown, { x: 0, y: 0, w: docW, h: docH });
    if (!r || r.w <= 0 || r.h <= 0) return null;
    const s = createSurface(r.w, r.h), ctx = ctxOf(s);
    ctx.translate(-r.x, -r.y);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    draw(ctx);
    const px = ctx.getImageData(0, 0, r.w, r.h).data;
    return SelectionMask.fromAlpha(r.x, r.y, r.w, r.h, px, !antialias);
  }

  static all(w: number, h: number): SelectionMask { return new SelectionMask(0, 0, w, h, new Uint8Array(w * h).fill(255)); }

  /** This mask merged with `other` by the given mode. */
  combine(other: SelectionMask, mode: SelectionMode): SelectionMask | null {
    if (mode === 'replace') return other;
    let r: Rect | null;
    if (mode === 'add') {
      const x0 = Math.min(this.x, other.x), y0 = Math.min(this.y, other.y);
      const x1 = Math.max(this.x + this.w, other.x + other.w), y1 = Math.max(this.y + this.h, other.y + other.h);
      r = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    } else if (mode === 'subtract') {
      r = this.rect;
    } else {
      r = intersectRect(this.rect, other.rect);
    }
    if (!r || r.w <= 0 || r.h <= 0) return null;
    const out = new Uint8Array(r.w * r.h);
    for (let j = 0; j < r.h; j++) {
      for (let i = 0; i < r.w; i++) {
        const a = this.valueAt(r.x + i, r.y + j), b = other.valueAt(r.x + i, r.y + j);
        out[j * r.w + i] = mode === 'add' ? Math.max(a, b) : mode === 'subtract' ? Math.round((a * (255 - b)) / 255) : Math.min(a, b);
      }
    }
    return SelectionMask.cropped(r.x, r.y, r.w, r.h, out);
  }

  /** The complement over the whole document. */
  inverted(docW: number, docH: number): SelectionMask | null {
    const out = new Uint8Array(docW * docH).fill(255);
    for (let j = 0; j < this.h; j++) {
      const dy = this.y + j;
      if (dy < 0 || dy >= docH) continue;
      for (let i = 0; i < this.w; i++) {
        const dx = this.x + i;
        if (dx < 0 || dx >= docW) continue;
        out[dy * docW + dx] = 255 - this.data[j * this.w + i];
      }
    }
    return SelectionMask.cropped(0, 0, docW, docH, out);
  }

  /** The mask moved by (dx, dy), clipped to the document. */
  translated(dx: number, dy: number, docW: number, docH: number): SelectionMask | null {
    const nx = this.x + dx, ny = this.y + dy;
    const r = intersectRect({ x: nx, y: ny, w: this.w, h: this.h }, { x: 0, y: 0, w: docW, h: docH });
    if (!r || r.w <= 0 || r.h <= 0) return null;
    const out = new Uint8Array(r.w * r.h);
    for (let j = 0; j < r.h; j++) {
      const from = (r.y - ny + j) * this.w + (r.x - nx);
      out.set(this.data.subarray(from, from + r.w), j * r.w);
    }
    return SelectionMask.cropped(r.x, r.y, r.w, r.h, out);
  }

  /** The mask mirrored across the document: left to right, or top to bottom. */
  flipped(horizontal: boolean, docW: number, docH: number): SelectionMask {
    const { w, h, data } = this, out = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const si = horizontal ? w - 1 - i : i, sj = horizontal ? j : h - 1 - j;
        out[j * w + i] = data[sj * w + si];
      }
    }
    const nx = horizontal ? docW - this.x - w : this.x;
    const ny = horizontal ? this.y : docH - this.y - h;
    return new SelectionMask(nx, ny, w, h, out);
  }

  /** The selection turned with the canvas (1.55.3, Image Rotation): `quarters` clockwise quarter turns of a document
   *  `docW` by `docH` (before the turn). */
  rotated(quarters: 1 | 2 | 3, docW: number, docH: number): SelectionMask {
    const { w, h, data } = this, nw = quarters === 2 ? w : h, nh = quarters === 2 ? h : w, out = new Uint8Array(nw * nh);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const v = data[j * w + i];
      const ni = quarters === 1 ? h - 1 - j : quarters === 2 ? w - 1 - i : j, nj = quarters === 1 ? i : quarters === 2 ? h - 1 - j : w - 1 - i;
      out[nj * nw + ni] = v;
    }
    const nx = quarters === 1 ? docH - this.y - h : quarters === 2 ? docW - this.x - w : this.y;
    const ny = quarters === 1 ? this.x : quarters === 2 ? docH - this.y - h : docW - this.x - w;
    return new SelectionMask(nx, ny, nw, nh, out);
  }
}
