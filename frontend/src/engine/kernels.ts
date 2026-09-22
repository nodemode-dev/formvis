import { clamp, type Adjustment } from './types';
import { isParamKind, paramKernel } from './adjust-params';

/** Pixel kernels for adjustment layers and the Magic Wand, written for sonny from standard methods: Levels as a
 *  clipped power curve between black and white points, Curves as monotone piecewise-cubic interpolation (Fritsch
 *  and Butland's harmonic-mean tangents), Exposure in linear light through the IEC 61966-2-1 sRGB transfer, a
 *  Rec. 709 luminance gradient map, and Heckbert's segment seed fill (Graphics Gems, 1990). Settings keep the field
 *  names and meanings `.ref` projects use. */

export interface KernelContext { width: number; height: number; originX: number; originY: number; unitsPerPixel: number }
export type Kernel = (data: Uint8ClampedArray, ctx?: KernelContext) => void;

type Json = Record<string, unknown>;
const finite = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const record = (v: unknown): Json => (v !== null && typeof v === 'object' ? (v as Json) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** A kernel from one lookup table per colour channel, sampled from `transfer(channel, level)` over 0 to 255.
 *  Fully transparent pixels are left alone. */
function tableKernel(transfer: (channel: number, level: number) => number): Kernel {
  const tables: Uint8Array[] = [];
  for (let c = 0; c < 3; c++) {
    const t = new Uint8Array(256);
    for (let level = 0; level < 256; level++) t[level] = Math.round(clamp(transfer(c, level), 0, 255));
    tables.push(t);
  }
  const [tr, tg, tb] = tables;
  return (px) => {
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) continue;
      px[i] = tr[px[i]];
      px[i + 1] = tg[px[i + 1]];
      px[i + 2] = tb[px[i + 2]];
    }
  };
}

/** One Levels range as a transfer on 0 to 255: input black and white points, a midtone gamma, output black and white. */
function levelsTransfer(raw: unknown): (v: number) => number {
  const r = record(raw);
  const inLo = clamp(finite(r.black, 0), 0, 254);
  const inHi = clamp(finite(r.white, 255), inLo + 1, 255);
  const invGamma = 1 / clamp(finite(r.gamma, 1), 0.1, 9.99);
  const outLo = clamp(finite(r.outputBlack, 0), 0, 255), outHi = clamp(finite(r.outputWhite, 255), 0, 255);
  return (v) => outLo + (outHi - outLo) * Math.pow(clamp((v - inLo) / (inHi - inLo), 0, 1), invGamma);
}

/** Levels: the composite range (index 0) applied after each channel's own (1 to 3). */
export function levelsKernel(settings: unknown): Kernel {
  const ranges = list(record(settings).ranges);
  const composite = levelsTransfer(ranges[0]);
  const channel = [levelsTransfer(ranges[1]), levelsTransfer(ranges[2]), levelsTransfer(ranges[3])];
  return tableKernel((c, level) => composite(channel[c](level)));
}

interface Knot { x: number; y: number }

/** Monotone piecewise-cubic interpolation through knots on 0 to 255: each interior tangent is the harmonic mean of
 *  its two secants (zero at a local extremum), end tangents are the end secants, and each segment is a cubic
 *  Hermite polynomial evaluated in Horner form. Inputs outside the knots hold the end values. */
function monotoneCurve(input: Knot[]): (x: number) => number {
  const k = (input.length >= 2 ? input : [{ x: 0, y: 0 }, { x: 255, y: 255 }]).slice().sort((a, b) => a.x - b.x);
  const n = k.length;
  const secant = new Float64Array(n - 1), tangent = new Float64Array(n);
  for (let j = 0; j < n - 1; j++) secant[j] = (k[j + 1].y - k[j].y) / Math.max(1e-6, k[j + 1].x - k[j].x);
  tangent[0] = secant[0];
  tangent[n - 1] = secant[n - 2];
  for (let j = 1; j < n - 1; j++) {
    const a = secant[j - 1], b = secant[j];
    tangent[j] = a * b > 0 ? (2 * a * b) / (a + b) : 0;
  }
  return (x) => {
    let lo = 0, hi = n - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (k[mid].x <= x) lo = mid; else hi = mid - 1;
    }
    const a = k[lo], b = k[lo + 1], h = Math.max(1e-6, b.x - a.x);
    const t = clamp((x - a.x) / h, 0, 1);
    const c1 = h * tangent[lo], c2 = 3 * (b.y - a.y) - h * (2 * tangent[lo] + tangent[lo + 1]), c3 = 2 * (a.y - b.y) + h * (tangent[lo] + tangent[lo + 1]);
    return clamp(((c3 * t + c2) * t + c1) * t + a.y, 0, 255);
  };
}

/** Curves: the composite curve (index 0) applied after each channel's own (1 to 3). */
export function curvesKernel(settings: unknown): Kernel {
  const channels = list(record(settings).channels).map((c) => list(c).map((p): Knot => ({ x: finite(record(p).x, 0), y: finite(record(p).y, 0) })));
  const curveAt = (i: number) => monotoneCurve(channels[i] ?? []);
  const composite = curveAt(0), channel = [curveAt(1), curveAt(2), curveAt(3)];
  return tableKernel((c, level) => composite(channel[c](level)));
}

const toLinear = (e: number): number => (e <= 0.04045 ? e / 12.92 : Math.pow((e + 0.055) / 1.055, 2.4));
const toEncoded = (l: number): number => (l <= 0.0031308 ? 12.92 * l : 1.055 * Math.pow(l, 1 / 2.4) - 0.055);

/** Exposure in linear light: a gain of 2 to the power of the exposure, then the offset, then the gamma. */
export function exposureKernel(settings: unknown): Kernel {
  const r = record(settings);
  const gain = Math.pow(2, clamp(finite(r.exposure, 0), -20, 20));
  const offset = clamp(finite(r.offset, 0), -0.5, 0.5);
  const invGamma = 1 / clamp(finite(r.gamma, 1), 0.01, 9.99);
  return tableKernel((_, level) => 255 * clamp(toEncoded(Math.pow(Math.max(0, toLinear(level / 255) * gain + offset), invGamma)), 0, 1));
}

/** Gradient Map: each pixel's Rec. 709 luminance picks a colour between the shadow and highlight colours. */
export function gradientMapKernel(settings: unknown): Kernel {
  const r = record(settings);
  const rgb = (v: unknown, fallback: number): number[] => { const c = record(v); return [finite(c.red, fallback), finite(c.green, fallback), finite(c.blue, fallback)]; };
  const shadows = rgb(r.shadows, 0), highlights = rgb(r.highlights, 1);
  const [from, to] = r.reversed === true ? [highlights, shadows] : [shadows, highlights];
  const ramp = new Uint8Array(256 * 3);
  for (let level = 0; level < 256; level++) {
    for (let c = 0; c < 3; c++) ramp[level * 3 + c] = Math.round(255 * clamp(from[c] + ((to[c] - from[c]) * level) / 255, 0, 1));
  }
  return (px) => {
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) continue;
      const y = Math.min(255, Math.round(0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2])) * 3;
      px[i] = ramp[y];
      px[i + 1] = ramp[y + 1];
      px[i + 2] = ramp[y + 2];
    }
  };
}

export function invertKernel(): Kernel {
  return (px) => {
    for (let i = 0; i < px.length; i += 4) {
      px[i] = 255 - px[i];
      px[i + 1] = 255 - px[i + 1];
      px[i + 2] = 255 - px[i + 2];
    }
  };
}

export function adjustmentKernel(adj: Adjustment | null): Kernel | null {
  if (!adj) return null;
  if (adj.kind === 'levels') return levelsKernel(adj.data.levels);
  if (adj.kind === 'curves') return curvesKernel(adj.data.curves);
  if (adj.kind === 'exposure') return exposureKernel(adj.data.exposureSettings);
  if (adj.kind === 'gradientMap') return gradientMapKernel(adj.data.gradientMapSettings);
  if (isParamKind(adj.kind)) return paramKernel(adj.kind, adj.data.params);
  return null;
}

/** Magic Wand: 255 where a pixel is within `tolerance` of the reference colour on every channel, alpha included.
 *  The reference is the mean of the pixels within `sampleRadius` of the seed (0 a single point, 1 a 3 by 3 square,
 *  2 a 5 by 5), clipped to the image. Contiguous selections grow 4-connected from the seed with Heckbert's segment
 *  seed fill; otherwise every matching pixel is selected. */
export function wandMask(rgba: Uint8ClampedArray, width: number, height: number, seedX: number, seedY: number, tolerance: number, contiguous: boolean, sampleRadius = 0): Uint8Array {
  const out = new Uint8Array(width * height);
  if (seedX < 0 || seedY < 0 || seedX >= width || seedY >= height) return out;
  const xa = Math.max(0, seedX - sampleRadius), xb = Math.min(width - 1, seedX + sampleRadius);
  const ya = Math.max(0, seedY - sampleRadius), yb = Math.min(height - 1, seedY + sampleRadius);
  const sum = [0, 0, 0, 0];
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) for (let c = 0; c < 4; c++) sum[c] += rgba[(y * width + x) * 4 + c];
  const n = (xb - xa + 1) * (yb - ya + 1);
  const ref = sum.map((s) => Math.round(s / n));
  const tol = clamp(Math.round(tolerance), 0, 255);
  const near = (p: number): boolean => {
    const o = p * 4;
    return Math.abs(rgba[o] - ref[0]) <= tol && Math.abs(rgba[o + 1] - ref[1]) <= tol && Math.abs(rgba[o + 2] - ref[2]) <= tol && Math.abs(rgba[o + 3] - ref[3]) <= tol;
  };
  if (!contiguous) {
    for (let p = 0; p < out.length; p++) if (near(p)) out[p] = 255;
    return out;
  }
  // A pixel is fillable while unselected and near the reference.
  const open = (x: number, y: number): boolean => !out[y * width + x] && near(y * width + x);
  if (!open(seedX, seedY)) return out;
  // Each stacked segment says: row `y - dy` was filled over [l, r]; scan row `y` beneath it.
  const stack: number[] = [];
  const push = (y: number, l: number, r: number, dy: number): void => { if (y + dy >= 0 && y + dy < height) stack.push(y, l, r, dy); };
  push(seedY, seedX, seedX, 1);
  push(seedY + 1, seedX, seedX, -1);
  while (stack.length) {
    const dy = stack.pop() as number, r = stack.pop() as number, l = stack.pop() as number;
    const y = (stack.pop() as number) + dy;
    let x = l;
    while (x >= 0 && open(x, y)) { out[y * width + x] = 255; x--; }
    // Nothing fillable at the parent's left end: skip ahead to the first fillable pixel under the parent.
    let skipping = x >= l, start = x + 1;
    if (!skipping) {
      if (start < l) push(y, start, l - 1, -dy);
      x = l + 1;
    }
    for (;;) {
      if (!skipping) {
        while (x < width && open(x, y)) { out[y * width + x] = 255; x++; }
        push(y, start, x - 1, dy);
        if (x > r + 1) push(y, r + 1, x - 1, -dy);
      }
      skipping = false;
      x++;
      while (x <= r && !open(x, y)) x++;
      start = x;
      if (x > r) break;
    }
  }
  return out;
}
