import { clamp, type AdjustmentKind } from './types';
import { PARAM_ADJUSTMENTS, PARAM_KINDS, isParamKind, paramValues, type ParamKind } from './adjust-params';
import type { Kernel, KernelContext } from './kernels';

/** Hue/Saturation and Grain adjustment layers, written for formvis. Hue/Saturation works in HSL: seven colour
 *  ranges (Master and six hue bands, each a trapezoid on the colour wheel with soft shoulders) shift hue, scale
 *  saturation and pull lightness toward white or black; the result is baked into a 33-point colour cube read by
 *  trilinear interpolation. Grain is smoothed lattice noise mixed with per-pixel noise, strongest in the midtones.
 *  Settings keep the field names and layouts formvis's project files use, including dictionaries stored as alternating
 *  key and value arrays. */

export const ADJUSTMENT_LABELS: Record<AdjustmentKind, string> = {
  hsv: 'Hue/Saturation', levels: 'Levels', curves: 'Curves', exposure: 'Exposure', gradientMap: 'Gradient Map', grain: 'Grain',
  ...(Object.fromEntries(PARAM_KINDS.map((k) => [k, PARAM_ADJUSTMENTS[k].label])) as Record<ParamKind, string>),
};
export const ADJUSTMENT_KINDS: AdjustmentKind[] = ['hsv', 'levels', 'curves', 'exposure', 'gradientMap', 'grain', ...PARAM_KINDS];

export const COLOR_RANGES = ['Master', 'Reds', 'Yellows', 'Greens', 'Cyans', 'Blues', 'Magentas'] as const;
export type ColorRange = (typeof COLOR_RANGES)[number];
/** A hue band in degrees: weight rises from the falloff start to the range start, holds at full through the range
 *  end, and falls to zero at the falloff end, measured forward around the wheel. */
export interface HueBand { falloffStart: number; rangeStart: number; rangeEnd: number; falloffEnd: number }
export interface RangeAdjustment { hue: number; saturation: number; lightness: number }
export interface HsvSettings { range: ColorRange; colorize: boolean; invertRange: boolean; adjustments: Partial<Record<ColorRange, RangeAdjustment>>; bands: Record<ColorRange, HueBand> }

const hueBand = (falloffStart: number, rangeStart: number, rangeEnd: number, falloffEnd: number): HueBand => ({ falloffStart, rangeStart, rangeEnd, falloffEnd });
/** Six 60 degree ranges centred on the primaries and secondaries, each with 30 degree shoulders. */
export const DEFAULT_BANDS: Record<ColorRange, HueBand> = {
  Master: hueBand(0, 0, 360, 360),
  Reds: hueBand(315, 345, 15, 45),
  Yellows: hueBand(15, 45, 75, 105),
  Greens: hueBand(75, 105, 135, 165),
  Cyans: hueBand(135, 165, 195, 225),
  Blues: hueBand(195, 225, 255, 285),
  Magentas: hueBand(255, 285, 315, 345),
};

type Json = Record<string, unknown>;
const record = (v: unknown): Json => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const finite = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const isRange = (v: unknown): v is ColorRange => typeof v === 'string' && (COLOR_RANGES as readonly string[]).includes(v);

/** Entries of a dictionary stored either as an object or as an alternating [key, value, key, value] array. */
function entriesOf(v: unknown): Array<[string, unknown]> {
  if (!Array.isArray(v)) return v !== null && typeof v === 'object' ? Object.entries(v as Json) : [];
  const out: Array<[string, unknown]> = [];
  for (let i = 1; i < v.length; i += 2) out.push([String(v[i - 1]), v[i]]);
  return out;
}

/** Degrees from `from` forward to `to`, always 0 to 360. */
export function bandForward(from: number, to: number): number {
  const d = (to - from) % 360;
  return d < 0 ? d + 360 : d;
}
const onWheel = (v: number): number => bandForward(0, v);

/** A hue's weight in a band: its position forward from the falloff start, read against the trapezoid. A band with
 *  no extent weighs everything fully. */
export function bandWeight(b: HueBand, hue: number): number {
  const total = bandForward(b.falloffStart, b.falloffEnd);
  if (!(total > 0)) return 1;
  const at = bandForward(b.falloffStart, hue);
  if (at > total) return 0;
  const rise = bandForward(b.falloffStart, b.rangeStart), holdTo = bandForward(b.falloffStart, b.rangeEnd);
  if (at < rise) return rise > 0 ? at / rise : 1;
  if (at <= holdTo) return 1;
  const fall = total - holdTo;
  return fall > 0 ? (total - at) / fall : 1;
}

export const bandHandles = (b: HueBand): number[] => [b.falloffStart, b.rangeStart, b.rangeEnd, b.falloffEnd];

/** The band with every handle on the wheel and its extent kept to 350 degrees at most. */
function tidyBand(b: HueBand): HueBand {
  const t = hueBand(onWheel(b.falloffStart), onWheel(b.rangeStart), onWheel(b.rangeEnd), onWheel(b.falloffEnd));
  if (bandForward(t.falloffStart, t.falloffEnd) > 350) t.falloffEnd = onWheel(t.falloffStart + 350);
  return t;
}

/** The Sample eyedropper: the same band shape, its core centred on `hue`. */
export function bandCentered(b: HueBand, hue: number): HueBand {
  const core = bandForward(b.rangeStart, b.rangeEnd), lead = bandForward(b.falloffStart, b.rangeStart), trail = bandForward(b.rangeEnd, b.falloffEnd);
  const coreStart = onWheel(hue - core / 2), coreEnd = coreStart + core;
  return hueBand(onWheel(coreStart - lead), coreStart, onWheel(coreEnd), onWheel(coreEnd + trail));
}

/** The Add eyedropper: stretch the nearer core edge to reach `hue`, carrying its shoulder along. */
export function bandInclude(b: HueBand, hue: number): HueBand {
  if (bandWeight(b, hue) >= 1) return b;
  const lead = bandForward(b.falloffStart, b.rangeStart), trail = bandForward(b.rangeEnd, b.falloffEnd);
  const nearerStart = bandForward(hue, b.rangeStart) <= bandForward(b.rangeEnd, hue);
  return tidyBand(nearerStart ? hueBand(hue - lead, hue, b.rangeEnd, b.falloffEnd) : hueBand(b.falloffStart, b.rangeStart, hue, hue + trail));
}

/** The Remove eyedropper: pull the nearer outer edge in just past `hue`, carrying the core edge with it. */
export function bandExclude(b: HueBand, hue: number): HueBand {
  if (bandWeight(b, hue) <= 0) return b;
  const lead = bandForward(b.falloffStart, b.rangeStart), trail = bandForward(b.rangeEnd, b.falloffEnd);
  const nearerStart = bandForward(b.falloffStart, hue) <= bandForward(hue, b.falloffEnd);
  return tidyBand(nearerStart ? hueBand(hue + 1, hue + 1 + lead, b.rangeEnd, b.falloffEnd) : hueBand(b.falloffStart, b.rangeStart, hue - 1 - trail, hue - 1));
}

/** Drag one handle (0 falloff start, 1 range start, 2 range end, 3 falloff end). The move is refused when it would
 *  put the handles out of order, collapse the band, or stretch it past 350 degrees. */
export function bandSetHandle(b: HueBand, index: number, degrees: number): HueBand {
  const handles = bandHandles(b);
  handles[Math.max(0, Math.min(3, index))] = onWheel(degrees);
  const moved = hueBand(handles[0], handles[1], handles[2], handles[3]);
  const total = bandForward(moved.falloffStart, moved.falloffEnd), toCore = bandForward(moved.falloffStart, moved.rangeStart), toCoreEnd = bandForward(moved.falloffStart, moved.rangeEnd);
  const valid = total > 1 && total <= 350 && toCore <= toCoreEnd && toCoreEnd <= total;
  return valid ? moved : b;
}

export function defaultHsv(): HsvSettings {
  return { range: 'Master', colorize: false, invertRange: false, adjustments: {}, bands: { ...DEFAULT_BANDS } };
}

const rangeAdjustment = (v: unknown): RangeAdjustment => { const a = record(v); return { hue: finite(a.hue, 0), saturation: finite(a.saturation, 0), lightness: finite(a.lightness, 0) }; };

/** Settings from saved data: the full `hsvSettings` record, or the older single Master adjustment. */
export function hsvFromData(d: Json): HsvSettings {
  const s = defaultHsv();
  if (!d.hsvSettings) {
    s.colorize = d.colorize === true;
    s.adjustments.Master = rangeAdjustment(d);
    return s;
  }
  const raw = record(d.hsvSettings);
  if (isRange(raw.range)) s.range = raw.range;
  s.colorize = raw.colorize === true;
  s.invertRange = raw.invertRange === true;
  for (const [key, value] of entriesOf(raw.adjustments)) if (isRange(key)) s.adjustments[key] = rangeAdjustment(value);
  for (const [key, value] of entriesOf(raw.bands)) {
    if (!isRange(key)) continue;
    const b = record(value);
    s.bands[key] = hueBand(finite(b.falloffStart, 0), finite(b.rangeStart, 0), finite(b.rangeEnd, 0), finite(b.falloffEnd, 0));
  }
  return s;
}

/** Settings to saved data, dictionaries as alternating arrays in range order. */
export function hsvToData(s: HsvSettings): Json {
  const adjustments = COLOR_RANGES.flatMap((r) => { const a = s.adjustments[r]; return a ? [r, { hue: a.hue, saturation: a.saturation, lightness: a.lightness }] : []; });
  const bands = COLOR_RANGES.flatMap((r) => [r, { ...s.bands[r] }]);
  return { range: s.range, colorize: s.colorize, invertRange: s.invertRange, adjustments, bands };
}

/** How much a range applies at `hue`: Master everywhere, others by their band, the edited range inverted when asked. */
function rangeWeight(s: HsvSettings, range: ColorRange, hue: number): number {
  if (range === 'Master') return 1;
  const w = bandWeight(s.bands[range] ?? DEFAULT_BANDS[range], hue);
  return s.invertRange && range === s.range ? 1 - w : w;
}

/** RGB in 0 to 1 to hue in degrees, saturation and lightness. */
function hslOf(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, chroma = max - min;
  if (!(chroma > 0)) return [0, 0, l];
  const sector = max === r ? (g - b) / chroma : max === g ? 2 + (b - r) / chroma : 4 + (r - g) / chroma;
  const h = sector * 60;
  return [h < 0 ? h + 360 : h, Math.min(1, chroma / (1 - Math.abs(2 * l - 1))), l];
}

/** Hue, saturation and lightness back to RGB in 0 to 1. */
function rgbOf(h: number, s: number, l: number): [number, number, number] {
  if (!(s > 0)) return [l, l, l];
  const chroma = (1 - Math.abs(2 * l - 1)) * s, sector = h / 60, mid = chroma * (1 - Math.abs((sector % 2) - 1)), lift = l - chroma / 2;
  const order: Array<[number, number, number]> = [[chroma, mid, 0], [mid, chroma, 0], [0, chroma, mid], [0, mid, chroma], [mid, 0, chroma], [chroma, 0, mid]];
  const [r, g, b] = order[Math.min(5, Math.max(0, Math.trunc(sector)))] ?? order[5];
  return [clamp(r + lift, 0, 1), clamp(g + lift, 0, 1), clamp(b + lift, 0, 1)];
}

/** One colour through Hue/Saturation. Colorize replaces hue and saturation with the edited range's values; otherwise
 *  the hue response shifts hue and scales saturation. Lightness then moves toward white (positive) or black. */
export function hsvAdjust(r: number, g: number, b: number, s: HsvSettings, response: Float64Array): [number, number, number] {
  const [h0, sat0, l0] = hslOf(r, g, b);
  const edited = s.adjustments[s.range] ?? { hue: 0, saturation: 0, lightness: 0 };
  let h: number, sat: number, pull: number;
  if (s.colorize) {
    h = edited.hue % 360;
    sat = clamp(edited.saturation / 100, 0, 1);
    pull = edited.lightness / 100;
  } else {
    const at = Math.min(360, Math.max(0, Math.round(h0))) * 3;
    h = onWheel(h0 + response[at]);
    sat = clamp(sat0 * (1 + response[at + 1] / 100), 0, 1);
    pull = response[at + 2] / 100;
  }
  const p = clamp(pull, -1, 1);
  const l = p >= 0 ? l0 + (1 - l0) * p : l0 * (1 + p);
  return rgbOf(h, sat, clamp(l, 0, 1));
}

/** The summed hue, saturation and lightness change at every whole degree, 0 to 360, weighted by each range's band. */
export function hueResponse(s: HsvSettings): Float64Array {
  const out = new Float64Array(361 * 3);
  const active = COLOR_RANGES.filter((r) => { const a = s.adjustments[r]; return !!a && !!(a.hue || a.saturation || a.lightness); });
  for (let deg = 0; deg <= 360; deg++) {
    for (const r of active) {
      const w = rangeWeight(s, r, deg);
      if (!(w > 0)) continue;
      const a = s.adjustments[r] as RangeAdjustment;
      out[deg * 3] += a.hue * w;
      out[deg * 3 + 1] += a.saturation * w;
      out[deg * 3 + 2] += a.lightness * w;
    }
  }
  return out;
}

const CUBE = 33;

/** Hue/Saturation as a 33-point colour cube, read per pixel by trilinear interpolation. */
export function hsvKernel(s: HsvSettings): Kernel {
  const response = hueResponse(s), last = CUBE - 1;
  const cube = new Float32Array(CUBE * CUBE * CUBE * 3);
  for (let bi = 0, k = 0; bi < CUBE; bi++) for (let gi = 0; gi < CUBE; gi++) for (let ri = 0; ri < CUBE; ri++, k += 3) {
    const c = hsvAdjust(ri / last, gi / last, bi / last, s, response);
    cube[k] = c[0]; cube[k + 1] = c[1]; cube[k + 2] = c[2];
  }
  const node = (ri: number, gi: number, bi: number): number => ((bi * CUBE + gi) * CUBE + ri) * 3;
  const step = last / 255;
  return (px) => {
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) continue;
      const fr = px[i] * step, fg = px[i + 1] * step, fb = px[i + 2] * step;
      const r0 = Math.min(last - 1, Math.floor(fr)), g0 = Math.min(last - 1, Math.floor(fg)), b0 = Math.min(last - 1, Math.floor(fb));
      const tr = fr - r0, tg = fg - g0, tb = fb - b0;
      const n000 = node(r0, g0, b0), n100 = node(r0 + 1, g0, b0), n010 = node(r0, g0 + 1, b0), n110 = node(r0 + 1, g0 + 1, b0);
      const n001 = node(r0, g0, b0 + 1), n101 = node(r0 + 1, g0, b0 + 1), n011 = node(r0, g0 + 1, b0 + 1), n111 = node(r0 + 1, g0 + 1, b0 + 1);
      for (let c = 0; c < 3; c++) {
        const lowFront = cube[n000 + c] + (cube[n100 + c] - cube[n000 + c]) * tr;
        const lowBack = cube[n010 + c] + (cube[n110 + c] - cube[n010 + c]) * tr;
        const highFront = cube[n001 + c] + (cube[n101 + c] - cube[n001 + c]) * tr;
        const highBack = cube[n011 + c] + (cube[n111 + c] - cube[n011 + c]) * tr;
        const low = lowFront + (lowBack - lowFront) * tg, high = highFront + (highBack - highFront) * tg;
        px[i + c] = Math.round((low + (high - low) * tb) * 255);
      }
    }
  };
}

/** A lattice value in -1 to 1 for integer cell (x, y) and a seed: the sum of two independent uniforms from successive
 *  SplitMix-style mixing rounds, less one, so values follow a triangular distribution centred on zero. */
function latticeValue(x: number, y: number, seed: number): number {
  let z = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ seed) | 0, sum = 0;
  for (let round = 0; round < 2; round++) {
    z = (z + 0x9e3779b9) | 0;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    z ^= z >>> 16;
    sum += (z >>> 0) / 4294967295;
  }
  return sum - 1;
}
const smoothstep = (t: number): number => t * t * (3 - 2 * t);

export interface GrainSettings { amount: number; size: number; roughness: number; seed: number }
export function grainFromData(d: Json): GrainSettings {
  const g = record(d.grainSettings);
  return { amount: clamp(finite(g.amount, 25), 0, 100), size: clamp(finite(g.size, 1.5), 0.5, 20), roughness: clamp(finite(g.roughness, 50), 0, 100), seed: finite(g.seed, 0) >>> 0 };
}

/** Grain: value noise on a lattice of `size` document units (smoothstep-interpolated), mixed toward per-pixel noise by
 *  roughness, added equally to all channels, scaled by amount and weighted toward the midtones. Positions are in
 *  document units, so the grain stays put as the layer's pixels are rendered at any zoom. */
export function grainKernel(g: GrainSettings): Kernel {
  return (px, ctx?: KernelContext) => {
    const width = ctx?.width ?? 0;
    if (!(g.amount > 0) || !width) return;
    const unit = ctx?.unitsPerPixel ?? 1, ox = ctx?.originX ?? 0, oy = ctx?.originY ?? 0, cell = g.size > 0 ? g.size : 1;
    const strength = Math.min(1, g.amount / 100) * 0.35 * 255, rough = clamp(g.roughness / 100, 0, 1), fineSeed = (g.seed ^ 0x5bd1e995) >>> 0;
    const rows = px.length / 4 / width;
    for (let y = 0; y < rows; y++) {
      const v = oy + (y + 0.5) * unit, cy = Math.floor(v / cell), ty = smoothstep(v / cell - cy), fy = Math.floor(v);
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (px[i + 3] === 0) continue;
        const u = ox + (x + 0.5) * unit, cx = Math.floor(u / cell), tx = smoothstep(u / cell - cx);
        const a = latticeValue(cx, cy, g.seed), b = latticeValue(cx + 1, cy, g.seed), c = latticeValue(cx, cy + 1, g.seed), d = latticeValue(cx + 1, cy + 1, g.seed);
        const smooth = ((a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty) * 1.6;
        const noise = smooth + (latticeValue(Math.floor(u), fy, fineSeed) - smooth) * rough;
        const luma = Math.min(1, (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255);
        const shift = noise * strength * (0.4 + 2.4 * luma * (1 - luma));
        for (let ch = 0; ch < 3; ch++) px[i + ch] = Math.round(clamp(px[i + ch] + shift, 0, 255));
      }
    }
  };
}

export const randomSeed = (): number => (Math.random() * 0x100000000) >>> 0;

/** The data a new adjustment layer starts with, in the project file's field layout. */
export function defaultAdjustmentData(kind: AdjustmentKind): Json {
  const identityRange = { black: 0, gamma: 1, white: 255, outputBlack: 0, outputWhite: 255 };
  const data: Json = {
    kind: ADJUSTMENT_LABELS[kind], hue: 0, saturation: 0, lightness: 0, colorize: false,
    levels: { channel: 'RGB', ranges: [0, 1, 2, 3, 4].map(() => ({ ...identityRange })) },
    curves: { channel: 'RGB', channels: [0, 1, 2, 3, 4].map(() => [{ x: 0, y: 0 }, { x: 255, y: 255 }]) },
  };
  if (kind === 'hsv') data.hsvSettings = hsvToData(defaultHsv());
  else if (kind === 'exposure') data.exposureSettings = { exposure: 0, offset: 0, gamma: 1 };
  else if (kind === 'gradientMap') data.gradientMapSettings = { shadows: { red: 0, green: 0, blue: 0 }, highlights: { red: 1, green: 1, blue: 1 }, reversed: false };
  else if (kind === 'grain') data.grainSettings = { amount: 25, size: 1.5, roughness: 50, seed: randomSeed() };
  else if (isParamKind(kind)) data.params = paramValues(kind, {});
  return data;
}
