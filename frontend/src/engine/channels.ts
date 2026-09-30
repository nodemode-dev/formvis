import type { ChannelPixels, Doc } from './types';
import { applyLut4, type Lut4 } from './colour-lut';
import { place } from './deep';
import { Raster } from './surface';

/** CMYK documents (1.54.0, the parity plan's H1): a layer's ink as floats, its sRGB rendition through the document's
 *  display table, and the document composed in ink for a CMYK export. The engine converts pixels exactly (LittleCMS);
 *  the window only shows them. */
export function channelsFromU8(u8: Uint8Array, width: number, height: number): ChannelPixels {
  const data = new Float32Array(u8.length);
  for (let i = 0; i < u8.length; i++) data[i] = u8[i] / 255;
  return { mode: 'cmyk', width, height, data };
}

export function channelsToU8(data: Float32Array): Uint8Array {
  const u8 = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) u8[i] = Math.round(Math.min(1, Math.max(0, data[i])) * 255);
  return u8;
}

export function rasterFromChannels(ch: ChannelPixels, lut: Lut4): Raster {
  const r = new Raster(ch.width, ch.height), img = r.ctx.createImageData(ch.width, ch.height);
  applyLut4(ch.data, lut, img.data);
  r.ctx.putImageData(img, 0, 0); r.touch();
  return r;
}

/** RGBA bytes of a raster as the engine's conversion wants them (straight alpha, four a pixel). */
export function rasterBytes(r: Raster): Uint8Array {
  return new Uint8Array(r.ctx.getImageData(0, 0, r.width, r.height).data.buffer.slice(0));
}

/** The document composed in ink, straight alpha, five floats a pixel: Normal blending only, as composeDeep. */
export function composeChannels(doc: Doc): { width: number; height: number; data: Float32Array } | { error: string } {
  const W = doc.width, H = doc.height, out = new Float32Array(W * H * 5);
  for (const l of doc.layers) {
    if (!l.visible) continue;
    const name = `"${l.name}"`;
    if (l.isGroup || l.mask || l.clipId || l.effects || (l.blend && l.blend !== 'normal')) return { error: `${name} uses a group, mask, clipping, style or blend mode, which CMYK export does not compose yet.` };
    if (l.adjustment) return { error: `${name} is an adjustment CMYK export does not compose yet.` };
    if (!l.channels) { if (l.raster) return { error: `${name} has no CMYK ink; Image > Mode > CMYK Color converts it.` }; continue; }
    place(out, W, H, l.channels, l.transform, l.opacity * (l.fill ?? 1), 5);
  }
  return { width: W, height: H, data: out };
}
