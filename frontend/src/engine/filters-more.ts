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

/** Lens Blur: `radius` of the iris in pixels, `brightness` (0 to 100) lifts pixels at or above `threshold` (0 to
 *  255) before blurring. */
export function lensBlur(img: ImageData, radius: number, brightness: number, threshold: number): ImageData {
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
