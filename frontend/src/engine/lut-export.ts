import { kernelFor } from './renderer';
import type { Layer } from './types';
import { ancestors } from './tree';

/** Color lookup tables from a document's adjustment layers (DEV_PLAN 29.6 part a). No DOM.
 *  Layer masks are ignored: a table is one global mapping, so a masked adjustment is recorded as if it covered
 *  the whole picture. Only visible adjustment layers count, mixed in by their opacity. */
export interface LutDoc { readonly layers: readonly Layer[] }

const shown = (doc: LutDoc, l: Layer): boolean => l.visible && ancestors(new Map(doc.layers.map((x) => [x.id, x])), l).every((g) => g.visible);

export const hasVisibleAdjustment = (doc: LutDoc): boolean => doc.layers.some((l) => l.adjustment && shown(doc, l));

/** Run the visible adjustment layers, bottom to top, over an identity lattice of size^3 points (r fastest).
 *  Returns floats 0 to 1, three per point, r fastest. */
export function sampleLut(doc: LutDoc, size: number): Float32Array {
  const n = size * size * size, den = Math.max(1, size - 1);
  let cur = new Uint8ClampedArray(n * 4);
  for (let b = 0, i = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++, i += 4) {
    cur[i] = Math.round((r / den) * 255); cur[i + 1] = Math.round((g / den) * 255); cur[i + 2] = Math.round((b / den) * 255); cur[i + 3] = 255;
  }
  for (const l of doc.layers) {
    if (!l.adjustment || !shown(doc, l)) continue;
    const kernel = kernelFor(l.adjustment);
    if (!kernel) continue;
    const next = new Uint8ClampedArray(cur);
    kernel(next);
    const a = Math.min(1, Math.max(0, l.opacity));
    for (let i = 0; i < next.length; i += 4) for (let c = 0; c < 3; c++) next[i + c] = cur[i + c] + (next[i + c] - cur[i + c]) * a;
    cur = next;
  }
  const out = new Float32Array(n * 3);
  for (let p = 0; p < n; p++) for (let c = 0; c < 3; c++) out[p * 3 + c] = cur[p * 4 + c] / 255;
  return out;
}

/** .cube: r varies fastest. */
export function cubeText(lut: Float32Array, size: number, title: string): string {
  const lines = [`TITLE "${title.replace(/"/g, "'")}"`, `LUT_3D_SIZE ${size}`, ''];
  for (let p = 0; p < size * size * size; p++) lines.push(`${lut[p * 3].toFixed(6)} ${lut[p * 3 + 1].toFixed(6)} ${lut[p * 3 + 2].toFixed(6)}`);
  return lines.join('\n') + '\n';
}

/** Lustre/Flame .3dl: an input shaper line (0..1023), then 12-bit triples with b varying fastest. */
export function threeDlText(lut: Float32Array, size: number): string {
  const lines = [Array.from({ length: size }, (_, i) => Math.round((i / Math.max(1, size - 1)) * 1023)).join(' ')];
  const q = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 4095);
  for (let r = 0; r < size; r++) for (let g = 0; g < size; g++) for (let b = 0; b < size; b++) {
    const p = (b * size + g) * size + r;
    lines.push(`${q(lut[p * 3])} ${q(lut[p * 3 + 1])} ${q(lut[p * 3 + 2])}`);
  }
  return lines.join('\n') + '\n';
}

/** .csp, 3D with identity 1D pre-luts; r varies fastest. */
export function cspText(lut: Float32Array, size: number): string {
  const lines = ['CSPLUTV100', '3D', '', '2', '0.0 1.0', '0.0 1.0', '2', '0.0 1.0', '0.0 1.0', '2', '0.0 1.0', '0.0 1.0', '', `${size} ${size} ${size}`];
  for (let p = 0; p < size * size * size; p++) lines.push(`${lut[p * 3].toFixed(6)} ${lut[p * 3 + 1].toFixed(6)} ${lut[p * 3 + 2].toFixed(6)}`);
  return lines.join('\n') + '\n';
}
