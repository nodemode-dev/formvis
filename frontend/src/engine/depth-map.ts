/** Depth map corrections: plain pixel operations on the grey Depth Map layer (near bright, far dark). */

export type DepthCorrection = 'flatten' | 'nearer' | 'farther' | 'smooth' | 'detail';
export const DEPTH_CORRECTIONS: readonly DepthCorrection[] = ['flatten', 'nearer', 'farther', 'smooth', 'detail'];

/** The layer name Compute Depth Map gives, which the depth commands look for. */
export const DEPTH_LAYER_NAME = 'Depth Map';
export const isDepthName = (name: string): boolean => name === DEPTH_LAYER_NAME || name.startsWith(`${DEPTH_LAYER_NAME} `);

const clamp = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);

/** `amount` is 0 to 1 for flatten (how far every value moves toward the middle grey 128), 0 to 1 for nearer and farther
 *  (the share of the full range added or taken away), and a radius in pixels (1 to 32) for smooth. Alpha is kept.
 *  With `guide` (the picture the depth was read from, same size) smooth does not blend across the picture's edges. */
export function depthCorrect(src: ImageData, kind: DepthCorrection, amount: number, guide: ImageData | null = null): ImageData {
  const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height), d = out.data, w = src.width, h = src.height;
  if (kind === 'smooth') {
    const r = Math.max(1, Math.min(32, Math.round(amount)));
    return guide && guide.width === w && guide.height === h ? snapSmooth(src, guide, r) : boxSmooth(out, r);
  }
  if (kind === 'detail') return guide && guide.width === w && guide.height === h ? addDetail(out, guide, Math.min(1, Math.max(0, amount))) : out;
  const k = Math.min(1, Math.max(0, amount));
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i];
    const n = kind === 'flatten' ? v + (128 - v) * k : kind === 'nearer' ? v + 255 * k : v - 255 * k;
    d[i] = d[i + 1] = d[i + 2] = Math.round(clamp(n));
  }
  return out;
}

/** Detail levels: the picture's fine brightness structure (its brightness minus a blur of it, radius 3) added to the
 *  depth by `k` (0 to 1, at 1 it is added as it is), so small shapes the depth model smoothed away come back. */
function addDetail(depth: ImageData, guide: ImageData, k: number): ImageData {
  const w = depth.width, h = depth.height, g = guide.data, d = depth.data, grey = new ImageData(w, h), gd = grey.data;
  for (let p = 0; p < w * h; p++) { const v = Math.round(0.299 * g[p * 4] + 0.587 * g[p * 4 + 1] + 0.114 * g[p * 4 + 2]); gd[p * 4] = gd[p * 4 + 1] = gd[p * 4 + 2] = v; gd[p * 4 + 3] = 255; }
  const soft = boxSmooth(new ImageData(new Uint8ClampedArray(gd), w, h), 3).data;
  for (let p = 0; p < w * h; p++) {
    const v = clamp(d[p * 4] + (gd[p * 4] - soft[p * 4]) * k);
    d[p * 4] = d[p * 4 + 1] = d[p * 4 + 2] = Math.round(v);
  }
  return depth;
}

/** A box blur of the grey value, two passes, separable. */
function boxSmooth(img: ImageData, r: number): ImageData {
  const w = img.width, h = img.height, d = img.data;
  let a = new Float32Array(w * h), b = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) a[p] = d[p * 4];
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      let sum = 0, cnt = 0;
      for (let x = -r; x <= r; x++) if (x >= 0 && x < w) { sum += a[y * w + x]; cnt++; }
      for (let x = 0; x < w; x++) {
        b[y * w + x] = sum / cnt;
        const add = x + r + 1, sub = x - r;
        if (add < w) { sum += a[y * w + add]; cnt++; }
        if (sub >= 0) { sum -= a[y * w + sub]; cnt--; }
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0, cnt = 0;
      for (let y = -r; y <= r; y++) if (y >= 0 && y < h) { sum += b[y * w + x]; cnt++; }
      for (let y = 0; y < h; y++) {
        a[y * w + x] = sum / cnt;
        const add = y + r + 1, sub = y - r;
        if (add < h) { sum += b[add * w + x]; cnt++; }
        if (sub >= 0) { sum -= b[sub * w + x]; cnt--; }
      }
    }
  }
  for (let p = 0; p < w * h; p++) { const v = Math.round(a[p]); d[p * 4] = d[p * 4 + 1] = d[p * 4 + 2] = v; }
  return img;
}

/** Depth smoothed with weights that fall with the picture's brightness difference, so depth stays sharp at the picture's
 *  own edges (a joint bilateral filter, window up to 9 px, spatial weight by distance). */
function snapSmooth(src: ImageData, guide: ImageData, r: number): ImageData {
  const w = src.width, h = src.height, s = src.data, g = guide.data, out = new ImageData(new Uint8ClampedArray(s), w, h), o = out.data;
  const R = Math.min(r, 9), sigmaS = Math.max(1, R / 2), inv2s = 1 / (2 * sigmaS * sigmaS), inv2r = 1 / (2 * 16 * 16);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const q = (y * w + x) * 4, cr = g[q], cg = g[q + 1], cb = g[q + 2];
      let acc = 0, wt = 0;
      for (let dy = -R; dy <= R; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const n = (yy * w + xx) * 4, dr = g[n] - cr, dg = g[n + 1] - cg, db = g[n + 2] - cb, k = Math.exp(-(dx * dx + dy * dy) * inv2s - (dr * dr + dg * dg + db * db) * inv2r);
          acc += s[n] * k; wt += k;
        }
      }
      const v = Math.round(acc / wt), i = (y * w + x) * 4;
      o[i] = o[i + 1] = o[i + 2] = v;
    }
  }
  return out;
}
