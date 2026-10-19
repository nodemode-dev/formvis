import { blurDeep, unsharpDeep } from './deep';
import type { DeepPixels } from './types';
import { boxMean } from './filters-lib/shared';

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
