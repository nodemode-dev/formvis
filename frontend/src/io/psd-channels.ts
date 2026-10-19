import { SelectionMask, uid, type AlphaChannel, type DocProfile } from '../engine';
import { addResourceBytes, block, resourceBlocks } from './psd-paths';
import { profileName, toBase64 } from './icc-read';

/** What a PSD or PSB keeps beside its layers that ag-psd does not hand over: the alpha, spot and Quick Mask channels
 *  stored after the colour channels of the merged image (named by image resources 1006 and 1045, coloured by 1077),
 *  and the ICC profile (1039). Only the merged image data section is read, and only the extra channels in it. */

const CHANNELS_AT = 12, DEPTH_AT = 22, MODE_AT = 24;
/** Colour channels per colour mode: bitmap, grey, indexed, RGB, CMYK, multichannel (as stored), duotone, Lab. */
const BASE: Record<number, number> = { 0: 1, 1: 1, 2: 1, 3: 3, 4: 4, 8: 1, 9: 3 };

const pascals = (d: Uint8Array): string[] => {
  const out: string[] = [];
  for (let o = 0; o < d.length;) {
    const n = d[o];
    if (o + 1 + n > d.length) break;
    out.push(new TextDecoder('latin1').decode(d.subarray(o + 1, o + 1 + n)));
    o += 1 + n;
  }
  return out;
};

/** Image resource 1045: a run of Unicode strings, each its length in characters then UTF-16 big-endian units. */
const unicodeNames = (d: Uint8Array): string[] => {
  const out: string[] = [], dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  for (let o = 0; o + 4 <= d.length;) {
    const n = dv.getUint32(o);
    if (o + 4 + n * 2 > d.length) break;
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(dv.getUint16(o + 4 + i * 2));
    out.push(s.replace(/\0+$/, ''));
    o += 4 + n * 2;
  }
  return out;
};

interface Display { color?: { r: number; g: number; b: number }; opacity?: number; kind: number }

/** Image resource 1077: a version, then per channel a colour space, four 16-bit components, an opacity in percent and a kind. */
const displayInfo = (d: Uint8Array): Display[] => {
  const out: Display[] = [], dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  for (let o = 4; o + 14 <= d.length; o += 14) {
    const space = dv.getUint16(o), kind = d[o + 12];
    const rgb = space === 0 ? { r: dv.getUint16(o + 2) >> 8, g: dv.getUint16(o + 4) >> 8, b: dv.getUint16(o + 6) >> 8 } : undefined;
    out.push({ ...(rgb ? { color: rgb } : {}), opacity: Math.min(100, dv.getUint16(o + 10)), kind });
  }
  return out;
};

/** The extra channels of a file's merged image as alpha channels, with notes on what was approximated or left out. */
export function readExtraChannels(buf: ArrayBuffer): { alphas: AlphaChannel[]; notes: string[] } {
  const none = { alphas: [] as AlphaChannel[], notes: [] as string[] };
  try {
    const v = new DataView(buf);
    if (buf.byteLength < 40 || v.getUint32(0) !== 0x38425053) return none;
    const big = v.getUint16(4) === 2, channels = v.getUint16(CHANNELS_AT), height = v.getUint32(14), width = v.getUint32(18), depth = v.getUint16(DEPTH_AT), mode = v.getUint16(MODE_AT);
    const base = BASE[mode];
    if (base === undefined || channels <= base || !width || !height) return none;
    const cmEnd = 26 + 4 + v.getUint32(26), resEnd = cmEnd + 4 + v.getUint32(cmEnd), lenSize = big ? 8 : 4;
    if (resEnd + lenSize > buf.byteLength) return none;
    const at = resEnd + lenSize + (big ? Number(v.getBigUint64(resEnd)) : v.getUint32(resEnd));
    if (at + 2 > buf.byteLength) return none;
    const blocks = resourceBlocks(buf), notes: string[] = [];
    const names = blocks.has(1045) ? unicodeNames(blocks.get(1045) as Uint8Array) : blocks.has(1006) ? pascals(blocks.get(1006) as Uint8Array) : [];
    const display = blocks.has(1077) ? displayInfo(blocks.get(1077) as Uint8Array) : [];
    let extras = channels - base, first = 0;
    // A merged image with transparency stores it as an extra channel before the named ones.
    if (names.length && extras === names.length + 1) first = 1;
    extras -= first;
    const bytes = depth >> 3, compression = v.getUint16(at);
    if (depth !== 8 && depth !== 16) { notes.push(`The file's ${extras} extra channel${extras > 1 ? 's' : ''} are ${depth}-bit, which formvis does not read; they were left out.`); return { alphas: [], notes }; }
    if (compression > 1) { notes.push(`The file's extra channels use zip compression, which formvis does not read; they were left out.`); return { alphas: [], notes }; }
    const planeBytes = width * height * bytes, rowBytes = width * bytes;
    const alphas: AlphaChannel[] = [];
    const rowSize = big ? 4 : 2, table = at + 2;
    const rowLen = (row: number): number => (big ? v.getUint32(table + row * 4) : v.getUint16(table + row * 2));
    // Where each channel's data starts: raw planes are fixed size, run-length ones follow the table of row lengths.
    const starts: number[] = [];
    if (compression === 0) for (let c = 0; c < channels; c++) starts.push(at + 2 + c * planeBytes);
    else {
      let o = table + channels * height * rowSize;
      for (let c = 0; c < channels; c++) { starts.push(o); for (let r = 0; r < height; r++) o += rowLen(c * height + r); }
      if (o > buf.byteLength) { notes.push('The merged image is cut short, so the file\'s extra channels were left out.'); return { alphas: [], notes }; }
    }
    if (starts[channels - 1] + (compression === 0 ? planeBytes : 0) > buf.byteLength) { notes.push('The merged image is cut short, so the file\'s extra channels were left out.'); return { alphas: [], notes }; }
    const src = new Uint8Array(buf);
    for (let k = 0; k < extras; k++) {
      const c = base + first + k, plane = new Uint8Array(width * height);
      if (compression === 0) {
        for (let i = 0; i < width * height; i++) plane[i] = src[starts[c] + i * bytes];
      } else {
        let o = starts[c];
        for (let r = 0; r < height; r++) {
          const n = rowLen(c * height + r), end = o + n, row = new Uint8Array(rowBytes);
          let w = 0;
          while (o < end && w < rowBytes) {
            const h = src[o++] << 24 >> 24;
            if (h >= 0) { const m = Math.min(h + 1, rowBytes - w); row.set(src.subarray(o, o + m), w); o += h + 1; w += m; }
            else if (h > -128) { const m = Math.min(1 - h, rowBytes - w); row.fill(src[o++], w, w + m); w += m; }
          }
          o = end;
          for (let i = 0; i < width; i++) plane[r * width + i] = row[i * bytes];
        }
      }
      const name = names[k] ?? `Alpha ${k + 1}`, disp = display[k];
      const spot = !!disp && disp.kind >= 2 && disp.kind !== 128, quick = /^quick mask$/i.test(name);
      alphas.push({ id: uid(), name: name || `Alpha ${k + 1}`, mask: SelectionMask.cropped(0, 0, width, height, plane), ...(disp?.color ? { color: disp.color } : {}), ...(disp?.opacity !== undefined ? { opacity: disp.opacity } : {}), indicates: spot || (disp && disp.kind === 0) ? 'selected' : 'masked', ...(spot ? { spot: true } : {}) });
      if (spot) notes.push(`"${name}" is a spot channel; it opened as a spot channel with its ink colour and solidity.`);
      if (quick) notes.push('The file\'s Quick Mask opened as an alpha channel named Quick Mask; formvis does not start in Quick Mask mode.');
    }
    return { alphas, notes };
  } catch { return none; }
}

/** One row of 8-bit data as PackBits runs. */
function packRow(row: Uint8Array, out: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < row.length;) {
    let run = 1;
    while (i + run < row.length && run < 128 && row[i + run] === row[i]) run++;
    if (run >= 2) { out[n++] = (257 - run) & 255; out[n++] = row[i]; i += run; continue; }
    let j = i + 1;
    while (j < row.length && j - i < 128 && !(j + 1 < row.length && row[j] === row[j + 1])) j++;
    out[n++] = j - i - 1;
    for (let k = i; k < j; k++) out[n++] = row[k];
    i = j;
  }
  return n;
}

const u16 = (v: number): number[] => [(v >> 8) & 255, v & 255], u32 = (v: number): number[] => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];

/** The document's alpha and spot channels written into an RGB PSD or PSB made by ag-psd: run-length planes after the
 *  colour channels of the merged image, the channel count in the header, and image resources 1006 and 1045 (names),
 *  1053 (ids) and 1077 (colour, opacity, and whether the colour marks selected or masked areas, or is a spot ink). */
export function addExtraChannels(psd: ArrayBuffer, alphas: readonly AlphaChannel[]): ArrayBuffer {
  const list = alphas.slice(0, 50);
  if (!list.length) return psd;
  const v = new DataView(psd), b = new Uint8Array(psd);
  if (buf4(v) !== 0x38425053 || v.getUint16(MODE_AT) !== 3 || v.getUint16(DEPTH_AT) !== 8) return psd;
  const big = v.getUint16(4) === 2, channels = v.getUint16(CHANNELS_AT), height = v.getUint32(14), width = v.getUint32(18), lenSize = big ? 8 : 4, rowSize = big ? 4 : 2;
  const cmEnd = 26 + 4 + v.getUint32(26), resEnd = cmEnd + 4 + v.getUint32(cmEnd);
  const at = resEnd + lenSize + (big ? Number(v.getBigUint64(resEnd)) : v.getUint32(resEnd));
  if (at + 2 > b.length || v.getUint16(at) !== 1 || !width || !height) return psd;
  const tableEnd = at + 2 + channels * height * rowSize, plane = new Uint8Array(width * height), scratch = new Uint8Array(width * 2 + 8), rows: Uint8Array[] = [], table = new Uint8Array(list.length * height * rowSize);
  let dataLen = 0, ti = 0;
  for (const a of list) {
    plane.fill(0);
    const m = a.mask;
    if (m) for (let y = Math.max(0, m.y); y < Math.min(height, m.y + m.h); y++) for (let x = Math.max(0, m.x); x < Math.min(width, m.x + m.w); x++) plane[y * width + x] = m.data[(y - m.y) * m.w + (x - m.x)];
    for (let y = 0; y < height; y++) {
      const n = packRow(plane.subarray(y * width, (y + 1) * width), scratch);
      rows.push(scratch.slice(0, n));
      dataLen += n;
      if (big) { table[ti++] = n >>> 24; table[ti++] = (n >>> 16) & 255; }
      table[ti++] = (n >> 8) & 255; table[ti++] = n & 255;
    }
  }
  const out = new Uint8Array(b.length + table.length + dataLen);
  out.set(b.subarray(0, tableEnd), 0);
  out.set(table, tableEnd);
  out.set(b.subarray(tableEnd), tableEnd + table.length);
  let wo = b.length + table.length;
  for (const r of rows) { out.set(r, wo); wo += r.length; }
  new DataView(out.buffer).setUint16(CHANNELS_AT, channels + list.length);
  const names = list.map((a, i) => a.name || `Alpha ${i + 1}`);
  const pascalNames = names.flatMap((n) => { const t = Array.from(new TextEncoder().encode(n.replace(/[^\x20-\x7e]/g, '_'))).slice(0, 255); return [t.length, ...t]; });
  const unicode = names.flatMap((n) => { const cs = Array.from(n).flatMap((c) => { const cp = c.codePointAt(0) as number; return cp > 0xffff ? [0xd800 + ((cp - 0x10000) >> 10), 0xdc00 + ((cp - 0x10000) & 1023)] : [cp]; }); return [...u32(cs.length), ...cs.flatMap((c) => u16(c))]; });
  const ids = list.flatMap((_, i) => u32(i + 1));
  const info = [...u32(1), ...list.flatMap((a) => {
    const c = a.color ?? { r: 255, g: 0, b: 0 }, op = Math.max(0, Math.min(100, Math.round(a.opacity ?? 50))), kind = a.spot ? 2 : a.indicates === 'selected' ? 0 : 1, w16 = (x: number): number[] => u16(Math.max(0, Math.min(255, Math.round(x))) * 257);
    return [...u16(0), ...w16(c.r), ...w16(c.g), ...w16(c.b), 0, 0, ...u16(op), kind, 0];
  })];
  const extra = [...block(1006, '', new Uint8Array(pascalNames)), ...block(1045, '', new Uint8Array(unicode)), ...block(1053, '', new Uint8Array(ids)), ...block(1077, '', new Uint8Array(info))];
  return addResourceBytes(out.buffer, extra);
}

const buf4 = (v: DataView): number => v.getUint32(0);

/** The file's embedded ICC profile (image resource 1039) as a document profile; null when it has none. */
export function readIccProfile(buf: ArrayBuffer): DocProfile | null {
  const d = resourceBlocks(buf).get(1039);
  if (!d || d.length < 132 || d.length > 8_000_000) return null;
  return { name: profileName(d), icc: toBase64(d) };
}
