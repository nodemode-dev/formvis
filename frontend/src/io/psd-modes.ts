import { Raster, newLayer, uid, type Doc, type ID, type RGB } from '../engine';
import { defaultDuotone } from '../engine/duotone';
import { displayInfo, pascals, readIccProfile, unicodeNames } from './psd-channels';
import { addIccResource, addResourceBytes, block, resourceBlocks } from './psd-paths';
import { fromBase64 } from './icc-read';

/** Multichannel (mode 7) and Duotone (mode 8) PSD and PSB files, which the layer reader does not handle. Only the merged
 *  image is read: a Duotone's one grey channel, or each channel of a Multichannel file, 8 or 16 bit, raw or run-length
 *  coded. A Duotone opens as a one-ink Duotone document (the file's own ink data is not documented, so it is not read);
 *  a Multichannel file opens with its channels as spot inks, a stored 255 meaning no ink, as formvis keeps them. */

const INK_COLORS: Array<[RegExp, RGB]> = [
  [/^cyan$/i, { r: 0, g: 174, b: 239 }], [/^magenta$/i, { r: 236, g: 0, b: 140 }], [/^yellow$/i, { r: 255, g: 242, b: 0 }], [/^(black|key)$/i, { r: 0, g: 0, b: 0 }],
  [/^red$/i, { r: 255, g: 0, b: 0 }], [/^green$/i, { r: 0, g: 160, b: 0 }], [/^blue$/i, { r: 0, g: 0, b: 255 }],
];
const SPARE: RGB[] = [{ r: 220, g: 60, b: 40 }, { r: 40, g: 120, b: 220 }, { r: 60, g: 170, b: 80 }, { r: 230, g: 160, b: 30 }, { r: 150, g: 70, b: 190 }, { r: 40, g: 170, b: 170 }];

export function psdColorMode(buf: ArrayBuffer): number {
  if (buf.byteLength < 26) return -1;
  const v = new DataView(buf);
  return v.getUint32(0) === 0x38425053 ? v.getUint16(24) : -1;
}

/** The merged image's channel planes as 8-bit grey (the high byte of a 16-bit sample); null where the data cannot be read. */
function mergedPlanes(buf: ArrayBuffer): { planes: Uint8Array[]; width: number; height: number; big: boolean } | null {
  const v = new DataView(buf), src = new Uint8Array(buf), big = v.getUint16(4) === 2, channels = v.getUint16(12), height = v.getUint32(14), width = v.getUint32(18), depth = v.getUint16(22);
  if (!width || !height || !channels || (depth !== 8 && depth !== 16)) return null;
  const cmEnd = 26 + 4 + v.getUint32(26), resEnd = cmEnd + 4 + v.getUint32(cmEnd), lenSize = big ? 8 : 4;
  if (resEnd + lenSize > buf.byteLength) return null;
  const at = resEnd + lenSize + (big ? Number(v.getBigUint64(resEnd)) : v.getUint32(resEnd));
  if (at + 2 > buf.byteLength) return null;
  const bytes = depth >> 3, compression = v.getUint16(at), rowBytes = width * bytes, planes: Uint8Array[] = [];
  if (compression === 0) {
    if (at + 2 + channels * rowBytes * height > buf.byteLength) return null;
    for (let c = 0; c < channels; c++) {
      const plane = new Uint8Array(width * height), o = at + 2 + c * rowBytes * height;
      for (let i = 0; i < plane.length; i++) plane[i] = src[o + i * bytes];
      planes.push(plane);
    }
    return { planes, width, height, big };
  }
  if (compression !== 1) return null;
  const wide = big ? 4 : 2, table = at + 2, rowLen = (r: number): number => (big ? v.getUint32(table + r * 4) : v.getUint16(table + r * 2));
  if (table + channels * height * wide > buf.byteLength) return null;
  let o = table + channels * height * wide;
  for (let c = 0; c < channels; c++) {
    const plane = new Uint8Array(width * height);
    for (let r = 0; r < height; r++) {
      const end = o + rowLen(c * height + r);
      if (end > buf.byteLength) return null;
      const row = new Uint8Array(rowBytes);
      let w = 0;
      while (o < end && w < rowBytes) {
        const h = src[o++] << 24 >> 24;
        if (h >= 0) { const m = Math.min(h + 1, rowBytes - w); row.set(src.subarray(o, o + m), w); o += h + 1; w += m; }
        else if (h > -128) { const m = Math.min(1 - h, rowBytes - w); row.fill(src[o++], w, w + m); w += m; }
      }
      o = end;
      for (let i = 0; i < width; i++) plane[r * width + i] = row[i * bytes];
    }
    planes.push(plane);
  }
  return { planes, width, height, big };
}

const greyRaster = (plane: Uint8Array, w: number, h: number): Raster => {
  const r = new Raster(w, h), img = new ImageData(w, h);
  for (let i = 0; i < plane.length; i++) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = plane[i]; img.data[i * 4 + 3] = 255; }
  r.write(img);
  return r;
};

/** A Multichannel document as a Multichannel PSD or PSB (mode 7): no layers, one 8-bit plane per channel as formvis keeps it
 *  (a stored 255 meaning no ink), raw coded, with the channel names (resources 1006 and 1045), their ink colours and solidity
 *  (1077), the resolution (1005) and the ICC profile (1039). Null when the document holds no channels or more than 56. */
export function writeMultichannelPsd(doc: Doc, psb = false): { bytes: ArrayBuffer; notes: string[] } | null {
  const list = doc.multichannel?.channels ?? [];
  if (doc.mode !== 'multichannel' || !list.length || list.length > 56) return null;
  const w = doc.width, h = doc.height, lenSize = psb ? 8 : 4, notes: string[] = [];
  const u16 = (v: number): number[] => [(v >> 8) & 255, v & 255], u32 = (v: number): number[] => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  const head = [0x38, 0x42, 0x50, 0x53, ...u16(psb ? 2 : 1), 0, 0, 0, 0, 0, 0, ...u16(list.length), ...u32(h), ...u32(w), ...u16(8), ...u16(7), ...u32(0), ...u32(0), ...new Array<number>(lenSize).fill(0), ...u16(0)];
  const out = new Uint8Array(head.length + list.length * w * h);
  out.set(head, 0);
  list.forEach((c, k) => {
    const px = c.data.read(0, 0, Math.min(w, c.data.width), Math.min(h, c.data.height)).data, base = head.length + k * w * h, cw = Math.min(w, c.data.width), ch = Math.min(h, c.data.height);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) out[base + y * w + x] = px[(y * cw + x) * 4];
  });
  const names = list.map((c, i) => c.name || `Channel ${i + 1}`);
  const pascalNames = names.flatMap((n) => { const t = Array.from(new TextEncoder().encode(n.replace(/[^\x20-\x7e]/g, '_'))).slice(0, 255); return [t.length, ...t]; });
  const unicode = names.flatMap((n) => { const cs = Array.from(n).flatMap((c) => { const cp = c.codePointAt(0) as number; return cp > 0xffff ? [0xd800 + ((cp - 0x10000) >> 10), 0xdc00 + ((cp - 0x10000) & 1023)] : [cp]; }); return [...u32(cs.length), ...cs.flatMap((c) => u16(c))]; });
  const w16 = (x: number): number[] => u16(Math.max(0, Math.min(255, Math.round(x))) * 257);
  const info = [...u32(1), ...list.flatMap((c) => [...u16(0), ...w16(c.color.r), ...w16(c.color.g), ...w16(c.color.b), 0, 0, ...u16(Math.max(0, Math.min(100, Math.round(c.solidity * 100)))), 2, 0])];
  const ppi = doc.resolution >= 1 && doc.resolution <= 65535 ? Math.round(doc.resolution) : 72, fixed = [...u16(ppi), 0, 0, ...u16(1), ...u16(1), ...u16(ppi), 0, 0, ...u16(1), ...u16(1)];
  let bytes = addResourceBytes(out.buffer, [...block(1005, '', new Uint8Array(fixed)), ...block(1006, '', new Uint8Array(pascalNames)), ...block(1045, '', new Uint8Array(unicode)), ...block(1077, '', new Uint8Array(info))]);
  try { if (doc.profile) bytes = addIccResource(bytes, fromBase64(doc.profile.icc)); } catch { notes.push('The document\'s colour profile could not be read, so the PSD carries none.'); }
  if (doc.layers.length > 1 || doc.layers.some((l) => l.isGroup)) notes.push('A Multichannel PSD holds channels only; the layers are not written.');
  return { bytes, notes };
}

/** A layerless 8-bit Indexed Color file whose merged image is stored raw, read from its colour table (the three 256-entry
 *  red, green and blue runs of the colour mode data) and its index plane; null for any other file. */
export function readPsdIndexedRaw(buf: ArrayBuffer, resolution: number | null): { doc: Doc; notes: string[]; kept: string[]; activeId: ID | null } | null {
  if (psdColorMode(buf) !== 2) return null;
  const v = new DataView(buf), big = v.getUint16(4) === 2, cmLen = v.getUint32(26);
  if (v.getUint16(22) !== 8 || cmLen < 768) return null;
  const cmEnd = 30 + cmLen, resEnd = cmEnd + 4 + v.getUint32(cmEnd), lenSize = big ? 8 : 4;
  if (resEnd + lenSize > buf.byteLength || (big ? Number(v.getBigUint64(resEnd)) : v.getUint32(resEnd)) !== 0) return null;
  const at = resEnd + lenSize;
  if (at + 2 > buf.byteLength || v.getUint16(at) !== 0) return null;
  const m = mergedPlanes(buf);
  if (!m) return null;
  const palette: RGB[] = Array.from({ length: 256 }, (_, i) => ({ r: v.getUint8(30 + i), g: v.getUint8(30 + 256 + i), b: v.getUint8(30 + 512 + i) }));
  const r = new Raster(m.width, m.height), img = new ImageData(m.width, m.height);
  for (let i = 0; i < m.planes[0].length; i++) { const c = palette[m.planes[0][i]]; img.data[i * 4] = c.r; img.data[i * 4 + 1] = c.g; img.data[i * 4 + 2] = c.b; img.data[i * 4 + 3] = 255; }
  r.write(img);
  const base: Doc = { id: uid(), width: m.width, height: m.height, resolution: resolution ?? 72, layers: [] };
  const icc = readIccProfile(buf), layer = newLayer('Background', base, { raster: r });
  return { doc: { ...base, ...(icc ? { profile: icc } : {}), layers: [layer], mode: 'indexed', palette }, notes: ['This PSD has no layers; it opened as a single one.'], kept: [`Indexed Color with ${palette.length} colours.`], activeId: layer.id };
}

/** A Duotone or Multichannel file as a document, or null for any other mode or a merged image that cannot be read. */
export function readPsdChannelMode(buf: ArrayBuffer, resolution: number | null): { doc: Doc; notes: string[]; activeId: ID | null } | null {
  const mode = psdColorMode(buf);
  if (mode !== 7 && mode !== 8) return null;
  const m = mergedPlanes(buf);
  if (!m) return null;
  const v = new DataView(buf), depth = v.getUint16(22), notes: string[] = [`This ${mode === 7 ? 'Multichannel' : 'Duotone'} file has no layers formvis can read; its merged image opened as one layer.`];
  if (depth === 16) notes.push('This 16-bit file opened at 8 bits per channel.');
  const base: Doc = { id: uid(), width: m.width, height: m.height, resolution: resolution ?? 72, layers: [] };
  const icc = readIccProfile(buf), profile = icc ? { profile: icc } : {};
  if (mode === 8) {
    const layer = newLayer('Background', base, { raster: greyRaster(m.planes[0], m.width, m.height) });
    notes.push('The Duotone file\'s own ink data is not documented, so it opened as a one-ink Duotone; set its inks in Image > Mode > Duotone.');
    return { doc: { ...base, ...profile, layers: [layer], mode: 'duotone', duotone: defaultDuotone('mono') }, notes, activeId: layer.id };
  }
  const blocks = resourceBlocks(buf), names = blocks.has(1045) ? unicodeNames(blocks.get(1045) as Uint8Array) : blocks.has(1006) ? pascals(blocks.get(1006) as Uint8Array) : [], info = blocks.has(1077) ? displayInfo(blocks.get(1077) as Uint8Array) : [];
  const channels = m.planes.slice(0, 56).map((plane, i) => {
    const name = names[i] || `Channel ${i + 1}`, known = INK_COLORS.find(([re]) => re.test(name));
    return { name, color: info[i]?.color ?? known?.[1] ?? SPARE[i % SPARE.length], solidity: 1, data: greyRaster(plane, m.width, m.height) };
  });
  if (m.planes.length > channels.length) notes.push(`Only the first ${channels.length} of the file's ${m.planes.length} channels were read.`);
  const layer = newLayer('Background', base, { raster: greyRaster(m.planes[0], m.width, m.height) });
  return { doc: { ...base, ...profile, layers: [layer], mode: 'multichannel', multichannel: { channels } }, notes, activeId: layer.id };
}
