/** the ImageExporter writes the document's resolution into every PNG and JPEG it exports
 *  (kCGImagePropertyDPIWidth and DPIHeight). The browser's encoders write none, so the encoded bytes get it here: a
 *  PNG `pHYs` chunk (pixels per meter) placed after IHDR, and a JPEG's JFIF density in dots per inch. */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const text = (b: Uint8Array, from: number, to: number): string => String.fromCharCode(...b.subarray(from, to));

/** Whether a PNG already has a pHYs chunk before its image data. */
function hasPhys(b: Uint8Array): boolean {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  for (let o = 8; o + 8 <= b.length;) {
    const type = text(b, o + 4, o + 8);
    if (type === 'pHYs') return true;
    if (type === 'IDAT' || type === 'IEND') return false;
    o += 12 + v.getUint32(o);
  }
  return false;
}

function pngWithPhys(b: Uint8Array, dpi: number): Uint8Array {
  if (b.length < 33 || text(b, 12, 16) !== 'IHDR' || hasPhys(b)) return b;
  const ppm = Math.round(dpi / 0.0254), chunk = new Uint8Array(21), v = new DataView(chunk.buffer);
  v.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4);
  v.setUint32(8, ppm);
  v.setUint32(12, ppm);
  chunk[16] = 1;
  v.setUint32(17, crc32(chunk.subarray(4, 17)));
  const out = new Uint8Array(b.length + 21);
  out.set(b.subarray(0, 33));
  out.set(chunk, 33);
  out.set(b.subarray(33), 54);
  return out;
}

function jpegWithDensity(b: Uint8Array, dpi: number): Uint8Array {
  if (b[0] !== 0xff || b[1] !== 0xd8) return b;
  if (b[2] === 0xff && b[3] === 0xe0 && text(b, 6, 11) === 'JFIF\u0000') {
    const out = b.slice();
    out[13] = 1;
    out[14] = dpi >> 8; out[15] = dpi & 0xff; out[16] = dpi >> 8; out[17] = dpi & 0xff;
    return out;
  }
  const app0 = Uint8Array.of(0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, dpi >> 8, dpi & 0xff, dpi >> 8, dpi & 0xff, 0x00, 0x00);
  const out = new Uint8Array(b.length + app0.length);
  out.set(b.subarray(0, 2));
  out.set(app0, 2);
  out.set(b.subarray(2), 2 + app0.length);
  return out;
}

/** `blob` with `dpi` written into it, for PNG and JPEG; other types and out-of-range resolutions pass through. */
export async function withResolution(blob: Blob, dpi: number): Promise<Blob> {
  const res = Math.round(dpi);
  if (!(res >= 1 && res <= 65535) || (blob.type !== 'image/png' && blob.type !== 'image/jpeg')) return blob;
  const b = new Uint8Array(await blob.arrayBuffer());
  const out = blob.type === 'image/png' ? pngWithPhys(b, res) : jpegWithDensity(b, res);
  return out === b ? blob : new Blob([out as Uint8Array<ArrayBuffer>], { type: blob.type });
}
