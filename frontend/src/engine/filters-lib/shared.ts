import { mix32 } from '../filters';

/* Pieces the filter library's modules share: pixels as premultiplied floats, an exact separable Gaussian, a running
   box mean, the frame a filter works in, and a positional hash for filters with grain or scatter. */

/** RGBA bytes as premultiplied floats (colour times alpha, alpha 0 to 255). */
export function premul(d: Uint8ClampedArray): Float32Array {
  const p = new Float32Array(d.length);
  for (let i = 0; i < d.length; i += 4) {
    const k = d[i + 3] / 255;
    p[i] = d[i] * k; p[i + 1] = d[i + 1] * k; p[i + 2] = d[i + 2] * k; p[i + 3] = d[i + 3];
  }
  return p;
}

/** Premultiplied floats back to RGBA bytes; a pixel with under half a level of alpha stays empty. */
export function unpremul(p: Float32Array, width: number, height: number): ImageData {
  const out = new ImageData(width, height), d = out.data;
  for (let i = 0; i < p.length; i += 4) {
    const a = p[i + 3];
    if (a < 0.5) continue;
    d[i] = (p[i] * 255) / a; d[i + 1] = (p[i + 1] * 255) / a; d[i + 2] = (p[i + 2] * 255) / a; d[i + 3] = a;
  }
  return out;
}

export const copyImage = (img: ImageData): ImageData => new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);

export const clampInt = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Rec. 601 luma of an RGB triple. */
export const luma = (r: number, g: number, b: number): number => 0.299 * r + 0.587 * g + 0.114 * b;

/** A Gaussian of standard deviation `sigma` sampled out to three deviations, summing to 1. */
export function gaussKernel(sigma: number): Float32Array {
  const r = Math.max(1, Math.ceil(3 * sigma)), k = new Float32Array(2 * r + 1);
  let total = 0;
  for (let i = 0; i < k.length; i++) { const x = i - r; k[i] = Math.exp((-x * x) / (2 * sigma * sigma)); total += k[i]; }
  for (let i = 0; i < k.length; i++) k[i] /= total;
  return k;
}

/** Convolves `n`-channel floats with `k` along rows then columns, renormalising where the kernel leaves the image. */
export function separable(p: Float32Array, w: number, h: number, n: number, k: Float32Array): Float32Array {
  const r = (k.length - 1) >> 1, tmp = new Float32Array(p.length), out = new Float32Array(p.length), acc = new Float64Array(n);
  const pass = (src: Float32Array, dst: Float32Array, len: number, lines: number, at: (line: number, i: number) => number): void => {
    for (let line = 0; line < lines; line++) {
      for (let i = 0; i < len; i++) {
        acc.fill(0);
        let wsum = 0;
        for (let t = -r; t <= r; t++) {
          const j = i + t;
          if (j < 0 || j >= len) continue;
          const wt = k[t + r], q = at(line, j);
          wsum += wt;
          for (let c = 0; c < n; c++) acc[c] += src[q + c] * wt;
        }
        const o = at(line, i);
        for (let c = 0; c < n; c++) dst[o + c] = acc[c] / wsum;
      }
    }
  };
  pass(p, tmp, w, h, (y, x) => (y * w + x) * n);
  pass(tmp, out, h, w, (x, y) => (y * w + x) * n);
  return out;
}

/** An exact Gaussian blur of an image (premultiplied, so transparent pixels do not darken edges). */
export function exactGaussian(img: ImageData, sigma: number): ImageData {
  if (!(sigma >= 0.1)) return copyImage(img);
  return unpremul(separable(premul(img.data), img.width, img.height, 4, gaussKernel(sigma)), img.width, img.height);
}

/** Unsharp masking: each colour pushed away from its Gaussian blur by `amount` percent where they differ by at
 *  least `threshold` levels. */
export function unsharpExact(img: ImageData, amount: number, sigma: number, threshold: number): ImageData {
  const soft = exactGaussian(img, sigma).data, s = img.data, out = copyImage(img), d = out.data, k = amount / 100;
  for (let i = 0; i < s.length; i += 4) for (let c = 0; c < 3; c++) {
    const diff = s[i + c] - soft[i + c];
    if (Math.abs(diff) >= threshold) d[i + c] = s[i + c] + diff * k;
  }
  return out;
}

/** The mean of a single-channel plane over a (2r+1) square at each pixel, from a summed-area table, the square
 *  clipped to the plane. */
export function boxMean(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const out = new Float32Array(w * h);
  if (r < 1) { out.set(src); return out; }
  const sat = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) { row += src[y * w + x]; sat[(y + 1) * (w + 1) + x + 1] = sat[y * (w + 1) + x + 1] + row; }
  }
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const s = sat[y1 * (w + 1) + x1] - sat[y0 * (w + 1) + x1] - sat[y1 * (w + 1) + x0] + sat[y0 * (w + 1) + x0];
      out[y * w + x] = s / ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}

/** A filter's frame in whole pixels: x0, y0 inclusive, x1, y1 exclusive. */
export interface Box { x0: number; y0: number; x1: number; y1: number }

export function boxOf(r: { x: number; y: number; w: number; h: number }): Box {
  const x0 = Math.floor(r.x + 1e-6), y0 = Math.floor(r.y + 1e-6);
  return { x0, y0, x1: Math.max(x0 + 1, Math.ceil(r.x + r.w - 1e-6)), y1: Math.max(y0 + 1, Math.ceil(r.y + r.h - 1e-6)) };
}

export function clipBox(b: Box, w: number, h: number): Box | null {
  const x0 = Math.max(0, b.x0), y0 = Math.max(0, b.y0), x1 = Math.min(w, b.x1), y1 = Math.min(h, b.y1);
  return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : null;
}

/** A value in [0, 1) fixed by a position, a channel and a seed, so grain and scatter stay put across previews,
 *  bands and repeats. */
export function hash01(x: number, y: number, c: number, seed: number): number {
  return mix32(mix32(mix32(mix32(seed | 0) + (x | 0)) + (y | 0)) + (c | 0)) / 4294967296;
}
