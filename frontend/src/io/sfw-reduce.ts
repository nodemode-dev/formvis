import { palette } from './gif';

/** Save for Web colour reduction for GIF and PNG-8: a palette kind, a dither kind with an amount, and a matte, applied to
 *  the pixels before the indexed encoder sees them (which then finds a palette of at most that many exact colours).
 *  No DOM. */
export type PaletteKind = 'adaptive' | 'web' | 'grayscale' | 'uniform' | 'blackwhite';
export type DitherKind = 'none' | 'diffusion' | 'pattern' | 'noise';
export const PALETTES: ReadonlyArray<readonly [PaletteKind, string]> = [['adaptive', 'Adaptive'], ['web', 'Web (216 colors)'], ['uniform', 'Uniform'], ['grayscale', 'Grayscale'], ['blackwhite', 'Black and White']];
export const DITHERS: ReadonlyArray<readonly [DitherKind, string]> = [['none', 'No Dither'], ['diffusion', 'Diffusion'], ['pattern', 'Pattern'], ['noise', 'Noise']];

export interface ReduceOptions { palette: PaletteKind; colors: number; dither: DitherKind; amount: number; transparency: boolean; matte: [number, number, number] }

const BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];

/** A matte as the [r, g, b] a '#rrggbb' string holds, white when it is not one. */
export function matteOf(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [255, 255, 255];
  const v = parseInt(m[1]!, 16);
  return [v >> 16, (v >> 8) & 255, v & 255];
}

function fixedPalette(kind: PaletteKind, colors: number): number[][] {
  if (kind === 'blackwhite') return [[0, 0, 0], [255, 255, 255]];
  if (kind === 'grayscale') { const n = Math.max(2, colors); return Array.from({ length: n }, (_, i) => { const g = Math.round((255 * i) / (n - 1)); return [g, g, g]; }); }
  const n = kind === 'web' ? 6 : Math.max(2, Math.min(6, Math.floor(Math.cbrt(colors)))), out: number[][] = [];
  const step = (i: number): number => Math.round((255 * i) / (n - 1));
  for (let r = 0; r < n; r++) for (let g = 0; g < n; g++) for (let b = 0; b < n; b++) out.push([step(r), step(g), step(b)]);
  return out;
}

/** The palette entry nearest to a colour, memoised on its 15-bit key. */
function nearestIn(colors: number[][]): (r: number, g: number, b: number) => number {
  const memo = new Int16Array(32768).fill(-1);
  return (r, g, b) => {
    const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    if (memo[k]! < 0) {
      let best = 0, bd = Infinity;
      colors.forEach((c, i) => { const d = (c[0]! - r) ** 2 + (c[1]! - g) ** 2 + (c[2]! - b) ** 2; if (d < bd) { bd = d; best = i; } });
      memo[k] = best;
    }
    return memo[k]!;
  };
}

/** The picture reduced to at most `o.colors` colours (less one when it keeps see-through pixels, which stay at alpha 0),
 *  and how many colours it really uses. `data` is RGBA and is not changed. */
export function reduceColours(data: Uint8ClampedArray, width: number, height: number, o: ReduceOptions): { data: Uint8ClampedArray; used: number } {
  const px = new Uint8ClampedArray(data);
  let clear = false;
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3]!;
    if (o.transparency) { if (a < 128) clear = true; else px[i + 3] = 255; continue; }
    if (a < 255) for (let c = 0; c < 3; c++) px[i + c] = Math.round((px[i + c]! * a + o.matte[c]! * (255 - a)) / 255);
    px[i + 3] = 255;
  }
  const max = Math.max(2, Math.min(256, Math.round(o.colors))) - (clear ? 1 : 0);
  let colors: number[][];
  if (o.palette === 'adaptive') colors = palette(px, Math.max(1, max)).colors;
  else {
    const fixed = fixedPalette(o.palette, max), at = nearestIn(fixed), use = new Float64Array(fixed.length);
    for (let i = 0; i < px.length; i += 4) if (px[i + 3]! >= 128) use[at(px[i]!, px[i + 1]!, px[i + 2]!)]! += 1;
    const order = fixed.map((_, i) => i).sort((a, b) => use[b]! - use[a]!).slice(0, Math.max(1, max)).filter((i) => use[i]! > 0);
    colors = order.length ? order.map((i) => fixed[i]!) : [fixed[0]!];
  }
  const near = nearestIn(colors), amount = Math.max(0, Math.min(100, o.amount)) / 100, used = new Uint8Array(colors.length);
  const dither = o.dither !== 'none' && colors.length > 1 && amount > 0;
  let cur = new Float32Array((width + 2) * 3), next = new Float32Array((width + 2) * 3);
  for (let y = 0; y < height; y++) {
    next.fill(0);
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      if (px[p + 3]! < 128) { px[p + 3] = 0; continue; }
      let r = px[p]!, g = px[p + 1]!, b = px[p + 2]!;
      if (dither && o.dither === 'diffusion') { r += cur[(x + 1) * 3]!; g += cur[(x + 1) * 3 + 1]!; b += cur[(x + 1) * 3 + 2]!; }
      else if (dither) {
        const t = o.dither === 'pattern' ? BAYER[(y & 7) * 8 + (x & 7)]! / 64 - 0.5 : ((Math.imul(x * 73856093 ^ y * 19349663, 2654435761) >>> 8) & 1023) / 1023 - 0.5;
        const s = t * 96 * amount;
        r += s; g += s; b += s;
      }
      const ar = Math.max(0, Math.min(255, Math.round(r))), ag = Math.max(0, Math.min(255, Math.round(g))), ab = Math.max(0, Math.min(255, Math.round(b)));
      const k = near(ar, ag, ab), c = colors[k]!;
      used[k] = 1;
      px[p] = c[0]!; px[p + 1] = c[1]!; px[p + 2] = c[2]!;
      if (dither && o.dither === 'diffusion') {
        for (let ch = 0; ch < 3; ch++) {
          const e = ([ar, ag, ab][ch]! - c[ch]!) * amount;
          cur[(x + 2) * 3 + ch] = cur[(x + 2) * 3 + ch]! + (e * 7) / 16;
          next[x * 3 + ch] = next[x * 3 + ch]! + (e * 3) / 16;
          next[(x + 1) * 3 + ch] = next[(x + 1) * 3 + ch]! + (e * 5) / 16;
          next[(x + 2) * 3 + ch] = next[(x + 2) * 3 + ch]! + e / 16;
        }
      }
    }
    [cur, next] = [next, cur];
  }
  return { data: px, used: used.reduce((n, v) => n + v, 0) };
}
