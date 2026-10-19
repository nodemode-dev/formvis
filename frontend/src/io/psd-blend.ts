import type { Layer as PsdLayer, Psd } from 'ag-psd';

/** Channel restrictions ('brst') of a PSD's layers. The layer reader stops one entry short of the list, so the list is
 *  read here from the layer records: for each layer, the red, green and blue channels it may blend into. */

const LARGE = new Set(['LMsk', 'Lr16', 'Lr32', 'Layr', 'Mt16', 'Mt32', 'Mtrn', 'Alph', 'FMsk', 'lnk2', 'FEid', 'FXid', 'PxSD']);

/** The layers in the order of the file's layer records: a folder is its closing divider, its layers, then itself. */
function recordOrder(children: PsdLayer[] | undefined, out: Array<PsdLayer | null>): void {
  for (const pl of children ?? []) {
    if (pl.children) { out.push(null); recordOrder(pl.children, out); out.push(pl); } else out.push(pl);
  }
}

export function readChannelRestrictions(buf: ArrayBuffer, psd: Psd): Map<PsdLayer, [boolean, boolean, boolean]> {
  const out = new Map<PsdLayer, [boolean, boolean, boolean]>();
  try {
    const v = new DataView(buf), big = v.getUint16(4) === 2, cm = 26 + 4 + v.getUint32(26), res = cm + 4 + v.getUint32(cm), lenSize = big ? 8 : 4;
    let at = res + lenSize;   // the layer section's length, then the layer info's
    const infoLen = big ? Number(v.getBigUint64(at)) : v.getUint32(at);
    at += lenSize;
    if (!infoLen) return out;
    const count = Math.abs(v.getInt16(at)), order: Array<PsdLayer | null> = [];
    at += 2;
    recordOrder(psd.children, order);
    if (order.length !== count) return out;
    for (let i = 0; i < count; i++) {
      const channels = v.getUint16(at + 16);
      at += 18 + channels * (2 + lenSize) + 4 + 4 + 4;   // box, channel count and infos, '8BIM', blend key, opacity to flags
      const extraEnd = at + 4 + v.getUint32(at);
      at += 4;
      at += 4 + v.getUint32(at);   // the layer mask data
      at += 4 + v.getUint32(at);   // the blending ranges
      at += (1 + v.getUint8(at) + 3) & ~3;   // the name, padded to four
      while (at + 12 <= extraEnd) {
        const sig = String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3)), key = String.fromCharCode(v.getUint8(at + 4), v.getUint8(at + 5), v.getUint8(at + 6), v.getUint8(at + 7));
        const wide = big && (sig === '8B64' || LARGE.has(key)), len = wide ? Number(v.getBigUint64(at + 8)) : v.getUint32(at + 8), body = at + 8 + (wide ? 8 : 4);
        if (key === 'brst' && order[i]) {
          const on: [boolean, boolean, boolean] = [true, true, true];
          for (let p = body; p + 4 <= body + len; p += 4) { const c = v.getInt32(p); if (c >= 0 && c <= 2) on[c] = false; }
          if (!on.every(Boolean)) out.set(order[i] as PsdLayer, on);
        }
        at = body + len + (len % 2);
      }
      at = extraEnd;
    }
  } catch { /* a layer section this scan cannot follow */ }
  return out;
}
