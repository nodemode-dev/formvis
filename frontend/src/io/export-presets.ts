import { SPACES, type SpaceId } from '../engine/icc';

export type ExportFormat = 'png' | 'jpg' | 'webp' | 'avif' | 'tiff' | 'pdf';
export interface ExportSettings { format: ExportFormat; quality: number; scale: number; profile?: SpaceId }
export interface ExportPreset extends ExportSettings { id: string; name: string; builtin: boolean }

export const EXPORT_FORMATS: ReadonlyArray<readonly [ExportFormat, string]> = [['png', 'PNG'], ['jpg', 'JPEG'], ['webp', 'WebP'], ['avif', 'AVIF'], ['tiff', 'TIFF'], ['pdf', 'PDF']];
/** Formats whose encoder takes a quality; the others are lossless or, for PDF, carry the PNG as is. */
export const LOSSY: ReadonlySet<ExportFormat> = new Set(['jpg', 'webp', 'avif']);
/** Formats the engine encodes; the browser does the rest. */
export const ENGINE_FORMATS: ReadonlySet<ExportFormat> = new Set(['avif', 'tiff', 'pdf']);

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
  ...(s.profile && s.profile in SPACES && s.profile !== 'srgb' ? { profile: s.profile } : {}),
});

/** Saved presets read back from storage: well-formed entries only, values clamped, never marked built-in. */
export function presetsFromStorage(raw: string | null): ExportPreset[] {
  let v: unknown;
  try { v = raw ? JSON.parse(raw) : []; } catch { return []; }
  if (!Array.isArray(v)) return [];
  return v.flatMap((r) => {
    const o = r && typeof r === 'object' ? (r as Record<string, unknown>) : null;
    if (!o || typeof o.id !== 'string' || typeof o.name !== 'string' || !o.name.trim()) return [];
    const s = clampSettings({ format: o.format as ExportFormat, quality: Number(o.quality), scale: Number(o.scale), profile: o.profile as SpaceId | undefined });
    return [{ id: o.id, name: o.name.trim().slice(0, 60), ...s, builtin: false }];
  });
}

/** Photoshop's naming: the document name, a scale suffix like @2x or @0.5x when not 100 percent, the extension. */
export function exportName(docName: string, s: ExportSettings): string {
  const ext = s.format === 'tiff' ? 'tif' : s.format;
  const suffix = s.scale === 100 ? '' : `@${Number((s.scale / 100).toFixed(2))}x`;
  return `${docName}${suffix}.${ext}`;
}

/** The exported pixel size for a document size and a scale, at least 1 pixel a side. */
export const exportSize = (w: number, h: number, scale: number): { w: number; h: number } => ({ w: Math.max(1, Math.round((w * scale) / 100)), h: Math.max(1, Math.round((h * scale) / 100)) });
