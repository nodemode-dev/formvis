import { clamp } from './types';

function premultiplied(src: Uint8ClampedArray): Float32Array {
  const p = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3] / 255;
    p[i] = src[i] * a; p[i + 1] = src[i + 1] * a; p[i + 2] = src[i + 2] * a; p[i + 3] = src[i + 3];
  }
  return p;
}

function straight(p: Float32Array, width: number, height: number): ImageData {
  const out = new ImageData(width, height);
  const d = out.data;
  for (let i = 0; i < p.length; i += 4) {
    const a = p[i + 3];
    if (a < 0.5) continue;
    const k = 255 / a;
    d[i] = Math.round(p[i] * k); d[i + 1] = Math.round(p[i + 1] * k); d[i + 2] = Math.round(p[i + 2] * k); d[i + 3] = Math.round(a);
  }
  return out;
}

function boxSizes(sigma: number): number[] {
  const n = 3, wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl -= 1;
  const wu = wl + 2, mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4);
  const m = Math.round(mIdeal);
  return [0, 1, 2].map((i) => (i < m ? wl : wu));
}

function boxPass(src: Float32Array, dst: Float32Array, w: number, h: number, r: number, horizontal: boolean): void {
  const norm = 1 / (2 * r + 1);
  const lines = horizontal ? h : w, len = horizontal ? w : h;
  const step = horizontal ? 4 : w * 4;
  for (let line = 0; line < lines; line++) {
    const base = horizontal ? line * w * 4 : line * 4;
    for (let c = 0; c < 4; c++) {
      let acc = 0;
      for (let k = 0; k <= Math.min(r, len - 1); k++) acc += src[base + k * step + c];
      for (let i = 0; i < len; i++) {
        dst[base + i * step + c] = acc * norm;
        const add = i + r + 1, sub = i - r;
        if (add < len) acc += src[base + add * step + c];
        if (sub >= 0) acc -= src[base + sub * step + c];
      }
    }
  }
}

export function gaussianBlur(img: ImageData, sigma: number): ImageData {
  const { width: w, height: h } = img;
  if (!(sigma >= 0.1)) return new ImageData(new Uint8ClampedArray(img.data), w, h);
  const a = premultiplied(img.data);
  const b = new Float32Array(a.length);
  for (const size of boxSizes(sigma)) {
    const r = (size - 1) / 2;
    boxPass(a, b, w, h, r, true);
    boxPass(b, a, w, h, r, false);
  }
  return straight(a, w, h);
}

export const gaussianMargin = (sigma: number): number => Math.ceil(sigma * 3) + 1;

export function motionBlur(img: ImageData, angleDeg: number, distance: number): ImageData {
  const { width: w, height: h } = img;
  const p = premultiplied(img.data), out = new Float32Array(p.length);
  const rad = (angleDeg * Math.PI) / 180, dx = Math.cos(rad), dy = -Math.sin(rad);
  const samples = Math.max(2, Math.min(96, Math.ceil(distance) + 1));
  const offsets: number[] = [];
  for (let s = 0; s < samples; s++) offsets.push(-distance / 2 + (distance * s) / (samples - 1));
  const at = (x: number, y: number, c: number): number => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    let v = 0;
    for (let j = 0; j < 2; j++) {
      const yy = y0 + j;
      if (yy < 0 || yy >= h) continue;
      const wy = j ? fy : 1 - fy;
      for (let i = 0; i < 2; i++) {
        const xx = x0 + i;
        if (xx < 0 || xx >= w) continue;
        v += wy * (i ? fx : 1 - fx) * p[(yy * w + xx) * 4 + c];
      }
    }
    return v;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    for (let c = 0; c < 4; c++) {
      let acc = 0;
      for (const t of offsets) acc += at(x + dx * t, y + dy * t, c);
      out[o + c] = acc / samples;
    }
  }
  return straight(out, w, h);
}

export const motionMargin = (distance: number): number => Math.ceil(distance / 2) + 1;

function hash(x: number): number {
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15; x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}
const unit = (key: number): number => (hash(key >>> 0) >>> 8) * (1 / 16777216);

export function addNoise(img: ImageData, amount: number, gaussian: boolean, monochromatic: boolean, seed: number): ImageData {
  const { width: w, height: h } = img;
  const out = new ImageData(new Uint8ClampedArray(img.data), w, h);
  const d = out.data, spread = (amount / 100) * 127.5;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (!d[i + 3]) continue;
    const base = hash((seed ^ hash((y * w + x) >>> 0)) >>> 0);
    for (let c = 0; c < 3; c++) {
      const key = monochromatic ? base : (base + Math.imul(c, 0x9e3779b9)) >>> 0;
      let n: number;
      if (gaussian) {
        const u1 = unit(key), u2 = unit((key ^ 0x68e31da4) >>> 0);
        n = Math.sqrt(-2 * Math.log(1 - u1)) * Math.cos(6.2831853 * u2) * spread * (2 / 3);
      } else n = (unit(key) * 2 - 1) * spread;
      d[i + c] = Math.round(clamp(d[i + c] + n, 0, 255));
    }
  }
  return out;
}

export function lensDistort(img: ImageData, distortion: number): ImageData {
  const { width: w, height: h } = img;
  const k = (distortion / 100) * 0.35;
  const src = premultiplied(img.data), dst = new Float32Array(src.length);
  const cx = w * 0.5, cy = h * 0.5, half2 = cx * cx + cy * cy;
  for (let y = 0; y < h; y++) {
    const dy = y + 0.5 - cy;
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx;
      const scale = 1 - (k * (dx * dx + dy * dy)) / half2;
      const sx = cx + dx * scale - 0.5, sy = cy + dy * scale - 0.5;
      const fx0 = Math.floor(sx), fy0 = Math.floor(sy), fx = sx - fx0, fy = sy - fy0;
      const o = (y * w + x) * 4;
      for (let j = 0; j < 2; j++) {
        const row = fy0 + j;
        if (row < 0 || row >= h) continue;
        const wy = j ? fy : 1 - fy;
        if (!wy) continue;
        for (let i = 0; i < 2; i++) {
          const col = fx0 + i;
          if (col < 0 || col >= w) continue;
          const wt = wy * (i ? fx : 1 - fx);
          if (!wt) continue;
          const s = (row * w + col) * 4;
          dst[o] += wt * src[s]; dst[o + 1] += wt * src[s + 1]; dst[o + 2] += wt * src[s + 2]; dst[o + 3] += wt * src[s + 3];
        }
      }
    }
  }
  return straight(dst, w, h);
}

export function histogram(img: ImageData, coverage: Uint8ClampedArray | null = null): Float64Array {
  const bins = new Float64Array(4 * 256), d = img.data;
  for (let i = 0, px = 0; i < d.length; i += 4, px++) {
    if (!d[i + 3]) continue;
    const weight = (d[i + 3] / 255) * (coverage ? coverage[px * 4 + 3] / 255 : 1);
    for (let c = 0; c < 3; c++) {
      const v = d[i + c];
      bins[(c + 1) * 256 + v] += weight;
      bins[v] += weight / 3;
    }
  }
  return bins;
}

function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}

function distanceTo(inside: (i: number) => boolean, w: number, h: number): Float64Array {
  const INF = 1e20, grid = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) grid[i] = inside(i) ? 0 : INF;
  const n = Math.max(w, h), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) grid[y * w + x] = Math.sqrt(d[x]);
  }
  return grid;
}

export function resizeMask(mask: Uint8Array, w: number, h: number, delta: number): Uint8Array {
  const out = new Uint8Array(w * h);
  if (delta > 0) {
    const dist = distanceTo((i) => mask[i] >= 128, w, h);
    for (let i = 0; i < w * h; i++) out[i] = mask[i] >= 128 ? 255 : Math.round(clamp(delta + 0.5 - dist[i], 0, 1) * 255);
  } else {
    const r = -delta;
    const dist = distanceTo((i) => mask[i] < 128, w, h);
    for (let i = 0; i < w * h; i++) out[i] = mask[i] < 128 ? 0 : Math.round(clamp(dist[i] - r - 0.5, 0, 1) * 255);
  }
  return out;
}

export function toGray(img: ImageData): ImageData {
  const out = new ImageData(img.width, img.height), s = img.data, d = out.data;
  for (let i = 0; i < s.length; i += 4) { d[i] = s[i + 3]; d[i + 1] = s[i + 3]; d[i + 2] = s[i + 3]; d[i + 3] = 255; }
  return out;
}

export function fromGray(img: ImageData): ImageData {
  const out = new ImageData(img.width, img.height), s = img.data, d = out.data;
  for (let i = 0; i < s.length; i += 4) {
    d[i] = 255; d[i + 1] = 255; d[i + 2] = 255;
    d[i + 3] = Math.round(((s[i] + s[i + 1] + s[i + 2]) / 3) * (s[i + 3] / 255));
  }
  return out;
}
