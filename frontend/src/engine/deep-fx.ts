import type { DeepPixels } from './types';
import { clipBox, gaussKernel, hash01, luma, separable, type Box } from './filters-lib/shared';
import { site } from './filters-lib/pixelate';
import { fractal, GHOSTS } from './filters-lib/render';

/** Float versions of Trace Contour, Tiles, Extrude, Smart Blur, Shape Blur, Reduce Noise, Pointillize, Color Halftone,
 *  Mezzotint and the render group. Colour is 0 to 1 (`ceiling` above it at 32 bits), alpha last; the 8 bit filters'
 *  geometry, random sequence and thresholds (in 8 bit levels) are kept so an 8 bit layer matches to a level. */
export type Rgb = readonly [number, number, number];

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export function traceContourDeep(src: DeepPixels, level: number, upper: boolean): DeepPixels {
  const { width: w, height: h } = src, S = src.n + 1, A = src.n, d = src.data, out = new Float32Array(d), lv = level - 1e-3;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < A; c++) {
    const me = d[(y * w + x) * S + c] * 255, mine = upper ? me >= lv : me < lv;
    let line = false;
    if (mine) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const v = d[(yy * w + xx) * S + c] * 255;
      if (upper ? v < lv : v >= lv) { line = true; break; }
    }
    out[(y * w + x) * S + c] = line ? 0 : 1;
  }
  return { ...src, data: out };
}

export function tilesDeep(src: DeepPixels, count: number, maxOffset: number, fill: string, seed: number, area: Box, fg: Rgb, bg: Rgb): DeepPixels {
  const { width: w, height: h } = src, S = src.n + 1, s = src.data, out = new Float32Array(s), b = clipBox(area, w, h);
  if (!b) return { ...src, data: out };
  const side = Math.max(1, Math.min(area.x1 - area.x0, area.y1 - area.y0) / Math.max(1, count)), shift = (side * maxOffset) / 100;
  for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) {
    const o = (y * w + x) * S;
    if (fill === 'unaltered') continue;
    if (fill === 'inverse') { for (let c = 0; c < 3; c++) out[o + c] = Math.max(0, 1 - s[o + c]); continue; }
    const col = fill === 'foreground' ? fg : bg;
    out[o] = col[0]; out[o + 1] = col[1]; out[o + 2] = col[2]; out[o + 3] = 1;
  }
  for (let j = 0; area.y0 + j * side < area.y1; j++) for (let i = 0; area.x0 + i * side < area.x1; i++) {
    const tx = area.x0 + i * side, ty = area.y0 + j * side, mx = Math.round((hash01(i, j, 1, seed) * 2 - 1) * shift), my = Math.round((hash01(i, j, 2, seed) * 2 - 1) * shift);
    for (let y = Math.ceil(ty); y < Math.min(area.y1, Math.ceil(ty + side)); y++) for (let x = Math.ceil(tx); x < Math.min(area.x1, Math.ceil(tx + side)); x++) {
      const nx = x + mx, ny = y + my;
      if (nx < b.x0 || ny < b.y0 || nx >= b.x1 || ny >= b.y1 || x < 0 || y < 0 || x >= w || y >= h) continue;
      const q = (y * w + x) * S, t = (ny * w + nx) * S;
      for (let c = 0; c < S; c++) out[t + c] = s[q + c];
    }
  }
  return { ...src, data: out };
}

function fillConvexDeep(d: Float32Array, w: number, h: number, S: number, pts: ReadonlyArray<readonly [number, number]>, rgb: readonly number[]): void {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(w - 1, Math.ceil(Math.max(...xs))), y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(h - 1, Math.ceil(Math.max(...ys)));
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const sign = area >= 0 ? 1 : -1;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5, py = y + 0.5;
    let inside = true;
    for (let i = 0; i < pts.length && inside; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (((b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0])) * sign < 0) inside = false;
    }
    if (!inside) continue;
    const o = (y * w + x) * S;
    d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; d[o + 3] = 1;
  }
}

export interface ExtrudeDeep { kind: string; size: number; depth: number; levelBased: boolean; solidFront: boolean; maskIncomplete: boolean; seed: number }

export function extrudeDeep(src: DeepPixels, o: ExtrudeDeep, area: Box, ceiling: number): DeepPixels {
  const { width: w, height: h } = src, S = src.n + 1, s = src.data, out = new Float32Array(s), b = clipBox(area, w, h);
  if (!b) return { ...src, data: out };
  const cell = Math.max(2, o.size), cx = (area.x0 + area.x1) / 2, cy = (area.y0 + area.y1) / 2, reachOut = Math.max(area.x1 - area.x0, area.y1 - area.y0) * 1.5;
  const items: Array<{ depth: number; mean: number[]; x0: number; y0: number; x1: number; y1: number }> = [];
  for (let j = 0; area.y0 + j * cell < area.y1; j++) for (let i = 0; area.x0 + i * cell < area.x1; i++) {
    const x0 = area.x0 + i * cell, y0 = area.y0 + j * cell, x1 = x0 + cell, y1 = y0 + cell;
    if (o.maskIncomplete && (x1 > area.x1 + 0.01 || y1 > area.y1 + 0.01)) continue;
    const mean = [0, 0, 0];
    let n = 0;
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(h, Math.ceil(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(w, Math.ceil(x1)); x++) {
      const q = (y * w + x) * S;
      mean[0] += s[q]; mean[1] += s[q + 1]; mean[2] += s[q + 2]; n++;
    }
    if (!n) continue;
    for (let c = 0; c < 3; c++) mean[c] /= n;
    items.push({ depth: (o.levelBased ? luma(mean[0], mean[1], mean[2]) : hash01(i, j, 5, o.seed)) * o.depth, mean, x0, y0, x1, y1 });
  }
  items.sort((a, c) => a.depth - c.depth);
  const lift = (x: number, y: number, depth: number): [number, number] => { const k = 1 + (depth * 2) / reachOut; return [cx + (x - cx) * k, cy + (y - cy) * k]; };
  const shade = (rgb: readonly number[], k: number): number[] => rgb.map((v) => clamp(v * k, 0, ceiling));
  for (const it of items) {
    const back: Array<[number, number]> = [[it.x0, it.y0], [it.x1, it.y0], [it.x1, it.y1], [it.x0, it.y1]];
    if (o.kind === 'pyramids') {
      const apex = lift((it.x0 + it.x1) / 2, (it.y0 + it.y1) / 2, it.depth * 1.5), tones = [1.15, 0.8, 0.6, 0.95];
      for (let e = 0; e < 4; e++) fillConvexDeep(out, w, h, S, [back[e], back[(e + 1) % 4], apex], shade(it.mean, tones[e]));
      continue;
    }
    const front = back.map(([x, y]) => lift(x, y, it.depth)), tones = [1.2, 0.7, 0.55, 0.9];
    for (let e = 0; e < 4; e++) fillConvexDeep(out, w, h, S, [back[e], back[(e + 1) % 4], front[(e + 1) % 4], front[e]], shade(it.mean, tones[e]));
    if (o.solidFront) { fillConvexDeep(out, w, h, S, front, it.mean); continue; }
    const fx0 = front[0][0], fy0 = front[0][1], k = (front[1][0] - front[0][0]) / (it.x1 - it.x0);
    for (let y = Math.max(0, Math.floor(fy0)); y < Math.min(h, Math.ceil(front[2][1])); y++) for (let x = Math.max(0, Math.floor(fx0)); x < Math.min(w, Math.ceil(front[1][0])); x++) {
      const sx = clamp(Math.floor(it.x0 + (x + 0.5 - fx0) / k), 0, w - 1), sy = clamp(Math.floor(it.y0 + (y + 0.5 - fy0) / k), 0, h - 1), q = (sy * w + sx) * S, t = (y * w + x) * S;
      out[t] = s[q]; out[t + 1] = s[q + 1]; out[t + 2] = s[q + 2]; out[t + 3] = 1;
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1) continue;
    const q = (y * w + x) * S;
    for (let c = 0; c < S; c++) out[q + c] = s[q + c];
  }
  return { ...src, data: out };
}

export function smartBlurDeep(src: DeepPixels, radius: number, threshold: number, quality: string, mode: string): DeepPixels {
  const { width: w, height: h } = src, S = src.n + 1, s = src.data, out = new Float32Array(s);
  const r = Math.min(100, Math.max(0.1, radius)), t = Math.min(100, Math.max(0.1, threshold)), lum = new Float32Array(w * h);
  for (let i = 0; i < lum.length; i++) lum[i] = luma(s[i * S], s[i * S + 1], s[i * S + 2]) * 255;
  if (mode === 'edgeOnly' || mode === 'overlayEdge') {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if ((dx || dy) && xx >= 0 && yy >= 0 && xx < w && yy < h && Math.abs(lum[yy * w + xx] - lum[y * w + x]) > t) { edge = true; break; }
      }
      const o = (y * w + x) * S;
      if (edge) { out[o] = out[o + 1] = out[o + 2] = 1; } else if (mode === 'edgeOnly') { out[o] = out[o + 1] = out[o + 2] = 0; }
    }
    return { ...src, data: out };
  }
  const ri = Math.ceil(r), step = Math.max(1, Math.round(ri / (quality === 'low' ? 3 : quality === 'medium' ? 6 : 10))), taps: Array<[number, number]> = [];
  for (let dy = -ri; dy <= ri; dy += step) for (let dx = -ri; dx <= ri; dx += step) if (dx * dx + dy * dy <= r * r + 0.25) taps.push([dx, dy]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const me = lum[y * w + x];
    let cr = 0, cg = 0, cb = 0, ca = 0, n = 0;
    for (const [dx, dy] of taps) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h || Math.abs(lum[yy * w + xx] - me) > t) continue;
      const q = (yy * w + xx) * S, a = s[q + 3];
      cr += s[q] * a; cg += s[q + 1] * a; cb += s[q + 2] * a; ca += a; n++;
    }
    const o = (y * w + x) * S;
    if (n && ca) { out[o] = cr / ca; out[o + 1] = cg / ca; out[o + 2] = cb / ca; out[o + 3] = ca / n; }
  }
  return { ...src, data: out };
}

/** Shape Blur on floats: the mean of the shape's kernel (rows of [dy, from, to] runs) in premultiplied alpha; pixels the kernel finds outside count as transparent. */
export function shapeBlurDeep(src: DeepPixels, kernel: { rows: Array<[number, number, number]>; count: number }): DeepPixels {
  const { width: w, height: h } = src, S = src.n + 1, A = src.n, d = src.data, out = new Float32Array(d.length), run = new Float64Array((w + 1) * h * S);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const q = (y * w + x) * S, a = d[q + A], at = (y * (w + 1) + x) * S;
    for (let c = 0; c < A; c++) run[at + S + c] = run[at + c] + d[q + c] * a;
    run[at + S + A] = run[at + A] + a;
  }
  const sum = new Float64Array(S);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    sum.fill(0);
    for (const [dy, a, b] of kernel.rows) {
      const yy = y + dy;
      if (yy < 0 || yy >= h) continue;
      const lo = Math.min(w, Math.max(0, x + a)), hi = Math.min(w, Math.max(0, x + b + 1)), base = yy * (w + 1) * S;
      for (let c = 0; c < S; c++) sum[c] += run[base + hi * S + c] - run[base + lo * S + c];
    }
    const o = (y * w + x) * S;
    out[o + A] = sum[A] / kernel.count;
    if (sum[A] > 1e-9) for (let c = 0; c < A; c++) out[o + c] = sum[c] / sum[A];
  }
  return { ...src, data: out };
}

const gaussPlane = (p: Float32Array, w: number, h: number, sigma: number): Float32Array => (sigma < 0.3 ? p.slice() : separable(p, w, h, 1, gaussKernel(sigma)));

export interface DenoiseDeep { strength: number; preserve: number; color: number; sharpen: number }

/** Reduce Noise on floats (without Remove JPEG Artifact, which follows the canvas's 8 by 8 grid): the 8 bit filter's sampled
 *  bilateral on brightness, chroma blur and unsharp, worked in 8 bit levels and returned to 0..1. */
export function reduceNoiseDeep(src: DeepPixels, o: DenoiseDeep, ceiling: number): DeepPixels {
  const { width: w, height: h } = src, S = src.n + 1, s = src.data, out = new Float32Array(s), n = w * h;
  const Y = new Float32Array(n), Cb = new Float32Array(n), Cr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = s[i * S] * 255, g = s[i * S + 1] * 255, b = s[i * S + 2] * 255;
    Y[i] = 0.299 * r + 0.587 * g + 0.114 * b; Cb[i] = (b - Y[i]) * 0.564; Cr[i] = (r - Y[i]) * 0.713;
  }
  let lum = Y;
  if (o.strength > 0) {
    const rr0 = Math.max(1, 1 + o.strength * 0.6), taps: Array<[number, number, number]> = [[0, 0, 1]];
    for (let k = 1; k <= 3; k++) for (let a = 0; a < 8; a++) { const t = (a + (k % 2) * 0.5) * (Math.PI / 4), rr = (rr0 * k) / 3; taps.push([Math.round(Math.cos(t) * rr), Math.round(Math.sin(t) * rr), Math.exp(-(k * k) / 4.5)]); }
    const range = (6 + o.strength * 6) * (1.2 - o.preserve / 100), inv = 1 / (2 * range * range);
    lum = new Float32Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const me = Y[y * w + x];
      let sum = 0, wsum = 0;
      for (const [dx, dy, sw] of taps) {
        const v = Y[clamp(y + dy, 0, h - 1) * w + clamp(x + dx, 0, w - 1)], diff = v - me, wt = sw * Math.exp(-diff * diff * inv);
        sum += v * wt; wsum += wt;
      }
      lum[y * w + x] = sum / wsum;
    }
  }
  if (o.sharpen > 0) {
    const soft = gaussPlane(lum, w, h, 1), k = o.sharpen / 100;
    for (let i = 0; i < n; i++) lum[i] += (lum[i] - soft[i]) * k;
  }
  const cs = (o.color / 100) * 4, cb = gaussPlane(Cb, w, h, cs), cr = gaussPlane(Cr, w, h, cs);
  for (let i = 0; i < n; i++) {
    const yy = lum[i], b1 = cb[i] / 0.564, r1 = cr[i] / 0.713, q = i * S;
    out[q] = clamp((yy + r1) / 255, 0, ceiling); out[q + 2] = clamp((yy + b1) / 255, 0, ceiling); out[q + 1] = clamp((yy - 0.299 * (yy + r1) - 0.114 * (yy + b1)) / 0.587 / 255, 0, ceiling);
  }
  return { ...src, data: out };
}

export function pointillizeDeep(src: DeepPixels, cellSize: number, seed: number, area: Box, bg: Rgb, ceiling: number): DeepPixels {
  const { width: w, height: h } = src, S = src.n + 1, s = src.data, out = new Float32Array(s), b = clipBox(area, w, h);
  if (!b) return { ...src, data: out };
  const cell = Math.max(2, cellSize), rad = cell * 0.62;
  for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) {
    const ci = Math.floor((x - area.x0) / cell), cj = Math.floor((y - area.y0) / cell), o = (y * w + x) * S;
    let col: number[] = [bg[0], bg[1], bg[2]], rank = -1;
    for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
      const [sx, sy] = site(i, j, cell, seed, area.x0, area.y0), cover = Math.min(1, Math.max(0, rad - Math.hypot(sx - x - 0.5, sy - y - 0.5) + 0.5)), order = hash01(i, j, 41, seed);
      if (cover <= 0 || order < rank) continue;
      const q = (clamp(Math.floor(sy), 0, h - 1) * w + clamp(Math.floor(sx), 0, w - 1)) * S, jitter = ((hash01(i, j, 43, seed) - 0.5) * 40) / 255;
      col = [0, 1, 2].map((c) => col[c] * (1 - cover) + clamp(s[q + c] + jitter, 0, ceiling) * cover);
      rank = order;
    }
    out[o] = col[0]; out[o + 1] = col[1]; out[o + 2] = col[2]; out[o + 3] = 1;
  }
  return { ...src, data: out };
}

const DOTS = ((): Float64Array => {
  const out = new Float64Array(257), cover = (p: number): number => (p <= 1 ? Math.PI * p * p : Math.PI * p * p - 4 * (p * p * Math.acos(1 / p) - Math.sqrt(p * p - 1))) / 4;
  for (let k = 0, p = 0; k <= 256; k++) { while (p < Math.SQRT2 && cover(p) < k / 256) p += 1e-4; out[k] = Math.min(Math.SQRT2, p); }
  return out;
})();
const dotRadius = (m: number): number => DOTS[Math.round(Math.min(1, Math.max(0, m)) * 256)];

export function colorHalftoneDeep(src: DeepPixels, maxRadius: number, angles: readonly number[], area: Box): DeepPixels {
  const { width: w, height: h } = src, S = src.n + 1, s = src.data, out = new Float32Array(s), b = clipBox(area, w, h);
  if (!b) return { ...src, data: out };
  const R = Math.max(1, maxRadius), cell = 2 * R;
  for (let c = 0; c < 3; c++) {
    const t = (angles[c] * Math.PI) / 180, cs = Math.cos(t), sn = Math.sin(t), means = new Map<string, number>();
    const mean = (i: number, j: number): number => {
      const key = `${i},${j}`;
      let m = means.get(key);
      if (m === undefined) {
        m = 0;
        for (let a = 0; a < 4; a++) for (let e = 0; e < 4; e++) {
          const u = (i + (a + 0.5) / 4) * cell, v = (j + (e + 0.5) / 4) * cell, px = clamp(area.x0 + Math.floor(u * cs - v * sn), 0, w - 1), py = clamp(area.y0 + Math.floor(u * sn + v * cs), 0, h - 1);
          m += s[(py * w + px) * S + c];
        }
        m /= 16;
        means.set(key, m);
      }
      return m;
    };
    for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) {
      const fx = x + 0.5 - area.x0, fy = y + 0.5 - area.y0, u = fx * cs + fy * sn, v = -fx * sn + fy * cs, ci = Math.floor(u / cell), cj = Math.floor(v / cell);
      let cover = 0;
      for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
        const r = R * dotRadius(mean(i, j)), dist = Math.hypot(u - (i + 0.5) * cell, v - (j + 0.5) * cell);
        cover = Math.max(cover, Math.min(1, Math.max(0, r - dist + 0.5)));
      }
      out[(y * w + x) * S + c] = cover;
    }
  }
  return { ...src, data: out };
}

export function mezzotintDeep(src: DeepPixels, kind: string, seed: number, canvas: Box): DeepPixels {
  const { width: w, height: h } = src, S = src.n + 1, A = src.n, s = src.data, out = new Float32Array(s);
  const dot = { fineDots: 1, mediumDots: 2, grainyDots: 3, coarseDots: 4 }[kind as 'fineDots'] ?? 0;
  const line = { shortLines: 4, mediumLines: 9, longLines: 18, shortStrokes: 4, mediumStrokes: 9, longStrokes: 18 }[kind as 'shortLines'] ?? 0, strokes = kind.endsWith('Strokes');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cx = x - canvas.x0, cy = y - canvas.y0, o = (y * w + x) * S;
    for (let c = 0; c < A; c++) {
      let t: number;
      if (dot) {
        const gx = Math.floor(cx / dot), gy = Math.floor(cy / dot);
        t = kind === 'grainyDots' ? (hash01(gx, gy, c, seed) + hash01(cx, cy, c + 7, seed)) / 2 : hash01(gx, gy, c, seed);
      } else {
        const lane = strokes ? Math.floor(cy + Math.floor(cx / line) * 0.5) : cy, seg = Math.floor((cx + hash01(0, lane, c + 3, seed) * line) / line);
        t = hash01(seg, lane, c, seed);
      }
      out[o + c] = s[o + c] > t ? 1 : 0;
    }
  }
  return { ...src, data: out };
}

const mixFgBg = (fg: Rgb, bg: Rgb, t: number): [number, number, number] => [fg[0] + (bg[0] - fg[0]) * t, fg[1] + (bg[1] - fg[1]) * t, fg[2] + (bg[2] - fg[2]) * t];

export function cloudsDeep(src: DeepPixels, difference: boolean, seed: number, canvas: Box, fg: Rgb, bg: Rgb): DeepPixels {
  const { width: w, height: h } = src, S = src.n + 1, out = new Float32Array(src.data), cw = Math.max(1, canvas.x1 - canvas.x0), ch = Math.max(1, canvas.y1 - canvas.y0), unit = Math.max(cw, ch) / 4;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = clamp(0.5 + (fractal((x + 0.5 - canvas.x0) / unit, (y + 0.5 - canvas.y0) / unit, seed, unit) - 0.5) * 1.8, 0, 1), c = mixFgBg(fg, bg, t), o = (y * w + x) * S;
    if (difference) { for (let k = 0; k < 3; k++) out[o + k] = Math.abs(out[o + k] - c[k]); }
    else { out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 1; }
  }
  return { ...src, data: out };
}

export function fibersDeep(src: DeepPixels, variance: number, strength: number, seed: number, canvas: Box, fg: Rgb, bg: Rgb): DeepPixels {
  const { width: w, height: h } = src, S = src.n + 1, out = new Float32Array(src.data), across = 3, down = across * (2 + strength * 1.5), spread = 0.4 + variance / 40;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x + 0.5 - canvas.x0) / across, v = (y + 0.5 - canvas.y0) / down, n = fractal(u, v + fractal(u * 0.25, 0, seed + 1, 8) * 2, seed, 6), t = clamp(0.5 + (n - 0.5) * spread * 2, 0, 1), c = mixFgBg(fg, bg, t), o = (y * w + x) * S;
    out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 1;
  }
  return { ...src, data: out };
}

export function lensFlareDeep(src: DeepPixels, brightness: number, cxp: number, cyp: number, lens: string, area: Box): DeepPixels {
  const { width: w, height: h } = src, S = src.n + 1, out = new Float32Array(src.data), fw = area.x1 - area.x0, fh = area.y1 - area.y0, diag = Math.hypot(fw, fh);
  const fx = area.x0 + (cxp / 100) * fw, fy = area.y0 + (cyp / 100) * fh, mx = (area.x0 + area.x1) / 2, my = (area.y0 + area.y1) / 2, k = brightness / 100;
  const ghosts = GHOSTS[lens] ?? GHOSTS.zoom, core = diag * 0.012, glow = diag * (lens === 'prime105' ? 0.12 : 0.08), ring = diag * 0.13;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x + 0.5 - fx, dy = y + 0.5 - fy, r = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
    let add = [0, 0, 0];
    const lift = (amt: number, c: readonly number[]): void => { add = [add[0] + c[0] * amt, add[1] + c[1] * amt, add[2] + c[2] * amt]; };
    lift(Math.exp(-(r * r) / (2 * core * core)) * 1.2, [255, 255, 255]);
    lift(Math.exp(-r / glow) * 0.55, [255, 230, 200]);
    lift(Math.exp(-(((r - ring) / (diag * 0.006)) ** 2)) * 0.12, [255, 200, 160]);
    lift(Math.pow(Math.abs(Math.cos(ang * 6)), 40) * Math.exp(-r / (glow * 2.5)) * 0.35, [255, 245, 230]);
    if (lens === 'moviePrime') lift(Math.exp(-(dy * dy) / (2 * (core * 0.6) ** 2)) * Math.exp(-Math.abs(dx) / (diag * 0.35)) * 0.6, [170, 200, 255]);
    for (const [at, rr, c] of ghosts) {
      const gx = fx + (mx - fx) * 2 * at, gy = fy + (my - fy) * 2 * at, gr = rr * diag, dist = Math.hypot(x + 0.5 - gx, y + 0.5 - gy);
      lift(Math.max(0, 1 - Math.abs(dist - gr * 0.6) / (gr * 0.6)) * 0.18, c);
    }
    const o = (y * w + x) * S;
    for (let c = 0; c < 3; c++) out[o + c] = 1 - ((1 - out[o + c]) * (1 - Math.min(1, (add[c] * k) / 255)));
  }
  return { ...src, data: out };
}
