import { PIXEL_BLENDS, blendPixels } from './blend';
import type { BlendMode } from './types';

/** Image > Apply Image (31.2): pure pixel math over RGBA bytes. The engine reads the source and the mask into
 *  same-size buffers, this module blends them into the target's pixels. */

/** The modes Apply Image offers: the 27 layer blend modes, with Add as its own mode; Subtract is the layer
 *  mode's name and here carries Scale and Offset as Add does. */
export type ApplyMode = BlendMode | 'add';
export const APPLY_MODES: readonly ApplyMode[] = [
  'normal', 'dissolve', 'darken', 'multiply', 'color-burn', 'linear-burn', 'darker-color', 'lighten', 'screen', 'color-dodge',
  'linear-dodge', 'lighter-color', 'overlay', 'soft-light', 'hard-light', 'vivid-light', 'linear-light', 'pin-light', 'hard-mix',
  'difference', 'exclusion', 'subtract', 'divide', 'hue', 'saturation', 'color', 'luminosity', 'add',
];
export type ApplyChannel = 'rgb' | 'red' | 'green' | 'blue' | 'transparency';
export const APPLY_CHANNELS: readonly ApplyChannel[] = ['rgb', 'red', 'green', 'blue', 'transparency'];

export interface ApplyOptions { mode: ApplyMode; opacity: number; scale: number; offset: number; mask: Uint8ClampedArray | null }

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The channel `channel` of `rgba` as a buffer to blend: RGB keeps the colour, a single channel becomes that grey in
 *  R, G and B (Transparency is the alpha as grey); `invert` flips the values. Alpha of the result is 255. */
export function channelSource(rgba: Uint8ClampedArray, channel: ApplyChannel, invert: boolean): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length), pick = channel === 'red' ? 0 : channel === 'green' ? 1 : channel === 'blue' ? 2 : 3;
  for (let i = 0; i < rgba.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = channel === 'rgb' ? rgba[i + c] : rgba[i + pick];
      out[i + c] = invert ? 255 - v : v;
    }
    out[i + 3] = 255;
  }
  return out;
}

/** A saved alpha channel's coverage (one byte a pixel, document-sized) as a grey RGBA buffer. */
export function coverageSource(cov: Uint8Array | Uint8ClampedArray, invert: boolean): Uint8ClampedArray {
  const out = new Uint8ClampedArray(cov.length * 4);
  for (let p = 0; p < cov.length; p++) {
    const v = invert ? 255 - cov[p] : cov[p], i = p * 4;
    out[i] = out[i + 1] = out[i + 2] = v; out[i + 3] = 255;
  }
  return out;
}

/** A mask's per-pixel strength (0 to 255) from a source buffer prepared by `channelSource` or `coverageSource`:
 *  the grey itself, or for an RGB mask the luminosity. */
export function maskStrength(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length / 4);
  for (let p = 0, i = 0; p < out.length; p++, i += 4) out[p] = Math.round(0.3 * rgba[i] + 0.59 * rgba[i + 1] + 0.11 * rgba[i + 2]);
  return out;
}

const lum = (r: number, g: number, b: number): number => 0.3 * r + 0.59 * g + 0.11 * b;
const sat = (r: number, g: number, b: number): number => Math.max(r, g, b) - Math.min(r, g, b);
function clipColor(c: [number, number, number]): [number, number, number] {
  const l = lum(c[0], c[1], c[2]), n = Math.min(c[0], c[1], c[2]), x = Math.max(c[0], c[1], c[2]);
  let o = c;
  if (n < 0) o = o.map((v) => l + ((v - l) * l) / (l - n)) as [number, number, number];
  if (x > 1) o = o.map((v) => l + ((v - l) * (1 - l)) / (x - l)) as [number, number, number];
  return o;
}
function setLum(c: [number, number, number], l: number): [number, number, number] {
  const d = l - lum(c[0], c[1], c[2]);
  return clipColor([c[0] + d, c[1] + d, c[2] + d]);
}
function setSat(c: [number, number, number], s: number): [number, number, number] {
  const idx = [0, 1, 2].sort((a, b) => c[a] - c[b]), o: [number, number, number] = [0, 0, 0], lo = idx[0], mid = idx[1], hi = idx[2];
  if (c[hi] > c[lo]) { o[mid] = ((c[mid] - c[lo]) * s) / (c[hi] - c[lo]); o[hi] = s; }
  return o;
}

type Sep = (b: number, s: number) => number;
const SEP: Partial<Record<ApplyMode, Sep>> = {
  normal: (_b, s) => s,
  multiply: (b, s) => b * s,
  screen: (b, s) => b + s - b * s,
  overlay: (b, s) => (b <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s)),
  'hard-light': (b, s) => (s <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s)),
  darken: (b, s) => Math.min(b, s),
  lighten: (b, s) => Math.max(b, s),
  difference: (b, s) => Math.abs(b - s),
  exclusion: (b, s) => b + s - 2 * b * s,
  'color-dodge': (b, s) => (b <= 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s))),
  'color-burn': (b, s) => (b >= 1 ? 1 : s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s)),
  'linear-dodge': (b, s) => clamp01(b + s),
  'soft-light': (b, s) => {
    if (s <= 0.5) return b - (1 - 2 * s) * b * (1 - b);
    const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
    return b + (2 * s - 1) * (d - b);
  },
};

function nonSeparable(mode: ApplyMode, b: [number, number, number], s: [number, number, number]): [number, number, number] {
  if (mode === 'hue') return setLum(setSat(s, sat(b[0], b[1], b[2])), lum(b[0], b[1], b[2]));
  if (mode === 'saturation') return setLum(setSat(b, sat(s[0], s[1], s[2])), lum(b[0], b[1], b[2]));
  if (mode === 'color') return setLum(s, lum(b[0], b[1], b[2]));
  return setLum(b, lum(s[0], s[1], s[2]));
}

/** Blends `src` into `dst` in place (RGBA, same size, `width` wide). `o.mask` is one strength byte a pixel, or null.
 *  Alpha of `dst` is kept. Add and Subtract are (target + source) / scale + offset and (target - source) / scale + offset. */
export function applyImagePixels(dst: Uint8ClampedArray, src: Uint8ClampedArray, width: number, o: ApplyOptions): void {
  const op = clamp01(o.opacity), n = dst.length / 4, scale = o.scale > 0 ? o.scale : 1, off = o.offset / 255;
  if (PIXEL_BLENDS.has(o.mode as BlendMode) && o.mode !== 'subtract') {
    const alphas = new Uint8ClampedArray(n), s2 = new Uint8ClampedArray(src);
    for (let p = 0; p < n; p++) { alphas[p] = dst[p * 4 + 3]; dst[p * 4 + 3] = 255; s2[p * 4 + 3] = o.mask ? o.mask[p] : 255; }
    blendPixels(dst, s2, o.mode as BlendMode, op, (i) => [i % width, Math.floor(i / width)]);
    for (let p = 0; p < n; p++) dst[p * 4 + 3] = alphas[p];
    return;
  }
  const sep = SEP[o.mode];
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const k = op * (o.mask ? o.mask[p] / 255 : 1);
    if (k <= 0) continue;
    const b: [number, number, number] = [dst[i] / 255, dst[i + 1] / 255, dst[i + 2] / 255], s: [number, number, number] = [src[i] / 255, src[i + 1] / 255, src[i + 2] / 255];
    let r: [number, number, number];
    if (o.mode === 'add') r = [clamp01((b[0] + s[0]) / scale + off), clamp01((b[1] + s[1]) / scale + off), clamp01((b[2] + s[2]) / scale + off)];
    else if (o.mode === 'subtract') r = [clamp01((b[0] - s[0]) / scale + off), clamp01((b[1] - s[1]) / scale + off), clamp01((b[2] - s[2]) / scale + off)];
    else if (sep) r = [clamp01(sep(b[0], s[0])), clamp01(sep(b[1], s[1])), clamp01(sep(b[2], s[2]))];
    else r = nonSeparable(o.mode, b, s).map(clamp01) as [number, number, number];
    for (let c = 0; c < 3; c++) dst[i + c] = Math.round((b[c] + (r[c] - b[c]) * k) * 255);
  }
}
