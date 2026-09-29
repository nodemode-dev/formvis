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
