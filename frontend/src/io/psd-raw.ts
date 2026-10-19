import type { EffectContour, Layer as PsdLayer, Psd } from 'ag-psd';
import { Reader, readDescriptor } from './atn';
import type { Desc, Val } from './atn';

/** What the layer reader merges or drops, read from the layer records themselves: the Bevel & Emboss gloss contour
 *  (TrnS) apart from its edge contour (MpgS), the contour range, and the texture settings of the 'lfx2' effects block. */

const LARGE = new Set(['LMsk', 'Lr16', 'Lr32', 'Layr', 'Mt16', 'Mt32', 'Mtrn', 'Alph', 'FMsk', 'lnk2', 'FEid', 'FXid', 'PxSD']);

export interface BevelDetail {
  gloss?: EffectContour;
  edge?: EffectContour;
  range?: number;
  useShape?: boolean;
  useTexture?: boolean;
  antiAlias?: boolean;
  texture?: { patternId?: string; scale: number; depth: number; invert: boolean; link: boolean };
}

export function recordOrder(children: PsdLayer[] | undefined, out: Array<PsdLayer | null>): void {
  for (const pl of children ?? []) {
    if (pl.children) { out.push(null); recordOrder(pl.children, out); out.push(pl); } else out.push(pl);
  }
}

/** Where each wanted tagged block sits in the file, per layer. */
export function layerBlockSpans(buf: ArrayBuffer, psd: Psd, wanted: ReadonlySet<string>): Map<PsdLayer, Map<string, { at: number; len: number }>> {
  const out = new Map<PsdLayer, Map<string, { at: number; len: number }>>();
  try {
    const v = new DataView(buf), big = v.getUint16(4) === 2, cm = 26 + 4 + v.getUint32(26), res = cm + 4 + v.getUint32(cm), lenSize = big ? 8 : 4;
    let at = res + lenSize;
    const infoLen = big ? Number(v.getBigUint64(at)) : v.getUint32(at);
    at += lenSize;
    if (!infoLen) return out;
    const count = Math.abs(v.getInt16(at)), order: Array<PsdLayer | null> = [];
    at += 2;
    recordOrder(psd.children, order);
    if (order.length !== count) return out;
    for (let i = 0; i < count; i++) {
      const channels = v.getUint16(at + 16);
      at += 18 + channels * (2 + lenSize) + 4 + 4 + 4;
      const extraEnd = at + 4 + v.getUint32(at);
      at += 4;
      at += 4 + v.getUint32(at);
      at += 4 + v.getUint32(at);
      at += (1 + v.getUint8(at) + 3) & ~3;
      while (at + 12 <= extraEnd) {
        const sig = String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3)), key = String.fromCharCode(v.getUint8(at + 4), v.getUint8(at + 5), v.getUint8(at + 6), v.getUint8(at + 7));
        const wide = big && (sig === '8B64' || LARGE.has(key)), len = wide ? Number(v.getBigUint64(at + 8)) : v.getUint32(at + 8), body = at + 8 + (wide ? 8 : 4);
        const pl = order[i];
        if (pl && wanted.has(key)) { let m = out.get(pl); if (!m) { m = new Map(); out.set(pl, m); } m.set(key, { at: body, len }); }
        at = body + len + (len % 2);
      }
      at = extraEnd;
    }
  } catch { /* a layer section this scan cannot follow */ }
  return out;
}

const isDesc = (v: Val | undefined): v is Desc => !!v && typeof v === 'object' && !Array.isArray(v) && 'items' in v;
const numOf = (v: Val | undefined): number | undefined => {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && !Array.isArray(v) && 'kind' in v && v.kind === 'unit') return v.value;
  return undefined;
};

function contourOf(v: Val | undefined): EffectContour | undefined {
  if (!isDesc(v)) return undefined;
  const list = v.items.get('Crv ');
  if (!Array.isArray(list)) return undefined;
  const curve = list.flatMap((p) => { if (!isDesc(p)) return []; const x = numOf(p.items.get('Hrzn')), y = numOf(p.items.get('Vrtc')); return x === undefined || y === undefined ? [] : [{ x, y }]; });
  const name = v.items.get('Nm  ');
  return curve.length >= 2 ? { name: typeof name === 'string' ? name : '', curve } : undefined;
}

/** The Bevel & Emboss details of every layer whose effects block holds a bevel. */
export function readBevelDetails(buf: ArrayBuffer, psd: Psd): Map<PsdLayer, BevelDetail> {
  const out = new Map<PsdLayer, BevelDetail>();
  for (const [pl, blocks] of layerBlockSpans(buf, psd, new Set(['lfx2', 'lfxs']))) {
    const span = blocks.get('lfx2');
    if (!span || span.len < 12) continue;
    try {
      const r = new Reader(buf.slice(span.at, span.at + span.len));
      r.skip(8);
      const root = readDescriptor(r), be = root.items.get('ebbl');
      if (!isDesc(be)) continue;
      const bool = (k: string): boolean | undefined => { const x = be.items.get(k); return typeof x === 'boolean' ? x : undefined; };
      const d: BevelDetail = {};
      const gloss = contourOf(be.items.get('TrnS')), edge = contourOf(be.items.get('MpgS')), rng = numOf(be.items.get('Inpr'));
      if (gloss) d.gloss = gloss;
      if (edge) d.edge = edge;
      if (rng !== undefined) d.range = Math.min(1, Math.max(0.01, rng / 100));
      d.useShape = bool('useShape') === true;
      d.useTexture = bool('useTexture') === true;
      if (bool('antialiasGloss') === true) d.antiAlias = true;
      if (d.useTexture) {
        const ptrn = be.items.get('Ptrn'), id = isDesc(ptrn) ? ptrn.items.get('Idnt') : undefined, scl = numOf(be.items.get('Scl ')), dp = numOf(be.items.get('Dpth'));
        d.texture = { patternId: typeof id === 'string' ? id : undefined, scale: scl === undefined ? 1 : Math.min(10, Math.max(0.01, scl / 100)), depth: dp === undefined ? 1 : Math.min(10, Math.max(-10, dp / 100)), invert: be.items.get('InvT') === true, link: be.items.get('Algn') !== false };
      }
      out.set(pl, d);
    } catch { /* a descriptor this reader cannot follow */ }
  }
  return out;
}
