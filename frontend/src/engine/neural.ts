import { surfaceBlur } from './blur-gallery';

/** Neural Filters (1.54.7, the parity plan's L2 and DEV_PLAN 23.2): the gallery's first two need no model.
 *
 *  Harmonize matches a layer's light and colour to what lies beneath it: the layer's mean and spread per channel in
 *  YCbCr move to the backdrop's (Reinhard's statistics transfer), pixels weighted by their alpha, the result blended
 *  by `amount`. Skin Smoothing softens skin tones only: a soft mask from the Cb and Cr ranges of skin, a Surface Blur
 *  under it, blended by `amount`. */

const toYCbCr = (r: number, g: number, b: number): [number, number, number] => [0.299 * r + 0.587 * g + 0.114 * b, 128 - 0.168736 * r - 0.331264 * g + 0.5 * b, 128 + 0.5 * r - 0.418688 * g - 0.081312 * b];
const fromYCbCr = (y: number, cb: number, cr: number): [number, number, number] => [y + 1.402 * (cr - 128), y - 0.344136 * (cb - 128) - 0.714136 * (cr - 128), y + 1.772 * (cb - 128)];
const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);

function stats(img: ImageData): { mean: [number, number, number]; sd: [number, number, number] } {
  const d = img.data, sum = [0, 0, 0], sq = [0, 0, 0]; let w = 0;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255; if (a === 0) continue;
    const c = toYCbCr(d[i], d[i + 1], d[i + 2]);
    for (let k = 0; k < 3; k++) { sum[k] += c[k] * a; sq[k] += c[k] * c[k] * a; }
    w += a;
  }
  if (w === 0) return { mean: [128, 128, 128], sd: [1, 1, 1] };
  const mean = sum.map((s) => s / w) as [number, number, number];
  const sd = sq.map((s, k) => Math.sqrt(Math.max(1e-6, s / w - mean[k] * mean[k]))) as [number, number, number];
  return { mean, sd };
}

export function harmonize(layer: ImageData, backdrop: ImageData, amount: number): ImageData {
  const src = stats(layer), dst = stats(backdrop), out = new ImageData(new Uint8ClampedArray(layer.data), layer.width, layer.height), d = out.data, t = Math.max(0, Math.min(1, amount));
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const c = toYCbCr(d[i], d[i + 1], d[i + 2]);
    const m = c.map((v, k) => (v - src.mean[k]) * (dst.sd[k] / src.sd[k]) + dst.mean[k]);
    const rgb = fromYCbCr(m[0], m[1], m[2]);
    d[i] = clamp255(d[i] + (rgb[0] - d[i]) * t); d[i + 1] = clamp255(d[i + 1] + (rgb[1] - d[i + 1]) * t); d[i + 2] = clamp255(d[i + 2] + (rgb[2] - d[i + 2]) * t);
  }
  return out;
}

/** Where a pixel reads as skin, 0 to 1: inside the Cb 77 to 127 and Cr 133 to 173 ranges, feathered 8 wide. */
export function skinMask(img: ImageData): Float32Array {
  const d = img.data, m = new Float32Array(img.width * img.height);
  const band = (v: number, lo: number, hi: number): number => Math.max(0, Math.min(1, (v - lo + 8) / 8)) * Math.max(0, Math.min(1, (hi + 8 - v) / 8));
  for (let i = 0, j = 0; i < d.length; i += 4, j++) { if (d[i + 3] === 0) continue; const c = toYCbCr(d[i], d[i + 1], d[i + 2]); m[j] = band(c[1], 77, 127) * band(c[2], 133, 173); }
  return m;
}

export function skinSmooth(img: ImageData, amount: number, radius: number): ImageData {
  const mask = skinMask(img), soft = surfaceBlur(img, Math.max(1, radius), 24), out = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), d = out.data, s = soft.data, t = Math.max(0, Math.min(1, amount));
  for (let i = 0, j = 0; i < d.length; i += 4, j++) { const k = mask[j] * t; if (k === 0) continue; for (let c = 0; c < 3; c++) d[i + c] = d[i + c] + (s[i + c] - d[i + c]) * k; }
  return out;
}
