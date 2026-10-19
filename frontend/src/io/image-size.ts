/** A picture's size from its file's header, without decoding it (1.52.7): PNG, JPEG, WebP, GIF and BMP; null when the
 *  header is not one of these (the picture is then decoded as before). */
export async function headerSize(file: Blob): Promise<{ width: number; height: number } | null> {
  const b = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer()), v = new DataView(b.buffer);
  const at = (i: number, s: string): boolean => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));
  if (b.length >= 24 && b[0] === 0x89 && at(1, 'PNG') && at(12, 'IHDR')) return { width: v.getUint32(16), height: v.getUint32(20) };
  if (b.length >= 10 && at(0, 'GIF8')) return { width: v.getUint16(6, true), height: v.getUint16(8, true) };
  if (b.length >= 26 && at(0, 'BM')) return { width: Math.abs(v.getInt32(18, true)), height: Math.abs(v.getInt32(22, true)) };
  if (b.length >= 30 && at(0, 'RIFF') && at(8, 'WEBP')) {
    if (at(12, 'VP8X')) return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    if (at(12, 'VP8L')) { const bits = v.getUint32(21, true); return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }; }
    if (at(12, 'VP8 ')) return { width: v.getUint16(26, true) & 0x3fff, height: v.getUint16(28, true) & 0x3fff };
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1], len = v.getUint16(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { width: v.getUint16(i + 7), height: v.getUint16(i + 5) };   // a start of frame
      i += 2 + len;
    }
  }
  return null;
}

/** Whether a PNG or JPEG file could really hold a picture of the size its header declares (PC-IO-0203): deflate cannot
 *  shrink bytes more than 1032 to 1 and a JPEG block of 64 pixels takes at least a few bits, so a small file that
 *  declares a vast picture is damaged or built to exhaust memory. Returns the reason, or null when plausible. */
export async function implausibleSize(file: Blob, size: { width: number; height: number }): Promise<string | null> {
  const b = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const px = size.width * size.height;
  if (b.length >= 26 && b[0] === 0x89 && b[1] === 0x50) {
    const channels = [1, 0, 3, 1, 2, 0, 4][b[25]] ?? 4, bits = b[24] * channels, raw = size.height * (Math.ceil(size.width * bits / 8) + 1);
    return raw > file.size * 1100 ? `The file is only ${Math.ceil(file.size / 1024).toLocaleString()} KB but declares a ${size.width} by ${size.height} picture, more than a PNG of that size can hold. It is damaged or not a real picture.` : null;
  }
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xd8) {
    return px > file.size * 4000 ? `The file is only ${Math.ceil(file.size / 1024).toLocaleString()} KB but declares a ${size.width} by ${size.height} picture, more than a JPEG of that size can hold. It is damaged or not a real picture.` : null;
  }
  return null;
}

type Reader = (at: number, len: number) => Promise<Uint8Array>;

/** XResolution in pixels per inch from the first directory of a TIFF structure; `read` fetches bytes by offset. */
async function tiffResolution(read: Reader): Promise<number | null> {
  const head = await read(0, 8);
  if (head.length < 8) return null;
  const le = head[0] === 0x49 && head[1] === 0x49;
  if (!le && !(head[0] === 0x4d && head[1] === 0x4d)) return null;
  const hv = new DataView(head.buffer, head.byteOffset, head.byteLength);
  if (hv.getUint16(2, le) !== 42) return null;
  const ifd = hv.getUint32(4, le), cb = await read(ifd, 2);
  if (cb.length < 2) return null;
  const count = new DataView(cb.buffer, cb.byteOffset, 2).getUint16(0, le);
  if (!count || count > 512) return null;
  const table = await read(ifd + 2, count * 12), tv = new DataView(table.buffer, table.byteOffset, table.byteLength);
  let unit = 2, rationalAt = -1;
  for (let k = 0; k < count && (k + 1) * 12 <= table.length; k++) {
    const tag = tv.getUint16(k * 12, le), type = tv.getUint16(k * 12 + 2, le);
    if (tag === 296 && type === 3) unit = tv.getUint16(k * 12 + 8, le);
    if (tag === 282 && type === 5) rationalAt = tv.getUint32(k * 12 + 8, le);
  }
  if (rationalAt < 0) return null;
  const r = await read(rationalAt, 8);
  if (r.length < 8) return null;
  const rv = new DataView(r.buffer, r.byteOffset, r.byteLength);
  const num = rv.getUint32(0, le), den = rv.getUint32(4, le);
  if (!den || unit === 1) return null;
  return num / den * (unit === 3 ? 2.54 : 1);
}

const inRange = (v: number | null): number | null => (v !== null && Number.isFinite(v) && v >= 1 && v <= 65535 ? Math.round(v) : null);

/** A picture's print resolution in pixels per inch from its file's header: PNG pHYs, JPEG JFIF density (then Exif) and
 *  TIFF XResolution; null where the file states none or states only a shape. */
export async function headerResolution(file: Blob): Promise<number | null> {
  try {
    const b = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer()), v = new DataView(b.buffer);
    const at = (i: number, s: string): boolean => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));
    if (b.length >= 24 && b[0] === 0x89 && at(1, 'PNG')) {
      let i = 8;
      while (i + 12 <= b.length) {
        const len = v.getUint32(i);
        if (at(i + 4, 'IDAT') || at(i + 4, 'IEND')) return null;
        if (at(i + 4, 'pHYs') && len >= 9) return b[i + 16] === 1 ? inRange(v.getUint32(i + 8) * 0.0254) : null;
        i += 12 + len;
      }
      return null;
    }
    if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
      let i = 2, exif: number | null = null;
      while (i + 4 < b.length && b[i] === 0xff) {
        const m = b[i + 1], len = v.getUint16(i + 2);
        if (m === 0xda) break;
        if (m === 0xe0 && at(i + 4, 'JFIF') && len >= 16) {
          const units = b[i + 11], x = v.getUint16(i + 12);
          if (units === 1 || units === 2) return inRange(x * (units === 2 ? 2.54 : 1));
        }
        if (m === 0xe1 && exif === null && at(i + 4, 'Exif') && i + 10 + len <= b.length) {
          const tiff = b.subarray(i + 10, i + 2 + len);
          exif = inRange(await tiffResolution(async (o, n) => tiff.subarray(o, o + n)));
        }
        i += 2 + len;
      }
      return exif;
    }
    if (b.length >= 8 && ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 42) || (b[0] === 0x4d && b[1] === 0x4d && b[3] === 42))) {
      return inRange(await tiffResolution(async (o, n) => new Uint8Array(await file.slice(o, o + n).arrayBuffer())));
    }
  } catch { /* no resolution stated */ }
  return null;
}
