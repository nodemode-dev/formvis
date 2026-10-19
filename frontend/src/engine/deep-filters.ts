import { blurDeep, unsharpDeep } from './deep';
import type { DeepPixels } from './types';
import { boxMean } from './filters-lib/shared';
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
  const soft = blurDeep(src, Math.max(0.1, radius)).data, s = src.data, o = new Float32Array(s), S = src.n + 1, A = src.n;
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

const FIXED_SHARPEN: Record<string, [number, number, number]> = { sharpen: [50, 0.6, 0], sharpenMore: [120, 0.7, 0], sharpenEdges: [100, 1, 8] };

/** The float version of library filter `kind` with its stored `values`, or null when it only runs on 8 bits. */
export function deepLibFilter(kind: string, values: Record<string, unknown>, ceiling: number): ((d: DeepPixels) => DeepPixels) | null {
  const num = (k: string): number => (typeof values[k] === 'number' ? (values[k] as number) : 0);
  if (kind === 'blur') return (d) => blurDeep(d, 0.7);
  if (kind === 'blurMore') return (d) => blurDeep(d, 1.5);
  if (kind === 'boxBlur') return (d) => boxBlurDeep(d, num('radius'));
  if (kind === 'highPass') return (d) => highPassDeep(d, num('radius'), ceiling);
  if (kind === 'maximum' || kind === 'minimum') return (d) => minMaxDeep(d, num('radius'), kind === 'maximum');
  if (kind === 'median' && num('radius') <= DEEP_MEDIAN_MAX) return (d) => medianDeep(d, num('radius'), null);
  if (kind === 'dustAndScratches' && num('radius') <= DEEP_MEDIAN_MAX) return (d) => medianDeep(d, num('radius'), num('threshold') > 0 ? (num('threshold') + 0.5) / 255 : 0);
  if (kind === 'emboss') return (d) => embossDeep(d, num('angle'), Math.max(1, num('height')), num('amount'), ceiling);
  if (kind === 'findEdges') return (d) => findEdgesDeep(d, ceiling);
  const fixed = FIXED_SHARPEN[kind];
  if (fixed) return (d) => unsharpDeep(d, fixed[0], fixed[1], fixed[2], ceiling);
  return null;
}

/** The library filters that run in float at depth, for the filter dialog's note and the agent's description. */
export const DEEP_LIB_KINDS: readonly string[] = ['blur', 'blurMore', 'boxBlur', 'sharpen', 'sharpenMore', 'sharpenEdges', 'highPass', 'maximum', 'minimum', 'median', 'dustAndScratches', 'emboss', 'findEdges'];
