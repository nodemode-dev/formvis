/** Embedded colour profiles (1.53.5, H2): found in PNG (iCCP, deflated), JPEG (APP2 ICC_PROFILE, possibly in several
 *  parts) and WebP (ICCP) without decoding the picture, and a profile's name from its description tag (v2 desc, v4 mluc). */
async function inflate(z: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([new Uint8Array(z)]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

export async function embeddedProfile(file: Blob): Promise<Uint8Array | null> {
  const head = new Uint8Array(await file.slice(0, Math.min(file.size, 4 * 1024 * 1024)).arrayBuffer());
  const dv = new DataView(head.buffer), tag = (o: number): string => String.fromCharCode(...head.subarray(o, o + 4));
  try {
    if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) {   // \x89PNG
      for (let o = 8; o + 8 <= head.length;) {
        const len = dv.getUint32(o), t = tag(o + 4);
        if (t === 'iCCP') { const body = head.subarray(o + 8, o + 8 + len), nul = body.indexOf(0); return await inflate(body.subarray(nul + 2)); }
        if (t === 'IDAT' || t === 'IEND') return null;
        o += 12 + len;
      }
      return null;
    }
    if (head[0] === 0xff && head[1] === 0xd8) {
      const parts: Array<[number, Uint8Array]> = [];
      for (let o = 2; o + 4 <= head.length && head[o] === 0xff;) {
        const m = head[o + 1], len = dv.getUint16(o + 2);
        if (m === 0xda) break;
        if (m === 0xe2 && String.fromCharCode(...head.subarray(o + 4, o + 15)) === 'ICC_PROFILE') parts.push([head[o + 16], head.subarray(o + 18, o + 2 + len)]);
        o += 2 + len;
      }
      if (!parts.length) return null;
      parts.sort((a, b) => a[0] - b[0]);
      const out = new Uint8Array(parts.reduce((n, [, p]) => n + p.length, 0));
      let at = 0; for (const [, p] of parts) { out.set(p, at); at += p.length; }
      return out;
    }
    if ((head[0] === 0x49 && head[1] === 0x49 && head[2] === 42 && head[3] === 0) || (head[0] === 0x4d && head[1] === 0x4d && head[2] === 0 && head[3] === 42)) {   // TIFF, tag 34675
      const le = head[0] === 0x49, u16 = (b: DataView, o: number): number => b.getUint16(o, le), u32 = (b: DataView, o: number): number => b.getUint32(o, le);
      const ifd = u32(dv, 4), area = new DataView(await file.slice(ifd, ifd + 2 + 12 * 512).arrayBuffer());
      for (let i = 0, n = Math.min(512, u16(area, 0)); i < n; i++) {
        const e = 2 + i * 12;
        if (u16(area, e) === 34675) { const len = u32(area, e + 4), at = u32(area, e + 8); return new Uint8Array(await file.slice(at, at + len).arrayBuffer()); }
      }
      return null;
    }
    if ((head[0] === 0x49 && head[1] === 0x49 && head[2] === 43 && head[3] === 0) || (head[0] === 0x4d && head[1] === 0x4d && head[2] === 0 && head[3] === 43)) {   // BigTIFF: 8-byte offsets, 20-byte entries
      const le = head[0] === 0x49, ifd = Number(dv.getBigUint64(8, le)), area = new DataView(await file.slice(ifd, ifd + 8 + 20 * 512).arrayBuffer());
      for (let i = 0, n = Math.min(512, Number(area.getBigUint64(0, le))); i < n; i++) {
        const e = 8 + i * 20;
        if (area.getUint16(e, le) === 34675) { const len = Number(area.getBigUint64(e + 4, le)), at = Number(area.getBigUint64(e + 12, le)); return new Uint8Array(await file.slice(at, at + len).arrayBuffer()); }
      }
      return null;
    }
    if (tag(0) === '8BPS') {   // PSD, image resource 1039
      const skip = 26 + 4 + dv.getUint32(26), size = dv.getUint32(skip);
      for (let o = skip + 4, end = Math.min(head.length, skip + 4 + size); o + 12 <= end;) {
        const id = dv.getUint16(o + 4), nameLen = head[o + 6], at = o + 6 + ((1 + nameLen + 1) & ~1), len = dv.getUint32(at);
        if (id === 1039) return head.slice(at + 4, at + 4 + len);
        o = at + 4 + len + (len & 1);
      }
      return null;
    }
    if (tag(0) === 'RIFF' && tag(8) === 'WEBP') {
      for (let o = 12; o + 8 <= head.length;) {
        const len = dv.getUint32(o + 4, true);
        if (tag(o) === 'ICCP') return head.slice(o + 8, o + 8 + len);
        o += 8 + len + (len & 1);
      }
    }
  } catch { return null; }
  return null;
}

/** A JPEG's EXIF ColorSpace tag (1 is sRGB, 65535 uncalibrated), or null when there is no EXIF or no tag. */
export async function exifColourSpace(file: Blob): Promise<number | null> {
  try {
    const head = new Uint8Array(await file.slice(0, Math.min(file.size, 1024 * 1024)).arrayBuffer());
    if (head[0] !== 0xff || head[1] !== 0xd8) return null;
    const dv = new DataView(head.buffer);
    for (let o = 2; o + 4 <= head.length && head[o] === 0xff;) {
      const m = head[o + 1], len = dv.getUint16(o + 2);
      if (m === 0xda) break;
      if (m === 0xe1 && String.fromCharCode(...head.subarray(o + 4, o + 8)) === 'Exif') {
        const t = o + 10, le = head[t] === 0x49;
        const u16 = (p: number): number => dv.getUint16(t + p, le), u32 = (p: number): number => dv.getUint32(t + p, le);
        const find = (ifd: number, id: number): number | null => {
          for (let i = 0, n = u16(ifd); i < n; i++) { const e = ifd + 2 + i * 12; if (u16(e) === id) return e; }
          return null;
        };
        const sub = find(u32(4), 0x8769);
        if (sub === null) return null;
        const e = find(u32(sub + 8), 0xa001);
        return e === null ? null : u16(e + 8);
      }
      o += 2 + len;
    }
  } catch { return null; }
  return null;
}

/** The profile's description ('desc' v2 or 'mluc' v4), or 'Embedded profile'. */
export function profileName(icc: Uint8Array): string {
  try {
    const dv = new DataView(icc.buffer, icc.byteOffset, icc.byteLength), n = Math.min(dv.getUint32(128), Math.max(0, Math.floor((icc.length - 132) / 12)));
    for (let i = 0; i < n; i++) {
      const at = 132 + i * 12;
      if (String.fromCharCode(...icc.subarray(at, at + 4)) !== 'desc') continue;
      const off = dv.getUint32(at + 4), type = String.fromCharCode(...icc.subarray(off, off + 4));
      if (type === 'desc') { const len = dv.getUint32(off + 8); return String.fromCharCode(...icc.subarray(off + 12, off + 12 + len)).replace(/\0+$/, '').trim() || 'Embedded profile'; }
      if (type === 'mluc') { const len = dv.getUint32(off + 20), start = off + dv.getUint32(off + 24); let s = ''; for (let k = 0; k + 1 < len; k += 2) s += String.fromCharCode(dv.getUint16(start + k)); return s.replace(/\0+$/, '').trim() || 'Embedded profile'; }
    }
  } catch { /* unreadable: named generically */ }
  return 'Embedded profile';
}

export const isSrgbName = (name: string): boolean => /\bs\s?RGB\b/i.test(name);

export function toBase64(b: Uint8Array): string { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); }
export function fromBase64(s: string): Uint8Array { const t = atob(s), out = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) out[i] = t.charCodeAt(i); return out; }
