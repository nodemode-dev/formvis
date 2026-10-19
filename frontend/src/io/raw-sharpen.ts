import { ctxOf, createSurface, unsharpMask, type ImportedImage } from '../engine';
import { unsharpDeep } from '../engine/deep';
import type { DeepPixels } from '../engine/types';

/** Preferences > Camera Raw Defaults > Sharpen For: output sharpening applied to a camera RAW as it opens. */
export type RawSharpen = 'none' | 'screen' | 'glossy' | 'matte';
export type RawSharpenAmount = 'low' | 'standard' | 'high';
export const RAW_SHARPEN_CHOICES: ReadonlyArray<readonly [RawSharpen, string]> = [['none', 'None'], ['screen', 'Screen'], ['glossy', 'Glossy Paper'], ['matte', 'Matte Paper']];
export const RAW_SHARPEN_AMOUNTS: ReadonlyArray<readonly [RawSharpenAmount, string]> = [['low', 'Low'], ['standard', 'Standard'], ['high', 'High']];
const BASE: Record<Exclude<RawSharpen, 'none'>, { radius: number; amount: number }> = { screen: { radius: 0.6, amount: 50 }, glossy: { radius: 1, amount: 70 }, matte: { radius: 1.5, amount: 90 } };
const GAIN: Record<RawSharpenAmount, number> = { low: 0.6, standard: 1, high: 1.5 };

/** The Unsharp Mask settings for a target and amount, or null for None. */
export function rawSharpenSettings(target: RawSharpen, amount: RawSharpenAmount): { radius: number; amount: number } | null {
  if (target === 'none') return null;
  const b = BASE[target];
  return { radius: b.radius, amount: Math.round(b.amount * GAIN[amount]) };
}

/** An 8-bit RAW sharpened with the Unsharp Mask; the picture is returned unchanged for None. */
export function sharpenRaw8(img: ImportedImage, target: RawSharpen, amount: RawSharpenAmount): ImportedImage {
  const s = rawSharpenSettings(target, amount);
  if (!s) return img;
  const c = createSurface(img.width, img.height), x = ctxOf(c);
  x.drawImage(img.source, 0, 0);
  x.putImageData(unsharpMask(x.getImageData(0, 0, img.width, img.height), s.amount, s.radius, 0), 0, 0);
  return { ...img, source: c };
}

/** A 16-bit RAW sharpened on floats. */
export function sharpenRawDeep(d: DeepPixels, target: RawSharpen, amount: RawSharpenAmount): DeepPixels {
  const s = rawSharpenSettings(target, amount);
  return s ? unsharpDeep(d, s.amount, s.radius, 0) : d;
}
