import type { LibFilter, LibValues } from '../filter-library';
import { gaussianMargin } from '../filters';
import { boxMean, copyImage, exactGaussian, luma, premul, unpremul } from './shared';

const num = (v: LibValues, k: string): number => v[k] as number;
const str = (v: LibValues, k: string): string => v[k] as string;

/** Box Blur: the mean over a square of side 2r+1 at every pixel, premultiplied. */
export function boxBlurImage(img: ImageData, radius: number): ImageData {
  const r = Math.round(radius), { width: w, height: h } = img;
  if (r < 1) return copyImage(img);
  const p = premul(img.data), plane = new Float32Array(w * h), out = new Float32Array(p.length);
  for (let c = 0; c < 4; c++) {
    for (let i = 0; i < plane.length; i++) plane[i] = p[i * 4 + c];
    const m = boxMean(plane, w, h, r);
    for (let i = 0; i < plane.length; i++) out[i * 4 + c] = m[i];
  }
  return unpremul(out, w, h);
}

/** Filter > Blur > Average: every pixel the alpha-weighted mean colour of the pixels `coverage` selects (all when
 *  null), its alpha their mean alpha. */
export function averageImage(img: ImageData, coverage: Uint8ClampedArray | null): ImageData {
  const s = img.data, out = new ImageData(img.width, img.height), d = out.data, sum = [0, 0, 0];
  let alpha = 0, weight = 0;
  for (let i = 0; i < s.length; i += 4) {
    const k = coverage ? coverage[i + 3] / 255 : 1;
    if (!k) continue;
    const a = (s[i + 3] / 255) * k;
    for (let c = 0; c < 3; c++) sum[c] += s[i + c] * a;
    alpha += a; weight += k;
  }
  if (!alpha || !weight) { d.set(s); return out; }
  const rgba = [sum[0] / alpha, sum[1] / alpha, sum[2] / alpha, (alpha / weight) * 255];
  for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 4; c++) d[i + c] = rgba[c];
  return out;
}

/** A Shape Blur kernel's outline, in units of the radius: true inside. */
type Outline = (u: number, v: number) => boolean;

/** A regular polygon of `n` sides, its corners on the unit circle, the first at the top. */
const polygon = (n: number): Outline => (u, v) => {
  const a = Math.atan2(v, u) + Math.PI / 2, side = (2 * Math.PI) / n, off = ((a % side) + side) % side - side / 2;
  return Math.hypot(u, v) * Math.cos(off) <= Math.cos(Math.PI / n);
};

/** A five-pointed star: inside when within the outline its points and notches make, its notches at 0.4 of the tips. */
const star: Outline = (u, v) => {
  const a = Math.atan2(v, u) + Math.PI / 2, side = (2 * Math.PI) / 5, t = Math.abs((((a % side) + side) % side) / side - 0.5) * 2;
  return Math.hypot(u, v) <= 0.4 + 0.6 * t * t;
};

const OUTLINES: Record<string, Outline> = {
  circle: (u, v) => u * u + v * v <= 1,
  ring: (u, v) => { const d = Math.hypot(u, v); return d <= 1 && d >= 0.65; },
  square: (u, v) => Math.max(Math.abs(u), Math.abs(v)) <= 1,
  diamond: (u, v) => Math.abs(u) + Math.abs(v) <= 1,
  triangle: polygon(3),
  hexagon: polygon(6),
  star,
  heart: (u, v) => { const x = u * 1.15, y = 0.2 - v * 1.15; return (x * x + y * y - 1) ** 3 <= x * x * y * y * y; },
  cross: (u, v) => Math.min(Math.abs(u), Math.abs(v)) <= 0.28,
};

/** The kernel of a Shape Blur: for each row of the shape, the runs of its pixels as [dy, from, to] offsets. */
export function spans(radius: number, inside: Outline): { rows: Array<[number, number, number]>; count: number } {
  const rows: Array<[number, number, number]> = [];
  if (radius < 0.5) return { rows: [[0, 0, 0]], count: 1 };
  const ri = Math.ceil(radius);
  let count = 0;
  for (let dy = -ri; dy <= ri; dy++) {
    let from = Infinity;
    for (let dx = -ri; dx <= ri + 1; dx++) {
      const on = dx <= ri && inside(dx / radius, dy / radius);
      if (on && from === Infinity) from = dx;
      if (!on && from !== Infinity) { rows.push([dy, from, dx - 1]); count += dx - from; from = Infinity; }
    }
  }
  return count ? { rows, count } : { rows: [[0, 0, 0]], count: 1 };
}

/** The mean of the kernel's pixels at every pixel, each row of the kernel summed from running row totals; pixels the
 *  kernel finds outside the image count as transparent. */
export function spanMean(img: ImageData, kernel: { rows: Array<[number, number, number]>; count: number }): ImageData {
  const { width: w, height: h } = img, p = premul(img.data), run = new Float64Array((w + 1) * h * 4), out = new Float32Array(p.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) {
    const at = ((y * (w + 1)) + x) * 4 + c;
    run[at + 4] = run[at] + p[(y * w + x) * 4 + c];
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    for (const [dy, a, b] of kernel.rows) {
      const yy = y + dy;
      if (yy < 0 || yy >= h) continue;
      const lo = Math.min(w, Math.max(0, x + a)), hi = Math.min(w, Math.max(0, x + b + 1)), base = yy * (w + 1) * 4;
      for (let c = 0; c < 4; c++) out[o + c] += run[base + hi * 4 + c] - run[base + lo * 4 + c];
    }
    for (let c = 0; c < 4; c++) out[o + c] /= kernel.count;
  }
  return unpremul(out, w, h);
}

/** Smart Blur: each pixel averaged with the pixels within `radius` whose brightness is within `threshold` levels of its
 *  own, so edges stay sharp; fewer samples at lower quality. Edge Only draws white where a pixel's brightness differs
 *  from a neighbour's by more than the threshold, on black; Overlay Edge draws those edges over the image. */
export function smartBlurImage(img: ImageData, radius: number, threshold: number, quality: string, mode: string): ImageData {
  const { width: w, height: h } = img, s = img.data, out = copyImage(img), d = out.data;
  const r = Math.min(100, Math.max(0.1, radius)), t = Math.min(100, Math.max(0.1, threshold));
  const lum = new Float32Array(w * h);
  for (let i = 0; i < lum.length; i++) lum[i] = luma(s[i * 4], s[i * 4 + 1], s[i * 4 + 2]);
  if (mode === 'edgeOnly' || mode === 'overlayEdge') {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if ((dx || dy) && xx >= 0 && yy >= 0 && xx < w && yy < h && Math.abs(lum[yy * w + xx] - lum[y * w + x]) > t) { edge = true; break; }
      }
      const o = (y * w + x) * 4;
      if (edge) { d[o] = d[o + 1] = d[o + 2] = 255; } else if (mode === 'edgeOnly') { d[o] = d[o + 1] = d[o + 2] = 0; }
    }
    return out;
  }
  const ri = Math.ceil(r), step = Math.max(1, Math.round(ri / (quality === 'low' ? 3 : quality === 'medium' ? 6 : 10)));
  const taps: Array<[number, number]> = [];
  for (let dy = -ri; dy <= ri; dy += step) for (let dx = -ri; dx <= ri; dx += step) if (dx * dx + dy * dy <= r * r + 0.25) taps.push([dx, dy]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const me = lum[y * w + x];
    let cr = 0, cg = 0, cb = 0, ca = 0, n = 0;
    for (const [dx, dy] of taps) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h || Math.abs(lum[yy * w + xx] - me) > t) continue;
      const q = (yy * w + xx) * 4, a = s[q + 3];
      cr += s[q] * a; cg += s[q + 1] * a; cb += s[q + 2] * a; ca += a; n++;
    }
    const o = (y * w + x) * 4;
    if (n && ca) { d[o] = cr / ca; d[o + 1] = cg / ca; d[o + 2] = cb / ca; d[o + 3] = ca / n; }
  }
  return out;
}

export const BLUR_FILTERS: LibFilter[] = [
  {
    id: 'blur', label: 'Blur', group: 'Blur', params: [], grows: true,
    reach: (_v, scale) => gaussianMargin(0.7 * scale),
    run: (src, _v, ctx) => exactGaussian(src, 0.7 * ctx.scale),
  },
  {
    id: 'blurMore', label: 'Blur More', group: 'Blur', params: [], grows: true,
    reach: (_v, scale) => gaussianMargin(1.5 * scale),
    run: (src, _v, ctx) => exactGaussian(src, 1.5 * ctx.scale),
  },
  {
    id: 'boxBlur', label: 'Box Blur', group: 'Blur', grows: true,
    params: [{ key: 'radius', label: 'Radius (px)', kind: 'range', min: 1, max: 200, step: 1, def: 1, limit: 2000 }],
    reach: (v, scale) => Math.round(num(v, 'radius') * scale) + 1,
    run: (src, v, ctx) => boxBlurImage(src, num(v, 'radius') * ctx.scale),
  },
  {
    id: 'shapeBlur', label: 'Shape Blur', group: 'Blur', grows: true,
    params: [
      { key: 'radius', label: 'Radius (px)', kind: 'range', min: 5, max: 200, step: 1, def: 10, limit: 1000 },
      { key: 'shape', label: 'Shape', kind: 'select', def: 'circle', options: [['circle', 'Circle'], ['ring', 'Ring'], ['square', 'Square'], ['diamond', 'Diamond'], ['triangle', 'Triangle'], ['hexagon', 'Hexagon'], ['star', 'Star'], ['heart', 'Heart'], ['cross', 'Cross']] },
    ],
    reach: (v, scale) => Math.ceil(num(v, 'radius') * scale) + 1,
    run: (src, v, ctx) => spanMean(src, spans(num(v, 'radius') * ctx.scale, OUTLINES[str(v, 'shape')] ?? OUTLINES.circle)),
  },
  {
    id: 'smartBlur', label: 'Smart Blur', group: 'Blur', grows: false,
    params: [
      { key: 'radius', label: 'Radius', kind: 'range', min: 0.1, max: 100, step: 0.1, def: 3 },
      { key: 'threshold', label: 'Threshold', kind: 'range', min: 0.1, max: 100, step: 0.1, def: 25 },
      { key: 'quality', label: 'Quality', kind: 'select', def: 'high', options: [['high', 'High'], ['medium', 'Medium'], ['low', 'Low']] },
      { key: 'mode', label: 'Mode', kind: 'select', def: 'normal', options: [['normal', 'Normal'], ['edgeOnly', 'Edge Only'], ['overlayEdge', 'Overlay Edge']] },
    ],
    reach: (v, scale) => Math.ceil(num(v, 'radius') * scale) + 1,
    run: (src, v, ctx) => smartBlurImage(src, num(v, 'radius') * ctx.scale, num(v, 'threshold'), str(v, 'quality'), str(v, 'mode')),
  },
];
