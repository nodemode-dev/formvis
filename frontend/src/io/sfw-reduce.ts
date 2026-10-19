import { palette } from './gif';

/** Save for Web colour reduction for GIF and PNG-8: a palette kind, a dither kind with an amount, and a matte, applied to
 *  the pixels before the indexed encoder sees them (which then finds a palette of at most that many exact colours).
 *  No DOM. */
export type PaletteKind = 'perceptual' | 'selective' | 'adaptive' | 'web' | 'grayscale' | 'uniform' | 'blackwhite';
export type DitherKind = 'none' | 'diffusion' | 'pattern' | 'noise';
export const PALETTES: ReadonlyArray<readonly [PaletteKind, string]> = [['perceptual', 'Perceptual'], ['selective', 'Selective'], ['adaptive', 'Adaptive'], ['web', 'Web (216 colors)'], ['uniform', 'Uniform'], ['grayscale', 'Grayscale'], ['blackwhite', 'Black and White']];
export const DITHERS: ReadonlyArray<readonly [DitherKind, string]> = [['none', 'No Dither'], ['diffusion', 'Diffusion'], ['pattern', 'Pattern'], ['noise', 'Noise']];

/** `snap` is Web Snap (0 to 100 percent: at 100 every colour moves to its nearest web colour); `locked` colours are always in
 *  the palette; `edits` maps a palette colour to the colour its pixels are written with. */
export interface ReduceOptions { palette: PaletteKind; colors: number; dither: DitherKind; amount: number; transparency: boolean; matte: [number, number, number]; snap?: number; locked?: readonly string[]; edits?: Readonly<Record<string, string>> }
/** One colour table entry: the palette colour (`from`), the colour written (`rgb`), the pixels using it. */
export interface TableEntry { from: string; rgb: [number, number, number]; count: number; locked: boolean }

const hexOf = (c: ArrayLike<number>): string => `#${[c[0]!, c[1]!, c[2]!].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const rgbOfHex = (h: string): [number, number, number] => { const m = /^#([0-9a-f]{6})$/i.exec(h), v = m ? parseInt(m[1]!, 16) : 0; return [v >> 16, (v >> 8) & 255, v & 255]; };

const LIN = Float32Array.from({ length: 256 }, (_, i) => { const v = i / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
/** CIE Lab (D65) of an sRGB colour. */
function labOf(r: number, g: number, b: number): [number, number, number] {
  const lr = LIN[r]!, lg = LIN[g]!, lb = LIN[b]!;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / 0.9505), y = f(0.2126 * lr + 0.7152 * lg + 0.0722 * lb), z = f((0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / 1.089);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** Moves each palette colour that lies within `tol` (largest channel difference) of a web-safe colour onto it; colours in
 *  `keep` stay, and colours that become equal merge. */
function snapWeb(colors: number[][], tol: number, keep: ReadonlySet<string>): number[][] {
  const seen = new Set<string>(), out: number[][] = [];
  for (const c of colors) {
    let n = c;
    if (!keep.has(hexOf(c))) {
      const w = c.map((v) => Math.round(v / 51) * 51);
      if (Math.max(...c.map((v, i) => Math.abs(v - w[i]!))) <= tol) n = w;
    }
    const k = hexOf(n);
    if (!seen.has(k)) { seen.add(k); out.push(n); }
  }
  return out;
}

/** Up to `max` colours picked for the eye: the median cut palette refined by k-means in Lab, each 15-bit bucket weighted by
 *  its pixel count to `power` (below 1 gives rare, distinct colours a share; 1 follows the area a colour covers). */
function labPalette(px: Uint8ClampedArray, max: number, power: number): number[][] {
  const seed = palette(px, max).colors;
  const count = new Float64Array(32768), sum = new Float64Array(32768 * 3), keys: number[] = [];
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3]! < 128) continue;
    const k = ((px[i]! >> 3) << 10) | ((px[i + 1]! >> 3) << 5) | (px[i + 2]! >> 3);
    if (count[k] === 0) keys.push(k);
    count[k]! += 1; sum[k * 3]! += px[i]!; sum[k * 3 + 1]! += px[i + 1]!; sum[k * 3 + 2]! += px[i + 2]!;
  }
  if (keys.length <= max || seed.length < 2) return seed;
  const pts = keys.map((k) => { const n = count[k]!, r = Math.round(sum[k * 3]! / n), g = Math.round(sum[k * 3 + 1]! / n), b = Math.round(sum[k * 3 + 2]! / n); return { rgb: [r, g, b], lab: labOf(r, g, b), w: n ** power }; });
  let cen = seed.map((c) => ({ rgb: c, lab: labOf(c[0]!, c[1]!, c[2]!) }));
  for (let it = 0; it < 4; it++) {
    const acc = cen.map(() => ({ w: 0, r: 0, g: 0, b: 0 }));
    for (const p of pts) {
      let best = 0, bd = Infinity;
      for (let j = 0; j < cen.length; j++) { const l = cen[j]!.lab, d = (l[0]! - p.lab[0]!) ** 2 + (l[1]! - p.lab[1]!) ** 2 + (l[2]! - p.lab[2]!) ** 2; if (d < bd) { bd = d; best = j; } }
      const a = acc[best]!;
      a.w += p.w; a.r += p.rgb[0]! * p.w; a.g += p.rgb[1]! * p.w; a.b += p.rgb[2]! * p.w;
    }
    cen = cen.map((c, j) => { const a = acc[j]!; if (a.w <= 0) return c; const rgb = [Math.round(a.r / a.w), Math.round(a.g / a.w), Math.round(a.b / a.w)]; return { rgb, lab: labOf(rgb[0]!, rgb[1]!, rgb[2]!) }; });
  }
  const seen = new Set<string>();
  return cen.map((c) => c.rgb).filter((c) => { const k = hexOf(c); if (seen.has(k)) return false; seen.add(k); return true; });
}

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
function nearestIn(colors: number[][], lab = false): (r: number, g: number, b: number) => number {
  const memo = new Int16Array(32768).fill(-1), labs = lab ? colors.map((c) => labOf(c[0]!, c[1]!, c[2]!)) : [];
  return (r, g, b) => {
    const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    if (memo[k]! < 0) {
      let best = 0, bd = Infinity;
      if (lab) { const l = labOf(r, g, b); labs.forEach((c, i) => { const d = (c[0] - l[0]) ** 2 + (c[1] - l[1]) ** 2 + (c[2] - l[2]) ** 2; if (d < bd) { bd = d; best = i; } }); memo[k] = best; return best; }
      colors.forEach((c, i) => { const d = (c[0]! - r) ** 2 + (c[1]! - g) ** 2 + (c[2]! - b) ** 2; if (d < bd) { bd = d; best = i; } });
      memo[k] = best;
    }
    return memo[k]!;
  };
}

/** The picture reduced to at most `o.colors` colours (less one when it keeps see-through pixels, which stay at alpha 0),
 *  and how many colours it really uses. `data` is RGBA and is not changed. */
export function reduceColours(data: Uint8ClampedArray, width: number, height: number, o: ReduceOptions): { data: Uint8ClampedArray; used: number; table: TableEntry[] } {
  const px = new Uint8ClampedArray(data);
  let clear = false;
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3]!;
    if (o.transparency) { if (a < 128) clear = true; else px[i + 3] = 255; continue; }
    if (a < 255) for (let c = 0; c < 3; c++) px[i + c] = Math.round((px[i + c]! * a + o.matte[c]! * (255 - a)) / 255);
    px[i + 3] = 255;
  }
  const max = Math.max(2, Math.min(256, Math.round(o.colors))) - (clear ? 1 : 0);
  const locked = [...new Set((o.locked ?? []).filter((h) => /^#[0-9a-f]{6}$/i.test(h)).map((h) => h.toLowerCase()))].slice(0, Math.max(0, max - 1));
  const free = Math.max(1, max - locked.length), lab = o.palette === 'perceptual' || o.palette === 'selective', fixedKind = o.palette === 'web' || o.palette === 'blackwhite' || o.palette === 'grayscale';
  let colors: number[][];
  if (o.palette === 'adaptive') colors = palette(px, free).colors;
  else if (lab) colors = labPalette(px, free, o.palette === 'selective' ? 1 : 0.75);
  else {
    const fixed = fixedPalette(o.palette, max), at = nearestIn(fixed), use = new Float64Array(fixed.length);
    for (let i = 0; i < px.length; i += 4) if (px[i + 3]! >= 128) use[at(px[i]!, px[i + 1]!, px[i + 2]!)]! += 1;
    const order = fixed.map((_, i) => i).sort((a, b) => use[b]! - use[a]!).slice(0, free).filter((i) => use[i]! > 0);
    colors = order.length ? order.map((i) => fixed[i]!) : [fixed[0]!];
  }
  const keep = new Set(locked), snap = o.palette === 'selective' ? Math.max(o.snap ?? 0, 30) : o.snap ?? 0;
  if (!fixedKind && snap > 0) colors = snapWeb(colors, (snap / 100) * 25.5, keep);
  colors = colors.filter((c) => !keep.has(hexOf(c)));
  for (const h of locked) colors.push(rgbOfHex(h));
  colors = colors.slice(0, max);
  const out = colors.map((c) => { const e = o.edits?.[hexOf(c)]; return e && /^#[0-9a-f]{6}$/i.test(e) ? rgbOfHex(e) : c; });
  const near = nearestIn(colors, lab), amount = Math.max(0, Math.min(100, o.amount)) / 100, used = new Uint8Array(colors.length), tally = new Float64Array(colors.length);
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
      const k = near(ar, ag, ab), c = colors[k]!, w = out[k]!;
      used[k] = 1; tally[k]! += 1;
      px[p] = w[0]!; px[p + 1] = w[1]!; px[p + 2] = w[2]!;
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
  const table = colors.flatMap((c, k) => (tally[k]! > 0 || keep.has(hexOf(c)) ? [{ from: hexOf(c), rgb: out[k]! as [number, number, number], count: tally[k]!, locked: keep.has(hexOf(c)) }] : []));
  return { data: px, used: used.reduce((n, v) => n + v, 0), table };
}
