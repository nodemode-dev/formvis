import { clamp } from './types';

/** Image filters, written for formvis from standard methods: a Gaussian blur approximated by three successive box
 *  blurs (widths from Kovesi's formula), a motion blur as a bilinear line integral, seeded noise, a radial lens
 *  distortion model, alpha-weighted histograms, and selection growing and shrinking through Felzenszwalb and
 *  Huttenlocher's squared-distance transform. Colour filtering runs on premultiplied values, so transparent pixels
 *  never bleed their colour, and samples beyond the image count as transparent. */

/** Straight RGBA bytes to premultiplied floats; alpha stays on the 0 to 255 scale. */
function premultiply(rgba: Uint8ClampedArray): Float32Array {
  const out = new Float32Array(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3], k = a / 255;
    out[i] = rgba[i] * k;
    out[i + 1] = rgba[i + 1] * k;
    out[i + 2] = rgba[i + 2] * k;
    out[i + 3] = a;
  }
  return out;
}

/** Premultiplied floats back to straight RGBA bytes; anything under half a level of alpha becomes transparent. */
function unpremultiply(p: Float32Array, width: number, height: number): ImageData {
  const img = new ImageData(width, height), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = p[i + 3];
    if (!(a >= 0.5)) continue;
    const k = 255 / a;
    d[i] = Math.round(p[i] * k);
    d[i + 1] = Math.round(p[i + 1] * k);
    d[i + 2] = Math.round(p[i + 2] * k);
    d[i + 3] = Math.round(a);
  }
  return img;
}

/** Kovesi's widths for three box blurs whose succession approximates a Gaussian of standard deviation `sigma`:
 *  the ideal width rounded down to odd, some passes one size up so the variances add to sigma squared. */
export function threeBoxWidths(sigma: number): number[] {   // exported for the 16-bit blur (1.53.7)
  const passes = 3, v = 12 * sigma * sigma;
  let lower = Math.floor(Math.sqrt(v / passes + 1));
  if (lower % 2 === 0) lower -= 1;
  const atLower = Math.round((v - passes * lower * lower - 4 * passes * lower - 3 * passes) / (-4 * lower - 4));
  return Array.from({ length: passes }, (_, i) => (i < atLower ? lower : lower + 2));
}

/** One box blur of radius `r` along rows (`across`) or columns, with a running sum per channel; the window is always
 *  divided by its full width, so values fade past the image edge. Channels are summed in locals, and the column pass
 *  keeps one running sum per column and moves down a row at a time, so memory is read in order rather than a whole
 *  row apart; the additions happen in the same order as before, so results are identical. */
export function boxBlur(src: Float32Array, dst: Float32Array, w: number, h: number, r: number, across: boolean): void {
  const scale = 1 / (2 * r + 1);
  if (across) {
    const warm = Math.min(r, w - 1);
    for (let y = 0; y < h; y++) {
      const o = y * w * 4;
      let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
      for (let k = 0; k <= warm; k++) { const q = o + k * 4; s0 += src[q]; s1 += src[q + 1]; s2 += src[q + 2]; s3 += src[q + 3]; }
      for (let i = 0; i < w; i++) {
        const at = o + i * 4;
        dst[at] = s0 * scale; dst[at + 1] = s1 * scale; dst[at + 2] = s2 * scale; dst[at + 3] = s3 * scale;
        const enter = i + r + 1, leave = i - r;
        if (enter < w) { const q = o + enter * 4; s0 += src[q]; s1 += src[q + 1]; s2 += src[q + 2]; s3 += src[q + 3]; }
        if (leave >= 0) { const q = o + leave * 4; s0 -= src[q]; s1 -= src[q + 1]; s2 -= src[q + 2]; s3 -= src[q + 3]; }
      }
    }
    return;
  }
  const row = w * 4, sum = new Float64Array(row), warm = Math.min(r, h - 1);
  for (let k = 0; k <= warm; k++) { const o = k * row; for (let x = 0; x < row; x++) sum[x] += src[o + x]; }
  for (let i = 0; i < h; i++) {
    const at = i * row;
    for (let x = 0; x < row; x++) dst[at + x] = sum[x] * scale;
    const enter = i + r + 1, leave = i - r;
    if (enter < h) { const o = enter * row; for (let x = 0; x < row; x++) sum[x] += src[o + x]; }
    if (leave >= 0) { const o = leave * row; for (let x = 0; x < row; x++) sum[x] -= src[o + x]; }
  }
}

export function gaussianBlur(img: ImageData, sigma: number): ImageData {
  const { width: w, height: h } = img;
  if (!(sigma >= 0.1)) return new ImageData(new Uint8ClampedArray(img.data), w, h);
  const a = premultiply(img.data), b = new Float32Array(a.length);
  for (const width of threeBoxWidths(sigma)) {
    const r = (width - 1) / 2;
    boxBlur(a, b, w, h, r, true);
    boxBlur(b, a, w, h, r, false);
  }
  return unpremultiply(a, w, h);
}

/** How far a Gaussian blur reaches past a layer's edge, in pixels. */
export function gaussianMargin(sigma: number): number { return Math.ceil(3 * sigma) + 1; }

/** Adds the bilinear sample of premultiplied `p` at (x, y) into `acc`, channel by channel. */
function addBilinear(p: Float32Array, w: number, h: number, x: number, y: number, acc: Float64Array): void {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  for (let c = 0; c < 4; c++) {
    let v = 0;
    for (let j = 0; j < 2; j++) {
      const row = y0 + j;
      if (row < 0 || row >= h) continue;
      const wy = j ? fy : 1 - fy;
      for (let i = 0; i < 2; i++) {
        const col = x0 + i;
        if (col < 0 || col >= w) continue;
        v += wy * (i ? fx : 1 - fx) * p[(row * w + col) * 4 + c];
      }
    }
    acc[c] += v;
  }
}

/** Motion blur: the mean of evenly spaced bilinear samples along a line of `distance` pixels centred on each pixel,
 *  at `angleDeg` counter-clockwise from the x axis; between 2 and 96 samples. */
export function motionBlur(img: ImageData, angleDeg: number, distance: number): ImageData {
  const { width: w, height: h } = img;
  const p = premultiply(img.data), out = new Float32Array(p.length);
  const theta = (angleDeg * Math.PI) / 180, ux = Math.cos(theta), uy = -Math.sin(theta);
  const count = Math.max(2, Math.min(96, Math.ceil(distance) + 1));
  const along = Array.from({ length: count }, (_, s) => -distance / 2 + (distance * s) / (count - 1));
  const acc = new Float64Array(4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      acc.fill(0);
      for (const t of along) addBilinear(p, w, h, x + ux * t, y + uy * t, acc);
      const o = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) out[o + c] = acc[c] / count;
    }
  }
  return unpremultiply(out, w, h);
}

/** How far a motion blur reaches past a layer's edge, in pixels. */
export function motionMargin(distance: number): number { return Math.ceil(distance / 2) + 1; }

/** Unsharp Mask: each colour channel is pushed away from its Gaussian-blurred value (radius as the sigma, at least
 *  0.1) by `amount` percent wherever the two differ by at least `threshold` levels; alpha is unchanged. */
export function unsharpMask(img: ImageData, amount: number, radius: number, threshold: number): ImageData {
  const soft = gaussianBlur(img, Math.max(0.1, radius)).data;
  const out = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), d = out.data;
  const gain = amount / 100;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    for (let c = 0; c < 3; c++) {
      const diff = d[i + c] - soft[i + c];
      if (Math.abs(diff) >= threshold) d[i + c] = Math.round(clamp(d[i + c] + diff * gain, 0, 255));
    }
  }
  return out;
}

/** SplitMix32: a well-mixed 32-bit value from any 32-bit input. */
export function mix32(z: number): number {
  z = (z + 0x9e3779b9) | 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}
export const toUnit = (bits: number): number => (bits + 0.5) / 4294967296;

/** Add Noise: per pixel and channel (or once per pixel when monochromatic), uniform noise within plus or minus
 *  `amount` percent of half the range, or Gaussian noise (Box and Muller) whose deviation is two thirds of that;
 *  the same seed always gives the same grain. Transparent pixels are left alone. */
export function addNoise(img: ImageData, amount: number, gaussian: boolean, monochromatic: boolean, seed: number): ImageData {
  const out = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), d = out.data;
  const spread = (amount / 100) * 127.5;
  for (let px = 0, i = 0; i < d.length; px++, i += 4) {
    if (d[i + 3] === 0) continue;
    const pixelKey = mix32(mix32(px) ^ seed);
    let shared = NaN;
    for (let c = 0; c < 3; c++) {
      if (!monochromatic || Number.isNaN(shared)) {
        const k = mix32(pixelKey + (monochromatic ? 0 : c));
        const n = gaussian
          ? Math.sqrt(-2 * Math.log(toUnit(k))) * Math.cos(2 * Math.PI * toUnit(mix32(k))) * spread * (2 / 3)
          : (toUnit(k) * 2 - 1) * spread;
        if (monochromatic) shared = n;
        d[i + c] = Math.round(clamp(d[i + c] + n, 0, 255));
      } else d[i + c] = Math.round(clamp(d[i + c] + shared, 0, 255));
    }
  }
  return out;
}

/** Lens Correction: a radial model scaling each pixel's distance from the centre by 1 - k (r / R) squared, where R is
 *  the half diagonal and k runs from -0.35 to 0.35 as `distortion` runs from -100 to 100; resampled bilinearly. */
export function lensDistort(img: ImageData, distortion: number): ImageData {
  const { width: w, height: h } = img;
  const k = (distortion / 100) * 0.35, src = premultiply(img.data), dst = new Float32Array(src.length);
  const cx = w / 2, cy = h / 2, halfDiagonal2 = cx * cx + cy * cy;
  const acc = new Float64Array(4);
  for (let y = 0; y < h; y++) {
    const dy = y + 0.5 - cy;
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx, s = 1 - (k * (dx * dx + dy * dy)) / halfDiagonal2;
      acc.fill(0);
      addBilinear(src, w, h, cx + dx * s - 0.5, cy + dy * s - 0.5, acc);
      const o = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) dst[o + c] = acc[c];
    }
  }
  return unpremultiply(dst, w, h);
}

/** Histograms for Levels: bins 0 to 255 are the composite (each channel adding a third), then red, green and blue.
 *  Each pixel counts by its alpha, times the selection's coverage when one is given. */
export function histogram(img: ImageData, coverage: Uint8ClampedArray | null = null): Float64Array {
  const bins = new Float64Array(1024), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const weight = (d[i + 3] / 255) * (coverage ? coverage[i + 3] / 255 : 1);
    for (let c = 0; c < 3; c++) {
      bins[256 * (c + 1) + d[i + c]] += weight;
      bins[d[i + c]] += weight / 3;
    }
  }
  return bins;
}

/** Felzenszwalb and Huttenlocher's one-dimensional squared-distance transform: `out[q]` becomes the minimum over p of
 *  (q - p) squared plus `f[p]`, from the lower envelope of the parabolas rooted at each p. */
function squaredDistance1d(f: Float64Array, n: number, out: Float64Array, roots: Int32Array, bounds: Float64Array): void {
  let top = 0;
  roots[0] = 0;
  bounds[0] = -Infinity;
  bounds[1] = Infinity;
  const cross = (q: number, p: number): number => (f[q] + q * q - (f[p] + p * p)) / (2 * (q - p));
  for (let q = 1; q < n; q++) {
    let s = cross(q, roots[top]);
    while (s <= bounds[top]) s = cross(q, roots[--top]);
    top++;
    roots[top] = q;
    bounds[top] = s;
    bounds[top + 1] = Infinity;
  }
  for (let q = 0, j = 0; q < n; q++) {
    while (bounds[j + 1] < q) j++;
    const dq = q - roots[j];
    out[q] = dq * dq + f[roots[j]];
  }
}

/** The Euclidean distance from each pixel to the nearest pixel where `inside` holds, by columns then rows. */
function distanceField(inside: (i: number) => boolean, w: number, h: number): Float64Array {
  const far = 1e20, field = new Float64Array(w * h);
  for (let i = 0; i < field.length; i++) field[i] = inside(i) ? 0 : far;
  const n = Math.max(w, h), f = new Float64Array(n), out = new Float64Array(n), roots = new Int32Array(n), bounds = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = field[y * w + x];
    squaredDistance1d(f, h, out, roots, bounds);
    for (let y = 0; y < h; y++) field[y * w + x] = out[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = field[y * w + x];
    squaredDistance1d(f, w, out, roots, bounds);
    for (let x = 0; x < w; x++) field[y * w + x] = Math.sqrt(out[x]);
  }
  return field;
}

/** Expand (positive `delta`) or contract a selection mask by `delta` pixels, with a one-pixel soft edge. */
export function resizeMask(mask: Uint8Array, w: number, h: number, delta: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  if (delta > 0) {
    const dist = distanceField((i) => mask[i] >= 128, w, h);
    for (let i = 0; i < out.length; i++) out[i] = mask[i] >= 128 ? 255 : Math.round(clamp(delta + 0.5 - dist[i], 0, 1) * 255);
  } else {
    const dist = distanceField((i) => mask[i] < 128, w, h);
    for (let i = 0; i < out.length; i++) out[i] = mask[i] < 128 ? 0 : Math.round(clamp(dist[i] + delta - 0.5, 0, 1) * 255);
  }
  return out;
}

/** A mask's alpha as an opaque grey image, for filtering a mask like pixels. */
export function toGray(img: ImageData): ImageData {
  const out = new ImageData(img.width, img.height), s = img.data, d = out.data;
  for (let i = 0; i < s.length; i += 4) {
    d[i] = d[i + 1] = d[i + 2] = s[i + 3];
    d[i + 3] = 255;
  }
  return out;
}

/** A grey image back to white with the grey (scaled by its alpha) as alpha. */
export function fromGray(img: ImageData): ImageData {
  const out = new ImageData(img.width, img.height), s = img.data, d = out.data;
  for (let i = 0; i < s.length; i += 4) {
    d[i] = d[i + 1] = d[i + 2] = 255;
    d[i + 3] = Math.round((((s[i] + s[i + 1] + s[i + 2]) / 3) * s[i + 3]) / 255);
  }
  return out;
}
