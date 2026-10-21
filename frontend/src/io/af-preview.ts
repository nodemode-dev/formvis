import { Raster, newLayer, uid, docTransform, type BlendMode, type Doc, type ID, type Layer } from '../engine';
import { readAfModel, type AfBitmap, type AfLayer, type AfModel, type Mat } from './af-read';

/** .af, .afphoto, .afdesign and .afpub files (DEV_PLAN 34.6, PC-IO-0032): a proprietary, undocumented container that
 *  starts with the bytes 00 FF 4B 41. `af-read.ts` reads its raster layers (pixels, name, position, opacity, visibility,
 *  blend mode, groups) so it opens as a layered document; vector shapes, text, live filters, adjustments, masks and
 *  effects are not read and are listed in the notes. The preview image (a PNG, in some versions a JPEG) embedded in the
 *  file stays the way in when no layer can be read, and rides along as a hidden layer when some were left out. */
export const isAfFile = (f: File): boolean => /\.(af|afphoto|afdesign|afpub)$/i.test(f.name);

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const matchesAt = (b: Uint8Array, at: number, sig: number[]): boolean => {
  if (at + sig.length > b.length) return false;
  for (let i = 0; i < sig.length; i++) if (b[at + i] !== sig[i]) return false;
  return true;
};

/** The end offset of the PNG starting at `start`, found by walking its chunks to IEND; -1 if it is cut off. */
function pngEnd(b: Uint8Array, start: number): number {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = start + 8;
  while (p + 12 <= b.length) {
    const len = view.getUint32(p, false);
    const isEnd = b[p + 4] === 0x49 && b[p + 5] === 0x45 && b[p + 6] === 0x4e && b[p + 7] === 0x44;
    const next = p + 12 + len;
    if (next > b.length) return -1;
    if (isEnd) return next;
    p = next;
  }
  return -1;
}

/** Every embedded PNG and JPEG, as byte ranges. */
function findImages(b: Uint8Array): { blob: Blob }[] {
  const found: { blob: Blob }[] = [];
  for (let i = 0; i + 8 <= b.length; i++) {
    if (b[i] === 0x89 && matchesAt(b, i, PNG_SIG)) {
      const end = pngEnd(b, i);
      if (end > 0) { found.push({ blob: new Blob([b.slice(i, end)], { type: 'image/png' }) }); i = end - 1; }
    } else if (b[i] === 0xff && b[i + 1] === 0xd8 && b[i + 2] === 0xff) {
      let end = -1;
      for (let j = i + 3; j + 1 < b.length; j++) {
        if (b[j] === 0xff && b[j + 1] === 0xd9) { end = j + 2; break; }
      }
      if (end > 0) { found.push({ blob: new Blob([b.slice(i, end)], { type: 'image/jpeg' }) }); i = end - 1; }
    }
  }
  return found;
}

async function largestPreview(bytes: Uint8Array): Promise<ImageBitmap | null> {
  let best: ImageBitmap | null = null;
  for (const c of findImages(bytes)) {
    let bmp: ImageBitmap;
    try { bmp = await createImageBitmap(c.blob); } catch { continue; }   // a stray signature inside other data
    if (!best || bmp.width * bmp.height > best.width * best.height) { best?.close(); best = bmp; } else bmp.close();
  }
  return best;
}

async function decodeSource(bytes: Uint8Array): Promise<AfBitmap | null> {
  try {
    const bmp = await createImageBitmap(new Blob([bytes as BlobPart]));
    const r = new Raster(bmp.width, bmp.height);
    r.ctx.drawImage(bmp, 0, 0);
    bmp.close();
    const d = r.read();
    return { width: d.width, height: d.height, rgba: d.data };
  } catch { return null; }
}

const AF_BLEND: Record<number, BlendMode> = {
  0: 'normal', 1: 'darken', 2: 'multiply', 3: 'color-burn', 4: 'lighten', 5: 'screen', 6: 'color-dodge', 7: 'linear-dodge', 8: 'overlay', 9: 'soft-light',
  10: 'hard-light', 11: 'vivid-light', 12: 'pin-light', 13: 'hard-mix', 14: 'difference', 15: 'exclusion', 16: 'subtract', 17: 'hue', 18: 'saturation', 19: 'luminosity', 20: 'color',
};

export function afBlend(b: { id: number; ver: number } | null, name: string, notes: string[]): BlendMode {
  if (!b) return 'normal';
  if (b.id === 2 && b.ver !== 0) return 'darker-color';
  if (b.id === 6 && b.ver !== 0) return 'lighter-color';
  if (b.id === 15 && b.ver !== 0) return 'linear-light';
  const m = AF_BLEND[b.id];
  if (!m) notes.push(`"${name}" uses a blend mode formvis does not have; it opened as Normal.`);
  return m ?? 'normal';
}

/** A bitmap placed through its layer transform: a plain shift keeps every pixel as stored, anything else is drawn through the matrix. */
function placeBitmap(bm: AfBitmap, map: Mat, W: number, H: number): { raster: Raster; x: number; y: number } | null {
  const src = new Raster(bm.width, bm.height);
  src.write(new ImageData(bm.rgba as Uint8ClampedArray<ArrayBuffer>, bm.width, bm.height));
  const shift = Math.abs(map[0] - 1) < 1e-9 && Math.abs(map[4] - 1) < 1e-9 && Math.abs(map[1]) < 1e-9 && Math.abs(map[3]) < 1e-9
    && Math.abs(map[2] - Math.round(map[2])) < 1e-6 && Math.abs(map[5] - Math.round(map[5])) < 1e-6;
  const xs = [0, bm.width, 0, bm.width].map((u, i) => map[0] * u + map[1] * (i < 2 ? 0 : bm.height) + map[2]);
  const ys = [0, bm.width, 0, bm.width].map((u, i) => map[3] * u + map[4] * (i < 2 ? 0 : bm.height) + map[5]);
  if (![...xs, ...ys].every((v) => Number.isFinite(v) && Math.abs(v) < 1 << 24)) return null;
  let x0 = Math.floor(Math.min(...xs) + 1e-6), y0 = Math.floor(Math.min(...ys) + 1e-6), x1 = Math.ceil(Math.max(...xs) - 1e-6), y1 = Math.ceil(Math.max(...ys) - 1e-6);
  if ((x1 - x0) * (y1 - y0) > 4 * W * H || x1 - x0 > 16384 || y1 - y0 > 16384) { x0 = Math.max(x0, 0); y0 = Math.max(y0, 0); x1 = Math.min(x1, W); y1 = Math.min(y1, H); }
  if (x1 <= x0 || y1 <= y0) return null;
  if (shift && x0 === map[2] && y0 === map[5] && x1 - x0 === bm.width && y1 - y0 === bm.height) return { raster: src, x: x0, y: y0 };
  const out = new Raster(x1 - x0, y1 - y0);
  out.ctx.setTransform(map[0], map[3], map[1], map[4], map[2] - x0, map[5] - y0);
  out.ctx.imageSmoothingEnabled = !shift;
  out.ctx.drawImage(src.canvas as CanvasImageSource, 0, 0);
  out.ctx.setTransform(1, 0, 0, 1, 0, 0);
  out.touch();
  return { raster: out, x: x0, y: y0 };
}

function layersOf(model: AfModel, notes: string[]): Layer[] {
  const size = { width: model.width, height: model.height };
  const out: Layer[] = [];
  const add = (a: AfLayer, parentId: ID | null, clipId: ID | null): Layer | null => {
    const common = { visible: a.visible, opacity: a.opacity, parentId, ...(clipId ? { clipId } : {}) };
    if (a.kind === 'group') {
      const blend = afBlend(a.blend, a.name, notes);
      const group = newLayer(a.name, size, { ...common, isGroup: true, blend, ...(!a.blend && a.isolated ? { isolate: true } : {}) });
      for (const c of a.children ?? []) add(c, group.id, null);
      out.push(group);
      return group;
    }
    const placed = a.bitmap ? placeBitmap(a.bitmap, a.map, model.width, model.height) : null;
    if (!placed) { notes.push(`"${a.name}" lies outside the canvas or is too large; it was left out.`); return null; }
    const layer = newLayer(a.name, size, { ...common, raster: placed.raster, blend: afBlend(a.blend, a.name, notes), transform: { ...docTransform(placed.raster.width, placed.raster.height), x: placed.x, y: placed.y } });
    out.push(layer);
    for (const c of a.clipped ?? []) add(c, parentId, layer.id);
    return layer;
  };
  for (const a of model.layers) add(a, null, null);
  return out;
}

export async function readAf(file: File): Promise<{ doc: Doc; notes: string[]; activeId: ID | null; paths: null }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!matchesAt(bytes, 0, [0x00, 0xff, 0x4b, 0x41])) throw new Error('That is not an .af, .afphoto, .afdesign or .afpub file.');
  const name = file.name.replace(/\.(af|afphoto|afdesign|afpub)$/i, '') || 'Untitled';
  let model: AfModel | null = null;
  try { model = await readAfModel(bytes, decodeSource); } catch { model = null; }
  const preview = !model || model.rasterCount === 0 || model.leftOut.length ? await largestPreview(bytes) : null;
  if (!model || model.rasterCount === 0) {
    if (!preview) throw new Error('This file carries no preview formvis can read.');
    const W = preview.width, H = preview.height;
    const doc: Doc = { id: uid(), width: W, height: H, resolution: 72, layers: [] };
    const raster = new Raster(W, H);
    raster.ctx.drawImage(preview, 0, 0); preview.close(); raster.touch();
    const layer = newLayer(name, doc, { raster });
    doc.layers = [layer];
    const left = model?.leftOut.length ? ` It holds ${model.leftOut.length} layer${model.leftOut.length === 1 ? '' : 's'} formvis does not read (${summarize(model.leftOut)}).` : '';
    return { doc, notes: [`No raster layers could be read from this file; this is the preview it carries, ${W} by ${H}.${left}`], activeId: layer.id, paths: null };
  }
  const notes: string[] = [...model.notes];
  const layers = layersOf(model, notes);
  const doc: Doc = { id: uid(), width: model.width, height: model.height, resolution: 72, layers: [] };
  if (preview) {
    const raster = new Raster(doc.width, doc.height);
    raster.ctx.drawImage(preview, 0, 0, doc.width, doc.height); preview.close(); raster.touch();
    layers.unshift(newLayer('Preview (flattened)', doc, { raster, visible: false }));
  }
  doc.layers = layers;
  if (model.leftOut.length) notes.push(`Left out, not read from the file: ${summarize(model.leftOut)}.${preview ? ' The file\'s own flattened preview is kept as the hidden layer "Preview (flattened)".' : ''}`);
  const top = [...layers].reverse().find((l) => !l.isGroup && l.raster && l.visible);
  return { doc, notes, activeId: top?.id ?? layers[layers.length - 1]?.id ?? null, paths: null };
}

function summarize(list: readonly { name: string; what: string }[]): string {
  const shown = list.slice(0, 8).map((l) => `"${l.name}" (${l.what})`).join(', ');
  return list.length > 8 ? `${shown}, and ${list.length - 8} more` : shown;
}
