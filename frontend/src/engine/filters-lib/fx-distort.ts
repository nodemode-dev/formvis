import type { LibValues } from '../filter-library';
import { clamp01, ease, fractal, grain, isOn, menu, num, opt, sampleInto, slider, slopes, soften, steepness, surfaceAt, tick, type FxDef, type Plate } from './gallery-fx';

/** The feature size of each Glass texture, in texture pixels. */
const GLASS: Record<string, number> = { frosted: 5, blocks: 26, canvas: 4, tinyLens: 10, ribbed: 12, reeded: 22, wavy: 40, pebbled: 16 };

/** The height (0 to 1) of a Glass texture at (u, v), in texture pixels. */
function glassAt(kind: string, u: number, v: number): number {
  const s = GLASS[kind] ?? 5, fu = u / s - Math.floor(u / s), fv = v / s - Math.floor(v / s);
  if (kind === 'blocks') return ease(0, 0.3, Math.min(fu, 1 - fu, fv, 1 - fv));
  if (kind === 'tinyLens') { const a = fu * 2 - 1, b = fv * 2 - 1; return Math.sqrt(Math.max(0, 1 - a * a - b * b)); }
  if (kind === 'canvas') return surfaceAt('canvas', u, v);
  if (kind === 'ribbed') return Math.sin(fu * Math.PI * 2) * 0.5 + 0.5;
  if (kind === 'reeded') { const a = fu * 2 - 1; return Math.sqrt(Math.max(0, 1 - a * a)); }
  if (kind === 'wavy') return Math.sin((u / s + 0.35 * Math.sin(v / s * 2.3)) * Math.PI * 2) * 0.5 + 0.5;
  if (kind === 'pebbled') {
    const wu = fractal(u / (s * 2), v / (s * 2), 1611, 1) - 0.5, wv = fractal(u / (s * 2), v / (s * 2), 1621, 1) - 0.5;
    const pu = (u + wu * s * 1.6) / s, pv = (v + wv * s * 1.6) / s, a = (pu - Math.floor(pu)) * 2 - 1, b = (pv - Math.floor(pv)) * 2 - 1;
    return Math.sqrt(Math.max(0, 1 - a * a - b * b));
  }
  return fractal(u / s, v / s, 1601, 2);
}

/** How much Glass softens its texture, in window pixels: from its smoothness, and never under 0.6 so a small
 *  preview does not alias. */
const glassSoft = (v: LibValues, k: number): number => Math.max(0.6, (0.5 + 0.35 * (num(v, 'smoothness') - 1)) * k);

/** A height field sampled at each window pixel's centre, in document pixels. */
function heights(p: Plate, field: (x: number, y: number) => number): Float32Array {
  const { w, h, k } = p, out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = field(p.left + (x + 0.5) / k, p.top + (y + 0.5) / k);
  return out;
}

/** Moves each pixel's colour by the slope of the height plane `hgt` (`size` its feature size in document pixels):
 *  the picture as seen through a surface of that shape, each shift at most `cap` document pixels. Reaches cap k + 3. */
function refract(p: Plate, hgt: Float32Array, size: number, push: number, cap: number): void {
  const { w, h, k } = p, [gx, gy] = slopes(hgt, w, h), src = p.rgb, out = new Float32Array(src.length), scale = k * size * push;
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
    const ox = Math.max(-cap, Math.min(cap, -gx[i] * scale)), oy = Math.max(-cap, Math.min(cap, -gy[i] * scale));
    sampleInto(src, w, h, x + ox * k, y + oy * k, out, i * 3);
  }
  p.rgb = out;
}

export const DISTORT_FX: readonly FxDef[] = [
  {
    key: 'diffuseGlow', label: 'Diffuse Glow', category: 'Distort',
    params: [slider('graininess', 0, 10, 6), slider('glowAmount', 0, 20, 10), slider('clearAmount', 0, 20, 15)],
    note: 'The glow is the background colour.',
    reach: (_v, k) => 4.5 * k + 2,
    paint: (p, v) => {
      const { w, h, k } = p, grainy = num(v, 'graininess') / 10, amount = num(v, 'glowAmount') / 10, t = 0.2 + (num(v, 'clearAmount') / 20) * 0.6;
      const base = p.rgb, soft = soften(base, w, h, 3, 1.5 * k), G = grain(p, 1501), b = p.bg;
      for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
        const j = i * 3, l = 0.299 * soft[j] + 0.587 * soft[j + 1] + 0.114 * soft[j + 2], r = Math.hypot(x + 0.5 - p.cx, y + 0.5 - p.cy) / p.half;
        const glow = clamp01(ease(t - 0.25, t + 0.25, l) * amount * (1 - 0.35 * Math.min(1, r * r))), speck = G[i] < grainy * 0.45 * glow ? 0.9 : 0, g = Math.min(1, glow * (0.75 - grainy * 0.3) + speck);
        for (let ch = 0; ch < 3; ch++) { const m = base[j + ch] + (soft[j + ch] - base[j + ch]) * glow * 0.6; base[j + ch] = m + (b[ch] - m) * g; }
      }
    },
  },
  {
    key: 'glass', label: 'Glass', category: 'Distort',
    params: [slider('distortion', 0, 20, 5), slider('smoothness', 1, 15, 3), menu('texture', ['frosted', 'blocks', 'canvas', 'tinyLens', 'ribbed', 'reeded', 'wavy', 'pebbled']), slider('scaling', 50, 200, 100), tick('invert')],
    reach: (v, k) => (1.5 * num(v, 'distortion') + 1) * k + 3 * glassSoft(v, k) + 3,
    paint: (p, v) => {
      const kind = opt(v, 'texture'), unit = 100 / num(v, 'scaling'), dist = num(v, 'distortion'), sign = isOn(v, 'invert') ? -1 : 1;
      const hgt = soften(heights(p, (x, y) => sign * glassAt(kind, x * unit, y * unit)), p.w, p.h, 1, glassSoft(v, p.k));
      refract(p, hgt, (GLASS[kind] ?? 5) / unit, dist * 0.5, 1.5 * dist + 1);
    },
  },
  {
    key: 'oceanRipple', label: 'Ocean Ripple', category: 'Distort',
    params: [slider('rippleSize', 1, 15, 9), slider('rippleMagnitude', 0, 20, 9)],
    reach: (v, k) => (0.8 * num(v, 'rippleMagnitude') + 1) * k + 3,
    paint: (p, v) => {
      const size = 4 + 2.2 * num(v, 'rippleSize'), mag = num(v, 'rippleMagnitude');
      refract(p, heights(p, (x, y) => fractal(x / size, y / size, 1701, 2)), size, mag * 0.6, 0.8 * mag + 1);
    },
  },
  {
    key: 'glowingEdges', label: 'Glowing Edges', category: 'Stylize',
    params: [slider('edgeWidth', 1, 14, 2), slider('edgeBrightness', 0, 20, 6), slider('smoothness', 1, 15, 5)],
    reach: (v, k) => (3 * (0.3 + 0.15 * num(v, 'smoothness')) + 1.05 * num(v, 'edgeWidth')) * k + 2,
    paint: (p, v) => {
      const { w, h, k } = p, n = w * h, width = num(v, 'edgeWidth'), gain = (1.6 + 0.12 * width) * (num(v, 'edgeBrightness') / 6) * 2;
      const sm = soften(p.rgb, w, h, 3, (0.3 + 0.15 * num(v, 'smoothness')) * k), out = new Float32Array(n * 3), one = new Float32Array(n);
      for (let ch = 0; ch < 3; ch++) {
        for (let i = 0; i < n; i++) one[i] = sm[i * 3 + ch];
        const E = soften(steepness(one, w, h, k), w, h, 1, 0.35 * width * k);
        for (let i = 0; i < n; i++) out[i * 3 + ch] = clamp01(E[i] * gain);
      }
      p.rgb = out;
    },
  },
];
