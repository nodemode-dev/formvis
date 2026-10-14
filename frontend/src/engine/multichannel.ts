import type { RGB } from './types';

/** Multichannel mode (DEV_PLAN 31.3 part b): a document that is a set of grey spot channels, each with an ink colour,
 *  shown overprinted on white. This module is pixel maths only, on RGBA byte arrays; the engine wraps the grey planes
 *  in Rasters. A channel's grey is as Photoshop shows it: black (0) is full ink, white (255) is none. */
export interface SplitChannel { name: string; color: RGB; solidity: number; grey: Uint8ClampedArray }

const INKS = {
  cyan: { name: 'Cyan', color: { r: 0, g: 174, b: 239 } },
  magenta: { name: 'Magenta', color: { r: 236, g: 0, b: 140 } },
  yellow: { name: 'Yellow', color: { r: 255, g: 242, b: 0 } },
  black: { name: 'Black', color: { r: 0, g: 0, b: 0 } },
} as const;

/** The flattened picture (RGBA, over white where transparent) split by the source mode: RGB gives Cyan, Magenta, Yellow
 *  as 255 minus R, G, B ink; CMYK adds Black from the shared dark; Grayscale gives one Black channel. Solid pixels
 *  store grey = 255 - ink, so the composite of an RGB split returns the picture. */
export function splitChannels(rgba: Uint8ClampedArray | Uint8Array, mode: 'rgb' | 'cmyk' | 'grayscale'): SplitChannel[] {
  const n = rgba.length >> 2;
  const make = (k: keyof typeof INKS): SplitChannel => ({ ...INKS[k], solidity: 1, grey: new Uint8ClampedArray(n) });
  const white = (v: number, a: number): number => Math.round(v * a + 255 * (1 - a));
  if (mode === 'grayscale') {
    const k = make('black');
    for (let i = 0; i < n; i++) k.grey[i] = white(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2], rgba[i * 4 + 3] / 255);
    return [k];
  }
  const c = make('cyan'), m = make('magenta'), y = make('yellow'), out = [c, m, y];
  const k = mode === 'cmyk' ? make('black') : null;
  if (k) out.push(k);
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3] / 255, r = white(rgba[i * 4], a), g = white(rgba[i * 4 + 1], a), b = white(rgba[i * 4 + 2], a);
    if (k) {
      // CMYK: the darkest ink share moves to Black, the rest stays in the colour channels.
      const kk = 255 - Math.max(r, g, b), d = 255 - kk || 1;
      k.grey[i] = 255 - kk;
      c.grey[i] = 255 - Math.round(((255 - r - kk) / d) * 255);
      m.grey[i] = 255 - Math.round(((255 - g - kk) / d) * 255);
      y.grey[i] = 255 - Math.round(((255 - b - kk) / d) * 255);
    } else { c.grey[i] = r; m.grey[i] = g; y.grey[i] = b; }
  }
  return out;
}

/** Overprint the channels on white into `out` (RGBA, opaque): per pixel, per RGB channel, multiply by
 *  (1 - amount * (1 - ink / 255)) with amount = (255 - grey) / 255 * solidity. */
export function compositeChannels(channels: readonly { color: RGB; solidity: number; grey: ArrayLike<number> }[], out: Uint8ClampedArray): void {
  const n = out.length >> 2;
  for (let i = 0; i < n; i++) {
    let r = 255, g = 255, b = 255;
    for (const ch of channels) {
      const amt = ((255 - ch.grey[i]) / 255) * ch.solidity;
      if (amt <= 0) continue;
      r *= 1 - amt * (1 - ch.color.r / 255); g *= 1 - amt * (1 - ch.color.g / 255); b *= 1 - amt * (1 - ch.color.b / 255);
    }
    out[i * 4] = Math.round(r); out[i * 4 + 1] = Math.round(g); out[i * 4 + 2] = Math.round(b); out[i * 4 + 3] = 255;
  }
}
