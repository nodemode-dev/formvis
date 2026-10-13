import { SPACES, type SpaceId } from '../engine/icc';

export type ExportFormat = 'png' | 'jpg' | 'webp' | 'avif' | 'tiff' | 'pdf' | 'dpx' | 'qoi' | 'pnm' | 'tga' | 'ico';
/** DEV_PLAN 34.1: the options the engine-written formats take, kept in `ExportSettings.option` (one choice a format) and
 *  `icoSizes`. QOI: the colourspace flag. PNM: which file of the family. TGA: 24 or 32 bits, run-length or not. ICO: PNG
 *  entries for 256 and BMP below, or PNG for every size. The first of each list is the default. */
export const FORMAT_OPTIONS: Readonly<Partial<Record<ExportFormat, ReadonlyArray<readonly [string, string]>>>> = {
  qoi: [['srgb', 'sRGB with linear alpha'], ['linear', 'All channels linear']],
  pnm: [['ppm', 'PPM colour (P6)'], ['pgm', 'PGM grayscale (P5)'], ['pbm', 'PBM bitmap, thresholded (P4)'], ['pam', 'PAM with alpha (P7)']],
  tga: [['32', '32-bit with alpha'], ['32rle', '32-bit, run-length'], ['24', '24-bit, on white'], ['24rle', '24-bit, run-length, on white']],
  ico: [['mixed', 'PNG for 256, BMP for smaller'], ['png', 'PNG for every size']],
};
export const ICO_SIZES: readonly number[] = [16, 24, 32, 48, 64, 128, 256];
export const DEFAULT_ICO_SIZES: readonly number[] = [16, 32, 48, 256];
/** Formats that carry no colour profile and no more than 8 bits a channel (PNM holds 16 from a 16-bit document). */
export const PROFILELESS: ReadonlySet<ExportFormat> = new Set(['qoi', 'pnm', 'tga', 'ico']);
export type DpxBits = 8 | 10 | 12 | 16;
export type DpxTransfer = 'linear' | 'density' | 'log';
export const DPX_BITS: ReadonlyArray<readonly [string, string]> = [['10', '10-bit'], ['8', '8-bit'], ['12', '12-bit'], ['16', '16-bit']];
export const DPX_TRANSFERS: ReadonlyArray<readonly [DpxTransfer, string]> = [['log', 'Logarithmic (Cineon)'], ['density', 'Printing density'], ['linear', 'Linear']];
/** size (1.51.8): by Scale, or Fit Within boxW by boxH keeping the shape, or a Frame of exactly boxW by boxH with the
 *  picture centred; aiLabel: the IPTC Digital Source Type written into PNG, JPEG and WebP. */
export type ExportIntent = 'perceptual' | 'relative' | 'saturation' | 'absolute';
export const EXPORT_INTENTS: ReadonlyArray<readonly [ExportIntent, string]> = [['relative', 'Relative Colorimetric'], ['perceptual', 'Perceptual'], ['saturation', 'Saturation'], ['absolute', 'Absolute Colorimetric']];
/** `profile` is a built-in space or `id:` and a profile listed by the engine; `intent` and `bpc` steer the conversion
 *  into a listed profile (relative and on when left out); `embed` false leaves the profile out of the file. */
export interface ExportSettings { format: ExportFormat; quality: number; scale: number; profile?: SpaceId | `id:${string}`; intent?: ExportIntent; bpc?: boolean; embed?: boolean; size?: 'scale' | 'fit' | 'frame'; boxW?: number; boxH?: number; aiLabel?: 'none' | 'generated' | 'edited'; dpxBits?: DpxBits; dpxTransfer?: DpxTransfer; option?: string; icoSizes?: number[] }
export interface ExportPreset extends ExportSettings { id: string; name: string; builtin: boolean }

export const EXPORT_FORMATS: ReadonlyArray<readonly [ExportFormat, string]> = [['png', 'PNG'], ['jpg', 'JPEG'], ['webp', 'WebP'], ['avif', 'AVIF'], ['tiff', 'TIFF'], ['dpx', 'DPX'], ['qoi', 'QOI'], ['pnm', 'PNM (PBM, PGM, PPM, PAM)'], ['tga', 'TGA'], ['ico', 'ICO (Windows icon)'], ['pdf', 'PDF']];
/** Formats whose encoder takes a quality; the others are lossless or, for PDF, carry the PNG as is. */
export const LOSSY: ReadonlySet<ExportFormat> = new Set(['jpg', 'webp', 'avif']);
/** Formats the engine encodes; the browser does the rest. */
export const ENGINE_FORMATS: ReadonlySet<ExportFormat> = new Set(['avif', 'tiff', 'pdf', 'dpx', 'qoi', 'pnm', 'tga', 'ico']);

export const BUILTIN_EXPORT_PRESETS: ExportPreset[] = [
  { id: 'png-1x', name: 'PNG', format: 'png', quality: 100, scale: 100, builtin: true },
  { id: 'png-2x', name: 'PNG @2x', format: 'png', quality: 100, scale: 200, builtin: true },
  { id: 'jpg-web', name: 'JPEG for the web (80%)', format: 'jpg', quality: 80, scale: 100, builtin: true },
  { id: 'webp-web', name: 'WebP for the web (80%)', format: 'webp', quality: 80, scale: 100, builtin: true },
  { id: 'webp-half', name: 'WebP thumbnail (50% size)', format: 'webp', quality: 75, scale: 50, builtin: true },
  { id: 'tiff-print', name: 'TIFF for print', format: 'tiff', quality: 100, scale: 100, builtin: true },
  { id: 'pdf', name: 'PDF', format: 'pdf', quality: 100, scale: 100, builtin: true },
];

export const clampSettings = (s: ExportSettings): ExportSettings => ({
  format: EXPORT_FORMATS.some(([f]) => f === s.format) ? s.format : 'png',
  quality: Math.round(Math.min(100, Math.max(1, Number.isFinite(s.quality) ? s.quality : 90))),
  scale: Math.round(Math.min(1000, Math.max(1, Number.isFinite(s.scale) ? s.scale : 100))),
  ...(s.profile && ((s.profile in SPACES && s.profile !== 'srgb') || /^id:[A-Za-z0-9:_-]{1,64}$/.test(s.profile)) ? { profile: s.profile } : {}),
  ...(EXPORT_INTENTS.some(([i]) => i === s.intent) && s.intent !== 'relative' ? { intent: s.intent } : {}),
  ...(s.bpc === false ? { bpc: false } : {}),
  ...(s.embed === false ? { embed: false } : {}),
  ...(s.size === 'fit' || s.size === 'frame' ? { size: s.size, boxW: box(s.boxW), boxH: box(s.boxH) } : {}),
  ...(s.aiLabel === 'generated' || s.aiLabel === 'edited' ? { aiLabel: s.aiLabel } : {}),
  ...(s.format === 'dpx' ? { dpxBits: ([8, 10, 12, 16] as const).find((b) => b === Number(s.dpxBits)) ?? 10, dpxTransfer: DPX_TRANSFERS.find(([t]) => t === s.dpxTransfer)?.[0] ?? 'log' } : {}),
  ...(FORMAT_OPTIONS[s.format] ? { option: FORMAT_OPTIONS[s.format]?.find(([v]) => v === s.option)?.[0] ?? FORMAT_OPTIONS[s.format]?.[0][0] } : {}),
  ...(s.format === 'ico' ? { icoSizes: icoSizesOf(s.icoSizes) } : {}),
});
const icoSizesOf = (v: unknown): number[] => {
  const kept = ICO_SIZES.filter((n) => Array.isArray(v) && v.includes(n));
  return kept.length ? kept : [...DEFAULT_ICO_SIZES];
};

/** The options object /api/io/encode takes for QOI, PNM, TGA and ICO (the engine's qoi.py, pnm.py, tga.py, ico.py). */
export function formatOptions(s: ExportSettings): Record<string, unknown> {
  const o = FORMAT_OPTIONS[s.format]?.find(([v]) => v === s.option)?.[0] ?? FORMAT_OPTIONS[s.format]?.[0][0];
  if (s.format === 'qoi') return { linear: o === 'linear' };
  if (s.format === 'pnm') return { kind: o };
  if (s.format === 'tga') return { bits: o?.startsWith('24') ? 24 : 32, rle: o?.endsWith('rle') ?? false };
  if (s.format === 'ico') return { sizes: icoSizesOf(s.icoSizes), png: o === 'png' };
  return {};
}
const box = (v: unknown): number => Math.round(Math.min(30000, Math.max(1, Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 1080)));

/** Where the picture goes in the exported image: the image's size, and the rectangle the picture is drawn into. */
export function exportLayout(w: number, h: number, s: ExportSettings): { w: number; h: number; dx: number; dy: number; dw: number; dh: number } {
  if (s.size !== 'fit' && s.size !== 'frame') { const z = exportSize(w, h, s.scale); return { ...z, dx: 0, dy: 0, dw: z.w, dh: z.h }; }
  const W = box(s.boxW), H = box(s.boxH), k = Math.min(W / w, H / h), dw = Math.max(1, Math.round(w * k)), dh = Math.max(1, Math.round(h * k));
  return s.size === 'fit' ? { w: dw, h: dh, dx: 0, dy: 0, dw, dh } : { w: W, h: H, dx: Math.floor((W - dw) / 2), dy: Math.floor((H - dh) / 2), dw, dh };
}

/** Saved presets read back from storage: well-formed entries only, values clamped, never marked built-in. */
export function presetsFromStorage(raw: string | null): ExportPreset[] {
  let v: unknown;
  try { v = raw ? JSON.parse(raw) : []; } catch { return []; }
  if (!Array.isArray(v)) return [];
  return v.flatMap((r) => {
    const o = r && typeof r === 'object' ? (r as Record<string, unknown>) : null;
    if (!o || typeof o.id !== 'string' || typeof o.name !== 'string' || !o.name.trim()) return [];
    const s = clampSettings({ format: o.format as ExportFormat, quality: Number(o.quality), scale: Number(o.scale), profile: o.profile as ExportSettings['profile'], intent: o.intent as ExportIntent, bpc: o.bpc as boolean | undefined, embed: o.embed as boolean | undefined, size: o.size as ExportSettings['size'], boxW: Number(o.boxW), boxH: Number(o.boxH), aiLabel: o.aiLabel as ExportSettings['aiLabel'], dpxBits: Number(o.dpxBits) as DpxBits, dpxTransfer: o.dpxTransfer as DpxTransfer, option: typeof o.option === 'string' ? o.option : undefined, icoSizes: Array.isArray(o.icoSizes) ? o.icoSizes.map(Number) : undefined });
    return [{ id: o.id, name: o.name.trim().slice(0, 60), ...s, builtin: false }];
  });
}

/** Photoshop's naming: the document name, a scale suffix like @2x or @0.5x when not 100 percent, the extension. */
export function exportName(docName: string, s: ExportSettings): string {
  const ext = s.format === 'tiff' ? 'tif' : s.format === 'pnm' ? (FORMAT_OPTIONS.pnm?.find(([v]) => v === s.option)?.[0] ?? 'ppm') : s.format;
  const suffix = s.scale === 100 ? '' : `@${Number((s.scale / 100).toFixed(2))}x`;
  return `${docName}${suffix}.${ext}`;
}

/** The exported pixel size for a document size and a scale, at least 1 pixel a side. */
export const exportSize = (w: number, h: number, scale: number): { w: number; h: number } => ({ w: Math.max(1, Math.round((w * scale) / 100)), h: Math.max(1, Math.round((h * scale) / 100)) });
