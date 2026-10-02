/** Select > Focus Area (1.57.6, the parity plan's L5), as Photoshop's: the in-focus parts of a picture, found from
 *  local sharpness. Each pixel's sharpness is the Laplacian of its brightness; their local energy (a box average over
 *  about an eightieth of the picture) less the noise floor, as a share of the picture's sharp end (its 99th
 *  percentile), is kept above a threshold the In-Focus Range sets (higher keeps more); small specks are dropped and
 *  holes closed, and Soften Edge feathers the result. Works on a copy at most 1,024 pixels on its long side. */

export interface FocusSettings { range: number; noise: number; soften: boolean }
export const DEFAULT_FOCUS: FocusSettings = { range: 50, noise: 20, soften: true };

function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = -r; x <= r; x++) s += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) { tmp[y * w + x] = s / n; s += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)]; }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) { out[y * w + x] = s / n; s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; }
  }
  return out;
}

/** The in-focus mask of `img` (0 to 255 a pixel, at `img`'s size). */
export function focusArea(img: ImageData, s: FocusSettings): Uint8Array {
  const W = img.width, H = img.height, k = Math.min(1, 1024 / Math.max(W, H)), w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
  const lum = new Float32Array(w * h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (Math.min(H - 1, Math.floor(y / k)) * W + Math.min(W - 1, Math.floor(x / k))) * 4;
    lum[y * w + x] = (0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2]) / 255;
  }
  const lap = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; lap[i] = Math.abs(4 * lum[i] - lum[i - 1] - lum[i + 1] - lum[i - w] - lum[i + w]); }
  const r = Math.max(2, Math.round(Math.min(w, h) / 80)), energy = boxBlur(lap, w, h, r), floor = (Math.max(0, Math.min(100, s.noise)) / 100) * 0.02;
  const sorted = Float32Array.from(energy).sort(), top = Math.max(1e-6, sorted[Math.floor(sorted.length * 0.99)] - floor);
  const t = 0.5 * (1 - Math.max(0, Math.min(100, s.range)) / 100) + 0.02;
  let m: Float32Array = new Float32Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = (energy[i] - floor) / top > t ? 1 : 0;
  // Close holes, then drop specks: blur and threshold each way.
  m = boxBlur(m, w, h, r); for (let i = 0; i < m.length; i++) m[i] = m[i] > 0.2 ? 1 : 0;
  m = boxBlur(m, w, h, r * 2); for (let i = 0; i < m.length; i++) m[i] = m[i] > 0.6 ? 1 : 0;
  if (s.soften) m = boxBlur(m, w, h, Math.max(1, Math.round(r / 2)));
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out[y * W + x] = Math.round(m[Math.min(h - 1, Math.floor(y * k)) * w + Math.min(w - 1, Math.floor(x * k))] * 255);
  return out;
}
