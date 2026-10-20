import { blurDeep, surfaceBlurDeep, unsharpDeep } from './deep';
import { site } from './filters-lib/pixelate';
import { windReach } from './filters-lib/stylize';
import type { DeepPixels } from './types';
import { boxMean, gaussKernel, hash01, separable } from './filters-lib/shared';
import { pinchWarp, polarWarp, rippleWarp, shearWarp, spherizeWarp, twirlWarp, waveWarp, zigZagWarp, type Warp } from './filters-lib/distort';
import { galleryRadii, type GalleryKind, type GallerySettings, type RadiusMap } from './blur-gallery';

/** Each pixel blurred by its own radius from a stack of float Gaussian blurs (the 8 bit gallery's levels), interpolated between the two nearest. */
export function variableBlurDeep(src: DeepPixels, m: RadiusMap): DeepPixels {
  const { width: w, height: h } = src, S = src.n + 1, max = m.max;
  const levels = [0, max / 8, max / 4, max / 2, max].filter((r, i, a) => i === 0 || r > a[i - 1] + 0.01);
  const stack = levels.map((r) => (r < 0.3 ? src.data : blurDeep(src, r).data));
  const out = new Float32Array(src.data.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const r = Math.max(0, Math.min(max, m.at(x, y)));
    let k = 0;
    while (k < levels.length - 2 && levels[k + 1] < r) k++;
    const a = levels[k], b = levels[Math.min(k + 1, levels.length - 1)], f = b > a ? Math.min(1, Math.max(0, (r - a) / (b - a))) : 0;
    const A = stack[k], B = stack[Math.min(k + 1, stack.length - 1)], i = (y * w + x) * S;
    for (let c = 0; c < S; c++) out[i + c] = A[i + c] * (1 - f) + B[i + c] * f;
  }
  return { ...src, data: out };
}

/** Radial Blur on floats: the 8 bit filter's samples along circles (Spin) or lines from the centre (Zoom), in premultiplied alpha. */
export function radialBlurDeep(src: DeepPixels, amount: number, method: 'spin' | 'zoom', cxPct: number, cyPct: number, quality: 'draft' | 'good' | 'best' = 'good'): DeepPixels {
  const { width: w, height: h } = src, S = src.n + 1, A = src.n, d = src.data, out = new Float32Array(d.length);
  const cx = (cxPct / 100) * w, cy = (cyPct / 100) * h, n = quality === 'draft' ? 8 : quality === 'best' ? 32 : 16, k = Math.max(0, Math.min(100, amount)) / 100;
  const acc = new Float64Array(S);
  const at = (u: number, v: number): void => {
    const cu = Math.min(w - 1, Math.max(0, u)), cv = Math.min(h - 1, Math.max(0, v)), x0 = Math.floor(cu), y0 = Math.floor(cv), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), fx = cu - x0, fy = cv - y0;
    for (const [xx, yy, wg] of [[x0, y0, (1 - fx) * (1 - fy)], [x1, y0, fx * (1 - fy)], [x0, y1, (1 - fx) * fy], [x1, y1, fx * fy]] as const) {
      const s = (yy * w + xx) * S, al = d[s + A] * wg;
      acc[A] += al;
      for (let c = 0; c < A; c++) acc[c] += d[s + c] * al;
    }
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x - cx, dy = y - cy;
    acc.fill(0);
    for (let s = 0; s < n; s++) {
      const t = s / (n - 1) - 0.5;
      if (method === 'spin') { const a = t * k * (Math.PI / 3), c = Math.cos(a), si = Math.sin(a); at(cx + dx * c - dy * si, cy + dx * si + dy * c); }
      else { const f = 1 + t * k; at(cx + dx * f, cy + dy * f); }
    }
    const o = (y * w + x) * S;
    out[o + A] = acc[A] / n;
    for (let c = 0; c < A; c++) out[o + c] = acc[A] > 0 ? acc[c] / acc[A] : 0;
  }
  return { ...src, data: out };
}

/** Path Blur on floats for the curved path (start, bend, end as percents of the image): each pixel is averaged along the
 *  tangent of the nearest of 65 points on the curve, over `speed` pixels shortened by `taper` percent along the path. */
export function pathBlurDeep(src: DeepPixels, speed: number, start: readonly [number, number], bend: readonly [number, number], end: readonly [number, number], taper: number): DeepPixels {
  const { width: w, height: h } = src, S = src.n + 1, A = src.n, d = src.data, out = new Float32Array(d.length);
  const P = [start, bend, end].map(([x, y]) => [(x / 100) * w, (y / 100) * h]), N = 64, pts: Array<{ x: number; y: number; tx: number; ty: number; u: number }> = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, v = 1 - u, tx = 2 * v * (P[1][0] - P[0][0]) + 2 * u * (P[2][0] - P[1][0]), ty = 2 * v * (P[1][1] - P[0][1]) + 2 * u * (P[2][1] - P[1][1]), l = Math.hypot(tx, ty) || 1;
    pts.push({ x: v * v * P[0][0] + 2 * v * u * P[1][0] + u * u * P[2][0], y: v * v * P[0][1] + 2 * v * u * P[1][1] + u * u * P[2][1], tx: tx / l, ty: ty / l, u });
  }
  const len = Math.max(0, speed), n = Math.max(2, Math.min(48, Math.round(len))), tp = Math.min(1, Math.max(0, taper / 100)), acc = new Float64Array(S);
  const at = (u: number, v: number): void => {
    const cu = Math.min(w - 1, Math.max(0, u)), cv = Math.min(h - 1, Math.max(0, v)), x0 = Math.floor(cu), y0 = Math.floor(cv), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), fx = cu - x0, fy = cv - y0;
    for (const [xx, yy, wg] of [[x0, y0, (1 - fx) * (1 - fy)], [x1, y0, fx * (1 - fy)], [x0, y1, (1 - fx) * fy], [x1, y1, fx * fy]] as const) {
      const s = (yy * w + xx) * S, al = d[s + A] * wg;
      acc[A] += al;
      for (let c = 0; c < A; c++) acc[c] += d[s + c] * al;
    }
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let best = pts[0], bd = Infinity;
    for (const p of pts) { const dd = (p.x - x) ** 2 + (p.y - y) ** 2; if (dd < bd) { bd = dd; best = p; } }
    const L = len * (1 - tp * best.u);
    acc.fill(0);
    for (let s = 0; s < n; s++) { const t = (s / (n - 1) - 0.5) * L; at(x + best.tx * t, y + best.ty * t); }
    const o = (y * w + x) * S;
    out[o + A] = acc[A] / n;
    for (let c = 0; c < A; c++) out[o + c] = acc[A] > 0 ? acc[c] / acc[A] : 0;
  }
  return { ...src, data: out };
}

/** Lens Blur with a round iris and no depth source on floats: a disc average in premultiplied alpha, with the pixels at or
 *  above `threshold` (0 to 255 of brightness) multiplied by 1 + 8 x `brightness` percent first, as the 8 bit filter does. */
export function lensBlurDeep(src: DeepPixels, radius: number, brightness: number, threshold: number): DeepPixels {
  const { width: w, height: h } = src, S = src.n + 1, A = src.n, d = src.data, R = Math.max(0, Math.round(radius)), boost = 1 + (brightness / 100) * 8;
  if (R === 0) return { ...src, data: d.slice() };
  const planes = Array.from({ length: S }, () => new Float32Array(w * h));
  for (let p = 0; p < w * h; p++) {
    const i = p * S, a = d[i + A], lum = src.n >= 3 ? 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] : d[i], k = brightness > 0 && lum * 255 >= threshold ? boost : 1;
    for (let c = 0; c < A; c++) planes[c][p] = d[i + c] * a * k;
    planes[A][p] = a;
  }
  const span = Array.from({ length: 2 * R + 1 }, (_, i) => Math.floor(Math.sqrt(Math.max(0, R * R + R - (i - R) * (i - R)))));
  let area = 0;
  for (const s of span) area += 2 * s + 1;
  const out = new Float32Array(d.length), sums = new Float64Array(S), pre = Array.from({ length: S }, () => new Float64Array((w + 1) * h));
  for (let c = 0; c < S; c++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) pre[c][y * (w + 1) + x + 1] = pre[c][y * (w + 1) + x] + planes[c][y * w + x];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    sums.fill(0);
    for (let j = 0; j < span.length; j++) {
      const yy = y + j - R;
      if (yy < 0 || yy >= h) continue;
      const x0 = Math.max(0, x - span[j]), x1 = Math.min(w, x + span[j] + 1), o = yy * (w + 1);
      for (let c = 0; c < S; c++) sums[c] += pre[c][o + x1] - pre[c][o + x0];
    }
    const a = sums[A] / area, i = (y * w + x) * S;
    out[i + A] = a;
    for (let c = 0; c < A; c++) out[i + c] = sums[A] > 1e-9 ? sums[c] / sums[A] : 0;
  }
  return { ...src, data: out };
}

/** The float version of gallery filter `kind` (Radial, Field, Iris, Tilt-Shift, Path with a curved path) with its settings, or null for the others. */
export function deepGalleryFilter(kind: GalleryKind, g: GallerySettings): ((d: DeepPixels) => DeepPixels) | null {
  if (kind === 'pathBlur') return g.pathDrawn ? null : (d) => pathBlurDeep(d, g.pathSpeed, [g.pathSx, g.pathSy], [g.pathBx, g.pathBy], [g.pathEx, g.pathEy], g.pathTaper);
  if (kind === 'radialBlur') return (d) => radialBlurDeep(d, g.radialAmount, g.radialMethod, g.radialX, g.radialY, g.radialQuality);
  if (kind !== 'fieldBlur' && kind !== 'irisBlur' && kind !== 'tiltShift') return null;
  return (d) => { const m = galleryRadii(kind, g, d.width, d.height, 1); return m ? variableBlurDeep(d, m) : d; };
}

export const DEEP_GALLERY_KINDS: readonly string[] = ['radialBlur', 'fieldBlur', 'irisBlur', 'tiltShift', 'pathBlur'];

/** Library filters that compute on the float channels of a 16 bit, 32 bit, CMYK or Lab document, with no round trip
 *  through 8 bits: Blur, Blur More, Box Blur, Sharpen, Sharpen More, Sharpen Edges, High Pass, Maximum, Minimum, Median (radius 6 or less), Dust and Scratches (the same), Emboss and Find Edges.
 *  Pixels are interleaved channels with alpha last; colour is averaged with alpha as the weight. */

export function boxBlurDeep(src: DeepPixels, radius: number): DeepPixels {
  const r = Math.round(radius), { width: w, height: h } = src, S = src.n + 1, A = src.n, N = w * h;
  if (r < 1) return { ...src, data: new Float32Array(src.data) };
  const out = new Float32Array(src.data), alpha = new Float32Array(N), plane = new Float32Array(N);
  for (let p = 0; p < N; p++) alpha[p] = src.data[p * S + A];
  const ma = boxMean(alpha, w, h, r);
  for (let c = 0; c < A; c++) {
    for (let p = 0; p < N; p++) plane[p] = src.data[p * S + c] * alpha[p];
    const m = boxMean(plane, w, h, r);
    for (let p = 0; p < N; p++) out[p * S + c] = ma[p] > 0 ? m[p] / ma[p] : 0;
  }
  for (let p = 0; p < N; p++) out[p * S + A] = ma[p];
  return { ...src, data: out };
}

/** High Pass on floats: each colour channel's difference from its blur plus the middle grey; alpha is kept. */
export function highPassDeep(src: DeepPixels, radius: number, ceiling = 1): DeepPixels {
  const S = src.n + 1, A = src.n, s = src.data, o = new Float32Array(s), pm = new Float32Array(s);
  for (let i = 0; i < pm.length; i += S) for (let c = 0; c < A; c++) pm[i + c] *= s[i + A];
  const sm = separable(pm, src.width, src.height, S, gaussKernel(Math.max(0.1, radius))), soft = new Float32Array(sm);
  for (let i = 0; i < soft.length; i += S) for (let c = 0; c < A; c++) soft[i + c] = sm[i + A] > 0 ? sm[i + c] / sm[i + A] : 0;
  for (let i = 0; i < s.length; i += S) for (let c = 0; c < A; c++) o[i + c] = Math.min(ceiling, Math.max(0, 0.5 + s[i + c] - soft[i + c]));
  return { ...src, data: o };
}

/** Maximum (grows the light areas) or Minimum (grows the dark ones) on floats, over a square of side 2r+1, per channel. */
export function minMaxDeep(src: DeepPixels, radius: number, max: boolean): DeepPixels {
  const r = Math.round(radius), { width: w, height: h } = src, S = src.n + 1, N = w * h;
  if (r < 1) return { ...src, data: new Float32Array(src.data) };
  const out = new Float32Array(src.data), plane = new Float32Array(N), tmp = new Float32Array(N);
  const pick = (a: number, b: number): number => (max ? (a > b ? a : b) : (a < b ? a : b));
  for (let c = 0; c < S; c++) {
    for (let p = 0; p < N; p++) plane[p] = src.data[p * S + c];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = plane[y * w + x];
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) v = pick(v, plane[y * w + k]);
      tmp[y * w + x] = v;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = tmp[y * w + x];
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) v = pick(v, tmp[k * w + x]);
      out[(y * w + x) * S + c] = v;
    }
  }
  return { ...src, data: out };
}

/** The largest Median or Dust and Scratches radius the float path takes; larger ones stay on the 8-bit histogram. */
export const DEEP_MEDIAN_MAX = 6;

/** Median on floats: each channel (alpha too) the median over a disc of `radius`; with `threshold` (0 to 1) a value
 *  changes only where it differs from the median by more than that. */
export function medianDeep(src: DeepPixels, radius: number, threshold: number | null): DeepPixels {
  const r = Math.round(radius), { width: w, height: h } = src, S = src.n + 1;
  if (r < 1) return { ...src, data: new Float32Array(src.data) };
  const half: number[] = [];
  for (let dy = -r; dy <= r; dy++) half.push(Math.floor(Math.sqrt(r * r - dy * dy + 0.5)));
  const out = new Float32Array(src.data), win = new Float32Array((2 * r + 1) * (2 * r + 1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < S; c++) {
    let n = 0;
    for (let i = 0; i < half.length; i++) {
      const yy = y + i - r;
      if (yy < 0 || yy >= h) continue;
      for (let xx = Math.max(0, x - half[i]); xx <= Math.min(w - 1, x + half[i]); xx++) win[n++] = src.data[(yy * w + xx) * S + c];
    }
    const m = win.subarray(0, n).sort()[n >> 1], o = (y * w + x) * S + c;
    if (threshold === null || Math.abs(src.data[o] - m) > threshold) out[o] = m;
  }
  return { ...src, data: out };
}

/** Emboss on floats: mid grey plus Amount times each colour channel `height` pixels away from the light less its value as far toward it. */
export function embossDeep(src: DeepPixels, angle: number, height: number, amount: number, ceiling = 1): DeepPixels {
  const { width: w, height: h } = src, S = src.n + 1, A = src.n, t = (angle * Math.PI) / 180, lx = Math.cos(t) * height, ly = -Math.sin(t) * height, k = amount / 100;
  const out = new Float32Array(src.data);
  const at = (fx: number, fy: number, c: number): number => {
    const cx = Math.min(w - 1, Math.max(0, fx)), cy = Math.min(h - 1, Math.max(0, fy)), x0 = Math.floor(cx), y0 = Math.floor(cy), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), tx = cx - x0, ty = cy - y0;
    const g = (xx: number, yy: number): number => src.data[(yy * w + xx) * S + c];
    return (g(x0, y0) * (1 - tx) + g(x1, y0) * tx) * (1 - ty) + (g(x0, y1) * (1 - tx) + g(x1, y1) * tx) * ty;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < A; c++) out[(y * w + x) * S + c] = Math.min(ceiling, Math.max(0, 0.5 + (at(x - lx, y - ly, c) - at(x + lx, y + ly, c)) * k));
  return { ...src, data: out };
}

/** Find Edges on floats: each colour channel's Sobel gradient drawn dark on white, flat areas white. */
export function findEdgesDeep(src: DeepPixels, ceiling = 1): DeepPixels {
  const { width: w, height: h } = src, S = src.n + 1, A = src.n, out = new Float32Array(src.data);
  const at = (x: number, y: number, c: number): number => src.data[(Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * S + c];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < A; c++) {
    const gx = at(x + 1, y - 1, c) + 2 * at(x + 1, y, c) + at(x + 1, y + 1, c) - at(x - 1, y - 1, c) - 2 * at(x - 1, y, c) - at(x - 1, y + 1, c);
    const gy = at(x - 1, y + 1, c) + 2 * at(x, y + 1, c) + at(x + 1, y + 1, c) - at(x - 1, y - 1, c) - 2 * at(x, y - 1, c) - at(x + 1, y - 1, c);
    out[(y * w + x) * S + c] = Math.min(ceiling, Math.max(0, 1 - Math.hypot(gx, gy) * 0.5));
  }
  return { ...src, data: out };
}

/** Solarize on floats: each colour channel above the middle is turned to its inverse; alpha is kept. */
export function solarizeDeep(src: DeepPixels): DeepPixels {
  const S = src.n + 1, A = src.n, out = new Float32Array(src.data);
  for (let i = 0; i < out.length; i += S) for (let c = 0; c < A; c++) if (out[i + c] > 0.5) out[i + c] = Math.max(0, 1 - out[i + c]);
  return { ...src, data: out };
}

/** Custom on floats: each colour channel the sum of its 5 by 5 neighbourhood times `kernel`, over `scale`, plus `offset` (in 8-bit levels); edge pixels repeat outward. */
export function customDeep(src: DeepPixels, kernel: readonly number[], scale: number, offset: number, ceiling = 1): DeepPixels {
  const { width: w, height: h } = src, S = src.n + 1, A = src.n, out = new Float32Array(src.data), k = 1 / Math.max(1, scale), off = offset / 255;
  const taps: Array<[number, number, number]> = [];
  kernel.forEach((v, i) => { if (v) taps.push([(i % 5) - 2, Math.floor(i / 5) - 2, v]); });
  if (!taps.length) return { ...src, data: out };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < A; c++) {
    let sum = 0;
    for (const [tx, ty, v] of taps) sum += src.data[(Math.min(h - 1, Math.max(0, y + ty)) * w + Math.min(w - 1, Math.max(0, x + tx))) * S + c] * v;
    out[(y * w + x) * S + c] = Math.min(ceiling, Math.max(0, sum * k + off));
  }
  return { ...src, data: out };
}

/** Offset on floats: the whole layer moved by whole pixels; the uncovered strip is cleared, repeats the edge or wraps. */
export function offsetDeep(src: DeepPixels, dx: number, dy: number, undefinedAreas: string): DeepPixels {
  const { width: w, height: h } = src, S = src.n + 1, mx = Math.round(dx), my = Math.round(dy), out = new Float32Array(src.data);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let sx = x - mx, sy = y - my;
    const o = (y * w + x) * S;
    if (undefinedAreas === 'wrap') { sx = ((sx % w) + w) % w; sy = ((sy % h) + h) % h; }
    else if (undefinedAreas === 'repeat') { sx = Math.min(w - 1, Math.max(0, sx)); sy = Math.min(h - 1, Math.max(0, sy)); }
    else if (sx < 0 || sy < 0 || sx >= w || sy >= h) { for (let c = 0; c < S; c++) out[o + c] = 0; continue; }
    const q = (sy * w + sx) * S;
    for (let c = 0; c < S; c++) out[o + c] = src.data[q + c];
  }
  return { ...src, data: out };
}

/** Mosaic on floats: square cells from the layer's corner, each the alpha-weighted mean of its pixels. */
export function mosaicDeep(src: DeepPixels, cellSize: number): DeepPixels {
  const { width: w, height: h } = src, S = src.n + 1, A = src.n, cell = Math.max(1, Math.round(cellSize)), out = new Float32Array(src.data), sum = new Float64Array(A);
  for (let y0 = 0; y0 < h; y0 += cell) for (let x0 = 0; x0 < w; x0 += cell) {
    const x1 = Math.min(w, x0 + cell), y1 = Math.min(h, y0 + cell);
    let a = 0, n = 0;
    sum.fill(0);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const q = (y * w + x) * S, al = src.data[q + A];
      for (let c = 0; c < A; c++) sum[c] += src.data[q + c] * al;
      a += al; n++;
    }
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const o = (y * w + x) * S;
      if (a > 0) for (let c = 0; c < A; c++) out[o + c] = sum[c] / a;
      out[o + A] = a / n;
    }
  }
  return { ...src, data: out };
}

/** A distort filter's backward map run over float channels: the 8 bit remap's bilinear premultiplied sampling and edge handling, on the whole layer. */
export function remapDeep(src: DeepPixels, wp: Warp | null): DeepPixels {
  const { width: w, height: h } = src, S = src.n + 1, A = src.n, d = src.data, out = new Float32Array(d);
  if (!wp) return { ...src, data: out };
  const acc = new Float64Array(S);
  const fetch = (ix: number, iy: number, wt: number): void => {
    let x = ix, y = iy;
    if (wp.edge === 'wrap') { x = ((x % w) + w) % w; y = ((y % h) + h) % h; }
    else if (wp.edge === 'repeat') { x = Math.min(w - 1, Math.max(0, x)); y = Math.min(h - 1, Math.max(0, y)); }
    else if (x < 0 || y < 0 || x >= w || y >= h) return;
    const q = (y * w + x) * S, a = d[q + A] * wt;
    for (let c = 0; c < A; c++) acc[c] += d[q + c] * a;
    acc[A] += a;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = wp.f(x + 0.5, y + 0.5);
    if (!p) continue;
    const fx = p[0] - 0.5, fy = p[1] - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    acc.fill(0);
    fetch(x0, y0, (1 - tx) * (1 - ty)); fetch(x0 + 1, y0, tx * (1 - ty)); fetch(x0, y0 + 1, (1 - tx) * ty); fetch(x0 + 1, y0 + 1, tx * ty);
    const o = (y * w + x) * S;
    if (acc[A] < 0.5 / 255) { for (let c = 0; c < S; c++) out[o + c] = 0; continue; }
    for (let c = 0; c < A; c++) out[o + c] = acc[c] / acc[A];
    out[o + A] = acc[A];
  }
  return { ...src, data: out };
}

const lumaAt = (d: Float32Array, i: number): number => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/** Fragment on floats: four copies moved `offset` pixels left, right, up and down, averaged in premultiplied alpha. */
export function fragmentDeep(src: DeepPixels, offset: number): DeepPixels {
  const k = Math.max(1, Math.round(offset)), { width: w, height: h } = src, S = src.n + 1, A = src.n, d = src.data, out = new Float32Array(d), acc = new Float64Array(S);
  const shifts: Array<[number, number]> = [[-k, 0], [k, 0], [0, -k], [0, k]];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    acc.fill(0);
    for (const [dx, dy] of shifts) {
      const q = (Math.min(h - 1, Math.max(0, y + dy)) * w + Math.min(w - 1, Math.max(0, x + dx))) * S, al = d[q + A];
      for (let c = 0; c < A; c++) acc[c] += d[q + c] * al;
      acc[A] += al;
    }
    const o = (y * w + x) * S;
    if (acc[A] > 0) for (let c = 0; c < A; c++) out[o + c] = acc[c] / acc[A];
    out[o + A] = acc[A] / 4;
  }
  return { ...src, data: out };
}

/** Crystallize on floats: cells around the 8 bit filter's jittered points, each the pixel at its point. */
export function crystallizeDeep(src: DeepPixels, cellSize: number, seed: number): DeepPixels {
  const { width: w, height: h } = src, S = src.n + 1, cell = Math.max(2, cellSize), out = new Float32Array(src.data);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ci = Math.floor(x / cell), cj = Math.floor(y / cell);
    let best = Infinity, bx = x, by = y;
    for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
      const [sx, sy] = site(i, j, cell, seed, 0, 0), dd = (sx - x - 0.5) ** 2 + (sy - y - 0.5) ** 2;
      if (dd < best) { best = dd; bx = sx; by = sy; }
    }
    const q = (Math.min(h - 1, Math.max(0, Math.floor(by))) * w + Math.min(w - 1, Math.max(0, Math.floor(bx)))) * S, o = (y * w + x) * S;
    for (let c = 0; c < S; c++) out[o + c] = src.data[q + c];
  }
  return { ...src, data: out };
}

/** Diffuse on floats: each pixel swapped for a neighbour the 8 bit filter's random picks name, by its mode. */
export function diffuseDeep(src: DeepPixels, mode: string, seed: number): DeepPixels {
  const { width: w, height: h } = src, S = src.n + 1, d = src.data, out = new Float32Array(d), rgb = src.n >= 3;
  const L = new Float32Array(w * h);
  for (let p = 0; p < L.length; p++) L[p] = rgb ? lumaAt(d, p * S) * 255 : d[p * S] * 255;
  const pick = (x: number, y: number, k: number): number => {
    const dx = Math.floor(hash01(x, y, 2 * k, seed) * 3) - 1, dy = Math.floor(hash01(x, y, 2 * k + 1, seed) * 3) - 1;
    return Math.min(h - 1, Math.max(0, y + dy)) * w + Math.min(w - 1, Math.max(0, x + dx));
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const me = y * w + x;
    let q = pick(x, y, 0);
    if (mode === 'anisotropic') {
      for (let k = 1; k < 3; k++) { const c = pick(x, y, k); if (Math.abs(L[c] - L[me]) < Math.abs(L[q] - L[me]) - 1e-4) q = c; }
    } else if ((mode === 'darkenOnly' && L[q] >= L[me] - 1e-4) || (mode === 'lightenOnly' && L[q] <= L[me] + 1e-4)) continue;
    for (let c = 0; c < S; c++) out[me * S + c] = d[q * S + c];
  }
  return { ...src, data: out };
}

/** Wind on floats: bright pixels blown into streaks downwind, as the 8 bit filter draws them. */
export function windDeep(src: DeepPixels, method: string, fromRight: boolean, seed: number): DeepPixels {
  const { width: w, height: h } = src, S = src.n + 1, A = src.n, d = src.data, out = new Float32Array(d), rgb = src.n >= 3, max = windReach(method);
  for (let y = 0; y < h; y++) {
    const trail = new Float64Array(S);
    let strength = 0, fade = 0.9;
    for (let k = 0; k < w; k++) {
      const x = fromRight ? w - 1 - k : k, i = y * w + x, o = i * S, l = rgb ? lumaAt(d, o) : d[o];
      if (l > strength) {
        const len = Math.max(1, max * (0.35 + 0.65 * hash01(x, y, 1, seed)));
        fade = method === 'stagger' && hash01(Math.floor(x / 6), y, 2, seed) < 0.4 ? 0 : Math.exp(-3 / len);
        strength = l;
        for (let c = 0; c < S; c++) trail[c] = d[o + c];
      } else {
        strength *= fade;
        for (let c = 0; c < A; c++) trail[c] *= fade;
        if (strength > l) for (let c = 0; c < A; c++) out[o + c] = Math.max(d[o + c], trail[c]);
      }
    }
  }
  return { ...src, data: out };
}

/** Facet on floats: each pixel the mean of the commonest colour family (16 levels a channel) around it. */
export function facetDeep(src: DeepPixels, radius: number): DeepPixels {
  const r = Math.max(1, Math.round(radius)), { width: w, height: h } = src, S = src.n + 1, d = src.data, out = new Float32Array(d), counts = new Map<number, Float64Array>();
  const fam = (v: number): number => Math.min(15, Math.max(0, Math.floor(v * 255 + 1e-3) >> 4));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    counts.clear();
    let top: Float64Array | null = null;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const q = (Math.min(h - 1, Math.max(0, y + dy)) * w + Math.min(w - 1, Math.max(0, x + dx))) * S;
      let key = 0;
      for (let c = 0; c < Math.min(3, src.n); c++) key = key * 16 + fam(d[q + c]);
      let e = counts.get(key);
      if (!e) { e = new Float64Array(S + 1); counts.set(key, e); }
      e[0]++;
      for (let c = 0; c < S; c++) e[c + 1] += d[q + c];
      if (!top || e[0] > top[0]) top = e;
    }
    if (!top) continue;
    for (let c = 0; c < S; c++) out[(y * w + x) * S + c] = top[c + 1] / top[0];
  }
  return { ...src, data: out };
}

export const DEEP_DISTORT: readonly string[] = ['twirl', 'pinch', 'spherize', 'ripple', 'wave', 'zigZag', 'polarCoordinates', 'shear'];

/** The backward map of distort filter `kind` over a `w` by `h` layer, or undefined for another filter. */
function warpOf(kind: string, v: Record<string, unknown>, w: number, h: number): Warp | null | undefined {
  const num = (k: string): number => (typeof v[k] === 'number' ? (v[k] as number) : 0), str = (k: string): string => (typeof v[k] === 'string' ? (v[k] as string) : ''), area = { x0: 0, y0: 0, x1: w, y1: h };
  if (kind === 'twirl') return twirlWarp(num('angle'), area);
  if (kind === 'pinch') return pinchWarp(num('amount'), area);
  if (kind === 'spherize') return spherizeWarp(num('amount'), str('mode'), area);
  if (kind === 'ripple') return rippleWarp(num('amount'), str('size'), area, 1);
  if (kind === 'zigZag') return zigZagWarp(num('amount'), num('ridges'), str('style'), area);
  if (kind === 'polarCoordinates') return polarWarp(str('mode'), area);
  if (kind === 'shear') return shearWarp(num('top'), num('middle'), num('bottom'), str('undefinedAreas') === 'repeat' ? 'repeat' : 'wrap', area, Array.isArray(v.curve) ? (v.curve as number[]) : []);
  if (kind === 'wave') return waveWarp({ generators: num('generators'), wavelength: [num('wavelengthMin'), Math.max(num('wavelengthMin'), num('wavelengthMax'))], amplitude: [num('amplitudeMin'), Math.max(num('amplitudeMin'), num('amplitudeMax'))], scaleX: num('scaleX'), scaleY: num('scaleY'), type: str('type'), edge: str('undefinedAreas') === 'repeat' ? 'repeat' : 'wrap', seed: num('seed') }, area, 1);
  return undefined;
}

const FIXED_SHARPEN: Record<string, [number, number, number]> = { sharpen: [50, 0.6, 0], sharpenMore: [120, 0.7, 0], sharpenEdges: [100, 1, 8] };

/** The float version of library filter `kind` with its stored `values`, or null when it only runs on 8 bits. */
export function deepLibFilter(kind: string, values: Record<string, unknown>, ceiling: number, seed = 1): ((d: DeepPixels) => DeepPixels) | null {
  const num = (k: string): number => (typeof values[k] === 'number' ? (values[k] as number) : 0);
  if (kind === 'despeckle') return (d) => surfaceBlurDeep(d, 3, 15);
  if (kind === 'fragment') return (d) => fragmentDeep(d, 4);
  if (kind === 'facet') return (d) => facetDeep(d, 2);
  if (kind === 'crystallize') return (d) => crystallizeDeep(d, num('cellSize'), seed);
  if (kind === 'diffuse') return (d) => diffuseDeep(d, typeof values.mode === 'string' ? values.mode : 'normal', seed);
  if (kind === 'wind') return (d) => windDeep(d, typeof values.method === 'string' ? values.method : 'wind', values.direction !== 'fromLeft', seed);
  if (kind === 'blur') return (d) => blurDeep(d, 0.7);
  if (kind === 'blurMore') return (d) => blurDeep(d, 1.5);
  if (kind === 'boxBlur') return (d) => boxBlurDeep(d, num('radius'));
  if (kind === 'highPass') return (d) => highPassDeep(d, num('radius'), ceiling);
  if (kind === 'maximum' || kind === 'minimum') return (d) => minMaxDeep(d, num('radius'), kind === 'maximum');
  if (kind === 'median' && num('radius') <= DEEP_MEDIAN_MAX) return (d) => medianDeep(d, num('radius'), null);
  if (kind === 'dustAndScratches' && num('radius') <= DEEP_MEDIAN_MAX) return (d) => medianDeep(d, num('radius'), num('threshold') > 0 ? (num('threshold') + 0.5) / 255 : 0);
  if (kind === 'emboss') return (d) => embossDeep(d, num('angle'), Math.max(1, num('height')), num('amount'), ceiling);
  if (kind === 'findEdges') return (d) => findEdgesDeep(d, ceiling);
  if (kind === 'solarize') return (d) => solarizeDeep(d);
  if (kind === 'custom' && Array.isArray(values.kernel)) return (d) => customDeep(d, values.kernel as number[], Math.max(1, num('scale')), num('offset'), ceiling);
  if (kind === 'offset') return (d) => offsetDeep(d, num('horizontal'), num('vertical'), typeof values.undefinedAreas === 'string' ? values.undefinedAreas : 'transparent');
  if (kind === 'mosaic') return (d) => mosaicDeep(d, num('cellSize'));
  if (DEEP_DISTORT.includes(kind)) return (d) => remapDeep(d, warpOf(kind, values, d.width, d.height) ?? null);
  const fixed = FIXED_SHARPEN[kind];
  if (fixed) return (d) => unsharpDeep(d, fixed[0], fixed[1], fixed[2], ceiling);
  return null;
}

/** The library filters that run in float at depth, for the filter dialog's note and the agent's description. */
export const DEEP_LIB_KINDS: readonly string[] = ['blur', 'blurMore', 'boxBlur', 'sharpen', 'sharpenMore', 'sharpenEdges', 'highPass', 'maximum', 'minimum', 'median', 'dustAndScratches', 'emboss', 'findEdges', 'solarize', 'custom', 'offset', 'mosaic', 'despeckle', 'fragment', 'facet', 'crystallize', 'diffuse', 'wind', ...DEEP_DISTORT];
