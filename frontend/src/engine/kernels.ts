import { clamp, type Adjustment } from './types';
import { isParamKind, paramKernel } from './adjust-params';
import type { Chains, Stage } from './transfer-pow';
import { wasmAntialias, wasmEnhanceEdge, wasmGradientRamp, wasmInvert, wasmLut, wasmSensitivity, wasmWand } from './wasm-kernels';

/** Pixel kernels for adjustment layers and the Magic Wand, written for formvis from standard methods: Levels as a
 *  clipped power curve between black and white points, Curves as monotone piecewise-cubic interpolation (Fritsch
 *  and Butland's harmonic-mean tangents), Exposure in linear light through the IEC 61966-2-1 sRGB transfer, a
 *  Rec. 709 luminance gradient map, and Heckbert's segment seed fill (Graphics Gems, 1990). Settings keep the field
 *  names and meanings formvis's project files use. */

export interface KernelContext { width: number; height: number; originX: number; originY: number; unitsPerPixel: number }
export type Kernel = (data: Uint8ClampedArray, ctx?: KernelContext) => void;

type Json = Record<string, unknown>;
const finite = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const record = (v: unknown): Json => (v !== null && typeof v === 'object' ? (v as Json) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** A kernel from one lookup table per colour channel, sampled from `transfer(channel, level)` over 0 to 255.
 *  Fully transparent pixels are left alone. */
function tableKernel(transfer: (channel: number, level: number) => number, chains?: Chains): Kernel {
  const tables: Uint8Array[] = [];
  for (let c = 0; c < 3; c++) {
    const t = new Uint8Array(256);
    for (let level = 0; level < 256; level++) t[level] = Math.round(clamp(transfer(c, level), 0, 255));
    tables.push(t);
  }
  const [tr, tg, tb] = tables;
  const lut = new Uint8Array(768);
  lut.set(tr, 0); lut.set(tg, 256); lut.set(tb, 512);
  const kernel: Kernel & { transfer?: (channel: number, level: number) => number; stages?: Chains } = (px) => {
    if (wasmLut(px, lut)) return;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) continue;
      px[i] = tr[px[i]];
      px[i + 1] = tg[px[i + 1]];
      px[i + 2] = tb[px[i + 2]];
    }
  };
  kernel.transfer = transfer;   // sampled at 16-bit precision by engine/deep.ts (1.53.6)
  kernel.stages = chains;
  return kernel;
}

/** The stage chains of a Levels, Curves or Exposure adjustment that the deep composite runs (TypeScript and WebAssembly alike), or null. */
export function stagesOf(adj: Adjustment | null): Chains | null {
  return (adjustmentKernel(adj) as unknown as { stages?: Chains } | null)?.stages ?? null;
}

function levelsStage(raw: unknown): Stage {
  const r = record(raw);
  const lo = clamp(finite(r.black, 0), 0, 254);
  const hi = clamp(finite(r.white, 255), lo + 1, 255);
  return { k: 1, lo, hi, ig: 1 / clamp(finite(r.gamma, 1), 0.1, 9.99), ol: clamp(finite(r.outputBlack, 0), 0, 255), oh: clamp(finite(r.outputWhite, 255), 0, 255) };
}

function curveStage(input: { x: number; y: number }[]): Stage {
  const k = (input.length >= 2 ? input : [{ x: 0, y: 0 }, { x: 255, y: 255 }]).slice().sort((a, b) => a.x - b.x);
  const n = k.length, secant = new Float64Array(n - 1), t = new Float64Array(n);
  for (let j = 0; j < n - 1; j++) secant[j] = (k[j + 1].y - k[j].y) / Math.max(1e-6, k[j + 1].x - k[j].x);
  t[0] = secant[0];
  t[n - 1] = secant[n - 2];
  for (let j = 1; j < n - 1; j++) {
    const a = secant[j - 1], b = secant[j];
    t[j] = a * b > 0 ? (2 * a * b) / (a + b) : 0;
  }
  return { k: 2, x: Float64Array.from(k, (p) => p.x), y: Float64Array.from(k, (p) => p.y), t };
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
  const channel = [levelsTransfer(ranges[1]), levelsTransfer(ranges[2]), levelsTransfer(ranges[3]), levelsTransfer(ranges[4])];
  const stages = [1, 2, 3, 4].map((i) => levelsStage(ranges[i])), top = levelsStage(ranges[0]);
  return tableKernel((c, level) => composite((channel[c] ?? channel[0])(level)), [0, 1, 2, 3].map((c) => [stages[c], top]));
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
  const composite = curveAt(0), channel = [curveAt(1), curveAt(2), curveAt(3), curveAt(4)];
  const stages = [1, 2, 3, 4].map((i) => curveStage(channels[i] ?? [])), top = curveStage(channels[0] ?? []);
  return tableKernel((c, level) => composite((channel[c] ?? channel[0])(level)), [0, 1, 2, 3].map((c) => [stages[c], top]));
}

const toLinear = (e: number): number => (e <= 0.04045 ? e / 12.92 : Math.pow((e + 0.055) / 1.055, 2.4));
const toEncoded = (l: number): number => (l <= 0.0031308 ? 12.92 * l : 1.055 * Math.pow(l, 1 / 2.4) - 0.055);

/** Exposure in linear light: a gain of 2 to the power of the exposure, then the offset, then the gamma. */
export function exposureKernel(settings: unknown): Kernel {
  const r = record(settings);
  const gain = Math.pow(2, clamp(finite(r.exposure, 0), -20, 20));
  const offset = clamp(finite(r.offset, 0), -0.5, 0.5);
  const invGamma = 1 / clamp(finite(r.gamma, 1), 0.01, 9.99);
  const chain: Stage[] = [{ k: 3, gain, off: offset, ig: invGamma }];
  return tableKernel((_, level) => 255 * clamp(toEncoded(Math.pow(Math.max(0, toLinear(level / 255) * gain + offset), invGamma)), 0, 1), [chain, chain, chain, chain]);
}

/** Gradient Map: each pixel's Rec. 709 luminance picks a colour between the shadow and highlight colours. */
export function gradientMapKernel(settings: unknown): Kernel {
  const r = record(settings);
  const rgb = (v: unknown, fallback: number): number[] => { const c = record(v); return [finite(c.red, fallback), finite(c.green, fallback), finite(c.blue, fallback)]; };
  const shadows = rgb(r.shadows, 0), highlights = rgb(r.highlights, 1);
  const [from, to] = r.reversed === true ? [highlights, shadows] : [shadows, highlights];
  const ramp = new Float32Array(256 * 3), dither = r.dither === true;
  const stops = Array.isArray(r.stops) ? r.stops.map((s) => ({ at: clamp(finite(record(s).at, 0), 0, 1), c: rgb(s, 0) })).sort((a, b) => a.at - b.at) : [];
  if (stops.length >= 2) {
    const list = r.reversed === true ? stops.map((s) => ({ at: 1 - s.at, c: s.c })).reverse() : stops;
    for (let level = 0; level < 256; level++) {
      const t = level / 255;
      let k = 1;
      while (k < list.length - 1 && list[k].at < t) k++;
      const a = list[k - 1], b = list[k], f = b.at > a.at ? clamp((t - a.at) / (b.at - a.at), 0, 1) : 1;
      for (let c = 0; c < 3; c++) ramp[level * 3 + c] = dither ? 255 * clamp(a.c[c] + (b.c[c] - a.c[c]) * f, 0, 1) : Math.round(255 * clamp(a.c[c] + (b.c[c] - a.c[c]) * f, 0, 1));
    }
  } else for (let level = 0; level < 256; level++) {
    for (let c = 0; c < 3; c++) ramp[level * 3 + c] = dither ? 255 * clamp(from[c] + ((to[c] - from[c]) * level) / 255, 0, 1) : Math.round(255 * clamp(from[c] + ((to[c] - from[c]) * level) / 255, 0, 1));
  }
  if (dither) {
    return (px, ctx) => {
      const w = ctx?.width ?? 0;
      for (let i = 0, j = 0; i < px.length; i += 4, j++) {
        if (px[i + 3] === 0) continue;
        const y = Math.min(255, 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]), lo = Math.floor(y), hi = Math.min(255, lo + 1), f = y - lo;
        const x = w ? j % w : j, row = w ? Math.floor(j / w) : 0, h = ((x * 374761393 + row * 668265263) ^ (x * 1274126177)) >>> 0, u = (h & 1023) / 1023, v = ((h >>> 10) & 1023) / 1023, noise = u + v - 1;
        for (let c = 0; c < 3; c++) px[i + c] = Math.max(0, Math.min(255, Math.round(ramp[lo * 3 + c] + (ramp[hi * 3 + c] - ramp[lo * 3 + c]) * f + noise)));
      }
    };
  }
  const rampBytes = Uint8Array.from(ramp);
  return (px) => {
    if (wasmGradientRamp(px, rampBytes)) return;
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
    if (wasmInvert(px)) return;
    for (let i = 0; i < px.length; i += 4) {
      px[i] = 255 - px[i];
      px[i + 1] = 255 - px[i + 1];
      px[i + 2] = 255 - px[i + 2];
    }
  };
}

/** Set by the app: runs one filter by id on a copy of the pixels at `scale` view pixels per document pixel. */
export const filterLayerHook: { run: ((kind: string, settings: Record<string, unknown>, src: ImageData, scale: number) => ImageData) | null } = { run: null };

/** A filter layer: the filter in `data.filter` with `data.settings` run on everything beneath. The last run is kept, so a
 *  redraw with the same pixels below does not run the filter again. */
function filterKernel(data: Json): Kernel | null {
  const kind = typeof data.filter === 'string' ? data.filter : '', settings = record(data.settings);
  if (!kind) return null;
  let key = '', last: Uint8ClampedArray | null = null;
  return (px, ctx) => {
    const run = filterLayerHook.run;
    if (!run || !ctx || ctx.width * ctx.height * 4 !== px.length) return;
    let h = 2166136261;
    for (let i = 0; i < px.length; i += 4) h = Math.imul(h ^ (px[i] | (px[i + 1] << 8) | (px[i + 2] << 16) | (px[i + 3] << 24)), 16777619);
    const scale = ctx.unitsPerPixel > 0 ? 1 / ctx.unitsPerPixel : 1, id = `${ctx.width}x${ctx.height}@${scale.toFixed(4)}#${h >>> 0}`;
    if (id !== key || !last) {
      last = new Uint8ClampedArray(run(kind, settings, new ImageData(new Uint8ClampedArray(px), ctx.width, ctx.height), scale).data);
      key = id;
    }
    if (last.length === px.length) px.set(last);
  };
}

export function adjustmentKernel(adj: Adjustment | null): Kernel | null {
  if (!adj) return null;
  if (adj.kind === 'filter') return filterKernel(adj.data);
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
  const fast = wasmWand(rgba, width, height, seedX, seedY, tolerance, contiguous, sampleRadius);
  if (fast) return fast;
  const xa = Math.max(0, seedX - sampleRadius), xb = Math.min(width - 1, seedX + sampleRadius);
  const ya = Math.max(0, seedY - sampleRadius), yb = Math.min(height - 1, seedY + sampleRadius);
  const sum = [0, 0, 0, 0];
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) for (let c = 0; c < 4; c++) sum[c] += rgba[(y * width + x) * 4 + c];
  const n = (xb - xa + 1) * (yb - ya + 1);
  const ref = sum.map((s) => Math.round(s / n));
  const tol = Math.min(255, Math.max(0, Math.round(tolerance)));
  const near = (p: number): boolean => {
    for (let c = 0; c < 4; c++) if (Math.abs(rgba[p * 4 + c] - ref[c]) > tol) return false;
    return true;
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
  while (stack.length > 0) {
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

/** Anti-alias for a hard selection (the Magic Wand's option): each pixel on the boundary, where the mask differs from
 *  a 4-neighbour, takes the mean of its 3 by 3 neighbourhood, so edges step through partial values while the inside
 *  stays fully selected and the outside empty. A new mask; the input is untouched. */
export function antialiasMask(mask: Uint8Array, width: number, height: number): Uint8Array {
  const fast = wasmAntialias(mask, width, height);
  if (fast) return fast;
  const out = mask.slice();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x, v = mask[i];
      const edge = (x > 0 && mask[i - 1] !== v) || (x < width - 1 && mask[i + 1] !== v) || (y > 0 && mask[i - width] !== v) || (y < height - 1 && mask[i + width] !== v);
      if (!edge) continue;
      let sum = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        sum += mask[yy * width + xx]; n++;
      }
      out[i] = Math.round(sum / n);
    }
  }
  return out;
}

/** Quick Selection's Enhance Edge: two passes of a 3 by 3 majority vote (a pixel is kept when five of its nine
 *  neighbours are half selected or more) to even out ragged edges and drop specks, then the boundary anti-aliased. A new mask. */
export function enhanceEdge(mask: Uint8Array, width: number, height: number): Uint8Array {
  const fast = wasmEnhanceEdge(mask, width, height);
  if (fast) return fast;
  let cur = Uint8Array.from(mask, (v) => (v >= 128 ? 255 : 0));
  for (let pass = 0; pass < 2; pass++) {
    const next = new Uint8Array(cur.length);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < width && yy < height && cur[yy * width + xx]) n++;
      }
      next[y * width + x] = n >= 5 ? 255 : 0;
    }
    cur = next;
  }
  return antialiasMask(cur, width, height);
}

/** Select > Sky's Sensitivity on a soft mask: 50 returns it unchanged; above 50 lets fainter values count as fully
 *  selected (the sky grows), below 50 lifts the floor so only stronger values count (the sky shrinks). A new mask. */
export function sensitivityMask(mask: Uint8Array, sensitivity: number): Uint8Array {
  const fast = wasmSensitivity(mask, sensitivity);
  if (fast) return fast;
  const s =Math.max(0, Math.min(100, sensitivity)), out = mask.slice();
  if (s === 50) return out;
  const cut = Math.max(1, 255 * (1 - s / 100));
  if (s > 50) { const k = 127.5 / cut; for (let i = 0; i < out.length; i++) out[i] = Math.min(255, Math.round(mask[i] * k)); }
  else { const lift = cut - 127.5; for (let i = 0; i < out.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(((mask[i] - lift) * 255) / (255 - lift)))); }
  return out;
}
