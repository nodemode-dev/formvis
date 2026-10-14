import type { VectorPath } from '../engine/paths';
import { pathFromRecords } from './psd-paths';

/** Photoshop custom shape files (.csh), read only: '8BCS', u32 version, u32 count, then per shape a u32 name length in
 *  UTF-16 units and the UTF-16BE name (padded to 4 bytes or not, both are tried), u32 zero, u32 data length, and the data:
 *  a 37-byte id, the bounds (top, left, bottom, right as u32), then 26-byte Photoshop path records (the vector mask
 *  records psd-paths reads). Anything inconsistent skips that shape. */

export interface CshShape { name: string; path: VectorPath }

const ID_LEN = 37, BOUNDS_LEN = 16, RECORD = 26;
const align4 = (n: number): number => (n + 3) & ~3;

function shapeFrom(bytes: Uint8Array, dv: DataView, start: number, end: number, name: string): CshShape | null {
  const b = start + ID_LEN;
  const top = dv.getUint32(b), left = dv.getUint32(b + 4), bottom = dv.getUint32(b + 8), right = dv.getUint32(b + 12);
  const w = right - left, h = bottom - top;
  if (!(w > 0 && h > 0)) return null;
  const from = b + BOUNDS_LEN, count = Math.floor((end - from) / RECORD);
  if (count < 1) return null;
  const path = pathFromRecords(bytes.subarray(from, from + count * RECORD), w, h);
  return path.subpaths.length ? { name, path } : null;
}

/** One shape at `at`: null when the structure does not hold together there, otherwise the shape (null if unusable) and where it ends. */
function readShape(bytes: Uint8Array, dv: DataView, at: number): { shape: CshShape | null; end: number } | null {
  const total = bytes.byteLength;
  if (at + 4 > total) return null;
  const n = dv.getUint32(at);
  if (n > 1024 || at + 4 + n * 2 > total) return null;
  let name = '';
  for (let i = 0; i < n; i += 1) name += String.fromCharCode(dv.getUint16(at + 4 + i * 2));
  name = name.replace(/\0+$/, '');
  const after = at + 4 + n * 2;
  for (const p of [after, align4(after)]) {
    if (p + 8 > total || dv.getUint32(p) !== 0) continue;
    const len = dv.getUint32(p + 4), start = p + 8, end = start + len;
    if (len < ID_LEN + BOUNDS_LEN || end > total) continue;
    return { shape: shapeFrom(bytes, dv, start, end, name), end };
  }
  return null;
}

/** Reads a .csh. `skipped` counts shapes that could not be read; a broken shape header ends the file, since the rest cannot be located. */
export function readCsh(buf: ArrayBuffer): { shapes: CshShape[]; skipped: number } {
  const bytes = new Uint8Array(buf), dv = new DataView(buf);
  if (bytes.byteLength < 12 || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== '8BCS') throw new Error('Not a Photoshop custom shape (.csh) file.');
  const count = Math.min(dv.getUint32(8), 100000);
  const shapes: CshShape[] = [];
  let skipped = 0, at = 12;
  for (let i = 0; i < count; i += 1) {
    const got = readShape(bytes, dv, at) ?? (align4(at) !== at ? readShape(bytes, dv, align4(at)) : null);
    if (!got) { skipped += count - i; break; }
    if (got.shape) shapes.push({ name: got.shape.name || `Shape ${shapes.length + 1}`, path: got.shape.path });
    else skipped += 1;
    at = got.end;
  }
  return { shapes, skipped };
}
