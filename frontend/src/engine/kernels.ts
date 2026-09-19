import { clamp, type Adjustment } from './types';

export type Kernel = (data: Uint8ClampedArray) => void;

const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function lut(tables: Uint8Array[]): Kernel {
  const [r, g, b] = tables;
  return (d) => {
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      d[i] = r[d[i]];
      d[i + 1] = g[d[i + 1]];
      d[i + 2] = b[d[i + 2]];
    }
  };
}

interface Range { black: number; white: number; gamma: number; outBlack: number; outWhite: number }
function levelRange(raw: unknown): Range {
  const o = obj(raw);
  const black = clamp(num(o.black, 0), 0, 254);
  return { black, white: clamp(num(o.white, 255), black + 1, 255), gamma: clamp(num(o.gamma, 1), 0.1, 9.99), outBlack: clamp(num(o.outputBlack, 0), 0, 255), outWhite: clamp(num(o.outputWhite, 255), 0, 255) };
}
function applyRange(r: Range, v: number): number {
  const input = Math.min(1, Math.max(0, (v * 255 - r.black) / (r.white - r.black)));
  return (r.outBlack + Math.pow(input, 1 / r.gamma) * (r.outWhite - r.outBlack)) / 255;
}
export function levelsKernel(settings: unknown): Kernel {
  const ranges = arr(obj(settings).ranges).map(levelRange);
  while (ranges.length < 4) ranges.push(levelRange(null));
  const tables = [1, 2, 3].map((ch) => {
    const t = new Uint8Array(256);
    for (let x = 0; x < 256; x++) t[x] = Math.round(255 * clamp(applyRange(ranges[0], applyRange(ranges[ch], x / 255)), 0, 1));
    return t;
  });
  return lut(tables);
}

function curve(points: Array<{ x: number; y: number }>): (x: number) => number {
  const p = points.length >= 2 ? points : [{ x: 0, y: 0 }, { x: 255, y: 255 }];
  const d = p.slice(1).map((q, i) => (q.y - p[i].y) / Math.max(1e-6, q.x - p[i].x));
  const slope = (j: number): number => {
    if (j === 0) return d[0];
    if (j === p.length - 1) return d[d.length - 1];
    if (d[j - 1] * d[j] <= 0) return 0;
    return 2 / (1 / d[j - 1] + 1 / d[j]);
  };
  return (x: number) => {
    let i = 0;
    for (let k = 0; k < p.length - 1; k++) if (p[k].x <= x) i = k;
    i = Math.min(p.length - 2, i);
    const h = p[i + 1].x - p[i].x, t = clamp((x - p[i].x) / Math.max(1e-6, h), 0, 1);
    const t2 = t * t, t3 = t2 * t;
    const y = (2 * t3 - 3 * t2 + 1) * p[i].y + (t3 - 2 * t2 + t) * h * slope(i) + (-2 * t3 + 3 * t2) * p[i + 1].y + (t3 - t2) * h * slope(i + 1);
    return clamp(y, 0, 255);
  };
}
export function curvesKernel(settings: unknown): Kernel {
  const channels = arr(obj(settings).channels).map((c) => arr(c).map((pt) => ({ x: num(obj(pt).x, 0), y: num(obj(pt).y, 0) })));
  while (channels.length < 4) channels.push([]);
  const fns = channels.map(curve);
  const tables = [1, 2, 3].map((ch) => {
    const t = new Uint8Array(256);
    for (let x = 0; x < 256; x++) t[x] = Math.round(fns[0](fns[ch](x)));
    return t;
  });
  return lut(tables);
}

export function exposureKernel(settings: unknown): Kernel {
  const o = obj(settings);
  const scale = Math.pow(2, clamp(num(o.exposure, 0), -20, 20)), offset = clamp(num(o.offset, 0), -0.5, 0.5), gamma = clamp(num(o.gamma, 1), 0.01, 9.99);
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const e = i / 255;
    let lin = e <= 0.04045 ? e / 12.92 : Math.pow((e + 0.055) / 1.055, 2.4);
    lin = Math.pow(Math.max(0, lin * scale + offset), 1 / gamma);
    const enc = lin <= 0.0031308 ? 12.92 * lin : 1.055 * Math.pow(lin, 1 / 2.4) - 0.055;
    t[i] = Math.round(clamp(enc, 0, 1) * 255);
  }
  return lut([t, t, t]);
}

export function gradientMapKernel(settings: unknown): Kernel {
  const o = obj(settings);
  const color = (c: unknown, d: number) => { const k = obj(c); return [num(k.red, d), num(k.green, d), num(k.blue, d)]; };
  let dark = color(o.shadows, 0), light = color(o.highlights, 1);
  if (o.reversed === true) [dark, light] = [light, dark];
  const table = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) for (let c = 0; c < 3; c++) table[i * 3 + c] = Math.round(clamp(dark[c] + (light[c] - dark[c]) * (i / 255), 0, 1) * 255);
  return (d) => {
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const level = Math.min(255, Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]));
      d[i] = table[level * 3]; d[i + 1] = table[level * 3 + 1]; d[i + 2] = table[level * 3 + 2];
    }
  };
}

export function invertKernel(): Kernel {
  return (d) => { for (let i = 0; i < d.length; i += 4) { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; } };
}

export function adjustmentKernel(adj: Adjustment | null): Kernel | null {
  if (!adj) return null;
  const d = adj.data;
  switch (adj.kind) {
    case 'levels': return levelsKernel(d.levels);
    case 'curves': return curvesKernel(d.curves);
    case 'exposure': return exposureKernel(d.exposureSettings);
    case 'gradientMap': return gradientMapKernel(d.gradientMapSettings);
    default: return null;
  }
}

export function wandMask(rgba: Uint8ClampedArray, width: number, height: number, seedX: number, seedY: number, tolerance: number, contiguous: boolean): Uint8Array {
  const mask = new Uint8Array(width * height);
  if (seedX < 0 || seedY < 0 || seedX >= width || seedY >= height) return mask;
  const s = (seedY * width + seedX) * 4;
  const ref = [rgba[s], rgba[s + 1], rgba[s + 2], rgba[s + 3]];
  const tol = clamp(Math.round(tolerance), 0, 255);
  const match = (p: number): boolean => {
    const o = p * 4;
    return Math.abs(rgba[o] - ref[0]) <= tol && Math.abs(rgba[o + 1] - ref[1]) <= tol && Math.abs(rgba[o + 2] - ref[2]) <= tol && Math.abs(rgba[o + 3] - ref[3]) <= tol;
  };
  if (!contiguous) {
    for (let p = 0; p < width * height; p++) if (match(p)) mask[p] = 255;
    return mask;
  }
  const stack: number[] = [seedX, seedY];
  while (stack.length) {
    const y = stack.pop() as number, x = stack.pop() as number;
    const row = y * width;
    if (mask[row + x] || !match(row + x)) continue;
    let left = x, right = x;
    while (left > 0 && !mask[row + left - 1] && match(row + left - 1)) left--;
    while (right + 1 < width && !mask[row + right + 1] && match(row + right + 1)) right++;
    mask.fill(255, row + left, row + right + 1);
    for (const ny of [y - 1, y + 1]) {
      if (ny < 0 || ny >= height) continue;
      const nrow = ny * width;
      let inRun = false;
      for (let nx = left; nx <= right; nx++) {
        const candidate = !mask[nrow + nx] && match(nrow + nx);
        if (candidate && !inRun) stack.push(nx, ny);
        inRun = candidate;
      }
    }
  }
  return mask;
}
