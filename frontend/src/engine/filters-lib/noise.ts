import type { LibFilter, LibValues } from '../filter-library';
import { surfaceBlur } from '../blur-gallery';
import { clampInt, copyImage, gaussKernel, separable } from './shared';

const num = (v: LibValues, k: string): number => v[k] as number;

/** Median: each channel the median of its values over a disc of `radius`, kept by a histogram that slides along the
 *  row (each step drops the disc's left edge and adds its right). With a `threshold` (Dust & Scratches) a value is
 *  replaced only where it differs from the median by more than that many levels. */
export function medianImage(img: ImageData, radius: number, threshold: number | null): ImageData {
  const r = Math.round(radius), { width: w, height: h } = img, s = img.data, out = copyImage(img), d = out.data;
  if (r < 1) return out;
  const half: number[] = [];
  for (let dy = -r; dy <= r; dy++) half.push(Math.floor(Math.sqrt(r * r - dy * dy + 0.5)));
  const hist = new Int32Array(256);
  for (let c = 0; c < 4; c++) {
    for (let y = 0; y < h; y++) {
      hist.fill(0);
      let n = 0;
      const put = (x: number, yy: number, k: number): void => { if (x >= 0 && x < w && yy >= 0 && yy < h) { hist[s[(yy * w + x) * 4 + c]] += k; n += k; } };
      for (let i = 0; i < half.length; i++) for (let x = -half[i]; x <= half[i]; x++) put(x, y + i - r, 1);
      for (let x = 0; x < w; x++) {
        if (x > 0) for (let i = 0; i < half.length; i++) { put(x - half[i] - 1, y + i - r, -1); put(x + half[i], y + i - r, 1); }
        let seen = 0, m = 0;
        while (m < 255 && seen + hist[m] <= n >> 1) seen += hist[m++];
        const o = (y * w + x) * 4 + c;
        if (threshold === null || Math.abs(s[o] - m) > threshold) d[o] = m;
      }
    }
  }
  return out;
}

/** A Gaussian blur of one float plane. */
function gaussPlane(p: Float32Array, w: number, h: number, sigma: number): Float32Array {
  return sigma < 0.3 ? p.slice() : separable(p, w, h, 1, gaussKernel(sigma));
}

export interface DenoiseSettings { strength: number; preserve: number; color: number; sharpen: number; jpeg: boolean }

/** The ring of offsets the brightness smoothing samples: the centre, then rings of eight at growing radii. */
function rings(radius: number): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [[0, 0, 1]];
  for (let k = 1; k <= 3; k++) {
    const rr = (radius * k) / 3;
    for (let a = 0; a < 8; a++) {
      const t = (a + (k % 2) * 0.5) * (Math.PI / 4);
      out.push([Math.round(Math.cos(t) * rr), Math.round(Math.sin(t) * rr), Math.exp(-(k * k) / 4.5)]);
    }
  }
  return out;
}

/** Reduce Noise: brightness smoothed where neighbours are alike (a sampled bilateral filter whose range narrows as
 *  Preserve Details rises, its reach growing with Strength), colour noise blurred in the chroma planes, details
 *  sharpened back by an unsharp mask on brightness, and with Remove JPEG Artifact the 8 by 8 block seams of the canvas's
 *  grid (offset `gx`, `gy`) softened. */
export function reduceNoiseImage(img: ImageData, o: DenoiseSettings, scale: number, gx = 0, gy = 0): ImageData {
  const { width: w, height: h } = img, s = img.data, out = copyImage(img), d = out.data, n = w * h;
  const Y = new Float32Array(n), Cb = new Float32Array(n), Cr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = s[i * 4], g = s[i * 4 + 1], b = s[i * 4 + 2];
    Y[i] = 0.299 * r + 0.587 * g + 0.114 * b; Cb[i] = (b - Y[i]) * 0.564; Cr[i] = (r - Y[i]) * 0.713;
  }
  let lum = Y;
  if (o.strength > 0) {
    const taps = rings(Math.max(1, (1 + o.strength * 0.6) * scale)), range = (6 + o.strength * 6) * (1.2 - o.preserve / 100), inv = 1 / (2 * range * range);
    lum = new Float32Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const me = Y[y * w + x];
      let sum = 0, wsum = 0;
      for (const [dx, dy, sw] of taps) {
        const v = Y[clampInt(y + dy, 0, h - 1) * w + clampInt(x + dx, 0, w - 1)], diff = v - me, wt = sw * Math.exp(-diff * diff * inv);
        sum += v * wt; wsum += wt;
      }
      lum[y * w + x] = sum / wsum;
    }
  }
  if (o.sharpen > 0) {
    const soft = gaussPlane(lum, w, h, Math.max(0.5, scale)), k = o.sharpen / 100;
    for (let i = 0; i < n; i++) lum[i] += (lum[i] - soft[i]) * k;
  }
  const cs = (o.color / 100) * 4 * scale, cb = gaussPlane(Cb, w, h, cs), cr = gaussPlane(Cr, w, h, cs);
  if (o.jpeg) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const bx = (((x - gx) % 8) + 8) % 8, by = (((y - gy) % 8) + 8) % 8;
      if (bx !== 0 && bx !== 7 && by !== 0 && by !== 7) continue;
      const i = y * w + x, l = lum[y * w + clampInt(x - 1, 0, w - 1)], rr = lum[y * w + clampInt(x + 1, 0, w - 1)];
      const u = lum[clampInt(y - 1, 0, h - 1) * w + x], dn = lum[clampInt(y + 1, 0, h - 1) * w + x];
      lum[i] = lum[i] * 0.5 + (l + rr + u + dn) * 0.125;
    }
  }
  for (let i = 0; i < n; i++) {
    const yy = lum[i], b1 = cb[i] / 0.564, r1 = cr[i] / 0.713;
    d[i * 4] = yy + r1; d[i * 4 + 2] = yy + b1; d[i * 4 + 1] = (yy - 0.299 * (yy + r1) - 0.114 * (yy + b1)) / 0.587;
  }
  return out;
}

export const NOISE_FILTERS: LibFilter[] = [
  {
    id: 'despeckle', label: 'Despeckle', group: 'Noise', params: [], grows: false,
    reach: (_v, scale) => Math.ceil(3 * scale) + 1,
    run: (src, _v, ctx) => surfaceBlur(src, Math.max(1, 3 * ctx.scale), 15),
  },
  {
    id: 'dustAndScratches', label: 'Dust & Scratches', group: 'Noise', grows: false,
    params: [
      { key: 'radius', label: 'Radius (px)', kind: 'range', min: 1, max: 100, step: 1, def: 1, limit: 500 },
      { key: 'threshold', label: 'Threshold (levels)', kind: 'range', min: 0, max: 255, step: 1, def: 0 },
    ],
    reach: (v, scale) => Math.round(num(v, 'radius') * scale) + 1,
    run: (src, v, ctx) => medianImage(src, num(v, 'radius') * ctx.scale, num(v, 'threshold')),
  },
  {
    id: 'median', label: 'Median', group: 'Noise', grows: false,
    params: [{ key: 'radius', label: 'Radius (px)', kind: 'range', min: 1, max: 100, step: 1, def: 1, limit: 500 }],
    reach: (v, scale) => Math.round(num(v, 'radius') * scale) + 1,
    run: (src, v, ctx) => medianImage(src, num(v, 'radius') * ctx.scale, null),
  },
  {
    id: 'reduceNoise', label: 'Reduce Noise', group: 'Noise', grows: false,
    params: [
      { key: 'strength', label: 'Strength', kind: 'range', min: 0, max: 10, step: 1, def: 6 },
      { key: 'preserve', label: 'Preserve Details (%)', kind: 'range', min: 0, max: 100, step: 1, def: 60 },
      { key: 'color', label: 'Reduce Color Noise (%)', kind: 'range', min: 0, max: 100, step: 1, def: 45 },
      { key: 'sharpen', label: 'Sharpen Details (%)', kind: 'range', min: 0, max: 100, step: 1, def: 25 },
      { key: 'jpeg', label: 'Remove JPEG Artifact', kind: 'check', def: false },
    ],
    reach: (v) => (v.jpeg === true ? null : 40),
    run: (src, v, ctx) => reduceNoiseImage(src, { strength: num(v, 'strength'), preserve: num(v, 'preserve'), color: num(v, 'color'), sharpen: num(v, 'sharpen'), jpeg: v.jpeg === true }, ctx.scale, Math.round(ctx.canvas.x), Math.round(ctx.canvas.y)),
  },
];
