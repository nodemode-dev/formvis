import type { ChannelPixels } from './types';
import { linearToSrgb, srgbToLinear } from './deep';

/** Layer > Convert Layer to 8 Bits / 16 Bits: a layer's float pixels snapped to the steps of a shallower depth. The steps
 *  are those of the encoded value, so a 32-bit (linear light) layer is encoded, snapped and decoded again; alpha is
 *  snapped to the same steps and values outside 0 to 1 are clamped, as a layer of that depth cannot hold them. */
export function quantiseChannels(ch: ChannelPixels, bits: 8 | 16, linear: boolean): ChannelPixels {
  if (ch.mode !== 'rgb') return ch;
  const steps = bits === 8 ? 255 : 65535, src = ch.data, out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) {
    const v = Math.min(1, Math.max(0, src[i])), a = i % 4 === 3;
    out[i] = linear && !a ? srgbToLinear(Math.round(linearToSrgb(v) * steps) / steps) : Math.round(v * steps) / steps;
  }
  return { ...ch, data: out };
}
