import { defaultDevelopState, developImage } from './develop';
import type { Kernel } from './kernels';
import { gpuFilters } from './gpu-filters';
import type { RGB } from './types';

/** Adjustments described by their controls, each baked into a kernel from its settings. Values live in an
 *  adjustment's `data.params`; a missing or unreadable value takes its default. Formulas are standard published ones:
 *  Black and White weights each pixel's grey by the hue of its two largest channels, as Photoshop documents it;
 *  Colour Balance weights shadows, midtones and highlights by lightness with the usual overlapping ramps; Selective
 *  Colour weights each pixel by how much it belongs to a colour family and moves its ink, relative or absolute. */

export type ParamKind = 'brightnessContrast' | 'vibrance' | 'colorBalance' | 'blackWhite' | 'photoFilter' | 'channelMixer' | 'invert' | 'posterize' | 'threshold' | 'selectiveColor' | 'shadowsHighlights' | 'hdrToning' | 'colorLookup' | 'develop' | 'clarity' | 'dehaze' | 'texture' | 'light' | 'splitToning' | 'halation' | 'glow';

export type ParamSpec =
  | { key: string; label: string; kind: 'range'; min: number; max: number; step: number; def: number; group?: string }
  | { key: string; label: string; kind: 'check'; def: boolean; group?: string }
  | { key: string; label: string; kind: 'color'; def: RGB; group?: string }
  | { key: string; label: string; kind: 'select'; options: ReadonlyArray<readonly [string, string]>; def: string; group?: string }
  /** Data the panel does not show as a control (a loaded .cube file's text and name). */
  | { key: string; label: string; kind: 'text'; def: string; group?: string };

export interface ParamAdjustment { label: string; params: ParamSpec[]; groupBy?: string; kernel: (v: Values) => Kernel }
export type Values = Record<string, unknown>;

const range = (key: string, label: string, min: number, max: number, def = 0, step = 1, group?: string): ParamSpec => ({ key, label, kind: 'range', min, max, step, def, group });
const cl = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lum = (r: number, g: number, b: number): number => 0.299 * r + 0.587 * g + 0.114 * b;

export function paramValue(spec: ParamSpec, raw: unknown): unknown {
  if (spec.kind === 'range') return typeof raw === 'number' && Number.isFinite(raw) ? Math.min(spec.max, Math.max(spec.min, raw)) : spec.def;
  if (spec.kind === 'check') return typeof raw === 'boolean' ? raw : spec.def;
  if (spec.kind === 'select') return spec.options.some(([v]) => v === raw) ? raw : spec.def;
  if (spec.kind === 'text') return typeof raw === 'string' ? raw.slice(0, 32_000_000) : spec.def;
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}, n = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(255, Math.max(0, v))) : d);
  return { r: n(o.r, spec.def.r), g: n(o.g, spec.def.g), b: n(o.b, spec.def.b) };
}

export function paramValues(kind: ParamKind, raw: unknown): Values {
  const o = raw && typeof raw === 'object' ? (raw as Values) : {}, out: Values = {};
  for (const s of PARAM_ADJUSTMENTS[kind].params) out[s.key] = paramValue(s, o[s.key]);
  return out;
}

/** Runs `f` on every pixel's channels as 0 to 1 and writes the result back; alpha untouched. */
function perPixel(f: (r: number, g: number, b: number) => [number, number, number]): Kernel {
  return (px) => {
    for (let i = 0; i < px.length; i += 4) {
      const [r, g, b] = f(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255);
      px[i] = Math.round(cl(r) * 255); px[i + 1] = Math.round(cl(g) * 255); px[i + 2] = Math.round(cl(b) * 255);
    }
  };
}

/** A 256-entry table per channel from `f`, applied by lookup. */
function lut(f: (v: number) => number): Kernel {
  const t = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) t[i] = Math.round(cl(f(i / 255)) * 255);
  const k: Kernel & { transfer?: (c: number, level: number) => number } = (px) => { for (let i = 0; i < px.length; i += 4) { px[i] = t[px[i]]; px[i + 1] = t[px[i + 1]]; px[i + 2] = t[px[i + 2]]; } };
  k.transfer = (_c, level) => cl(f(Math.max(0, Math.min(255, level)) / 255)) * 255;
  return k;
}

const n = (v: Values, k: string): number => v[k] as number;

/** Each pixel's luminance (0 to 1), blurred over about `radius` pixels: three passes of a running-sum box blur each way,
 *  close to a Gaussian, in time independent of the radius. */
function blurredLum(px: Uint8ClampedArray, w: number, h: number, radius: number): Float32Array {
  let a = new Float32Array(w * h), b = new Float32Array(w * h);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) a[j] = lum(px[i], px[i + 1], px[i + 2]) / 255;
  const r = Math.max(0, Math.round(radius / 1.7));
  if (r < 1) return a;
  const pass = (src: Float32Array, dst: Float32Array, len: number, lines: number, step: number, lineStep: number): void => {
    for (let l = 0; l < lines; l++) {
      const o = l * lineStep;
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += src[o + Math.min(len - 1, Math.max(0, k)) * step];
      for (let x = 0; x < len; x++) {
        dst[o + x * step] = sum / (2 * r + 1);
        sum += src[o + Math.min(len - 1, x + r + 1) * step] - src[o + Math.max(0, x - r) * step];
      }
    }
  };
  for (let k = 0; k < 3; k++) { pass(a, b, w, h, 1, w); pass(b, a, h, w, w, 1); }
  return a;
}

/** Colour a pixel toward (r, g, b) at luminance `to`, keeping its hue, with saturation scaled by `sat`. */
function relight(r: number, g: number, b: number, to: number, sat: number): [number, number, number] {
  const from = Math.max(1e-4, lum(r, g, b)), k = to / from, rr = r * k, gg = g * k, bb = b * k, l = lum(rr, gg, bb);
  return [l + (rr - l) * sat, l + (gg - l) * sat, l + (bb - l) * sat];
}

/** Color Lookup's built-in looks: this build's own formulas, as 3D tables are made from them. */
const LOOKS: Record<string, (r: number, g: number, b: number) => [number, number, number]> = {
  warm: (r, g, b) => [r * 1.06 + 0.02, g * 1.01, b * 0.88],
  cool: (r, g, b) => [r * 0.9, g * 0.99, b * 1.08 + 0.02],
  tealOrange: (r, g, b) => { const l = lum(r, g, b); return [r + (l - 0.5) * 0.18, g + (0.5 - Math.abs(l - 0.5)) * 0.02, b - (l - 0.5) * 0.22]; },
  bleach: (r, g, b) => { const l = lum(r, g, b), s = (x: number): number => 0.5 + (x - 0.5) * 1.3; return [s(l + (r - l) * 0.45), s(l + (g - l) * 0.45), s(l + (b - l) * 0.45)]; },
  fade: (r, g, b) => [0.08 + r * 0.86, 0.08 + g * 0.86, 0.1 + b * 0.84],
  mono: (r, g, b) => { const l = lum(r, g, b); return [l * 1.02, l, l * 0.96]; },
  cross: (r, g, b) => [r * r * 0.4 + r * 0.66, g * 1.08 - 0.02, b * 0.7 + 0.15],
  night: (r, g, b) => { const l = lum(r, g, b); return [l * 0.55 + r * 0.1, l * 0.7 + g * 0.1, l * 0.9 + b * 0.25]; },
};

/** A 3D table read from Adobe's .cube text (LUT_3D_SIZE, then N^3 lines of r g b with red changing fastest), or null
 *  if it is not one. DOMAIN_MIN and DOMAIN_MAX are honoured; 1D tables are refused. */
export function parseCube(text: string): { size: number; data: Float32Array; min: number[]; max: number[] } | null {
  let size = 0, min = [0, 0, 0], max = [1, 1, 1];
  const values: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('TITLE')) continue;
    const parts = line.split(/\s+/);
    if (parts[0] === 'LUT_3D_SIZE') { size = Number(parts[1]); continue; }
    if (parts[0] === 'LUT_1D_SIZE') return null;
    if (parts[0] === 'DOMAIN_MIN') { min = parts.slice(1, 4).map(Number); continue; }
    if (parts[0] === 'DOMAIN_MAX') { max = parts.slice(1, 4).map(Number); continue; }
    if (parts.length >= 3 && parts.slice(0, 3).every((p) => Number.isFinite(Number(p)))) values.push(Number(parts[0]), Number(parts[1]), Number(parts[2]));
  }
  if (!Number.isInteger(size) || size < 2 || size > 256 || values.length !== size ** 3 * 3) return null;
  return { size, data: new Float32Array(values), min, max };
}

/** A .cube table sampled with trilinear interpolation. */
function cubeSample(c: { size: number; data: Float32Array; min: number[]; max: number[] }, r: number, g: number, b: number): [number, number, number] {
  const N = c.size, at = (x: number, k: number): number => Math.min(N - 1, Math.max(0, ((x - c.min[k]) / (c.max[k] - c.min[k] || 1)) * (N - 1)));
  const p = [at(r, 0), at(g, 1), at(b, 2)], i0 = p.map((v) => Math.min(N - 2, Math.floor(v))), f = p.map((v, k) => v - i0[k]);
  const out: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 8; k++) {
    const o = [k & 1, (k >> 1) & 1, (k >> 2) & 1], wgt = o.reduce((m, oi, a) => m * (oi ? f[a] : 1 - f[a]), 1);
    if (!wgt) continue;
    const idx = ((i0[2] + o[2]) * N * N + (i0[1] + o[1]) * N + (i0[0] + o[0])) * 3;
    out[0] += wgt * c.data[idx]; out[1] += wgt * c.data[idx + 1]; out[2] += wgt * c.data[idx + 2];
  }
  return out;
}

/** A kernel that runs Develop's own math with only the named controls set, so Clarity, Dehaze, Texture and Light are
 *  small focused layers over the same code. `tone` and `detail` name Develop's controls; `pre` runs first on the pixels.
 *  The detail radii scale by the render's document units per pixel, so the look is the same at any zoom. */
function developSlice(tone: Partial<Record<string, number>>, detail: Partial<Record<string, number>>, pre?: (px: Uint8ClampedArray) => void): Kernel {
  const s = defaultDevelopState();
  Object.assign(s.tone, tone);
  Object.assign(s.detail, detail);
  const idle = Object.values(tone).every((x) => !x) && Object.values(detail).every((x) => !x);
  return (px, ctx) => {
    if (!ctx) return;
    pre?.(px);
    if (idle) return;
    const out = developImage(new ImageData(new Uint8ClampedArray(px), ctx.width, ctx.height), s, 1 / Math.max(1e-6, ctx.unitsPerPixel));
    for (let i = 0; i < px.length; i += 4) { px[i] = out.data[i]; px[i + 1] = out.data[i + 1]; px[i + 2] = out.data[i + 2]; }
  };
}

const SELECTIVE = ['reds', 'yellows', 'greens', 'cyans', 'blues', 'magentas', 'whites', 'neutrals', 'blacks'] as const;
const SELECTIVE_LABELS: Record<(typeof SELECTIVE)[number], string> = { reds: 'Reds', yellows: 'Yellows', greens: 'Greens', cyans: 'Cyans', blues: 'Blues', magentas: 'Magentas', whites: 'Whites', neutrals: 'Neutrals', blacks: 'Blacks' };

/** How much a pixel belongs to each Selective Colour family, 0 to 1. */
function families(r: number, g: number, b: number): Record<(typeof SELECTIVE)[number], number> {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), mid = r + g + b - mx - mn;
  return {
    reds: mx === r && r > g && r > b ? mx - mid : 0, greens: mx === g && g > r && g > b ? mx - mid : 0, blues: mx === b && b > r && b > g ? mx - mid : 0,
    yellows: mn === b && b < r && b < g ? mid - mn : 0, cyans: mn === r && r < g && r < b ? mid - mn : 0, magentas: mn === g && g < r && g < b ? mid - mn : 0,
    whites: mn > 0.5 ? (mn - 0.5) * 2 : 0, blacks: mx < 0.5 ? (0.5 - mx) * 2 : 0, neutrals: cl(1 - (Math.abs(mx - 0.5) + Math.abs(mn - 0.5))),
  };
}

export const PARAM_ADJUSTMENTS: Record<ParamKind, ParamAdjustment> = {
  brightnessContrast: {
    label: 'Brightness/Contrast',
    params: [range('brightness', 'Brightness', -150, 150), range('contrast', 'Contrast', -50, 100), { key: 'legacy', label: 'Use Legacy', kind: 'check', def: false }],
    kernel: (v) => {
      const b = n(v, 'brightness'), c = n(v, 'contrast'), legacy = v.legacy === true;
      if (legacy) return lut((x) => (x + b / 255 - 0.5) * (1 + c / 100) + 0.5);
      const gamma = b >= 0 ? 1 / (1 + b / 100) : 1 - b / 100, a = (10 * c) / 100;
      const sig = (x: number): number => 1 / (1 + Math.exp(-a * (x - 0.5))), s0 = sig(0), s1 = sig(1);
      return lut((x) => { const y = Math.pow(x, gamma); return c > 0 ? (sig(y) - s0) / (s1 - s0) : 0.5 + (y - 0.5) * (1 + c / 100); });
    },
  },
  vibrance: {
    label: 'Vibrance',
    params: [range('vibrance', 'Vibrance', -100, 100), range('saturation', 'Saturation', -100, 100)],
    kernel: (v) => {
      const vb = n(v, 'vibrance') / 100, sa = n(v, 'saturation') / 100;
      return perPixel((r, g, b) => {
        const L = lum(r, g, b), s = Math.max(r, g, b) - Math.min(r, g, b), k = (1 + vb * (vb > 0 ? 1 - s : 1)) * (1 + sa);
        return [L + (r - L) * k, L + (g - L) * k, L + (b - L) * k];
      });
    },
  },
  colorBalance: {
    label: 'Color Balance',
    groupBy: 'tone',
    params: [
      { key: 'tone', label: 'Tone', kind: 'select', options: [['shadows', 'Shadows'], ['midtones', 'Midtones'], ['highlights', 'Highlights']], def: 'midtones' },
      ...(['shadows', 'midtones', 'highlights'] as const).flatMap((t) => [range(`${t}CR`, 'Cyan to Red', -100, 100, 0, 1, t), range(`${t}MG`, 'Magenta to Green', -100, 100, 0, 1, t), range(`${t}YB`, 'Yellow to Blue', -100, 100, 0, 1, t)]),
      { key: 'preserve', label: 'Preserve Luminosity', kind: 'check', def: true },
    ],
    kernel: (v) => {
      const a = 0.25, bb = 0.333, sc = 0.7, keep = v.preserve !== false;
      const sh = [n(v, 'shadowsCR'), n(v, 'shadowsMG'), n(v, 'shadowsYB')], md = [n(v, 'midtonesCR'), n(v, 'midtonesMG'), n(v, 'midtonesYB')], hi = [n(v, 'highlightsCR'), n(v, 'highlightsMG'), n(v, 'highlightsYB')];
      return perPixel((r, g, b) => {
        const L = lum(r, g, b), ws = cl((L - bb) / -a + 0.5) * sc, wm = cl((L - bb) / a + 0.5) * cl((L + bb - 1) / -a + 0.5) * sc, wh = cl((L + bb - 1) / a + 0.5) * sc;
        const d = [0, 1, 2].map((c) => (sh[c] * ws + md[c] * wm + hi[c] * wh) / 100);
        let o: [number, number, number] = [cl(r + d[0]), cl(g + d[1]), cl(b + d[2])];
        if (keep) { const s = L - lum(o[0], o[1], o[2]); o = [o[0] + s, o[1] + s, o[2] + s]; }
        return o;
      });
    },
  },
  blackWhite: {
    label: 'Black & White',
    params: [range('reds', 'Reds', -200, 300, 40), range('yellows', 'Yellows', -200, 300, 60), range('greens', 'Greens', -200, 300, 40), range('cyans', 'Cyans', -200, 300, 60), range('blues', 'Blues', -200, 300, 20), range('magentas', 'Magentas', -200, 300, 80),
      { key: 'tint', label: 'Tint', kind: 'check', def: false }, { key: 'tintColor', label: 'Tint colour', kind: 'color', def: { r: 225, g: 211, b: 179 } }],
    kernel: (v) => {
      const w = (k: string): number => n(v, k) / 100, tint = v.tint === true, tc = v.tintColor as RGB, t = [tc.r / 255, tc.g / 255, tc.b / 255], tl = lum(t[0], t[1], t[2]) || 1;
      return perPixel((r, g, b) => {
        const c = [r, g, b], order = [0, 1, 2].sort((x, y) => c[y] - c[x]), mx = c[order[0]], mid = c[order[1]], mn = c[order[2]];
        const primary = ['reds', 'greens', 'blues'][order[0]], pair = order[0] + order[1], secondary = pair === 1 ? 'yellows' : pair === 3 ? 'cyans' : 'magentas';
        const gray = mn + (mid - mn) * w(secondary) + (mx - mid) * w(primary);
        return tint ? [gray * t[0] / tl, gray * t[1] / tl, gray * t[2] / tl] : [gray, gray, gray];
      });
    },
  },
  photoFilter: {
    label: 'Photo Filter',
    params: [{ key: 'color', label: 'Filter colour', kind: 'color', def: { r: 236, g: 138, b: 0 } }, range('density', 'Density', 1, 100, 25), { key: 'preserve', label: 'Preserve Luminosity', kind: 'check', def: true }],
    kernel: (v) => {
      const c = v.color as RGB, d = n(v, 'density') / 100, f = [c.r / 255, c.g / 255, c.b / 255], keep = v.preserve !== false;
      return perPixel((r, g, b) => {
        const L = lum(r, g, b);
        let o: [number, number, number] = [r + (f[0] - r) * d, g + (f[1] - g) * d, b + (f[2] - b) * d];
        if (keep) { const s = L - lum(o[0], o[1], o[2]); o = [o[0] + s, o[1] + s, o[2] + s]; }
        return o;
      });
    },
  },
  channelMixer: {
    label: 'Channel Mixer',
    groupBy: 'output',
    params: [
      { key: 'output', label: 'Output channel', kind: 'select', options: [['red', 'Red'], ['green', 'Green'], ['blue', 'Blue'], ['cyan', 'Cyan'], ['magenta', 'Magenta'], ['yellow', 'Yellow'], ['black', 'Black']], def: 'red' },
      ...(['red', 'green', 'blue'] as const).flatMap((o) => [range(`${o}R`, 'Red', -200, 200, o === 'red' ? 100 : 0, 1, o), range(`${o}G`, 'Green', -200, 200, o === 'green' ? 100 : 0, 1, o), range(`${o}B`, 'Blue', -200, 200, o === 'blue' ? 100 : 0, 1, o), range(`${o}K`, 'Constant', -200, 200, 0, 1, o)]),
      // The inks (1.57.9, CMYK documents): each output ink mixes the four inks and a constant, as Photoshop's in CMYK.
      ...(['cyan', 'magenta', 'yellow', 'black'] as const).flatMap((o) => [range(`${o}Cy`, 'Cyan', -200, 200, o === 'cyan' ? 100 : 0, 1, o), range(`${o}Ma`, 'Magenta', -200, 200, o === 'magenta' ? 100 : 0, 1, o), range(`${o}Ye`, 'Yellow', -200, 200, o === 'yellow' ? 100 : 0, 1, o), range(`${o}Bk`, 'Black', -200, 200, o === 'black' ? 100 : 0, 1, o), range(`${o}Co`, 'Constant', -200, 200, 0, 1, o)]),
      { key: 'monochrome', label: 'Monochrome', kind: 'check', def: false },
    ],
    kernel: (v) => {
      const row = (o: string): number[] => ['R', 'G', 'B', 'K'].map((k) => n(v, `${o}${k}`) / 100), R = row('red'), G = row('green'), B = row('blue'), mono = v.monochrome === true;
      const mix = (m: number[], r: number, g: number, b: number): number => m[0] * r + m[1] * g + m[2] * b + m[3];
      return perPixel((r, g, b) => { const x = mix(R, r, g, b); return mono ? [x, x, x] : [x, mix(G, r, g, b), mix(B, r, g, b)]; });
    },
  },
  invert: { label: 'Invert', params: [], kernel: () => lut((x) => 1 - x) },
  posterize: {
    label: 'Posterize',
    params: [range('levels', 'Levels', 2, 255, 4)],
    kernel: (v) => { const k = Math.round(n(v, 'levels')) - 1; return lut((x) => Math.round(x * k) / k); },
  },
  threshold: {
    label: 'Threshold',
    params: [range('level', 'Threshold Level', 1, 255, 128)],
    kernel: (v) => { const t = n(v, 'level'); const cpu = perPixel((r, g, b) => { const x = lum(r, g, b) * 255 >= t ? 1 : 0; return [x, x, x]; }); return (px, ctx) => { if (!gpuFilters()?.threshold(px, t)) cpu(px, ctx); }; },   // 36.10: the GPU when one is registered
  },
  selectiveColor: {
    label: 'Selective Color',
    groupBy: 'colors',
    params: [
      { key: 'colors', label: 'Colors', kind: 'select', options: SELECTIVE.map((c) => [c, SELECTIVE_LABELS[c]] as const), def: 'reds' },
      ...SELECTIVE.flatMap((c) => [range(`${c}C`, 'Cyan', -100, 100, 0, 1, c), range(`${c}M`, 'Magenta', -100, 100, 0, 1, c), range(`${c}Y`, 'Yellow', -100, 100, 0, 1, c), range(`${c}K`, 'Black', -100, 100, 0, 1, c)]),
      { key: 'method', label: 'Method', kind: 'select', options: [['relative', 'Relative'], ['absolute', 'Absolute']], def: 'relative' },
    ],
    kernel: (v) => {
      const rel = v.method !== 'absolute', adj = SELECTIVE.map((c) => ['C', 'M', 'Y', 'K'].map((k) => n(v, `${c}${k}`) / 100));
      const active = SELECTIVE.map((_, i) => adj[i].some((x) => x !== 0));
      return perPixel((r, g, b) => {
        const f = families(r, g, b), c = [r, g, b];
        const out = c.slice() as [number, number, number];
        SELECTIVE.forEach((fam, i) => {
          const w = f[fam];
          if (!w || !active[i]) return;
          for (let ch = 0; ch < 3; ch++) { const ink = 1 - c[ch], d = (adj[i][ch] + adj[i][3] * (1 - ink)) * (rel ? ink || 0.0001 : 1); out[ch] -= w * d; }
        });
        return out;
      });
    },
  },
  shadowsHighlights: {
    label: 'Shadows/Highlights',
    // No groups: the panel hides grouped controls unless a groupBy selector names their group; the labels say which is which.
    params: [range('shadowAmount', 'Shadows Amount', 0, 100, 35), range('shadowTone', 'Shadows Tone', 0, 100, 50), range('shadowRadius', 'Shadows Radius', 0, 2500, 30),
      range('highlightAmount', 'Highlights Amount', 0, 100, 0), range('highlightTone', 'Highlights Tone', 0, 100, 50), range('highlightRadius', 'Highlights Radius', 0, 2500, 30),
      range('color', 'Color', -100, 100, 20), range('midtone', 'Midtone', -100, 100, 0)],
    kernel: (v) => (px, ctx) => {
      if (!ctx) return;
      const scale = 1 / Math.max(1e-6, ctx.unitsPerPixel), w = ctx.width, h = ctx.height;
      const bs = blurredLum(px, w, h, n(v, 'shadowRadius') * scale);
      const bh = n(v, 'highlightRadius') === n(v, 'shadowRadius') ? bs : blurredLum(px, w, h, n(v, 'highlightRadius') * scale);
      const aS = n(v, 'shadowAmount') / 100, tS = Math.max(0.02, n(v, 'shadowTone') / 100), aH = n(v, 'highlightAmount') / 100, tH = Math.max(0.02, n(v, 'highlightTone') / 100);
      const col = n(v, 'color') / 100, mid = n(v, 'midtone') / 100;
      for (let i = 0, j = 0; i < px.length; i += 4, j++) {
        const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255, L = lum(r, g, b);
        // Shadows: where the neighbourhood is darker than the tone width, lift toward it; highlights: where brighter than
        // its mirror, pull toward it. Strong near black and white, continuous at each boundary.
        const ws = aS * cl(1 - bs[j] / tS) ** 2, wh = aH * cl((bh[j] - (1 - tH)) / tH) ** 2;
        let L2 = L < tS ? L + ws * (tS - L) * 0.8 : L;
        L2 = L2 > 1 - tH ? L2 - wh * (L2 - (1 - tH)) * 0.8 : L2;
        L2 += mid * 4 * L2 * (1 - L2) * (L2 - 0.5);
        const [nr, ng, nb] = relight(r, g, b, cl(L2), 1 + col * (ws + wh));
        px[i] = Math.round(cl(nr) * 255); px[i + 1] = Math.round(cl(ng) * 255); px[i + 2] = Math.round(cl(nb) * 255);
      }
    },
  },
  hdrToning: {
    label: 'HDR Toning',
    params: [range('radius', 'Radius', 1, 500, 15), range('strength', 'Strength', 10, 400, 52),
      range('gamma', 'Gamma', 10, 200, 100), range('exposure', 'Exposure', -500, 500, 0), range('detail', 'Detail', -100, 300, 30),
      range('vibrance', 'Vibrance', -100, 100, 0), range('saturation', 'Saturation', -100, 100, 20)],
    kernel: (v) => (px, ctx) => {
      if (!ctx) return;
      // Local adaptation: luminance split into a base (its blur) and detail; the base's range compressed by Strength,
      // detail raised by Detail, then Exposure (stops, in hundredths) and Gamma, colour kept by relighting.
      const base = blurredLum(px, ctx.width, ctx.height, n(v, 'radius') / Math.max(1e-6, ctx.unitsPerPixel));
      const strength = n(v, 'strength') / 100, detail = 1 + n(v, 'detail') / 100, expo = 2 ** (n(v, 'exposure') / 100), gamma = n(v, 'gamma') / 100;
      const vib = n(v, 'vibrance') / 100, sat = 1 + n(v, 'saturation') / 100;
      for (let i = 0, j = 0; i < px.length; i += 4, j++) {
        const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255, L = Math.max(1e-4, lum(r, g, b)), B = Math.max(1e-4, base[j]);
        const lb = Math.log(B), ld = Math.log(L) - lb, mean = Math.log(0.45);
        const L2 = cl((Math.exp(mean + (lb - mean) / (1 + strength) + ld * detail) * expo) ** (1 / gamma));
        const s0 = (Math.max(r, g, b) - Math.min(r, g, b)), s = sat * (1 + vib * (1 - s0));
        const [nr, ng, nb] = relight(r, g, b, L2, s);
        px[i] = Math.round(cl(nr) * 255); px[i + 1] = Math.round(cl(ng) * 255); px[i + 2] = Math.round(cl(nb) * 255);
      }
    },
  },
  colorLookup: {
    label: 'Color Lookup',
    params: [{ key: 'look', label: 'Look', kind: 'select', options: [['warm', 'Warm'], ['cool', 'Cool'], ['tealOrange', 'Teal and Orange'], ['bleach', 'Bleach Bypass'], ['fade', 'Faded Film'], ['mono', 'Warm Mono'], ['cross', 'Cross Process'], ['night', 'Night']], def: 'warm' },
      { key: 'cube', label: '3D LUT file', kind: 'text', def: '' }, { key: 'cubeName', label: 'File', kind: 'text', def: '' }],
    kernel: (v) => {
      // A loaded .cube file wins over the built-in look; an unreadable one leaves the image as it is.
      const text = String(v.cube ?? '');
      if (text) { const c = parseCube(text); return c ? perPixel((r, g, b) => cubeSample(c, r, g, b)) : () => undefined; }
      const f = LOOKS[String(v.look)] ?? LOOKS.warm;
      return perPixel(f);
    },
  },
  develop: {
    label: 'Develop',
    params: [range('exposure', 'Exposure', -500, 500), range('contrast', 'Contrast', -100, 100), range('highlights', 'Highlights', -100, 100), range('shadows', 'Shadows', -100, 100), range('whites', 'Whites', -100, 100), range('blacks', 'Blacks', -100, 100),
      range('temperature', 'Temperature', -100, 100), range('tint', 'Tint', -100, 100), range('vibrance', 'Vibrance', -100, 100), range('saturation', 'Saturation', -100, 100),
      range('texture', 'Texture', -100, 100), range('clarity', 'Clarity', -100, 100), range('dehaze', 'Dehaze', -100, 100), range('vignette', 'Vignette', 0, 100)],
    kernel: (v) => {
      const s = defaultDevelopState();
      for (const k of ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'temperature', 'tint', 'vibrance', 'saturation', 'dehaze', 'vignette'] as const) s.tone[k] = n(v, k);
      s.detail.clarity = n(v, 'clarity');
      s.detail.texture = n(v, 'texture');
      return (px, ctx) => {
        if (!ctx) return;
        const out = developImage(new ImageData(new Uint8ClampedArray(px), ctx.width, ctx.height), s, 1 / Math.max(1e-6, ctx.unitsPerPixel));
        for (let i = 0; i < px.length; i += 4) { px[i] = out.data[i]; px[i + 1] = out.data[i + 1]; px[i + 2] = out.data[i + 2]; }
      };
    },
  },
  // The four presence and tone layers (31.1), each one slice of Develop's math as its own maskable layer.
  clarity: {
    label: 'Clarity',
    params: [range('clarity', 'Clarity', -100, 100)],
    kernel: (v) => developSlice({}, { clarity: n(v, 'clarity') }),
  },
  dehaze: {
    label: 'Dehaze',
    params: [range('dehaze', 'Dehaze', -100, 100)],
    kernel: (v) => developSlice({ dehaze: n(v, 'dehaze') }, {}),
  },
  texture: {
    label: 'Texture',
    params: [range('texture', 'Texture', -100, 100)],
    kernel: (v) => developSlice({}, { texture: n(v, 'texture') }),
  },
  light: {
    label: 'Light',
    params: [range('brightness', 'Brightness', -100, 100), range('contrast', 'Contrast', -100, 100), range('highlights', 'Highlights', -100, 100), range('shadows', 'Shadows', -100, 100), range('whites', 'Whites', -100, 100), range('blacks', 'Blacks', -100, 100)],
    kernel: (v) => {
      // Brightness lifts or lowers the midtones and leaves black and white where they are: x + b * x * (1 - x).
      const b = n(v, 'brightness') / 100;
      return developSlice({ contrast: n(v, 'contrast'), highlights: n(v, 'highlights'), shadows: n(v, 'shadows'), whites: n(v, 'whites'), blacks: n(v, 'blacks') }, {},
        b ? (px) => { for (let i = 0; i < px.length; i += 4) for (let c = 0; c < 3; c++) { const x = px[i + c] / 255; px[i + c] = Math.round(cl(x + b * x * (1 - x)) * 255); } } : undefined);
    },
  },
  // Film looks (1.51.6, the capability plan), each an adjustment layer: split toning; halation (the brightest areas
  // bloom red-orange, as film's anti-halation layer lets through); glow (the same bloom in the highlights' own colour).
  splitToning: {
    label: 'Split Toning',
    params: [range('shadowHue', 'Shadow hue', 0, 360, 200), range('shadowSat', 'Shadow saturation', 0, 100, 25), range('highlightHue', 'Highlight hue', 0, 360, 40), range('highlightSat', 'Highlight saturation', 0, 100, 25), range('balance', 'Balance', -100, 100, 0)],
    kernel: (v) => {
      const tint = (hue: number): [number, number, number] => { const h = (((hue % 360) + 360) % 360) / 60, x = 1 - Math.abs((h % 2) - 1), c: [number, number, number] = h < 1 ? [1, x, 0] : h < 2 ? [x, 1, 0] : h < 3 ? [0, 1, x] : h < 4 ? [0, x, 1] : h < 5 ? [x, 0, 1] : [1, 0, x]; const l = lum(...c); return [c[0] - l, c[1] - l, c[2] - l]; };
      const sh = tint(n(v, 'shadowHue')), hi = tint(n(v, 'highlightHue')), ss = n(v, 'shadowSat') / 100 * 0.5, hs = n(v, 'highlightSat') / 100 * 0.5, mid = 0.5 + n(v, 'balance') / 200;
      return (px) => {
        for (let i = 0; i < px.length; i += 4) {
          const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255, l = lum(r, g, b);
          const w = Math.min(1, Math.max(0, (l - mid) * 4 + 0.5)), ks = (1 - w) * ss, kh = w * hs;   // shadows below the balance, highlights above
          px[i] = Math.round(cl(r + sh[0] * ks + hi[0] * kh) * 255); px[i + 1] = Math.round(cl(g + sh[1] * ks + hi[1] * kh) * 255); px[i + 2] = Math.round(cl(b + sh[2] * ks + hi[2] * kh) * 255);
        }
      };
    },
  },
  halation: {
    label: 'Halation',
    params: [range('amount', 'Amount', 0, 100, 40), range('radius', 'Radius', 1, 200, 18), range('threshold', 'Threshold', 0, 100, 70)],
    kernel: (v) => bloom(n(v, 'amount') / 100, n(v, 'radius'), n(v, 'threshold') / 100, [1, 0.32, 0.12]),
  },
  glow: {
    label: 'Glow',
    params: [range('amount', 'Amount', 0, 100, 35), range('radius', 'Radius', 1, 200, 24), range('threshold', 'Threshold', 0, 100, 60)],
    kernel: (v) => bloom(n(v, 'amount') / 100, n(v, 'radius'), n(v, 'threshold') / 100, null),
  },

};

export const PARAM_KINDS = Object.keys(PARAM_ADJUSTMENTS) as ParamKind[];
export const isParamKind = (k: string): k is ParamKind => k in PARAM_ADJUSTMENTS;
export const paramKernel = (kind: ParamKind, raw: unknown): Kernel => PARAM_ADJUSTMENTS[kind].kernel(paramValues(kind, raw));

/** Halation and Glow: what is brighter than `threshold` blurred by `radius` document pixels (three box passes, close to
 *  a Gaussian), tinted (Halation) or in its own colour (Glow), and screened back over the picture by `amount`. */
function bloom(amount: number, radius: number, threshold: number, tint: [number, number, number] | null): Kernel {
  return (px, ctx) => {
    if (!ctx || amount <= 0) return;
    const W = ctx.width, H = ctx.height, r = Math.max(1, Math.round(radius / Math.max(1e-6, ctx.unitsPerPixel) / 2));
    const ch = [new Float32Array(W * H), new Float32Array(W * H), new Float32Array(W * H)];
    for (let i = 0, j = 0; j < W * H; i += 4, j++) {
      const R = px[i] / 255, G = px[i + 1] / 255, B = px[i + 2] / 255, over = Math.max(0, lum(R, G, B) - threshold) / Math.max(1e-3, 1 - threshold);
      if (tint) { ch[0][j] = over * tint[0]; ch[1][j] = over * tint[1]; ch[2][j] = over * tint[2]; } else { ch[0][j] = R * over; ch[1][j] = G * over; ch[2][j] = B * over; }
    }
    for (const c of ch) for (let pass = 0; pass < 3; pass++) boxBlur(c, W, H, r);
    for (let i = 0, j = 0; j < W * H; i += 4, j++) for (let k = 0; k < 3; k++) {
      const base = px[i + k] / 255, add = Math.min(1, ch[k][j] * amount * 1.6);
      px[i + k] = Math.round((1 - (1 - base) * (1 - add)) * 255);   // screen
    }
  };
}

/** One box blur pass of radius `r`, horizontally then vertically, in place. */
function boxBlur(a: Float32Array, W: number, H: number, r: number): void {
  const tmp = new Float32Array(Math.max(W, H)), span = 2 * r + 1;
  for (let y = 0; y < H; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += a[y * W + Math.min(W - 1, Math.max(0, x))];
    for (let x = 0; x < W; x++) { tmp[x] = sum / span; sum += a[y * W + Math.min(W - 1, x + r + 1)] - a[y * W + Math.max(0, x - r)]; }
    a.set(tmp.subarray(0, W), y * W);
  }
  for (let x = 0; x < W; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += a[Math.min(H - 1, Math.max(0, y)) * W + x];
    for (let y = 0; y < H; y++) { tmp[y] = sum / span; sum += a[Math.min(H - 1, y + r + 1) * W + x] - a[Math.max(0, y - r) * W + x]; }
    for (let y = 0; y < H; y++) a[y * W + x] = tmp[y];
  }
}
