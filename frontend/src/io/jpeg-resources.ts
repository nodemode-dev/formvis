import type { Guide } from '../engine/types';

/** What a JPEG file carries beyond its pixels: the guides of its APP13 image resources (resource 1032, positions in
 *  1/32 pixel) and whether the stream ends before its end-of-image marker (a cut-off download or copy). */
export interface JpegExtras { guides: Guide[]; truncated: boolean }

export async function jpegExtras(file: Blob): Promise<JpegExtras> {
  const out: JpegExtras = { guides: [], truncated: false };
  try {
    const b = new Uint8Array(await file.arrayBuffer()), v = new DataView(b.buffer);
    if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return out;
    let end = b.length;
    while (end > 2 && b[end - 1] === 0) end--;
    out.truncated = !(b[end - 2] === 0xff && b[end - 1] === 0xd9);
    // the APP13 segment's fixed identifier, as byte values (fourteen bytes ending in a zero)
    const sig = [80, 104, 111, 116, 111, 115, 104, 111, 112, 32, 51, 46, 48, 0], chunks: Uint8Array[] = [];
    let i = 2;
    while (i + 4 <= b.length && b[i] === 0xff) {
      const m = b[i + 1], len = v.getUint16(i + 2);
      if (m === 0xda || m === 0xd9) break;
      if (m === 0xed && len > 2 + sig.length && sig.every((c, k) => b[i + 4 + k] === c)) chunks.push(b.subarray(i + 4 + sig.length, i + 2 + len));
      i += 2 + len;
    }
    const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let at = 0;
    for (const c of chunks) { all.set(c, at); at += c.length; }
    const dv = new DataView(all.buffer);
    let o = 0;
    while (o + 12 <= all.length && dv.getUint32(o) === 0x3842494d) {
      const id = dv.getUint16(o + 4), nlen = all[o + 6], p = o + 6 + 1 + nlen + ((1 + nlen) % 2), size = dv.getUint32(p);
      if (p + 4 + size > all.length) break;
      if (id === 1032 && size >= 16) {
        const n = Math.min(dv.getUint32(p + 4 + 12), Math.floor((size - 16) / 5));
        for (let k = 0; k < n; k++) {
          const g = p + 4 + 16 + k * 5, loc = dv.getUint32(g) / 32;
          if (Number.isFinite(loc) && loc >= 0 && loc < 1e6) out.guides.push({ axis: all[g + 4] === 0 ? 'x' : 'y', at: Math.round(loc * 2) / 2 });
        }
      }
      o = p + 4 + size + (size % 2);
    }
  } catch { /* no extras */ }
  return out;
}
