import { customContourId, customContourPoints, type ContourPoint } from '../engine/style-extras';

/** Contour files (.shc): u16 version, u16 count, then per contour a name (u32 length in UTF-16 units, then UTF-16BE), a
 *  u16 point count, and per point u16 vertical, u16 horizontal (both 0 to 255, the output and the input of the curve, as
 *  the Hrzn and Vrtc of a layer style's Crv descriptor are) and a u8 corner flag. formvis curves are smooth, so the flag is
 *  written 0 and read past. A broken contour ends the file, since the rest cannot be located. */

export interface ShcContour { name: string; points: ContourPoint[] }

const VERSION = 1, MAX_POINTS = 32, MAX_NAME = 1024;
const level = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 255);

export function writeShc(contours: ReadonlyArray<ShcContour>): Uint8Array {
  const out: number[] = [VERSION >> 8, VERSION & 255, contours.length >> 8, contours.length & 255];
  const u32 = (v: number): void => { out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); };
  for (const c of contours) {
    const name = c.name.slice(0, MAX_NAME - 1), pts = [...c.points].sort((a, b) => a.x - b.x);
    u32(name.length + 1);
    for (let i = 0; i < name.length; i += 1) { const u = name.charCodeAt(i); out.push(u >> 8, u & 255); }
    out.push(0, 0, pts.length >> 8, pts.length & 255);
    for (const p of pts) { const y = level(p.y), x = level(p.x); out.push(y >> 8, y & 255, x >> 8, x & 255, 0); }
  }
  return new Uint8Array(out);
}

/** Reads a .shc. `skipped` counts contours that could not be read or have fewer than two points. */
export function readShc(buf: ArrayBuffer): { contours: ShcContour[]; skipped: number } {
  const dv = new DataView(buf), total = buf.byteLength;
  if (total < 4 || dv.getUint16(0) < 1 || dv.getUint16(0) > 16) throw new Error('Not a .shc contour file.');
  const count = dv.getUint16(2), contours: ShcContour[] = [];
  let skipped = 0, at = 4;
  for (let i = 0; i < count; i += 1) {
    if (at + 4 > total) { skipped += count - i; break; }
    const n = dv.getUint32(at);
    if (n > MAX_NAME || at + 4 + n * 2 + 2 > total) { skipped += count - i; break; }
    let name = '';
    for (let k = 0; k < n; k += 1) name += String.fromCharCode(dv.getUint16(at + 4 + k * 2));
    name = name.replace(/\0+$/, '');
    const cursor = at + 4 + n * 2, m = dv.getUint16(cursor), end = cursor + 2 + m * 5;
    if (end > total) { skipped += count - i; break; }
    const raw: ContourPoint[] = [];
    for (let k = 0; k < m; k += 1) {
      const p = cursor + 2 + k * 5;
      raw.push({ x: Math.min(255, dv.getUint16(p + 2)) / 255, y: Math.min(255, dv.getUint16(p)) / 255 });
    }
    at = end;
    raw.sort((a, b) => a.x - b.x);
    const pts = raw.length > MAX_POINTS ? Array.from({ length: MAX_POINTS }, (_, k) => raw[Math.round(k * (raw.length - 1) / (MAX_POINTS - 1))]) : raw;
    if (pts.length < 2) { skipped += 1; continue; }
    contours.push({ name: name || `Contour ${contours.length + 1}`, points: customContourPoints(customContourId(pts)) ?? pts });
  }
  return { contours, skipped };
}
