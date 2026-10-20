import type { Mat } from './geometry';
import type { Rect, RGB } from './types';

interface Level { w: number; h: number; data: Uint8Array }

/** A brush tip's alpha, read once and kept as bytes with a halving chain below it, so a dab drawn smaller than its tip
 *  samples a level near its own size instead of skipping texels. */
export class TipAlpha {
  readonly levels: Level[] = [];

  constructor(alpha: Uint8Array, w: number, h: number) {
    let cur: Level = { w, h, data: alpha };
    this.levels.push(cur);
    while (cur.w > 1 || cur.h > 1) {
      const nw = Math.max(1, (cur.w + 1) >> 1), nh = Math.max(1, (cur.h + 1) >> 1), d = new Uint8Array(nw * nh), src = cur;
      for (let y = 0; y < nh; y++) {
        const y0 = y * 2, y1 = Math.min(src.h - 1, y0 + 1);
        for (let x = 0; x < nw; x++) {
          const x0 = x * 2, x1 = Math.min(src.w - 1, x0 + 1);
          d[y * nw + x] = (src.data[y0 * src.w + x0] + src.data[y0 * src.w + x1] + src.data[y1 * src.w + x0] + src.data[y1 * src.w + x1] + 2) >> 2;
        }
      }
      cur = { w: nw, h: nh, data: d };
      this.levels.push(cur);
    }
  }

  static of(img: ImageData): TipAlpha {
    const a = new Uint8Array(img.width * img.height);
    for (let i = 0; i < a.length; i++) a[i] = img.data[i * 4 + 3];
    return new TipAlpha(a, img.width, img.height);
  }

  get w(): number { return this.levels[0].w; }
  get h(): number { return this.levels[0].h; }
}

/** An opacity (0 to 1) as an 8-bit level, rounded down so a stroke never passes the opacity it was given. */
export const levelOf = (opacity: number): number => Math.floor(Math.min(1, Math.max(0, opacity)) * 255 + 1e-4);

/** One tip byte step as a float32, the constant both the CPU and the graphics processor multiply the tip sum by. */
export const TIP_UNIT = Math.fround(1 / 255);

let colI = new Int32Array(0), colF = new Float32Array(0), colG = new Float32Array(0);

/** The stroke's deep buffer: coverage per pixel as floats over the stroke's window, so a faint dab keeps its share
 *  however fine the spacing, and (when the opacity follows pressure) the highest opacity any dab has reached there.
 *  What a pixel shows is the lesser of the two. */
export class StrokeBuffer {
  cov: Float32Array;
  ceil: Uint8Array | null = null;

  constructor(public w: number, public h: number) { this.cov = new Float32Array(Math.max(1, w * h)); }

  get bytes(): number { return this.cov.byteLength + (this.ceil ? this.ceil.byteLength : 0); }

  useCeil(): void { if (!this.ceil) this.ceil = new Uint8Array(this.cov.length); }

  /** The buffer remade `nw` by `nh`, what it held kept where it now sits (`dx`, `dy` from the new corner). */
  resize(nw: number, nh: number, keep: boolean, dx: number, dy: number): void {
    const cov = new Float32Array(nw * nh), ceil = this.ceil ? new Uint8Array(nw * nh) : null;
    if (keep) {
      const x0 = Math.max(0, -dx), x1 = Math.min(this.w, nw - dx);
      if (x1 > x0) {
        for (let y = Math.max(0, -dy); y < Math.min(this.h, nh - dy); y++) {
          const o = (y + dy) * nw + dx + x0, s = y * this.w + x0;
          cov.set(this.cov.subarray(s, s + x1 - x0), o);
          if (ceil && this.ceil) ceil.set(this.ceil.subarray(s, s + x1 - x0), o);
        }
      }
    }
    this.cov = cov; this.ceil = ceil; this.w = nw; this.h = nh;
  }

  /** Lays one dab: `tip` mapped into the buffer by `m` (tip pixels to buffer pixels), each covered pixel gaining
   *  `k` times the tip's alpha of what is still uncovered. `ceil` is the dab's opacity (0 to 255). Returns the box
   *  it reached. */
  lay(tip: TipAlpha, m: Mat, k: number, ceil: number): Rect | null {
    const det = m[0] * m[3] - m[1] * m[2];
    if (!(Math.abs(det) > 1e-12) || !(k > 0)) return null;
    const tw = tip.w, th = tip.h, w = this.w;
    const xs = [m[4], m[0] * tw + m[4], m[2] * th + m[4], m[0] * tw + m[2] * th + m[4]], ys = [m[5], m[1] * tw + m[5], m[3] * th + m[5], m[1] * tw + m[3] * th + m[5]];
    const ox = Math.floor(Math.min(...xs)), oy = Math.floor(Math.min(...ys));
    const x0 = Math.max(0, ox), x1 = Math.min(w, Math.ceil(Math.max(...xs)));
    const y0 = Math.max(0, oy), y1 = Math.min(this.h, Math.ceil(Math.max(...ys)));
    if (x1 <= x0 || y1 <= y0) return null;
    const ia = m[3] / det, ib = -m[1] / det, ic = -m[2] / det, id = m[0] / det, ie = -(ia * m[4] + ic * m[5]), iff = -(ib * m[4] + id * m[5]);
    const ratio = Math.max(Math.hypot(ia, ib), Math.hypot(ic, id)), top = tip.levels.length - 1;
    const lv = tip.levels[ratio > 1.4142 ? Math.min(top, Math.round(Math.log2(ratio))) : 0], lw = lv.w, lh = lv.h, sx = lw / tw, sy = lh / th, data = lv.data;
    const cov = this.cov, cl = this.ceil, f = Math.fround;
    const fa = f(ia), fb = f(ib), fc = f(ic), fd = f(id), fk = f(k), gx = f(sx), gy = f(sy);
    const offx = f(ie + ia * ox + ic * oy), offy = f(iff + ib * ox + id * oy);
    if (m[1] === 0 && m[2] === 0) {
      const n = x1 - x0;
      if (colI.length < n) { colI = new Int32Array(n); colF = new Float32Array(n); colG = new Float32Array(n); }
      for (let i = 0; i < n; i++) {
        const u = f(f(f(f(fa * f(x0 + i + 0.5 - ox)) + offx) * gx) - 0.5), iu = Math.floor(u), fu = f(u - iu);
        colI[i] = iu; colF[i] = fu; colG[i] = f(1 - fu);
      }
      for (let y = y0; y < y1; y++) {
        const v = f(f(f(f(fd * f(y + 0.5 - oy)) + offy) * gy) - 0.5), iv = Math.floor(v), fv = f(v - iv), gv = f(1 - fv);
        const jn0 = iv >= 0 && iv < lh, jn1 = iv + 1 >= 0 && iv + 1 < lh;
        if (!jn0 && !jn1) continue;
        const o0 = iv * lw, o1 = o0 + lw, row = y * w + x0;
        for (let i = 0; i < n; i++) {
          const iu = colI[i], fu = colF[i], gu = colG[i];
          const in0 = iu >= 0 && iu < lw, in1 = iu + 1 >= 0 && iu + 1 < lw;
          let s = 0;
          if (in0 && jn0) s = f(s + f(data[o0 + iu] * f(gu * gv)));
          if (in1 && jn0) s = f(s + f(data[o0 + iu + 1] * f(fu * gv)));
          if (in0 && jn1) s = f(s + f(data[o1 + iu] * f(gu * fv)));
          if (in1 && jn1) s = f(s + f(data[o1 + iu + 1] * f(fu * fv)));
          const a = f(fk * f(s * TIP_UNIT));
          if (!(a > 0)) continue;
          const p = row + i, c = cov[p];
          cov[p] = f(a + f(c * f(1 - a)));
          if (cl && cl[p] < ceil) cl[p] = ceil;
        }
      }
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    for (let y = y0; y < y1; y++) {
      const py = f(y + 0.5 - oy), row = y * w;
      for (let x = x0; x < x1; x++) {
        const px = f(x + 0.5 - ox);
        const u = f(f(f(f(f(fa * px) + f(fc * py)) + offx) * gx) - 0.5), v = f(f(f(f(f(fb * px) + f(fd * py)) + offy) * gy) - 0.5);
        const iu = Math.floor(u), iv = Math.floor(v), fu = f(u - iu), fv = f(v - iv), gu = f(1 - fu), gv = f(1 - fv);
        const in0 = iu >= 0 && iu < lw, in1 = iu + 1 >= 0 && iu + 1 < lw, jn0 = iv >= 0 && iv < lh, jn1 = iv + 1 >= 0 && iv + 1 < lh;
        let s = 0;
        if (in0 && jn0) s = f(s + f(data[iv * lw + iu] * f(gu * gv)));
        if (in1 && jn0) s = f(s + f(data[iv * lw + iu + 1] * f(fu * gv)));
        if (in0 && jn1) s = f(s + f(data[(iv + 1) * lw + iu] * f(gu * fv)));
        if (in1 && jn1) s = f(s + f(data[(iv + 1) * lw + iu + 1] * f(fu * fv)));
        const a = f(fk * f(s * TIP_UNIT));
        if (!(a > 0)) continue;
        const p = row + x, c = cov[p];
        cov[p] = f(a + f(c * f(1 - a)));
        if (cl && cl[p] < ceil) cl[p] = ceil;
      }
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  /** Whole pixels covered outright (the Pencil's and the Eraser's Block), at opacity `ceil`. */
  fillRect(x: number, y: number, rw: number, rh: number, ceil: number): void {
    const x0 = Math.max(0, x), x1 = Math.min(this.w, x + rw), y0 = Math.max(0, y), y1 = Math.min(this.h, y + rh);
    for (let j = y0; j < y1; j++) {
      for (let i = x0; i < x1; i++) {
        const p = j * this.w + i;
        this.cov[p] = 1;
        if (this.ceil && this.ceil[p] < ceil) this.ceil[p] = ceil;
      }
    }
  }

  /** The paint over `r`: `color` (or the ink's colour where it has one) at the lesser of coverage and opacity. */
  paintRegion(r: Rect, color: RGB, opacity: number, ink: Uint8ClampedArray | null): ImageData {
    const img = new ImageData(r.w, r.h), d = img.data, cov = this.cov, cl = this.ceil, w = this.w, top = levelOf(opacity) / 255;
    for (let j = 0; j < r.h; j++) {
      let p = (r.y + j) * w + r.x, q = j * r.w * 4;
      for (let i = 0; i < r.w; i++, p++, q += 4) {
        const c = cov[p];
        if (!(c > 0)) continue;
        const lim = cl ? cl[p] / 255 : top, a = Math.round((c < lim ? c : lim) * 255);
        if (a <= 0) continue;
        if (ink && ink[q + 3] > 0) { d[q] = ink[q]; d[q + 1] = ink[q + 1]; d[q + 2] = ink[q + 2]; } else { d[q] = color.r; d[q + 1] = color.g; d[q + 2] = color.b; }
        d[q + 3] = a;
      }
    }
    return img;
  }

  /** The coverage alone, white, as an image over the whole buffer. */
  coverImage(): ImageData {
    const img = new ImageData(this.w, this.h), d = img.data, cov = this.cov;
    for (let p = 0, q = 0; p < cov.length; p++, q += 4) {
      const c = cov[p];
      if (!(c > 0)) continue;
      d[q] = d[q + 1] = d[q + 2] = 255;
      d[q + 3] = Math.round((c < 1 ? c : 1) * 255);
    }
    return img;
  }
}
