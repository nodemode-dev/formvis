import { applyLut4, inkOf, type Ink, type Lut3x4, type Lut4 } from './colour-lut';
import { encodeLab, labFromRgba, renderLab, srgbToLab } from './lab';
import type { ChannelPixels } from './types';

/** Generated pixels through the working table (1.55.9, DEV_PLAN 22.7, the plan's rule 2). An operation that draws
 *  8-bit pixels (text, shapes, gradients, fills, pastes, the retouching tools, the filters not yet on the float
 *  model) leaves a 16-bit or CMYK layer's floats behind; these functions bring them into step. A pixel the operation
 *  did not change keeps its floats exactly. A changed pixel takes the new colour (in CMYK the profile's separation of
 *  it, or the foreground's or background's own ink when the pixel is exactly that colour) and keeps its old
 *  structure in proportion to how small the change was (fully at no change, none from 48 levels), the rule of
 *  1.55.7. A layer that had no floats takes them whole from its pixels. */

export interface DeriveTables { out: Lut4; in: Lut3x4; hints: ReadonlyArray<{ rgb: [number, number, number]; ink: Ink }> }

const KEEP = 48;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

function inkFor(r: number, g: number, b: number, t: DeriveTables): Ink {
  for (const h of t.hints) if (Math.abs(h.rgb[0] - r) <= 2 && Math.abs(h.rgb[1] - g) <= 2 && Math.abs(h.rgb[2] - b) <= 2) return h.ink;
  return inkOf({ r, g, b }, t.in);
}

/** sRGB levels to linear light and back (1.56.8, 32-bit documents hold linear light). */
const lin = (v: number): number => { const u = v / 255; return u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4; };
const enc = (v: number): number => { const u = Math.max(0, Math.min(1, v)); return Math.round((u <= 0.0031308 ? 12.92 * u : 1.055 * u ** (1 / 2.4) - 0.055) * 255); };

/** A layer's floats taken whole from its 8-bit pixels: CMYK through the table, Lab exactly (1.56.4), 32-bit as linear
 *  light (1.56.8), otherwise 16-bit RGB. */
export function deriveWhole(img: ImageData, t: DeriveTables | null, lab = false, linear = false): ChannelPixels {
  if (lab) return labFromRgba(img);
  if (linear) { const { width: w, height: h, data: d } = img, out = new Float32Array(w * h * 4); for (let i = 0; i < d.length; i += 4) { out[i] = lin(d[i]); out[i + 1] = lin(d[i + 1]); out[i + 2] = lin(d[i + 2]); out[i + 3] = d[i + 3] / 255; } return { mode: 'rgb', n: 3, width: w, height: h, data: out }; }
  const { width: w, height: h, data: d } = img, n = t ? 4 : 3, S = n + 1, out = new Float32Array(w * h * S);
  for (let j = 0, i = 0; j < w * h; j++, i += 4) {
    const o = j * S;
    if (t) { const k = inkFor(d[i], d[i + 1], d[i + 2], t); out[o] = k[0]; out[o + 1] = k[1]; out[o + 2] = k[2]; out[o + 3] = k[3]; }
    else { out[o] = d[i] / 255; out[o + 1] = d[i + 1] / 255; out[o + 2] = d[i + 2] / 255; }
    out[o + n] = d[i + 3] / 255;
  }
  return t ? { mode: 'cmyk', n: 4, width: w, height: h, data: out } : { mode: 'rgb', n: 3, width: w, height: h, data: out };
}

/** A layer drawn in one colour (type): its floats with that colour taken once, in the document's own terms (the profile's
 *  separation, the foreground's ink when it is that colour, Lab, linear light, or 16-bit RGB), under the 8-bit coverage
 *  as alpha. Edge pixels so carry the colour itself and not the colour read back from premultiplied bytes, which drifts
 *  by several levels where the coverage is low. */
export function deriveFlat(img: ImageData, c: { r: number; g: number; b: number }, t: DeriveTables | null, lab = false, linear = false): ChannelPixels {
  const one = deriveWhole(new ImageData(new Uint8ClampedArray([c.r, c.g, c.b, 255]), 1, 1), t, lab, linear), { width: w, height: h, data: d } = img, n = one.n, S = n + 1, out = new Float32Array(w * h * S);
  for (let j = 0, i = 3; j < w * h; j++, i += 4) {
    const o = j * S;
    for (let k = 0; k < n; k++) out[o + k] = one.data[k];
    out[o + n] = d[i] / 255;
  }
  return { mode: one.mode, n: one.n, width: w, height: h, data: out };
}

/** The region (x, y, the size of `before`) of a layer's floats brought into step with what changed there. */
export function deriveRegion(ch: ChannelPixels, x: number, y: number, before: ImageData, after: ImageData, t: DeriveTables | null, linear = false): ChannelPixels {
  const out = new Float32Array(ch.data), S = ch.n + 1, A = ch.n, bw = before.width, bh = before.height, B = before.data, F = after.data;
  for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
    const px = x + i, py = y + j;
    if (px < 0 || py < 0 || px >= ch.width || py >= ch.height) continue;
    const s = (j * bw + i) * 4;
    if (B[s] === F[s] && B[s + 1] === F[s + 1] && B[s + 2] === F[s + 2] && B[s + 3] === F[s + 3]) continue;
    const o = (py * ch.width + px) * S;
    out[o + A] = F[s + 3] / 255;
    const d = Math.max(Math.abs(F[s] - B[s]), Math.abs(F[s + 1] - B[s + 1]), Math.abs(F[s + 2] - B[s + 2]));
    const w = B[s + 3] === 0 ? 0 : clamp01(1 - d / KEEP);
    if (ch.mode === 'lab') {
      const after3 = encodeLab(...srgbToLab(F[s], F[s + 1], F[s + 2])), before3 = w ? encodeLab(...srgbToLab(B[s], B[s + 1], B[s + 2])) : after3;
      for (let c = 0; c < 3; c++) out[o + c] = clamp01(after3[c] + w * (out[o + c] - before3[c]));
    } else if (ch.n === 4 && t) {
      const after4 = inkFor(F[s], F[s + 1], F[s + 2], t), before4 = w ? inkOf({ r: B[s], g: B[s + 1], b: B[s + 2] }, t.in) : after4;
      for (let c = 0; c < 4; c++) out[o + c] = clamp01(after4[c] + w * (out[o + c] - before4[c]));
    } else {
      if (linear) for (let c = 0; c < 3; c++) out[o + c] = Math.max(0, lin(F[s + c]) + w * (out[o + c] - lin(B[s + c])));
      else for (let c = 0; c < 3; c++) out[o + c] = clamp01(F[s + c] / 255 + w * (out[o + c] - B[s + c] / 255));
    }
  }
  return { ...ch, data: out };
}

/** A region's 8-bit rendition of the floats: through the display table for CMYK, rounded for 16-bit RGB. */
export function renderRegion(ch: ChannelPixels, x: number, y: number, w: number, h: number, lut: Lut4 | null, linear = false): ImageData {
  const S = ch.n + 1, strip = new Float32Array(w * h * S), img = new ImageData(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const px = x + i, py = y + j;
    if (px < 0 || py < 0 || px >= ch.width || py >= ch.height) continue;
    const o = (py * ch.width + px) * S, d = (j * w + i) * S;
    for (let c = 0; c < S; c++) strip[d + c] = ch.data[o + c];
  }
  if (ch.mode === 'lab') renderLab(strip, img.data);
  else if (ch.n === 4 && lut) applyLut4(strip, lut, img.data);
  else if (linear) for (let k = 0, q = 0; k < strip.length; k += S, q += 4) { for (let c = 0; c < 3; c++) img.data[q + c] = enc(strip[k + c]); img.data[q + 3] = Math.round(clamp01(strip[k + 3]) * 255); }
  else for (let k = 0, q = 0; k < strip.length; k += S, q += 4) { for (let c = 0; c < 3; c++) img.data[q + c] = Math.round(clamp01(strip[k + c]) * 255); img.data[q + 3] = Math.round(clamp01(strip[k + 3]) * 255); }
  return img;
}
