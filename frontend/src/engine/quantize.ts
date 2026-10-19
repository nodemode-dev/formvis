// Bitmap and Indexed Color conversions as pure pixel functions (Image > Mode): the 50 percent threshold, pattern and
// diffusion dithers and the halftone screen; the palette kinds, forced colours, transparency and the three dithers.
import type { RGB } from './types';
import { systemMac, systemWindows, uniformPalette, webSafe } from './palettes';

export type BitmapMethod = 'threshold' | 'pattern' | 'diffusion' | 'halftone';
export type HalftoneShape = 'round' | 'ellipse' | 'line' | 'square' | 'cross' | 'diamond';
export interface Halftone { lpi: number; angle: number; shape: HalftoneShape }
export const HALFTONE_SHAPES: readonly HalftoneShape[] = ['round', 'ellipse', 'line', 'square', 'cross', 'diamond'];

const BAYER: Uint8Array = (() => {
  let m = [[0]];
  for (let n = 1; n < 8; n *= 2) {
    const s = m.length, next = Array.from({ length: s * 2 }, () => new Array<number>(s * 2).fill(0));
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) { const v = m[y][x] * 4; next[y][x] = v; next[y][x + s] = v + 2; next[y + s][x] = v + 3; next[y + s][x + s] = v + 1; }
    m = next;
  }
  return Uint8Array.from(m.flat());
})();

const SCREEN = 64;
const screens = new Map<HalftoneShape, Float32Array>();
const spot = (shape: HalftoneShape, u: number, v: number): number => {
  switch (shape) {
    case 'ellipse': return Math.hypot(u, v * 1.6);
    case 'line': return Math.abs(v);
    case 'square': return Math.max(Math.abs(u), Math.abs(v));
    case 'cross': return Math.min(Math.abs(u), Math.abs(v));
    case 'diamond': return Math.abs(u) + Math.abs(v);
    default: return Math.hypot(u, v);
  }
};
/** One screen cell as ranks from 0 to 1, spread evenly so every shape reproduces tone the same; dots grow from rank 0. */
function screenOf(shape: HalftoneShape): Float32Array {
  let s = screens.get(shape);
  if (s) return s;
  const n = SCREEN * SCREEN, raw = new Float32Array(n);
  for (let y = 0; y < SCREEN; y++) for (let x = 0; x < SCREEN; x++) raw[y * SCREEN + x] = spot(shape, (x + 0.5) / SCREEN - 0.5, (y + 0.5) / SCREEN - 0.5);
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => raw[a] - raw[b] || a - b);
  s = new Float32Array(n);
  order.forEach((idx, k) => { s![idx] = (k + 0.5) / n; });
  screens.set(shape, s);
  return s;
}

/** RGBA pixels to black and white RGBA: grey over white, then the method. `ppi` sets the halftone cell (ppi over lines per inch). */
export function bitmapPixels(d: Uint8ClampedArray, W: number, H: number, method: BitmapMethod, ppi: number, ht: Halftone): Uint8ClampedArray {
  const o = new Uint8ClampedArray(W * H * 4), g = new Float32Array(W * H);
  for (let i = 0; i < g.length; i++) { const a = d[i * 4 + 3] / 255; g[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) * a + 255 * (1 - a); }
  const cell = Math.max(2, ppi / Math.max(1, ht.lpi)), ang = (ht.angle * Math.PI) / 180, ca = Math.cos(ang), sa = Math.sin(ang), scr = method === 'halftone' ? screenOf(ht.shape) : null;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    let v: number;
    if (method === 'pattern') v = g[i] / 255 < (BAYER[(y & 7) * 8 + (x & 7)] + 0.5) / 64 ? 0 : 255;
    else if (scr) {
      const xr = ((x + 0.5) * ca + (y + 0.5) * sa) / cell, yr = (-(x + 0.5) * sa + (y + 0.5) * ca) / cell, fx = xr - Math.floor(xr), fy = yr - Math.floor(yr);
      v = 1 - g[i] / 255 > scr[Math.min(SCREEN - 1, Math.floor(fy * SCREEN)) * SCREEN + Math.min(SCREEN - 1, Math.floor(fx * SCREEN))] ? 0 : 255;
    } else {
      v = g[i] < 128 ? 0 : 255;
      if (method === 'diffusion') {
        const e = g[i] - v;
        if (x + 1 < W) g[i + 1] += (e * 7) / 16;
        if (y + 1 < H) { if (x > 0) g[i + W - 1] += (e * 3) / 16; g[i + W] += (e * 5) / 16; if (x + 1 < W) g[i + W + 1] += e / 16; }
      }
    }
    o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = v; o[i * 4 + 3] = 255;
  }
  return o;
}

export type PaletteKind = 'exact' | 'uniform' | 'web' | 'mac' | 'windows' | 'perceptual' | 'selective' | 'adaptive' | 'custom';
export type DitherKind = 'none' | 'diffusion' | 'pattern' | 'noise';
export type ForcedKind = 'none' | 'bw' | 'primaries' | 'web' | 'custom';
export interface IndexedChoice {
  palette: PaletteKind; colors: number; custom?: readonly RGB[];
  forced: ForcedKind; forcedColors?: readonly RGB[];
  transparency: boolean; matte: RGB;
  dither: DitherKind; amount: number;
}
export const INDEXED_DEFAULTS: IndexedChoice = { palette: 'adaptive', colors: 256, forced: 'none', transparency: true, matte: { r: 255, g: 255, b: 255 }, dither: 'none', amount: 75 };

const key = (c: RGB): number => (c.r << 16) | (c.g << 8) | c.b;
const PRIMARIES: RGB[] = [[0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 255, 0], [0, 0, 255], [0, 255, 255], [255, 0, 255], [255, 255, 0]].map(([r, g, b]) => ({ r, g, b }));

/** Median cut over a sample of the opaque pixels, the box split on the channel with the widest weighted range. */
function medianCut(d: Uint8ClampedArray, n: number, w: readonly [number, number, number]): RGB[] {
  const step = Math.max(1, Math.floor(d.length / 4 / 200000)), pts: number[][] = [];
  for (let i = 0; i < d.length; i += 4 * step) if (d[i + 3] >= 128) pts.push([d[i], d[i + 1], d[i + 2]]);
  if (!pts.length) return [];
  let boxes: number[][][] = [pts];
  while (boxes.length < n) {
    let bi = -1, best = -1, axis = 0;
    boxes.forEach((b, i) => { if (b.length < 2) return; for (let a = 0; a < 3; a++) { let lo = 255, hi = 0; for (const p of b) { if (p[a] < lo) lo = p[a]; if (p[a] > hi) hi = p[a]; } if ((hi - lo) * w[a] > best) { best = (hi - lo) * w[a]; bi = i; axis = a; } } });
    if (bi < 0 || best <= 0) break;
    const b = boxes[bi].sort((p, q) => p[axis] - q[axis]);
    let mid = b.length >> 1;
    while (mid < b.length && b[mid - 1][axis] === b[mid][axis]) mid++;
    if (mid >= b.length) { mid = b.length >> 1; while (mid > 0 && b[mid - 1][axis] === b[mid][axis]) mid--; }
    boxes = [...boxes.slice(0, bi), b.slice(0, mid), b.slice(mid), ...boxes.slice(bi + 1)];
  }
  return boxes.filter((b) => b.length).map((b) => { let r = 0, g = 0, bl = 0; for (const p of b) { r += p[0]; g += p[1]; bl += p[2]; } return { r: Math.round(r / b.length), g: Math.round(g / b.length), b: Math.round(bl / b.length) }; });
}

export interface IndexedResult { pixels: Uint8ClampedArray; palette: RGB[]; transparentIndex?: number }

/** RGBA pixels to an Indexed Color rendition. `adaptive(d, n)` gives the Exact or Adaptive palette (every colour when n or fewer). */
export function indexedPixels(src: Uint8ClampedArray, W: number, H: number, c: IndexedChoice, adaptive: (d: Uint8ClampedArray, n: number) => RGB[]): IndexedResult {
  const total = W * H, d = new Uint8ClampedArray(src.length), clear = new Uint8Array(total), m = c.matte;
  let anyClear = false;
  for (let i = 0; i < total; i++) {
    const a = src[i * 4 + 3] / 255;
    if (c.transparency && a < 0.5) { clear[i] = 1; anyClear = true; continue; }
    d[i * 4] = src[i * 4] * a + m.r * (1 - a); d[i * 4 + 1] = src[i * 4 + 1] * a + m.g * (1 - a); d[i * 4 + 2] = src[i * 4 + 2] * a + m.b * (1 - a); d[i * 4 + 3] = 255;
  }
  const forced: RGB[] = c.forced === 'bw' ? PRIMARIES.slice(0, 2) : c.forced === 'primaries' ? PRIMARIES : c.forced === 'web' ? webSafe() : c.forced === 'custom' ? [...(c.forcedColors ?? [])] : [];
  const want = Math.max(2, Math.min(256, Math.round(c.colors || 256)));
  const room = Math.max(1, want - forced.length - (anyClear ? 1 : 0));
  let pal: RGB[];
  if (c.palette === 'web') pal = webSafe();
  else if (c.palette === 'mac') pal = systemMac();
  else if (c.palette === 'windows') pal = systemWindows();
  else if (c.palette === 'uniform') pal = uniformPalette(room);
  else if (c.palette === 'custom') pal = (c.custom ?? []).slice(0, 256).map((q) => ({ ...q }));
  else if (c.palette === 'perceptual' || c.palette === 'selective') {
    pal = medianCut(d, room, [0.8, 1, 0.5]);
    if (c.palette === 'selective') {
      const web = webSafe();
      pal = pal.map((p) => { let bd = Infinity, bw = p; for (const q of web) { const dd = (p.r - q.r) ** 2 + (p.g - q.g) ** 2 + (p.b - q.b) ** 2; if (dd < bd) { bd = dd; bw = q; } } return bd <= 26 * 26 ? bw : p; });
    }
  } else if (c.palette === 'exact') pal = adaptive(d, room);
  else {
    const all = new Map<number, RGB>();
    for (let i = 0; i < d.length && all.size <= room; i += 4) if (d[i + 3] >= 128) { const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]; if (!all.has(k)) all.set(k, { r: d[i], g: d[i + 1], b: d[i + 2] }); }
    pal = all.size <= room ? [...all.values()] : medianCut(d, room, [1, 1, 1]);
  }
  const seen = new Set<number>(pal.map(key));
  for (const f of forced) if (pal.length < 256 && !seen.has(key(f))) { seen.add(key(f)); pal.push({ ...f }); }
  const unique: RGB[] = [], uniq = new Set<number>();
  for (const p of pal) if (!uniq.has(key(p))) { uniq.add(key(p)); unique.push(p); }
  pal = unique;
  if (!pal.length) pal = [{ ...m }];
  let transparentIndex: number | undefined;
  if (anyClear) { if (pal.length >= 256) pal.pop(); pal.push({ ...m }); transparentIndex = pal.length - 1; }
  const usable = transparentIndex === undefined ? pal : pal.slice(0, transparentIndex);
  const pool = usable.length ? usable : pal;
  const cache = new Map<number, RGB>();
  const near = (r: number, g: number, b: number, shift: number): RGB => {
    const k = ((r >> shift) << 16) | ((g >> shift) << 8) | (b >> shift);
    let q = cache.get(k);
    if (!q) { let bd = Infinity; for (const p of pool) { const dd = (p.r - r) ** 2 + (p.g - g) ** 2 + (p.b - b) ** 2; if (dd < bd) { bd = dd; q = p; if (dd === 0) break; } } cache.set(k, q as RGB); }
    return q as RGB;
  };
  const o = new Uint8ClampedArray(src.length), amount = Math.max(0, Math.min(100, c.amount)) / 100, spread = (255 / Math.cbrt(Math.max(2, pool.length))) * amount;
  const f = c.dither === 'diffusion' ? Float32Array.from(d) : null;
  let seed = 2463534242;
  const rnd = (): number => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
  const shift = c.dither === 'none' ? 0 : 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x, i = p * 4;
    if (clear[p]) { o[i] = m.r; o[i + 1] = m.g; o[i + 2] = m.b; o[i + 3] = 0; continue; }
    let r = d[i], g = d[i + 1], b = d[i + 2];
    if (f) { r = Math.max(0, Math.min(255, Math.round(f[i]))); g = Math.max(0, Math.min(255, Math.round(f[i + 1]))); b = Math.max(0, Math.min(255, Math.round(f[i + 2]))); }
    else if (c.dither === 'pattern') { const t = ((BAYER[(y & 7) * 8 + (x & 7)] + 0.5) / 64 - 0.5) * spread; r = Math.max(0, Math.min(255, Math.round(r + t))); g = Math.max(0, Math.min(255, Math.round(g + t))); b = Math.max(0, Math.min(255, Math.round(b + t))); }
    else if (c.dither === 'noise') { r = Math.max(0, Math.min(255, Math.round(r + (rnd() - 0.5) * spread))); g = Math.max(0, Math.min(255, Math.round(g + (rnd() - 0.5) * spread))); b = Math.max(0, Math.min(255, Math.round(b + (rnd() - 0.5) * spread))); }
    const q = near(r, g, b, shift);
    o[i] = q.r; o[i + 1] = q.g; o[i + 2] = q.b; o[i + 3] = 255;
    if (f) {
      const er = [r - q.r, g - q.g, b - q.b];
      for (let k = 0; k < 3; k++) {
        const e = er[k] * amount;
        if (x + 1 < W) f[i + 4 + k] += (e * 7) / 16;
        if (y + 1 < H) { if (x > 0) f[i + (W - 1) * 4 + k] += (e * 3) / 16; f[i + W * 4 + k] += (e * 5) / 16; if (x + 1 < W) f[i + (W + 1) * 4 + k] += e / 16; }
      }
    }
  }
  return { pixels: o, palette: pal, transparentIndex };
}
