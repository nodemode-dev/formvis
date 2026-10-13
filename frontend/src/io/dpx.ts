import { composeDeep, deepToU16, linearToSrgb } from '../engine/deep';
import { ctxOf, type Engine } from '../engine';
import { api } from './api';
import type { ExportSettings } from './export-presets';

/** File > Export > DPX (DEV_PLAN 28.2): the document as a film scan with the bit depth and transfer the export options
 *  chose. A 16-bit document goes out from its floats, a 32-bit one is encoded from linear light, an 8-bit one from the
 *  canvas the person sees; the engine writes the header's transfer characteristic and the data to match. */
export async function dpxBlob(engine: Engine, s: ExportSettings): Promise<Blob | null> {
  const p = engine.current;
  if (!p) return null;
  let width: number, height: number, u16: Uint16Array;
  if ((p.doc.depth ?? 8) > 8) {
    const deep = composeDeep(p.doc);
    if ('error' in deep) throw new Error(deep.error);
    width = deep.width; height = deep.height;
    const data = deep.data;
    if (p.doc.depth === 32) { const enc = new Float32Array(data); for (let i = 0; i < enc.length; i += 4) for (let c = 0; c < 3; c++) enc[i + c] = linearToSrgb(Math.max(0, enc[i + c])); u16 = deepToU16(enc); } else u16 = deepToU16(data);
  } else {
    const flat = engine.flattened();
    if (!flat) return null;
    const img = ctxOf(flat).getImageData(0, 0, flat.width, flat.height);
    width = flat.width; height = flat.height;
    u16 = new Uint16Array(img.data.length);
    for (let i = 0; i < u16.length; i++) u16[i] = img.data[i] * 257;
  }
  return api.encodeDpx(u16, width, height, { bits: s.dpxBits ?? 10, transfer: s.dpxTransfer ?? 'log', name: p.name || 'Untitled' });
}
