// Layered TIFF (DEV_PLAN 34.2): Photoshop's layers carried in a TIFF's ImageSourceData tag (37724), read and written here.
import { readPsdFile, writePsdFile } from './psd';
import { ctxOf, type Doc, type Surface } from '../engine';
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

interface TiffInfo { block: Uint8Array | null; width: number; height: number }

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
  let block: Uint8Array | null = null, width = 0, height = 0;
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > bytes.length) return null;
    const tag = dv.getUint16(e, le), type = dv.getUint16(e + 2, le), count = dv.getUint32(e + 4, le);
    const size = (TYPE_SIZE[type] ?? 1) * count;
    const at = size <= 4 ? e + 8 : dv.getUint32(e + 8, le);
    if (tag === 256 || tag === 257) {
      const v = type === 3 ? dv.getUint16(e + 8, le) : dv.getUint32(e + 8, le);
      if (tag === 256) width = v; else height = v;
    } else if (tag === TAG_IMAGE_SOURCE_DATA) {
      if (at + size > bytes.length) return null;
      block = bytes.subarray(at, at + size);
    }
  }
  return { block, width, height };
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
    const { width, height } = info, channels = 3;
    const pixels = width * height * channels;
    const layerSection = 4 + layr.length + 4 + (lmsk?.length ?? 0);
    const total = 26 + 4 + 4 + 4 + layerSection + 2 + pixels;
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
    dv.setUint32(at, 0, false); at += 4;    // image resources
    dv.setUint32(at, layerSection, false); at += 4;
    dv.setUint32(at, layr.length, false); at += 4;
    psd.set(layr, at); at += layr.length;
    dv.setUint32(at, lmsk?.length ?? 0, false); at += 4;
    if (lmsk) { psd.set(lmsk, at); at += lmsk.length; }
    dv.setUint16(at, 0, false);             // raw image data; the channels stay zero
    const base = file.name.replace(/\.tiff?$/i, '');
    const read = await readPsdFile(new File([psd], `${base}.psd`));
    return read.doc.layers.length ? read : null;
  } catch {
    return null;
  }
}

/** The document as a little-endian TIFF with the composite and its Photoshop layers in tag 37724. */
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
  const entries = 12, ifdSize = 2 + entries * 12 + 4;
  const bpsAt = 8 + ifdSize, dataAt = bpsAt + 8, dataPad = data.length + (data.length & 1), stripAt = dataAt + dataPad;
  const out = new Uint8Array(stripAt + img.length), ov = new DataView(out.buffer);
  out[0] = 0x49; out[1] = 0x49;
  ov.setUint16(2, 42, true);
  ov.setUint32(4, 8, true);
  ov.setUint16(8, entries, true);
  let e = 10;
  const entry = (tag: number, type: number, count: number, value: number): void => {
    ov.setUint16(e, tag, true); ov.setUint16(e + 2, type, true); ov.setUint32(e + 4, count, true);
    if (type === 3 && count === 1) ov.setUint16(e + 8, value, true); else ov.setUint32(e + 8, value, true);
    e += 12;
  };
  entry(256, 4, 1, width);
  entry(257, 4, 1, height);
  entry(258, 3, 4, bpsAt);
  entry(259, 3, 1, 1);
  entry(262, 3, 1, 2);
  entry(273, 4, 1, stripAt);
  entry(277, 3, 1, 4);
  entry(278, 4, 1, height);
  entry(279, 4, 1, img.length);
  entry(284, 3, 1, 1);
  entry(338, 3, 1, 2);   // unassociated alpha
  entry(TAG_IMAGE_SOURCE_DATA, 7, data.length, dataAt);
  ov.setUint32(e, 0, true);
  for (let i = 0; i < 4; i++) ov.setUint16(bpsAt + i * 2, 8, true);
  out.set(data, dataAt);
  out.set(img, stripAt);
  return { blob: new Blob([out], { type: 'image/tiff' }), notes };
}
