import { composeDeep, deepToU16, linearToSrgb } from '../engine/deep';
import type { Engine } from '../engine';
import { api } from './api';
import type { ExportSettings } from './export-presets';
import { formatOptions } from './export-presets';

/** File > Export As > PNM from a 16 or 32-bit document (DEV_PLAN 34.1): the document's own floats written as 16-bit
 *  PBM, PGM, PPM or PAM, so a 16-bit PGM opened and exported keeps its 16 bits. A 32-bit document is encoded from
 *  linear light to sRGB first. Null for an 8-bit document, which goes the ordinary way at 8 bits. */
export async function pnmDeepBlob(engine: Engine, s: ExportSettings): Promise<Blob | null> {
  const p = engine.current;
  if (!p || (p.doc.depth ?? 8) <= 8) return null;
  const deep = composeDeep(p.doc);
  if ('error' in deep) throw new Error(deep.error);
  let data = deep.data;
  if (p.doc.depth === 32) { const enc = new Float32Array(data); for (let i = 0; i < enc.length; i += 4) for (let c = 0; c < 3; c++) enc[i + c] = linearToSrgb(Math.max(0, enc[i + c])); data = enc; }
  return api.encodePnm(deepToU16(data), deep.width, deep.height, String(formatOptions(s).kind ?? 'ppm'));
}
