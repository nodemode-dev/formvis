const STD_LUMA = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];

/** The 1 to 100 quality a JPEG was saved at, estimated from its first luminance quantization table against the standard
 *  table scaled the usual way; null for a file with no such table or one that does not follow the standard scaling. */
export function jpegQuality(b: Uint8Array): number | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  for (let i = 2; i + 4 < b.length;) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) { i += marker === 0xff ? 1 : 2; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (marker === 0xda) return null;
    if (marker === 0xdb) {
      for (let p = i + 4, end = Math.min(i + 2 + len, b.length); p < end;) {
        const wide = b[p] >> 4, id = b[p] & 15, size = wide ? 128 : 64;
        if (p + 1 + size > end) break;
        if (id === 0) {
          // Entries are stored in zigzag order; the sum does not depend on the order.
          let sum = 0, std = 0;
          for (let k = 0; k < 64; k++) { sum += wide ? (b[p + 1 + k * 2] << 8) | b[p + 2 + k * 2] : b[p + 1 + k]; std += STD_LUMA[k]; }
          const scale = (100 * sum) / std;
          const q = scale <= 100 ? (200 - scale) / 2 : 5000 / scale;
          return Math.min(100, Math.max(1, Math.round(q)));
        }
        p += 1 + size;
      }
    }
    i += 2 + len;
  }
  return null;
}
