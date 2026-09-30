import type { Adjustment, DeepPixels, Doc } from './types';
import { adjustmentKernel } from './kernels';
import { Raster } from './surface';

/** 16-bit documents (1.53.6, the parity plan's H1): a layer's 16-bit pixels as floats, and the document composed in
 *  floating point for a 16-bit export. Adjustments are the same transfer functions as the 8-bit ones, evaluated at the
 *  pixel's own value rather than looked up in a 256-entry table. */
export function deepFromU16(u16: Uint16Array, width: number, height: number): DeepPixels {
  const data = new Float32Array(u16.length);
  for (let i = 0; i < u16.length; i++) data[i] = u16[i] / 65535;
  return { width, height, data };
}

export function deepToU16(data: Float32Array): Uint16Array {
  const out = new Uint16Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = Math.round(Math.min(1, Math.max(0, data[i])) * 65535);
  return out;
}

export function deepFromRaster(r: Raster): DeepPixels {
  const d = r.ctx.getImageData(0, 0, r.width, r.height).data, data = new Float32Array(d.length);
  for (let i = 0; i < d.length; i++) data[i] = d[i] / 255;
  return { width: r.width, height: r.height, data };
}

export function rasterFromDeep(deep: DeepPixels): Raster {
  const r = new Raster(deep.width, deep.height), img = r.ctx.createImageData(deep.width, deep.height);
  for (let i = 0; i < deep.data.length; i++) img.data[i] = Math.round(Math.min(1, Math.max(0, deep.data[i])) * 255);
  r.ctx.putImageData(img, 0, 0); r.touch();
  return r;
}

/** The adjustment's transfer on a continuous level 0 to 255, when it has one (Levels, Curves, Exposure). */
export function transferOf(adj: Adjustment): ((channel: number, level: number) => number) | null {
  return (adjustmentKernel(adj) as unknown as { transfer?: (c: number, l: number) => number } | null)?.transfer ?? null;
}

/** The document composed in floating point, bottom layer first; an error naming what 16 bits cannot compose yet. */
export function composeDeep(doc: Doc): { width: number; height: number; data: Float32Array } | { error: string } {
  const W = doc.width, H = doc.height, out = new Float32Array(W * H * 4);
  for (const l of doc.layers) {
    if (!l.visible) continue;
    const name = `"${l.name}"`;
    if (l.isGroup || l.mask || l.clipId || l.effects || (l.blend && l.blend !== 'normal')) return { error: `${name} uses a group, mask, clipping, style or blend mode, which 16-bit export does not compose yet.` };
    const op = l.opacity * (l.fill ?? 1);
    if (l.adjustment) {
      const t = transferOf(l.adjustment);
      if (!t) return { error: `${name} is an adjustment 16-bit export does not compose yet (Levels, Curves and Exposure do).` };
      for (let i = 0; i < out.length; i += 4) for (let c = 0; c < 3; c++) { const v = out[i + c], nv = Math.min(1, Math.max(0, t(c, v * 255) / 255)); out[i + c] = v + (nv - v) * op; }
      continue;
    }
    if (!l.raster) continue;
    const tf = l.transform;
    if (tf.rotation || tf.flipX || tf.flipY || tf.w !== l.raster.width || tf.h !== l.raster.height) return { error: `${name} is scaled, rotated or flipped, which 16-bit export does not compose yet.` };
    const src = l.deep ?? deepFromRaster(l.raster), ox = Math.round(tf.x), oy = Math.round(tf.y);
    for (let y = Math.max(0, oy); y < Math.min(H, oy + src.height); y++) for (let x = Math.max(0, ox); x < Math.min(W, ox + src.width); x++) {
      const s = ((y - oy) * src.width + (x - ox)) * 4, o = (y * W + x) * 4, sa = src.data[s + 3] * op, oa = out[o + 3], na = sa + oa * (1 - sa);
      if (na <= 0) continue;
      for (let c = 0; c < 3; c++) out[o + c] = (src.data[s + c] * sa + out[o + c] * oa * (1 - sa)) / na;
      out[o + 3] = na;
    }
  }
  return { width: W, height: H, data: out };
}
