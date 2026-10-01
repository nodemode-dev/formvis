import type { ChannelPixels } from './types';

/** Lab on the one model (1.56.4, DEV_PLAN 22.9): CIE L*a*b* with the D50 white Photoshop's Lab uses, from and to the
 *  document's sRGB through the Bradford-adapted sRGB matrix (the ICC sRGB profile's colorants and the inverse). The
 *  floats hold L / 100, (a + 128) / 255 and (b + 128) / 255, so 0.5 is neutral on a and b as on Photoshop's 8-bit
 *  Lab. Renditions and conversions both use the formulas, the sRGB encoding through a 16,384-step table. */

const toLinear = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toGamma = (v: number): number => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const M = [0.4360747, 0.3850649, 0.1430804, 0.2225045, 0.7168786, 0.0606169, 0.0139322, 0.0971045, 0.7141733];
const MI = [3.1338561, -1.6168667, -0.4906146, -0.9787684, 1.9161415, 0.033454, 0.0719453, -0.2289914, 1.4052427];
const WX = 0.9642, WY = 1, WZ = 0.8249, E = 6 / 29;
const f = (t: number): number => (t > E * E * E ? Math.cbrt(t) : t / (3 * E * E) + 4 / 29);
const finv = (t: number): number => (t > E ? t * t * t : 3 * E * E * (t - 4 / 29));

/** sRGB levels (0 to 255) to L* (0 to 100), a* and b* (about -128 to 127). */
export function srgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = toLinear(r / 255), G = toLinear(g / 255), B = toLinear(b / 255);
  const x = (M[0] * R + M[1] * G + M[2] * B) / WX, y = (M[3] * R + M[4] * G + M[5] * B) / WY, z = (M[6] * R + M[7] * G + M[8] * B) / WZ;
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** L*, a*, b* to sRGB levels, clipped to the sRGB gamut. */
export function labToSrgb(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116, x = finv(fy + a / 500) * WX, y = finv(fy) * WY, z = finv(fy - b / 200) * WZ;
  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) { const v = MI[c * 3] * x + MI[c * 3 + 1] * y + MI[c * 3 + 2] * z; out[c] = Math.round(Math.max(0, Math.min(1, toGamma(Math.max(0, v)))) * 255); }
  return out;
}

/** The float encoding and back. */
export const encodeLab = (L: number, a: number, b: number): [number, number, number] => [L / 100, (a + 128) / 255, (b + 128) / 255];
export const decodeLab = (l: number, a: number, b: number): [number, number, number] => [l * 100, a * 255 - 128, b * 255 - 128];

/** Encoded Lab floats to sRGB from 0 to 1, unrounded, clipped to the gamut (1.56.6, blending in the rendition). */
export function labFloatToRgb(l: number, a: number, b: number): [number, number, number] {
  const fy = (l * 100 + 16) / 116, x = finv(fy + (a * 255 - 128) / 500) * WX, y = finv(fy) * WY, z = finv(fy - (b * 255 - 128) / 200) * WZ;
  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) out[c] = Math.max(0, Math.min(1, toGamma(Math.max(0, MI[c * 3] * x + MI[c * 3 + 1] * y + MI[c * 3 + 2] * z))));
  return out;
}

/** The sRGB encoding of linear light, 16,384 steps, so a rendition costs a table lookup per channel. */
const GN = 16384;
let gammaTable: Uint8ClampedArray | null = null;
function gammaOf(v: number): number {
  if (!gammaTable) { gammaTable = new Uint8ClampedArray(GN + 1); for (let i = 0; i <= GN; i++) gammaTable[i] = Math.round(toGamma(i / GN) * 255); }
  return gammaTable[Math.round(Math.max(0, Math.min(1, v)) * GN)];
}

/** Lab floats with alpha (four a pixel) to their sRGB rendition (RGBA bytes), by the formulas: a first version used a
 *  33-point grid, which interpolated across the clipped edge of the sRGB gamut and missed by up to 21 levels. */
export function renderLab(src: Float32Array, out: Uint8ClampedArray): void {
  for (let p = 0; p < src.length; p += 4) {
    const L = src[p] * 100, fy = (L + 16) / 116, x = finv(fy + (src[p + 1] * 255 - 128) / 500) * WX, y = finv(fy) * WY, z = finv(fy - (src[p + 2] * 255 - 128) / 200) * WZ;
    out[p] = gammaOf(MI[0] * x + MI[1] * y + MI[2] * z);
    out[p + 1] = gammaOf(MI[3] * x + MI[4] * y + MI[5] * z);
    out[p + 2] = gammaOf(MI[6] * x + MI[7] * y + MI[8] * z);
    out[p + 3] = Math.max(0, Math.min(1, src[p + 3])) * 255;
  }
}

/** A layer's 16-bit RGB floats (sRGB-encoded, 0 to 1) as Lab floats, keeping their precision (1.57.3). */
export function labFromFloats(ch: ChannelPixels): ChannelPixels {
  const d = ch.data, out = new Float32Array(ch.width * ch.height * 4);
  for (let i = 0; i < d.length; i += 4) {
    const v = encodeLab(...srgbToLab(Math.max(0, Math.min(1, d[i])) * 255, Math.max(0, Math.min(1, d[i + 1])) * 255, Math.max(0, Math.min(1, d[i + 2])) * 255));
    out[i] = v[0]; out[i + 1] = v[1]; out[i + 2] = v[2]; out[i + 3] = d[i + 3];
  }
  return { mode: 'lab', n: 3, width: ch.width, height: ch.height, data: out };
}

/** A layer's 8-bit pixels as Lab floats, exactly. */
export function labFromRgba(img: ImageData): ChannelPixels {
  const { width: w, height: h, data: d } = img, out = new Float32Array(w * h * 4), memo = new Map<number, [number, number, number]>();
  for (let i = 0, o = 0; i < d.length; i += 4, o += 4) {
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    let v = memo.get(key);
    if (!v) { const lab = srgbToLab(d[i], d[i + 1], d[i + 2]); v = encodeLab(lab[0], lab[1], lab[2]); if (memo.size < 1_000_000) memo.set(key, v); }
    out[o] = v[0]; out[o + 1] = v[1]; out[o + 2] = v[2]; out[o + 3] = d[i + 3] / 255;
  }
  return { mode: 'lab', n: 3, width: w, height: h, data: out };
}
