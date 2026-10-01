import type { RGB } from './types';

/** The Mixer Brush (1.56.2, the parity plan's L4), as Photoshop's: a wet brush that picks up the paint under it and
 *  mixes it with the paint it carries. Each dab the tip picks up the canvas's colour under it by Wet; the colour it
 *  lays is the reservoir's and the picked-up paint's, mixed by Mix; the reservoir drains as it paints, at a rate set
 *  by Load, so a long stroke ends in picked-up paint alone. Load the brush after each stroke refills the reservoir
 *  from the foreground colour; Clean the brush after each stroke empties the picked-up paint. */

export interface MixerSettings { wet: number; load: number; mix: number; loadEach: boolean; cleanEach: boolean; sampleAll: boolean }
export const DEFAULT_MIXER: MixerSettings = { wet: 50, load: 50, mix: 50, loadEach: true, cleanEach: true, sampleAll: false };

/** What the brush holds between dabs and, when neither refill is on, between strokes. */
export interface MixerState { reservoir: RGB; picked: RGB; level: number }

const mixRgb = (a: RGB, b: RGB, t: number): RGB => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });

/** The state at a stroke's start: refilled and cleaned as the settings say. */
export function mixerStart(prev: MixerState | null, fg: RGB, s: MixerSettings): MixerState {
  const reservoir = !prev || s.loadEach ? { ...fg } : prev.reservoir, level = !prev || s.loadEach ? 1 : prev.level;
  return { reservoir, level, picked: !prev || s.cleanEach ? { ...reservoir } : prev.picked };
}

/** The colour source for one stroke: `sample` reads the canvas under a dab (null where it is empty). */
export function mixerSource(state: MixerState, s: MixerSettings, sample: (x: number, y: number) => RGB | null): (x: number, y: number) => RGB {
  const wet = Math.max(0, Math.min(1, s.wet / 100)), mix = Math.max(0, Math.min(1, s.mix / 100)), reach = Math.max(1, s.load) * 8;
  let last: { x: number; y: number } | null = null;
  return (x, y) => {
    const under = sample(x, y);
    if (under) state.picked = mixRgb(state.picked, under, wet);
    const share = 1 - (1 - mix) * state.level;
    if (last) state.level = Math.max(0, state.level - Math.hypot(x - last.x, y - last.y) / reach);
    last = { x, y };
    const c = mixRgb(state.reservoir, state.picked, share);
    return { r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) };
  };
}

/** The canvas's colour under a dab from pixels read once at the stroke's start: the opacity-weighted mean of a small
 *  window, through `toPixels` (document to pixel coordinates); null where every pixel there is empty. */
export function windowSampler(img: ImageData, toPixels: (x: number, y: number) => { x: number; y: number }, radius: number): (x: number, y: number) => RGB | null {
  const { width: w, height: h, data: d } = img, r = Math.max(1, Math.min(6, Math.round(radius))), step = Math.max(1, Math.round(r / 3));
  return (x, y) => {
    const c = toPixels(x, y), cx = Math.round(c.x), cy = Math.round(c.y);
    let sr = 0, sg = 0, sb = 0, sa = 0;
    for (let j = -r; j <= r; j += step) for (let i = -r; i <= r; i += step) {
      const px = cx + i, py = cy + j;
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      const o = (py * w + px) * 4, a = d[o + 3];
      if (!a) continue;
      sr += d[o] * a; sg += d[o + 1] * a; sb += d[o + 2] * a; sa += a;
    }
    return sa ? { r: sr / sa, g: sg / sa, b: sb / sa } : null;
  };
}
