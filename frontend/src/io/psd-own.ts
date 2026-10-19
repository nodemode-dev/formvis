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
