import { createSurface, ctxOf, type Ctx2D, type Surface } from './surface';
import { integral, intersectRect } from './geometry';
import type { Rect } from './types';

export type SelectionMode = 'replace' | 'add' | 'subtract' | 'intersect';

/** The outline of the pixels where `mask` reaches `threshold`, as closed loops along pixel edges, offset by (ox, oy).
 *  Boundary edges are first merged into maximal horizontal and vertical runs, each oriented so the selected side lies
 *  to its right (outer loops clockwise, holes counter-clockwise); runs are then linked end to start into loops. Where
 *  two selected pixels touch only at a corner, the right turn is taken, so they stay separate loops. */
export function traceOutline(mask: Uint8Array, width: number, height: number, ox: number, oy: number, threshold = 128): Path2D {
  const path = new Path2D();
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

export class SelectionMask {
  private surfaceCache: Surface | null = null;
  private outlineCache: Path2D | null = null;

  constructor(readonly x: number, readonly y: number, readonly w: number, readonly h: number, readonly data: Uint8Array) {}

  get bytes(): number { return this.data.length; }
  get rect(): Rect { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  valueAt(px: number, py: number): number {
    const ix = Math.floor(px) - this.x, iy = Math.floor(py) - this.y;
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return 0;
    return this.data[iy * this.w + ix];
  }

  surface(): Surface {
    if (this.surfaceCache) return this.surfaceCache;
    const s = createSurface(this.w, this.h);
    const c = ctxOf(s);
    const img = c.createImageData(this.w, this.h);
    const d = img.data;
    for (let i = 0, j = 0; i < this.data.length; i++, j += 4) { d[j] = 255; d[j + 1] = 255; d[j + 2] = 255; d[j + 3] = this.data[i]; }
    c.putImageData(img, 0, 0);
    this.surfaceCache = s;
    return s;
  }

  outline(): Path2D {
    if (!this.outlineCache) this.outlineCache = traceOutline(this.data, this.w, this.h, this.x, this.y);
    return this.outlineCache;
  }

  static cropped(x: number, y: number, w: number, h: number, data: Uint8Array): SelectionMask | null {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let j = 0; j < h; j++) {
      const row = j * w;
      for (let i = 0; i < w; i++) {
        if (!data[row + i]) continue;
        if (i < x0) x0 = i;
        if (i > x1) x1 = i;
        if (j < y0) y0 = j;
        y1 = j;
      }
    }
    if (x1 < 0) return null;
    if (x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1) return new SelectionMask(x, y, w, h, data);
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    const out = new Uint8Array(cw * ch);
    for (let j = 0; j < ch; j++) out.set(data.subarray((j + y0) * w + x0, (j + y0) * w + x0 + cw), j * cw);
    return new SelectionMask(x + x0, y + y0, cw, ch, out);
  }

  static fromAlpha(x: number, y: number, w: number, h: number, rgba: Uint8ClampedArray, hard = false): SelectionMask | null {
    const out = new Uint8Array(w * h);
    for (let i = 0; i < out.length; i++) { const a = rgba[i * 4 + 3]; out[i] = hard ? (a >= 128 ? 255 : 0) : a; }
    return SelectionMask.cropped(x, y, w, h, out);
  }

  static fromPath(docW: number, docH: number, bounds: Rect, draw: (ctx: Ctx2D) => void, antialias = true): SelectionMask | null {
    const b = integral({ x: bounds.x - 1, y: bounds.y - 1, w: bounds.w + 2, h: bounds.h + 2 });
    const r = intersectRect(b, { x: 0, y: 0, w: docW, h: docH });
    if (!r) return null;
    const s = createSurface(r.w, r.h);
    const c = ctxOf(s);
    c.translate(-r.x, -r.y);
    c.fillStyle = '#ffffff';
    draw(c);
    return SelectionMask.fromAlpha(r.x, r.y, r.w, r.h, c.getImageData(0, 0, r.w, r.h).data, !antialias);
  }

  static all(w: number, h: number): SelectionMask { return new SelectionMask(0, 0, w, h, new Uint8Array(w * h).fill(255)); }

  combine(other: SelectionMask, mode: SelectionMode): SelectionMask | null {
    if (mode === 'replace') return other;
    let r: Rect | null;
    if (mode === 'add') {
      const x = Math.min(this.x, other.x), y = Math.min(this.y, other.y);
      r = { x, y, w: Math.max(this.x + this.w, other.x + other.w) - x, h: Math.max(this.y + this.h, other.y + other.h) - y };
    } else if (mode === 'subtract') r = this.rect;
    else r = intersectRect(this.rect, other.rect);
    if (!r) return null;
    const out = new Uint8Array(r.w * r.h);
    for (let j = 0; j < r.h; j++) {
      const py = r.y + j;
      for (let i = 0; i < r.w; i++) {
        const px = r.x + i;
        const ax = px - this.x, ay = py - this.y, bx = px - other.x, by = py - other.y;
        const a = ax >= 0 && ay >= 0 && ax < this.w && ay < this.h ? this.data[ay * this.w + ax] : 0;
        const b = bx >= 0 && by >= 0 && bx < other.w && by < other.h ? other.data[by * other.w + bx] : 0;
        out[j * r.w + i] = mode === 'add' ? Math.max(a, b) : mode === 'subtract' ? ((a * (255 - b) + 127) / 255) | 0 : Math.min(a, b);
      }
    }
    return SelectionMask.cropped(r.x, r.y, r.w, r.h, out);
  }

  inverted(docW: number, docH: number): SelectionMask | null {
    const out = new Uint8Array(docW * docH).fill(255);
    for (let j = 0; j < this.h; j++) {
      const y = this.y + j;
      if (y < 0 || y >= docH) continue;
      for (let i = 0; i < this.w; i++) {
        const x = this.x + i;
        if (x < 0 || x >= docW) continue;
        out[y * docW + x] = 255 - this.data[j * this.w + i];
      }
    }
    return SelectionMask.cropped(0, 0, docW, docH, out);
  }

  translated(dx: number, dy: number, docW: number, docH: number): SelectionMask | null {
    const moved = new SelectionMask(this.x + dx, this.y + dy, this.w, this.h, this.data);
    const r = intersectRect(moved.rect, { x: 0, y: 0, w: docW, h: docH });
    if (!r) return null;
    const out = new Uint8Array(r.w * r.h);
    for (let j = 0; j < r.h; j++) {
      const sy = r.y + j - moved.y, sx = r.x - moved.x;
      out.set(this.data.subarray(sy * this.w + sx, sy * this.w + sx + r.w), j * r.w);
    }
    return SelectionMask.cropped(r.x, r.y, r.w, r.h, out);
  }

  flipped(horizontal: boolean, docW: number, docH: number): SelectionMask {
    const out = new Uint8Array(this.w * this.h);
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.w; i++) {
        const si = horizontal ? this.w - 1 - i : i, sj = horizontal ? j : this.h - 1 - j;
        out[j * this.w + i] = this.data[sj * this.w + si];
      }
    }
    return horizontal
      ? new SelectionMask(docW - this.x - this.w, this.y, this.w, this.h, out)
      : new SelectionMask(this.x, docH - this.y - this.h, this.w, this.h, out);
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
