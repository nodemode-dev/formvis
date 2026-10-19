import type { LibFilter, LibValues } from '../filter-library';
import { gaussianMargin } from '../filters';
import { boxOf, clampInt, clipBox, copyImage, exactGaussian, luma, type Box } from './shared';

const num = (v: LibValues, k: string): number => v[k] as number;
const str = (v: LibValues, k: string): string => v[k] as string;

/** High Pass: each colour's difference from its blur at `radius`, around mid grey; alpha kept. */
export function highPassImage(img: ImageData, radius: number): ImageData {
  const soft = exactGaussian(img, Math.max(0.1, radius)).data, s = img.data, out = copyImage(img), d = out.data;
  for (let i = 0; i < s.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = 128 + s[i + c] - soft[i + c];
  return out;
}

/** Tonal Contrast: the local detail of the luminance (its difference from a blur at `radius`) is scaled by a gain that
 *  depends on the blurred tone, so shadows, midtones and highlights each get their own contrast (-100 to 100 percent);
 *  the change in luminance is added to the colour channels. Alpha is kept. */
export function tonalContrastImage(img: ImageData, radius: number, shadows: number, midtones: number, highlights: number): ImageData {
  const { width: w, height: h } = img, s = img.data, out = copyImage(img), d = out.data;
  const grey = new ImageData(w, h), g = grey.data;
  for (let i = 0; i < s.length; i += 4) { const y = luma(s[i], s[i + 1], s[i + 2]); g[i] = y; g[i + 1] = y; g[i + 2] = y; g[i + 3] = 255; }
  const base = exactGaussian(grey, Math.max(0.5, radius)).data;
  for (let i = 0; i < s.length; i += 4) {
    const tone = base[i] / 255, ws = Math.max(0, 1 - tone * 2), wh = Math.max(0, tone * 2 - 1), wm = 1 - ws - wh;
    const gain = (shadows * ws + midtones * wm + highlights * wh) / 100;
    const delta = (g[i] - base[i]) * gain;
    if (delta === 0 || s[i + 3] === 0) continue;
    for (let c = 0; c < 3; c++) { const v = s[i + c] + delta; d[i + c] = v < 0 ? 0 : v > 255 ? 255 : v; }
  }
  return out;
}

/** The largest (or smallest) value of `src` over a window of `len` = 2r+1 samples along each line, by a running
 *  queue of candidates: O(1) a sample however wide the window. */
function slide(src: Float32Array, dst: Float32Array, count: number, lines: number, at: (line: number, i: number) => number, r: number, max: boolean): void {
  const queue = new Int32Array(count + 1);
  for (let line = 0; line < lines; line++) {
    let head = 0, tail = 0;
    const better = (a: number, b: number): boolean => (max ? a >= b : a <= b);
    for (let i = 0; i < count + r; i++) {
      if (i < count) {
        const v = src[at(line, i)];
        while (tail > head && better(v, src[at(line, queue[tail - 1])])) tail--;
        queue[tail++] = i;
      }
      const o = i - r;
      if (o < 0) continue;
      while (queue[head] < o - r) head++;
      dst[at(line, o)] = src[at(line, queue[head])];
    }
  }
}

/** Maximum and Minimum: each channel spread to the largest (or smallest) value within `radius`; Squareness takes a
 *  square, Roundness a disc made of eight rectangles. Alpha spreads with the colour. */
export function minMaxImage(img: ImageData, radius: number, max: boolean, round: boolean): ImageData {
  const r = Math.round(radius), { width: w, height: h } = img, s = img.data, out = copyImage(img), d = out.data;
  if (r < 1) return out;
  const plane = new Float32Array(w * h), tmp = new Float32Array(w * h), part = new Float32Array(w * h), best = new Float32Array(w * h);
  const rects: Array<[number, number]> = round
    ? Array.from({ length: 8 }, (_, i) => { const t = ((i + 0.5) * Math.PI) / 16; return [Math.round(r * Math.cos(t)), Math.round(r * Math.sin(t))] as [number, number]; })
    : [[r, r]];
  for (let c = 0; c < 4; c++) {
    for (let i = 0; i < plane.length; i++) plane[i] = s[i * 4 + c];
    best.fill(max ? -Infinity : Infinity);
    for (const [rx, ry] of rects) {
      slide(plane, tmp, w, h, (y, x) => y * w + x, rx, max);
      slide(tmp, part, h, w, (x, y) => y * w + x, ry, max);
      for (let i = 0; i < best.length; i++) best[i] = max ? Math.max(best[i], part[i]) : Math.min(best[i], part[i]);
    }
    for (let i = 0; i < best.length; i++) d[i * 4 + c] = best[i];
  }
  return out;
}

/** Offset: the frame's pixels moved by (dx, dy) within it; what the move uncovers is transparent, the nearest edge
 *  pixel, or the pixels that left on the far side (Wrap Around). Pixels outside the frame stay. */
export function offsetImage(img: ImageData, dx: number, dy: number, undefinedAreas: string, area: Box = { x0: 0, y0: 0, x1: img.width, y1: img.height }): ImageData {
  const out = copyImage(img), b = clipBox(area, img.width, img.height);
  if (!b) return out;
  const s = img.data, d = out.data, w = img.width, fw = b.x1 - b.x0, fh = b.y1 - b.y0, mx = Math.round(dx), my = Math.round(dy);
  for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) {
    let sx = x - b.x0 - mx, sy = y - b.y0 - my;
    const o = (y * w + x) * 4;
    if (undefinedAreas === 'wrap') { sx = ((sx % fw) + fw) % fw; sy = ((sy % fh) + fh) % fh; }
    else if (undefinedAreas === 'repeat') { sx = clampInt(sx, 0, fw - 1); sy = clampInt(sy, 0, fh - 1); }
    else if (sx < 0 || sy < 0 || sx >= fw || sy >= fh) { d[o] = d[o + 1] = d[o + 2] = d[o + 3] = 0; continue; }
    const q = ((sy + b.y0) * w + sx + b.x0) * 4;
    d[o] = s[q]; d[o + 1] = s[q + 1]; d[o + 2] = s[q + 2]; d[o + 3] = s[q + 3];
  }
  return out;
}

/** Custom: each colour the sum of its 5 by 5 neighbourhood times `kernel`, divided by `scale`, plus `offset`; the
 *  image's edge pixels repeat outward; alpha kept. */
export function customImage(img: ImageData, kernel: readonly number[], scale: number, offset: number): ImageData {
  const { width: w, height: h } = img, s = img.data, out = copyImage(img), d = out.data, k = 1 / Math.max(1, scale);
  const taps: Array<[number, number, number]> = [];
  kernel.forEach((v, i) => { if (v) taps.push([(i % 5) - 2, Math.floor(i / 5) - 2, v]); });
  if (!taps.length) return out;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0;
    for (const [tx, ty, v] of taps) {
      const q = (clampInt(y + ty, 0, h - 1) * w + clampInt(x + tx, 0, w - 1)) * 4;
      r += s[q] * v; g += s[q + 1] * v; b += s[q + 2] * v;
    }
    const o = (y * w + x) * 4;
    d[o] = r * k + offset; d[o + 1] = g * k + offset; d[o + 2] = b * k + offset;
  }
  return out;
}

/** RGB in 0 to 1 to hue, saturation and brightness (HSB) or lightness (HSL), each 0 to 1. */
function fromRgb(r: number, g: number, b: number, mode: string): [number, number, number] {
  const hi = Math.max(r, g, b), lo = Math.min(r, g, b), span = hi - lo;
  let hue = 0;
  if (span > 0) hue = hi === r ? ((g - b) / span + 6) % 6 : hi === g ? (b - r) / span + 2 : (r - g) / span + 4;
  if (mode === 'hsb') return [hue / 6, hi > 0 ? span / hi : 0, hi];
  const l = (hi + lo) / 2;
  return [hue / 6, span > 0 ? span / (1 - Math.abs(hi + lo - 1)) : 0, l];
}

/** Hue, saturation and brightness or lightness (0 to 1) back to RGB. */
function toRgb(hue: number, sat: number, v: number, mode: string): [number, number, number] {
  const chroma = mode === 'hsb' ? v * sat : (1 - Math.abs(2 * v - 1)) * sat, base = mode === 'hsb' ? v - chroma : v - chroma / 2;
  const h6 = (((hue % 1) + 1) % 1) * 6, x = chroma * (1 - Math.abs((h6 % 2) - 1));
  const [r, g, b] = h6 < 1 ? [chroma, x, 0] : h6 < 2 ? [x, chroma, 0] : h6 < 3 ? [0, chroma, x] : h6 < 4 ? [0, x, chroma] : h6 < 5 ? [x, 0, chroma] : [chroma, 0, x];
  return [r + base, g + base, b + base];
}

/** HSB/HSL: the channels read as `input` (RGB, HSB or HSL) and written as `output`, so an RGB image shows its hue,
 *  saturation and brightness in its red, green and blue, and back again. */
export function hsbHslImage(img: ImageData, input: string, output: string): ImageData {
  const out = copyImage(img);
  if (input === output) return out;
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i] / 255, b = d[i + 1] / 255, c = d[i + 2] / 255;
    const rgb = input === 'rgb' ? [a, b, c] : toRgb(a, b, c, input);
    const res = output === 'rgb' ? rgb : fromRgb(rgb[0], rgb[1], rgb[2], output);
    d[i] = res[0] * 255; d[i + 1] = res[1] * 255; d[i + 2] = res[2] * 255;
  }
  return out;
}

const MODES: ReadonlyArray<readonly [string, string]> = [['rgb', 'RGB'], ['hsb', 'HSB'], ['hsl', 'HSL']];
const IDENTITY = Array.from({ length: 25 }, (_, i) => (i === 12 ? 1 : 0));

export const OTHER_FILTERS: LibFilter[] = [
  {
    id: 'custom', label: 'Custom', group: 'Other', grows: false,
    params: [
      { key: 'kernel', label: 'Kernel', kind: 'matrix', size: 5, min: -999, max: 999, def: IDENTITY },
      { key: 'scale', label: 'Scale', kind: 'range', min: 1, max: 100, step: 1, def: 1, limit: 9999 },
      { key: 'offset', label: 'Offset', kind: 'range', min: -255, max: 255, step: 1, def: 0, limit: 9999 },
    ],
    reach: () => 3,
    run: (src, v) => customImage(src, v.kernel as number[], num(v, 'scale'), num(v, 'offset')),
  },
  {
    id: 'hsbHsl', label: 'HSB/HSL', group: 'Other', grows: false,
    params: [
      { key: 'input', label: 'Input Mode', kind: 'select', def: 'rgb', options: MODES },
      { key: 'output', label: 'Row Order', kind: 'select', def: 'hsb', options: MODES },
    ],
    reach: () => 0,
    run: (src, v) => hsbHslImage(src, str(v, 'input'), str(v, 'output')),
  },
  {
    id: 'highPass', label: 'High Pass', group: 'Other', grows: false,
    params: [{ key: 'radius', label: 'Radius (px)', kind: 'range', min: 0.1, max: 250, step: 0.1, def: 10, limit: 1000 }],
    reach: (v, scale) => gaussianMargin(num(v, 'radius') * scale),
    run: (src, v, ctx) => highPassImage(src, num(v, 'radius') * ctx.scale),
  },
  {
    id: 'tonalContrast', label: 'Tonal Contrast', group: 'Other', grows: false,
    params: [
      { key: 'shadows', label: 'Shadows Contrast (%)', kind: 'range', min: -100, max: 100, step: 1, def: 40 },
      { key: 'midtones', label: 'Midtones Contrast (%)', kind: 'range', min: -100, max: 100, step: 1, def: 40 },
      { key: 'highlights', label: 'Highlights Contrast (%)', kind: 'range', min: -100, max: 100, step: 1, def: 40 },
      { key: 'radius', label: 'Radius (px)', kind: 'range', min: 1, max: 250, step: 1, def: 20, limit: 1000 },
    ],
    reach: (v, scale) => gaussianMargin(Math.max(0.5, num(v, 'radius') * scale)),
    run: (src, v, ctx) => tonalContrastImage(src, num(v, 'radius') * ctx.scale, num(v, 'shadows'), num(v, 'midtones'), num(v, 'highlights')),
  },
  {
    id: 'maximum', label: 'Maximum', group: 'Other', grows: true,
    params: [
      { key: 'radius', label: 'Radius (px)', kind: 'range', min: 0.2, max: 100, step: 0.1, def: 1, limit: 500 },
      { key: 'preserve', label: 'Preserve', kind: 'select', def: 'squareness', options: [['squareness', 'Squareness'], ['roundness', 'Roundness']] },
    ],
    reach: (v, scale) => Math.ceil(num(v, 'radius') * scale) + 1,
    run: (src, v, ctx) => minMaxImage(src, num(v, 'radius') * ctx.scale, true, str(v, 'preserve') === 'roundness'),
  },
  {
    id: 'minimum', label: 'Minimum', group: 'Other', grows: false,
    params: [
      { key: 'radius', label: 'Radius (px)', kind: 'range', min: 0.2, max: 100, step: 0.1, def: 1, limit: 500 },
      { key: 'preserve', label: 'Preserve', kind: 'select', def: 'squareness', options: [['squareness', 'Squareness'], ['roundness', 'Roundness']] },
    ],
    reach: (v, scale) => Math.ceil(num(v, 'radius') * scale) + 1,
    run: (src, v, ctx) => minMaxImage(src, num(v, 'radius') * ctx.scale, false, str(v, 'preserve') === 'roundness'),
  },
  {
    id: 'offset', label: 'Offset', group: 'Other', grows: false,
    params: [
      { key: 'horizontal', label: 'Horizontal (px right)', kind: 'range', min: -2000, max: 2000, step: 1, def: 0, limit: 30000 },
      { key: 'vertical', label: 'Vertical (px down)', kind: 'range', min: -2000, max: 2000, step: 1, def: 0, limit: 30000 },
      { key: 'undefinedAreas', label: 'Undefined Areas', kind: 'select', def: 'transparent', options: [['transparent', 'Set to Transparent'], ['repeat', 'Repeat Edge Pixels'], ['wrap', 'Wrap Around']] },
    ],
    reach: null,
    run: (src, v, ctx) => offsetImage(src, num(v, 'horizontal') * ctx.scale, num(v, 'vertical') * ctx.scale, str(v, 'undefinedAreas'), boxOf(ctx.area)),
  },
];
