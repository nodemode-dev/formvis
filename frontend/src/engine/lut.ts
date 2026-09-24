import { adjustmentKernel } from './kernels';
import type { Adjustment, AdjustmentKind } from './types';

/** Adjustments the GPU applies as per-channel lookup tables (Phase 18.5): kinds whose output channel depends only on the
 *  same input channel. The table is made by the CPU kernel itself, run over the 256 greys, so the GPU applies exactly
 *  the CPU's numbers; then the kernel is run over a 16 x 16 x 16 lattice of colours at a document offset, and the table
 *  must predict every result exactly. A kind outside the list, or settings for which that proof fails (a channel that
 *  borrows from another, a result that depends on position), gives null, and the document draws on the CPU. */
export const LUT_KINDS: ReadonlySet<AdjustmentKind> = new Set<AdjustmentKind>(['levels', 'curves', 'exposure', 'invert', 'posterize', 'brightnessContrast']);

const cache = new WeakMap<object, Uint8Array | null>();

export function adjustmentLut(adj: Adjustment): Uint8Array | null {
  if (!LUT_KINDS.has(adj.kind)) return null;
  const hit = cache.get(adj.data);
  if (hit !== undefined) return hit;
  const kernel = adjustmentKernel(adj);
  let out: Uint8Array | null = null;
  if (kernel) {
    const ramp = new Uint8ClampedArray(256 * 4);
    for (let i = 0; i < 256; i++) ramp.set([i, i, i, 255], i * 4);
    kernel(ramp, { width: 256, height: 1, originX: 0, originY: 0, unitsPerPixel: 1 });
    const lut = new Uint8Array(ramp);
    const n = 4096, probe = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) probe.set([(i & 15) * 17, ((i >> 4) & 15) * 17, (i >> 8) * 17, 255], i * 4);
    const input = new Uint8ClampedArray(probe);
    kernel(probe, { width: 64, height: 64, originX: 37, originY: 11, unitsPerPixel: 1 });
    let exact = true;
    for (let i = 0; i < n && exact; i++) for (let c = 0; c < 3; c++) if (probe[i * 4 + c] !== lut[input[i * 4 + c] * 4 + c]) { exact = false; break; }
    out = exact ? lut : null;
  }
  cache.set(adj.data, out);
  return out;
}
