import { Raster, ctxOf, createSurface, docTransform, hierarchy, newLayer, toBlob, type Doc, type Engine, type ID, type Surface } from '../engine';
import { SPACES, iccProfile } from '../engine/icc';
import { api } from './api';
import { embedJpeg, embedPng } from './embed-icc';
import { fromBase64, profileName } from './icc-read';
import { writePsdFile } from './psd';
import { writeLayeredTiff } from './layered-tiff';

/** File > Export > Layers to Files and Artboards to Files (DEV_PLAN 29.1): each layer (or artboard) drawn alone with
 *  its effects and mask applied, encoded through the same paths as Export As and returned as named files. */

export type LayerFileFormat = 'png' | 'jpg' | 'tiff' | 'tiff-layers' | 'webp' | 'psd' | 'bmp' | 'tga' | 'dpx';
export const LAYER_FILE_FORMATS: ReadonlyArray<readonly [LayerFileFormat, string]> = [['png', 'PNG'], ['jpg', 'JPEG'], ['tiff', 'TIFF'], ['tiff-layers', 'TIFF with layer'], ['webp', 'WebP'], ['psd', 'PSD'], ['bmp', 'BMP'], ['tga', 'TGA'], ['dpx', 'DPX']];
/** The file extension of a layer file type. */
export const layerFileExt = (format: LayerFileFormat): string => (format === 'tiff' || format === 'tiff-layers' ? 'tif' : format);
/** What a layer file of this type cannot hold, in one short sentence; empty when it keeps the picture whole. */
export function layerFileLoss(format: LayerFileFormat, icc: boolean): string {
  if (format === 'jpg') return 'JPEG keeps no transparency (clear areas are laid on white) and is lossy.';
  if (format === 'webp') return 'WebP is lossy at the quality set.';
  if (format === 'bmp' || format === 'tga' || format === 'dpx') return `${format.toUpperCase()} carries no color profile${icc ? ', so none is embedded' : ''}.`;
  return '';
}
/** Formats with a quality setting. */
export const LAYER_FILE_LOSSY: ReadonlySet<LayerFileFormat> = new Set(['jpg', 'webp']);

export interface LayerExportSettings {
  /** File name prefix; the document's name when empty. */
  prefix: string;
  visibleOnly: boolean;
  format: LayerFileFormat;
  quality: number;
  trim: boolean;
  icc: boolean;
  /** Desktop app: the folder made inside the exports folder. */
  folder: string;
  /** TGA bits per pixel (24 or 32; 32 when left out) and DPX bits per channel (8, 10, 12 or 16; 10 when left out). */
  tgaBits?: 24 | 32;
  dpxBits?: 8 | 10 | 12 | 16;
  /** One file per artboard instead of one per layer. */
  artboards: boolean;
  /** Layer Comps to Files: one file per layer comp (the flattened document with each comp applied). */
  comps?: boolean;
  /** Only these layers, artboards or comps; every one when left out or empty. */
  ids?: ID[];
  /** Browser: a folder the person chose with the directory picker; the files are written into it instead of a zip. */
  dir?: FileSystemDirectoryHandle;
}

export const DEFAULT_LAYER_EXPORT: LayerExportSettings = { prefix: '', visibleOnly: true, format: 'png', quality: 90, trim: false, icc: true, folder: '', artboards: false };

/** `text` reduced to letters, digits, space, dot, dash and underscore, runs of the rest made one underscore, at most
 *  `max` characters, never empty or starting with a dot. */
export function safeName(text: string, max = 60, fallback = 'layer'): string {
  const s = text.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ._-]+/g, '_').replace(/\.{2,}/g, '.').replace(/\s+/g, ' ').trim().replace(/^[._ ]+|[ .]+$/g, '').slice(0, max).trim();
  return s || fallback;
}

/** The usual naming: the prefix, a four digit number counted from the top of the stack, the layer's name. */
export function layerFileName(prefix: string, n: number, name: string, format: LayerFileFormat): string {
  return `${safeName(prefix, 60, 'Untitled')}_${String(n).padStart(4, '0')}_${safeName(name)}.${layerFileExt(format)}`;
}

/** The layers a Layers to Files export writes, top of the stack first: pixel, type, shape, fill and smart object
 *  layers (groups and adjustment layers draw nothing alone), the shown ones only when `visibleOnly`. */
export function exportableLayers(doc: Doc, visibleOnly: boolean): Array<{ id: ID; name: string }> {
  return hierarchy(doc, true).filter((e) => !e.layer.isGroup && !e.layer.adjustment && !!e.layer.raster && (e.visible || !visibleOnly)).map((e) => ({ id: e.layer.id, name: e.layer.name }));
}

/** `s` cut to its visible pixels, or null when nothing shows. */
export function trimSurface(s: Surface): Surface | null {
  const d = ctxOf(s).getImageData(0, 0, s.width, s.height).data;
  let left = s.width, top = s.height, right = -1, bottom = -1;
  for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) if (d[(y * s.width + x) * 4 + 3] !== 0) { if (x < left) left = x; if (x > right) right = x; if (y < top) top = y; bottom = y; }
  if (right < 0) return null;
  const w = right - left + 1, h = bottom - top + 1;
  if (w === s.width && h === s.height) return s;
  const out = createSurface(w, h);
  ctxOf(out).drawImage(s as CanvasImageSource, left, top, w, h, 0, 0, w, h);
  return out;
}

/** One picture as a file in `set.format`. JPEG is laid on white; the profile (the document's own, else sRGB for the
 *  formats that always carry one) is embedded when asked; TIFF and a tagged WebP are written by the engine. */
export async function encodeOne(engine: Engine, s: Surface, name: string, set: LayerExportSettings, engineUp: boolean): Promise<Blob> {
  const p = engine.current, doc = p?.doc as Doc, own = doc.profile;
  const icc = set.icc ? (own ? fromBase64(own.icc) : iccProfile('srgb')) : null, label = own && icc ? profileName(icc) : SPACES.srgb.label, dpi = doc.resolution ?? 72;
  if (set.format === 'psd') {
    const r = new Raster(s.width, s.height);
    r.ctx.drawImage(s as CanvasImageSource, 0, 0);
    r.touch();
    const one = newLayer(name, { width: s.width, height: s.height }, { raster: r, transform: docTransform(s.width, s.height) });
    const { bytes } = await writePsdFile({ ...doc, width: s.width, height: s.height, layers: [one], guides: [], comps: undefined, activeComp: undefined, ...(s.width !== doc.width || s.height !== doc.height ? { alphas: undefined, slices: undefined, notes: undefined } : {}) }, s, false, null);
    return new Blob([bytes], { type: 'image/vnd.adobe.photoshop' });
  }
  if (set.format === 'tiff-layers') {
    const r = new Raster(s.width, s.height);
    r.ctx.drawImage(s as CanvasImageSource, 0, 0);
    r.touch();
    const one = newLayer(name, { width: s.width, height: s.height }, { raster: r, transform: docTransform(s.width, s.height) });
    return (await writeLayeredTiff({ ...doc, width: s.width, height: s.height, layers: [one], guides: [], comps: undefined, activeComp: undefined, ...(s.width !== doc.width || s.height !== doc.height ? { alphas: undefined, slices: undefined, notes: undefined } : {}) }, s, null)).blob;
  }
  if (set.format === 'dpx') {
    if (!engineUp) throw new Error('DPX is written by the formvis engine, which is not running here. Choose PNG, JPEG or WebP.');
    const px = ctxOf(s).getImageData(0, 0, s.width, s.height).data, u16 = new Uint16Array(px.length);
    for (let i = 0; i < u16.length; i++) u16[i] = px[i] * 257;
    return api.encodeDpx(u16, s.width, s.height, { bits: set.dpxBits ?? 10, transfer: 'log', name });
  }
  if (set.format === 'jpg') {
    const c = createSurface(s.width, s.height), x = ctxOf(c);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, s.width, s.height); x.drawImage(s as CanvasImageSource, 0, 0);
    const jpg = await toBlob(c, 'image/jpeg', set.quality / 100);
    return icc ? embedJpeg(jpg, icc) : jpg;
  }
  const png = await toBlob(s, 'image/png');
  if (set.format === 'png') return icc ? embedPng(png, icc, label) : png;
  if (set.format === 'tiff') {
    if (!engineUp) throw new Error('TIFF is written by the formvis engine, which is not running here. Choose PNG, JPEG or WebP.');
    return api.encode(png, 'tiff', set.quality, dpi, icc);
  }
  if (set.format === 'bmp' || set.format === 'tga') {
    if (!engineUp) throw new Error(`${set.format.toUpperCase()} is written by the formvis engine, which is not running here. Choose PNG, JPEG or WebP.`);
    return api.encode(png, set.format, 100, dpi, null, { bits: set.format === 'tga' ? set.tgaBits ?? 32 : 32 });
  }
  if (icc && own && engineUp) return api.encode(png, 'webp', set.quality, dpi, icc);
  return toBlob(s, 'image/webp', set.quality / 100);
}

/** The files for the open document: every layer, or every artboard, drawn alone and encoded. `done` is told how many
 *  are finished so a long export can show it. Layers with nothing visible are skipped when trimming (nothing is left
 *  to write) and counted in `skipped`. */
export async function layerFiles(engine: Engine, set: LayerExportSettings, engineUp: boolean, done: (n: number, of: number) => void = () => undefined): Promise<{ files: Array<{ name: string; blob: Blob }>; skipped: number }> {
  const p = engine.current;
  if (!p) return { files: [], skipped: 0 };
  const prefix = set.prefix.trim() || p.name.replace(/\.[A-Za-z0-9]{1,8}$/, '') || 'Untitled';
  const only = set.ids?.length ? new Set(set.ids) : null;
  const jobs = (set.artboards ? engine.artboards(p).map((a) => ({ id: a.id, name: a.name })) : exportableLayers(p.doc, set.visibleOnly)).filter((j) => !only || only.has(j.id));
  const files: Array<{ name: string; blob: Blob }> = [];
  let skipped = 0;
  for (const [i, j] of jobs.entries()) {
    const img = set.artboards ? engine.artboardImage(j.id) : engine.renderLayerAlone(j.id);
    const cut = img && set.trim && !set.artboards ? trimSurface(img) : img;
    if (!cut) { skipped++; done(i + 1, jobs.length); continue; }
    files.push({ name: layerFileName(prefix, i, j.name, set.format), blob: await encodeOne(engine, cut, j.name, set, engineUp) });
    done(i + 1, jobs.length);
  }
  return { files, skipped };
}

/** Layer > Quick Export as PNG (and the quick format of Export Preferences): the selected layers, or the active one,
 *  each drawn alone with its effects and mask applied and written as `<layer name>.<ext>`; folders and layers with
 *  nothing visible are skipped and counted. */
export async function selectedLayerFiles(engine: Engine, format: LayerFileFormat, quality: number, engineUp: boolean): Promise<{ files: Array<{ name: string; blob: Blob; id: ID }>; skipped: number }> {
  const p = engine.current, files: Array<{ name: string; blob: Blob; id: ID }> = [], taken = new Set<string>();
  if (!p) return { files, skipped: 0 };
  const ids = p.selectedIds.size ? [...p.selectedIds] : p.activeId ? [p.activeId] : [], set: LayerExportSettings = { ...DEFAULT_LAYER_EXPORT, format, quality };
  let skipped = 0;
  for (const l of p.doc.layers.filter((x) => ids.includes(x.id) && !x.isGroup)) {
    const img = engine.renderLayerAlone(l.id);
    if (!img) { skipped++; continue; }
    let name = safeName(l.name), n = 1;
    while (taken.has(name.toLowerCase())) name = `${safeName(l.name)} ${++n}`;
    taken.add(name.toLowerCase());
    files.push({ name: `${name}.${layerFileExt(format)}`, blob: await encodeOne(engine, img, l.name, set, engineUp), id: l.id });
  }
  return { files, skipped };
}

/** File > Export > Layer Comps to Files (DEV_PLAN 33.3 part c): each comp (only `ids` when given, else all) applied in
 *  turn, the flattened document encoded as `<prefix>_NNNN_<comp>.<ext>`. Every applied comp is undone afterwards, so
 *  the document ends exactly as it started, as dataSetFiles does. */
export async function layerCompFiles(engine: Engine, set: LayerExportSettings, engineUp: boolean, ids: readonly ID[] = [], done: (n: number, of: number) => void = () => undefined): Promise<Array<{ name: string; blob: Blob }>> {
  const p = engine.current, all = p?.doc.comps ?? [], comps = ids.length ? all.filter((c) => ids.includes(c.id)) : all, files: Array<{ name: string; blob: Blob }> = [];
  if (!p || !comps.length) return files;
  const prefix = set.prefix.trim() || p.name.replace(/\.[A-Za-z0-9]{1,8}$/, '') || 'Untitled', base = safeName(prefix, 60, 'Untitled');
  let applied = 0;
  try {
    for (const [i, c] of comps.entries()) {
      engine.applyLayerComp(c.id);
      applied++;
      const img = engine.flattened();
      if (img) files.push({ name: layerFileName(prefix, i, c.name, set.format), blob: await encodeOne(engine, img, base, set, engineUp) });
      done(i + 1, comps.length);
    }
  } finally {
    for (let k = 0; k < applied; k++) engine.undo();
  }
  return files;
}

/** The default Data Sets as Files naming: the document, an underscore, the data set. */
export const DATA_SET_TEMPLATE = '{document}_{name}';

/** A data set file name from a template with {document}, {name} and {index} (counted from 1, four digits), cleaned for a
 *  file system; `taken` holds the names already used (lower case) and a repeat becomes `name 2`, `name 3`. */
export function dataSetFileName(template: string, documentName: string, setName: string, index: number, format: LayerFileFormat, taken: Set<string>): string {
  const text = (template.trim() || DATA_SET_TEMPLATE).replace(/\.[A-Za-z0-9]{1,5}$/, '')
    .replace(/\{document\}/gi, safeName(documentName, 60, 'Untitled')).replace(/\{name\}/gi, safeName(setName, 60, 'dataset')).replace(/\{index\}/gi, String(index).padStart(4, '0'));
  const stem = safeName(text, 120, 'dataset'), ext = layerFileExt(format);
  let name = stem, n = 1;
  while (taken.has(`${name}.${ext}`.toLowerCase())) name = `${stem} ${++n}`;
  taken.add(`${name}.${ext}`.toLowerCase());
  return `${name}.${ext}`;
}

/** File > Export > Data Sets as Files (DEV_PLAN 29.9 part b): each data set applied in turn, the flattened document
 *  encoded under a name from `template` (`<doc>_<dataset>` unless given; a repeated name is numbered so no file replaces
 *  another). Every applied set is undone afterwards, so the document ends as it started. */
export async function dataSetFiles(engine: Engine, format: LayerFileFormat, engineUp: boolean, done: (n: number, of: number) => void = () => undefined, template = DATA_SET_TEMPLATE): Promise<Array<{ name: string; blob: Blob }>> {
  const p = engine.current, sets = p?.doc.dataSets ?? [], files: Array<{ name: string; blob: Blob }> = [];
  if (!p || !sets.length) return files;
  const base = safeName(p.name.replace(/\.[A-Za-z0-9]{1,8}$/, ''), 60, 'Untitled'), set: LayerExportSettings = { ...DEFAULT_LAYER_EXPORT, format }, taken = new Set<string>();
  let applied = 0;
  try {
    for (const [i, d] of sets.entries()) {
      if (await engine.applyDataSet(d.name)) {
        applied++;
        const img = engine.flattened();
        if (img) files.push({ name: dataSetFileName(template, base, d.name, i + 1, format, taken), blob: await encodeOne(engine, img, base, set, engineUp) });
      }
      done(i + 1, sets.length);
    }
  } finally {
    for (let k = 0; k < applied; k++) engine.undo();
  }
  return files;
}
