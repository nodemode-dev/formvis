import { SPACES, type SpaceId } from '../engine/icc';
import { cleanMeta, metaWritable, type DocMeta } from '../engine/doc-meta';

export type ExportFormat = 'png' | 'jpg' | 'webp' | 'avif' | 'tiff' | 'pdf' | 'dpx' | 'qoi' | 'pnm' | 'tga' | 'ico' | 'bmp' | 'fits' | 'wbmp';
/** DEV_PLAN 34.1: the options the engine-written formats take, kept in `ExportSettings.option` (one choice a format) and
 *  `icoSizes`. QOI: the colourspace flag. PNM: which file of the family. TGA: 24 or 32 bits, run-length or not. ICO: PNG
 *  entries for 256 and BMP below, or PNG for every size. The first of each list is the default. */
export const FORMAT_OPTIONS: Readonly<Partial<Record<ExportFormat, ReadonlyArray<readonly [string, string]>>>> = {
  qoi: [['srgb', 'sRGB with linear alpha'], ['linear', 'All channels linear']],
  pnm: [['ppm', 'PPM colour (P6)'], ['pgm', 'PGM grayscale (P5)'], ['pbm', 'PBM bitmap, thresholded (P4)'], ['pam', 'PAM with alpha (P7)']],
  tga: [['32', '32-bit with alpha'], ['32rle', '32-bit, run-length'], ['24', '24-bit, on white'], ['24rle', '24-bit, run-length, on white']],
  ico: [['mixed', 'PNG for 256, BMP for smaller'], ['png', 'PNG for every size']],
  bmp: [['32', '32-bit with alpha'], ['24', '24-bit, on white']],
  fits: [['rgb', 'Three planes (red, green, blue)'], ['gray', 'One grey plane']],
  png: [['6', 'Compression level 6 (default)'], ['0', 'Level 0, none (fastest)'], ['3', 'Level 3, fast'], ['9', 'Level 9, smallest'], ['9o', 'Level 9 with the best filters'], ['i', 'Interlaced (Adam7), level 6']],
  jpg: [['420', 'Chroma 4:2:0 (smallest)'], ['422', 'Chroma 4:2:2'], ['444', 'Chroma 4:4:4 (no subsampling)'], ['420p', 'Progressive, 4:2:0'], ['gray', 'Grayscale, one channel']],
  webp: [['lossy', 'Lossy, at the quality below'], ['lossless', 'Lossless']],
  tiff: [['lzw', 'LZW (default)'], ['none', 'None (baseline, largest)'], ['packbits', 'PackBits'], ['deflate', 'Deflate (ZIP)'], ['deflate-big', 'BigTIFF, Deflate'], ['none-big', 'BigTIFF, uncompressed'], ['gray', 'Grayscale with alpha, LZW'], ['gray-opaque', 'Grayscale, flattened on white']],
  pdf: [['rgb', 'RGB on white'], ['black', 'RGB on black'], ['gray', 'Grayscale on white'], ['cmyk', 'CMYK on white (simple conversion)']],
};
export const ICO_SIZES: readonly number[] = [16, 24, 32, 48, 64, 128, 256];
export const DEFAULT_ICO_SIZES: readonly number[] = [16, 32, 48, 256];
/** Formats that carry no colour profile and no more than 8 bits a channel (PNM holds 16 from a 16-bit document). */
export const PROFILELESS: ReadonlySet<ExportFormat> = new Set(['qoi', 'pnm', 'tga', 'ico', 'bmp', 'fits', 'wbmp']);
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
export interface ExportSettings { format: ExportFormat; quality: number; scale: number; profile?: SpaceId | `id:${string}`; intent?: ExportIntent; bpc?: boolean; embed?: boolean; size?: 'scale' | 'fit' | 'frame'; boxW?: number; boxH?: number; aiLabel?: 'none' | 'generated' | 'edited'; dpxBits?: DpxBits; dpxTransfer?: DpxTransfer; option?: string; icoSizes?: number[];
  /** DEV_PLAN 36.29: a canvas the scaled picture is centred in (transparent margins, white in JPEG; smaller than the
   *  picture crops); metadata: the document's File Info as before (left out), none, or only the Copyright and Contact
   *  texts below; sizes: one file per entry, `x` times the size above, named with `suffix`. */
  canvas?: boolean; canvasW?: number; canvasH?: number; metadata?: 'none' | 'copyright'; copyrightText?: string; contactText?: string; sizes?: ExportSize[];
  /** A file name (without the extension) used instead of the document's, and the prompt, seed and recipe of a generated picture written into a PNG as text. */
  fileName?: string; promptMeta?: boolean;
  /** Canvas size: where the picture sits on the canvas (0 top left to 8 bottom right, 4 the centre) and what colour the margin is. */
  canvasAnchor?: number; canvasFill?: 'white' | 'black';
  /** Transparency: the picture's see-through areas (and the margins) laid on white or black instead of kept; JPEG is always on white. */
  matte?: 'white' | 'black' }
export const MATTES: ReadonlyArray<readonly [string, string]> = [['keep', 'Keep transparency'], ['white', 'Matte on white'], ['black', 'Matte on black']];
export const CANVAS_ANCHORS: ReadonlyArray<readonly [string, string]> = [['0', 'Top left'], ['1', 'Top'], ['2', 'Top right'], ['3', 'Left'], ['4', 'Centre'], ['5', 'Right'], ['6', 'Bottom left'], ['7', 'Bottom'], ['8', 'Bottom right']];
export const CANVAS_FILLS: ReadonlyArray<readonly [string, string]> = [['transparent', 'Transparent (white in JPEG)'], ['white', 'White'], ['black', 'Black']];
export interface ExportSize { x: number; suffix: string }
export const MAX_EXPORT_SIZES = 8;
export interface ExportPreset extends ExportSettings { id: string; name: string; builtin: boolean }

export const EXPORT_FORMATS: ReadonlyArray<readonly [ExportFormat, string]> = [['png', 'PNG'], ['jpg', 'JPEG'], ['webp', 'WebP'], ['avif', 'AVIF'], ['tiff', 'TIFF'], ['dpx', 'DPX'], ['qoi', 'QOI'], ['pnm', 'PNM (PBM, PGM, PPM, PAM)'], ['tga', 'TGA'], ['ico', 'ICO (Windows icon)'], ['bmp', 'BMP'], ['fits', 'FITS (astronomy)'], ['wbmp', 'WBMP (1-bit, WAP)'], ['pdf', 'PDF']];
/** Formats whose encoder takes a quality; the others are lossless or, for PDF, carry the PNG as is. */
export const LOSSY: ReadonlySet<ExportFormat> = new Set(['jpg', 'webp', 'avif']);
/** Formats the engine encodes; the browser does the rest. */
export const ENGINE_FORMATS: ReadonlySet<ExportFormat> = new Set(['avif', 'tiff', 'pdf', 'dpx', 'qoi', 'pnm', 'tga', 'ico', 'bmp', 'fits', 'wbmp']);

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
  ...(FORMAT_OPTIONS[s.format] && !((s.format === 'png' || s.format === 'jpg' || s.format === 'webp' || s.format === 'tiff' || s.format === 'pdf') && !FORMAT_OPTIONS[s.format]?.some(([v], i) => i > 0 && v === s.option)) ? { option: FORMAT_OPTIONS[s.format]?.find(([v]) => v === s.option)?.[0] ?? FORMAT_OPTIONS[s.format]?.[0][0] } : {}),
  ...(s.format === 'ico' ? { icoSizes: icoSizesOf(s.icoSizes) } : {}),
  ...(s.canvas ? { canvas: true, canvasW: box(s.canvasW), canvasH: box(s.canvasH) } : {}),
  ...(s.canvas && Number.isInteger(s.canvasAnchor) && (s.canvasAnchor as number) >= 0 && (s.canvasAnchor as number) <= 8 && s.canvasAnchor !== 4 ? { canvasAnchor: s.canvasAnchor } : {}),
  ...(s.canvas && (s.canvasFill === 'white' || s.canvasFill === 'black') ? { canvasFill: s.canvasFill } : {}),
  ...(s.matte === 'white' || s.matte === 'black' ? { matte: s.matte } : {}),
  ...(s.metadata === 'none' || s.metadata === 'copyright' ? { metadata: s.metadata } : {}),
  ...(text(s.copyrightText) ? { copyrightText: text(s.copyrightText) } : {}),
  ...(text(s.contactText) ? { contactText: text(s.contactText) } : {}),
  ...(Array.isArray(s.sizes) && s.sizes.length ? { sizes: s.sizes.slice(0, MAX_EXPORT_SIZES).map(sizeOf) } : {}),
  ...(fileNameOf(s.fileName) ? { fileName: fileNameOf(s.fileName) } : {}),
  ...(s.promptMeta === true ? { promptMeta: true } : {}),
});
/** A file name to export under: no folders, no characters a file system refuses, no extension, at most 120 characters. */
export const fileNameOf = (v: unknown): string => (typeof v === 'string' ? v.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\.(png|jpe?g|webp|avif|tiff?|pdf|dpx|qoi|p[bgpna]m|tga|ico|bmp|fits|wbmp)$/i, '').trim().slice(0, 120) : '');
const text = (v: unknown): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').slice(0, 300) : '');
const sizeOf = (v: ExportSize): ExportSize => {
  const x = Math.round(Math.min(10, Math.max(0.1, Number.isFinite(Number(v?.x)) && Number(v.x) > 0 ? Number(v.x) : 1)) * 100) / 100;
  return { x, suffix: typeof v?.suffix === 'string' ? v.suffix.replace(/[^A-Za-z0-9@._-]/g, '').slice(0, 20) : defaultSuffix(x) };
};
export const defaultSuffix = (x: number): string => (x === 1 ? '' : `@${Number(x.toFixed(2))}x`);

/** One ExportSettings per file: the settings as they are, or one for each entry of `sizes` with the scale, the Fit or
 *  Frame box and the canvas multiplied by its `x`, paired with that entry's file name suffix. */
export function sizedSettings(s: ExportSettings): Array<{ s: ExportSettings; suffix?: string }> {
  if (!s.sizes?.length) return [{ s }];
  const { sizes, ...base } = s, m = (v: number | undefined, x: number): number => box((v ?? 1080) * x);
  return sizes.map((z) => ({ suffix: z.suffix, s: { ...base, scale: Math.round(Math.min(1000, Math.max(1, s.scale * z.x))), ...(s.size === 'fit' || s.size === 'frame' ? { boxW: m(s.boxW, z.x), boxH: m(s.boxH, z.x) } : {}), ...(s.canvas ? { canvasW: m(s.canvasW, z.x), canvasH: m(s.canvasH, z.x) } : {}) } }));
}

/** The File Info written into the file: the document's own, nothing, or just the Copyright and Contact texts. */
export function exportMeta(s: ExportSettings, doc: DocMeta | undefined): DocMeta | undefined {
  if (s.metadata === 'none') return undefined;
  if (s.metadata !== 'copyright') return doc;
  const notice = s.copyrightText?.trim(), author = s.contactText?.trim();
  return cleanMeta({ ...(notice ? { notice, copyright: 'copyrighted' } : {}), ...(author ? { author } : {}) }) ?? undefined;
}
/** DEV_PLAN 36.14, Save for Web (Legacy): the Metadata choices. */
export type SfwMetadata = 'none' | 'copyright' | 'contact' | 'noCamera' | 'all';
export const SFW_METADATA: ReadonlyArray<readonly [SfwMetadata, string]> = [['none', 'None'], ['copyright', 'Copyright'], ['contact', 'Copyright and Contact Info'], ['noCamera', 'All Except Camera Info'], ['all', 'All']];
/** The File Info a Save for Web file carries: Copyright is the status, notice and web statement; Contact adds the creator
 *  and its title; All Except Camera Info drops the camera's record; All keeps everything. Reuses exportMeta for None. */
export function sfwMeta(mode: SfwMetadata, doc: DocMeta | undefined): DocMeta | undefined {
  if (mode === 'none' || !doc) return exportMeta({ format: 'png', quality: 100, scale: 100, metadata: 'none' }, doc);
  if (mode === 'all') return doc;
  if (mode === 'noCamera') { const { camera: _camera, exif: _exif, xmpRaw: _xmpRaw, ...rest } = doc; return cleanMeta(rest) ?? undefined; }
  const { copyright, notice, url, author, authorTitle } = doc;
  return cleanMeta({ copyright, notice, url, ...(mode === 'contact' ? { author, authorTitle } : {}) }) ?? undefined;
}
/** What the chosen metadata cannot reach: formats written without an XMP packet. */
export const XMP_FORMATS: ReadonlySet<ExportFormat> = new Set(['png', 'jpg', 'webp', 'tiff', 'avif']);
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
  if (s.format === 'bmp') return { bits: o === '24' ? 24 : 32 };
  if (s.format === 'fits') return { planes: o === 'gray' ? 'gray' : 'rgb' };
  if (s.format === 'png') return o === 'i' ? { level: 6, interlace: true } : { level: Number.parseInt(o ?? '6', 10), optimize: o === '9o' };
  if (s.format === 'jpg') return o === 'gray' ? { subsampling: '420', gray: true } : o === '420p' ? { subsampling: '420', progressive: true } : { subsampling: o };
  if (s.format === 'webp') return { lossless: o === 'lossless' };
  if (s.format === 'tiff') {
    const c = o ?? 'lzw';
    if (c.startsWith('gray')) return { gray: true, compression: 'lzw', alpha: c === 'gray' };
    return { compression: c.replace('-big', ''), bigtiff: c.endsWith('-big') };
  }
  if (s.format === 'pdf') return o === 'black' ? { background: 'black' } : o === 'gray' || o === 'cmyk' ? { mode: o } : {};
  return {};
}
/** Formats that write no alpha channel with these settings: transparency is laid on a matte. */
export const dropsAlpha = (s: ExportSettings): boolean => s.format === 'jpg' || s.format === 'pdf' || s.format === 'wbmp' || (s.format === 'bmp' && s.option === '24') || (s.format === 'tga' && !!s.option?.startsWith('24')) || (s.format === 'tiff' && s.option === 'gray-opaque');
interface FlatDoc { depth?: number; mode?: string; resolution?: number; meta?: DocMeta; layers?: ReadonlyArray<{ visible: boolean; isGroup: boolean; adjustment?: unknown; mask?: unknown; text?: unknown; smart?: unknown }> }
const INFO_KINDS: ReadonlySet<string> = new Set(['png', 'jpg', 'webp', 'tiff', 'avif']);
/** What a flat save leaves behind that its pixels do not show: layers merged into one picture, hidden layers left out, and
 *  File Info (title, author, camera data) in a kind that cannot hold it. */
function keptLoss(kind: string, name: string, doc: FlatDoc): string[] {
  const out: string[] = [], real = (doc.layers ?? []).filter((l) => !l.isGroup), hidden = real.filter((l) => !l.visible).length, shown = real.length - hidden;
  const live = real.filter((l) => l.visible && (l.adjustment || l.mask || l.text || l.smart)).length;
  if (shown > 1 || live) out.push(`${name} is one flat picture: ${shown} visible layer${shown === 1 ? '' : 's'} merged${live ? `, and the text, adjustments, masks and smart objects among them are no longer editable` : ''}.`);
  if (hidden) out.push(`${hidden} hidden layer${hidden === 1 ? ' is' : 's are'} left out of the ${name}.`);
  if (metaWritable(doc.meta) && !INFO_KINDS.has(kind)) out.push(`${name} carries no File Info; the title, author and camera data stay in the document only.`);
  return out;
}
/** What a flat export changed or lost, one short sentence each: depth, ink, alpha, lossy encoding and resolution. The depth
 *  sentence for QOI, TGA and ICO is said elsewhere. `clear` is whether the picture has see-through pixels. */
export function fidelityNotes(s: ExportSettings, doc: FlatDoc, clear: boolean): string[] {
  const name = s.format === 'jpg' ? 'JPEG' : s.format.toUpperCase(), out: string[] = [];
  if ((doc.depth ?? 8) > 8 && !['qoi', 'tga', 'ico'].includes(s.format)) out.push(`${name} is written at 8 bits a channel here; the ${doc.depth}-bit picture is reduced.`);
  if (doc.mode === 'cmyk' || doc.mode === 'lab') out.push(`The ${doc.mode === 'cmyk' ? 'CMYK' : 'Lab'} picture is converted to RGB for ${name}; colours outside the RGB gamut are clipped to its edge.`);
  if (clear && dropsAlpha(s)) out.push(`${name} keeps no transparency; clear areas are laid on ${s.format === 'pdf' && s.option === 'black' ? 'black' : s.format === 'wbmp' ? 'white and thresholded' : 'white'}.`);
  if (s.format === 'jpg' || s.format === 'avif' || (s.format === 'webp' && s.option !== 'lossless')) out.push(`${name} is lossy; written at quality ${s.quality}.`);
  if (['qoi', 'pnm', 'tga', 'ico', 'fits', 'wbmp', 'dpx'].includes(s.format) && (doc.resolution ?? 72) !== 72) out.push(`${name} has no resolution field; the document's ${doc.resolution} ppi is not recorded.`);
  return [...out, ...keptLoss(s.format, name, doc)];
}
/** What a save in one flat kind (the Save As and Save a Copy kinds, CMYK and Lab included, and the wide-range kinds HDR, EXR and PFM)
 *  changes or drops, one short sentence each: depth, ink, alpha, lossy encoding and resolution. `clear` is whether the
 *  picture has see-through pixels; `quality` is 0 to 1 where the kind has one. */
export function saveCopyNotes(kind: string, doc: FlatDoc, clear: boolean, quality = 1): string[] {
  const name = kind === 'jpg' ? 'JPEG' : kind === 'webp' ? 'WebP' : kind.toUpperCase(), out: string[] = [], depth = doc.depth ?? 8, cmyk = doc.mode === 'cmyk', lab = doc.mode === 'lab';
  const wide = kind === 'hdr' || kind === 'exr' || kind === 'pfm', keepsInk = cmyk && (kind === 'tiff' || kind === 'jpg'), keepsLab = lab && kind === 'tiff';
  if (wide) {
    out.push(`${name} stores linear light; the ${depth}-bit picture is written as the canvas shows it${depth < 32 ? ', so nothing brighter than white is in it' : ''}.`);
    if (cmyk || lab) out.push(`The ${cmyk ? 'CMYK' : 'Lab'} picture is converted to RGB for ${name}; colours outside the RGB gamut are clipped to its edge.`);
    if (kind !== 'exr' && clear) out.push(`${name} keeps no transparency.`);
    if ((doc.resolution ?? 72) !== 72) out.push(`${name} has no resolution field; the document's ${doc.resolution} ppi is not recorded.`);
    return [...out, ...keptLoss(kind, name, doc)];
  }
  if (depth === 32 && kind === 'png') out.push('PNG is written at 16 bits, sRGB encoded; values brighter than white are clipped.');
  else if (depth > 8 && !((kind === 'png' || kind === 'tiff') && !cmyk && !lab) && !(kind === 'tiff' && (cmyk || lab) && depth === 16) && !(depth === 32 && kind === 'tiff')) out.push(`${name} is written at 8 bits a channel; the ${depth}-bit picture is reduced.`);
  if ((cmyk && !keepsInk) || (lab && !keepsLab)) out.push(`The ${cmyk ? 'CMYK' : 'Lab'} picture is converted to RGB for ${name}; colours outside the RGB gamut are clipped to its edge.`);
  if (clear && (kind === 'jpg' || kind === 'pdf' || keepsInk || keepsLab)) out.push(`${name} keeps no transparency here; clear areas are laid on ${cmyk ? 'paper white' : 'white'}.`);
  if (kind === 'jpg' || kind === 'avif' || (kind === 'webp' && quality < 1)) out.push(`${name} is lossy; written at quality ${Math.round(quality * 100)}.`);
  if (cmyk && (kind === 'jpg' || kind === 'tiff')) out.push(`${name} CMYK files carry no File Info or AI label here.`);
  return [...out, ...keptLoss(kind, name, doc)];
}
/** PNG and JPEG are written by the browser unless a compression level or a chroma subsampling other than the default is chosen. */
export const engineWrites = (s: ExportSettings): boolean => ENGINE_FORMATS.has(s.format) || (s.format === 'png' && !!s.option && s.option !== '6') || (s.format === 'jpg' && !!s.option && s.option !== '420') || (s.format === 'webp' && s.option === 'lossless');
const box = (v: unknown): number => Math.round(Math.min(30000, Math.max(1, Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 1080)));

/** Where the picture goes in the exported image: the image's size, and the rectangle the picture is drawn into. */
export function exportLayout(w: number, h: number, s: ExportSettings): { w: number; h: number; dx: number; dy: number; dw: number; dh: number } {
  const L = sizeLayout(w, h, s);
  if (!s.canvas) return L;
  const CW = box(s.canvasW), CH = box(s.canvasH);
  const a = Number.isInteger(s.canvasAnchor) ? (s.canvasAnchor as number) : 4, col = a % 3, row = Math.floor(a / 3);
  return { w: CW, h: CH, dx: L.dx + Math.floor(((CW - L.w) * col) / 2), dy: L.dy + Math.floor(((CH - L.h) * row) / 2), dw: L.dw, dh: L.dh };
}
function sizeLayout(w: number, h: number, s: ExportSettings): { w: number; h: number; dx: number; dy: number; dw: number; dh: number } {
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
    const s = clampSettings({ format: o.format as ExportFormat, quality: Number(o.quality), scale: Number(o.scale), profile: o.profile as ExportSettings['profile'], intent: o.intent as ExportIntent, bpc: o.bpc as boolean | undefined, embed: o.embed as boolean | undefined, size: o.size as ExportSettings['size'], boxW: Number(o.boxW), boxH: Number(o.boxH), aiLabel: o.aiLabel as ExportSettings['aiLabel'], dpxBits: Number(o.dpxBits) as DpxBits, dpxTransfer: o.dpxTransfer as DpxTransfer, option: typeof o.option === 'string' ? o.option : undefined, icoSizes: Array.isArray(o.icoSizes) ? o.icoSizes.map(Number) : undefined, canvas: o.canvas === true, canvasW: Number(o.canvasW), canvasH: Number(o.canvasH), metadata: o.metadata as ExportSettings['metadata'], copyrightText: o.copyrightText as string | undefined, contactText: o.contactText as string | undefined, sizes: Array.isArray(o.sizes) ? (o.sizes as ExportSize[]) : undefined });
    return [{ id: o.id, name: o.name.trim().slice(0, 60), ...s, builtin: false }];
  });
}

/** The usual naming: the document name, a scale suffix like @2x or @0.5x when not 100 percent, the extension. */
export function exportName(docName: string, s: ExportSettings, sizeSuffix?: string): string {
  const ext = s.format === 'tiff' ? 'tif' : s.format === 'pnm' ? (FORMAT_OPTIONS.pnm?.find(([v]) => v === s.option)?.[0] ?? 'ppm') : s.format;
  const suffix = sizeSuffix !== undefined ? sizeSuffix : s.scale === 100 ? '' : `@${Number((s.scale / 100).toFixed(2))}x`;
  return `${fileNameOf(s.fileName) || docName}${suffix}.${ext}`;
}

/** The exported pixel size for a document size and a scale, at least 1 pixel a side. */
export const exportSize = (w: number, h: number, scale: number): { w: number; h: number } => ({ w: Math.max(1, Math.round((w * scale) / 100)), h: Math.max(1, Math.round((h * scale) / 100)) });
