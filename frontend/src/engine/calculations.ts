/** Image > Calculations (DEV_PLAN 31.2b): two single channels blended into a third, as pure functions over greys.
 *  A grey is a Uint8Array of one byte per pixel, 0 to 255. Source 2 is the backdrop and Source 1 the blended
 *  channel, so the symmetric modes (Multiply, Screen, Difference) read the same either way round. */

export const CALC_MODES = ['normal', 'multiply', 'screen', 'overlay', 'soft-light', 'hard-light', 'darken', 'lighten', 'difference', 'exclusion', 'color-dodge', 'color-burn', 'linear-burn', 'linear-dodge', 'add', 'subtract'] as const;
export type CalcMode = (typeof CALC_MODES)[number];

export const CALC_COLOR_CHANNELS = ['gray', 'red', 'green', 'blue', 'transparency'] as const;
export type CalcColorChannel = (typeof CALC_COLOR_CHANNELS)[number];

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

const overlay = (b: number, s: number): number => (b <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s));
const softLight = (b: number, s: number): number => {
  if (s <= 0.5) return b - (1 - 2 * s) * b * (1 - b);
  const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
  return b + (2 * s - 1) * (d - b);
};
const dodge = (b: number, s: number): number => (b <= 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s)));
const burn = (b: number, s: number): number => (b >= 1 ? 1 : s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s));

/** The result of one pixel pair (0 to 1 in, 0 to 1 out, unclamped for Add and Subtract before scale and offset). */
function formula(mode: CalcMode, b: number, s: number): number {
  switch (mode) {
    case 'normal': return s;
    case 'multiply': return b * s;
    case 'screen': return b + s - b * s;
    case 'overlay': return overlay(b, s);
    case 'soft-light': return softLight(b, s);
    case 'hard-light': return overlay(s, b);
    case 'darken': return Math.min(b, s);
    case 'lighten': return Math.max(b, s);
    case 'difference': return Math.abs(b - s);
    case 'exclusion': return b + s - 2 * b * s;
    case 'color-dodge': return dodge(b, s);
    case 'color-burn': return burn(b, s);
    case 'linear-burn': return b + s - 1;
    case 'linear-dodge': return b + s;
    case 'add': return b + s;
    case 'subtract': return b - s;
  }
}

/** One channel of RGBA pixels as a grey. Gray is the luminosity 0.299, 0.587, 0.114. */
export function channelOf(rgba: ArrayLike<number>, channel: CalcColorChannel): Uint8Array {
  const n = rgba.length >> 2, out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    out[i] = channel === 'red' ? rgba[o] : channel === 'green' ? rgba[o + 1] : channel === 'blue' ? rgba[o + 2] : channel === 'transparency' ? rgba[o + 3] : Math.round(0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2]);
  }
  return out;
}

export function invertGrey(g: Uint8Array): Uint8Array {
  const out = new Uint8Array(g.length);
  for (let i = 0; i < g.length; i++) out[i] = 255 - g[i];
  return out;
}

export interface CalcBlend { mode: CalcMode; opacity: number; scale: number; offset: number; mask?: Uint8Array | null }

/** Blends `src` (Source 1) onto `back` (Source 2): the mode's result, scaled and offset for Add and Subtract (the sum or
 *  difference divided by `scale` 1 to 2, plus `offset` -255 to 255), then mixed over the backdrop by opacity (0 to 1) and
 *  the optional mask. Equal lengths are the caller's to check. */
export function blendGreys(back: Uint8Array, src: Uint8Array, o: CalcBlend): Uint8Array {
  const out = new Uint8Array(back.length), scaled = o.mode === 'add' || o.mode === 'subtract';
  const scale = Math.min(2, Math.max(1, o.scale || 1)), off = (Number.isFinite(o.offset) ? o.offset : 0) / 255, op = clamp01(o.opacity);
  for (let i = 0; i < back.length; i++) {
    const b = back[i] / 255, s = src[i] / 255;
    let r = formula(o.mode, b, s);
    if (scaled) r = r / scale + off;
    r = clamp01(r);
    const a = op * (o.mask ? o.mask[i] / 255 : 1);
    out[i] = Math.round(255 * (b + (r - b) * a));
  }
  return out;
}
