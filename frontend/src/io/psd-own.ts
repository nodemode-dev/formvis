import type { Layer as PsdLayer, Psd } from 'ag-psd';
import { ADJUSTMENT_LABELS } from '../engine';
import type { Adjustment, AdjustmentKind } from '../engine/types';
import { layerBlockSpans, recordOrder } from './psd-raw';

/** Tagged blocks formvis writes into the layer records of its own PSD and PSB files. `fvSF` holds a smart object's whole
 *  smart filter stack as JSON, written when the stack has a filter the format has no record for (Camera Raw, for one);
 *  `fvAJ` holds an adjustment layer the format has no layer for (Develop, which is the Camera Raw adjustment) next to an
 *  empty layer record. Other readers skip a key they do not know; formvis reads them back, so the filter stays editable. */
export const SMART_STACK_KEY = 'fvSF';
export const ADJUSTMENT_KEY = 'fvAJ';

/** The adjustment an `fvAJ` block holds, or null when it is not one formvis has. */
export function adjustmentFromBlock(raw: unknown): Adjustment | null {
  const a = raw && typeof raw === 'object' ? (raw as { adjustment?: { kind?: unknown; data?: unknown } }).adjustment : undefined;
  return a && typeof a.kind === 'string' && a.kind in ADJUSTMENT_LABELS && a.data && typeof a.data === 'object' ? { kind: a.kind as AdjustmentKind, data: a.data as Record<string, unknown> } : null;
}

export interface OwnBlock { key: string; json: unknown }

const text = new TextEncoder();

function blockBytes(b: OwnBlock): Uint8Array {
  const body = text.encode(JSON.stringify(b.json)), size = (4 + body.length + 3) & ~3, out = new Uint8Array(12 + size), v = new DataView(out.buffer);
  out.set(text.encode('8BIM'), 0);
  out.set(text.encode(b.key), 4);
  v.setUint32(8, size);
  v.setUint32(12, body.length);
  out.set(body, 16);
  return out;
}

/** `bytes`, a PSD or PSB written by the layer writer, with each block of `blocks` added to its layer's record. The layer
 *  records are matched to `root` in the file's order; the file comes back unchanged when they do not line up. */
export function addLayerBlocks(bytes: ArrayBuffer, root: PsdLayer[], blocks: ReadonlyMap<PsdLayer, OwnBlock>): ArrayBuffer {
  if (!blocks.size) return bytes;
  try {
    const v = new DataView(bytes), big = v.getUint16(4) === 2, lenSize = big ? 8 : 4;
    const cm = 26 + 4 + v.getUint32(26), res = cm + 4 + v.getUint32(cm), infoAt = res + lenSize;
    let at = infoAt + lenSize;
    const count = Math.abs(v.getInt16(at)), order: Array<PsdLayer | null> = [];
    at += 2;
    recordOrder(root, order);
    if (order.length !== count) return bytes;
    const cuts: Array<{ pos: number; lenAt: number; add: Uint8Array }> = [];
    for (let i = 0; i < count; i++) {
      const channels = v.getUint16(at + 16);
      at += 18 + channels * (2 + lenSize) + 4 + 4 + 4;
      const lenAt = at, end = at + 4 + v.getUint32(at), pl = order[i], blk = pl ? blocks.get(pl) : undefined;
      if (blk) cuts.push({ pos: end, lenAt, add: blockBytes(blk) });
      at = end;
    }
    if (!cuts.length) return bytes;
    const total = cuts.reduce((n, c) => n + c.add.length, 0), out = new Uint8Array(bytes.byteLength + total), ov = new DataView(out.buffer);
    let from = 0, to = 0, shift = 0;
    for (const c of cuts) {
      out.set(new Uint8Array(bytes, from, c.pos - from), to);
      to += c.pos - from;
      from = c.pos;
      out.set(c.add, to);
      to += c.add.length;
      ov.setUint32(c.lenAt + shift, ov.getUint32(c.lenAt + shift) + c.add.length);
      shift += c.add.length;
    }
    out.set(new Uint8Array(bytes, from), to);
    for (const p of [res, infoAt]) {
      if (big) ov.setBigUint64(p, ov.getBigUint64(p) + BigInt(total));
      else ov.setUint32(p, ov.getUint32(p) + total);
    }
    return out.buffer;
  } catch { return bytes; }
}

/** The JSON of the block `key` on each layer of `psd` that has one, read from the file's own records. */
export function readLayerBlocks(buf: ArrayBuffer, psd: Psd, key: string): Map<PsdLayer, unknown> {
  const out = new Map<PsdLayer, unknown>();
  for (const [pl, found] of layerBlockSpans(buf, psd, new Set([key]))) {
    const span = found.get(key);
    if (!span || span.len < 4) continue;
    try {
      const n = new DataView(buf, span.at, span.len).getUint32(0);
      if (n <= span.len - 4) out.set(pl, JSON.parse(new TextDecoder().decode(new Uint8Array(buf, span.at + 4, n))));
    } catch { /* a block this reader cannot parse */ }
  }
  return out;
}

/** `fvCA`: a layer's appearance in each layer comp (opacity, blend, fill, layer style and whether the style shows), as
 *  JSON keyed by the comp's number in the file's list. The format's own comp record holds visibility and position only. */
export const COMP_APPEARANCE_KEY = 'fvCA';

export interface MeasureScale { pixels: number; length: number; units: string }

/** Image resource 1074, the measurement scale: a version-16 descriptor of the pixel length, the logical length and its unit. */
export function measureScaleBytes(sc: MeasureScale): Uint8Array {
  const out: number[] = [];
  const u32 = (n: number): void => { out.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255); };
  const tag = (s: string): void => { for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 255); };
  const key = (s: string): void => { u32(s.length === 4 ? 0 : s.length); tag(s); };
  const f64 = (n: number): void => { out.push(...new Uint8Array(new Float64Array([n]).buffer).reverse()); };
  const unicode = (s: string): void => { u32(s.length + 1); for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) >> 8, s.charCodeAt(i) & 255); out.push(0, 0); };
  u32(16); unicode(''); key('null'); u32(3);
  key('pixelLength'); tag('doub'); f64(sc.pixels);
  key('logicalLength'); tag('doub'); f64(sc.length);
  key('logicalUnits'); tag('TEXT'); unicode(sc.units);
  return new Uint8Array(out);
}

/** The measurement scale in image resource 1074, or null where the data is not a descriptor holding all three values. */
export function measureScaleFrom(d: Uint8Array): MeasureScale | null {
  try {
    const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
    let at = 0;
    const u32 = (): number => { const n = v.getUint32(at); at += 4; return n; };
    const tag = (n: number): string => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(v.getUint8(at + i)); at += n; return s; };
    const key = (): string => { const n = u32(); return tag(n || 4); };
    const unicode = (): string => { const n = u32(); let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(v.getUint16(at + i * 2)); at += n * 2; return s.replace(/\0+$/, ''); };
    if (u32() !== 16) return null;
    unicode(); key();
    const n = u32(), got = new Map<string, number | string>();
    if (n > 64) return null;
    for (let i = 0; i < n; i++) {
      const k = key(), t = tag(4);
      if (t === 'doub') { got.set(k, v.getFloat64(at)); at += 8; }
      else if (t === 'long') { got.set(k, v.getInt32(at)); at += 4; }
      else if (t === 'UntF') { tag(4); got.set(k, v.getFloat64(at)); at += 8; }
      else if (t === 'TEXT') got.set(k, unicode());
      else return null;
    }
    const pixels = got.get('pixelLength'), length = got.get('logicalLength'), units = got.get('logicalUnits');
    return typeof pixels === 'number' && typeof length === 'number' && typeof units === 'string' && pixels > 0 && length > 0 && Number.isFinite(pixels) && Number.isFinite(length) ? { pixels, length, units: units.slice(0, 32) || 'units' } : null;
  } catch { return null; }
}

type FilterEffectMask = NonNullable<PsdLayer['filterEffectsMasks']>[number];

/** A smart filter mask as the layer's filter effects record: one 8 bit plane, white showing the filters, uncompressed. */
export function filterEffectMask(id: string, width: number, height: number, gray: Uint8Array): FilterEffectMask {
  return { id, top: 0, left: 0, bottom: height, right: width, depth: 8, channels: [{ compressionMode: 0, data: gray }] };
}

/** The first plane of a filter effects record as 8 bit grey: stored raw, or deflated with or without row prediction. */
export async function filterMaskPlane(fe: FilterEffectMask): Promise<{ width: number; height: number; gray: Uint8Array } | null> {
  const width = fe.right - fe.left, height = fe.bottom - fe.top, ch = fe.channels.find((c) => c);
  if (!ch || fe.depth !== 8 || width < 1 || height < 1 || width * height > 1 << 28) return null;
  let data = ch.data;
  if (ch.compressionMode === 2 || ch.compressionMode === 3) {
    try { data = new Uint8Array(await new Response(new Blob([new Uint8Array(data)]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer()); } catch { return null; }
    if (ch.compressionMode === 3) for (let y = 0; y < height; y++) for (let x = 1; x < width; x++) data[y * width + x] = (data[y * width + x] + data[y * width + x - 1]) & 255;
  } else if (ch.compressionMode !== 0) return null;
  return data.length >= width * height ? { width, height, gray: data.subarray(0, width * height) } : null;
}
