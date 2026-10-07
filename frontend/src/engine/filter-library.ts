import { BLUR_FILTERS } from './filters-lib/blur';
import { SHARPEN_FILTERS } from './filters-lib/sharpen';
import { NOISE_FILTERS } from './filters-lib/noise';
import { OTHER_FILTERS } from './filters-lib/other';
import { VIDEO_FILTERS } from './filters-lib/video';
import { DISTORT_FILTERS } from './filters-lib/distort';
import { PIXELATE_FILTERS } from './filters-lib/pixelate';
import { STYLIZE_FILTERS } from './filters-lib/stylize';
import { RENDER_FILTERS } from './filters-lib/render';
import { DRAWN_FILTERS } from './filters-lib/drawn';
import { GALLERY_FILTERS } from './filters-lib/gallery';
import type { Rect } from './types';

export const LIB_IDS = [
  'blur', 'blurMore', 'boxBlur', 'shapeBlur', 'smartBlur',
  'sharpen', 'sharpenMore', 'sharpenEdges',
  'despeckle', 'dustAndScratches', 'median', 'reduceNoise',
  'custom', 'hsbHsl', 'highPass', 'maximum', 'minimum', 'offset',
  'deInterlace', 'ntscColors',
  'displace', 'pinch', 'polarCoordinates', 'ripple', 'shear', 'spherize', 'twirl', 'wave', 'zigZag',
  'colorHalftone', 'crystallize', 'facet', 'fragment', 'mezzotint', 'mosaic', 'pointillize',
  'diffuse', 'emboss', 'extrude', 'findEdges', 'oilPaint', 'solarize', 'tiles', 'traceContour', 'wind',
  'clouds', 'differenceClouds', 'fibers', 'lensFlare', 'lightingEffects', 'flame', 'pictureFrame', 'tree',
  'spinBlur',
] as const;

export type LibKind = (typeof LIB_IDS)[number];
export type LibGroup = 'Blur' | 'Sharpen' | 'Noise' | 'Other' | 'Video' | 'Distort' | 'Pixelate' | 'Stylize' | 'Render' | 'Blur Gallery';
export interface LibImage { readonly name: string; readonly w0: number; readonly h0: number; readonly w: number; readonly h: number; readonly rg: string }
export interface LibPath { readonly name: string; readonly w0: number; readonly h0: number; readonly lines: readonly (readonly number[])[] }
export type LibValue = number | string | boolean | number[] | LibImage | LibPath | null;
export type LibValues = Record<string, LibValue>;
export type LibColor = readonly [number, number, number];
export interface LibSize { readonly w: number; readonly h: number }
export interface LibFrame { readonly area: Rect; readonly canvas: Rect; readonly doc?: LibSize }
export interface LibColors { readonly fg: LibColor; readonly bg: LibColor }

export type LibParam =
  | { readonly key: string; readonly label: string; readonly kind: 'range'; readonly min: number; readonly max: number; readonly step: number; readonly def: number; readonly limit?: number }
  | { readonly key: string; readonly label: string; readonly kind: 'select'; readonly options: ReadonlyArray<readonly [string, string]>; readonly def: string }
  | { readonly key: string; readonly label: string; readonly kind: 'check'; readonly def: boolean }
  | { readonly key: string; readonly label: string; readonly kind: 'matrix'; readonly size: number; readonly min: number; readonly max: number; readonly def: readonly number[] }
  | { readonly key: string; readonly label: string; readonly kind: 'seed'; readonly def: number }
  | { readonly key: string; readonly label: string; readonly kind: 'color'; readonly def: string }
  | { readonly key: string; readonly label: string; readonly kind: 'image'; readonly def: null }
  | { readonly key: string; readonly label: string; readonly kind: 'path'; readonly def: null };

export interface LibContext { readonly scale: number; readonly seed: number; readonly area: Rect; readonly canvas: Rect; readonly doc: LibSize; readonly fg: LibColor; readonly bg: LibColor }

export interface LibFilter {
  readonly id: LibKind;
  readonly label: string;
  readonly group: LibGroup;
  readonly params: readonly LibParam[];
  readonly reach: ((v: LibValues, scale: number) => number | null) | null;
  readonly grows: boolean;
  readonly note?: string;
  readonly fills?: boolean;
  readonly run: (src: ImageData, v: LibValues, ctx: LibContext) => ImageData;
}

export const LIBRARY: readonly LibFilter[] = [...BLUR_FILTERS, ...SHARPEN_FILTERS, ...NOISE_FILTERS, ...OTHER_FILTERS, ...VIDEO_FILTERS, ...DISTORT_FILTERS, ...PIXELATE_FILTERS, ...STYLIZE_FILTERS, ...RENDER_FILTERS, ...DRAWN_FILTERS, ...GALLERY_FILTERS];

const BY_ID = new Map<string, LibFilter>(LIBRARY.map((f) => [f.id, f]));

export const isLibKind = (kind: string): kind is LibKind => BY_ID.has(kind);
export const libFilter = (kind: LibKind): LibFilter => BY_ID.get(kind) as LibFilter;
export const libLabel = (kind: LibKind): string => libFilter(kind).label;
export const libHasDialog = (kind: LibKind): boolean => libFilter(kind).params.length > 0;
export const libInGroup = (group: LibGroup): LibFilter[] => LIBRARY.filter((f) => f.group === group);

function paramDefault(p: LibParam): LibValue {
  return p.kind === 'matrix' ? [...p.def] : p.def;
}

export function libDefaults(kind: LibKind): LibValues {
  const out: LibValues = {};
  for (const p of libFilter(kind).params) out[p.key] = paramDefault(p);
  return out;
}

export function libAllDefaults(): Record<LibKind, LibValues> {
  const out = {} as Record<LibKind, LibValues>;
  for (const f of LIBRARY) out[f.id] = libDefaults(f.id);
  return out;
}

function saneImage(v: unknown): LibImage | null {
  if (!v || typeof v !== 'object') return null;
  const m = v as Record<string, unknown>, int = (x: unknown, hi: number): number => (typeof x === 'number' && Number.isInteger(x) && x >= 1 && x <= hi ? x : 0);
  const w0 = int(m.w0, 65535), h0 = int(m.h0, 65535), w = int(m.w, 4096), h = int(m.h, 4096);
  if (!w0 || !h0 || !w || !h || typeof m.rg !== 'string' || m.rg.length !== Math.ceil((w * h * 2) / 3) * 4) return null;
  return { name: typeof m.name === 'string' ? m.name.slice(0, 200) : '', w0, h0, w, h, rg: m.rg };
}

function sanePath(v: unknown): LibPath | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const m = v as Record<string, unknown>, side = (x: unknown): boolean => typeof x === 'number' && Number.isInteger(x) && x >= 1 && x <= 65535;
  if (!side(m.w0) || !side(m.h0) || !Array.isArray(m.lines) || m.lines.length > 256) return null;
  let total = 0;
  for (const l of m.lines as unknown[]) {
    if (!Array.isArray(l) || l.length < 2 || l.length % 2 || !l.every((x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) < 1e6)) return null;
    total += l.length;
  }
  return total <= 400_000 ? { name: typeof m.name === 'string' ? m.name.slice(0, 200) : '', w0: m.w0 as number, h0: m.h0 as number, lines: m.lines as number[][] } : null;
}

const BLACK: LibColor = [0, 0, 0], WHITE: LibColor = [255, 255, 255];

function saneColor(v: unknown, d: LibColor): LibColor {
  if (!Array.isArray(v) || v.length !== 3 || !v.every((x) => typeof x === 'number' && Number.isFinite(x))) return d;
  const c = (x: number): number => Math.min(255, Math.max(0, Math.round(x)));
  return [c(v[0]), c(v[1]), c(v[2])];
}

export function saneColors(v: unknown): LibColors {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  return { fg: saneColor(o.fg, BLACK), bg: saneColor(o.bg, WHITE) };
}

function sane(p: LibParam, v: unknown): LibValue {
  if (p.kind === 'range') {
    const n = typeof v === 'number' && Number.isFinite(v) ? v : p.def;
    return Math.min(p.limit ?? p.max, Math.max(p.min, n));
  }
  if (p.kind === 'select') return typeof v === 'string' && p.options.some(([k]) => k === v) ? v : p.def;
  if (p.kind === 'check') return typeof v === 'boolean' ? v : p.def;
  if (p.kind === 'seed') return typeof v === 'number' && Number.isFinite(v) ? Math.abs(Math.trunc(v)) % 2147483648 : p.def;
  if (p.kind === 'image') return saneImage(v);
  if (p.kind === 'path') return sanePath(v);
  if (p.kind === 'color') return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : p.def;
  const arr = Array.isArray(v) ? v : p.def;
  return Array.from({ length: p.size * p.size }, (_, i) => {
    const n = Number(arr[i] ?? 0);
    return Number.isFinite(n) ? Math.min(p.max, Math.max(p.min, Math.round(n))) : 0;
  });
}

export function libValues(kind: LibKind, stored: unknown): LibValues {
  const raw = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {};
  const out: LibValues = {};
  for (const p of libFilter(kind).params) out[p.key] = sane(p, raw[p.key]);
  return out;
}

export function runLib(kind: LibKind, stored: unknown, seed: number, src: ImageData, scale: number, frame?: LibFrame | null, colors?: unknown): ImageData {
  const whole = { x: 0, y: 0, w: src.width, h: src.height }, c = saneColors(colors);
  return libFilter(kind).run(src, libValues(kind, stored), { scale, seed, area: frame?.area ?? whole, canvas: frame?.canvas ?? whole, doc: frame?.doc ?? { w: src.width, h: src.height }, fg: c.fg, bg: c.bg });
}

export const libImageParams = (kind: LibKind): string[] => libFilter(kind).params.filter((p) => p.kind === 'image').map((p) => p.key);
export const libPathParams = (kind: LibKind): string[] => libFilter(kind).params.filter((p) => p.kind === 'path').map((p) => p.key);

const reachOf = (kind: LibKind, stored: unknown): number | null => libFilter(kind).reach?.(libValues(kind, stored), 1) ?? null;

export function libApron(kind: LibKind, stored: unknown): number | null {
  const r = reachOf(kind, stored);
  return r === null ? null : Math.ceil(r) + 1;
}

export function libMargin(kind: LibKind, stored: unknown): number {
  const r = reachOf(kind, stored);
  return libFilter(kind).grows && r !== null ? Math.ceil(r) + 1 : 0;
}
