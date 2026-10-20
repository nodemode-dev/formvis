import { blurDeep, motionBlurDeep, noiseDeep, surfaceBlurDeep, unsharpDeep } from './deep';
import { deepLibFilter } from './deep-filters';
import { libValues, isLibKind } from './filter-library';
import type { FilterKind, FilterSettings } from './filter-jobs';
import type { DeepPixels } from './types';

/** The 16 and 32 bit filters that run in bands (DEV_PLAN 36.18): each pixel depends only on a fixed reach of its
 *  neighbours and on nothing about where the layer sits, so a band with its apron gives the rows the whole layer gives.
 *  Not here: the filters placed in the picture (radial, path, field, iris, tilt-shift, spin, lens blur and the displacing
 *  or warping ones), those that draw from the layer's or document's frame (clouds, render, halftone, dither, scanlines,
 *  tiles, offset, Reduce Noise, Oil Paint), Smart Sharpen and Shake Reduction (wider than their margin) and the
 *  Box Blur (its running sums carry rounding from the band's first row, so a band's floats differ in the last bits) and the
 *  seeded scatter ones (Diffuse, Wind, Crystallize, Pointillize, Mezzotint), whose random sequence follows the whole layer. */
export const DEEP_BAND_LIB: readonly string[] = ['blur', 'blurMore', 'shapeBlur', 'smartBlur', 'sharpen', 'sharpenMore', 'sharpenEdges', 'highPass', 'maximum', 'minimum', 'median', 'dustAndScratches', 'despeckle', 'emboss', 'findEdges', 'custom', 'tonalContrast'];

export const deepBandable = (kind: FilterKind): boolean => kind === 'gaussianBlur' || kind === 'unsharpMask' || kind === 'motionBlur' || kind === 'surfaceBlur' || kind === 'addNoise' || (isLibKind(kind) && DEEP_BAND_LIB.includes(kind));

/** `kind` on a band of floats whose first pixel is the layer's pixel `first`, by the very function the whole layer runs. */
export function deepBandRun(kind: FilterKind, s: FilterSettings, seed: number, ceiling: number, first: number, band: DeepPixels): DeepPixels | null {
  if (kind === 'gaussianBlur') return blurDeep(band, s.radius);
  if (kind === 'unsharpMask') return unsharpDeep(band, s.usmAmount, s.usmRadius, s.threshold, ceiling);
  if (kind === 'motionBlur') return motionBlurDeep(band, s.angle, s.distance);
  if (kind === 'surfaceBlur') return surfaceBlurDeep(band, s.gallery.surfaceRadius, s.gallery.surfaceThreshold);
  if (kind === 'addNoise') return noiseDeep(band, s.amount, s.gaussian, s.monochromatic, seed, ceiling, first);
  if (!isLibKind(kind) || !DEEP_BAND_LIB.includes(kind)) return null;
  const run = deepLibFilter(kind, libValues(kind, (s.lib as Record<string, unknown> | undefined)?.[kind]), ceiling, seed);
  return run ? run(band) : null;
}
