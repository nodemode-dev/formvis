import type { CameraData } from '../engine/doc-meta';

/** Reading a camera's record out of a picture (File Info, DEV_PLAN 29.2): the Exif block of a JPEG (APP1), PNG (eXIf),
 *  WebP (EXIF) or TIFF is a TIFF-structured block; its first directory holds Make, Model and the pointer to the Exif
 *  directory, which holds the exposure, aperture, ISO, focal length, lens and the date the shutter fired. Every read is
 *  bounds-checked; a block that does not parse yields nothing. */

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

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
