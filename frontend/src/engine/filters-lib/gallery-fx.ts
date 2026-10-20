import type { LibContext, LibParam, LibValues } from '../filter-library';
import type { Rect } from '../types';
import { copyImage, gaussKernel, hash01 } from './shared';

export type FxCategory = 'Artistic' | 'Brush Strokes' | 'Distort' | 'Sketch' | 'Stylize' | 'Texture';
export const FX_CATEGORIES: readonly FxCategory[] = ['Artistic', 'Brush Strokes', 'Distort', 'Sketch', 'Stylize', 'Texture'];

export type Rgb = readonly [number, number, number];
export type Way = 'horizontal' | 'vertical' | 'rightDiagonal' | 'leftDiagonal';

/** What a gallery effect paints: the window's colour, straight and in 0 to 1, three floats a pixel (an effect may
 *  replace the array); where the window lies in the document (document x = left + x / k, k window pixels to a
 *  document pixel); the selected area's centre and half its diagonal, in window pixels; and the foreground and
 *  background colours in 0 to 1. Effects read only near each pixel, so the gallery gives the same result in bands. */
export interface Plate {
  readonly w: number;
  readonly h: number;
  rgb: Float32Array;
  readonly k: number;
  readonly left: number;
  readonly top: number;
  readonly cx: number;
  readonly cy: number;
  readonly half: number;
  readonly fg: Rgb;
  readonly bg: Rgb;
}

/** One effect of the Filter Gallery. `reach` bounds, in window pixels at scale k, how far around a pixel its result
 *  depends on the picture or on a pattern drawn over the window. */
export interface FxDef {
  readonly key: string;
  readonly label: string;
  readonly category: FxCategory;
  readonly params: readonly LibParam[];
  readonly note?: string;
  readonly reach: (v: LibValues, k: number) => number;
  readonly paint: (p: Plate, v: LibValues) => void;
}

export interface FxRun { readonly fx: FxDef; readonly values: LibValues }

const spoken = (id: string): string => id.charAt(0).toUpperCase() + id.slice(1).replace(/[A-Z]/g, (c) => ` ${c}`);

export const slider = (key: string, min: number, max: number, def: number): LibParam => ({ key, label: spoken(key), kind: 'range', min, max, step: 1, def });
export const menu = (key: string, options: readonly string[], def = options[0]): LibParam => ({ key, label: spoken(key), kind: 'select', options: options.map((o) => [o, spoken(o)] as const), def });
export const tick = (key: string): LibParam => ({ key, label: spoken(key), kind: 'check', def: false });
export const swatch = (key: string, def: string): LibParam => ({ key, label: spoken(key), kind: 'color', def });

export const SURFACES: readonly string[] = ['canvas', 'brick', 'burlap', 'sandstone'];
export const LIGHTS: readonly string[] = ['bottom', 'bottomLeft', 'left', 'topLeft', 'top', 'topRight', 'right', 'bottomRight'];
export const WAYS: readonly Way[] = ['rightDiagonal', 'horizontal', 'leftDiagonal', 'vertical'];

/** The texture controls Rough Pastels, Underpainting, Conté Crayon and Texturizer share. */
export const surfaceParams = (relief: number, light: string): LibParam[] => [menu('texture', SURFACES), slider('scaling', 50, 200, 100), slider('relief', 0, 50, relief), menu('light', LIGHTS, light), tick('invert')];

export const num = (v: LibValues, key: string): number => v[key] as number;
export const opt = (v: LibValues, key: string): string => v[key] as string;
export const isOn = (v: LibValues, key: string): boolean => v[key] === true;

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** 0 short of `from`, 1 past `to`, eased between; `from` above `to` makes a falling step. */
export function ease(from: number, to: number, x: number): number {
  if (from === to) return x < from ? 0 : 1;
  const t = clamp01((x - from) / (to - from));
  return t * t * (3 - 2 * t);
}

/** A channel lightened toward 1 by s above 0, or darkened toward 0 by s below. */
export const lit = (c: number, s: number): number => (s >= 0 ? c + (1 - c) * Math.min(1, s) : c * Math.max(0, 1 + s));

/** How far a stroke pattern of `length` by `width` document pixels reaches, in document pixels. */
export const strokeReach = (length: number, width: number): number => length / 2 + 1.5 * width + 1;

export function lumaOf(p: Plate): Float32Array {
  const n = p.w * p.h, out = new Float32Array(n), c = p.rgb;
  for (let i = 0, j = 0; i < n; i++, j += 3) out[i] = 0.299 * c[j] + 0.587 * c[j + 1] + 0.114 * c[j + 2];
  return out;
}

/** Each document pixel's own random value in 0 to 1 under the window (in squares of `cell` document pixels). */
export function grain(p: Plate, seed: number, cell = 1): Float32Array {
  const { w, h, k } = p, out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const gy = Math.floor((p.top + y / k) / cell);
    for (let x = 0; x < w; x++) out[y * w + x] = hash01(Math.floor((p.left + x / k) / cell), gy, 0, seed);
  }
  return out;
}

/** Value noise: smoothly blended random values on the unit lattice, in 0 to 1. */
export function lattice(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash01(xi, yi, 0, seed), b = hash01(xi + 1, yi, 0, seed), c = hash01(xi, yi + 1, 0, seed), d = hash01(xi + 1, yi + 1, 0, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** `octaves` of value noise, each twice as fine and half as strong as the last, in 0 to 1. */
export function fractal(x: number, y: number, seed: number, octaves: number): number {
  let total = 0, norm = 0, weight = 1, f = 1;
  for (let o = 0; o < octaves; o++) { total += lattice(x * f, y * f, seed + o * 101) * weight; norm += weight; weight /= 2; f *= 2; }
  return total / norm;
}

/** Calls `each` with the pixel indices of every diagonal line of the window running `way`; each pixel lies on one. */
function eachDiagonal(w: number, h: number, way: Way, each: (at: Int32Array, len: number) => void): void {
  const at = new Int32Array(Math.max(w, h)), dy = way === 'leftDiagonal' ? 1 : -1;
  const walk = (x: number, y: number): void => {
    let len = 0;
    while (x < w && y >= 0 && y < h) { at[len++] = y * w + x; x++; y += dy; }
    each(at, len);
  };
  for (let y = 0; y < h; y++) walk(0, y);
  for (let x = 1; x < w; x++) walk(x, dy > 0 ? 0 : h - 1);
}

/** The mean of `n`-channel values over 2r + 1 pixels along each row, cut short at the row's ends. */
function boxRows(a: Float32Array, w: number, h: number, n: number, r: number): Float32Array {
  const out = new Float32Array(a.length);
  for (let y = 0; y < h; y++) {
    const base = y * w * n;
    for (let c = 0; c < n; c++) {
      let lo = 0, hi = Math.min(r, w - 1), sum = 0;
      for (let x = 0; x <= hi; x++) sum += a[base + x * n + c];
      for (let x = 0; x < w; x++) {
        out[base + x * n + c] = sum / (hi - lo + 1);
        if (x + r + 1 < w) { hi = x + r + 1; sum += a[base + hi * n + c]; }
        if (x - r >= 0) { sum -= a[base + (x - r) * n + c]; lo = x - r + 1; }
      }
    }
  }
  return out;
}

/** The same down each column, kept as running sums of whole rows. */
function boxColumns(a: Float32Array, w: number, h: number, n: number, r: number): Float32Array {
  const row = w * n, out = new Float32Array(a.length), sum = new Float64Array(row);
  let lo = 0, hi = Math.min(r, h - 1);
  for (let y = 0; y <= hi; y++) for (let i = 0, o = y * row; i < row; i++) sum[i] += a[o + i];
  for (let y = 0; y < h; y++) {
    const inv = 1 / (hi - lo + 1);
    for (let i = 0, o = y * row; i < row; i++) out[o + i] = sum[i] * inv;
    if (y + r + 1 < h) { hi = y + r + 1; for (let i = 0, o = hi * row; i < row; i++) sum[i] += a[o + i]; }
    if (y - r >= 0) { for (let i = 0, o = (y - r) * row; i < row; i++) sum[i] -= a[o + i]; lo = y - r + 1; }
  }
  return out;
}

/** The running mean of `n`-channel values along one line over 2r + 1 of its pixels, cut short at its ends. */
function runMean(src: Float32Array, dst: Float32Array, at: Int32Array, len: number, n: number, r: number): void {
  for (let c = 0; c < n; c++) {
    let lo = 0, hi = Math.min(r, len - 1), sum = 0;
    for (let j = 0; j <= hi; j++) sum += src[at[j] * n + c];
    for (let i = 0; i < len; i++) {
      dst[at[i] * n + c] = sum / (hi - lo + 1);
      if (i + r + 1 < len) { hi = i + r + 1; sum += src[at[hi] * n + c]; }
      if (i - r >= 0) { sum -= src[at[i - r] * n + c]; lo = i - r + 1; }
    }
  }
}

const stepOf = (way: Way): number => (way === 'horizontal' || way === 'vertical' ? 1 : Math.SQRT2);
const radiusOf = (way: Way, length: number): number => Math.round(length / 2 / stepOf(way));

/** The mean of an `n`-channel plane along `way`, over `length` window pixels centred on each pixel. */
export function streak(a: Float32Array, w: number, h: number, n: number, way: Way, length: number): Float32Array {
  const r = radiusOf(way, length);
  if (r < 1) return a.slice();
  if (way === 'horizontal') return boxRows(a, w, h, n, r);
  if (way === 'vertical') return boxColumns(a, w, h, n, r);
  const out = new Float32Array(a.length);
  eachDiagonal(w, h, way, (at, len) => runMean(a, out, at, len, n, r));
  return out;
}

const boxBoth = (a: Float32Array, w: number, h: number, n: number, r: number): Float32Array => boxColumns(boxRows(a, w, h, n, r), w, h, n, r);

/** Convolves an `n`-channel plane by `kern` (odd in length) along rows, then down columns a row at a time, the
 *  kernel renormalised where it leaves the plane. */
function convolve(a: Float32Array, w: number, h: number, n: number, kern: Float32Array): Float32Array {
  const r = (kern.length - 1) >> 1, row = w * n, mid = new Float32Array(a.length), out = new Float32Array(a.length), acc = new Float64Array(row);
  for (let y = 0; y < h; y++) {
    const base = y * row;
    for (let x = 0; x < w; x++) {
      const lo = x < r ? r - x : 0, hi = x + r >= w ? r + w - 1 - x : 2 * r;
      let wsum = 0;
      for (let t = lo; t <= hi; t++) wsum += kern[t];
      for (let c = 0; c < n; c++) {
        let s = 0;
        for (let t = lo, q = base + (x - r + lo) * n + c; t <= hi; t++, q += n) s += a[q] * kern[t];
        mid[base + x * n + c] = s / wsum;
      }
    }
  }
  for (let y = 0; y < h; y++) {
    const lo = y < r ? r - y : 0, hi = y + r >= h ? r + h - 1 - y : 2 * r;
    let wsum = 0;
    acc.fill(0);
    for (let t = lo; t <= hi; t++) {
      const wt = kern[t];
      wsum += wt;
      for (let i = 0, o = (y - r + t) * row; i < row; i++) acc[i] += mid[o + i] * wt;
    }
    for (let i = 0, o = y * row; i < row; i++) out[o + i] = acc[i] / wsum;
  }
  return out;
}

/** The radii of three box blurs that together spread as a Gaussian of `sigma` does. */
function boxRadii(sigma: number): number[] {
  let lo = Math.floor(Math.sqrt(4 * sigma * sigma + 1));
  if (lo % 2 === 0) lo--;
  const hi = lo + 2, m = Math.min(3, Math.max(0, Math.round((3 * (hi * hi - 1) - 12 * sigma * sigma) / (hi * hi - lo * lo))));
  return [0, 1, 2].map((i) => ((i < m ? lo : hi) - 1) / 2);
}

/** A Gaussian blur of an `n`-channel plane into a new plane: exact to a deviation of 2.5, three box passes beyond.
 *  Reaches 3 sigma. */
export function soften(a: Float32Array, w: number, h: number, n: number, sigma: number): Float32Array {
  if (!(sigma >= 0.3)) return a.slice();
  if (sigma <= 2.5) return convolve(a, w, h, n, gaussKernel(sigma));
  let out = a;
  for (const r of boxRadii(sigma)) if (r > 0) out = boxBoth(out, w, h, n, r);
  return out === a ? a.slice() : out;
}

/** How much of a random signal's variance a Gaussian of `sigma` keeps along one axis. */
function kept(sigma: number): number {
  if (!(sigma >= 0.3)) return 1;
  if (sigma > 2.5) return 1 / (2 * sigma * Math.sqrt(Math.PI));
  let t = 0;
  for (const x of gaussKernel(sigma)) t += x * x;
  return t;
}

/** Grain softened by `sigma` window pixels and, given a `way`, drawn out along it over `length` window pixels; then
 *  spread to 0.2 about 0.5 whatever the sizes (from how much the blurs keep, not from the window), held in 0 to 1. */
export function noiseField(p: Plate, seed: number, sigma: number, way?: Way, length = 0): Float32Array {
  const { w, h } = p, g = soften(grain(p, seed), w, h, 1, sigma), s = way ? streak(g, w, h, 1, way, length) : g;
  const across = kept(sigma), along = 1 / (2 * (way ? Math.max(0, radiusOf(way, length)) : 0) + 1), gain = 0.2 / Math.sqrt((across * Math.min(across, along)) / 12);
  for (let i = 0; i < s.length; i++) s[i] = clamp01(0.5 + (s[i] - 0.5) * gain);
  return s;
}

/** Strokes `length` by `width` document pixels running `way`, as a noise field. Reaches strokeReach. */
export const strokesOf = (p: Plate, way: Way, length: number, width: number, seed: number): Float32Array => noiseField(p, seed, (width * p.k) / 2, way, length * p.k);

/** Sobel derivatives of a plane, a unit rise a pixel reading 1, its border held. Reaches 1. */
export function slopes(a: Float32Array, w: number, h: number): [Float32Array, Float32Array] {
  const gx = new Float32Array(a.length), gy = new Float32Array(a.length);
  for (let y = 0; y < h; y++) {
    const up = (y > 0 ? y - 1 : 0) * w, mid = y * w, dn = (y < h - 1 ? y + 1 : y) * w;
    for (let x = 0; x < w; x++) {
      const l = x > 0 ? x - 1 : 0, r = x < w - 1 ? x + 1 : x;
      gx[mid + x] = (a[up + r] + 2 * a[mid + r] + a[dn + r] - a[up + l] - 2 * a[mid + l] - a[dn + l]) / 8;
      gy[mid + x] = (a[dn + l] + 2 * a[dn + x] + a[dn + r] - a[up + l] - 2 * a[up + x] - a[up + r]) / 8;
    }
  }
  return [gx, gy];
}

/** How steeply a plane changes at each pixel, per document pixel. Reaches 1. */
export function steepness(a: Float32Array, w: number, h: number, k: number): Float32Array {
  const [gx, gy] = slopes(a, w, h), out = new Float32Array(a.length);
  for (let i = 0; i < out.length; i++) out[i] = Math.hypot(gx[i], gy[i]) * k;
  return out;
}

/** The direction a light named in the menus comes from, a unit vector with y down. */
export function lightFrom(name: string): [number, number] {
  const x = /left/i.test(name) ? -1 : /right/i.test(name) ? 1 : 0, y = name.startsWith('top') ? -1 : name.startsWith('bottom') ? 1 : 0, len = Math.hypot(x, y) || 1;
  return [x / len, y / len];
}

/** How squarely a height plane faces a light from `light`: the rise toward it per document pixel. Reaches 1. */
export function facing(hgt: Float32Array, w: number, h: number, k: number, light: string): Float32Array {
  const [gx, gy] = slopes(hgt, w, h), [lx, ly] = lightFrom(light), out = new Float32Array(hgt.length);
  for (let i = 0; i < out.length; i++) out[i] = -(gx[i] * lx + gy[i] * ly) * k;
  return out;
}

/** Kuwahara smoothing: each pixel takes the mean colour of whichever of the four squares cornered on it (2q + 1 a
 *  side, q = r / 2 rounded up) varies least in luma, so areas flatten and edges keep. Reaches 2q. */
export function flatten(p: Plate, r: number): void {
  const { w, h } = p, n = w * h, q = Math.max(1, Math.ceil(r / 2)), L = lumaOf(p), L2 = new Float32Array(n);
  for (let i = 0; i < n; i++) L2[i] = L[i] * L[i];
  const mean = boxBoth(L, w, h, 1, q), square = boxBoth(L2, w, h, 1, q), from = new Int32Array(n);
  const spread = (j: number): number => square[j] - mean[j] * mean[j];
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - q) * w, y1 = Math.min(h - 1, y + q) * w;
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - q), x1 = Math.min(w - 1, x + q);
      let at = y0 + x0, best = spread(at), s = spread(y0 + x1);
      if (s < best) { best = s; at = y0 + x1; }
      s = spread(y1 + x0);
      if (s < best) { best = s; at = y1 + x0; }
      if (spread(y1 + x1) < best) at = y1 + x1;
      from[y * w + x] = at;
    }
  }
  const means = boxBoth(p.rgb, w, h, 3, q), out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const j = from[i] * 3; out[i * 3] = means[j]; out[i * 3 + 1] = means[j + 1]; out[i * 3 + 2] = means[j + 2]; }
  p.rgb = out;
}

/** Unsharp masking of the plate: each colour pushed from its blur at `sigma` window pixels by `amount`. Reaches 3 sigma. */
export function sharpen(p: Plate, sigma: number, amount: number): void {
  if (!(amount > 0) || sigma < 0.3) return;
  const b = soften(p.rgb, p.w, p.h, 3, sigma), c = p.rgb;
  for (let i = 0; i < c.length; i++) c[i] = clamp01(c[i] + (c[i] - b[i]) * amount);
}

/** The colour at window position (x, y), bilinear and held inside the window, into out[at] to out[at + 2]. */
export function sampleInto(c: Float32Array, w: number, h: number, x: number, y: number, out: Float32Array, at: number): void {
  const px = Math.min(w - 1, Math.max(0, x)), py = Math.min(h - 1, Math.max(0, y)), x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0;
  const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), a = (y0 * w + x0) * 3, b = (y0 * w + x1) * 3, d = (y1 * w + x0) * 3, e = (y1 * w + x1) * 3;
  for (let ch = 0; ch < 3; ch++) {
    const top = c[a + ch] + (c[b + ch] - c[a + ch]) * fx, low = c[d + ch] + (c[e + ch] - c[d + ch]) * fx;
    out[at + ch] = top + (low - top) * fy;
  }
}

/** Paints the plate between the foreground colour (tone 0, the ink) and the background colour (tone 1, the paper). */
export function inkOnPaper(p: Plate, tone: Float32Array): void {
  const c = p.rgb, f = p.fg, b = p.bg;
  for (let i = 0, j = 0; i < tone.length; i++, j += 3) {
    const t = clamp01(tone[i]);
    c[j] = f[0] + (b[0] - f[0]) * t; c[j + 1] = f[1] + (b[1] - f[1]) * t; c[j + 2] = f[2] + (b[2] - f[2]) * t;
  }
}

/** A woven surface: in each square of the weave one thread lies on top, bulging across its width and dipping toward
 *  where it passes under the next. */
function weave(u: number, v: number, period: number, open: number): number {
  const i = Math.floor(u / period), j = Math.floor(v / period), fu = u / period - i, fv = v / period - j, warp = ((i + j) & 1) === 0;
  const bulge = Math.sin(Math.PI * (warp ? fu : fv)), dip = 0.55 + 0.45 * Math.sin(Math.PI * (warp ? fv : fu));
  return clamp01((Math.pow(bulge, 1 - open * 0.5) - open * 0.35) / (1 - open * 0.35)) * dip;
}

/** The height (0 to 1) of one of the gallery's textures at (u, v), in texture pixels (document pixels at 100%). */
export function surfaceAt(kind: string, u: number, v: number): number {
  if (kind === 'brick') {
    const tall = 14, long = 32, row = Math.floor(v / tall), su = u + (row & 1 ? long / 2 : 0), col = Math.floor(su / long);
    const edge = Math.min(su - col * long, (col + 1) * long - su, v - row * tall, (row + 1) * tall - v);
    return ease(0.8, 2.6, edge) * (0.8 + 0.2 * lattice(u / 4, v / 4, 311));
  }
  if (kind === 'burlap') {
    const wu = u + (lattice(u / 29, v / 7, 313) - 0.5) * 3, wv = v + (lattice(u / 7, v / 29, 317) - 0.5) * 3;
    return 0.85 * weave(wu, wv, 8, 0.6) + 0.15 * lattice(u * 0.8, v * 0.8, 331);
  }
  if (kind === 'sandstone') return 0.55 * fractal(u / 9, v / 9, 337, 3) + 0.45 * hash01(Math.floor(u), Math.floor(v), 4, 347);
  return 0.9 * weave(u, v, 4, 0) + 0.1 * hash01(Math.floor(u * 1.5), Math.floor(v * 1.5), 5, 349);
}

/** Presses a texture into the plate: lit from `light`, each pixel lightens where the texture faces the light and
 *  darkens where it turns away, by `depth` (0 to 1) times `weight` where given, the texture at `scaling` percent and
 *  fixed to the document. Reaches 2. */
export function texturize(p: Plate, kind: string, scaling: number, depth: number, light: string, invert: boolean, weight?: Float32Array): void {
  if (!(depth > 0)) return;
  const { w, h, k } = p, unit = 100 / Math.max(1, scaling), m = Math.min(3, Math.max(1, Math.ceil(unit / k / 1.5))), hgt = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let t = 0;
    for (let sy = 0; sy < m; sy++) for (let sx = 0; sx < m; sx++) t += surfaceAt(kind, (p.left + (x + (sx + 0.5) / m) / k) * unit, (p.top + (y + (sy + 0.5) / m) / k) * unit);
    t /= m * m;
    hgt[y * w + x] = invert ? 1 - t : t;
  }
  const f = facing(hgt, w, h, k, light), c = p.rgb, gain = (2.5 * depth) / unit;
  for (let i = 0, j = 0; i < f.length; i++, j += 3) {
    const s = Math.max(-1, Math.min(1, f[i] * gain * (weight ? weight[i] : 1)));
    c[j] = lit(c[j], s); c[j + 1] = lit(c[j + 1], s); c[j + 2] = lit(c[j + 2], s);
  }
}

/** A jittered grid of sites `size` document pixels apart, over the window and a margin of four cells, so cell
 *  patterns stay put in the document. */
export class Cells {
  private readonly i0: number;
  private readonly j0: number;
  private readonly cols: number;
  private readonly sites: Float64Array;

  constructor(p: Plate, readonly size: number, seed: number) {
    this.i0 = Math.floor(p.left / size) - 4;
    this.j0 = Math.floor(p.top / size) - 4;
    this.cols = Math.ceil((p.left + p.w / p.k) / size) + 5 - this.i0;
    const rows = Math.ceil((p.top + p.h / p.k) / size) + 5 - this.j0;
    this.sites = new Float64Array(this.cols * rows * 2);
    for (let r = 0; r < rows; r++) for (let c = 0; c < this.cols; c++) {
      const i = this.i0 + c, j = this.j0 + r, at = (r * this.cols + c) * 2;
      this.sites[at] = (i + 0.1 + 0.8 * hash01(i, j, 1, seed)) * size;
      this.sites[at + 1] = (j + 0.1 + 0.8 * hash01(i, j, 2, seed)) * size;
    }
  }

  private readonly near = new Int32Array(9);

  /** The site nearest the document point (x, y) into out[0] and out[1], its cell's number into out[2], and how far
   *  inside its cell's border the point lies into out[3], in document pixels (the border with the sites of the nine
   *  cells around the point). */
  find(x: number, y: number, out: Float64Array): void {
    const s = this.size, q = this.sites, cols = this.cols, near = this.near, gi = Math.floor(x / s) - this.i0, gj = Math.floor(y / s) - this.j0;
    let best = Infinity, at = 0, m = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const a = ((gj + dj) * cols + gi + di) * 2, dx = q[a] - x, dy = q[a + 1] - y, d = dx * dx + dy * dy;
      near[m++] = a;
      if (d < best) { best = d; at = a; }
    }
    const ax = q[at], ay = q[at + 1];
    let border = Infinity;
    for (let t = 0; t < 9; t++) {
      const b = near[t], ex = q[b] - ax, ey = q[b + 1] - ay, len = Math.sqrt(ex * ex + ey * ey);
      if (b !== at && len > 0) border = Math.min(border, len / 2 - ((x - ax) * ex + (y - ay) * ey) / len);
    }
    out[0] = ax; out[1] = ay; out[2] = at >> 1; out[3] = border;
  }
}

/** The window's colour, straight in 0 to 1. Under partly or wholly transparent pixels the colour is that of what
 *  is around them (grey far from anything), so effects that read neighbours do not pull in black. Reaches 6k + 1. */
function colourOf(src: { width: number; height: number; data: ArrayLike<number> }, k: number): Float32Array {
  const { width: w, height: h, data: d } = src, n = w * h, rgb = new Float32Array(n * 3);
  let clear = false;
  for (let i = 3; i < d.length && !clear; i += 4) clear = d[i] < 255;
  if (!clear) {
    for (let i = 0, j = 0; i < n; i++, j += 3) { rgb[j] = d[i * 4] / 255; rgb[j + 1] = d[i * 4 + 1] / 255; rgb[j + 2] = d[i * 4 + 2] / 255; }
    return rgb;
  }
  const pre = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const a = d[i * 4 + 3] / 255;
    pre[i * 4] = (d[i * 4] / 255) * a; pre[i * 4 + 1] = (d[i * 4 + 1] / 255) * a; pre[i * 4 + 2] = (d[i * 4 + 2] / 255) * a; pre[i * 4 + 3] = a;
  }
  const near = soften(pre, w, h, 4, 2 * k);
  for (let i = 0; i < n; i++) {
    const gap = 1 - pre[i * 4 + 3], na = near[i * 4 + 3];
    for (let c = 0; c < 3; c++) rgb[i * 3 + c] = pre[i * 4 + c] + gap * (na > 1e-3 ? near[i * 4 + c] / na : 0.5);
  }
  return rgb;
}

/** How far the gallery reaches with these layers shown, at scale k. */
export const galleryReach = (list: readonly FxRun[], k: number): number => list.reduce((t, r) => t + r.fx.reach(r.values, k), Math.ceil(6 * k) + 1);

/** Runs the shown effect layers in order, bottom first, each on the last one's result; alpha is kept. */
export function runEffects(src: ImageData, list: readonly FxRun[], ctx: LibContext): ImageData {
  const out = copyImage(src);
  if (!list.length) return out;
  const k = ctx.scale > 0 ? ctx.scale : 1, a = ctx.area, unit = (c: readonly number[]): Rgb => [c[0] / 255, c[1] / 255, c[2] / 255];
  const plate: Plate = { w: src.width, h: src.height, rgb: colourOf(src, k), k, left: -ctx.canvas.x / k, top: -ctx.canvas.y / k, cx: a.x + a.w / 2, cy: a.y + a.h / 2, half: Math.max(1, Math.hypot(a.w, a.h) / 2), fg: unit(ctx.fg), bg: unit(ctx.bg) };
  for (const { fx, values } of list) fx.paint(plate, values);
  const c = plate.rgb, d = out.data;
  for (let i = 0, j = 0; i < d.length; i += 4, j += 3) { d[i] = c[j] * 255; d[i + 1] = c[j + 1] * 255; d[i + 2] = c[j + 2] * 255; }
  return out;
}

/** The same effect layers over float colour: `rgba` is the layer as red, green, blue, alpha in 0 to 255 levels at any precision; returns the painted colour in the same units, three floats a pixel. */
export function runEffectsFloat(rgba: Float32Array, w: number, h: number, list: readonly FxRun[], area: Rect, canvas: Rect, fg: readonly number[], bg: readonly number[]): Float32Array {
  const unit = (c: readonly number[]): Rgb => [c[0] / 255, c[1] / 255, c[2] / 255];
  const plate: Plate = { w, h, rgb: colourOf({ width: w, height: h, data: rgba }, 1), k: 1, left: -canvas.x, top: -canvas.y, cx: area.x + area.w / 2, cy: area.y + area.h / 2, half: Math.max(1, Math.hypot(area.w, area.h) / 2), fg: unit(fg), bg: unit(bg) };
  for (const { fx, values } of list) fx.paint(plate, values);
  return plate.rgb;
}
