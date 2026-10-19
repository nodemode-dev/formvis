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

/** The float version of gallery filter `kind` (Radial, Field, Iris, Tilt-Shift) with its settings, or null for the others. */
export function deepGalleryFilter(kind: GalleryKind, g: GallerySettings): ((d: DeepPixels) => DeepPixels) | null {
  if (kind === 'radialBlur') return (d) => radialBlurDeep(d, g.radialAmount, g.radialMethod, g.radialX, g.radialY, g.radialQuality);
  if (kind !== 'fieldBlur' && kind !== 'irisBlur' && kind !== 'tiltShift') return null;
  return (d) => { const m = galleryRadii(kind, g, d.width, d.height, 1); return m ? variableBlurDeep(d, m) : d; };
}

export const DEEP_GALLERY_KINDS: readonly string[] = ['radialBlur', 'fieldBlur', 'irisBlur', 'tiltShift'];

/** Library filters that compute on the float channels of a 16 bit, 32 bit, CMYK or Lab document, with no round trip
 *  through 8 bits: Blur, Blur More, Box Blur, Sharpen, Sharpen More, Sharpen Edges, High Pass, Maximum and Minimum.
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

const FIXED_SHARPEN: Record<string, [number, number, number]> = { sharpen: [50, 0.6, 0], sharpenMore: [120, 0.7, 0], sharpenEdges: [100, 1, 8] };

/** The float version of library filter `kind` with its stored `values`, or null when it only runs on 8 bits. */
export function deepLibFilter(kind: string, values: Record<string, unknown>, ceiling: number): ((d: DeepPixels) => DeepPixels) | null {
  const num = (k: string): number => (typeof values[k] === 'number' ? (values[k] as number) : 0);
  if (kind === 'blur') return (d) => blurDeep(d, 0.7);
  if (kind === 'blurMore') return (d) => blurDeep(d, 1.5);
  if (kind === 'boxBlur') return (d) => boxBlurDeep(d, num('radius'));
  if (kind === 'highPass') return (d) => highPassDeep(d, num('radius'), ceiling);
  if (kind === 'maximum' || kind === 'minimum') return (d) => minMaxDeep(d, num('radius'), kind === 'maximum');
  const fixed = FIXED_SHARPEN[kind];
  if (fixed) return (d) => unsharpDeep(d, fixed[0], fixed[1], fixed[2], ceiling);
  return null;
}

/** The library filters that run in float at depth, for the filter dialog's note and the agent's description. */
export const DEEP_LIB_KINDS: readonly string[] = ['blur', 'blurMore', 'boxBlur', 'sharpen', 'sharpenMore', 'sharpenEdges', 'highPass', 'maximum', 'minimum'];
