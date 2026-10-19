import { Raster, newLayer, uid, type Doc, type ID, type RGB } from '../engine';
import { defaultDuotone } from '../engine/duotone';
import { displayInfo, pascals, readIccProfile, unicodeNames } from './psd-channels';
import { resourceBlocks } from './psd-paths';

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
