import { Raster, ctxOf, createSurface, docTransform, hierarchy, newLayer, toBlob, type Doc, type Engine, type ID, type Surface } from '../engine';
import { SPACES, iccProfile } from '../engine/icc';
import { api } from './api';
import { embedJpeg, embedPng } from './embed-icc';
import { fromBase64, profileName } from './icc-read';
import { writePsdFile } from './psd';

/** File > Export > Layers to Files and Artboards to Files (DEV_PLAN 29.1): each layer (or artboard) drawn alone with
 *  its effects and mask applied, encoded through the same paths as Export As and returned as named files. */

export type LayerFileFormat = 'png' | 'jpg' | 'tiff' | 'webp' | 'psd';
export const LAYER_FILE_FORMATS: ReadonlyArray<readonly [LayerFileFormat, string]> = [['png', 'PNG'], ['jpg', 'JPEG'], ['tiff', 'TIFF'], ['webp', 'WebP'], ['psd', 'PSD']];
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
  /** One file per artboard instead of one per layer. */
  artboards: boolean;
}

export const DEFAULT_LAYER_EXPORT: LayerExportSettings = { prefix: '', visibleOnly: true, format: 'png', quality: 90, trim: false, icc: true, folder: '', artboards: false };

/** `text` reduced to letters, digits, space, dot, dash and underscore, runs of the rest made one underscore, at most
 *  `max` characters, never empty or starting with a dot. */
export function safeName(text: string, max = 60, fallback = 'layer'): string {
  const s = text.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ._-]+/g, '_').replace(/\.{2,}/g, '.').replace(/\s+/g, ' ').trim().replace(/^[._ ]+|[ .]+$/g, '').slice(0, max).trim();
  return s || fallback;
}

/** Photoshop's naming: the prefix, a four digit number counted from the top of the stack, the layer's name. */
export function layerFileName(prefix: string, n: number, name: string, format: LayerFileFormat): string {
  return `${safeName(prefix, 60, 'Untitled')}_${String(n).padStart(4, '0')}_${safeName(name)}.${format === 'tiff' ? 'tif' : format}`;
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
async function encodeOne(engine: Engine, s: Surface, name: string, set: LayerExportSettings, engineUp: boolean): Promise<Blob> {
  const p = engine.current, doc = p?.doc as Doc, own = doc.profile;
  const icc = set.icc ? (own ? fromBase64(own.icc) : iccProfile('srgb')) : null, label = own && icc ? profileName(icc) : SPACES.srgb.label, dpi = doc.resolution ?? 72;
  if (set.format === 'psd') {
    const r = new Raster(s.width, s.height);
    r.ctx.drawImage(s as CanvasImageSource, 0, 0);
    r.touch();
    const one = newLayer(name, { width: s.width, height: s.height }, { raster: r, transform: docTransform(s.width, s.height) });
    const { bytes } = await writePsdFile({ ...doc, width: s.width, height: s.height, layers: [one], guides: [] }, s, false, null);
    return new Blob([bytes], { type: 'image/vnd.adobe.photoshop' });
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
  const jobs = set.artboards ? engine.artboards(p).map((a) => ({ id: a.id, name: a.name })) : exportableLayers(p.doc, set.visibleOnly);
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
