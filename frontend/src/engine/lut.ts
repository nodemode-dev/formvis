import { adjustmentKernel } from './kernels';
import { hsvFromData, hsvKernel } from './adjust';
import type { Adjustment, AdjustmentKind } from './types';
import { applyLut, type ColourLut } from './colour-lut';

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

/** Channel-mixing adjustments (Phase 18.5): a 52 x 52 x 52 lattice of the CPU kernel's results, a node every 5 levels
 *  (exact 8-bit values), packed into a 2D table (x = r + g * 52, y = b) that the GPU interpolates between the eight
 *  nodes around a colour, then rounds to 8 bits as the kernel's output is. Proof: on 4096 colours off the lattice, the
 *  interpolated result, computed as the shader computes it, must be within 1 level of the kernel; smooth adjustments
 *  pass, and discontinuous ones (Threshold, hard gradient stops) fail and stay on the CPU. */
export const LUT3_N = 52;
export const LUT3_KINDS: ReadonlySet<AdjustmentKind> = new Set<AdjustmentKind>(['hsv', 'vibrance', 'colorBalance', 'channelMixer', 'photoFilter', 'blackWhite', 'selectiveColor', 'threshold', 'gradientMap', 'colorLookup']);
const cache3 = new WeakMap<object, Uint8Array | null>();

/** Interpolation exactly as the shader does it: lattice units, the eight nodes, weights per axis, rounded to 8 bits. */
export function lut3Sample(t: Uint8Array, r: number, g: number, b: number, c: number): number {
  const N = LUT3_N, v = [r / 5, g / 5, b / 5], b0 = v.map((x) => Math.min(Math.floor(x), N - 2)), f = v.map((x, i) => x - b0[i]);
  let acc = 0;
  for (let k = 0; k < 8; k++) {
    const o = [k & 1, (k >> 1) & 1, (k >> 2) & 1], w = o.reduce((m, oi, i) => m * (oi ? f[i] : 1 - f[i]), 1);
    const x = b0[0] + o[0] + (b0[1] + o[1]) * N, y = b0[2] + o[2];
    acc += w * t[(y * N * N + x) * 4 + c];
  }
  return Math.round(acc);
}

const viewCache = new WeakMap<ColourLut, Uint8Array>();

/** The view's colour table (Proof Colors, a document profile, the monitor) as the GPU's 3D table (1.86.2): the CPU
 *  table sampled at every lattice node, so the screen display draws the view on the GPU, last over the stack, instead
 *  of the whole canvas falling back to the CPU and a JavaScript pass over every screen pixel each frame. Both tables
 *  are trilinear over lattices of 8-bit nodes, so the two agree within a level or two for the smooth tables LittleCMS
 *  builds. The gamut warning greys by nearest node, which a smooth table cannot hold, so it stays on the CPU. */
export function viewLut3(lut: ColourLut): Uint8Array {
  const hit = viewCache.get(lut);
  if (hit) return hit;
  const N = LUT3_N, px = new Uint8ClampedArray(N * N * N * 4);
  for (let bi = 0; bi < N; bi++) for (let gi = 0; gi < N; gi++) for (let ri = 0; ri < N; ri++) px.set([ri * 5, gi * 5, bi * 5, 255], (bi * N * N + gi * N + ri) * 4);
  applyLut(px, lut);
  const t = new Uint8Array(px.buffer);
  viewCache.set(lut, t);
  return t;
}

export function adjustmentLut3(adj: Adjustment): Uint8Array | null {
  if (!LUT3_KINDS.has(adj.kind)) return null;
  if ((adj.data.gradientMapSettings as { dither?: boolean } | undefined)?.dither === true || (adj.data.params as { dither?: boolean } | undefined)?.dither === true) return null;
  const hit = cache3.get(adj.data);
  if (hit !== undefined) return hit;
  const kernel = adj.kind === 'hsv' ? hsvKernel(hsvFromData(adj.data)) : adjustmentKernel(adj);
  let out: Uint8Array | null = null;
  if (kernel) {
    const N = LUT3_N, px = new Uint8ClampedArray(N * N * N * 4);
    for (let bi = 0; bi < N; bi++) for (let gi = 0; gi < N; gi++) for (let ri = 0; ri < N; ri++) px.set([ri * 5, gi * 5, bi * 5, 255], (bi * N * N + gi * N + ri) * 4);
    kernel(px, { width: N * N, height: N, originX: 0, originY: 0, unitsPerPixel: 1 });
    const t = new Uint8Array(px);
    const n = 4096, probe = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) probe.set([(i * 37 + 11) % 256, (i * 101 + 3) % 256, (i * 59 + 29) % 256, 255], i * 4);
    const input = new Uint8ClampedArray(probe);
    kernel(probe, { width: 64, height: 64, originX: 0, originY: 0, unitsPerPixel: 1 });
    let within = true;
    for (let i = 0; i < n && within; i++) for (let c = 0; c < 3; c++) if (Math.abs(probe[i * 4 + c] - lut3Sample(t, input[i * 4], input[i * 4 + 1], input[i * 4 + 2], c)) > 1) { within = false; break; }
    out = within ? t : null;
  }
  cache3.set(adj.data, out);
  return out;
}
