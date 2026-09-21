/** Remove Background's refining, written for sonny. The model's subject mask is pulled onto the image's own edges
 *  with He, Sun and Tang's guided filter (2010), which recovers hair and fur a segmentation cuts straight through;
 *  Shift Edge grows or shrinks it through a Gaussian blur and a steep threshold; Contrast pushes its greys apart.
 *  Masks and guides hold 0 to 1 per pixel, row by row. Radii are in layer pixels; `scale` shrinks them for a scaled
 *  preview. */

export interface MatteSettings { quality: 'basic' | 'advanced'; refineEdges: number; matteContrast: number; shiftEdge: number }

/** Basic, Refine 12 px (0 to 40), Contrast 25% (0 to 100), Shift Edge 0 px (-10 to 10). */
export const DEFAULT_MATTE: MatteSettings = { quality: 'basic', refineEdges: 12, matteContrast: 25, shiftEdge: 0 };

/** Box means along one axis: `lines` runs of `length` values `stride` apart, starting at `origin(line)`. Each output is
 *  the mean over 2r + 1 positions, positions past either end repeating the end value, taken from a prefix sum. */
function boxAlong(src: Float32Array, out: Float32Array, lines: number, length: number, stride: number, origin: (line: number) => number, r: number): void {
  const prefix = new Float64Array(length + 1), span = 2 * r + 1;
  for (let line = 0; line < lines; line++) {
    const o = origin(line);
    for (let i = 0; i < length; i++) prefix[i + 1] = prefix[i] + src[o + i * stride];
    const first = src[o], last = src[o + (length - 1) * stride];
    for (let i = 0; i < length; i++) {
      const lo = i - r, hi = i + r;
      let sum = prefix[Math.min(hi, length - 1) + 1] - prefix[Math.max(lo, 0)];
      if (lo < 0) sum += -lo * first;
      if (hi > length - 1) sum += (hi - length + 1) * last;
      out[o + i * stride] = sum / span;
    }
  }
}

/** The mean over a (2r + 1) square around each pixel, edges repeated; the cost does not grow with the radius. */
export function boxMean(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const across = new Float32Array(w * h), out = new Float32Array(w * h);
  boxAlong(src, across, h, w, 1, (y) => y * w, r);
  boxAlong(across, out, w, h, w, (x) => x, r);
  return out;
}

/** The guided filter: within each window the output is a linear function of the guide, a I + b, fitted to the mask by
 *  least squares with `eps` regularising the slope; the per-window a and b are averaged before being applied, so a
 *  step in the guide carries into the mask and flat regions stay smooth. Output is clamped to 0 to 1. */
export function guidedFilter(mask: Float32Array, guide: Float32Array, w: number, h: number, r: number, eps: number): Float32Array {
  const n = w * h, guideSquared = new Float32Array(n), guideTimesMask = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    guideSquared[i] = guide[i] * guide[i];
    guideTimesMask[i] = guide[i] * mask[i];
  }
  const mI = boxMean(guide, w, h, r), mP = boxMean(mask, w, h, r), mII = boxMean(guideSquared, w, h, r), mIP = boxMean(guideTimesMask, w, h, r);
  const a = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    a[i] = (mIP[i] - mI[i] * mP[i]) / (mII[i] - mI[i] * mI[i] + eps);
    b[i] = mP[i] - a[i] * mI[i];
  }
  const mA = boxMean(a, w, h, r), mB = boxMean(b, w, h, r), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.min(1, Math.max(0, mA[i] * guide[i] + mB[i]));
  return out;
}

/** A separable Gaussian of standard deviation `sigma` (taps to three sigma, normalised), edges repeated. */
function gaussianSmooth(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const reach = Math.max(1, Math.ceil(sigma * 3)), taps = new Float64Array(2 * reach + 1);
  let total = 0;
  for (let k = -reach; k <= reach; k++) total += taps[k + reach] = Math.exp(-(k * k) / (2 * sigma * sigma));
  for (let k = 0; k < taps.length; k++) taps[k] /= total;
  const convolve = (from: Float32Array, to: Float32Array, lines: number, length: number, stride: number, origin: (line: number) => number): void => {
    for (let line = 0; line < lines; line++) {
      const o = origin(line);
      for (let i = 0; i < length; i++) {
        let s = 0;
        for (let k = -reach; k <= reach; k++) s += taps[k + reach] * from[o + Math.min(length - 1, Math.max(0, i + k)) * stride];
        to[o + i * stride] = s;
      }
    }
  };
  const across = new Float32Array(w * h), out = new Float32Array(w * h);
  convolve(src, across, h, w, 1, (y) => y * w);
  convolve(across, out, w, h, w, (x) => x);
  return out;
}

/** The refined subject mask. Refine pulls the mask onto the guide's edges; Shift Edge blurs by half its reach and cuts
 *  steeply at 0.25 to grow or 0.75 to shrink; Contrast scales the greys about the middle (100 is a hard cut). Basic
 *  returns the model's mask unchanged. */
export function refineMatte(mask: Float32Array, guide: Float32Array, w: number, h: number, s: MatteSettings, scale = 1): Float32Array {
  if (s.quality !== 'advanced') return mask;
  let m = mask;
  if (s.refineEdges > 0) m = guidedFilter(m, guide, w, h, Math.max(1, Math.round(s.refineEdges * scale)), 1e-4);
  if (s.shiftEdge !== 0) {
    const cut = s.shiftEdge > 0 ? 0.25 : 0.75, soft = gaussianSmooth(m, w, h, (Math.abs(s.shiftEdge) / 2) * scale);
    m = soft.map((v) => Math.min(1, Math.max(0, (v - cut) * 1000)));
  }
  if (s.matteContrast > 0) {
    const gain = 1 / Math.max(0.02, 1 - (s.matteContrast / 100) * 0.98), lift = (1 - gain) / 2;
    m = m.map((v) => Math.min(1, Math.max(0, gain * v + lift)));
  }
  return m;
}

/** 0 to 1 levels of an image: a guide's luminance or a mask's grey, either scaled by alpha (drawn over black). */
export function levelsOf(img: ImageData, luminance: boolean): Float32Array {
  const d = img.data, out = new Float32Array(img.width * img.height);
  for (let p = 0; p < out.length; p++) {
    const i = p * 4, alpha = d[i + 3] / 255;
    const level = luminance ? (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255 : (d[i] + d[i + 1] + d[i + 2]) / 765;
    out[p] = level * alpha;
  }
  return out;
}
