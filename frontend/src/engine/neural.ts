import { surfaceBlur } from './blur-gallery';
import { gaussianBlur } from './filters';

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

/** Depth Blur: pixels blur by how far their depth (0 far to 255 near, from the engine's Depth Anything map) lies from
 *  the focal depth, past a range where everything stays sharp; the blur grows linearly to `radius` at the far end of
 *  the picture's depth, mixed from three blur levels. */
export function depthBlur(img: ImageData, depth: Uint8ClampedArray, focal: number, range: number, radius: number): ImageData {
  if (depth.length < img.width * img.height) return img;
  const half = gaussianBlur(img, Math.max(0.1, radius / 2)), full = gaussianBlur(img, Math.max(0.1, radius));
  const out = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), d = out.data, h = half.data, f = full.data, o = img.data;
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const dist = Math.max(0, Math.abs(depth[j] - focal) - range), t = Math.min(1, dist / Math.max(1, 255 - range));
    if (t === 0) continue;
    for (let c = 0; c < 4; c++) d[i + c] = t < 0.5 ? o[i + c] + (h[i + c] - o[i + c]) * (t * 2) : h[i + c] + (f[i + c] - h[i + c]) * ((t - 0.5) * 2);
  }
  return out;
}

/** Colorize's mix: the engine's colourised picture blended into the source by `amount`, the source's alpha kept. */
export function mixColor(img: ImageData, color: ImageData, amount: number): ImageData {
  const out = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), d = out.data, c = color.data, t = Math.max(0, Math.min(1, amount));
  for (let i = 0; i < d.length; i += 4) { if (d[i + 3] === 0) continue; for (let k = 0; k < 3; k++) d[i + k] = d[i + k] + (c[i + k] - d[i + k]) * t; }
  return out;
}

/** JPEG Artifacts Removal without a model: the steps JPEG leaves on its 8-pixel grid are smoothed across each block
 *  boundary where the jump is small (a real edge, with a jump above `edge`, is kept), then a light Surface Blur
 *  under `smooth` softens the mosquito noise in flat areas. A learned model (FBCNN) replaces this when an ONNX export
 *  can be pinned. */
export function deblock(img: ImageData, strength: number, edge = 24): ImageData {
  const { width: w, height: h } = img, out = new ImageData(new Uint8ClampedArray(img.data), w, h), d = out.data, s = Math.max(0, Math.min(1, strength));
  const fix = (a: number, b: number, c: number): void => {
    // Pixels a (inside block), b (the boundary pixel), c (first pixel of the next block): the step across b and c is
    // spread over four pixels when it is smaller than `edge`.
    for (let k = 0; k < 3; k++) {
      const jump = d[c + k] - d[b + k];
      if (Math.abs(jump) >= edge || Math.abs(jump) < 2) continue;
      const q = jump * s * 0.25;
      d[a + k] += q * 0.5; d[b + k] += q; d[c + k] -= q; d[c + k + (c - b)] -= q * 0.5;
    }
  };
  for (let y = 0; y < h; y++) for (let x = 8; x < w - 1; x += 8) { const b = (y * w + x - 1) * 4, c = b + 4; if (x + 1 < w) fix(b - 4, b, c); }
  for (let x = 0; x < w; x++) for (let y = 8; y < h - 1; y += 8) { const b = ((y - 1) * w + x) * 4, c = b + w * 4; if (y + 1 < h) fix(b - w * 4, b, c); }
  const soft = surfaceBlur(out, 2, 12), sd = soft.data, t = s * 0.6;
  for (let i = 0; i < d.length; i += 4) { if (d[i + 3] === 0) continue; for (let k = 0; k < 3; k++) d[i + k] = d[i + k] + (sd[i + k] - d[i + k]) * t; }
  return out;
}
