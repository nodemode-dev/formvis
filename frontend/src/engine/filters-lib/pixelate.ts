import type { LibColor, LibContext, LibFilter, LibValues } from '../filter-library';
import { boxOf, clampInt, clipBox, copyImage, hash01, type Box } from './shared';

const num = (v: LibValues, k: string): number => v[k] as number;
const str = (v: LibValues, k: string): string => v[k] as string;

/** A pixel's colour and alpha, edges clamped. */
function px(src: ImageData, x: number, y: number): [number, number, number, number] {
  const q = (clampInt(Math.floor(y), 0, src.height - 1) * src.width + clampInt(Math.floor(x), 0, src.width - 1)) * 4, s = src.data;
  return [s[q], s[q + 1], s[q + 2], s[q + 3]];
}

/** The site of grid cell (i, j) of side `cell` from origin (ox, oy): a point jittered within the middle of the cell. */
export const site = (i: number, j: number, cell: number, seed: number, ox: number, oy: number): [number, number] =>
  [ox + (i + 0.2 + 0.6 * hash01(i, j, 31, seed)) * cell, oy + (j + 0.2 + 0.6 * hash01(i, j, 37, seed)) * cell];

/** The radius, in half cells, of a round dot centred in a square cell that covers the share `m` of it: within the
 *  inscribed circle a circle's area, past it the circle less the four caps the cell's sides cut off, so a whole
 *  share reaches the corners. Tabulated once in 256 steps. */
const DOTS = ((): Float64Array => {
  const out = new Float64Array(257), cover = (p: number): number => (p <= 1 ? Math.PI * p * p : Math.PI * p * p - 4 * (p * p * Math.acos(1 / p) - Math.sqrt(p * p - 1))) / 4;
  for (let k = 0, p = 0; k <= 256; k++) { while (p < Math.SQRT2 && cover(p) < k / 256) p += 1e-4; out[k] = Math.min(Math.SQRT2, p); }
  return out;
})();
const dotRadius = (m: number): number => DOTS[Math.round(Math.min(1, Math.max(0, m)) * 256)];

/** Color Halftone: each channel screened at its own angle into dots on a grid of side twice the radius, a dot's area
 *  following the channel's mean over its cell (white makes the cell solid); the grids start at the frame's corner. */
export function colorHalftoneImage(src: ImageData, maxRadius: number, angles: readonly number[], area: Box): ImageData {
  const out = copyImage(src), b = clipBox(area, src.width, src.height);
  if (!b) return out;
  const R = Math.max(1, maxRadius), cell = 2 * R, d = out.data, w = src.width;
  for (let c = 0; c < 3; c++) {
    const t = (angles[c] * Math.PI) / 180, cs = Math.cos(t), sn = Math.sin(t), means = new Map<string, number>();
    const mean = (i: number, j: number): number => {
      const key = `${i},${j}`;
      let m = means.get(key);
      if (m === undefined) {
        m = 0;
        for (let a = 0; a < 4; a++) for (let e = 0; e < 4; e++) {
          const u = (i + (a + 0.5) / 4) * cell, v = (j + (e + 0.5) / 4) * cell;
          m += px(src, area.x0 + Math.floor(u * cs - v * sn), area.y0 + Math.floor(u * sn + v * cs))[c];
        }
        m /= 16 * 255;
        means.set(key, m);
      }
      return m;
    };
    for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) {
      const fx = x + 0.5 - area.x0, fy = y + 0.5 - area.y0, u = fx * cs + fy * sn, v = -fx * sn + fy * cs;
      const ci = Math.floor(u / cell), cj = Math.floor(v / cell);
      let cover = 0;
      for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
        const r = R * dotRadius(mean(i, j)), dist = Math.hypot(u - (i + 0.5) * cell, v - (j + 0.5) * cell);
        cover = Math.max(cover, Math.min(1, Math.max(0, r - dist + 0.5)));
      }
      d[(y * w + x) * 4 + c] = cover * 255;
    }
  }
  return out;
}

/** Crystallize: the frame cut into cells around jittered points, each cell the colour at its point. */
export function crystallizeImage(src: ImageData, cellSize: number, seed: number, area: Box): ImageData {
  const out = copyImage(src), b = clipBox(area, src.width, src.height);
  if (!b) return out;
  const cell = Math.max(2, cellSize), d = out.data, w = src.width;
  for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) {
    const ci = Math.floor((x - area.x0) / cell), cj = Math.floor((y - area.y0) / cell);
    let best = Infinity, bx = x, by = y;
    for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
      const [sx, sy] = site(i, j, cell, seed, area.x0, area.y0), dd = (sx - x - 0.5) ** 2 + (sy - y - 0.5) ** 2;
      if (dd < best) { best = dd; bx = sx; by = sy; }
    }
    const p = px(src, bx, by), o = (y * w + x) * 4;
    d[o] = p[0]; d[o + 1] = p[1]; d[o + 2] = p[2]; d[o + 3] = p[3];
  }
  return out;
}

/** Facet: each pixel takes the mean colour of the commonest colour family (16 levels a channel) around it, so areas of
 *  like colour settle into flat facets. */
export function facetImage(src: ImageData, radius: number): ImageData {
  const r = Math.max(1, Math.round(radius)), { width: w, height: h } = src, s = src.data, out = copyImage(src), d = out.data;
  const counts = new Map<number, [number, number, number, number, number]>();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    counts.clear();
    let top: [number, number, number, number, number] | null = null;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const q = (clampInt(y + dy, 0, h - 1) * w + clampInt(x + dx, 0, w - 1)) * 4, key = ((s[q] >> 4) << 8) | ((s[q + 1] >> 4) << 4) | (s[q + 2] >> 4);
      let e = counts.get(key);
      if (!e) { e = [0, 0, 0, 0, 0]; counts.set(key, e); }
      e[0]++; e[1] += s[q]; e[2] += s[q + 1]; e[3] += s[q + 2]; e[4] += s[q + 3];
      if (!top || e[0] > top[0]) top = e;
    }
    if (!top) continue;
    const o = (y * w + x) * 4;
    d[o] = top[1] / top[0]; d[o + 1] = top[2] / top[0]; d[o + 2] = top[3] / top[0]; d[o + 3] = top[4] / top[0];
  }
  return out;
}

/** Fragment: four copies of the picture, moved `offset` pixels left, right, up and down, averaged. */
export function fragmentImage(src: ImageData, offset: number): ImageData {
  const k = Math.max(1, Math.round(offset)), { width: w, height: h } = src, s = src.data, out = copyImage(src), d = out.data;
  const shifts: Array<[number, number]> = [[-k, 0], [k, 0], [0, -k], [0, k]];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, bl = 0, a = 0;
    for (const [dx, dy] of shifts) {
      const q = (clampInt(y + dy, 0, h - 1) * w + clampInt(x + dx, 0, w - 1)) * 4, al = s[q + 3];
      r += s[q] * al; g += s[q + 1] * al; bl += s[q + 2] * al; a += al;
    }
    const o = (y * w + x) * 4;
    if (a > 0) { d[o] = r / a; d[o + 1] = g / a; d[o + 2] = bl / a; }
    d[o + 3] = a / 4;
  }
  return out;
}

/** Mezzotint: every channel made pure black or white against a random threshold, the threshold held over dots of a
 *  size, along short to long lines across, or along strokes that drift, fixed to the canvas (`canvas` its place in
 *  this image) and the seed. */
export function mezzotintImage(src: ImageData, kind: string, seed: number, canvas: Box): ImageData {
  const out = copyImage(src), d = out.data, { width: w, height: h } = src;
  const dot = { fineDots: 1, mediumDots: 2, grainyDots: 3, coarseDots: 4 }[kind as 'fineDots'] ?? 0;
  const line = { shortLines: 4, mediumLines: 9, longLines: 18, shortStrokes: 4, mediumStrokes: 9, longStrokes: 18 }[kind as 'shortLines'] ?? 0;
  const strokes = kind.endsWith('Strokes');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cx = x - canvas.x0, cy = y - canvas.y0, o = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) {
      let t: number;
      if (dot) {
        const gx = Math.floor(cx / dot), gy = Math.floor(cy / dot);
        t = kind === 'grainyDots' ? (hash01(gx, gy, c, seed) + hash01(cx, cy, c + 7, seed)) / 2 : hash01(gx, gy, c, seed);
      } else {
        const lane = strokes ? Math.floor(cy + Math.floor(cx / line) * 0.5) : cy, seg = Math.floor((cx + hash01(0, lane, c + 3, seed) * line) / line);
        t = hash01(seg, lane, c, seed);
      }
      d[o + c] = d[o + c] / 255 > t ? 255 : 0;
    }
  }
  return out;
}

/** Mosaic: square cells from the frame's corner, each its mean colour (the pixels of it inside the image). */
export function mosaicImage(src: ImageData, cellSize: number, area: Box): ImageData {
  const out = copyImage(src), b = clipBox(area, src.width, src.height);
  if (!b) return out;
  const cell = Math.max(1, Math.round(cellSize)), s = src.data, d = out.data, w = src.width;
  for (let cy = Math.floor((b.y0 - area.y0) / cell); area.y0 + cy * cell < b.y1; cy++) for (let cx = Math.floor((b.x0 - area.x0) / cell); area.x0 + cx * cell < b.x1; cx++) {
    const x0 = Math.max(0, area.x0 + cx * cell), y0 = Math.max(0, area.y0 + cy * cell), x1 = Math.min(src.width, area.x0 + (cx + 1) * cell), y1 = Math.min(src.height, area.y0 + (cy + 1) * cell);
    let r = 0, g = 0, bl = 0, a = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const q = (y * w + x) * 4, al = s[q + 3]; r += s[q] * al; g += s[q + 1] * al; bl += s[q + 2] * al; a += al; n++; }
    if (!n) continue;
    for (let y = Math.max(y0, b.y0); y < Math.min(y1, b.y1); y++) for (let x = Math.max(x0, b.x0); x < Math.min(x1, b.x1); x++) {
      const o = (y * w + x) * 4;
      if (a > 0) { d[o] = r / a; d[o + 1] = g / a; d[o + 2] = bl / a; }
      d[o + 3] = a / n;
    }
  }
  return out;
}

/** Pointillize: round dots at jittered points, each the colour under it a little varied, on the background colour. */
export function pointillizeImage(src: ImageData, cellSize: number, seed: number, area: Box, bg: LibColor): ImageData {
  const out = copyImage(src), b = clipBox(area, src.width, src.height);
  if (!b) return out;
  const cell = Math.max(2, cellSize), rad = cell * 0.62, d = out.data, w = src.width;
  for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) {
    const ci = Math.floor((x - area.x0) / cell), cj = Math.floor((y - area.y0) / cell), o = (y * w + x) * 4;
    let col: number[] = [bg[0], bg[1], bg[2]], rank = -1;
    for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
      const [sx, sy] = site(i, j, cell, seed, area.x0, area.y0), cover = Math.min(1, Math.max(0, rad - Math.hypot(sx - x - 0.5, sy - y - 0.5) + 0.5));
      const order = hash01(i, j, 41, seed);
      if (cover <= 0 || order < rank) continue;
      const p = px(src, sx, sy), jitter = (hash01(i, j, 43, seed) - 0.5) * 40;
      col = [0, 1, 2].map((c) => col[c] * (1 - cover) + clampInt(p[c] + jitter, 0, 255) * cover);
      rank = order;
    }
    d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
  }
  return out;
}

const areaOf = (ctx: LibContext): Box => boxOf(ctx.area);

export const PIXELATE_FILTERS: LibFilter[] = [
  {
    id: 'colorHalftone', label: 'Color Halftone', group: 'Pixelate', grows: false,
    reach: (v, scale) => Math.ceil(6 * Math.max(1, num(v, 'maxRadius') * scale)) + 2,
    params: [
      { key: 'maxRadius', label: 'Max. Radius (px)', kind: 'range', min: 4, max: 127, step: 1, def: 8 },
      { key: 'channel1', label: 'Channel 1 (°)', kind: 'range', min: -360, max: 360, step: 1, def: 108 },
      { key: 'channel2', label: 'Channel 2 (°)', kind: 'range', min: -360, max: 360, step: 1, def: 162 },
      { key: 'channel3', label: 'Channel 3 (°)', kind: 'range', min: -360, max: 360, step: 1, def: 90 },
      { key: 'channel4', label: 'Channel 4 (°)', kind: 'range', min: -360, max: 360, step: 1, def: 45 },
    ],
    run: (src, v, ctx) => colorHalftoneImage(src, num(v, 'maxRadius') * ctx.scale, [num(v, 'channel1'), num(v, 'channel2'), num(v, 'channel3'), num(v, 'channel4')], areaOf(ctx)),
  },
  {
    id: 'crystallize', label: 'Crystallize', group: 'Pixelate', grows: false,
    reach: (v, scale) => Math.ceil(2 * Math.max(2, num(v, 'cellSize') * scale)) + 2,
    params: [{ key: 'cellSize', label: 'Cell Size', kind: 'range', min: 3, max: 300, step: 1, def: 10 }],
    run: (src, v, ctx) => crystallizeImage(src, num(v, 'cellSize') * ctx.scale, ctx.seed, areaOf(ctx)),
  },
  {
    id: 'facet', label: 'Facet', group: 'Pixelate', params: [], grows: false,
    reach: (_v, scale) => Math.max(1, Math.round(2 * scale)) + 1,
    run: (src, _v, ctx) => facetImage(src, 2 * ctx.scale),
  },
  {
    id: 'fragment', label: 'Fragment', group: 'Pixelate', params: [], grows: false,
    reach: (_v, scale) => Math.max(1, Math.round(4 * scale)) + 1,
    run: (src, _v, ctx) => fragmentImage(src, 4 * ctx.scale),
  },
  {
    id: 'mezzotint', label: 'Mezzotint', group: 'Pixelate', grows: false, reach: () => 0,
    params: [{ key: 'type', label: 'Type', kind: 'select', def: 'fineDots', options: [['fineDots', 'Fine Dots'], ['mediumDots', 'Medium Dots'], ['grainyDots', 'Grainy Dots'], ['coarseDots', 'Coarse Dots'], ['shortLines', 'Short Lines'], ['mediumLines', 'Medium Lines'], ['longLines', 'Long Lines'], ['shortStrokes', 'Short Strokes'], ['mediumStrokes', 'Medium Strokes'], ['longStrokes', 'Long Strokes']] }],
    run: (src, v, ctx) => mezzotintImage(src, str(v, 'type'), ctx.seed, boxOf(ctx.canvas)),
  },
  {
    id: 'mosaic', label: 'Mosaic', group: 'Pixelate', grows: false,
    reach: (v, scale) => Math.max(1, Math.round(num(v, 'cellSize') * scale)) + 1,
    params: [{ key: 'cellSize', label: 'Cell Size (square)', kind: 'range', min: 2, max: 200, step: 1, def: 10 }],
    run: (src, v, ctx) => mosaicImage(src, num(v, 'cellSize') * ctx.scale, areaOf(ctx)),
  },
  {
    id: 'pointillize', label: 'Pointillize', group: 'Pixelate', grows: false,
    reach: (v, scale) => Math.ceil(2 * Math.max(2, num(v, 'cellSize') * scale)) + 2,
    note: 'Dots on the background color.',
    params: [{ key: 'cellSize', label: 'Cell Size', kind: 'range', min: 3, max: 300, step: 1, def: 5 }],
    run: (src, v, ctx) => pointillizeImage(src, num(v, 'cellSize') * ctx.scale, ctx.seed, areaOf(ctx), ctx.bg),
  },
];
