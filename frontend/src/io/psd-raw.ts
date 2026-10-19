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

const LEVELS_HEAD = 2 + 29 * 10;

/** The layer writer gives a Levels block 63 level records, where the format has 29 and then an optional 'Lvls' tail that
 *  counts any more. Each such block is cut to the 29 records and given the tail (count 29), the form other readers
 *  take; the file comes back unchanged when its layer section cannot be followed. */
export function conformLevels(bytes: ArrayBuffer): ArrayBuffer {
  try {
    const v = new DataView(bytes), big = v.getUint16(4) === 2, lenSize = big ? 8 : 4, keep = LEVELS_HEAD + 8;
    const cm = 26 + 4 + v.getUint32(26), res = cm + 4 + v.getUint32(cm), infoAt = res + lenSize;
    let at = infoAt + lenSize;
    const count = Math.abs(v.getInt16(at)), cuts: Array<{ lenAt: number; sizeAt: number; body: number; len: number }> = [];
    at += 2;
    for (let i = 0; i < count; i++) {
      const channels = v.getUint16(at + 16);
      at += 18 + channels * (2 + lenSize) + 4 + 4 + 4;
      const lenAt = at, extraEnd = at + 4 + v.getUint32(at);
      at += 4;
      at += 4 + v.getUint32(at);
      at += 4 + v.getUint32(at);
      at += (1 + v.getUint8(at) + 3) & ~3;
      while (at + 12 <= extraEnd) {
        const sig = String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3)), key = String.fromCharCode(v.getUint8(at + 4), v.getUint8(at + 5), v.getUint8(at + 6), v.getUint8(at + 7));
        const wide = big && (sig === '8B64' || LARGE.has(key)), len = wide ? Number(v.getBigUint64(at + 8)) : v.getUint32(at + 8), body = at + 8 + (wide ? 8 : 4);
        if (key === 'levl' && !wide && len > keep && body + len <= extraEnd) cuts.push({ lenAt, sizeAt: at + 8, body, len });
        at = body + len + (len % 2);
      }
      at = extraEnd;
    }
    if (!cuts.length) return bytes;
    const drop = cuts.reduce((n, c) => n + c.len - keep, 0), out = new Uint8Array(bytes.byteLength - drop), ov = new DataView(out.buffer);
    let from = 0, to = 0, shift = 0;
    for (const c of cuts) {
      const head = c.body + LEVELS_HEAD - from;
      out.set(new Uint8Array(bytes, from, head), to);
      to += head;
      out.set([0x4c, 0x76, 0x6c, 0x73, 0, 3, 0, 29], to);
      to += 8;
      ov.setUint32(c.lenAt - shift, ov.getUint32(c.lenAt - shift) - (c.len - keep));
      ov.setUint32(c.sizeAt - shift, keep);
      shift += c.len - keep;
      from = c.body + c.len;
    }
    out.set(new Uint8Array(bytes, from), to);
    for (const p of [res, infoAt]) {
      if (big) ov.setBigUint64(p, ov.getBigUint64(p) - BigInt(drop));
      else ov.setUint32(p, ov.getUint32(p) - drop);
    }
    return out.buffer;
  } catch { return bytes; }
}

/** The layer writer has a key for a bevel's gloss contour (TrnS) and none for its edge contour (MpgS). A layer whose edge
 *  curve was written in the gloss slot has that key renamed in place, so the bytes keep their length. */
export function edgeContourKeys(buf: ArrayBuffer, psd: Psd, layers: ReadonlySet<PsdLayer>): ArrayBuffer {
  if (!layers.size) return buf;
  const b = new Uint8Array(buf), code = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));
  const find = (pat: number[], from: number, to: number): number => {
    for (let i = from; i + pat.length <= to; i++) { let k = 0; while (k < pat.length && b[i + k] === pat[k]) k++; if (k === pat.length) return i; }
    return -1;
  };
  for (const [pl, found] of layerBlockSpans(buf, psd, new Set(['lfx2', 'lmfx']))) {
    const span = found.get('lfx2') ?? found.get('lmfx');
    if (!span || !layers.has(pl)) continue;
    const end = span.at + span.len, bevel = find([...code('ebbl'), ...code('Objc')], span.at, end), gloss = bevel < 0 ? -1 : find([...code('TrnS'), ...code('Objc')], bevel, end);
    if (gloss >= 0) b.set(code('MpgS'), gloss);
  }
  return buf;
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
  for (const [pl, blocks] of layerBlockSpans(buf, psd, new Set(['lfx2', 'lfxs', 'lmfx']))) {
    const span = blocks.get('lfx2') ?? blocks.get('lmfx');
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

export interface PatternFillRaw { link: boolean; angle: number; scale: number }

/** The link flag, angle (degrees) and scale (a fraction) a pattern fill layer keeps beside its pattern, read from its 'PtFl' descriptor. */
export function readPatternFills(buf: ArrayBuffer, psd: Psd): Map<PsdLayer, Partial<PatternFillRaw>> {
  const out = new Map<PsdLayer, Partial<PatternFillRaw>>();
  for (const [pl, blocks] of layerBlockSpans(buf, psd, new Set(['PtFl']))) {
    const span = blocks.get('PtFl');
    if (!span || span.len < 12) continue;
    try {
      const r = new Reader(buf.slice(span.at, span.at + span.len));
      r.skip(4);
      const root = readDescriptor(r), lnkd = root.items.get('Lnkd'), angl = numOf(root.items.get('Angl')), scl = numOf(root.items.get('Scl '));
      const d: Partial<PatternFillRaw> = {};
      if (typeof lnkd === 'boolean') d.link = lnkd;
      if (angl !== undefined) d.angle = angl;
      if (scl !== undefined && scl > 0) d.scale = scl / 100;
      out.set(pl, d);
    } catch { /* a descriptor this reader cannot follow */ }
  }
  return out;
}

const PATTERN_ITEMS = 13 + 24 + 24;

/** The layer writer's pattern fill descriptor has a link field it rejects as a boolean and no angle or scale. Each listed layer's
 *  'PtFl' descriptor gets the three items appended (Lnkd as a boolean, Angl in degrees, Scl in percent), with its item count and
 *  every length above it (block, layer record, layer section) corrected; the file comes back unchanged when it cannot be followed. */
export function patternFillItems(bytes: ArrayBuffer, psd: Psd, fills: ReadonlyMap<PsdLayer, PatternFillRaw>): ArrayBuffer {
  if (!fills.size) return bytes;
  try {
    const v = new DataView(bytes), big = v.getUint16(4) === 2, lenSize = big ? 8 : 4;
    const cm = 26 + 4 + v.getUint32(26), res = cm + 4 + v.getUint32(cm), infoAt = res + lenSize;
    let at = infoAt + lenSize;
    const count = Math.abs(v.getInt16(at)), order: Array<PsdLayer | null> = [], cuts: Array<{ lenAt: number; sizeAt: number; countAt: number; ins: number; end: number; len: number; fill: PatternFillRaw }> = [];
    at += 2;
    recordOrder(psd.children, order);
    if (order.length !== count) return bytes;
    for (let i = 0; i < count; i++) {
      const channels = v.getUint16(at + 16);
      at += 18 + channels * (2 + lenSize) + 4 + 4 + 4;
      const lenAt = at, extraEnd = at + 4 + v.getUint32(at);
      at += 4;
      at += 4 + v.getUint32(at);
      at += 4 + v.getUint32(at);
      at += (1 + v.getUint8(at) + 3) & ~3;
      while (at + 12 <= extraEnd) {
        const sig = String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3)), key = String.fromCharCode(v.getUint8(at + 4), v.getUint8(at + 5), v.getUint8(at + 6), v.getUint8(at + 7));
        const wide = big && (sig === '8B64' || LARGE.has(key)), len = wide ? Number(v.getBigUint64(at + 8)) : v.getUint32(at + 8), body = at + 8 + (wide ? 8 : 4), pl = order[i], fill = pl ? fills.get(pl) : undefined;
        if (key === 'PtFl' && !wide && fill && body + len <= extraEnd) {
          let o = body + 4;
          o += 4 + v.getUint32(o) * 2;
          const cls = v.getUint32(o);
          o += 4 + (cls || 4);
          const r = new Reader(bytes.slice(body, body + len));
          r.skip(4);
          readDescriptor(r);
          cuts.push({ lenAt, sizeAt: at + 8, countAt: o, ins: body + r.pos, end: body + len, len, fill });
        }
        at = body + len + (len % 2);
      }
      at = extraEnd;
    }
    if (!cuts.length) return bytes;
    const add = (c: { len: number }): number => PATTERN_ITEMS + ((c.len + PATTERN_ITEMS) % 2) - (c.len % 2), grow = cuts.reduce((n, c) => n + add(c), 0), out = new Uint8Array(bytes.byteLength + grow), ov = new DataView(out.buffer), text = new TextEncoder();
    let from = 0, to = 0, shift = 0;
    for (const c of cuts) {
      const head = c.ins - from;
      out.set(new Uint8Array(bytes, from, head), to);
      to += head;
      const put = (s: string): void => { out.set(text.encode(s), to); to += s.length; };
      const unit = (key: string, u: string, val: number): void => { ov.setUint32(to, 0); to += 4; put(key); put('UntF'); put(u); ov.setFloat64(to, val); to += 8; };
      ov.setUint32(to, 0); to += 4; put('Lnkd'); put('bool'); out[to++] = c.fill.link ? 1 : 0;
      unit('Angl', '#Ang', c.fill.angle);
      unit('Scl ', '#Prc', c.fill.scale * 100);
      out.set(new Uint8Array(bytes, c.ins, c.end - c.ins), to);
      to += c.end - c.ins;
      if ((c.len + PATTERN_ITEMS) % 2) out[to++] = 0;
      ov.setUint32(c.lenAt + shift, ov.getUint32(c.lenAt + shift) + add(c));
      ov.setUint32(c.sizeAt + shift, c.len + PATTERN_ITEMS + ((c.len + PATTERN_ITEMS) % 2));
      ov.setUint32(c.countAt + shift, ov.getUint32(c.countAt + shift) + 3);
      from = c.end + (c.len % 2);
      shift += add(c);
    }
    out.set(new Uint8Array(bytes, from), to);
    for (const p of [res, infoAt]) {
      if (big) ov.setBigUint64(p, ov.getBigUint64(p) + BigInt(grow));
      else ov.setUint32(p, ov.getUint32(p) + grow);
    }
    return out.buffer;
  } catch { return bytes; }
}
