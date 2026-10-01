import type { ChannelPixels, Doc } from './types';
import { applyLut4, renditionOf, type Ink, type Lut4 } from './colour-lut';
import { place } from './deep';
import { composeFloat } from './compose-float';
import { Raster } from './surface';

/** CMYK documents (1.54.0, the parity plan's H1): a layer's ink as floats, its sRGB rendition through the document's
 *  display table, and the document composed in ink for a CMYK export. The engine converts pixels exactly (LittleCMS);
 *  the window only shows them. */
export function channelsFromU8(u8: Uint8Array, width: number, height: number): ChannelPixels {
  const data = new Float32Array(u8.length);
  for (let i = 0; i < u8.length; i++) data[i] = u8[i] / 255;
  return { mode: 'cmyk', n: 4, width, height, data };
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
  return composeFloat(doc, 4, true);
}

/** A stroke rebuilt on a layer's ink from the 8-bit rendition it painted (1.54.2, as strokeDeep): each changed pixel's
 *  coverage is inferred from the rendition's change towards the paint's own rendition, then the ink moves by that
 *  coverage towards `paint` (null: the eraser thins alpha, or paints `background` where alpha is locked); with `only`,
 *  a single channel takes the paint and alpha stays. Returns the ink and the region's rendition redrawn from it. */
export function strokeChannels(ch: ChannelPixels, before: ImageData, after: ImageData, x: number, y: number, paint: Ink | null, background: Ink, lut: Lut4, only: number | null): { channels: ChannelPixels; region: Uint8ClampedArray } {
  const out = new Float32Array(ch.data), bw = before.width, bh = before.height, B = before.data, A = after.data, W = ch.width;
  const P = paint ? renditionOf(paint, lut) : null, BG = renditionOf(background, lut);
  for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
    const px = x + i, py = y + j;
    if (px < 0 || py < 0 || px >= W || py >= ch.height) continue;
    const s = (j * bw + i) * 4;
    if (B[s] === A[s] && B[s + 1] === A[s + 1] && B[s + 2] === A[s + 2] && B[s + 3] === A[s + 3]) continue;
    const o = (py * W + px) * 5;
    let ink = paint, C = P;
    if (!ink) {
      if (A[s + 3] !== B[s + 3] || B[s + 3] === 0) { out[o + 4] = B[s + 3] > 0 ? out[o + 4] * (A[s + 3] / B[s + 3]) : A[s + 3] / 255; continue; }
      ink = background; C = BG;
    }
    const c3 = [C!.r, C!.g, C!.b];
    let a = -1;
    if (B[s + 3] < 250) a = (A[s + 3] - B[s + 3]) / Math.max(1, 255 - B[s + 3]);
    else { let num = 0, den = 0; for (let c = 0; c < 3; c++) { const d = c3[c] - B[s + c]; num += (A[s + c] - B[s + c]) * d; den += d * d; } if (den >= 9) a = num / den; }
    if (a < 0 || !Number.isFinite(a)) a = Math.abs(A[s + 3] - B[s + 3]) / 255 || 1;
    a = Math.min(1, a);
    if (only !== null) { out[o + only] = ink[only] * a + out[o + only] * (1 - a); if (out[o + 4] === 0) out[o + 4] = a; continue; }
    const oa = out[o + 4], na = a + oa * (1 - a);
    for (let c = 0; c < 4; c++) out[o + c] = na > 0 ? (ink[c] * a + out[o + c] * oa * (1 - a)) / na : ink[c];
    out[o + 4] = na;
  }
  const region = new Uint8ClampedArray(bw * bh * 4), strip = new Float32Array(bw * bh * 5);
  for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
    const px = x + i, py = y + j, d = (j * bw + i) * 5;
    if (px < 0 || py < 0 || px >= W || py >= ch.height) continue;
    const o = (py * W + px) * 5;
    for (let c = 0; c < 5; c++) strip[d + c] = out[o + c];
  }
  applyLut4(strip, lut, region);
  return { channels: { ...ch, data: out }, region };
}
