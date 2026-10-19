import type { CameraData } from '../engine/doc-meta';
import { fromBase64 } from './icc-read';

/** Reading a camera's record out of a picture (File Info, DEV_PLAN 29.2): the Exif block of a JPEG (APP1), PNG (eXIf),
 *  WebP (EXIF) or TIFF is a TIFF-structured block; its first directory holds Make, Model and the pointer to the Exif
 *  directory, which holds the exposure, aperture, ISO, focal length, lens and the date the shutter fired. Every read is
 *  bounds-checked; a block that does not parse yields nothing. */

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

export const exposureText = (seconds: number): string => (seconds >= 1 ? String(Number(seconds.toFixed(1))) : `1/${Math.max(1, Math.round(1 / seconds))}`);
export const roundText = (v: number): string => String(Number(v.toFixed(1)));

/** A rational such as `28/10` or a plain number as a number; NaN when it is neither. */
export function rationalOf(s: string): number {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/.exec(s);
  if (m) return Number(m[2]) ? Number(m[1]) / Number(m[2]) : NaN;
  return Number(s);
}

/** An Exif date, `2024:05:01 12:30:00`, as ISO local time `2024-05-01T12:30:00`. */
export function isoOfExifDate(s: string): string | undefined {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : undefined;
}

/** The camera data in a TIFF-structured block (starting at its `II` or `MM` header), or null when there is none. */
export function cameraFromTiff(b: Uint8Array): CameraData | null {
  try {
    const le = b[0] === 0x49 && b[1] === 0x49;
    if (!le && !(b[0] === 0x4d && b[1] === 0x4d)) return null;
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    if (dv.getUint16(2, le) !== 42) return null;
    interface Entry { type: number; count: number; at: number }
    const directory = (off: number): Map<number, Entry> => {
      const out = new Map<number, Entry>(), n = Math.min(dv.getUint16(off, le), 500);
      for (let i = 0; i < n; i++) {
        const o = off + 2 + i * 12, type = dv.getUint16(o + 2, le), count = dv.getUint32(o + 4, le), size = (TYPE_SIZE[type] ?? 1) * count;
        out.set(dv.getUint16(o, le), { type, count, at: size > 4 ? dv.getUint32(o + 8, le) : o + 8 });
      }
      return out;
    };
    const text = (e: Entry | undefined): string | undefined => {
      if (!e || e.type !== 2 || e.count < 1 || e.at + e.count > b.length) return undefined;
      const s = new TextDecoder().decode(b.subarray(e.at, e.at + e.count)).replace(/\u0000.*$/s, '').trim();
      return s || undefined;
    };
    const rational = (e: Entry | undefined): number => {
      if (!e || e.type !== 5 || e.count < 1 || e.at + 8 > b.length) return NaN;
      const d = dv.getUint32(e.at + 4, le);
      return d ? dv.getUint32(e.at, le) / d : NaN;
    };
    const short = (e: Entry | undefined): number => (e && e.type === 3 && e.count >= 1 ? dv.getUint16(e.at, le) : NaN);
    const main = directory(dv.getUint32(4, le));
    const pointer = main.get(34665), exif = pointer ? directory(dv.getUint32(pointer.at, le)) : new Map<number, Entry>();
    const out: CameraData = {};
    const make = text(main.get(271)), model = text(main.get(272)), lens = text(exif.get(42036)), date = text(exif.get(36867)) ?? text(exif.get(36868)) ?? text(main.get(306));
    if (make) out.make = make;
    if (model) out.model = model;
    if (lens) out.lens = lens;
    const exposure = rational(exif.get(33434)), aperture = rational(exif.get(33437)), iso = short(exif.get(34855)), focal = rational(exif.get(37386));
    if (exposure > 0 && Number.isFinite(exposure)) out.exposure = exposureText(exposure);
    if (aperture > 0 && Number.isFinite(aperture)) out.aperture = roundText(aperture);
    if (iso > 0) out.iso = String(iso);
    if (focal > 0 && Number.isFinite(focal)) out.focalLength = roundText(focal);
    const iso8601 = date ? isoOfExifDate(date) : undefined;
    if (iso8601) out.dateTaken = iso8601;
    return Object.keys(out).length ? out : null;
  } catch { return null; }
}

interface Ent { tag: number; type: number; count: number; data: Uint8Array }

const asciiBytes = (s: string): Uint8Array => { const t = new TextEncoder().encode(s.replace(/[^ -~]/g, '?')); const out = new Uint8Array(t.length + 1); out.set(t); return out; };
const rationalBytes = (v: number): Uint8Array => {
  const out = new Uint8Array(8), dv = new DataView(out.buffer);
  const [n, d] = v >= 1 ? [Math.round(v * 100), 100] : [1, Math.max(1, Math.round(1 / v))];
  dv.setUint32(0, n, true); dv.setUint32(4, d, true);
  return out;
};
const ifdSize = (es: Ent[]): number => 2 + es.length * 12 + 4 + es.reduce((n, e) => n + (e.data.length > 4 ? (e.data.length + 1) & ~1 : 0), 0);

function putIfd(out: Uint8Array, at: number, es: Ent[]): void {
  const dv = new DataView(out.buffer);
  let data = at + 2 + es.length * 12 + 4;
  dv.setUint16(at, es.length, true);
  es.forEach((e, i) => {
    const o = at + 2 + i * 12;
    dv.setUint16(o, e.tag, true); dv.setUint16(o + 2, e.type, true); dv.setUint32(o + 4, e.count, true);
    if (e.data.length > 4) { dv.setUint32(o + 8, data, true); out.set(e.data, data); data += (e.data.length + 1) & ~1; }
    else out.set(e.data, o + 8);
  });
}

/** A little-endian Exif block (a TIFF-structured block, as a PSD's resource 1058 and a TIFF's Exif directory hold it)
 *  built from the camera record: Make and Model, then exposure, aperture, ISO, focal length, lens and date taken. */
export function buildExifBlock(c: CameraData): Uint8Array | null {
  const long = (v: number): Uint8Array => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v, true); return b; };
  const short = (v: number): Uint8Array => { const b = new Uint8Array(4); new DataView(b.buffer).setUint16(0, v, true); return b; };
  const zero = long(0), main: Ent[] = [], exif: Ent[] = [];
  const text = (list: Ent[], tag: number, s: string | undefined): void => { if (s) { const d = asciiBytes(s); list.push({ tag, type: 2, count: d.length, data: d }); } };
  const num = (s: string | undefined): number => (s ? rationalOf(s) : NaN);
  text(main, 271, c.make); text(main, 272, c.model);
  const exposure = num(c.exposure), aperture = num(c.aperture), focal = num(c.focalLength), iso = Number(c.iso);
  if (exposure > 0) exif.push({ tag: 33434, type: 5, count: 1, data: rationalBytes(exposure) });
  if (aperture > 0) exif.push({ tag: 33437, type: 5, count: 1, data: rationalBytes(aperture) });
  if (iso > 0 && iso < 65536) exif.push({ tag: 34855, type: 3, count: 1, data: short(iso) });
  const when = c.dateTaken && /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/.exec(c.dateTaken);
  if (when) text(exif, 36867, `${when[1]}:${when[2]}:${when[3]} ${when[4]}:${when[5]}:${when[6]}`);
  if (focal > 0) exif.push({ tag: 37386, type: 5, count: 1, data: rationalBytes(focal) });
  text(exif, 42036, c.lens);
  if (!main.length && !exif.length) return null;
  if (exif.length) main.push({ tag: 34665, type: 4, count: 1, data: zero });
  main.sort((a, b) => a.tag - b.tag);
  const exifAt = 8 + ifdSize(main), out = new Uint8Array(exif.length ? exifAt + ifdSize(exif) : exifAt), dv = new DataView(out.buffer);
  out[0] = 0x49; out[1] = 0x49; dv.setUint16(2, 42, true); dv.setUint32(4, 8, true);
  const pointer = main.find((e) => e.tag === 34665);
  if (pointer) pointer.data = long(exifAt);
  putIfd(out, 8, main);
  if (exif.length) putIfd(out, exifAt, exif);
  return out;
}

/** A little-endian Exif block moved to start at file offset `base`: the Exif, GPS and Interoperability directories copied
 *  with their out-of-line offsets and pointers shifted by `base`, and the IFD0 entries a TIFF page repeats (Make, Model and
 *  the two pointers) as four-byte values. Null for a block in the other byte order or one that does not parse. */
export function exifForTiff(block: Uint8Array, base: number): { bytes: Uint8Array; entries: Array<{ tag: number; type: number; count: number; value: Uint8Array }> } | null {
  try {
    if (block[0] !== 0x49 || block[1] !== 0x49) return null;
    const out = block.slice(), dv = new DataView(out.buffer);
    if (dv.getUint16(2, true) !== 42) return null;
    const entries: Array<{ tag: number; type: number; count: number; value: Uint8Array }> = [];
    const walk = (off: number, top: boolean, depth: number): void => {
      if (depth > 3 || off + 2 > out.length) return;
      const n = Math.min(dv.getUint16(off, true), 500);
      for (let i = 0; i < n; i++) {
        const o = off + 2 + i * 12, tag = dv.getUint16(o, true), type = dv.getUint16(o + 2, true), count = dv.getUint32(o + 4, true), size = (TYPE_SIZE[type] ?? 1) * count;
        const pointer = tag === 34665 || tag === 34853 || tag === 40965, target = dv.getUint32(o + 8, true);
        if (top) {
          if (tag === 271 || tag === 272) entries.push({ tag, type, count, value: size > 4 ? u32le(target + base) : out.slice(o + 8, o + 12) });
          else if (pointer) { entries.push({ tag, type: 4, count: 1, value: u32le(target + base) }); walk(target, false, depth + 1); }
          continue;
        }
        if (pointer) { walk(target, false, depth + 1); dv.setUint32(o + 8, target + base, true); }
        else if (size > 4) dv.setUint32(o + 8, target + base, true);
      }
    };
    walk(dv.getUint32(4, true), true, 0);
    return entries.length ? { bytes: out, entries } : null;
  } catch { return null; }
}

/** The Exif block a document carries: the picture's own when it came with one, else one built from the camera record. */
export function exifBlockOf(meta: { exif?: string; camera?: CameraData } | undefined): Uint8Array | null {
  if (!meta) return null;
  if (meta.exif) { try { return fromBase64(meta.exif); } catch { /* damaged; the camera record below */ } }
  return meta.camera ? buildExifBlock(meta.camera) : null;
}

const u32le = (v: number): Uint8Array =>{ const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v, true); return b; };
