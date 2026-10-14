/** Photoshop pattern files (.pat, "8BPT"), after Adobe's published Photoshop file format specification. No DOM.
 *
 *  Layout (all numbers big-endian): signature "8BPT", u16 version 1, u32 pattern count; then per pattern: u32 version 1,
 *  u32 image mode (1 grayscale, 2 indexed, 3 RGB), u16 height, u16 width, a Unicode name (u32 length in UTF-16 code
 *  units, then UTF-16BE), a Pascal string id, the 768 byte colour table when indexed, then a virtual memory array
 *  list: u32 version 3, u32 length, rectangle (top, left, bottom, right as u32), u32 channel count, and per channel
 *  u32 is-written, u32 length, then (when written) u32 depth, rectangle, u16 depth, u8 compression (0 raw, 1 PackBits
 *  with a u16 byte count per row ahead of the rows), data. RGB has three channels and an optional alpha at the end. */
export interface PatImage { name: string; width: number; height: number; rgba: Uint8ClampedArray }

const MAX_SIDE = 8192;

/** Unpacks PackBits into `out` (n bytes at `o`), returning the source position after it. */
function unpackBits(src: Uint8Array, pos: number, end: number, out: Uint8Array, o: number, n: number): number {
  let k = 0;
  while (k < n) {
    if (pos >= end) throw new Error('The pattern file ends inside a compressed row.');
    const c = (src[pos++] << 24) >> 24;
    if (c >= 0) {
      const cnt = Math.min(c + 1, n - k);
      if (pos + c + 1 > end) throw new Error('The pattern file ends inside a compressed row.');
      out.set(src.subarray(pos, pos + cnt), o + k);
      pos += c + 1; k += cnt;
    } else if (c !== -128) {
      if (pos >= end) throw new Error('The pattern file ends inside a compressed row.');
      const cnt = Math.min(1 - c, n - k), v = src[pos++];
      out.fill(v, o + k, o + k + cnt);
      k += cnt;
    }
  }
  return pos;
}

/** PackBits for one row. */
function packBits(row: Uint8Array, into: number[]): void {
  const n = row.length;
  let i = 0;
  while (i < n) {
    let run = 1;
    while (i + run < n && run < 128 && row[i + run] === row[i]) run += 1;
    if (run >= 2) { into.push(257 - run, row[i]); i += run; continue; }
    const start = i;
    i += 1;
    while (i < n && i - start < 128 && !(i + 1 < n && row[i] === row[i + 1])) i += 1;
    into.push(i - start - 1);
    for (let j = start; j < i; j += 1) into.push(row[j]);
  }
}

export function readPat(bytes: Uint8Array): PatImage[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const len = bytes.byteLength;
  let p = 0;
  const need = (n: number): void => { if (p + n > len) throw new Error('The pattern file is cut short.'); };
  const u8 = (): number => { need(1); return dv.getUint8(p++); };
  const u16 = (): number => { need(2); const v = dv.getUint16(p); p += 2; return v; };
  const u32 = (): number => { need(4); const v = dv.getUint32(p); p += 4; return v; };
  if (len < 10 || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== '8BPT') throw new Error('This is not a Photoshop pattern file (8BPT).');
  p = 4;
  if (u16() !== 1) throw new Error('This version of the pattern file is not supported.');
  const count = u32(), out: PatImage[] = [];
  for (let n = 0; n < count; n += 1) {
    if (u32() !== 1) throw new Error('A pattern in this file has an unsupported version.');
    const mode = u32(), height = u16(), width = u16();
    if (mode !== 1 && mode !== 2 && mode !== 3) throw new Error('A pattern in this file uses an image mode formvis cannot read (grayscale, indexed and RGB are supported).');
    if (!width || !height || width > MAX_SIDE || height > MAX_SIDE) throw new Error('A pattern in this file has an unusable size.');
    const units = u32();
    need(units * 2);
    let name = '';
    for (let i = 0; i < units; i += 1) name += String.fromCharCode(dv.getUint16(p + i * 2));
    p += units * 2;
    name = name.replace(/\0+$/, '');
    const idLen = u8();   // the unique id, a Pascal string
    need(idLen);
    p += idLen;
    let palette: Uint8Array | null = null;
    if (mode === 2) {
      need(768);
      palette = bytes.subarray(p, p + 768);
      p += 768;
      // Photoshop follows the table with four more bytes; accept files that do not.
      if (!(p + 4 <= len && dv.getUint32(p) === 3) && p + 8 <= len && dv.getUint32(p + 4) === 3) p += 4;
    }
    if (u32() !== 3) throw new Error('A pattern in this file has an unsupported memory array version.');
    const vmaLen = u32(), vmaEnd = p + vmaLen;
    need(vmaLen);
    p += 16;
    const channels = u32();
    if (channels < 1 || channels > 56) throw new Error('A pattern in this file has an unusable channel count.');
    const planes: Uint8Array[] = [];
    for (let c = 0; c < channels; c += 1) {
      const written = u32(), clen = u32(), cEnd = p + clen;
      need(clen);
      if (!written || !clen) { p = cEnd; continue; }
      u32();   // pixel depth, as a long
      const top = u32(), left = u32(), bottom = u32(), right = u32();
      const depth = u16(), comp = u8();
      const w = right - left, h = bottom - top;
      if (w !== width || h !== height) throw new Error('A channel in this file does not match its pattern size.');
      if (depth !== 8 && depth !== 16) throw new Error(`A ${depth}-bit pattern is not supported (8 and 16 bit are).`);
      const bps = depth >> 3, rowBytes = w * bps, raw = new Uint8Array(rowBytes * h);
      if (comp === 0) {
        if (p + raw.length > cEnd) throw new Error('A channel in this file is cut short.');
        raw.set(bytes.subarray(p, p + raw.length));
      } else if (comp === 1) {
        let q = p + h * 2;
        if (q > cEnd) throw new Error('A channel in this file is cut short.');
        for (let y = 0; y < h; y += 1) {
          const cnt = dv.getUint16(p + y * 2);
          unpackBits(bytes, q, Math.min(q + cnt, cEnd), raw, y * rowBytes, rowBytes);
          q += cnt;
        }
      } else throw new Error('A channel in this file uses a compression formvis cannot read.');
      const plane = new Uint8Array(w * h);
      for (let i = 0; i < plane.length; i += 1) plane[i] = raw[i * bps];   // 16-bit keeps its high byte
      planes.push(plane);
      p = cEnd;
    }
    p = Math.max(p, vmaEnd);
    const rgba = new Uint8ClampedArray(width * height * 4);
    const colour = mode === 3 ? 3 : 1;
    if (planes.length < colour) throw new Error('A pattern in this file is missing channels.');
    const alpha = planes.length > colour ? planes[colour] : null;
    for (let i = 0, o = 0; i < width * height; i += 1, o += 4) {
      if (mode === 3) { rgba[o] = planes[0][i]; rgba[o + 1] = planes[1][i]; rgba[o + 2] = planes[2][i]; }
      else if (mode === 2 && palette) { const k = planes[0][i] * 3; rgba[o] = palette[k]; rgba[o + 1] = palette[k + 1]; rgba[o + 2] = palette[k + 2]; }
      else { const g = planes[0][i]; rgba[o] = g; rgba[o + 1] = g; rgba[o + 2] = g; }
      rgba[o + 3] = alpha ? alpha[i] : 255;
    }
    out.push({ name, width, height, rgba });
  }
  return out;
}

/** Writes RGB patterns, RLE compressed; an alpha channel follows the colour when any pixel is not opaque. */
export function writePat(patterns: PatImage[]): Uint8Array {
  const b: number[] = [];
  const w16 = (v: number): void => { b.push((v >>> 8) & 255, v & 255); };
  const w32 = (v: number): void => { b.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); };
  b.push(0x38, 0x42, 0x50, 0x54);
  w16(1); w32(patterns.length);
  for (const pt of patterns) {
    const { width, height, rgba } = pt;
    if (!width || !height || width > 65535 || height > 65535 || rgba.length !== width * height * 4) throw new Error(`The pattern "${pt.name}" has an unusable size.`);
    let translucent = false;
    for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) { translucent = true; break; }
    const nch = translucent ? 4 : 3;
    w32(1); w32(3); w16(height); w16(width);
    const name = pt.name.slice(0, 255);
    w32(name.length + 1);
    for (let i = 0; i < name.length; i += 1) w16(name.charCodeAt(i));
    w16(0);
    let id = '';
    for (let i = 0; i < 32; i += 1) { id += Math.floor(Math.random() * 16).toString(16); if (i === 7 || i === 11 || i === 15 || i === 19) id += '-'; }
    b.push(id.length);
    for (let i = 0; i < id.length; i += 1) b.push(id.charCodeAt(i));
    // Each channel: RLE rows, with the row byte counts ahead of them.
    const chans: number[][] = [];
    for (let c = 0; c < nch; c += 1) {
      const counts: number[] = [], data: number[] = [], row = new Uint8Array(width);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) row[x] = rgba[(y * width + x) * 4 + c];
        const before = data.length;
        packBits(row, data);
        counts.push(data.length - before);
      }
      const ch: number[] = [];
      for (const n of counts) ch.push((n >>> 8) & 255, n & 255);
      for (const v of data) ch.push(v);
      chans.push(ch);
    }
    const chLen = (ch: number[]): number => 4 + 16 + 2 + 1 + ch.length;
    let vma = 16 + 4;
    for (const ch of chans) vma += 8 + chLen(ch);
    w32(3); w32(vma);
    w32(0); w32(0); w32(height); w32(width);
    w32(nch);
    for (const ch of chans) {
      w32(1); w32(chLen(ch));
      w32(8);
      w32(0); w32(0); w32(height); w32(width);
      w16(8); b.push(1);
      for (const v of ch) b.push(v);
    }
  }
  return Uint8Array.from(b);
}
