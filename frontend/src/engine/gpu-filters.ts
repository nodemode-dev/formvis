import type { DevelopState } from './develop';
import { developPerPixelOnly } from './develop';
import type { FilterKind, FilterSettings } from './filter-jobs';

/** The seam between the engine and a GPU filter runner (DEV_PLAN 36.10). The engine never touches the DOM, so the
 *  runner, which owns a WebGL2 context, is built in gpu/filters.ts and registered here by app.ts; with none registered,
 *  or one that answers null (a size the GPU cannot hold, a lost context, a Develop state with stages the GPU does not
 *  do), every filter runs on the CPU as before. Every method is synchronous: a draw and a read-back on a small
 *  offscreen canvas. */
export interface GpuFilterRunner {
  /** False once the context is lost; the engine then ignores the runner. */
  readonly ok: boolean;
  /** Threshold on RGBA bytes, in place; false when not done. */
  threshold(px: Uint8ClampedArray, level: number): boolean;
  gaussianBlur(src: ImageData, sigma: number): ImageData | null;
  addNoise(src: ImageData, amount: number, gaussian: boolean, monochromatic: boolean, seed: number): ImageData | null;
  unsharpMask(src: ImageData, amount: number, radius: number, threshold: number): ImageData | null;
  /** The per-pixel Develop pass; null unless the state is only per-pixel stages (see developPerPixelOnly). */
  develop(src: ImageData, state: DevelopState, seed: number): ImageData | null;
}

let runner: GpuFilterRunner | null = null;
export const setGpuFilters = (r: GpuFilterRunner | null): void => { runner = r; };
export const gpuFilters = (): GpuFilterRunner | null => (runner && runner.ok ? runner : null);

/** `kind` run on the GPU, or null where the GPU does not do it (the caller filters on the CPU). */
export function runFilterOnGpu(kind: FilterKind, s: FilterSettings, scale: number, seed: number, src: ImageData): ImageData | null {
  const g = gpuFilters();
  if (!g) return null;
  try {
    if (kind === 'gaussianBlur') return g.gaussianBlur(src, s.radius * scale);
    if (kind === 'addNoise') return g.addNoise(src, s.amount, s.gaussian, s.monochromatic, seed);
    if (kind === 'unsharpMask') return g.unsharpMask(src, s.usmAmount, s.usmRadius * scale, s.threshold);
    if (kind === 'develop' && developPerPixelOnly(s.develop)) return g.develop(src, s.develop, 7);
  } catch { /* a failed draw: the CPU does it */ }
  return null;
}
