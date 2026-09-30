import type { Adjustment, DeepPixels, Doc } from './types';
import { adjustmentKernel } from './kernels';
import { Raster } from './surface';
import { boxBlur, mix32, threeBoxWidths, toUnit } from './filters';
import { invert, placement } from './geometry';

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
    const src = l.deep ?? deepFromRaster(l.raster);
    place(out, W, H, src, l.transform, op);
  }
  return { width: W, height: H, data: out };
}

/** A layer's pixels drawn into `out` where its placement puts them (the renderer's own matrix, inverted): whole-pixel
 *  offsets and flips copy exactly; scaling and rotation sample bilinearly, as the canvas does. */
function place(out: Float32Array, W: number, H: number, src: DeepPixels, t: import('./types').Transform, op: number): void {
  const m = placement(t, src.width, src.height), inv = invert(m);
  const xs = [0, src.width].flatMap((x) => [0, src.height].map((y) => m[0] * x + m[2] * y + m[4]));
  const ys = [0, src.width].flatMap((x) => [0, src.height].map((y) => m[1] * x + m[3] * y + m[5]));
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(W, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(H, Math.ceil(Math.max(...ys)));
  const sw = src.width, sh = src.height, d = src.data, px = [0, 0, 0, 0];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const cx = x + 0.5, cy = y + 0.5, u = inv[0] * cx + inv[2] * cy + inv[4] - 0.5, v = inv[1] * cx + inv[3] * cy + inv[5] - 0.5;
    if (u < -0.5 || v < -0.5 || u > sw - 0.5 || v > sh - 0.5) continue;
    const ru = Math.round(u), rv = Math.round(v);
    if (Math.abs(u - ru) < 1e-6 && Math.abs(v - rv) < 1e-6) { const s = (Math.min(sh - 1, Math.max(0, rv)) * sw + Math.min(sw - 1, Math.max(0, ru))) * 4; px[0] = d[s]; px[1] = d[s + 1]; px[2] = d[s + 2]; px[3] = d[s + 3]; }
    else bilinear(d, sw, sh, u, v, px);
    const sa = px[3] * op, o = (y * W + x) * 4, oa = out[o + 3], na = sa + oa * (1 - sa);
    if (na <= 0) continue;
    for (let c = 0; c < 3; c++) out[o + c] = (px[c] * sa + out[o + c] * oa * (1 - sa)) / na;
    out[o + 3] = na;
  }
}

/** Bilinear in premultiplied alpha, edges clamped. */
function bilinear(d: Float32Array, w: number, h: number, u: number, v: number, px: number[]): void {
  const x0 = Math.max(0, Math.min(w - 1, Math.floor(u))), y0 = Math.max(0, Math.min(h - 1, Math.floor(v)));
  const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), fx = Math.min(1, Math.max(0, u - x0)), fy = Math.min(1, Math.max(0, v - y0));
  let a = 0; const c = [0, 0, 0];
  for (const [xx, yy, wgt] of [[x0, y0, (1 - fx) * (1 - fy)], [x1, y0, fx * (1 - fy)], [x0, y1, (1 - fx) * fy], [x1, y1, fx * fy]]) {
    const s = (yy * w + xx) * 4, al = d[s + 3] * wgt; a += al; for (let k = 0; k < 3; k++) c[k] += d[s + k] * al;
  }
  px[3] = a; for (let k = 0; k < 3; k++) px[k] = a > 0 ? c[k] / a : 0;
}

/** Image Size at 16 bits: an area average when shrinking, bilinear when enlarging, in premultiplied alpha. */
export function resampleDeep(src: DeepPixels, width: number, height: number): DeepPixels {
  const out = new Float32Array(width * height * 4), sx = src.width / width, sy = src.height / height, px = [0, 0, 0, 0];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const o = (y * width + x) * 4;
    if (sx > 1 || sy > 1) {
      const xa = x * sx, xb = (x + 1) * sx, ya = y * sy, yb = (y + 1) * sy;
      let a = 0, area = 0; const c = [0, 0, 0];
      for (let yy = Math.floor(ya); yy < Math.min(src.height, Math.ceil(yb)); yy++) for (let xx = Math.floor(xa); xx < Math.min(src.width, Math.ceil(xb)); xx++) {
        const wgt = (Math.min(xb, xx + 1) - Math.max(xa, xx)) * (Math.min(yb, yy + 1) - Math.max(ya, yy)), s = (yy * src.width + xx) * 4, al = src.data[s + 3] * wgt;
        area += wgt; a += al; for (let k = 0; k < 3; k++) c[k] += src.data[s + k] * al;
      }
      out[o + 3] = area > 0 ? a / area : 0; for (let k = 0; k < 3; k++) out[o + k] = a > 0 ? c[k] / a : 0;
    } else {
      bilinear(src.data, src.width, src.height, (x + 0.5) * sx - 0.5, (y + 0.5) * sy - 0.5, px);
      out[o] = px[0]; out[o + 1] = px[1]; out[o + 2] = px[2]; out[o + 3] = px[3];
    }
  }
  return { width, height, data: out };
}

/** Gaussian Blur at 16 bits: the 8-bit filter's three box blurs (filters.ts), in premultiplied alpha, on floats. */
export function blurDeep(src: DeepPixels, sigma: number): DeepPixels {
  const { width: w, height: h } = src, n = w * h * 4;
  if (!(sigma >= 0.1)) return { width: w, height: h, data: new Float32Array(src.data) };
  const a = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i += 4) { const al = src.data[i + 3]; a[i] = src.data[i] * al * 255; a[i + 1] = src.data[i + 1] * al * 255; a[i + 2] = src.data[i + 2] * al * 255; a[i + 3] = al * 255; }
  for (const width of threeBoxWidths(sigma)) { const r = (width - 1) / 2; boxBlur(a, b, w, h, r, true); boxBlur(b, a, w, h, r, false); }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 4) { const al = a[i + 3]; out[i + 3] = al / 255; for (let k = 0; k < 3; k++) out[i + k] = al > 0 ? a[i + k] / al : 0; }
  return { width: w, height: h, data: out };
}

/** Unsharp Mask at 16 bits: the 8-bit formula, with the threshold in the same levels. */
export function unsharpDeep(src: DeepPixels, amount: number, radius: number, threshold: number): DeepPixels {
  const blur = blurDeep(src, Math.max(0.1, radius)), s = src.data, b = blur.data, o = new Float32Array(s.length), k = amount / 100;
  for (let i = 0; i < s.length; i += 4) {
    for (let c = 0; c < 3; c++) { const d = s[i + c] - b[i + c]; o[i + c] = Math.min(1, Math.max(0, Math.abs(d) * 255 >= threshold ? s[i + c] + k * d : s[i + c])); }
    o[i + 3] = s[i + 3];
  }
  return { width: src.width, height: src.height, data: o };
}

/** Add Noise at 16 bits: the 8-bit filter's seeded noise (the same values for the same seed), not rounded. */
export function noiseDeep(src: DeepPixels, amount: number, gaussian: boolean, monochromatic: boolean, seed: number): DeepPixels {
  const d = new Float32Array(src.data), spread = (amount / 100) * 127.5;
  for (let px = 0, i = 0; i < d.length; px++, i += 4) {
    if (d[i + 3] === 0) continue;
    const pixelKey = mix32(mix32(px) ^ seed);
    let shared = NaN;
    for (let c = 0; c < 3; c++) {
      if (!monochromatic || Number.isNaN(shared)) {
        const k = mix32(pixelKey + (monochromatic ? 0 : c));
        shared = gaussian ? Math.sqrt(-2 * Math.log(toUnit(k))) * Math.cos(2 * Math.PI * toUnit(mix32(k))) * spread * (2 / 3) : (toUnit(k) * 2 - 1) * spread;
      }
      d[i + c] = Math.min(1, Math.max(0, d[i + c] + shared / 255));
    }
  }
  return { width: src.width, height: src.height, data: d };
}

/** A Brush, Pencil or Eraser stroke at 16 bits (1.53.8): each pixel the stroke changed, rebuilt on the 16-bit pixels
 *  from the stroke region's 8-bit before and after. Painting is source-over with the paint colour `paint`, its coverage
 *  found from the alpha change (on transparency) or by least squares over the three channels (on opaque pixels), so
 *  the 16 bits under a soft or partial stroke are kept; where the paint is too near the pixel to tell, the 16-bit
 *  value moves by the 8-bit change. Erasing scales alpha, or paints `background` where alpha cannot change. */
export function strokeDeep(deep: DeepPixels, before: ImageData, after: ImageData, x: number, y: number, paint: { r: number; g: number; b: number } | null, background: { r: number; g: number; b: number }): DeepPixels {
  const out = new Float32Array(deep.data), bw = before.width, bh = before.height, B = before.data, A = after.data;
  for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
    const px = x + i, py = y + j;
    if (px < 0 || py < 0 || px >= deep.width || py >= deep.height) continue;
    const s = (j * bw + i) * 4;
    if (B[s] === A[s] && B[s + 1] === A[s + 1] && B[s + 2] === A[s + 2] && B[s + 3] === A[s + 3]) continue;
    const o = (py * deep.width + px) * 4;
    let colour = paint;
    if (!colour) {
      if (A[s + 3] !== B[s + 3] || B[s + 3] === 0) { out[o + 3] = B[s + 3] > 0 ? out[o + 3] * (A[s + 3] / B[s + 3]) : A[s + 3] / 255; continue; }
      colour = background;                                              // alpha locked: the eraser paints the background colour
    }
    const C = [colour.r, colour.g, colour.b];
    let a = -1;
    if (B[s + 3] < 250) a = (A[s + 3] - B[s + 3]) / Math.max(1, 255 - B[s + 3]);
    else {
      // Least squares over the three channels: each channel's change against its distance to the paint.
      let num = 0, den = 0;
      for (let c = 0; c < 3; c++) { const d = C[c] - B[s + c]; num += (A[s + c] - B[s + c]) * d; den += d * d; }
      if (den >= 9) a = num / den;
    }
    if (a < 0 || !Number.isFinite(a)) { for (let c = 0; c < 4; c++) out[o + c] = Math.min(1, Math.max(0, out[o + c] + (A[s + c] - B[s + c]) / 255)); continue; }
    a = Math.min(1, a);
    const oa = out[o + 3], na = a + oa * (1 - a);
    for (let c = 0; c < 3; c++) out[o + c] = na > 0 ? (C[c] / 255 * a + out[o + c] * oa * (1 - a)) / na : C[c] / 255;
    out[o + 3] = na;
  }
  return { width: deep.width, height: deep.height, data: out };
}
