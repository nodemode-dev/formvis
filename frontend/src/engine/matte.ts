/** Remove Background's refining, ported from the `SubjectRemoval.refined` and `GuidedMatte`. Masks and
 *  guides are 0 to 1 per pixel, row by row. Radii are in layer pixels; `scale` shrinks them for a scaled preview. */

export interface MatteSettings { quality: 'basic' | 'advanced'; refineEdges: number; matteContrast: number; shiftEdge: number }

/** Basic, Refine 12 px (0 to 40), Contrast 25% (0 to 100), Shift Edge 0 px (-10 to 10). */
export const DEFAULT_MATTE: MatteSettings = { quality: 'basic', refineEdges: 12, matteContrast: 25, shiftEdge: 0 };

/** Mean over a (2r+1) square as two running-sum passes with edge clamping, so the cost does not grow with the radius. */
export function boxMean(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const span = r * 2 + 1, pass = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      pass[row + x] = sum / span;
      sum -= src[row + Math.min(w - 1, Math.max(0, x - r))];
      sum += src[row + Math.min(w - 1, Math.max(0, x + r + 1))];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += pass[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / span;
      sum -= pass[Math.min(h - 1, Math.max(0, y - r)) * w + x];
      sum += pass[Math.min(h - 1, Math.max(0, y + r + 1)) * w + x];
    }
  }
  return out;
}

/** Guided filtering (He, Sun and Tang): `mask` pulled onto the edges of `guide`, which recovers hair and fur a
 *  segmentation model cuts straight through. `eps` decides how much of an edge in the guide counts. */
export function guidedFilter(mask: Float32Array, guide: Float32Array, w: number, h: number, r: number, eps: number): Float32Array {
  const n = w * h, squares = new Float32Array(n), products = new Float32Array(n);
  for (let i = 0; i < n; i++) { squares[i] = guide[i] * guide[i]; products[i] = guide[i] * mask[i]; }
  const meanGuide = boxMean(guide, w, h, r), meanMask = boxMean(mask, w, h, r);
  const meanSquares = boxMean(squares, w, h, r), meanProducts = boxMean(products, w, h, r);
  const slope = new Float32Array(n), offset = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const variance = meanSquares[i] - meanGuide[i] * meanGuide[i], covariance = meanProducts[i] - meanGuide[i] * meanMask[i];
    slope[i] = covariance / (variance + eps);
    offset[i] = meanMask[i] - slope[i] * meanGuide[i];
  }
  const meanSlope = boxMean(slope, w, h, r), meanOffset = boxMean(offset, w, h, r), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.min(1, Math.max(0, meanSlope[i] * guide[i] + meanOffset[i]));
  return out;
}

/** A separable Gaussian with edge clamping, as Core Image's blur over a clamped extent. */
function gaussian(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const rad = Math.max(1, Math.ceil(sigma * 3)), k = new Float32Array(rad * 2 + 1);
  let total = 0;
  for (let i = -rad; i <= rad; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k[i + rad] = v; total += v; }
  for (let i = 0; i < k.length; i++) k[i] /= total;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -rad; i <= rad; i++) s += src[y * w + Math.min(w - 1, Math.max(0, x + i))] * k[i + rad];
      tmp[y * w + x] = s;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -rad; i <= rad; i++) s += tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x] * k[i + rad];
      out[y * w + x] = s;
    }
  }
  return out;
}

/** The refined subject mask, in Refine pulls the mask onto the image's own edges, Shift Edge blurs
 *  by half its reach and cuts hard at 0.25 (grow) or 0.75 (shrink), and Contrast pushes the grays apart (100 is a hard
 *  cut at the middle). Basic returns the model's mask unchanged. */
export function refineMatte(mask: Float32Array, guide: Float32Array, w: number, h: number, s: MatteSettings, scale = 1): Float32Array {
  if (s.quality !== 'advanced') return mask;
  let m = mask;
  if (s.refineEdges > 0) m = guidedFilter(m, guide, w, h, Math.max(1, Math.round(s.refineEdges * scale)), 1e-4);
  if (s.shiftEdge !== 0) {
    const level = s.shiftEdge < 0 ? 0.75 : 0.25, blurred = gaussian(m, w, h, (Math.abs(s.shiftEdge) / 2) * scale);
    m = new Float32Array(w * h);
    for (let i = 0; i < m.length; i++) m[i] = Math.min(1, Math.max(0, (blurred[i] - level) * 1000));
  }
  if (s.matteContrast > 0) {
    const slope = 1 / Math.max(0.02, 1 - (s.matteContrast / 100) * 0.98), bias = (1 - slope) / 2, out = new Float32Array(w * h);
    for (let i = 0; i < out.length; i++) out[i] = Math.min(1, Math.max(0, slope * m[i] + bias));
    m = out;
  }
  return m;
}

/** 0 to 1 levels of an image: a mask's gray (its alpha counting as coverage), or a guide's luminance over black, as
 * draws both into a gray context. */
export function levelsOf(img: ImageData, luminance: boolean): Float32Array {
  const d = img.data, out = new Float32Array(img.width * img.height);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) {
    const a = d[j + 3] / 255;
    out[i] = (luminance ? (0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]) / 255 : (d[j] + d[j + 1] + d[j + 2]) / 765) * a;
  }
  return out;
}
