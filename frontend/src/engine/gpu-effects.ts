import type { Surface } from './surface';
import type { Rect, RGB } from './types';

/** The seam between the layer-style builder and a GPU effect-map runner (PC-EN-0507). The renderer keeps building every
 *  effect on the CPU; where a runner is registered (gpu/filters.ts, by app.ts) and the setting is one the shaders do,
 *  the coverage comes from fragment passes over the silhouette instead, and any null answer leaves the CPU builder to it.
 *  Sizes and offsets are in the pixels of the surface the silhouette is drawn on. */
export type GpuEffectJob =
  /** A blurred, offset and optionally grown (shrunk when `grow` is negative) copy of the silhouette's coverage in one colour (Drop Shadow, Outer Glow); `knockout` clears it under the silhouette. `inner` casts the shadow of everything around the silhouette and keeps it to the silhouette (Inner Shadow, Inner Glow). */
  | { kind: 'cast'; color: RGB; blur: number; dx: number; dy: number; grow: number; knockout: boolean; inner?: boolean }
  /** A distance ramp outside the silhouette: full out to `hold`, falling to nothing at `size` (Outer Glow, Precise). */
  | { kind: 'ramp'; color: RGB; size: number; hold: number }
  /** The silhouette grown by `outer` less the silhouette shrunk by `inner` (Stroke); `clear` also clears it under the silhouette. */
  | { kind: 'ring'; color: RGB; outer: number; inner: number; clear: boolean };

export interface GpuEffectRunner {
  readonly ok: boolean;
  /** Straight RGBA bytes, `box.w` by `box.h`, of the job over the silhouette's `box`; null where the GPU cannot. */
  effectMap(sil: Surface, box: Rect, job: GpuEffectJob, frame?: { x: number; y: number }): ImageData | null;
}

/** The largest grow or shrink (in px) the distance passes take; wider rings go to the CPU, whose distance transform costs the same at any size. */
export const GPU_RING_MAX = 96;

let runner: GpuEffectRunner | null = null;
export const setGpuEffects = (r: GpuEffectRunner | null): void => { runner = r; };

/** The effect map for `job`, or null when no runner is registered, it is lost, or it declined (the caller builds it on the CPU). */
export function runEffectOnGpu(sil: Surface, box: Rect, job: GpuEffectJob, frame?: { x: number; y: number }): ImageData | null {
  if (!runner || !runner.ok) return null;
  const big = job.kind === 'ring' ? Math.max(job.outer, job.inner) : job.kind === 'ramp' ? job.size : Math.abs(job.grow);
  if (big > GPU_RING_MAX) return null;
  try { return runner.effectMap(sil, box, job, frame); } catch { return null; }
}
