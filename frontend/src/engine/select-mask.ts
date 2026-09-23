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
