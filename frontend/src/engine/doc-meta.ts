/** File Info (DEV_PLAN 29.2): the descriptive metadata a document carries, the File > File Info fields. Pure data
 *  and rules, no DOM; the dialog, the project file, the XMP writer and reader and the tab all read it from here. */

export type CopyrightStatus = 'unknown' | 'copyrighted' | 'public';

/** The camera's own record, read only: values as the file states them (exposure `1/250` or `0.5` seconds, aperture the
 *  f-number, focal length in millimetres, date as ISO local time) so they travel back into XMP unchanged. */
export interface CameraData { make?: string; model?: string; lens?: string; exposure?: string; aperture?: string; iso?: string; focalLength?: string; dateTaken?: string }

export interface DocMeta {
  title?: string;
  author?: string;
  authorTitle?: string;
  description?: string;
  rating?: number;
  descriptionWriter?: string;
  keywords?: readonly string[];
  copyright?: CopyrightStatus;
  notice?: string;
  url?: string;
  camera?: CameraData;
  /** Free-form text fields the person names (a job number, a client, a shot id): key to text. */
  custom?: Readonly<Record<string, string>>;
  created?: string;
  modified?: string;
  /** The quality a JPEG was saved at, estimated when it was opened; Export As offers it again for the first re-save. */
  jpegQuality?: number;
  /** The picture's own Exif block as base64 (orientation already applied and reset to 1), written back into JPEG, PNG and WebP. */
  exif?: string;
  /** The XMP packet the picture came with; its properties File Info does not manage travel on in the next export. */
  xmpRaw?: string;
  /** The EU AI label: the IPTC digital source type every export of this document carries (made with AI, or edited with it). */
  aiLabel?: 'generated' | 'edited';
}

/** The fields a change may name; keywords may be one typed line, custom fields lines of `key: value`; aiLabel 'none' removes the label. */
export type MetaPatch = Omit<Partial<DocMeta>, 'keywords' | 'custom' | 'aiLabel'> & { keywords?: string | readonly string[]; custom?: string | Readonly<Record<string, string>>; aiLabel?: 'generated' | 'edited' | 'none' };

const MAX_CUSTOM = 50, MAX_CUSTOM_KEY = 64, MAX_CUSTOM_VALUE = 1000;
/** One Exif block fits one JPEG segment (65 KB); the original XMP packet is kept up to 48 K characters. */
export const MAX_EXIF_BYTES = 64000;
const MAX_EXIF_B64 = Math.ceil(MAX_EXIF_BYTES / 3) * 4, MAX_XMP_RAW = 48000;
export const MAX_XMP_RAW_CHARS = MAX_XMP_RAW;

/** Free-form fields from typed lines (`key: value`, one per line) or a record: keys trimmed, a repeated key (any case)
 *  keeps its first, empty keys and values dropped. */
export function parseCustom(input: string | Readonly<Record<string, unknown>>): Record<string, string> {
  const pairs: Array<[string, string]> = typeof input === 'string'
    ? input.split('\n').map((line) => { const i = line.indexOf(':'); return (i < 0 ? ['', ''] : [line.slice(0, i), line.slice(i + 1)]) as [string, string]; })
    : Object.entries(input).map(([k, v]) => [k, String(v ?? '')] as [string, string]);
  const seen = new Set<string>(), out: Record<string, string> = {};
  for (const [rawKey, rawValue] of pairs) {
    const k = rawKey.replace(/\s+/g, ' ').trim().slice(0, MAX_CUSTOM_KEY), v = rawValue.replace(/\u0000/g, '').trim().slice(0, MAX_CUSTOM_VALUE), id = k.toLowerCase();
    if (!k || !v || seen.has(id)) continue;
    seen.add(id);
    out[k] = v;
    if (seen.size >= MAX_CUSTOM) break;
  }
  return out;
}

/** The free-form fields as the typed lines the File Info dialog shows. */
export const customLines = (c: Readonly<Record<string, string>> | undefined): string => Object.entries(c ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n');

export const COPYRIGHT_STATUSES: ReadonlyArray<readonly [CopyrightStatus, string]> = [['unknown', 'Unknown'], ['copyrighted', 'Copyrighted'], ['public', 'Public Domain']];

/** The text fields, with the longest each may be (the XMP packet of a JPEG holds 64 KB in all). */
export const META_TEXT = { title: 500, author: 200, authorTitle: 200, description: 5000, descriptionWriter: 200, notice: 1000, url: 1000 } as const;
const MAX_KEYWORDS = 100, MAX_KEYWORD = 64;
const CAMERA_KEYS: ReadonlyArray<keyof CameraData> = ['make', 'model', 'lens', 'exposure', 'aperture', 'iso', 'focalLength', 'dateTaken'];

/** Keywords from a typed line: comma or semicolon separated, trimmed, empty ones and repeats (any case) dropped. */
export function parseKeywords(text: string | readonly string[]): string[] {
  const parts = typeof text === 'string' ? text.split(/[,;\n]/) : text.flatMap((t) => String(t).split(/[,;\n]/));
  const seen = new Set<string>(), out: string[] = [];
  for (const raw of parts) {
    const k = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_KEYWORD), key = k.toLowerCase();
    if (!k || seen.has(key)) continue;
    seen.add(key);
    out.push(k);
    if (out.length >= MAX_KEYWORDS) break;
  }
  return out;
}

const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim() ? v.replace(/\u0000/g, '').slice(0, max) : undefined);
const stamp = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 40) : undefined);

/** Any value read from a project file, a picture's XMP or an agent as a clean DocMeta, or null when it holds nothing. */
export function cleanMeta(v: unknown): DocMeta | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>, out: DocMeta = {};
  for (const [k, max] of Object.entries(META_TEXT)) { const s = str(o[k], max); if (s !== undefined) (out as Record<string, unknown>)[k] = s; }
  const rating = Math.round(Number(o.rating));
  if (Number.isFinite(rating) && rating >= 1 && rating <= 5) out.rating = rating;
  const keywords = o.keywords === undefined ? [] : parseKeywords(typeof o.keywords === 'string' ? o.keywords : Array.isArray(o.keywords) ? o.keywords.map(String) : []);
  if (keywords.length) out.keywords = keywords;
  if (o.copyright === 'copyrighted' || o.copyright === 'public') out.copyright = o.copyright;
  if (o.aiLabel === 'generated' || o.aiLabel === 'edited') out.aiLabel = o.aiLabel;
  const cam = o.camera && typeof o.camera === 'object' ? (o.camera as Record<string, unknown>) : null;
  if (cam) {
    const camera: CameraData = {};
    for (const k of CAMERA_KEYS) { const s = str(cam[k], 100); if (s !== undefined) camera[k] = s.trim(); }
    if (Object.keys(camera).length) out.camera = camera;
  }
  if (o.custom && typeof o.custom === 'object' && !Array.isArray(o.custom)) { const c = parseCustom(o.custom as Record<string, unknown>); if (Object.keys(c).length) out.custom = c; }
  const created = stamp(o.created), modified = stamp(o.modified);
  if (created) out.created = created;
  if (modified) out.modified = modified;
  const jq = Math.round(Number(o.jpegQuality));
  if (Number.isFinite(jq) && jq >= 1 && jq <= 100) out.jpegQuality = jq;
  if (typeof o.exif === 'string' && o.exif.length <= MAX_EXIF_B64 && /^[A-Za-z0-9+/]+={0,2}$/.test(o.exif)) out.exif = o.exif;
  if (typeof o.xmpRaw === 'string' && o.xmpRaw.length > 0 && o.xmpRaw.length <= MAX_XMP_RAW) out.xmpRaw = o.xmpRaw.replace(/\u0000/g, '');
  return Object.keys(out).length ? out : null;
}

/** True when `m` has anything worth writing into a file: a field the person fills in, or the camera's record. */
export function metaWritable(m: DocMeta | null | undefined): m is DocMeta {
  if (!m) return false;
  return !!(m.title || m.author || m.authorTitle || m.description || m.rating || m.descriptionWriter || m.keywords?.length || (m.copyright && m.copyright !== 'unknown') || m.notice || m.url || m.camera || m.exif || m.xmpRaw || m.aiLabel || (m.custom && Object.keys(m.custom).length));
}

const sameList = (a: readonly string[] | undefined, b: readonly string[] | undefined): boolean => (a?.length ?? 0) === (b?.length ?? 0) && (a ?? []).every((x, i) => x === (b as readonly string[])[i]);

/** Whether the editable fields of two records are the same (the camera and the dates are not edited). */
export function sameMeta(a: DocMeta | null | undefined, b: DocMeta | null | undefined): boolean {
  const x = a ?? {}, y = b ?? {};
  return (x.title ?? '') === (y.title ?? '') && (x.author ?? '') === (y.author ?? '') && (x.authorTitle ?? '') === (y.authorTitle ?? '') && (x.description ?? '') === (y.description ?? '')
    && (x.rating ?? 0) === (y.rating ?? 0) && (x.descriptionWriter ?? '') === (y.descriptionWriter ?? '') && sameList(x.keywords, y.keywords)
    && (x.copyright ?? 'unknown') === (y.copyright ?? 'unknown') && (x.notice ?? '') === (y.notice ?? '') && (x.url ?? '') === (y.url ?? '')
    && (x.aiLabel ?? '') === (y.aiLabel ?? '') && customLines(x.custom) === customLines(y.custom);
}

/** The record after `patch` (only the fields it names change; an empty string clears a text field) and a note of when it
 *  changed; the same object when nothing changed. The camera and the created date stay as they were. */
export function mergeMeta(cur: DocMeta | undefined, patch: MetaPatch, now: string): DocMeta | undefined {
  const next: Record<string, unknown> = { ...(cur ?? {}) };
  for (const k of Object.keys(META_TEXT) as Array<keyof typeof META_TEXT>) {
    if (patch[k] === undefined) continue;
    const s = String(patch[k]).trim().slice(0, META_TEXT[k]);
    if (s) next[k] = s; else delete next[k];
  }
  if (patch.rating !== undefined) { const r = Math.min(5, Math.max(0, Math.round(Number(patch.rating)) || 0)); if (r) next.rating = r; else delete next.rating; }
  if (patch.keywords !== undefined) { const k = parseKeywords(patch.keywords); if (k.length) next.keywords = k; else delete next.keywords; }
  if (patch.copyright !== undefined) { if (patch.copyright === 'copyrighted' || patch.copyright === 'public') next.copyright = patch.copyright; else delete next.copyright; }
  if (patch.custom !== undefined) { const c = parseCustom(patch.custom); if (Object.keys(c).length) next.custom = c; else delete next.custom; }
  if (patch.aiLabel !== undefined) { if (patch.aiLabel === 'generated' || patch.aiLabel === 'edited') next.aiLabel = patch.aiLabel; else delete next.aiLabel; }
  const merged = next as DocMeta;
  if (sameMeta(cur, merged)) return cur;
  merged.created = cur?.created ?? now;
  merged.modified = now;
  return Object.keys(merged).length ? merged : undefined;
}

/** The copyright symbol put before the title in the document tab when the status is Copyrighted. */
export const COPYRIGHT_MARK = '©';
export const tabName = (name: string, m: DocMeta | undefined): string => (m?.copyright === 'copyrighted' ? `${COPYRIGHT_MARK} ${name}` : name);
