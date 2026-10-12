// Browser encoders leave print resolution out of PNG and JPEG files. This module adds the
// document's: a PNG gets a pHYs chunk (pixels per metre) straight after IHDR, a JPEG gets
// its JFIF density in dots per inch.

// Lookup table for CRC-32 (reflected polynomial 0xEDB88320), built once.
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const latin1 = (b: Uint8Array, from: number, to: number): string => String.fromCharCode(...b.subarray(from, to));

// Walks the PNG chunks looking for a pHYs one; stops at the image data or the end.
function hasPhys(b: Uint8Array): boolean {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let pos = 8;
  while (pos + 8 <= b.length) {
    const len = view.getUint32(pos);
    const type = latin1(b, pos + 4, pos + 8);
    if (type === 'pHYs') return true;
    if (type === 'IDAT' || type === 'IEND') return false;
    pos += 12 + len;
  }
  return false;
}

// A PNG carrying a pHYs chunk for the resolution; the same array when it cannot or need not be added.
function pngWithDpi(b: Uint8Array, dpi: number): Uint8Array {
  if (b.length < 33 || latin1(b, 12, 16) !== 'IHDR' || hasPhys(b)) return b;
  const perMetre = Math.round(dpi / 0.0254);
  const out = new Uint8Array(b.length + 21);
  out.set(b.subarray(0, 33), 0);
  out.set(b.subarray(33), 54);
  const view = new DataView(out.buffer);
  view.setUint32(33, 9);
  out.set([0x70, 0x48, 0x59, 0x73], 37);
  view.setUint32(41, perMetre);
  view.setUint32(45, perMetre);
  out[49] = 1;
  view.setUint32(50, crc32(out.subarray(37, 50)));
  return out;
}

// A JPEG whose JFIF header states the density in dots per inch; the same array when it is not a JPEG.
function jpegWithDpi(b: Uint8Array, dpi: number): Uint8Array {
  if (b[0] !== 0xff || b[1] !== 0xd8) return b;
  const hi = (dpi >> 8) & 0xff, lo = dpi & 0xff;
  if (b.length >= 18 && b[2] === 0xff && b[3] === 0xe0 && latin1(b, 6, 10) === 'JFIF' && b[10] === 0) {
    const copy = b.slice();
    copy[13] = 1;
    copy.set([hi, lo, hi, lo], 14);
    return copy;
  }
  const out = new Uint8Array(b.length + 18);
  out.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, hi, lo, hi, lo, 0x00, 0x00], 0);
  out.set(b.subarray(2), 20);
  return out;
}

/** Returns the image blob stamped with the resolution, or the very same blob when nothing applies. */
export async function withResolution(blob: Blob, dpi: number): Promise<Blob> {
  const d = Math.round(dpi);
  if (!(d >= 1 && d <= 65535)) return blob;
  if (blob.type !== 'image/png' && blob.type !== 'image/jpeg') return blob;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const out = blob.type === 'image/png' ? pngWithDpi(bytes, d) : jpegWithDpi(bytes, d);
  return out === bytes ? blob : new Blob([out as BlobPart], { type: blob.type });
}
