// Layered TIFF (DEV_PLAN 34.2): PSD layers carried in a TIFF's ImageSourceData tag (37724), read and written here.
import { readPsdFile, writePsdFile } from './psd';
import { ctxOf, type Doc, type Surface } from '../engine';
import { metaWritable } from '../engine/doc-meta';
import { buildExifBlock, exifBlockOf, exifForTiff } from './exif';
import type { PathSet } from '../engine/paths';

const TAG_IMAGE_SOURCE_DATA = 37724;
const PREFIX = 'Adobe Photoshop Document Data Block\0';
const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8 };

type PsdRead = Awaited<ReturnType<typeof readPsdFile>>;

function ascii(b: Uint8Array, at: number, n: number): string {
  let s = '';
  for (let i = 0; i < n && at + i < b.length; i++) s += String.fromCharCode(b[at + i]);
  return s;
}

interface TiffInfo { block: Uint8Array | null; width: number; height: number; resources: Uint8Array | null; samples: number; compression: number; strips: number; stripAt: number; stripLen: number }

/** Walks IFD0 of a TIFF (either byte order) for the image size and tag 37724's bytes. */
function scanTiff(bytes: Uint8Array): TiffInfo | null {
  if (bytes.length < 8) return null;
  const order = ascii(bytes, 0, 2);
  if (order !== 'II' && order !== 'MM') return null;
  const le = order === 'II', dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint16(2, le) !== 42) return null;
  const ifd = dv.getUint32(4, le);
  if (ifd + 2 > bytes.length) return null;
  const n = dv.getUint16(ifd, le);
  let block: Uint8Array | null = null, resources: Uint8Array | null = null, width = 0, height = 0, samples = 3, compression = 1, strips = 1, stripAt = 0, stripLen = 0;
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > bytes.length) return null;
    const tag = dv.getUint16(e, le), type = dv.getUint16(e + 2, le), count = dv.getUint32(e + 4, le);
    const size = (TYPE_SIZE[type] ?? 1) * count;
    const at = size <= 4 ? e + 8 : dv.getUint32(e + 8, le);
    const one = type === 3 ? dv.getUint16(e + 8, le) : dv.getUint32(e + 8, le);
    if (tag === 256) width = one;
    else if (tag === 257) height = one;
    else if (tag === 277) samples = one;
    else if (tag === 259) compression = one;
    else if (tag === 273) { strips = count; stripAt = count === 1 ? one : at; }
    else if (tag === 279) stripLen = count === 1 ? one : 0;
    else if (tag === 34377 && at + size <= bytes.length) resources = bytes.subarray(at, at + size);
    else if (tag === TAG_IMAGE_SOURCE_DATA) {
      if (at + size > bytes.length) return null;
      block = bytes.subarray(at, at + size);
    }
  }
  return { block, width, height, resources, samples, compression, strips, stripAt, stripLen };
}

/** The bytes of tag 37724 (ImageSourceData) in a TIFF, or null. */
export function tiffLayerBlock(bytes: Uint8Array): Uint8Array | null {
  return scanTiff(bytes)?.block ?? null;
}

/** The '8BIM' / '8B64' blocks after the prefix, by key. */
function blocksOf(block: Uint8Array): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  const dv = new DataView(block.buffer, block.byteOffset, block.byteLength);
  const isSig = (at: number): boolean => { const s = ascii(block, at, 4); return s === '8BIM' || s === '8B64'; };
  let pos = PREFIX.length;
  while (pos + 12 <= block.length && isSig(pos)) {
    const key = ascii(block, pos + 4, 4), len = dv.getUint32(pos + 8, false), start = pos + 12;
    if (start + len > block.length) break;
    if (!out.has(key)) out.set(key, block.subarray(start, start + len));
    const end = start + len;
    const options = [end, end + (end & 1), end + ((4 - (end & 3)) & 3)];
    const next = options.find((o) => o >= block.length || isSig(o));
    if (next === undefined) break;
    pos = next;
  }
  return out;
}

/** A layered TIFF opened through the PSD reader, or null when the file is not one (or is 16-bit). */
export async function readLayeredTiff(file: File): Promise<PsdRead | null> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const info = scanTiff(bytes);
    if (!info?.block || !info.width || !info.height) return null;
    if (ascii(info.block, 0, PREFIX.length) !== PREFIX) return null;
    const blocks = blocksOf(info.block);
    const layr = blocks.get('Layr');   // 'Lr16' and 'Lr32' are deeper than 8 bits and fall back to the flattened TIFF
    if (!layr) return null;
    const lmsk = blocks.get('LMsk');
    const { width, height } = info, resources = info.resources ?? new Uint8Array(0);
    // Extra samples (the composite's alpha, then the alpha and spot channels) are read from an uncompressed strip.
    const extras = info.compression === 1 && info.strips === 1 && resources.length && info.samples > 4 && info.stripAt + width * height * info.samples <= bytes.length ? info.samples - 3 : 0;
    const channels = 3 + extras;
    const pixels = width * height * channels;
    const layerSection = 4 + layr.length + 4 + (lmsk?.length ?? 0);
    const total = 26 + 4 + 4 + resources.length + 4 + layerSection + 2 + pixels;
    const psd = new Uint8Array(total), dv = new DataView(psd.buffer);
    psd.set([0x38, 0x42, 0x50, 0x53], 0);   // '8BPS'
    dv.setUint16(4, 1, false);              // version 1
    dv.setUint16(12, channels, false);
    dv.setUint32(14, height, false);
    dv.setUint32(18, width, false);
    dv.setUint16(22, 8, false);             // depth
    dv.setUint16(24, 3, false);             // RGB
    let at = 26;
    dv.setUint32(at, 0, false); at += 4;    // colour mode data
    dv.setUint32(at, resources.length, false); at += 4;   // image resources, from tag 34377
    psd.set(resources, at); at += resources.length;
    dv.setUint32(at, layerSection, false); at += 4;
    dv.setUint32(at, layr.length, false); at += 4;
    psd.set(layr, at); at += layr.length;
    dv.setUint32(at, lmsk?.length ?? 0, false); at += 4;
    if (lmsk) { psd.set(lmsk, at); at += lmsk.length; }
    dv.setUint16(at, 0, false);             // raw image data; the colour channels stay zero
    at += 2;
    for (let j = 0; j < extras; j++) for (let i = 0; i < width * height; i++) psd[at + (3 + j) * width * height + i] = bytes[info.stripAt + i * info.samples + 3 + j];
    const base = file.name.replace(/\.tiff?$/i, '');
    const read = await readPsdFile(new File([psd], `${base}.psd`));
    return read.doc.layers.length ? read : null;
  } catch {
    return null;
  }
}

/** The document as a little-endian TIFF with the composite and its PSD layers in tag 37724. */
export async function writeLayeredTiff(doc: Doc, composite: Surface, paths: PathSet | null = null): Promise<{ blob: Blob; notes: string[] }> {
  const { bytes, notes } = await writePsdFile(doc, composite, false, paths);
  const psd = new Uint8Array(bytes), pv = new DataView(bytes);
  let at = 26;
  at += 4 + pv.getUint32(at, false);   // colour mode data
  at += 4 + pv.getUint32(at, false);   // image resources
  const sectionLen = pv.getUint32(at, false), sectionEnd = at + 4 + sectionLen;
  at += 4;
  let layerInfo = new Uint8Array(0), mask = new Uint8Array(0);
  if (sectionLen >= 4) {
    const li = pv.getUint32(at, false);
    layerInfo = psd.subarray(at + 4, at + 4 + li);
    at += 4 + li;
    if (at + 4 <= sectionEnd) {
      const gm = pv.getUint32(at, false);
      mask = psd.subarray(at + 4, Math.min(at + 4 + gm, sectionEnd));
    }
  }

  const pad4 = (n: number): number => (n + 3) & ~3;
  const layrLen = pad4(layerInfo.length), maskLen = pad4(mask.length);
  const data = new Uint8Array(PREFIX.length + 12 + layrLen + (mask.length ? 12 + maskLen : 0)), dv = new DataView(data.buffer);
  for (let i = 0; i < PREFIX.length; i++) data[i] = PREFIX.charCodeAt(i);
  let p = PREFIX.length;
  const put = (key: string, body: Uint8Array, len: number): void => {
    for (let i = 0; i < 4; i++) { data[p + i] = '8BIM'.charCodeAt(i); data[p + 4 + i] = key.charCodeAt(i); }
    dv.setUint32(p + 8, len, false);
    data.set(body, p + 12);
    p += 12 + len;
  };
  put('Layr', layerInfo, layrLen);
  if (mask.length) put('LMsk', mask, maskLen);

  const { width, height } = doc;
  const img = ctxOf(composite).getImageData(0, 0, width, height).data;
  // Alpha and spot channels follow the composite's alpha as extra samples; their names and colours travel in tag 34377, the PSD's image resources.
  const alphas = (doc.alphas ?? []).slice(0, 50), spp = 4 + alphas.length, pixels = new Uint8Array(width * height * spp);
  for (let i = 0; i < width * height; i++) pixels.set(img.subarray(i * 4, i * 4 + 4), i * spp);
  alphas.forEach((a, k) => {
    const m = a.mask;
    if (!m) return;
    for (let y = Math.max(0, m.y); y < Math.min(height, m.y + m.h); y++) for (let x = Math.max(0, m.x); x < Math.min(width, m.x + m.w); x++) pixels[(y * width + x) * spp + 4 + k] = m.data[(y - m.y) * m.w + (x - m.x)];
  });
  const resStart = 26 + 4 + pv.getUint32(26, false), resources = psd.subarray(resStart + 4, resStart + 4 + pv.getUint32(resStart, false));
  let exifBlock = metaWritable(doc.meta) ? exifBlockOf(doc.meta) : null;
  if (exifBlock && exifBlock[0] !== 0x49) {   // a big-endian block cannot sit in this little-endian file; its camera record goes in its place
    exifBlock = doc.meta?.camera ? buildExifBlock(doc.meta.camera) : null;
    notes.push('The picture\'s Exif block is big-endian, so the TIFF carries its camera record without the rest (GPS included).');
  }
  const probe = exifBlock && exifBlock.length <= 64000 ? exifForTiff(exifBlock, 0) : null;
  const count = 12 + (probe?.entries.length ?? 0) + (resources.length ? 1 : 0), ifdSize = 2 + count * 12 + 4;
  const bpsAt = 8 + ifdSize, extraAt = bpsAt + spp * 2, resAt = extraAt + (1 + alphas.length) * 2;
  const exifAt = resAt + resources.length + (resources.length & 1), exifLen = probe && exifBlock ? exifBlock.length + (exifBlock.length & 1) : 0;
  const dataAt = exifAt + exifLen, dataPad = data.length + (data.length & 1), stripAt = dataAt + dataPad;
  const exifTiff = probe && exifBlock ? exifForTiff(exifBlock, exifAt) : null;
  const out = new Uint8Array(stripAt + pixels.length), ov = new DataView(out.buffer);
  out[0] = 0x49; out[1] = 0x49;
  ov.setUint16(2, 42, true);
  ov.setUint32(4, 8, true);
  const list: Array<{ tag: number; type: number; count: number; value: number | Uint8Array }> = [
    { tag: 256, type: 4, count: 1, value: width }, { tag: 257, type: 4, count: 1, value: height }, { tag: 258, type: 3, count: spp, value: bpsAt }, { tag: 259, type: 3, count: 1, value: 1 },
    { tag: 262, type: 3, count: 1, value: 2 }, { tag: 273, type: 4, count: 1, value: stripAt }, { tag: 277, type: 3, count: 1, value: spp }, { tag: 278, type: 4, count: 1, value: height },
    { tag: 279, type: 4, count: 1, value: pixels.length }, { tag: 284, type: 3, count: 1, value: 1 }, { tag: 338, type: 3, count: 1 + alphas.length, value: alphas.length === 0 ? 2 : alphas.length === 1 ? Uint8Array.of(2, 0, 0, 0) : extraAt },
    { tag: TAG_IMAGE_SOURCE_DATA, type: 7, count: data.length, value: dataAt },
    ...(resources.length ? [{ tag: 34377, type: 1, count: resources.length, value: resAt }] : []),
    ...(exifTiff?.entries ?? []).map((x) => ({ tag: x.tag, type: x.type, count: x.count, value: x.value })),
  ];
  list.sort((a, b) => a.tag - b.tag);
  ov.setUint16(8, list.length, true);
  list.forEach((x, i) => {
    const e = 10 + i * 12;
    ov.setUint16(e, x.tag, true); ov.setUint16(e + 2, x.type, true); ov.setUint32(e + 4, x.count, true);
    if (x.value instanceof Uint8Array) out.set(x.value, e + 8);
    else if (x.type === 3 && x.count === 1) ov.setUint16(e + 8, x.value, true);
    else ov.setUint32(e + 8, x.value, true);
  });
  for (let i = 0; i < spp; i++) ov.setUint16(bpsAt + i * 2, 8, true);
  if (alphas.length) { ov.setUint16(extraAt, 2, true); for (let i = 0; i < alphas.length; i++) ov.setUint16(extraAt + 2 + i * 2, 0, true); }
  out.set(resources, resAt);
  if (exifTiff) out.set(exifTiff.bytes, exifAt);
  out.set(data, dataAt);
  out.set(pixels, stripAt);
  return { blob: new Blob([out], { type: 'image/tiff' }), notes };
}
