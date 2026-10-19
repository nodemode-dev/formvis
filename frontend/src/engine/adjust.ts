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
const isRange = (v: unknown): v is ColorRange => (COLOR_RANGES as readonly unknown[]).includes(v);

/** Entries of a dictionary stored either as an object or as an alternating [key, value, key, value] array. */
function entriesOf(v: unknown): Array<[string, unknown]> {
  if (!Array.isArray(v)) return v !== null && typeof v === 'object' ? Object.entries(v as Json) : [];
  const out: Array<[string, unknown]> = [];
  for (let i = 1; i < v.length; i += 2) out.push([String(v[i - 1]), v[i]]);
  return out;
}

/** Degrees from `from` forward (increasing) to `to`, always at least 0 and under 360. */
export function bandForward(from: number, to: number): number {
  const gap = (to - from) % 360;
  return (gap < 0 ? gap + 360 : gap) % 360;
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

export function bandHandles(b: HueBand): number[] { return [b.falloffStart, b.rangeStart, b.rangeEnd, b.falloffEnd]; }

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
  if (bandForward(b.rangeStart, hue) <= bandForward(b.rangeStart, b.rangeEnd)) return b;
  const lead = bandForward(b.falloffStart, b.rangeStart), trail = bandForward(b.rangeEnd, b.falloffEnd);
  const nearerStart = bandForward(hue, b.rangeStart) <= bandForward(b.rangeEnd, hue);
  return tidyBand(nearerStart ? hueBand(hue - lead, hue, b.rangeEnd, b.falloffEnd) : hueBand(b.falloffStart, b.rangeStart, hue, hue + trail));
}

/** The Remove eyedropper: pull the nearer outer edge in just past `hue`, carrying the core edge with it. */
export function bandExclude(b: HueBand, hue: number): HueBand {
  if (bandForward(b.falloffStart, hue) > bandForward(b.falloffStart, b.falloffEnd)) return b;
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
  return { range: 'Master', colorize: false, invertRange: false, adjustments: {}, bands: Object.fromEntries(COLOR_RANGES.map((r) => [r, { ...DEFAULT_BANDS[r] }])) as Record<ColorRange, HueBand> };
}

const rangeAdjustment = (v: unknown): RangeAdjustment => { const a = record(v); return { hue: finite(a.hue, 0), saturation: finite(a.saturation, 0), lightness: finite(a.lightness, 0) }; };

/** Settings from saved data: the full `hsvSettings` record, or the older single Master adjustment. */
export function hsvFromData(d: Json): HsvSettings {
  const s = defaultHsv();
  if (!d.hsvSettings) {
    if (d.colorize === true) s.colorize = true;
    s.adjustments.Master = rangeAdjustment(d);
    return s;
  }
  const raw = record(d.hsvSettings);
  if (isRange(raw.range)) s.range = raw.range;
  if (raw.colorize === true) s.colorize = true;
  if (raw.invertRange === true) s.invertRange = true;
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

/** `colour` (0 to 100) is the share of the grain that differs per channel (0 is grey grain); `speckle` (0 to 100) adds
 *  sparse bright and dark single-pixel specks. */
export interface GrainSettings { amount: number; size: number; roughness: number; seed: number; colour: number; speckle: number; look: number }
export function grainFromData(d: Json): GrainSettings {
  const g = record(d.grainSettings);
  return { amount: clamp(finite(g.amount, 25), 0, 100), size: clamp(finite(g.size, 1.5), 0.5, 20), roughness: clamp(finite(g.roughness, 50), 0, 100), seed: finite(g.seed, 0) >>> 0, colour: clamp(finite(g.colour, 0), 0, 100), speckle: clamp(finite(g.speckle, 0), 0, 100), look: clamp(finite(g.look, 100), 0, 100) };
}

/** Grain: value noise on a lattice of `size` document units (smoothstep-interpolated), mixed toward per-pixel noise by
 *  roughness, added equally to all channels, scaled by amount and weighted toward the midtones. Positions are in
 *  document units, so the grain stays put as the layer's pixels are rendered at any zoom. */
export function grainKernel(g: GrainSettings): Kernel {
  return (px, ctx?: KernelContext) => {
    const width = ctx?.width ?? 0, look = clamp((g.look ?? 100) / 100, 0, 1), amount = g.amount * look;
    if (!(amount > 0) || !width) return;
    const unit = ctx?.unitsPerPixel ?? 1, ox = ctx?.originX ?? 0, oy = ctx?.originY ?? 0, cell = g.size > 0 ? g.size : 1;
    const strength = Math.min(1, amount / 100) * 0.35 * 255, rough = clamp(g.roughness / 100, 0, 1), fineSeed = (g.seed ^ 0x5bd1e995) >>> 0;
    const colour = clamp((g.colour * look) / 100, 0, 1), speckle = clamp((g.speckle * look) / 100, 0, 1) * 0.14, specSeed = (g.seed ^ 0x2545f491) >>> 0;
    const rows = px.length / 4 / width;
    for (let y = 0; y < rows; y++) {
      const v = oy + (y + 0.5) * unit, cy = Math.floor(v / cell), ty = smoothstep(v / cell - cy), fy = Math.floor(v);
      const rowStart = y * width * 4;
      for (let x = 0, i = rowStart; x < width; x++, i += 4) {
        if (px[i + 3] === 0) continue;
        const u = ox + (x + 0.5) * unit, cx = Math.floor(u / cell), tx = smoothstep(u / cell - cx);
        const at = (seed: number, fine: number): number => {
          const a = latticeValue(cx, cy, seed), b = latticeValue(cx + 1, cy, seed), c = latticeValue(cx, cy + 1, seed), d = latticeValue(cx + 1, cy + 1, seed);
          const smooth = ((a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty) * 1.6;
          return smooth + (latticeValue(Math.floor(u), fy, fine) - smooth) * rough;
        };
        const noise = at(g.seed, fineSeed);
        const luma = Math.min(1, (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255);
        const weight = strength * (0.4 + 2.4 * luma * (1 - luma));
        let speck = 0;
        if (speckle > 0) { const h = latticeValue(Math.floor(u), fy, specSeed); if (Math.abs(h) > 1 - speckle) speck = Math.sign(h) * 0.55 * 255 * Math.min(1, amount / 50); }
        for (let ch = 0; ch < 3; ch++) {
          const own = colour > 0 ? at((g.seed + (ch + 1) * 0x9e3779b1) >>> 0, (fineSeed + (ch + 1) * 0x85ebca6b) >>> 0) : noise;
          px[i + ch] = Math.round(clamp(px[i + ch] + (noise + (own - noise) * colour) * weight + speck, 0, 255));
        }
      }
    }
  };
}

export function randomSeed(): number { return Math.floor(Math.random() * 4294967296) >>> 0; }

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
  else if (kind === 'grain') data.grainSettings = { amount: 25, size: 1.5, roughness: 50, seed: randomSeed(), colour: 0, speckle: 0, look: 100 };
  else if (isParamKind(kind)) data.params = paramValues(kind, {});
  return data;
}

export type LevelRangeData = { black: number; gamma: number; white: number; outputBlack: number; outputWhite: number };

/** Levels set from a histogram, as the Levels dialog's Auto and Image > Auto Tone, Contrast and Color set them: each
 *  end clips 0.1% of a channel's histogram. Contrast shares one master interval across R, G and B so channel
 *  relationships hold; Color sets each channel; Color + neutral midtones also sets each channel's gamma so its mean
 *  maps to middle gray. `bins` is `histogram()`: composite, then R, G, B. */
export function autoLevels(bins: Float64Array, mode: 'contrast' | 'color' | 'neutral'): LevelRangeData[] {
  const fresh = (black = 0, white = 255): LevelRangeData => ({ black, gamma: 1, white, outputBlack: 0, outputWhite: 255 });
  const ranges = [fresh(), fresh(), fresh(), fresh()];
  const endpoints = (c: number): [number, number] | null => {
    const o = c * 256;
    let total = 0;
    for (let i = 0; i < 256; i++) total += bins[o + i];
    if (!(total > 0)) return null;
    let sum = 0, low = 0, high = 255;
    for (let i = 0; i < 256; i++) { sum += bins[o + i]; if (sum > total * 0.001) { low = i; break; } }
    sum = 0;
    for (let i = 255; i >= 0; i--) { sum += bins[o + i]; if (sum > total * 0.001) { high = i; break; } }
    return low < high ? [low, high] : null;
  };
  if (mode === 'contrast') {
    const lims = [1, 2, 3].map(endpoints).filter((x): x is [number, number] => x !== null);
    if (lims.length) {
      const low = Math.min(...lims.map((x) => x[0])), high = Math.max(...lims.map((x) => x[1]));
      if (low < high) ranges[0] = fresh(low, high);
    }
    return ranges;
  }
  for (let c = 1; c <= 3; c++) {
    const e = endpoints(c);
    if (!e) continue;
    const r = fresh(e[0], e[1]);
    if (mode === 'neutral') {
      let total = 0, acc = 0;
      for (let i = 0; i < 256; i++) { const w = bins[c * 256 + i]; total += w; acc += Math.min(1, Math.max(0, (i - r.black) / (r.white - r.black))) * w; }
      const mean = acc / total;
      if (mean > 0 && mean < 1) r.gamma = Math.min(9.99, Math.max(0.1, Math.log(mean) / Math.log(0.5)));
    }
    ranges[c] = r;
  }
  return ranges;
}

/** Image > Adjustments > Desaturate (1.65.5): each pixel grey at its HSL lightness, (max + min) / 2, the grey
 *  Hue/Saturation gives at -100, in place. */
export function desaturatePixels(d: Uint8ClampedArray): void {
  for (let i = 0; i < d.length; i += 4) { const v = Math.round((Math.max(d[i], d[i + 1], d[i + 2]) + Math.min(d[i], d[i + 1], d[i + 2])) / 2); d[i] = d[i + 1] = d[i + 2] = v; }
}

/** Image > Adjustments > Equalize (1.65.5): histogram equalisation of the R, G and B values of the visible pixels
 *  counted together (each weighted by `cov`'s alpha when given, the selected area's). A level goes to the share of
 *  values at or below it, scaled so the darkest level present is black and the brightest white, and that one table
 *  is applied to every channel, in place. A picture of one level is left alone. */
export function equalizePixels(d: Uint8ClampedArray, cov: Uint8ClampedArray | null = null): void {
  const count = new Float64Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const weight = !d[i + 3] ? 0 : cov ? cov[i + 3] / 255 : 1;
    if (weight > 0) { count[d[i]] += weight; count[d[i + 1]] += weight; count[d[i + 2]] += weight; }
  }
  const below = new Float64Array(256);
  for (let v = 0, run = 0; v < 256; v++) { run += count[v]; below[v] = run; }
  const darkest = count.findIndex((c) => c > 0), floor = darkest < 0 ? 0 : below[darkest], span = below[255] - floor;
  if (!(span > 0)) return;
  const table = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) table[v] = Math.round(((below[v] - floor) / span) * 255);
  for (let i = 0; i < d.length; i += 4) { d[i] = table[d[i]]; d[i + 1] = table[d[i + 1]]; d[i + 2] = table[d[i + 2]]; }
}

/** Replace Color's settings: the sampled colours (`plus`, and `minus` taken away), Fuzziness (0 to 200 levels), and
 *  the replacement's Hue (degrees, -180 to 180), Saturation and Lightness (percent, -100 to 100). */
export interface ReplaceColorSettings { plus: Array<{ r: number; g: number; b: number; u?: number; v?: number }>; minus: Array<{ r: number; g: number; b: number }>; fuzziness: number; hue: number; saturation: number; lightness: number; localized?: boolean; range?: number }

/** Image > Adjustments > Replace Color (1.65.5): each pixel scored as Select > Color Range scores sampled colours (full
 *  at the nearest of `plus`, none `fuzziness` away, less the score `minus` gives it), and by that score its hue turned
 *  by `hue` degrees and its saturation and lightness pushed `saturation` and `lightness` percent toward full or none;
 *  in place unless `apply` is false. Returns the scores, the dialog's preview. */
export function replaceColorPixels(d: Uint8ClampedArray, o: ReplaceColorSettings, apply = true, width = 0): Uint8Array {
  const scores = new Uint8Array(d.length / 4), reach = Math.max(1, o.fuzziness) * Math.sqrt(3), change = apply && !!(o.hue || o.saturation || o.lightness);
  const W = width > 0 ? width : 0, H = W ? d.length / 4 / W : 0, diag = Math.hypot(W, H), radius = Math.max(0.01, (o.range ?? 50) / 100) * 0.5;
  const local = !!o.localized && W > 0;
  const closeness = (list: ReplaceColorSettings['plus'], r: number, g: number, b: number, p = -1): number => {
    if (!list.length) return 0;
    let best = 0;
    for (const c of list) {
      let k = Math.max(0, 1 - Math.hypot(r - c.r, g - c.g, b - c.b) / reach);
      if (k > 0 && local && p >= 0 && c.u !== undefined && c.v !== undefined) {
        const far = Math.hypot(((p % W) + 0.5) - c.u * W, (Math.floor(p / W) + 0.5) - c.v * H) / diag;
        k *= Math.max(0, Math.min(1, 2 * (1 - far / radius)));
      }
      if (k > best) best = k;
    }
    return best;
  };
  for (let p = 0, j = 0; j < d.length; p++, j += 4) {
    if (!d[j + 3]) continue;
    const score = Math.max(0, closeness(o.plus, d[j], d[j + 1], d[j + 2], p) - closeness(o.minus, d[j], d[j + 1], d[j + 2]));
    scores[p] = Math.round(score * 255);
    if (!change || !score) continue;
    const [h, s, l] = hslOf(d[j] / 255, d[j + 1] / 255, d[j + 2] / 255);
    const turned = rgbOf((((h + o.hue) % 360) + 360) % 360, clamp(toward(s, o.saturation), 0, 1), clamp(toward(l, o.lightness), 0, 1));
    for (let c = 0; c < 3; c++) d[j + c] = Math.round(d[j + c] + (turned[c] * 255 - d[j + c]) * score);
  }
  return scores;
}

/** A share `v` (0 to 1) moved `by` percent of the way to 1, or to 0 when `by` is negative. */
const toward = (v: number, by: number): number => (by >= 0 ? v + (1 - v) * (by / 100) : v * (1 + by / 100));

/** How far, in percent, `toward` must move share `a` to reach `b`. */
const towardBy = (a: number, b: number): number => (b >= a ? (a < 1 ? ((b - a) / (1 - a)) * 100 : 0) : a > 0 ? ((b - a) / a) * 100 : 0);

/** The Hue, Saturation and Lightness with which Replace Color turns `from` into `to` (its Result picker), in whole
 *  steps. */
export function replacementFor(from: { r: number; g: number; b: number }, to: { r: number; g: number; b: number }): { hue: number; saturation: number; lightness: number } {
  const [h1, s1, l1] = hslOf(from.r / 255, from.g / 255, from.b / 255), [h2, s2, l2] = hslOf(to.r / 255, to.g / 255, to.b / 255);
  return { hue: Math.round(((((h2 - h1) % 360) + 540) % 360) - 180), saturation: Math.round(towardBy(s1, s2)), lightness: Math.round(towardBy(l1, l2)) };
}
