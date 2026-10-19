import type { RGB } from './types';
import type { SelectionMode } from './selection';

/** Select > Color Range's settings. `combine` is how the result meets the selection already there (left out, the
 *  result is kept within it); `lo` and `hi` (0 to 255) bound Depth, near being bright. */
export interface ColorRangeOptions {
  mode: ColorRangeMode;
  plus: RGB[];
  minus: RGB[];
  fuzziness: number;
  invert: boolean;
  combine?: SelectionMode;
  /** Localized Color Clusters: each `plus` colour counts only near its point in `at` (document pixels, one a colour),
   *  fading out `spread` percent (0 to 100) of the picture's diagonal away. */
  localized?: boolean;
  spread?: number;
  at?: Array<{ x: number; y: number }>;
  lo?: number;
  hi?: number;
}

export const HUE_FAMILIES = { reds: 0, yellows: 60, greens: 120, cyans: 180, blues: 240, magentas: 300 } as const;
export type ColorRangeMode = 'sampled' | 'highlights' | 'midtones' | 'shadows' | 'skin' | 'depth' | 'luminosity' | 'gamut' | keyof typeof HUE_FAMILIES;

export const COLOR_RANGE_MODES: ReadonlyArray<readonly [ColorRangeMode, string]> = [
  ['sampled', 'Sampled Colors'], ['reds', 'Reds'], ['yellows', 'Yellows'], ['greens', 'Greens'], ['cyans', 'Cyans'], ['blues', 'Blues'], ['magentas', 'Magentas'],
  ['highlights', 'Highlights'], ['midtones', 'Midtones'], ['shadows', 'Shadows'], ['skin', 'Skin Tones'], ['gamut', 'Out Of Gamut'], ['depth', 'Depth'], ['luminosity', 'Luminosity Range'],
];

/** Hue (degrees), saturation and value of a colour, 0 to 255 channels. */
export function hsvOf(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: mx ? d / mx : 0, v: mx / 255 };
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const hueGap = (a: number, b: number): number => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

/** How much a hue family or skin tone takes a pixel, 0 to 1: whole within 15 degrees of the family's centre, falling off
 *  over 15 degrees plus 0.3 of Fuzziness; greys and near blacks are no colour at all. */
export function hueWeight(mode: Exclude<ColorRangeMode, 'sampled' | 'highlights' | 'midtones' | 'shadows' | 'depth' | 'luminosity' | 'gamut'>, r: number, g: number, b: number, fuzziness: number): number {
  const { h, s, v } = hsvOf(r, g, b), ramp = 15 + Math.max(0, fuzziness) * 0.3;
  if (mode === 'skin') {
    const hue = clamp01(1 - (hueGap(h, 22) - 14) / ramp);
    return hue * clamp01((s - 0.08) / 0.1) * clamp01((0.8 - s) / 0.1) * clamp01((v - 0.15) / 0.1);
  }
  return clamp01(1 - (hueGap(h, HUE_FAMILIES[mode]) - 15) / ramp) * clamp01(s * 4) * clamp01((v - 0.04) / 0.06);
}

/** How much a depth value (0 to 255) lies inside `lo` to `hi`: whole inside, falling to none over `ramp` levels outside. */
export function depthWeight(d: number, lo: number, hi: number, ramp: number): number {
  return clamp01(1 - Math.max(lo - d, d - hi, 0) / Math.max(1, ramp));
}
