import { BLUR_FILTERS } from './filters-lib/blur';
import { SHARPEN_FILTERS } from './filters-lib/sharpen';
import { NOISE_FILTERS } from './filters-lib/noise';
import { OTHER_FILTERS } from './filters-lib/other';
import { VIDEO_FILTERS } from './filters-lib/video';

export const LIB_IDS = [
  'blur', 'blurMore', 'boxBlur', 'shapeBlur', 'smartBlur',
  'sharpen', 'sharpenMore', 'sharpenEdges',
  'despeckle', 'dustAndScratches', 'median', 'reduceNoise',
  'custom', 'hsbHsl', 'highPass', 'maximum', 'minimum', 'offset',
  'deInterlace', 'ntscColors',
] as const;

export type LibKind = (typeof LIB_IDS)[number];
export type LibGroup = 'Blur' | 'Sharpen' | 'Noise' | 'Other' | 'Video';
export type LibValue = number | string | boolean | number[];
export type LibValues = Record<string, LibValue>;

export type LibParam =
  | { readonly key: string; readonly label: string; readonly kind: 'range'; readonly min: number; readonly max: number; readonly step: number; readonly def: number; readonly limit?: number }
  | { readonly key: string; readonly label: string; readonly kind: 'select'; readonly options: ReadonlyArray<readonly [string, string]>; readonly def: string }
  | { readonly key: string; readonly label: string; readonly kind: 'check'; readonly def: boolean }
  | { readonly key: string; readonly label: string; readonly kind: 'matrix'; readonly size: number; readonly min: number; readonly max: number; readonly def: readonly number[] };

export interface LibContext { readonly scale: number; readonly seed: number }

export interface LibFilter {
  readonly id: LibKind;
  readonly label: string;
  readonly group: LibGroup;
  readonly params: readonly LibParam[];
  readonly reach: ((v: LibValues, scale: number) => number | null) | null;
  readonly grows: boolean;
  readonly note?: string;
  readonly run: (src: ImageData, v: LibValues, ctx: LibContext) => ImageData;
}

export const LIBRARY: readonly LibFilter[] = [...BLUR_FILTERS, ...SHARPEN_FILTERS, ...NOISE_FILTERS, ...OTHER_FILTERS, ...VIDEO_FILTERS];

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

function sane(p: LibParam, v: unknown): LibValue {
  if (p.kind === 'range') {
    const n = typeof v === 'number' && Number.isFinite(v) ? v : p.def;
    return Math.min(p.limit ?? p.max, Math.max(p.min, n));
  }
  if (p.kind === 'select') return typeof v === 'string' && p.options.some(([k]) => k === v) ? v : p.def;
  if (p.kind === 'check') return typeof v === 'boolean' ? v : p.def;
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

export function runLib(kind: LibKind, stored: unknown, seed: number, src: ImageData, scale: number): ImageData {
  return libFilter(kind).run(src, libValues(kind, stored), { scale, seed });
}

const reachOf = (kind: LibKind, stored: unknown): number | null => libFilter(kind).reach?.(libValues(kind, stored), 1) ?? null;

export function libApron(kind: LibKind, stored: unknown): number | null {
  const r = reachOf(kind, stored);
  return r === null ? null : Math.ceil(r) + 1;
}

export function libMargin(kind: LibKind, stored: unknown): number {
  const r = reachOf(kind, stored);
  return libFilter(kind).grows && r !== null ? Math.ceil(r) + 1 : 0;
}
