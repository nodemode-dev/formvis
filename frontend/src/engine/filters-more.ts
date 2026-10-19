/** Lens Blur and Smart Sharpen, written for formvis from standard methods.
 *
 *  Lens Blur averages over a disc (an iris) rather than a Gaussian, in linear light, after lifting pixels brighter
 *  than a threshold so they bloom into bright discs as specular highlights do through a lens. The disc sum runs as
 *  one prefix sum per row, so each pixel costs one subtraction per row of the disc.
 *
 *  Smart Sharpen removes one of three blurs. Gaussian is an unsharp mask. Lens and Motion run Richardson and Lucy's
 *  deconvolution (Richardson 1972, Lucy 1974) with a Gaussian of half the radius or a line of the radius at the angle
 *  as the point spread function, then mix by Amount. Reduce Noise gates small differences out; the fades weaken the
 *  result in the darkest and brightest tones. Alpha is kept as it was. */

import type { LensGatherInput } from './gpu-filters';

const toLin = new Float32Array(256);
for (let i = 0; i < 256; i++) { const v = i / 255; toLin[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
const toSrgb = (v: number): number => { const c = v <= 0 ? 0 : v >= 1 ? 1 : v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; return Math.round(c * 255); };

/** Disc average of premultiplied float RGBA, edges treated as transparent. */
function discBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const R = Math.max(0, Math.round(r)), out = new Float32Array(src.length);
  if (R === 0) { out.set(src); return out; }
  const pre = new Float64Array((w + 1) * 4 * h);
  for (let y = 0; y < h; y++) {
    const o = y * (w + 1) * 4;
    for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) pre[o + (x + 1) * 4 + c] = pre[o + x * 4 + c] + src[(y * w + x) * 4 + c];
  }
  const span = Array.from({ length: 2 * R + 1 }, (_, i) => Math.floor(Math.sqrt(Math.max(0, R * R + R - (i - R) * (i - R)))));
  let area = 0;
  for (const s of span) area += 2 * s + 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let a0 = 0, a1 = 0, a2 = 0, a3 = 0;
      for (let i = 0; i < span.length; i++) {
        const yy = y + i - R;
        if (yy < 0 || yy >= h) continue;
        const x0 = Math.max(0, x - span[i]), x1 = Math.min(w, x + span[i] + 1), o = yy * (w + 1) * 4;
        a0 += pre[o + x1 * 4] - pre[o + x0 * 4]; a1 += pre[o + x1 * 4 + 1] - pre[o + x0 * 4 + 1];
        a2 += pre[o + x1 * 4 + 2] - pre[o + x0 * 4 + 2]; a3 += pre[o + x1 * 4 + 3] - pre[o + x0 * 4 + 3];
      }
      const k = (y * w + x) * 4;
      out[k] = a0 / area; out[k + 1] = a1 / area; out[k + 2] = a2 / area; out[k + 3] = a3 / area;
    }
  }
  return out;
}

export const lensBlurMargin = (radius: number): number => Math.ceil(radius) + 1;

/** A depth plane for Lens Blur: `data` is `w` by `h` grey bytes in base64, spread over the document canvas. */
export interface LensDepth { w: number; h: number; data: string }
export interface LensOptions {
  /** 0 is a round iris; 3 to 8 is a polygon with that many blades. */
  blades: number; curve: number; rotation: number;
  /** none, depthMap, channel (both read `depth`) or transparency (the layer's own alpha). */
  source: string; depth: LensDepth | null; canvas: { x: number; y: number; w: number; h: number } | null; focal: number; invert: boolean;
  noise: number; gaussian: boolean; mono: boolean; seed: number;
}
export const defaultLensOptions = (): LensOptions => ({ blades: 0, curve: 0, rotation: 0, source: 'none', depth: null, canvas: null, focal: 128, invert: false, noise: 0, gaussian: false, mono: true, seed: 1 });

const LENS_TIERS = [12, 24, 48, 96, 160, 256];
const LENS_LEVELS = [0, 1, 2, 4, 8];

/** Unit-disc taps (x, y, weight) on a golden-angle spiral, pulled out to the polygon's edge and back toward the circle by
 *  `curve`; the weight evens the density so every part of the iris counts alike. */
function irisTaps(n: number, blades: number, curve: number, rotDeg: number): Float32Array {
  const out = new Float32Array(n * 3), rot = (rotDeg * Math.PI) / 180, c = Math.max(0, Math.min(1, curve / 100)), seg = (2 * Math.PI) / Math.max(3, blades);
  for (let k = 0; k < n; k++) {
    const rr = Math.sqrt((k + 0.5) / n), th = k * 2.39996323;
    let edge = 1;
    if (blades >= 3) { const a = (((th - rot) % seg) + seg) % seg; edge = Math.cos(Math.PI / blades) / Math.cos(a - Math.PI / blades); edge += (1 - edge) * c; }
    out[k * 3] = Math.cos(th) * rr * edge; out[k * 3 + 1] = Math.sin(th) * rr * edge; out[k * 3 + 2] = edge * edge;
  }
  return out;
}

/** Box mean of premultiplied float RGBA with radius `R`, outside the image counted as clear. */
function boxFloat(src: Float32Array, w: number, h: number, R: number): Float32Array {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length), k = 1 / (2 * R + 1);
  for (let y = 0; y < h; y++) for (let c = 0; c < 4; c++) {
    let sum = 0;
    for (let x = 0; x <= Math.min(w - 1, R); x++) sum += src[(y * w + x) * 4 + c];
    for (let x = 0; x < w; x++) {
      tmp[(y * w + x) * 4 + c] = sum * k;
      const add = x + R + 1, sub = x - R;
      if (add < w) sum += src[(y * w + add) * 4 + c];
      if (sub >= 0) sum -= src[(y * w + sub) * 4 + c];
    }
  }
  for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) {
    let sum = 0;
    for (let y = 0; y <= Math.min(h - 1, R); y++) sum += tmp[(y * w + x) * 4 + c];
    for (let y = 0; y < h; y++) {
      out[(y * w + x) * 4 + c] = sum * k;
      const add = y + R + 1, sub = y - R;
      if (add < h) sum += tmp[(add * w + x) * 4 + c];
      if (sub >= 0) sum -= tmp[(sub * w + x) * 4 + c];
    }
  }
  return out;
}

/** The depth, 0 to 255 per pixel of `img`, from its own alpha or from the stored plane over the canvas; null if none. */
function lensPlane(img: ImageData, o: LensOptions): Float32Array | null {
  const { width: w, height: h } = img, plane = new Float32Array(w * h);
  if (o.source === 'transparency') { for (let i = 0; i < w * h; i++) plane[i] = img.data[i * 4 + 3]; return plane; }
  if (o.source === 'none' || !o.depth) return null;
  const dw = o.depth.w, dh = o.depth.h, bin = atob(o.depth.data);
  if (bin.length !== dw * dh) return null;
  const cv = o.canvas ?? { x: 0, y: 0, w, h };
  for (let y = 0; y < h; y++) {
    const gy = Math.min(dh - 1, Math.max(0, ((y + 0.5 - cv.y) / cv.h) * dh - 0.5)), y0 = Math.floor(gy), y1 = Math.min(dh - 1, y0 + 1), fy = gy - y0;
    for (let x = 0; x < w; x++) {
      const gx = Math.min(dw - 1, Math.max(0, ((x + 0.5 - cv.x) / cv.w) * dw - 0.5)), x0 = Math.floor(gx), x1 = Math.min(dw - 1, x0 + 1), fx = gx - x0;
      const a = bin.charCodeAt(y0 * dw + x0), b = bin.charCodeAt(y0 * dw + x1), c = bin.charCodeAt(y1 * dw + x0), d = bin.charCodeAt(y1 * dw + x1);
      plane[y * w + x] = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
    }
  }
  return plane;
}

/** Lens Blur: `radius` of the iris in pixels, `brightness` (0 to 100) lifts pixels at or above `threshold` (0 to
 *  255) before blurring. With a depth source each pixel's radius grows with its distance from the `focal` depth; the
 *  iris can be a polygon (`blades`, `curve`, `rotation`); `noise` is added where the picture is blurred. */
export function lensBlur(img: ImageData, radius: number, brightness: number, threshold: number, given?: Partial<LensOptions>, gather?: (p: LensGatherInput) => ImageData | null): ImageData {
  const o = { ...defaultLensOptions(), ...given }, plane = lensPlane(img, o), blades = o.blades >= 3 ? Math.min(8, Math.round(o.blades)) : 0;
  if (!plane && !blades && o.noise <= 0) return lensBlurDisc(img, radius, brightness, threshold);
  const { width: w, height: h } = img, s = img.data, n = w * h, f = new Float32Array(n * 4), boost = 1 + (brightness / 100) * 8, rad = new Float32Array(n);
  const span = Math.max(1, Math.max(o.focal, 255 - o.focal));
  for (let i = 0; i < n; i++) {
    const a = s[i * 4 + 3] / 255, lum = 0.299 * s[i * 4] + 0.587 * s[i * 4 + 1] + 0.114 * s[i * 4 + 2], k = brightness > 0 && lum >= threshold ? boost : 1;
    f[i * 4] = toLin[s[i * 4]] * k * a; f[i * 4 + 1] = toLin[s[i * 4 + 1]] * k * a; f[i * 4 + 2] = toLin[s[i * 4 + 2]] * k * a; f[i * 4 + 3] = a;
    rad[i] = plane ? radius * Math.min(1, Math.abs((o.invert ? 255 - plane[i] : plane[i]) - o.focal) / span) : radius;
  }
  let top = 0;
  for (let i = 0; i < n; i++) if (rad[i] > top) top = rad[i];
  const tapsFor = new Map<number, Float32Array>(), levels: Float32Array[] = [f];
  const topGap = (top * 1.77) / Math.sqrt(LENS_TIERS.find((t) => t >= Math.max(12, 0.9 * top * top)) ?? 256) / 2;
  for (let k = 1; k < LENS_LEVELS.length; k++) levels.push(topGap * 2 >= LENS_LEVELS[k] ? boxFloat(f, w, h, LENS_LEVELS[k]) : f);
  if (gather && o.noise <= 0 && top >= 0.5) {
    const done = gather({ w, h, src: s, levels, rad, depth: !!plane, tiers: LENS_TIERS, sizes: LENS_LEVELS, tapsFor: (count) => irisTaps(count, blades, o.curve, o.rotation) });
    if (done) return done;
  }
  const out = new ImageData(w, h), d = out.data, rng = ((seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; })(o.seed | 0);
  const amp = (o.noise / 100) * 128, normal = (): number => Math.sqrt(-2 * Math.log(Math.max(1e-9, rng()))) * Math.cos(2 * Math.PI * rng()) * 0.5;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, r = rad[i], k4 = i * 4;
    if (r < 0.5) { d[k4] = s[k4]; d[k4 + 1] = s[k4 + 1]; d[k4 + 2] = s[k4 + 2]; d[k4 + 3] = s[k4 + 3]; continue; }
    const want = Math.min(256, Math.max(12, 0.9 * r * r)), count = LENS_TIERS.find((t) => t >= want) ?? 256;
    let taps = tapsFor.get(count);
    if (!taps) { taps = irisTaps(count, blades, o.curve, o.rotation); tapsFor.set(count, taps); }
    const gap = (r * 1.77) / Math.sqrt(count) / 2;
    let lv = 0;
    for (let q = 1; q < LENS_LEVELS.length; q++) if (LENS_LEVELS[q] <= gap * 2 && levels[q] !== f) lv = q;
    const L = levels[lv];
    let a0 = 0, a1 = 0, a2 = 0, a3 = 0, ws = 0;
    for (let t = 0; t < count; t++) {
      const dx = -taps[t * 3] * r, dy = -taps[t * 3 + 1] * r, wt = taps[t * 3 + 2], xx = Math.round(x + dx), yy = Math.round(y + dy);
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) { ws += wt; continue; }
      const j = yy * w + xx, cw = plane ? Math.min(1, Math.max(0, rad[j] - Math.hypot(dx, dy) + 1)) * wt : wt, q = j * 4;
      a0 += L[q] * cw; a1 += L[q + 1] * cw; a2 += L[q + 2] * cw; a3 += L[q + 3] * cw; ws += cw;
    }
    if (ws <= 1e-6 || a3 <= 1e-9) { d[k4] = s[k4]; d[k4 + 1] = s[k4 + 1]; d[k4 + 2] = s[k4 + 2]; d[k4 + 3] = s[k4 + 3]; continue; }
    const jit = o.noise > 0 ? Math.min(1, r / 2) * amp : 0, nz = jit ? (o.gaussian ? normal() : rng() * 2 - 1) * jit : 0;
    const put = (c: number, v: number): void => { d[k4 + c] = Math.max(0, Math.min(255, toSrgb(v / a3) + (jit ? (o.mono ? nz : (o.gaussian ? normal() : rng() * 2 - 1) * jit) : 0))); };
    put(0, a0); put(1, a1); put(2, a2);
    d[k4 + 3] = Math.round((a3 / ws) * 255);
  }
  return out;
}

/** The Filter dialog's Lens Blur settings (`lensIris` holds the iris, depth and noise rows). */
export interface LensIris { blades: number; curve: number; rotation: number; source: string; channel: number; focal: number; invert: boolean; noise: number; gaussian: boolean; mono: boolean; depth: LensDepth | null }
export const defaultLensIris = (): LensIris => ({ blades: 0, curve: 0, rotation: 0, source: 'none', channel: 1, focal: 128, invert: false, noise: 0, gaussian: false, mono: true, depth: null });
export function lensBlurSettings(img: ImageData, s: { lensRadius: number; lensBrightness: number; lensThreshold: number; lensIris?: LensIris }, scale: number, seed: number, canvas: { x: number; y: number; w: number; h: number } | null, gather?: (p: LensGatherInput) => ImageData | null): ImageData {
  const i = s.lensIris;
  return lensBlur(img, s.lensRadius * scale, s.lensBrightness, s.lensThreshold, i ? { blades: i.blades, curve: i.curve, rotation: i.rotation, source: i.source, depth: i.depth, canvas, focal: i.focal, invert: i.invert, noise: i.noise, gaussian: i.gaussian, mono: i.mono, seed } : undefined, gather);
}

function lensBlurDisc(img: ImageData, radius: number, brightness: number, threshold: number): ImageData {
  const { width: w, height: h } = img, s = img.data, n = w * h, f = new Float32Array(n * 4), boost = 1 + (brightness / 100) * 8;
  for (let i = 0; i < n; i++) {
    const a = s[i * 4 + 3] / 255, lum = 0.299 * s[i * 4] + 0.587 * s[i * 4 + 1] + 0.114 * s[i * 4 + 2], k = brightness > 0 && lum >= threshold ? boost : 1;
    f[i * 4] = toLin[s[i * 4]] * k * a; f[i * 4 + 1] = toLin[s[i * 4 + 1]] * k * a; f[i * 4 + 2] = toLin[s[i * 4 + 2]] * k * a; f[i * 4 + 3] = a;
  }
  const b = discBlur(f, w, h, radius), out = new ImageData(w, h), d = out.data;
  for (let i = 0; i < n; i++) {
    const a = b[i * 4 + 3];
    if (a <= 1e-6) continue;
    d[i * 4] = toSrgb(b[i * 4] / a); d[i * 4 + 1] = toSrgb(b[i * 4 + 1] / a); d[i * 4 + 2] = toSrgb(b[i * 4 + 2] / a); d[i * 4 + 3] = Math.round(a * 255);
  }
  return out;
}

/** Separable Gaussian on one float plane, edges clamped. */
function gauss(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  if (sigma < 0.3) return src.slice();
  const R = Math.ceil(sigma * 3), k = new Float32Array(2 * R + 1);
  let sum = 0;
  for (let i = -R; i <= R; i++) { k[i + R] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += k[i + R]; }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0; for (let i = -R; i <= R; i++) a += k[i + R] * src[y * w + Math.min(w - 1, Math.max(0, x + i))]; tmp[y * w + x] = a; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0; for (let i = -R; i <= R; i++) a += k[i + R] * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x]; out[y * w + x] = a; }
  return out;
}

/** A line of `len` pixels at `angleDeg` on one float plane, bilinear, edges clamped. */
function line(src: Float32Array, w: number, h: number, len: number, angleDeg: number): Float32Array {
  const t = (angleDeg * Math.PI) / 180, ux = Math.cos(t), uy = -Math.sin(t), count = Math.max(2, Math.ceil(len) + 1), out = new Float32Array(src.length);
  const at = (x: number, y: number): number => {
    const cx = Math.min(w - 1, Math.max(0, x)), cy = Math.min(h - 1, Math.max(0, y)), x0 = Math.floor(cx), y0 = Math.floor(cy), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), fx = cx - x0, fy = cy - y0;
    return (src[y0 * w + x0] * (1 - fx) + src[y0 * w + x1] * fx) * (1 - fy) + (src[y1 * w + x0] * (1 - fx) + src[y1 * w + x1] * fx) * fy;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let a = 0;
    for (let s = 0; s < count; s++) { const d = -len / 2 + (len * s) / (count - 1); a += at(x + ux * d, y + uy * d); }
    out[y * w + x] = a / count;
  }
  return out;
}

export type SharpenRemove = 'gaussian' | 'lens' | 'motion';
export interface SmartSharpenSettings { amount: number; radius: number; noise: number; remove: SharpenRemove; angle: number; shadows: number; highlights: number }
export const smartSharpenMargin = (s: SmartSharpenSettings): number => Math.ceil(s.radius * 3) + 2;

/** Filter > Sharpen > Shake Reduction: a straight blur trace (`angle` as the filters measure it, `length` its full span
 *  in pixels, usually from estimateShake) removed by Smart Sharpen's motion deconvolution; `smoothing` (0 to 100)
 *  gates small differences as Reduce Noise does and `amount` (percent) scales the correction. */
export interface ShakeSettings { angle: number; length: number; smoothing: number; amount: number }
const shakeAsSharpen = (s: ShakeSettings): SmartSharpenSettings => ({ amount: s.amount, radius: Math.max(0.5, s.length / 2), noise: s.smoothing, remove: 'motion', angle: s.angle, shadows: 0, highlights: 0 });
export const shakeMargin = (s: ShakeSettings): number => smartSharpenMargin(shakeAsSharpen(s));
export function shakeReduce(img: ImageData, s: ShakeSettings, scale = 1): ImageData { return smartSharpen(img, shakeAsSharpen(s), scale); }

/** Smart Sharpen: `amount` in percent (1 to 500), `radius` in pixels, `noise` (0 to 100) gates small differences,
 *  `shadows` and `highlights` (0 to 100) fade the effect in those tones. `scale` shrinks the radius for previews. */
export function smartSharpen(img: ImageData, s: SmartSharpenSettings, scale = 1): ImageData {
  const { width: w, height: h } = img, src = img.data, n = w * h, r = Math.max(0.1, s.radius * scale), amt = s.amount / 100;
  const out = new ImageData(new Uint8ClampedArray(src), w, h), d = out.data, gate = (s.noise / 100) * 0.08;
  const blur = (p: Float32Array): Float32Array => (s.remove === 'motion' ? line(p, w, h, r * 2, s.angle) : gauss(p, w, h, s.remove === 'lens' ? r / 2 : r));
  for (let c = 0; c < 3; c++) {
    const obs = new Float32Array(n);
    for (let i = 0; i < n; i++) obs[i] = src[i * 4 + c] / 255 + 1e-3;
    let sharp: Float32Array;
    if (s.remove === 'gaussian') {
      const b = blur(obs);
      sharp = new Float32Array(n);
      for (let i = 0; i < n; i++) sharp[i] = obs[i] + (obs[i] - b[i]);
    } else {
      let est = obs.slice();
      for (let it = 0; it < 8; it++) {
        const b = blur(est), ratio = new Float32Array(n);
        for (let i = 0; i < n; i++) ratio[i] = obs[i] / Math.max(1e-4, b[i]);
        const back = blur(ratio);
        for (let i = 0; i < n; i++) est[i] = Math.min(2, est[i] * back[i]);
      }
      sharp = est;
    }
    for (let i = 0; i < n; i++) {
      let diff = sharp[i] - obs[i];
      if (gate > 0) { const m = Math.abs(diff); diff *= m >= gate ? 1 : m / gate; }
      const L = (0.299 * src[i * 4] + 0.587 * src[i * 4 + 1] + 0.114 * src[i * 4 + 2]) / 255;
      const fade = 1 - (s.shadows / 100) * Math.max(0, 1 - L / 0.5) - (s.highlights / 100) * Math.max(0, (L - 0.5) / 0.5);
      d[i * 4 + c] = Math.round((obs[i] - 1e-3 + diff * amt * Math.max(0, fade)) * 255);
    }
  }
  return out;
}

/** The sharpened version the Sharpen brush paints from: an unsharp mask of `radius` at full strength. */
export function sharpenSample(img: ImageData, radius: number): ImageData {
  return smartSharpen(img, { amount: 100, radius, noise: 0, remove: 'gaussian', angle: 0, shadows: 0, highlights: 0 });
}
