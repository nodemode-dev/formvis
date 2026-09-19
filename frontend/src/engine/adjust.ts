import { clamp, type AdjustmentKind } from './types';
import type { Kernel, KernelContext } from './kernels';

export const ADJUSTMENT_LABELS: Record<AdjustmentKind, string> = {
  hsv: 'Hue/Saturation', levels: 'Levels', curves: 'Curves', exposure: 'Exposure', gradientMap: 'Gradient Map', grain: 'Grain',
};
export const ADJUSTMENT_KINDS: AdjustmentKind[] = ['hsv', 'levels', 'curves', 'exposure', 'gradientMap', 'grain'];

export const COLOR_RANGES = ['Master', 'Reds', 'Yellows', 'Greens', 'Cyans', 'Blues', 'Magentas'] as const;
export type ColorRange = (typeof COLOR_RANGES)[number];
export interface HueBand { falloffStart: number; rangeStart: number; rangeEnd: number; falloffEnd: number }
export interface RangeAdjustment { hue: number; saturation: number; lightness: number }
export interface HsvSettings { range: ColorRange; colorize: boolean; invertRange: boolean; adjustments: Partial<Record<ColorRange, RangeAdjustment>>; bands: Record<ColorRange, HueBand> }

const band = (a: number, b: number, c: number, d: number): HueBand => ({ falloffStart: a, rangeStart: b, rangeEnd: c, falloffEnd: d });
export const DEFAULT_BANDS: Record<ColorRange, HueBand> = {
  Master: band(0, 0, 360, 360), Reds: band(315, 345, 15, 45), Yellows: band(15, 45, 75, 105), Greens: band(75, 105, 135, 165),
  Cyans: band(135, 165, 195, 225), Blues: band(195, 225, 255, 285), Magentas: band(255, 285, 315, 345),
};

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const isRange = (v: unknown): v is ColorRange => typeof v === 'string' && (COLOR_RANGES as readonly string[]).includes(v);

function pairs(v: unknown): Array<[string, unknown]> {
  if (Array.isArray(v)) {
    const out: Array<[string, unknown]> = [];
    for (let i = 0; i + 1 < v.length; i += 2) out.push([String(v[i]), v[i + 1]]);
    return out;
  }
  return v && typeof v === 'object' ? Object.entries(v as Json) : [];
}

const forward = (from: number, to: number): number => { const d = (to - from) % 360; return d < 0 ? d + 360 : d; };

export function bandWeight(b: HueBand, hue: number): number {
  const span = forward(b.falloffStart, b.falloffEnd);
  if (!(span > 0)) return 1;
  const position = forward(b.falloffStart, hue);
  if (position > span) return 0;
  const rampIn = forward(b.falloffStart, b.rangeStart), plateauEnd = forward(b.falloffStart, b.rangeEnd);
  if (position < rampIn) return rampIn > 0 ? position / rampIn : 1;
  if (position <= plateauEnd) return 1;
  const rampOut = span - plateauEnd;
  return rampOut > 0 ? (span - position) / rampOut : 1;
}

/** Degrees from `from` forward to `to`, always 0 to 360 (the reference app's `HueBand.forward`). */
export function bandForward(from: number, to: number): number {
  const d = (to - from) % 360;
  return d < 0 ? d + 360 : d;
}

const wrap360 = (v: number): number => { const r = v % 360; return r < 0 ? r + 360 : r; };

export const bandHandles = (b: HueBand): number[] => [b.falloffStart, b.rangeStart, b.rangeEnd, b.falloffEnd];

/** Keeps all four handles in 0 to 360 and the band under a full circle. */
function normalizeBand(b: HueBand): HueBand {
  const n = { falloffStart: wrap360(b.falloffStart), rangeStart: wrap360(b.rangeStart), rangeEnd: wrap360(b.rangeEnd), falloffEnd: wrap360(b.falloffEnd) };
  if (bandForward(n.falloffStart, n.falloffEnd) > 350) n.falloffEnd = wrap360(n.falloffStart + 350);
  return n;
}

/** A band centered on one hue, keeping this band's core and shoulder widths (the Sample eyedropper). */
export function bandCentered(b: HueBand, hue: number): HueBand {
  const core = bandForward(b.rangeStart, b.rangeEnd), leading = bandForward(b.falloffStart, b.rangeStart), trailing = bandForward(b.rangeEnd, b.falloffEnd);
  const start = wrap360(hue - core / 2);
  return { falloffStart: wrap360(start - leading), rangeStart: start, rangeEnd: wrap360(start + core), falloffEnd: wrap360(start + core + trailing) };
}

/** Widens the band so this hue is fully inside it, moving whichever edge is nearer (the Add eyedropper). */
export function bandInclude(b: HueBand, hue: number): HueBand {
  if (bandWeight(b, hue) >= 1) return b;
  const shoulderIn = bandForward(b.falloffStart, b.rangeStart), shoulderOut = bandForward(b.rangeEnd, b.falloffEnd);
  const n = { ...b };
  if (bandForward(hue, b.rangeStart) <= bandForward(b.rangeEnd, hue)) { n.rangeStart = hue; n.falloffStart = hue - shoulderIn; }
  else { n.rangeEnd = hue; n.falloffEnd = hue + shoulderOut; }
  return normalizeBand(n);
}

/** Narrows the band so this hue falls outside it entirely, shoulder included (the Remove eyedropper). */
export function bandExclude(b: HueBand, hue: number): HueBand {
  if (bandWeight(b, hue) <= 0) return b;
  const shoulderIn = bandForward(b.falloffStart, b.rangeStart), shoulderOut = bandForward(b.rangeEnd, b.falloffEnd);
  const n = { ...b };
  if (bandForward(b.falloffStart, hue) <= bandForward(hue, b.falloffEnd)) { n.falloffStart = hue + 1; n.rangeStart = hue + 1 + shoulderIn; }
  else { n.falloffEnd = hue - 1; n.rangeEnd = hue - 1 - shoulderOut; }
  return normalizeBand(n);
}

/** Moves one handle (0 falloff start, 1 range start, 2 range end, 3 falloff end), keeping the four in order and the
 *  band under a full circle; a move that would break either is refused. */
export function bandSetHandle(b: HueBand, index: number, degrees: number): HueBand {
  const value = ((degrees % 360) + 360) % 360, u = { ...b };
  if (index === 0) u.falloffStart = value;
  else if (index === 1) u.rangeStart = value;
  else if (index === 2) u.rangeEnd = value;
  else u.falloffEnd = value;
  const span = bandForward(u.falloffStart, u.falloffEnd), toStart = bandForward(u.falloffStart, u.rangeStart), toEnd = bandForward(u.falloffStart, u.rangeEnd);
  return span > 1 && span <= 350 && toStart <= toEnd && toEnd <= span ? u : b;
}

export function defaultHsv(): HsvSettings {
  return { range: 'Master', colorize: false, invertRange: false, adjustments: {}, bands: { ...DEFAULT_BANDS } };
}

export function hsvFromData(d: Json): HsvSettings {
  if (!d.hsvSettings) {
    const s = defaultHsv();
    s.colorize = d.colorize === true;
    s.adjustments.Master = { hue: num(d.hue, 0), saturation: num(d.saturation, 0), lightness: num(d.lightness, 0) };
    return s;
  }
  const raw = obj(d.hsvSettings);
  const s = defaultHsv();
  if (isRange(raw.range)) s.range = raw.range;
  s.colorize = raw.colorize === true;
  s.invertRange = raw.invertRange === true;
  for (const [k, v] of pairs(raw.adjustments)) if (isRange(k)) { const a = obj(v); s.adjustments[k] = { hue: num(a.hue, 0), saturation: num(a.saturation, 0), lightness: num(a.lightness, 0) }; }
  for (const [k, v] of pairs(raw.bands)) if (isRange(k)) { const b = obj(v); s.bands[k] = band(num(b.falloffStart, 0), num(b.rangeStart, 0), num(b.rangeEnd, 0), num(b.falloffEnd, 0)); }
  return s;
}

export function hsvToData(s: HsvSettings): Json {
  const adjustments: unknown[] = [];
  for (const r of COLOR_RANGES) { const a = s.adjustments[r]; if (a) adjustments.push(r, { hue: a.hue, saturation: a.saturation, lightness: a.lightness }); }
  const bands: unknown[] = [];
  for (const r of COLOR_RANGES) bands.push(r, { ...s.bands[r] });
  return { range: s.range, colorize: s.colorize, invertRange: s.invertRange, adjustments, bands };
}

function weightOf(s: HsvSettings, range: ColorRange, hue: number): number {
  if (range === 'Master') return 1;
  const w = bandWeight(s.bands[range] ?? DEFAULT_BANDS[range], hue);
  return s.invertRange && range === s.range ? 1 - w : w;
}

function toHSL(r: number, g: number, b: number): [number, number, number] {
  const high = Math.max(r, g, b), low = Math.min(r, g, b), l = (high + low) / 2, delta = high - low;
  if (!(delta > 0)) return [0, 0, l];
  const s = delta / (1 - Math.abs(2 * l - 1));
  let h = high === r ? (g - b) / delta : high === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, Math.min(1, s), l];
}

function toRGB(h: number, s: number, l: number): [number, number, number] {
  if (!(s > 0)) return [l, l, l];
  const chroma = (1 - Math.abs(2 * l - 1)) * s, sector = h / 60;
  const second = chroma * (1 - Math.abs((sector % 2) - 1)), base = l - chroma / 2;
  let rgb: [number, number, number];
  switch (Math.trunc(sector)) {
    case 0: rgb = [chroma, second, 0]; break;
    case 1: rgb = [second, chroma, 0]; break;
    case 2: rgb = [0, chroma, second]; break;
    case 3: rgb = [0, second, chroma]; break;
    case 4: rgb = [second, 0, chroma]; break;
    default: rgb = [chroma, 0, second];
  }
  return [clamp(rgb[0] + base, 0, 1), clamp(rgb[1] + base, 0, 1), clamp(rgb[2] + base, 0, 1)];
}

export function hsvAdjust(r: number, g: number, b: number, s: HsvSettings, response: Float64Array): [number, number, number] {
  let [h, sat, l] = toHSL(r, g, b);
  let lightAmount: number;
  const current = s.adjustments[s.range] ?? { hue: 0, saturation: 0, lightness: 0 };
  if (s.colorize) {
    h = current.hue % 360;
    sat = clamp(current.saturation / 100, 0, 1);
    lightAmount = current.lightness / 100;
  } else {
    const i = Math.min(360, Math.max(0, Math.round(h))) * 3;
    lightAmount = response[i + 2] / 100;
    h = (h + response[i]) % 360;
    if (h < 0) h += 360;
    sat = clamp(sat * (1 + response[i + 1] / 100), 0, 1);
  }
  const amount = clamp(lightAmount, -1, 1);
  l = amount >= 0 ? l + (1 - l) * amount : l * (1 + amount);
  return toRGB(h, sat, clamp(l, 0, 1));
}

export function hueResponse(s: HsvSettings): Float64Array {
  const out = new Float64Array(361 * 3);
  for (let deg = 0; deg <= 360; deg++) {
    for (const r of COLOR_RANGES) {
      const a = s.adjustments[r];
      if (!a || (!a.hue && !a.saturation && !a.lightness)) continue;
      const w = weightOf(s, r, deg);
      if (!(w > 0)) continue;
      out[deg * 3] += a.hue * w;
      out[deg * 3 + 1] += a.saturation * w;
      out[deg * 3 + 2] += a.lightness * w;
    }
  }
  return out;
}

const N = 33;
export function hsvKernel(s: HsvSettings): Kernel {
  const response = hueResponse(s);
  const lut = new Float32Array(N * N * N * 3);
  let k = 0;
  for (let bi = 0; bi < N; bi++) for (let gi = 0; gi < N; gi++) for (let ri = 0; ri < N; ri++) {
    const c = hsvAdjust(ri / (N - 1), gi / (N - 1), bi / (N - 1), s, response);
    lut[k++] = c[0]; lut[k++] = c[1]; lut[k++] = c[2];
  }
  const at = (ri: number, gi: number, bi: number, ch: number): number => lut[((bi * N + gi) * N + ri) * 3 + ch];
  return (d) => {
    const f = (N - 1) / 255;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const x = d[i] * f, y = d[i + 1] * f, z = d[i + 2] * f;
      const x0 = Math.min(N - 2, Math.floor(x)), y0 = Math.min(N - 2, Math.floor(y)), z0 = Math.min(N - 2, Math.floor(z));
      const tx = x - x0, ty = y - y0, tz = z - z0;
      for (let ch = 0; ch < 3; ch++) {
        const c00 = at(x0, y0, z0, ch) + (at(x0 + 1, y0, z0, ch) - at(x0, y0, z0, ch)) * tx;
        const c10 = at(x0, y0 + 1, z0, ch) + (at(x0 + 1, y0 + 1, z0, ch) - at(x0, y0 + 1, z0, ch)) * tx;
        const c01 = at(x0, y0, z0 + 1, ch) + (at(x0 + 1, y0, z0 + 1, ch) - at(x0, y0, z0 + 1, ch)) * tx;
        const c11 = at(x0, y0 + 1, z0 + 1, ch) + (at(x0 + 1, y0 + 1, z0 + 1, ch) - at(x0, y0 + 1, z0 + 1, ch)) * tx;
        const c0 = c00 + (c10 - c00) * ty, c1 = c01 + (c11 - c01) * ty;
        d[i + ch] = Math.round((c0 + (c1 - c0) * tz) * 255);
      }
    }
  };
}

function mix32(x: number): number {
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15; x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

function lattice(ix: number, iy: number, seed: number): number {
  const h = mix32((Math.imul(ix | 0, 0x9e3779b1) ^ mix32((Math.imul(iy | 0, 0x85ebca77) ^ seed) >>> 0)) >>> 0);
  return (h & 0xffff) / 65535 + (h >>> 16) / 65535 - 1;
}

export interface GrainSettings { amount: number; size: number; roughness: number; seed: number }
export function grainFromData(d: Json): GrainSettings {
  const g = obj(d.grainSettings);
  return { amount: clamp(num(g.amount, 25), 0, 100), size: clamp(num(g.size, 1.5), 0.5, 20), roughness: clamp(num(g.roughness, 50), 0, 100), seed: num(g.seed, 0) >>> 0 };
}

export function grainKernel(g: GrainSettings): Kernel {
  return (d, ctx?: KernelContext) => {
    const width = ctx?.width ?? 0;
    if (!(g.amount > 0) || !width) return;
    const upp = ctx?.unitsPerPixel ?? 1, ox = ctx?.originX ?? 0, oy = ctx?.originY ?? 0;
    const size = g.size > 0 ? g.size : 1;
    const strength = (g.amount > 100 ? 1 : g.amount / 100) * 0.35 * 255;
    const rough = clamp(g.roughness / 100, 0, 1);
    const fineSeed = mix32((g.seed ^ 0xa511e9b3) >>> 0);
    const height = d.length / 4 / width;
    for (let y = 0; y < height; y++) {
      const v = oy + (y + 0.5) * upp, cellY = Math.floor(v / size);
      let ty = v / size - cellY;
      ty = ty * ty * (3 - 2 * ty);
      const fineY = Math.floor(v);
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (!d[i + 3]) continue;
        const u = ox + (x + 0.5) * upp, cellX = Math.floor(u / size);
        let tx = u / size - cellX;
        tx = tx * tx * (3 - 2 * tx);
        const n00 = lattice(cellX, cellY, g.seed), n10 = lattice(cellX + 1, cellY, g.seed);
        const n01 = lattice(cellX, cellY + 1, g.seed), n11 = lattice(cellX + 1, cellY + 1, g.seed);
        const top = n00 + (n10 - n00) * tx, bottom = n01 + (n11 - n01) * tx;
        const smooth = (top + (bottom - top) * ty) * 1.6;
        const fine = lattice(Math.floor(u), fineY, fineSeed);
        const noise = smooth + (fine - smooth) * rough;
        const level = Math.min(1, (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255);
        const delta = noise * strength * (0.4 + 2.4 * level * (1 - level));
        d[i] = Math.floor(clamp(d[i] + delta, 0, 255) + 0.5);
        d[i + 1] = Math.floor(clamp(d[i + 1] + delta, 0, 255) + 0.5);
        d[i + 2] = Math.floor(clamp(d[i + 2] + delta, 0, 255) + 0.5);
      }
    }
  };
}

export const randomSeed = (): number => (Math.random() * 0x100000000) >>> 0;

export function defaultAdjustmentData(kind: AdjustmentKind): Json {
  const data: Json = {
    kind: ADJUSTMENT_LABELS[kind], hue: 0, saturation: 0, lightness: 0, colorize: false,
    levels: { channel: 'RGB', ranges: [0, 1, 2, 3].map(() => ({ black: 0, gamma: 1, white: 255, outputBlack: 0, outputWhite: 255 })) },
    curves: { channel: 'RGB', channels: [0, 1, 2, 3].map(() => [{ x: 0, y: 0 }, { x: 255, y: 255 }]) },
  };
  if (kind === 'hsv') data.hsvSettings = hsvToData(defaultHsv());
  if (kind === 'exposure') data.exposureSettings = { exposure: 0, offset: 0, gamma: 1 };
  if (kind === 'gradientMap') data.gradientMapSettings = { shadows: { red: 0, green: 0, blue: 0 }, highlights: { red: 1, green: 1, blue: 1 }, reversed: false };
  if (kind === 'grain') data.grainSettings = { amount: 25, size: 1.5, roughness: 50, seed: randomSeed() };
  return data;
}
