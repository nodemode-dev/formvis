import { blurDeep, motionBlurDeep, noiseDeep, surfaceBlurDeep, unsharpDeep } from './deep';
import { BOX_BLOCK, boxBlurDeep, deepLibFilter } from './deep-filters';
import { libValues, isLibKind } from './filter-library';
import type { FilterKind, FilterSettings } from './filter-jobs';
import type { DeepPixels } from './types';

/** The 16 and 32 bit filters that run in bands (DEV_PLAN 36.18): each pixel depends only on a fixed reach of its
 *  neighbours and on nothing about where the layer sits, so a band with its apron gives the rows the whole layer gives.
 *  Not here: the filters placed in the picture (radial, path, field, iris, tilt-shift, spin, lens blur and the displacing
 *  or warping ones), those that draw from the layer's or document's frame (clouds, render, halftone, dither, scanlines,
 *  tiles, offset, Reduce Noise, Oil Paint), Smart Sharpen and Shake Reduction (wider than their margin) and the
 *  seeded scatter ones (Diffuse, Wind, Crystallize, Pointillize, Mezzotint), whose random sequence follows the whole layer. */
export const DEEP_BAND_LIB: readonly string[] = ['blur', 'blurMore', 'shapeBlur', 'smartBlur', 'sharpen', 'sharpenMore', 'sharpenEdges', 'highPass', 'maximum', 'minimum', 'median', 'dustAndScratches', 'despeckle', 'emboss', 'findEdges', 'custom', 'tonalContrast'];

export const deepBandable = (kind: FilterKind): boolean => kind === 'boxBlur' || kind === 'gaussianBlur' || kind === 'unsharpMask' || kind === 'motionBlur' || kind === 'surfaceBlur' || kind === 'addNoise' || (isLibKind(kind) && DEEP_BAND_LIB.includes(kind));

/** Rows per band: at least 512 and the apron; for Box Blur a multiple of its 512-row blocks, so a band starts where a block does. */
export const deepBandRows = (kind: FilterKind, apron: number): number => {
  const rows = Math.max(512, apron);
  return kind === 'boxBlur' ? Math.ceil(rows / BOX_BLOCK) * BOX_BLOCK : rows;
};

/** `kind` on a band of floats whose first pixel is the layer's pixel `first`, by the very function the whole layer runs. */
export function deepBandRun(kind: FilterKind, s: FilterSettings, seed: number, ceiling: number, first: number, band: DeepPixels): DeepPixels | null {
  if (kind === 'boxBlur') { const v = libValues(kind, (s.lib as Record<string, unknown> | undefined)?.[kind]).radius; return boxBlurDeep(band, typeof v === 'number' ? v : 0, Math.round(first / band.width)); }
  if (kind === 'gaussianBlur') return blurDeep(band, s.radius);
  if (kind === 'unsharpMask') return unsharpDeep(band, s.usmAmount, s.usmRadius, s.threshold, ceiling);
  if (kind === 'motionBlur') return motionBlurDeep(band, s.angle, s.distance);
  if (kind === 'surfaceBlur') return surfaceBlurDeep(band, s.gallery.surfaceRadius, s.gallery.surfaceThreshold);
  if (kind === 'addNoise') return noiseDeep(band, s.amount, s.gaussian, s.monochromatic, seed, ceiling, first);
  if (!isLibKind(kind) || !DEEP_BAND_LIB.includes(kind)) return null;
  const run = deepLibFilter(kind, libValues(kind, (s.lib as Record<string, unknown> | undefined)?.[kind]), ceiling, seed);
  return run ? run(band) : null;
}
