/** The colour table of an indexed PNG (colour type 3, PLTE with an optional tRNS) or an indexed BMP (8 bits or fewer a
 *  pixel), read from the file's header. `transparent` is the one entry that is fully clear, or -1 for none. Null for a
 *  file that is not indexed, or whose transparency Indexed Color cannot hold (a partial alpha, or several clear entries). */
export interface HeaderPalette { colors: Array<{ r: number; g: number; b: number }>; transparent: number }

export async function headerPalette(file: Blob): Promise<HeaderPalette | null> {
  try {
    const b = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer()), v = new DataView(b.buffer);
    const at = (i: number, s: string): boolean => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));
    if (b.length >= 33 && b[0] === 0x89 && at(1, 'PNG') && b[25] === 3) {
      let i = 8, plte: Uint8Array | null = null, trns: Uint8Array | null = null;
      while (i + 12 <= b.length) {
        const len = v.getUint32(i);
        if (at(i + 4, 'IDAT') || at(i + 4, 'IEND')) break;
        if (at(i + 4, 'PLTE') && i + 8 + len <= b.length) plte = b.subarray(i + 8, i + 8 + len);
        if (at(i + 4, 'tRNS') && i + 8 + len <= b.length) trns = b.subarray(i + 8, i + 8 + len);
        i += 12 + len;
      }
      if (!plte || plte.length < 3) return null;
      const n = Math.min(256, Math.floor(plte.length / 3)), colors = [];
      for (let k = 0; k < n; k++) colors.push({ r: plte[k * 3]!, g: plte[k * 3 + 1]!, b: plte[k * 3 + 2]! });
      let transparent = -1;
      if (trns) for (let k = 0; k < Math.min(trns.length, n); k++) {
        if (trns[k] === 255) continue;
        if (trns[k] !== 0 || transparent >= 0) return null;
        transparent = k;
      }
      return { colors, transparent };
    }
    if (b.length >= 54 && b[0] === 0x42 && b[1] === 0x4d) {
      const dib = v.getUint32(14, true), bits = v.getUint16(28, true);
      if (dib < 40 || bits < 1 || bits > 8) return null;
      const used = v.getUint32(46, true), n = Math.min(256, used > 0 ? used : 1 << bits), start = 14 + dib;
      if (start + n * 4 > b.length) return null;
      const colors = [];
      for (let k = 0; k < n; k++) colors.push({ r: b[start + k * 4 + 2]!, g: b[start + k * 4 + 1]!, b: b[start + k * 4]! });
      return { colors, transparent: -1 };
    }
  } catch { /* not indexed */ }
  return null;
}
