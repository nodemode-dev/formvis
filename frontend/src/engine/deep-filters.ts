import { blurDeep, surfaceBlurDeep, unsharpDeep } from './deep';
import { inkOf, lut4Levels, type Lut3x4, type Lut4 } from './colour-lut';
import { encodeLab, labFloatToRgb, srgbToLab } from './lab';
import { site } from './filters-lib/pixelate';
import { windReach } from './filters-lib/stylize';
import type { DeepPixels, Rect } from './types';
import { boxMean, boxOf, clipBox, gaussKernel, hash01, separable, type Box } from './filters-lib/shared';
import { OUTLINES, spans } from './filters-lib/blur';
import { hexRgb } from './filters-lib/dither';
import { oil, oilPaintPlanes, type OilSettings } from './filters-lib/stylize';
import { light, lightingInto, type LightSettings } from './filters-lib/render';
import { runEffectsFloat, type FxRun } from './filters-lib/gallery-fx';
import { shown } from './filters-lib/filter-gallery';
import { cloudsDeep, colorHalftoneDeep, extrudeDeep, fibersDeep, lensFlareDeep, mezzotintDeep, pointillizeDeep, reduceNoiseDeep, shapeBlurDeep, smartBlurDeep, tilesDeep, traceContourDeep } from './deep-fx';
import { pinchWarp, polarWarp, rippleWarp, shearWarp, spherizeWarp, twirlWarp, waveWarp, zigZagWarp, type Warp } from './filters-lib/distort';
import { galleryRadii, type GalleryKind, type GallerySettings, type RadiusMap } from './blur-gallery';
import { decodeMap, shift } from './filters-lib/distort';
import { fromRgb, toRgb } from './filters-lib/other';
import { KERNELS, MATRICES } from './filters-lib/dither';
import type { SpinSettings } from './filters-lib/gallery';
import type { LibImage } from './filter-library';
import { weightedBlur, type SmartSharpenSettings } from './filters-more';

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
 *  through 8 bits: Blur, Blur More, Box Blur, Sharpen, Sharpen More, Sharpen Edges, High Pass, Maximum, Minimum, Median and Dust and Scratches (any radius), Emboss and Find Edges.
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

/** The k-th smallest of the first `n` values of `a` (0-based), exact, by quickselect with a median-of-three pivot; `a` is reordered. */
function kthOf(a: Float32Array, n: number, k: number): number {
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1, x = a[lo], y = a[mid], z = a[hi], p = x < y ? (y < z ? y : x < z ? z : x) : (x < z ? x : y < z ? z : y);
    let i = lo, j = hi;
    while (i <= j) {
      while (a[i] < p) i++;
      while (a[j] > p) j--;
      if (i <= j) { const t = a[i]; a[i] = a[j]; a[j] = t; i++; j--; }
    }
    if (k <= j) hi = j; else if (k >= i) lo = i; else return a[k];
  }
  return a[k];
}

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
    const m = kthOf(win, n, n >> 1), o = (y * w + x) * S + c;
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

/** Scanlines on floats: the colour channels of every line darkened by `darkness` percent, lines `spacing` apart and `thickness` percent of it wide from the canvas corner (`ox`, `oy`). */
export function scanlinesDeep(src: DeepPixels, spacing: number, thickness: number, darkness: number, vertical: boolean, ox: number, oy: number): DeepPixels {
  const w = src.width, S = src.n + 1, out = new Float32Array(src.data), sp = Math.max(2, spacing), on = Math.max(1, Math.round((sp * thickness) / 100)), keep = 1 - Math.max(0, Math.min(100, darkness)) / 100;
  for (let p = 0; p < w * src.height; p++) {
    const pos = vertical ? (p % w) + ox : Math.floor(p / w) + oy;
    if ((((pos % sp) + sp) % sp) >= on) continue;
    for (let c = 0; c < src.n; c++) out[p * S + c] *= keep;
  }
  return { ...src, data: out };
}

/** De-Interlace on floats: the rows of one field replaced by the mean of the rows either side or by the row above (the row below at the top edge); `top` is the canvas's top row in this layer. */
export function deInterlaceDeep(src: DeepPixels, eliminateEven: boolean, interpolate: boolean, top: number): DeepPixels {
  const { width: w, height: h } = src, S = src.n + 1, rowLen = w * S, s = src.data, out = new Float32Array(s);
  for (let y = 0; y < h; y++) {
    if ((((y - top) % 2) + 2) % 2 === 0 === eliminateEven) continue;
    const up = y > 0 ? y - 1 : y + 1, down = y < h - 1 ? y + 1 : y - 1;
    if (up < 0 || up >= h) continue;
    for (let i = 0; i < rowLen; i++) out[y * rowLen + i] = interpolate && down >= 0 && down < h ? (s[up * rowLen + i] + s[down * rowLen + i]) / 2 : s[up * rowLen + i];
  }
  return { ...src, data: out };
}

/** NTSC Colors on floats (red, green and blue layers): each colour's chroma in YIQ reduced until the signal stays between -0.1 and 1.0 of white. */
export function ntscDeep(src: DeepPixels): DeepPixels {
  const out = new Float32Array(src.data);
  if (src.n !== 3) return { ...src, data: out };
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i], g = out[i + 1], b = out[i + 2], y = 0.299 * r + 0.587 * g + 0.114 * b, iq = 0.596 * r - 0.274 * g - 0.322 * b, q = 0.211 * r - 0.523 * g + 0.312 * b, c = Math.hypot(iq, q);
    if (c <= 1e-6) continue;
    const k = Math.min(1, (1 - y) / c, (y + 0.1) / c);
    if (k >= 1) continue;
    const i2 = iq * Math.max(0, k), q2 = q * Math.max(0, k);
    out[i] = y + 0.956 * i2 + 0.621 * q2;
    out[i + 1] = y - 0.272 * i2 - 0.647 * q2;
    out[i + 2] = y - 1.106 * i2 + 1.703 * q2;
  }
  return { ...src, data: out };
}

/** Tonal Contrast on floats (red, green and blue layers): the difference of each pixel's luma from its blurred surround, scaled by a gain mixed from the shadow, midtone and highlight percents by the surround's tone, added to the colours. */
export function tonalContrastDeep(src: DeepPixels, radius: number, shadows: number, midtones: number, highlights: number, ceiling = 1): DeepPixels {
  const out = new Float32Array(src.data);
  if (src.n !== 3) return { ...src, data: out };
  const { width: w, height: h } = src, N = w * h, g = new Float32Array(N), s = src.data;
  for (let p = 0; p < N; p++) g[p] = 0.299 * s[p * 4] + 0.587 * s[p * 4 + 1] + 0.114 * s[p * 4 + 2];
  const base = separable(g, w, h, 1, gaussKernel(Math.max(0.5, radius)));
  for (let p = 0; p < N; p++) {
    const i = p * 4, tone = base[p], ws = Math.max(0, 1 - tone * 2), wh = Math.max(0, tone * 2 - 1), wm = 1 - ws - wh, delta = (g[p] - base[p]) * ((shadows * ws + midtones * wm + highlights * wh) / 100);
    if (delta === 0 || s[i + 3] === 0) continue;
    for (let c = 0; c < 3; c++) { const v = s[i + c] + delta; out[i + c] = v < 0 ? 0 : v > ceiling ? ceiling : v; }
  }
  return { ...src, data: out };
}

/** Color to Alpha on floats (red, green and blue layers): `key` (0 to 255) taken out of the picture, `tolerance` percent of it going fully clear. */
export function colorToAlphaDeep(src: DeepPixels, key: readonly [number, number, number], tolerance: number, ceiling = 1): DeepPixels {
  const out = new Float32Array(src.data);
  if (src.n !== 3) return { ...src, data: out };
  const tol = Math.max(0, Math.min(99, tolerance)) / 100, kk = unit(key);
  for (let i = 0; i < out.length; i += 4) {
    let a = 0;
    for (let c = 0; c < 3; c++) {
      const v = out[i + c], k = kk[c], e = v > k ? (v - k) / (1 - k || 1) : v < k ? (k - v) / (k || 1) : 0;
      if (e > a) a = e;
    }
    a = Math.max(0, (a - tol) / (1 - tol));
    if (a <= 0) { out[i + 3] = 0; continue; }
    for (let c = 0; c < 3; c++) out[i + c] = Math.min(ceiling, Math.max(0, kk[c] + (out[i + c] - kk[c]) / a));
    out[i + 3] *= Math.min(1, a);
  }
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
export function offsetDeep(src: DeepPixels, dx: number, dy: number, undefinedAreas: string, area: Box = { x0: 0, y0: 0, x1: src.width, y1: src.height }): DeepPixels {
  const { width: w, height: h } = src, S = src.n + 1, mx = Math.round(dx), my = Math.round(dy), out = new Float32Array(src.data), b = clipBox(area, w, h);
  if (!b) return { ...src, data: out };
  const fw = b.x1 - b.x0, fh = b.y1 - b.y0;
  for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) {
    let sx = x - b.x0 - mx, sy = y - b.y0 - my;
    const o = (y * w + x) * S;
    if (undefinedAreas === 'wrap') { sx = ((sx % fw) + fw) % fw; sy = ((sy % fh) + fh) % fh; }
    else if (undefinedAreas === 'repeat') { sx = Math.min(fw - 1, Math.max(0, sx)); sy = Math.min(fh - 1, Math.max(0, sy)); }
    else if (sx < 0 || sy < 0 || sx >= fw || sy >= fh) { for (let c = 0; c < S; c++) out[o + c] = 0; continue; }
    const q = ((sy + b.y0) * w + sx + b.x0) * S;
    for (let c = 0; c < S; c++) out[o + c] = src.data[q + c];
  }
  return { ...src, data: out };
}

/** Mosaic on floats: square cells from the layer's corner, each the alpha-weighted mean of its pixels. */
export function mosaicDeep(src: DeepPixels, cellSize: number, area: Box = { x0: 0, y0: 0, x1: src.width, y1: src.height }): DeepPixels {
  const { width: w, height: h } = src, S = src.n + 1, A = src.n, cell = Math.max(1, Math.round(cellSize)), out = new Float32Array(src.data), sum = new Float64Array(A), b = clipBox(area, w, h);
  if (!b) return { ...src, data: out };
  for (let cy = Math.floor((b.y0 - area.y0) / cell); area.y0 + cy * cell < b.y1; cy++) for (let cx = Math.floor((b.x0 - area.x0) / cell); area.x0 + cx * cell < b.x1; cx++) {
    const x0 = Math.max(0, area.x0 + cx * cell), y0 = Math.max(0, area.y0 + cy * cell), x1 = Math.min(w, area.x0 + (cx + 1) * cell), y1 = Math.min(h, area.y0 + (cy + 1) * cell);
    let a = 0, n = 0;
    sum.fill(0);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const q = (y * w + x) * S, al = src.data[q + A];
      for (let c = 0; c < A; c++) sum[c] += src.data[q + c] * al;
      a += al; n++;
    }
    if (!n) continue;
    for (let y = Math.max(y0, b.y0); y < Math.min(y1, b.y1); y++) for (let x = Math.max(x0, b.x0); x < Math.min(x1, b.x1); x++) {
      const o = (y * w + x) * S;
      if (a > 0) for (let c = 0; c < A; c++) out[o + c] = sum[c] / a;
      out[o + A] = a / n;
    }
  }
  return { ...src, data: out };
}

/** Oil Paint on floats: the 8 bit filter's flow-guided smear run on the colour channels in 255-level units; alpha is kept. */
export function oilPaintDeep(src: DeepPixels, o: OilSettings, ox: number, oy: number, ceiling = 1): DeepPixels {
  const { width: w, height: h } = src, S = src.n + 1, N = w * h, out = new Float32Array(src.data), rgb = new Float32Array(N * 3);
  const pick = (i: number, c: number): number => src.data[i * S + Math.min(c, src.n - 1)] * 255;
  for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) rgb[i * 3 + c] = pick(i, c);
  const res = oilPaintPlanes(rgb, w, h, o, 1, ox, oy);
  for (let i = 0; i < N; i++) for (let c = 0; c < Math.min(3, src.n); c++) out[i * S + c] = Math.min(ceiling, Math.max(0, res[i * 3 + c] / 255));
  return { ...src, data: out };
}

/** Lighting Effects on floats: the 8 bit filter's lights, relief and highlights over the colour channels in 255-level units; alpha is kept. */
export function lightingDeep(src: DeepPixels, o: LightSettings, more: readonly LightSettings[], area: Box, ceiling = 1): DeepPixels {
  const { width: w, height: h } = src, S = src.n + 1, A = src.n, N = w * h, out = new Float32Array(src.data), rgba = new Float32Array(N * 4), lit = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) { for (let c = 0; c < 3; c++) rgba[i * 4 + c] = src.data[i * S + Math.min(c, A - 1)] * 255; rgba[i * 4 + 3] = src.data[i * S + A] * 255; }
  lightingInto(rgba, lit, w, h, o, area, more);
  for (let i = 0; i < N; i++) for (let c = 0; c < Math.min(3, A); c++) out[i * S + c] = Math.min(ceiling, Math.max(0, lit[i * 4 + c] / 255));
  return { ...src, data: out };
}

/** The Filter Gallery's artistic, brush stroke, sketch and texture effect layers on floats: their colour maths already runs in
 *  floats, so the layer's channels go in at full precision and come out unrounded; alpha is kept. */
export function filterGalleryDeep(src: DeepPixels, list: readonly FxRun[], area: Rect, canvas: Rect, fg: readonly number[], bg: readonly number[], ceiling = 1): DeepPixels {
  const { width: w, height: h } = src, S = src.n + 1, A = src.n, N = w * h, out = new Float32Array(src.data), rgba = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) { for (let c = 0; c < 3; c++) rgba[i * 4 + c] = src.data[i * S + Math.min(c, A - 1)] * 255; rgba[i * 4 + 3] = src.data[i * S + A] * 255; }
  const rgb = runEffectsFloat(rgba, w, h, list, area, canvas, fg, bg);
  for (let i = 0; i < N; i++) for (let c = 0; c < Math.min(3, A); c++) out[i * S + c] = Math.min(ceiling, Math.max(0, rgb[i * 3 + c]));
  return { ...src, data: out };
}

/** A distort filter's backward map run over float channels: the 8 bit remap's bilinear premultiplied sampling and edge handling, on the whole layer. */
export function remapDeep(src: DeepPixels, wp: Warp | null, area: Box = { x0: 0, y0: 0, x1: src.width, y1: src.height }): DeepPixels {
  const { width: w, height: h } = src, S = src.n + 1, A = src.n, d = src.data, out = new Float32Array(d), b = clipBox(area, w, h);
  if (!wp || !b) return { ...src, data: out };
  const fw = b.x1 - b.x0, fh = b.y1 - b.y0, acc = new Float64Array(S);
  const fetch = (ix: number, iy: number, wt: number): void => {
    let x = ix - b.x0, y = iy - b.y0;
    if (wp.edge === 'wrap') { x = ((x % fw) + fw) % fw; y = ((y % fh) + fh) % fh; }
    else if (wp.edge === 'repeat') { x = Math.min(fw - 1, Math.max(0, x)); y = Math.min(fh - 1, Math.max(0, y)); }
    else if (x < 0 || y < 0 || x >= fw || y >= fh) return;
    const q = ((y + b.y0) * w + x + b.x0) * S, a = d[q + A] * wt;
    for (let c = 0; c < A; c++) acc[c] += d[q + c] * a;
    acc[A] += a;
  };
  for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) {
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
export function crystallizeDeep(src: DeepPixels, cellSize: number, seed: number, area: Box = { x0: 0, y0: 0, x1: src.width, y1: src.height }): DeepPixels {
  const { width: w, height: h } = src, S = src.n + 1, cell = Math.max(2, cellSize), out = new Float32Array(src.data), b = clipBox(area, w, h);
  if (!b) return { ...src, data: out };
  for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) {
    const ci = Math.floor((x - area.x0) / cell), cj = Math.floor((y - area.y0) / cell);
    let best = Infinity, bx = x, by = y;
    for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
      const [sx, sy] = site(i, j, cell, seed, area.x0, area.y0), dd = (sx - x - 0.5) ** 2 + (sy - y - 0.5) ** 2;
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

/** HSB/HSL on floats (red, green and blue layers): the channels read as `input` and written as `output`, alpha kept. */
export function hsbHslDeep(src: DeepPixels, input: string, output: string, ceiling = 1): DeepPixels {
  const out = new Float32Array(src.data);
  if (src.n !== 3 || input === output) return { ...src, data: out };
  for (let i = 0; i < out.length; i += 4) {
    const rgb = input === 'rgb' ? [out[i], out[i + 1], out[i + 2]] : toRgb(out[i], out[i + 1], out[i + 2], input), res = output === 'rgb' ? rgb : fromRgb(rgb[0], rgb[1], rgb[2], output);
    for (let c = 0; c < 3; c++) out[i + c] = Math.min(ceiling, Math.max(0, res[c]));
  }
  return { ...src, data: out };
}

/** Haze by Depth on floats (red, green and blue layers): each colour pulled toward the haze colour (0 to 255) by its distance, as the 8 bit filter reckons it. */
export function hazeDeep(src: DeepPixels, depth: LibImage | null, invert: boolean, haze: readonly number[], density: number, start: number, area: Box, ceiling = 1): DeepPixels {
  const { width: w } = src, out = new Float32Array(src.data), rg = depth ? decodeMap(depth) : null, fw = Math.max(1, area.x1 - area.x0), fh = Math.max(1, area.y1 - area.y0), s0 = Math.min(0.99, start / 100), k = density / 100;
  if (src.n !== 3) return { ...src, data: out };
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) continue;
    const p = i / 4, x = p % w, y = Math.floor(p / w);
    let far: number;
    if (depth && rg) {
      const sx = Math.min(depth.w - 1, Math.max(0, Math.floor(((x - area.x0) / fw) * depth.w))), sy = Math.min(depth.h - 1, Math.max(0, Math.floor(((y - area.y0) / fh) * depth.h)));
      far = rg[(sy * depth.w + sx) * 2] / 255;
    } else far = 1 - Math.min(1, Math.max(0, (y - area.y0) / fh));
    if (invert) far = 1 - far;
    const t = Math.max(0, (far - s0) / (1 - s0)) * k;
    if (t <= 0) continue;
    for (let c = 0; c < 3; c++) out[i + c] = Math.min(ceiling, Math.max(0, out[i + c] + (haze[c] / 255 - out[i + c]) * t));
  }
  return { ...src, data: out };
}

/** Grain Plate on floats (red, green and blue layers): the grain picture's offset from mid grey added to each colour, strongest in the midtones. */
export function grainPlateDeep(src: DeepPixels, plate: LibImage | null, amount: number, size: number, ox: number, oy: number, ceiling = 1): DeepPixels {
  const out = new Float32Array(src.data), rg = plate ? decodeMap(plate) : null;
  if (!plate || !rg || src.n !== 3) return { ...src, data: out };
  const w = src.width, pw = Math.max(1, Math.round((plate.w * size) / 100)), ph = Math.max(1, Math.round((plate.h * size) / 100)), k = amount / 100;
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) continue;
    const p = i / 4, x = (p % w) + ox, y = Math.floor(p / w) + oy;
    const sx = Math.floor((((x % pw) + pw) % pw) * (plate.w / pw)), sy = Math.floor((((y % ph) + ph) % ph) * (plate.h / ph));
    const g = (rg[(sy * plate.w + sx) * 2] - 128) / 128, l = Math.min(1, Math.max(0, lumaAt(out, i))), wgt = 1 - 0.6 * (2 * l - 1) * (2 * l - 1);
    for (let c = 0; c < 3; c++) out[i + c] = Math.min(ceiling, Math.max(0, out[i + c] + (g * k * 128 * wgt) / 255));
  }
  return { ...src, data: out };
}

/** The ordered patterns of Dither on floats (red, green and blue layers): each value cut to `levels` steps against the pattern's threshold, `amount` percent hard. Error diffusion, ASCII and halftone screens stay on 8 bits. */
export function ditherDeep(src: DeepPixels, pattern: string, levels: number, pixel: number, colour: boolean, amount: number, ink: readonly number[], paper: readonly number[], ox: number, oy: number): DeepPixels {
  const out = new Float32Array(src.data), { n, m } = MATRICES[pattern] ?? MATRICES.bayer4;
  if (src.n !== 3) return { ...src, data: out };
  const q = Math.max(1, Math.round(levels) - 1), px = Math.max(1, Math.round(pixel)), a = Math.max(0, Math.min(1, amount / 100)), w = src.width;
  const cut = (v: number, t: number): number => {
    const s = Math.min(1, Math.max(0, v)) * q, lo = Math.floor(s), frac = s - lo, hard = (frac > t ? lo + 1 : lo) / q, soft = s / q;
    return soft + (hard - soft) * a;
  };
  for (let i = 0; i < out.length; i += 4) {
    const p = i / 4, x = (p % w) + ox, y = Math.floor(p / w) + oy, t = (m[(((Math.floor(y / px) % n) + n) % n) * n + (((Math.floor(x / px) % n) + n) % n)] + 0.5) / (n * n);
    if (colour) { for (let c = 0; c < 3; c++) out[i + c] = cut(out[i + c], t); continue; }
    const k = cut(lumaAt(out, i), t);
    for (let c = 0; c < 3; c++) out[i + c] = (ink[c] + (paper[c] - ink[c]) * k) / 255;
  }
  return { ...src, data: out };
}

/** The error diffusion patterns of Dither on floats (red, green and blue layers): cells of `pixel` pixels rounded to `levels` steps, the rounding error spread on by the kernel, `diffusion` percent of it. */
export function ditherDiffuseDeep(src: DeepPixels, kernel: string, levels: number, pixel: number, colour: boolean, diffusion: number, ink: readonly number[], paper: readonly number[]): DeepPixels {
  const out = new Float32Array(src.data), { width: w, height: h } = src, k = KERNELS[kernel] ?? KERNELS.floyd;
  if (src.n !== 3) return { ...src, data: out };
  const px = Math.max(1, Math.round(pixel)), gw = Math.ceil(w / px), gh = Math.ceil(h / px), ch = colour ? 3 : 1, q = Math.max(1, Math.round(levels) - 1), f = Math.max(0, Math.min(1, diffusion / 100));
  const plane = new Float32Array(gw * gh * ch), seen = new Uint32Array(gw * gh);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (src.data[i + 3] === 0) continue;
    const g = Math.floor(y / px) * gw + Math.floor(x / px);
    seen[g]++;
    if (colour) for (let c = 0; c < 3; c++) plane[g * 3 + c] += src.data[i + c];
    else plane[g] += lumaAt(src.data, i);
  }
  for (let g = 0; g < gw * gh; g++) if (seen[g]) for (let c = 0; c < ch; c++) plane[g * ch + c] /= seen[g];
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const g = gy * gw + gx;
    if (!seen[g]) continue;
    for (let c = 0; c < ch; c++) {
      const old = Math.max(0, Math.min(1, plane[g * ch + c])), now = Math.round(old * q) / q, err = (plane[g * ch + c] - now) * f;
      plane[g * ch + c] = now;
      for (const [dx, dy, wt] of k.taps) {
        const nx = gx + dx, ny = gy + dy;
        if (nx < 0 || nx >= gw || ny >= gh || !seen[ny * gw + nx]) continue;
        plane[(ny * gw + nx) * ch + c] += (err * wt) / k.div;
      }
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (src.data[i + 3] === 0) continue;
    const g = Math.floor(y / px) * gw + Math.floor(x / px);
    for (let c = 0; c < 3; c++) out[i + c] = colour ? plane[g * 3 + c] : (ink[c] + (paper[c] - ink[c]) * plane[g]) / 255;
  }
  return { ...src, data: out };
}

/** The backward map of Displace: each pixel moved by the map's red level across and green level up and down, as the 8 bit filter reads it. */
export function displaceWarp(o: { h: number; v: number; tile: boolean; edge: 'wrap' | 'repeat'; map: LibImage | null }, area: Box): Warp | null {
  const m = o.map, rg = m ? decodeMap(m) : null;
  if (!m || !rg) return null;
  const fw = area.x1 - area.x0, fh = area.y1 - area.y0, kx = o.h / 100, ky = o.v / 100;
  const level = (u: number, v: number, c: number): number => rg[(Math.min(m.h - 1, Math.max(0, Math.floor(v * m.h))) * m.w + Math.min(m.w - 1, Math.max(0, Math.floor(u * m.w)))) * 2 + c];
  return { edge: o.edge, f: (x, y) => {
    const fx = x - area.x0, fy = y - area.y0, u = o.tile ? (((fx % m.w0) + m.w0) % m.w0) / m.w0 : fx / fw, v = o.tile ? (((fy % m.h0) + m.h0) % m.h0) / m.h0 : fy / fh;
    return [x - shift(level(u, v, 0)) * kx, y - shift(level(u, v, 1)) * ky];
  } };
}

/** Smart Sharpen on floats (red, green and blue layers): the 8 bit filter's Gaussian, lens or motion estimate on each colour plane, unrounded; alpha is kept. */
export function smartSharpenDeep(src: DeepPixels, s: SmartSharpenSettings, ceiling = 1): DeepPixels {
  const out = new Float32Array(src.data);
  if (src.n !== 3) return { ...src, data: out };
  const { width: w, height: h } = src, S = 4, n = w * h, r = Math.max(0.1, s.radius), amt = s.amount / 100, gate = (s.noise / 100) * 0.08, d = src.data;
  const wa = new Float32Array(n);
  for (let i = 0; i < n; i++) wa[i] = d[i * S + 3];
  const blur = weightedBlur(w, h, wa, s.remove === 'motion' ? 'line' : 'gauss', s.remove === 'motion' ? r * 2 : s.remove === 'lens' ? r / 2 : r, s.angle);
  const L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = 0.299 * d[i * S] + 0.587 * d[i * S + 1] + 0.114 * d[i * S + 2];
  for (let c = 0; c < 3; c++) {
    const obs = new Float32Array(n);
    let top = 1;
    for (let i = 0; i < n; i++) { obs[i] = d[i * S + c] + 1e-3; if (obs[i] > top) top = obs[i]; }
    let sharp: Float32Array;
    if (s.remove === 'gaussian') {
      const b = blur(obs);
      sharp = new Float32Array(n);
      for (let i = 0; i < n; i++) sharp[i] = obs[i] + (obs[i] - b[i]);
    } else {
      const est = obs.slice(), cap = ceiling === 1 ? 2 : 2 * top;
      for (let it = 0; it < 8; it++) {
        const b = blur(est), ratio = new Float32Array(n);
        for (let i = 0; i < n; i++) ratio[i] = obs[i] / Math.max(1e-4, b[i]);
        const back = blur(ratio);
        for (let i = 0; i < n; i++) est[i] = Math.min(cap, est[i] * back[i]);
      }
      sharp = est;
    }
    for (let i = 0; i < n; i++) {
      if (wa[i] === 0) continue;
      let diff = sharp[i] - obs[i];
      if (gate > 0) { const m = Math.abs(diff); diff *= m >= gate ? 1 : m / gate; }
      const fade = 1 - (s.shadows / 100) * Math.max(0, 1 - L[i] / 0.5) - (s.highlights / 100) * Math.max(0, (L[i] - 0.5) / 0.5);
      out[i * S + c] = Math.min(ceiling, Math.max(0, obs[i] - 1e-3 + diff * amt * Math.max(0, fade)));
    }
  }
  return { ...src, data: out };
}

/** Spin Blur on floats: inside an ellipse each pixel smeared along the ellipse's arcs, in premultiplied alpha, as the 8 bit filter does; `clip` limits where it works. */
export function spinDeep(src: DeepPixels, o: SpinSettings, clip: Box): DeepPixels {
  const out = new Float32Array(src.data), b = clipBox(clip, src.width, src.height);
  if (!b || o.blur <= 0 || o.rx <= 0 || o.ry <= 0) return { ...src, data: out };
  const { width: w, height: h } = src, S = src.n + 1, A = src.n, s = src.data, t = (o.angle * Math.PI) / 180, cs = Math.cos(t), sn = Math.sin(t), span = (o.blur * Math.PI) / 180, acc = new Float64Array(S);
  const tap = (q: number, wt: number): void => { const al = s[q + A] * wt; for (let c = 0; c < A; c++) acc[c] += s[q + c] * al; acc[A] += al; };
  for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) {
    const dx = x + 0.5 - o.cx, dy = y + 0.5 - o.cy, u = (dx * cs + dy * sn) / o.rx, v = (-dx * sn + dy * cs) / o.ry, rho = Math.hypot(u, v);
    const weight = rho <= 1 ? 1 : rho >= 1.1 ? 0 : (1.1 - rho) / 0.1;
    if (weight <= 0 || rho === 0) continue;
    const arc = span * weight, n = Math.max(3, Math.min(240, Math.ceil(arc * rho * Math.max(o.rx, o.ry)) + 1)), phi = Math.atan2(v, u);
    acc.fill(0);
    for (let k = 0; k < n; k++) {
      const a = phi + arc * (k / (n - 1) - 0.5), su = Math.cos(a) * rho * o.rx, sv = Math.sin(a) * rho * o.ry;
      const fx = Math.min(w - 1, Math.max(0, o.cx + su * cs - sv * sn - 0.5)), fy = Math.min(h - 1, Math.max(0, o.cy + su * sn + sv * cs - 0.5));
      const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
      tap((y0 * w + x0) * S, (1 - tx) * (1 - ty)); tap((y0 * w + x1) * S, tx * (1 - ty)); tap((y1 * w + x0) * S, (1 - tx) * ty); tap((y1 * w + x1) * S, tx * ty);
    }
    const i = (y * w + x) * S;
    if (acc[A] > 0) for (let c = 0; c < A; c++) out[i + c] = acc[c] / acc[A];
    out[i + A] = acc[A] / n;
  }
  return { ...src, data: out };
}

export const DEEP_DISTORT: readonly string[] =['twirl', 'pinch', 'spherize', 'ripple', 'wave', 'zigZag', 'polarCoordinates', 'shear'];

/** The backward map of distort filter `kind` over a `w` by `h` layer, or undefined for another filter. */
function warpOf(kind: string, v: Record<string, unknown>, area: Box): Warp | null | undefined {
  const num = (k: string): number => (typeof v[k] === 'number' ? (v[k] as number) : 0), str = (k: string): string => (typeof v[k] === 'string' ? (v[k] as string) : '');
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

/** The frame a float filter works in: the layer's place on the canvas and the foreground and background colours (0 to 255). */
export interface DeepEnv { area: { x: number; y: number; w: number; h: number }; canvas: { x: number; y: number; w: number; h: number }; fg: readonly [number, number, number]; bg: readonly [number, number, number] }

/** Float filters that read the selection's box or the canvas's place: under a selection they take the box as their frame (DeepEnv.area), as the 8 bit path does. */
export const DEEP_FRAMED: readonly string[] = ['offset', 'mosaic', 'crystallize', 'oilPaint', 'lightingEffects', 'filterGallery', 'tiles', 'extrude', 'pointillize', 'colorHalftone', 'mezzotint', 'clouds', 'differenceClouds', 'fibers', 'lensFlare', 'haze', 'spinBlur', 'displace'];

/** Float filters whose colour logic is red, green and blue (brightness, fixed colours): on CMYK and Lab layers they run through viaRgbDeep. */
export const DEEP_RGB_ONLY: readonly string[] = ['oilPaint', 'lightingEffects', 'filterGallery', 'tiles', 'extrude', 'smartBlur', 'reduceNoise', 'pointillize', 'colorHalftone', 'clouds', 'differenceClouds', 'fibers', 'lensFlare', 'scanlines', 'ntscColors', 'colorToAlpha', 'tonalContrast', 'hsbHsl', 'haze', 'grainPlate', 'dither', 'smartSharpen'];

const unit = (c: readonly [number, number, number]): [number, number, number] => [c[0] / 255, c[1] / 255, c[2] / 255];

/** The display and separation tables of a CMYK document. */
export interface InkTables { readonly out: Lut4; readonly inn: Lut3x4 }

/** A float filter for RGB run on a CMYK or Lab layer as the 8 bit path runs it: on the layer's RGB rendition, in floats,
 *  the result taken back by the rule that keeps a pixel's old structure in proportion to how little it changed (full at
 *  no change, none from 48 levels). Null for a CMYK layer without its tables. */
export function viaRgbDeep(fn: (d: DeepPixels) => DeepPixels, mode: 'cmyk' | 'lab', tables: InkTables | null): ((d: DeepPixels) => DeepPixels) | null {
  if (mode === 'cmyk' && !tables) return null;
  return (d) => {
    const { width: w, height: h, n } = d, S = n + 1, N = w * h, rgb = new Float32Array(N * 4), before = new Float32Array(N * 3);
    if (mode === 'cmyk') lut4Levels(d.data, tables!.out, before);
    for (let p = 0; p < N; p++) {
      if (mode === 'lab') { const c = labFloatToRgb(d.data[p * S], d.data[p * S + 1], d.data[p * S + 2]); for (let k = 0; k < 3; k++) before[p * 3 + k] = c[k] * 255; }
      for (let k = 0; k < 3; k++) rgb[p * 4 + k] = before[p * 3 + k] / 255;
      rgb[p * 4 + 3] = d.data[p * S + n];
    }
    const res = fn({ mode: 'rgb', n: 3, width: w, height: h, data: rgb }).data, out = new Float32Array(d.data), clamp = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
    for (let p = 0; p < N; p++) {
      const o = p * S, r = p * 4, f = [clamp(res[r]) * 255, clamp(res[r + 1]) * 255, clamp(res[r + 2]) * 255], b =[before[p * 3], before[p * 3 + 1], before[p * 3 + 2]];
      out[o + n] = res[r + 3];
      const dm = Math.max(Math.abs(f[0] - b[0]), Math.abs(f[1] - b[1]), Math.abs(f[2] - b[2]));
      if (dm < 1e-4) continue;
      const k = d.data[o + n] === 0 ? 0 : clamp(1 - dm / 48);
      if (mode === 'lab') {
        const a3 = encodeLab(...srgbToLab(f[0], f[1], f[2])), b3 = k ? encodeLab(...srgbToLab(b[0], b[1], b[2])) : a3;
        for (let c = 0; c < 3; c++) out[o + c] = clamp(a3[c] + k * (d.data[o + c] - b3[c]));
      } else {
        const a4 = inkOf({ r: f[0], g: f[1], b: f[2] }, tables!.inn), b4 = k ? inkOf({ r: b[0], g: b[1], b: b[2] }, tables!.inn) : a4;
        for (let c = 0; c < 4; c++) out[o + c] = clamp(a4[c] + k * (d.data[o + c] - b4[c]));
      }
    }
    return { ...d, data: out };
  };
}

/** The float version of library filter `kind` with its stored `values`, or null when it only runs on 8 bits. */
export function deepLibFilter(kind: string, values: Record<string, unknown>, ceiling: number, seed = 1, env?: DeepEnv): ((d: DeepPixels) => DeepPixels) | null {
  const num = (k: string): number => (typeof values[k] === 'number' ? (values[k] as number) : 0);
  const boxes = (d: DeepPixels): { area: Box; canvas: Box } => { const whole = { x: 0, y: 0, w: d.width, h: d.height }; return { area: boxOf(env?.area ?? whole), canvas: boxOf(env?.canvas ?? whole) }; };
  const fg = unit(env?.fg ?? [0, 0, 0]), bg = unit(env?.bg ?? [255, 255, 255]);
  if (kind === 'traceContour') return (d) => traceContourDeep(d, num('level'), values.edge === 'upper');
  if (kind === 'tiles') return (d) => tilesDeep(d, num('count'), num('maxOffset'), typeof values.fill === 'string' ? values.fill : 'background', seed, boxes(d).area, fg, bg);
  if (kind === 'extrude') return (d) => extrudeDeep(d, { kind: typeof values.type === 'string' ? values.type : 'blocks', size: num('size'), depth: num('depth'), levelBased: values.depthMode === 'levelBased', solidFront: values.solidFront === true, maskIncomplete: values.maskIncomplete === true, seed }, boxes(d).area, ceiling);
  if (kind === 'smartBlur') return (d) => smartBlurDeep(d, num('radius'), num('threshold'), typeof values.quality === 'string' ? values.quality : 'high', typeof values.mode === 'string' ? values.mode : 'normal');
  if (kind === 'shapeBlur') return (d) => shapeBlurDeep(d, spans(num('radius'), OUTLINES[typeof values.shape === 'string' ? values.shape : 'circle'] ?? OUTLINES.circle));
  if (kind === 'reduceNoise' && values.jpeg !== true) return (d) => reduceNoiseDeep(d, { strength: num('strength'), preserve: num('preserve'), color: num('color'), sharpen: num('sharpen') }, ceiling);
  if (kind === 'pointillize') return (d) => pointillizeDeep(d, num('cellSize'), seed, boxes(d).area, bg, ceiling);
  if (kind === 'colorHalftone') return (d) => colorHalftoneDeep(d, num('maxRadius'), [num('channel1'), num('channel2'), num('channel3'), num('channel4')], boxes(d).area);
  if (kind === 'mezzotint') return (d) => mezzotintDeep(d, typeof values.type === 'string' ? values.type : 'fineDots', seed, boxes(d).canvas);
  if (kind === 'clouds' || kind === 'differenceClouds') return (d) => cloudsDeep(d, kind === 'differenceClouds', seed, boxes(d).canvas, fg, bg);
  if (kind === 'fibers') return (d) => fibersDeep(d, num('variance'), num('strength'), num('seed'), boxes(d).canvas, fg, bg);
  if (kind === 'lensFlare') return (d) => lensFlareDeep(d, num('brightness'), num('centerX'), num('centerY'), typeof values.lens === 'string' ? values.lens : 'zoom', boxes(d).area);
  if (kind === 'scanlines') return (d) => scanlinesDeep(d, Math.max(2, Math.round(num('spacing'))), num('thickness'), num('darkness'), values.direction === 'vertical', -Math.round(env?.canvas.x ?? 0), -Math.round(env?.canvas.y ?? 0));
  if (kind === 'deInterlace') return (d) => deInterlaceDeep(d, values.eliminate === 'evenFields', values.createBy !== 'duplication', Math.round(env?.canvas.y ?? 0));
  if (kind === 'tonalContrast') return (d) => tonalContrastDeep(d, num('radius'), num('shadows'), num('midtones'), num('highlights'), ceiling);
  if (kind === 'ntscColors' && ceiling === 1) return (d) => ntscDeep(d);
  if (kind === 'colorToAlpha') return (d) => colorToAlphaDeep(d, hexRgb(typeof values.colour === 'string' ? values.colour : '#ffffff'), num('tolerance'), ceiling);
  if (kind === 'despeckle') return (d) => surfaceBlurDeep(d, 3, 15);
  if (kind === 'fragment') return (d) => fragmentDeep(d, 4);
  if (kind === 'facet') return (d) => facetDeep(d, 2);
  if (kind === 'crystallize') return (d) => crystallizeDeep(d, num('cellSize'), seed, boxes(d).area);
  if (kind === 'diffuse') return (d) => diffuseDeep(d, typeof values.mode === 'string' ? values.mode : 'normal', seed);
  if (kind === 'wind') return (d) => windDeep(d, typeof values.method === 'string' ? values.method : 'wind', values.direction !== 'fromLeft', seed);
  if (kind === 'blur') return (d) => blurDeep(d, 0.7);
  if (kind === 'blurMore') return (d) => blurDeep(d, 1.5);
  if (kind === 'boxBlur') return (d) => boxBlurDeep(d, num('radius'));
  if (kind === 'highPass') return (d) => highPassDeep(d, num('radius'), ceiling);
  if (kind === 'maximum' || kind === 'minimum') return (d) => minMaxDeep(d, num('radius'), kind === 'maximum');
  if (kind === 'median') return (d) => medianDeep(d, num('radius'), null);
  if (kind === 'dustAndScratches') return (d) => medianDeep(d, num('radius'), num('threshold') > 0 ? (num('threshold') + 0.5) / 255 : 0);
  if (kind === 'emboss') return (d) => embossDeep(d, num('angle'), Math.max(1, num('height')), num('amount'), ceiling);
  if (kind === 'findEdges') return (d) => findEdgesDeep(d, ceiling);
  if (kind === 'solarize') return (d) => solarizeDeep(d);
  if (kind === 'custom' && Array.isArray(values.kernel)) return (d) => customDeep(d, values.kernel as number[], Math.max(1, num('scale')), num('offset'), ceiling);
  if (kind === 'offset') return (d) => offsetDeep(d, num('horizontal'), num('vertical'), typeof values.undefinedAreas === 'string' ? values.undefinedAreas : 'transparent', boxes(d).area);
  if (kind === 'oilPaint') return (d) => oilPaintDeep(d, oil(values as Record<string, never>), Math.round(env?.canvas.x ?? 0), Math.round(env?.canvas.y ?? 0), ceiling);
  if (kind === 'lightingEffects') { const v = values as Record<string, never>; return (d) => lightingDeep(d, light(v), [2, 3].filter((n) => v[`l${n}On`] === true).map((n) => light(v, n)), boxes(d).area, ceiling); }
  if (kind === 'filterGallery') return (d) => { const fr = { area: env?.area ?? { x: 0, y: 0, w: d.width, h: d.height }, canvas: env?.canvas ?? { x: 0, y: 0, w: d.width, h: d.height } }; return filterGalleryDeep(d, shown(values as Record<string, never>), fr.area, fr.canvas, env?.fg ?? [0, 0, 0], env?.bg ?? [255, 255, 255], ceiling); };
  if (kind === 'mosaic') return (d) => mosaicDeep(d, num('cellSize'), boxes(d).area);
  if (kind === 'hsbHsl') return (d) => hsbHslDeep(d, typeof values.input === 'string' ? values.input : 'rgb', typeof values.output === 'string' ? values.output : 'hsb', ceiling);
  if (kind === 'haze') return (d) => hazeDeep(d, (values.depth as LibImage | null) ?? null, values.invert === true, hexRgb(typeof values.colour === 'string' ? values.colour : '#c9d6e6'), num('density'), num('start'), boxes(d).area, ceiling);
  if (kind === 'grainPlate') return (d) => grainPlateDeep(d, (values.plate as LibImage | null) ?? null, num('amount'), num('size'), -Math.round(env?.canvas.x ?? 0), -Math.round(env?.canvas.y ?? 0), ceiling);
  if (kind === 'displace') return (d) => { const a = boxes(d).area; return remapDeep(d, displaceWarp({ h: num('horizontal'), v: num('vertical'), tile: values.fit === 'tile', edge: values.undefinedAreas === 'wrap' ? 'wrap' : 'repeat', map: (values.map as LibImage | null) ?? null }, a), a); };
  if (kind === 'dither' && typeof values.pattern === 'string' && KERNELS[values.pattern]) return (d) => ditherDiffuseDeep(d, values.pattern as string, num('levels'), num('pixel'), values.mode === 'colour', num('diffusion'), env?.fg ?? [0, 0, 0], env?.bg ?? [255, 255, 255]);
  if (kind === 'dither' && typeof values.pattern === 'string' && MATRICES[values.pattern]) return (d) => ditherDeep(d, values.pattern as string, num('levels'), num('pixel'), values.mode === 'colour', num('amount'), env?.fg ?? [0, 0, 0], env?.bg ?? [255, 255, 255], -Math.round(env?.canvas.x ?? 0), -Math.round(env?.canvas.y ?? 0));
  if (kind === 'spinBlur') {
    return (d) => {
      const a = env?.area ?? { x: 0, y: 0, w: d.width, h: d.height }, short = Math.max(1, Math.min(a.w, a.h)), clip = clipBox(boxes(d).canvas, d.width, d.height) ?? { x0: 0, y0: 0, x1: d.width, y1: d.height };
      let out = d;
      for (let n = 1; n <= Math.round(num('spins')); n++) {
        const k = n === 1 ? '' : String(n);
        out = spinDeep(out, { cx: a.x + (a.w * num(`x${k}`)) / 100, cy: a.y + (a.h * num(`y${k}`)) / 100, rx: (short * num(`radiusX${k}`)) / 100, ry: (short * num(`radiusY${k}`)) / 100, angle: num(`angle${k}`), blur: num(`blurAngle${k}`) }, clip);
      }
      return out;
    };
  }
  if (DEEP_DISTORT.includes(kind)) return (d) => { const a = boxes(d).area; return remapDeep(d, warpOf(kind, values, a) ?? null, a); };
  const fixed = FIXED_SHARPEN[kind];
  if (fixed) return (d) => unsharpDeep(d, fixed[0], fixed[1], fixed[2], ceiling);
  return null;
}

/** The library filters that run in float at depth, for the filter dialog's note and the agent's description. */
export const DEEP_LIB_KINDS: readonly string[] = ['blur', 'blurMore', 'boxBlur', 'sharpen', 'sharpenMore', 'sharpenEdges', 'highPass', 'maximum', 'minimum', 'median', 'dustAndScratches', 'emboss', 'findEdges', 'solarize', 'custom', 'offset', 'mosaic', 'despeckle', 'fragment', 'facet', 'crystallize', 'diffuse', 'wind', 'oilPaint', 'lightingEffects', 'filterGallery', 'traceContour', 'tiles', 'extrude', 'smartBlur', 'shapeBlur', 'reduceNoise', 'pointillize', 'colorHalftone', 'mezzotint', 'clouds', 'differenceClouds', 'fibers', 'lensFlare', 'scanlines', 'deInterlace', 'ntscColors', 'colorToAlpha', 'tonalContrast', 'hsbHsl', 'haze', 'grainPlate', 'dither', 'spinBlur', 'displace', 'smartSharpen', ...DEEP_DISTORT];
