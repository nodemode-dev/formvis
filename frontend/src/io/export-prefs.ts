/** File > Export > Export Preferences: what Quick Export writes. The format, its quality, whether a generated picture's
 *  prompt and recipe go into a PNG, and, in the desktop app, a folder inside the exports folder to write into without asking. */
export type QuickFormat = 'png' | 'jpg' | 'webp';
export interface ExportPrefs { format: QuickFormat; quality: number; promptMeta: boolean; folder: string; /** Maximize PSD and PSB File Compatibility: the flattened composite and its thumbnail are written beside the layers. */ maximizePsd: boolean }
export const QUICK_FORMATS: ReadonlyArray<readonly [QuickFormat, string]> = [['png', 'PNG'], ['jpg', 'JPEG'], ['webp', 'WebP']];
export const DEFAULT_EXPORT_PREFS: ExportPrefs = { format: 'png', quality: 90, promptMeta: false, folder: '', maximizePsd: true };
const KEY = 'formvis.exportPrefs';

export function cleanExportPrefs(v: unknown): ExportPrefs {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {}, q = Number(o.quality);
  return {
    format: QUICK_FORMATS.some(([f]) => f === o.format) ? (o.format as QuickFormat) : DEFAULT_EXPORT_PREFS.format,
    quality: Math.round(Math.min(100, Math.max(1, Number.isFinite(q) && o.quality !== undefined ? q : DEFAULT_EXPORT_PREFS.quality))),
    promptMeta: o.promptMeta === true,
    maximizePsd: o.maximizePsd !== false,
    folder: typeof o.folder === 'string' ? o.folder.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim().slice(0, 60) : '',
  };
}

export function loadExportPrefs(): ExportPrefs {
  try { return cleanExportPrefs(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { return { ...DEFAULT_EXPORT_PREFS }; }
}

export function saveExportPrefs(p: ExportPrefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(cleanExportPrefs(p))); } catch { /* storage unavailable: the defaults apply */ }
}
