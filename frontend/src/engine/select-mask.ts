import { boxMean, refineMatte } from './matte';

/** Select and Mask's Global Refinements, in Photoshop's order: Radius pulls the selection's edge onto the image's
 *  own edges within that distance (the guided filter Remove Background already uses, `matte.ts`), Smooth rounds off
 *  a jagged outline, Feather softens it, Contrast hardens it again, and Shift Edge grows or shrinks it. Masks and
 *  guides hold 0 to 1 per pixel, row by row; distances are in document pixels, shrunk by `scale` for a preview. */
export interface RefineSettings { radius: number; smooth: number; feather: number; contrast: number; shift: number }
export const DEFAULT_REFINE: RefineSettings = { radius: 0, smooth: 0, feather: 0, contrast: 0, shift: 0 };

/** Three box passes of radius r approximate a Gaussian (sigma about r). */
function softBlur(m: Float32Array, w: number, h: number, r: number): Float32Array {
  let out = m;
  for (let i = 0; i < 3; i++) out = boxMean(out, w, h, Math.max(1, Math.round(r / 1.7)));
  return out;
}

export function refineSelection(mask: Float32Array, guide: Float32Array, w: number, h: number, s: RefineSettings, scale = 1): Float32Array {
  const one = (m: Float32Array, refineEdges: number, matteContrast: number, shiftEdge: number): Float32Array => refineMatte(m, guide, w, h, { quality: 'advanced', refineEdges, matteContrast, shiftEdge }, scale);
  let m = mask;
  if (s.radius > 0) m = one(m, s.radius, 0, 0);
  if (s.smooth > 0) {
    const r = Math.max(1, Math.round((s.smooth / 100) * 10 * scale)), b = boxMean(m, w, h, r), out = new Float32Array(m.length);
    for (let i = 0; i < m.length; i++) { const t = Math.min(1, Math.max(0, (b[i] - 0.3) / 0.4)); out[i] = t * t * (3 - 2 * t); }
    m = out;
  }
  if (s.feather > 0) m = softBlur(m, w, h, s.feather * scale);
  if (s.contrast > 0) m = one(m, 0, s.contrast, 0);
  if (s.shift !== 0) m = one(m, 0, 0, s.shift);
  return m;
}

/** The Refine Edge brush: where `region` (0 to 1, what the brush has painted) is set, the edge is worked out again from
 *  the image with a wider matte than Radius alone (twice it, at least 12 document pixels), for hair and fur, and blended
 *  in by how much the brush covered. */
export function refineRegion(mask: Float32Array, guide: Float32Array, region: Float32Array, w: number, h: number, radius: number, scale = 1): Float32Array {
  if (!region.some((v) => v > 0)) return mask;
  const wide = refineMatte(mask, guide, w, h, { quality: 'advanced', refineEdges: Math.max(12, radius * 2), matteContrast: 0, shiftEdge: 0 }, scale);
  const out = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = mask[i] * (1 - region[i]) + wide[i] * region[i];
  return out;
}

/** Decontaminate Colors: each partly selected pixel takes, by `amount` (0 to 100) and most where it is least selected,
 *  the colour of the fully selected pixels near it (a blur of colour weighted by mask to the fourth power, so the
 *  background mixed into an edge is replaced by the subject's own colour). Alpha is left to the mask. */
export function decontaminate(img: ImageData, mask: Float32Array, amount: number, scale = 1): ImageData {
  const { width: w, height: h, data: d } = img, n = w * h, wt = new Float32Array(n), ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) { const k = mask[i] ** 4; wt[i] = k; for (let c = 0; c < 3; c++) ch[c][i] = d[i * 4 + c] * k; }
  const r = Math.max(2, 6 * scale), bw = softBlur(wt, w, h, r), bc = ch.map((x) => softBlur(x, w, h, r));
  const out = new ImageData(new Uint8ClampedArray(d), w, h), o = out.data, k = Math.min(1, Math.max(0, amount / 100));
  for (let i = 0; i < n; i++) {
    const a = mask[i];
    if (a <= 0.01 || a >= 0.99 || bw[i] < 1e-4) continue;
    const t = k * Math.min(1, (1 - a) * 2);
    for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(d[i * 4 + c] * (1 - t) + (bc[c][i] / bw[i]) * t);
  }
  return out;
}
