import { defaultDevelopState, developImage } from './develop';
import type { Kernel } from './kernels';
import type { RGB } from './types';

/** Adjustments described by their controls, each baked into a kernel from its settings. Values live in an
 *  adjustment's `data.params`; a missing or unreadable value takes its default. Formulas are standard published ones:
 *  Black and White weights each pixel's grey by the hue of its two largest channels, as Photoshop documents it;
 *  Colour Balance weights shadows, midtones and highlights by lightness with the usual overlapping ramps; Selective
 *  Colour weights each pixel by how much it belongs to a colour family and moves its ink, relative or absolute. */

export type ParamKind = 'brightnessContrast' | 'vibrance' | 'colorBalance' | 'blackWhite' | 'photoFilter' | 'channelMixer' | 'invert' | 'posterize' | 'threshold' | 'selectiveColor' | 'develop';

export type ParamSpec =
  | { key: string; label: string; kind: 'range'; min: number; max: number; step: number; def: number; group?: string }
  | { key: string; label: string; kind: 'check'; def: boolean; group?: string }
  | { key: string; label: string; kind: 'color'; def: RGB; group?: string }
  | { key: string; label: string; kind: 'select'; options: ReadonlyArray<readonly [string, string]>; def: string; group?: string };

export interface ParamAdjustment { label: string; params: ParamSpec[]; groupBy?: string; kernel: (v: Values) => Kernel }
export type Values = Record<string, unknown>;

const range = (key: string, label: string, min: number, max: number, def = 0, step = 1, group?: string): ParamSpec => ({ key, label, kind: 'range', min, max, step, def, group });
const cl = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lum = (r: number, g: number, b: number): number => 0.299 * r + 0.587 * g + 0.114 * b;

export function paramValue(spec: ParamSpec, raw: unknown): unknown {
  if (spec.kind === 'range') return typeof raw === 'number' && Number.isFinite(raw) ? Math.min(spec.max, Math.max(spec.min, raw)) : spec.def;
  if (spec.kind === 'check') return typeof raw === 'boolean' ? raw : spec.def;
  if (spec.kind === 'select') return spec.options.some(([v]) => v === raw) ? raw : spec.def;
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
  return (px) => { for (let i = 0; i < px.length; i += 4) { px[i] = t[px[i]]; px[i + 1] = t[px[i + 1]]; px[i + 2] = t[px[i + 2]]; } };
}

const n = (v: Values, k: string): number => v[k] as number;

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
      { key: 'output', label: 'Output channel', kind: 'select', options: [['red', 'Red'], ['green', 'Green'], ['blue', 'Blue']], def: 'red' },
      ...(['red', 'green', 'blue'] as const).flatMap((o) => [range(`${o}R`, 'Red', -200, 200, o === 'red' ? 100 : 0, 1, o), range(`${o}G`, 'Green', -200, 200, o === 'green' ? 100 : 0, 1, o), range(`${o}B`, 'Blue', -200, 200, o === 'blue' ? 100 : 0, 1, o), range(`${o}K`, 'Constant', -200, 200, 0, 1, o)]),
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
    kernel: (v) => { const t = n(v, 'level'); return perPixel((r, g, b) => { const x = lum(r, g, b) * 255 >= t ? 1 : 0; return [x, x, x]; }); },
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
};

export const PARAM_KINDS = Object.keys(PARAM_ADJUSTMENTS) as ParamKind[];
export const isParamKind = (k: string): k is ParamKind => k in PARAM_ADJUSTMENTS;
export const paramKernel = (kind: ParamKind, raw: unknown): Kernel => PARAM_ADJUSTMENTS[kind].kernel(paramValues(kind, raw));
