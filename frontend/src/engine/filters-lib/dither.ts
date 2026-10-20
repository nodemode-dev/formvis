import type { LibColor, LibFilter, LibImage, LibValues } from '../filter-library';
import { decodeMap } from './distort';
import { boxOf, copyImage, luma } from './shared';
import { wasmDither } from '../wasm-kernels';

const num = (v: LibValues, k: string): number => v[k] as number;
const str = (v: LibValues, k: string): string => v[k] as string;

/** Ordered Bayer threshold matrix of side n (a power of two), values in 0..n*n-1. */
function bayer(n: number): number[] {
  let m = [0];
  for (let s = 1; s < n; s *= 2) {
    const next = new Array<number>(s * s * 4);
    for (let y = 0; y < s * 2; y++) for (let x = 0; x < s * 2; x++) {
      const base = m[(y % s) * s + (x % s)] * 4, q = (y < s ? 0 : 2) + (x < s ? 0 : 1);
      next[y * s * 2 + x] = base + [0, 2, 3, 1][q];
    }
    m = next;
  }
  return m;
}

/** Clustered 8 by 8 matrix: thresholds grow outward from the cell centre, so grey becomes growing round dots. */
function clustered(n: number): number[] {
  const cells = Array.from({ length: n * n }, (_, i) => {
    const x = (i % n) + 0.5 - n / 2, y = Math.floor(i / n) + 0.5 - n / 2;
    return { i, d: x * x + y * y + (x > 0 ? 0.01 : 0) + (y > 0 ? 0.001 : 0) };
  }).sort((a, b) => a.d - b.d);
  const m = new Array<number>(n * n);
  cells.forEach((c, rank) => { m[c.i] = rank; });
  return m;
}

export const MATRICES: Record<string, { n: number; m: number[] }> = {
  bayer2: { n: 2, m: bayer(2) }, bayer4: { n: 4, m: bayer(4) }, bayer8: { n: 8, m: bayer(8) }, macPatterns: { n: 8, m: clustered(8) },
};

/** Dither: each channel (or the grey, in Black and White) cut to `levels` steps; the step a value lands in is chosen
 *  by an ordered threshold matrix repeating every `pixel` pixels from the canvas corner (ox, oy). Alpha kept. */
export function ditherImage(img: ImageData, pattern: string, levels: number, pixel: number, colour: boolean, amount: number, ink: LibColor, paper: LibColor, ox: number, oy: number): ImageData {
  const { n, m } = MATRICES[pattern] ?? MATRICES.bayer4, q = Math.max(1, Math.round(levels) - 1), px = Math.max(1, Math.round(pixel));
  const out = copyImage(img), d = out.data, w = img.width, a = Math.max(0, Math.min(1, amount / 100));
  if (wasmDither(d, w, m, n, q, px, colour, a, ink, paper, ox, oy)) return out;
  const cut = (v: number, t: number): number => {
    const s = (v / 255) * q, lo = Math.floor(s), frac = s - lo;
    const hard = (frac > t ? lo + 1 : lo) / q, soft = s / q;
    return soft + (hard - soft) * a;
  };
  for (let i = 0; i < d.length; i += 4) {
    const p = i / 4, x = (p % w) + ox, y = Math.floor(p / w) + oy;
    const t = (m[(((Math.floor(y / px) % n) + n) % n) * n + (((Math.floor(x / px) % n) + n) % n)] + 0.5) / (n * n);
    if (colour) { for (let c = 0; c < 3; c++) d[i + c] = cut(d[i + c], t) * 255; continue; }
    const k = cut(luma(d[i], d[i + 1], d[i + 2]), t);
    for (let c = 0; c < 3; c++) d[i + c] = ink[c] + (paper[c] - ink[c]) * k;
  }
  return out;
}

export const KERNELS: Record<string, { div: number; taps: ReadonlyArray<readonly [number, number, number]> }> = {
  floyd: { div: 16, taps: [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]] },
  atkinson: { div: 8, taps: [[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]] },
  sierraLite: { div: 4, taps: [[1, 0, 2], [-1, 1, 1], [0, 1, 1]] },
  jarvis: { div: 48, taps: [[1, 0, 7], [2, 0, 5], [-2, 1, 3], [-1, 1, 5], [0, 1, 7], [1, 1, 5], [2, 1, 3], [-2, 2, 1], [-1, 2, 3], [0, 2, 5], [1, 2, 3], [2, 2, 1]] },
};

/** Error diffusion: the picture cut into cells of `pixel` pixels, each cell's value rounded to one of `levels` steps and
 *  its rounding error spread to the cells after it by the chosen kernel, `diffusion` percent of it. Transparent cells
 *  take no error. Black and White works on the grey, Colour on each channel. Alpha kept. */
export function diffuseImage(img: ImageData, kernel: string, levels: number, pixel: number, colour: boolean, diffusion: number, ink: LibColor, paper: LibColor): ImageData {
  const out = copyImage(img), d = out.data, w = img.width, h = img.height, px = Math.max(1, Math.round(pixel)), k = KERNELS[kernel] ?? KERNELS.floyd;
  const gw = Math.ceil(w / px), gh = Math.ceil(h / px), ch = colour ? 3 : 1, q = Math.max(1, Math.round(levels) - 1), f = Math.max(0, Math.min(1, diffusion / 100));
  const plane = new Float32Array(gw * gh * ch), seen = new Uint32Array(gw * gh);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (d[i + 3] === 0) continue;
    const g = Math.floor(y / px) * gw + Math.floor(x / px);
    seen[g]++;
    if (colour) for (let c = 0; c < 3; c++) plane[g * 3 + c] += d[i + c] / 255;
    else plane[g] += luma(d[i], d[i + 1], d[i + 2]) / 255;
  }
  for (let g = 0; g < gw * gh; g++) if (seen[g]) for (let c = 0; c < ch; c++) plane[g * ch + c] /= seen[g];
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const g = gy * gw + gx;
    if (!seen[g]) continue;
    for (let c = 0; c < ch; c++) {
      const old = Math.max(0, Math.min(1, plane[g * ch + c])), now = Math.round(old * q) / q, err = (plane[g * ch + c] - now) * f;
      plane[g * ch + c] = now;
      for (const [dx, dy, wt] of k.taps) {
        const nx = gx + dx, ny = gy + dy;
        if (nx < 0 || nx >= gw || ny >= gh || !seen[ny * gw + nx]) continue;
        plane[(ny * gw + nx) * ch + c] += (err * wt) / k.div;
      }
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (d[i + 3] === 0) continue;
    const g = Math.floor(y / px) * gw + Math.floor(x / px);
    for (let c = 0; c < 3; c++) d[i + c] = colour ? plane[g * 3 + c] * 255 : ink[c] + (paper[c] - ink[c]) * plane[g];
  }
  return out;
}

/** Halftone screen: dots, diamonds or lines on a grid of `cell` pixels turned by `angle` degrees about the canvas
 *  corner; a value lands in a step by where it sits against the spot function, so dark areas grow bigger marks. */
export function screenImage(img: ImageData, shape: string, levels: number, cell: number, angle: number, colour: boolean, amount: number, ink: LibColor, paper: LibColor, ox: number, oy: number): ImageData {
  const out = copyImage(img), d = out.data, w = img.width, q = Math.max(1, Math.round(levels) - 1), c0 = Math.max(2, cell), a = Math.max(0, Math.min(1, amount / 100));
  const rad = (angle * Math.PI) / 180, ca = Math.cos(rad), sa = Math.sin(rad), soft = Math.min(0.5, 1.5 / c0);
  const cut = (v: number, t: number): number => {
    const s = (v / 255) * q, lo = Math.floor(s), e = Math.max(0, Math.min(1, (s - lo - (soft / 2 + t * (1 - soft))) / soft + 0.5));
    return (s + (lo + e - s) * a) / q;
  };
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const p = i / 4, x = (p % w) + ox + 0.5, y = Math.floor(p / w) + oy + 0.5;
    const u = (x * ca + y * sa) / c0, v = (y * ca - x * sa) / c0, fu = u - Math.floor(u) - 0.5, fv = v - Math.floor(v) - 0.5;
    const dm = Math.abs(fu) + Math.abs(fv), rr = fu * fu + fv * fv;
    const t = Math.max(0, Math.min(1, shape === 'halftoneLine' ? 1 - 2 * Math.abs(fu) : shape === 'halftoneDiamond' ? (dm <= 0.5 ? 1 - 2 * dm * dm : 2 * (1 - dm) * (1 - dm)) : 1 - Math.PI * rr));
    if (colour) { for (let c = 0; c < 3; c++) d[i + c] = cut(d[i + c], t) * 255; continue; }
    const k = cut(luma(d[i], d[i + 1], d[i + 2]), t);
    for (let c = 0; c < 3; c++) d[i + c] = ink[c] + (paper[c] - ink[c]) * k;
  }
  return out;
}

const GLYPHS: string[] = [
  '.....|.....|.....|.....|.....|.....|.....',
  '.....|.....|.....|.....|.....|..#..|.....',
  '.....|.....|..#..|.....|..#..|.....|.....',
  '.....|.....|.....|.###.|.....|.....|.....',
  '.....|..#..|..#..|#####|..#..|..#..|.....',
  '.....|.#.#.|..#..|#####|..#..|.#.#.|.....',
  '.....|.#.#.|#####|.#.#.|#####|.#.#.|.....',
  '.....|#####|#####|##.##|#####|#####|.....',
];

/** ASCII: the image cut into character cells of 6 by 8 blocks (a block is `pixel` pixels); each cell shows one of eight
 *  glyphs, denser the darker the cell's mean, in the ink colour on the paper colour (or in the cell's own colour). */
export function asciiImage(img: ImageData, pixel: number, colour: boolean, ink: LibColor, paper: LibColor, ox: number, oy: number): ImageData {
  const { width: w, height: h } = img, s = img.data, out = copyImage(img), d = out.data, px = Math.max(1, Math.round(pixel));
  const cw = 6 * px, ch = 8 * px, bitmaps = GLYPHS.map((g) => g.split('|').map((r) => r.split('').map((c) => c === '#')));
  const cx0 = ((((-ox) % cw) + cw) % cw) - cw, cy0 = ((((-oy) % ch) + ch) % ch) - ch;
  for (let cy = cy0; cy < h; cy += ch) for (let cx = cx0; cx < w; cx += cw) {
    const x0 = Math.max(0, cx), y0 = Math.max(0, cy), x1 = Math.min(w, cx + cw), y1 = Math.min(h, cy + ch);
    if (x1 <= x0 || y1 <= y0) continue;
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * 4; if (s[i + 3] === 0) continue; r += s[i]; g += s[i + 1]; b += s[i + 2]; n++; }
    if (!n) continue;
    r /= n; g /= n; b /= n;
    const dark = 1 - luma(r, g, b) / 255, glyph = bitmaps[Math.min(7, Math.floor(dark * 8))];
    const inkRgb = colour ? [r, g, b] : ink;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      if (s[i + 3] === 0) continue;
      const gx = Math.floor((x - cx) / px), gy = Math.floor((y - cy) / px);
      const on = gy >= 1 && gy <= 7 && gx >= 0 && gx <= 4 ? glyph[gy - 1][gx] : false;
      const c = on ? inkRgb : paper;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
    }
  }
  return out;
}

/** Scanlines: dark lines every `spacing` pixels, each `thickness` percent of the spacing wide, darkening by `darkness`
 *  percent, running across (horizontal) or down (vertical) from the canvas corner. Alpha kept. */
export function scanlinesImage(img: ImageData, spacing: number, thickness: number, darkness: number, vertical: boolean, ox: number, oy: number): ImageData {
  const out = copyImage(img), d = out.data, w = img.width, sp = Math.max(2, spacing), on = Math.max(1, Math.round((sp * thickness) / 100)), keep = 1 - Math.max(0, Math.min(100, darkness)) / 100;
  for (let i = 0; i < d.length; i += 4) {
    const p = i / 4, pos = vertical ? (p % w) + ox : Math.floor(p / w) + oy;
    if ((((pos % sp) + sp) % sp) >= on) continue;
    d[i] *= keep; d[i + 1] *= keep; d[i + 2] *= keep;
  }
  return out;
}

export const hexRgb = (hex: string): LibColor => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Color to Alpha: the chosen colour removed from the picture. Each pixel gets the least alpha that lets the colour
 *  show through it, and its own colour is what remains once that colour is taken away; pixels within `tolerance`
 *  percent of the colour go fully clear. */
export function colorToAlphaImage(img: ImageData, key: LibColor, tolerance: number): ImageData {
  const out = copyImage(img), d = out.data, tol = Math.max(0, Math.min(99, tolerance)) / 100;
  for (let i = 0; i < d.length; i += 4) {
    let a = 0;
    for (let c = 0; c < 3; c++) {
      const v = d[i + c], k = key[c];
      const e = v > k ? (v - k) / (255 - k || 1) : v < k ? (k - v) / (k || 1) : 0;
      if (e > a) a = e;
    }
    a = Math.max(0, (a - tol) / (1 - tol));
    if (a <= 0) { d[i + 3] = 0; continue; }
    for (let c = 0; c < 3; c++) d[i + c] = key[c] + (d[i + c] - key[c]) / a;
    d[i + 3] = d[i + 3] * Math.min(1, a);
  }
  return out;
}

/** Grain plate: a scanned grain picture (its red level) tiled over the image from the canvas corner at `size` percent;
 *  its offset from mid grey added to each channel, `amount` percent strong, strongest in the midtones. Alpha kept. */
export function grainPlateImage(img: ImageData, plate: LibImage | null, amount: number, size: number, ox: number, oy: number): ImageData {
  const out = copyImage(img), rg = plate ? decodeMap(plate) : null;
  if (!plate || !rg) return out;
  const d = out.data, w = img.width, pw = Math.max(1, Math.round((plate.w * size) / 100)), ph = Math.max(1, Math.round((plate.h * size) / 100)), k = amount / 100;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const p = i / 4, x = (p % w) + ox, y = Math.floor(p / w) + oy;
    const sx = Math.floor((((x % pw) + pw) % pw) * (plate.w / pw)), sy = Math.floor((((y % ph) + ph) % ph) * (plate.h / ph));
    const g = (rg[(sy * plate.w + sx) * 2] - 128) / 128, l = luma(d[i], d[i + 1], d[i + 2]) / 255, wgt = 1 - 0.6 * (2 * l - 1) * (2 * l - 1);
    for (let c = 0; c < 3; c++) d[i + c] += g * k * 128 * wgt;
  }
  return out;
}

/** Haze by depth: each pixel pulled toward the haze colour by its distance. Distance is a depth picture's red level
 *  (white far) stretched over the frame, or, with none, grows from the bottom of the frame to its top (a horizon view).
 *  Nothing nearer than `start` percent is touched; `density` percent is the haze at the farthest. Alpha kept. */
export function hazeImage(img: ImageData, depth: LibImage | null, invert: boolean, haze: LibColor, density: number, start: number, area: { x0: number; y0: number; x1: number; y1: number }): ImageData {
  const out = copyImage(img), d = out.data, w = img.width, rg = depth ? decodeMap(depth) : null, fw = Math.max(1, area.x1 - area.x0), fh = Math.max(1, area.y1 - area.y0);
  const s0 = Math.min(0.99, start / 100), k = density / 100;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const p = i / 4, x = p % w, y = Math.floor(p / w);
    let far: number;
    if (depth && rg) {
      const sx = Math.min(depth.w - 1, Math.max(0, Math.floor(((x - area.x0) / fw) * depth.w))), sy = Math.min(depth.h - 1, Math.max(0, Math.floor(((y - area.y0) / fh) * depth.h)));
      far = rg[(sy * depth.w + sx) * 2] / 255;
    } else far = 1 - Math.min(1, Math.max(0, (y - area.y0) / fh));
    if (invert) far = 1 - far;
    const t = Math.max(0, (far - s0) / (1 - s0)) * k;
    if (t <= 0) continue;
    for (let c = 0; c < 3; c++) d[i + c] += (haze[c] - d[i + c]) * t;
  }
  return out;
}

const PATTERNS: ReadonlyArray<readonly [string, string]> = [
  ['bayer2', 'Bayer 2 by 2'], ['bayer4', 'Bayer 4 by 4'], ['bayer8', 'Bayer 8 by 8'], ['macPatterns', 'Mac Patterns'], ['ascii', 'ASCII'],
  ['floyd', 'Floyd-Steinberg'], ['atkinson', 'Atkinson'], ['sierraLite', 'Sierra Lite'], ['jarvis', 'Jarvis'],
  ['halftoneDot', 'Halftone Dots'], ['halftoneDiamond', 'Halftone Diamonds'], ['halftoneLine', 'Halftone Lines'],
];

export const DITHER_FILTERS: LibFilter[] = [
  {
    id: 'dither', label: 'Dither', group: 'Pixelate', grows: false,
    note: 'Ink is the foreground colour and paper the background colour in Black and White. Diffusion applies to the error diffusion patterns; Cell Size and Screen Angle to the halftone screens.',
    params: [
      { key: 'pattern', label: 'Pattern', kind: 'select', def: 'bayer4', options: PATTERNS },
      { key: 'mode', label: 'Colors', kind: 'select', def: 'bw', options: [['bw', 'Black and White'], ['colour', 'Colour']] },
      { key: 'levels', label: 'Tones (levels per channel)', kind: 'range', min: 2, max: 16, step: 1, def: 2 },
      { key: 'pixel', label: 'Pixel Size', kind: 'range', min: 1, max: 16, step: 1, def: 1, limit: 64 },
      { key: 'amount', label: 'Strength', kind: 'range', min: 0, max: 100, step: 1, def: 100 },
      { key: 'diffusion', label: 'Diffusion (%)', kind: 'range', min: 0, max: 100, step: 1, def: 100 },
      { key: 'cell', label: 'Cell Size', kind: 'range', min: 4, max: 64, step: 1, def: 8 },
      { key: 'angle', label: 'Screen Angle (°)', kind: 'range', min: 0, max: 179, step: 1, def: 45 },
    ],
    reach: (v, scale) => (str(v, 'pattern') === 'ascii' ? Math.ceil(8 * num(v, 'pixel') * scale) + 1 : KERNELS[str(v, 'pattern')] ? null : 0),
    run: (src, v, ctx) => {
      const px = num(v, 'pixel') * ctx.scale, colour = str(v, 'mode') === 'colour', ox = Math.round(ctx.canvas.x), oy = Math.round(ctx.canvas.y), pattern = str(v, 'pattern');
      if (pattern === 'ascii') return asciiImage(src, px, colour, ctx.fg, ctx.bg, -ox, -oy);
      if (KERNELS[pattern]) return diffuseImage(src, pattern, num(v, 'levels'), px, colour, num(v, 'diffusion'), ctx.fg, ctx.bg);
      if (pattern.startsWith('halftone')) return screenImage(src, pattern, num(v, 'levels'), num(v, 'cell') * ctx.scale, num(v, 'angle'), colour, num(v, 'amount'), ctx.fg, ctx.bg, -ox, -oy);
      return ditherImage(src, pattern, num(v, 'levels'), px, colour, num(v, 'amount'), ctx.fg, ctx.bg, -ox, -oy);
    },
  },
  {
    id: 'scanlines', label: 'Scanlines', group: 'Video', grows: false,
    params: [
      { key: 'direction', label: 'Direction', kind: 'select', def: 'horizontal', options: [['horizontal', 'Horizontal'], ['vertical', 'Vertical']] },
      { key: 'spacing', label: 'Spacing (px)', kind: 'range', min: 2, max: 40, step: 1, def: 4, limit: 400 },
      { key: 'thickness', label: 'Line Thickness (%)', kind: 'range', min: 5, max: 95, step: 1, def: 50 },
      { key: 'darkness', label: 'Darkness (%)', kind: 'range', min: 0, max: 100, step: 1, def: 40 },
    ],
    reach: () => 0,
    run: (src, v, ctx) => scanlinesImage(src, Math.max(2, Math.round(num(v, 'spacing') * ctx.scale)), num(v, 'thickness'), num(v, 'darkness'), str(v, 'direction') === 'vertical', -Math.round(ctx.canvas.x), -Math.round(ctx.canvas.y)),
  },
  {
    id: 'grainPlate', label: 'Grain Plate', group: 'Noise', grows: false,
    note: 'Choose a scanned grain picture; its grey levels are used.',
    params: [
      { key: 'plate', label: 'Grain Picture', kind: 'image', def: null },
      { key: 'amount', label: 'Amount (%)', kind: 'range', min: 0, max: 200, step: 1, def: 50 },
      { key: 'size', label: 'Size (%)', kind: 'range', min: 10, max: 400, step: 1, def: 100 },
    ],
    reach: () => 0,
    run: (src, v, ctx) => grainPlateImage(src, v.plate as LibImage | null, num(v, 'amount'), num(v, 'size') * ctx.scale, -Math.round(ctx.canvas.x), -Math.round(ctx.canvas.y)),
  },
  {
    id: 'haze', label: 'Haze by Depth', group: 'Render', grows: false,
    note: 'Without a depth picture the haze grows toward the top of the frame.',
    params: [
      { key: 'depth', label: 'Depth Picture (white is far)', kind: 'image', def: null },
      { key: 'invert', label: 'Invert Depth', kind: 'check', def: false },
      { key: 'colour', label: 'Haze Color', kind: 'color', def: '#c9d6e6' },
      { key: 'density', label: 'Density (%)', kind: 'range', min: 0, max: 100, step: 1, def: 60 },
      { key: 'start', label: 'Starts at (%)', kind: 'range', min: 0, max: 95, step: 1, def: 10 },
    ],
    reach: null,
    run: (src, v, ctx) => hazeImage(src, v.depth as LibImage | null, v.invert === true, hexRgb(str(v, 'colour')), num(v, 'density'), num(v, 'start'), boxOf(ctx.area)),
  },
  {
    id: 'colorToAlpha', label: 'Color to Alpha', group: 'Other', grows: false,
    params: [
      { key: 'colour', label: 'Color', kind: 'color', def: '#ffffff' },
      { key: 'tolerance', label: 'Tolerance (%)', kind: 'range', min: 0, max: 99, step: 1, def: 0 },
    ],
    reach: () => 0,
    run: (src, v) => colorToAlphaImage(src, hexRgb(str(v, 'colour')), num(v, 'tolerance')),
  },
];
