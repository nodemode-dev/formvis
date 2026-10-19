import type { BlendMode } from '../engine/types';

/* A PSD or PSB read a band of rows at a time (PC-IO-0035), for a file whose layers are too large for one canvas. Only the
   header, the layer records and the byte counts of run-length rows are read up front; a layer's pixels are decoded from
   the file's own bytes, a band of rows from each channel, so no plane of a whole layer is ever held. Raw and run-length
   channels, 8 and 16 bits, RGB and Grayscale; the 4-byte row counts and 8-byte lengths of the large format are read as
   such. This module touches no canvas and no engine code, so a script can run it on a file. */

/** Where the bytes come from: a file's slices in the page, any reader in a script. A read past the end is shorter. */
export interface PsbSource { readonly size: number; read(start: number, length: number): Promise<Uint8Array> }

export const blobSource = (b: Blob): PsbSource => ({ size: b.size, read: async (s, n) => new Uint8Array(await b.slice(s, Math.min(b.size, s + n)).arrayBuffer()) });

export interface PsbHeader { big: boolean; channels: number; width: number; height: number; depth: number; mode: number }

export interface PsbChannel { id: number; at: number; length: number }

export interface PsbLayer {
  name: string; top: number; left: number; width: number; height: number; opacity: number; blend: BlendMode | 'pass'; hidden: boolean; clipping: boolean;
  /** 0 a layer, 1 an open folder's own record, 2 a closed folder's, 3 the marker that begins a folder (read bottom to top). */
  section: 0 | 1 | 2 | 3; channels: PsbChannel[]; keys: string[]; masked: boolean;
}

export interface PsbStructure { layers: PsbLayer[]; compositeAt: number; resourcesEnd: number }

/** One channel's decoding plan: how it is stored and where each row starts. */
export interface PsbPlan { id: number; comp: number; start: number; offsets: Float64Array | null }

const BIG_KEYS = new Set(['LMsk', 'Lr16', 'Lr32', 'Layr', 'Mt16', 'Mt32', 'Mtrn', 'Alph', 'FMsk', 'lnk2', 'FEid', 'FXid', 'PxSD']);
const SIGNATURES = new Set([0x3842494d, 0x38423634]);
const BLEND: Record<string, BlendMode | 'pass'> = {
  norm: 'normal', dark: 'darken', 'mul ': 'multiply', idiv: 'color-burn', lite: 'lighten', scrn: 'screen', 'div ': 'color-dodge', lddg: 'linear-dodge', over: 'overlay',
  sLit: 'soft-light', hLit: 'hard-light', diff: 'difference', smud: 'exclusion', 'hue ': 'hue', 'sat ': 'saturation', colr: 'color', 'lum ': 'luminosity', diss: 'dissolve',
  lbrn: 'linear-burn', dkCl: 'darker-color', lgCl: 'lighter-color', vLit: 'vivid-light', lLit: 'linear-light', pLit: 'pin-light', hMix: 'hard-mix', fsub: 'subtract', fdiv: 'divide', pass: 'pass',
};
/** Layer blocks that mean a layer holds settings and no pixels formvis can use here, and the ones whose effect is left out. */
export const SETTINGS_ONLY = new Set(['levl', 'curv', 'brit', 'blnc', 'blwh', 'hue2', 'hue ', 'selc', 'mixr', 'grdm', 'phfl', 'expA', 'thrs', 'nvrt', 'post', 'vibA', 'clrL', 'SoCo', 'GdFl', 'PtFl']);

const dv = (b: Uint8Array): DataView => new DataView(b.buffer, b.byteOffset, b.byteLength);
const ascii = (b: Uint8Array, o: number, n: number): string => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(b[o + i] ?? 0); return s; };

/** A window over the source that refills in large reads, so thousands of small fields cost a few reads. */
class Reader {
  private start = 0;
  private buf: Uint8Array = new Uint8Array(0);
  constructor(private readonly src: PsbSource) {}
  async bytes(at: number, n: number): Promise<Uint8Array> {
    if (at < this.start || at + n > this.start + this.buf.length) { this.buf = await this.src.read(at, Math.max(n, 1 << 22)); this.start = at; }
    const part = this.buf.subarray(at - this.start, at - this.start + n);
    if (part.length === n) return part;
    const out = new Uint8Array(n);
    out.set(part);
    return out;
  }
  async u32(at: number): Promise<number> { return dv(await this.bytes(at, 4)).getUint32(0); }
  async u64(at: number): Promise<number> { return Number(dv(await this.bytes(at, 8)).getBigUint64(0)); }
}

export async function peekHeader(src: PsbSource): Promise<PsbHeader | null> {
  if (src.size < 26) return null;
  const b = await src.read(0, 26);
  if (b.length < 26) return null;
  const v = dv(b), version = v.getUint16(4);
  if (v.getUint32(0) !== 0x38425053 || (version !== 1 && version !== 2)) return null;
  return { big: version === 2, channels: v.getUint16(12), height: v.getUint32(14), width: v.getUint32(18), depth: v.getUint16(22), mode: v.getUint16(24) };
}

function parseExtra(x: Uint8Array, big: boolean): { pascal: string; unicode: string; section: 0 | 1 | 2 | 3; blend: string; keys: string[]; masked: boolean } {
  const v = dv(x), out = { pascal: '', unicode: '', section: 0 as 0 | 1 | 2 | 3, blend: '', keys: [] as string[], masked: false };
  let o = 0;
  const maskLen = o + 4 <= x.length ? v.getUint32(o) : 0;
  out.masked = maskLen > 0;
  o += 4 + maskLen;
  const rangeLen = o + 4 <= x.length ? v.getUint32(o) : 0;
  o += 4 + rangeLen;
  const nameLen = x[o] ?? 0;
  out.pascal = ascii(x, o + 1, nameLen);
  o += (1 + nameLen + 3) & ~3;
  while (o + 12 <= x.length && SIGNATURES.has(v.getUint32(o))) {
    const key = ascii(x, o + 4, 4), wide = big && BIG_KEYS.has(key), len = wide ? Number(v.getBigUint64(o + 8)) : v.getUint32(o + 8), d = o + 8 + (wide ? 8 : 4);
    if (key === 'luni' && d + 4 <= x.length) {
      const n = Math.min(v.getUint32(d), (x.length - d - 4) >> 1);
      let s = '';
      for (let i = 0; i < n; i++) s += String.fromCharCode(v.getUint16(d + 4 + i * 2));
      out.unicode = s.replace(/\0+$/, '');
    } else if ((key === 'lsct' || key === 'lsdk') && d + 4 <= x.length) {
      const t = v.getUint32(d);
      out.section = t >= 1 && t <= 3 ? (t as 1 | 2 | 3) : 0;
      if (len >= 12 && SIGNATURES.has(v.getUint32(d + 4))) out.blend = ascii(x, d + 8, 4);
    } else out.keys.push(key);
    o = d + len;
    if (o + 4 <= x.length && !SIGNATURES.has(v.getUint32(o))) { const aligned = (o + 3) & ~3; if (aligned + 4 <= x.length && SIGNATURES.has(v.getUint32(aligned))) o = aligned; }
  }
  return out;
}

/** The layer records of the file and where each channel's data starts; the image resources end and the merged image's start. */
export async function readStructure(src: PsbSource, h: PsbHeader): Promise<PsbStructure> {
  const r = new Reader(src), wide = h.big ? 8 : 4, lenAt = (at: number): Promise<number> => (h.big ? r.u64(at) : r.u32(at));
  let at = 26;
  at += 4 + (await r.u32(at));
  at += 4 + (await r.u32(at));
  const resourcesEnd = at, sectionLen = await lenAt(at);
  at += wide;
  const sectionEnd = at + sectionLen;
  if (sectionLen < wide) return { layers: [], compositeAt: sectionEnd, resourcesEnd };
  const infoLen = await lenAt(at);
  let count = 0, p = at + wide;
  if (infoLen > 0) { count = Math.abs(dv(await r.bytes(p, 2)).getInt16(0)); p += 2; } else {
    let g = at + wide;
    g += 4 + (await r.u32(g));
    while (g + 12 <= sectionEnd) {
      const sig = await r.u32(g), key = ascii(await r.bytes(g + 4, 4), 0, 4);
      if (!SIGNATURES.has(sig)) break;
      const wideKey = h.big && BIG_KEYS.has(key), len = wideKey ? await r.u64(g + 8) : await r.u32(g + 8), d = g + 8 + (wideKey ? 8 : 4);
      if (key === 'Lr16' || key === 'Lr32' || key === 'Layr') { count = Math.abs(dv(await r.bytes(d, 2)).getInt16(0)); p = d + 2; break; }
      g = d + ((len + 3) & ~3);
    }
  }
  const layers: PsbLayer[] = [];
  for (let i = 0; i < count; i++) {
    const head = dv(await r.bytes(p, 18)), top = head.getInt32(0), left = head.getInt32(4), bottom = head.getInt32(8), right = head.getInt32(12), nch = head.getUint16(16);
    p += 18;
    const infos = dv(await r.bytes(p, nch * (2 + wide))), channels: PsbChannel[] = [];
    for (let c = 0; c < nch; c++) channels.push({ id: infos.getInt16(c * (2 + wide)), at: 0, length: h.big ? Number(infos.getBigUint64(c * 10 + 2)) : infos.getUint32(c * 6 + 2) });
    p += nch * (2 + wide);
    const tail = await r.bytes(p, 16), tv = dv(tail), key = ascii(tail, 4, 4), extraLen = tv.getUint32(12);
    p += 16;
    const extra = parseExtra(await r.bytes(p, Math.min(extraLen, 1 << 24)), h.big);
    p += extraLen;
    const blend = BLEND[extra.blend || key] ?? 'normal';
    layers.push({ name: extra.unicode || extra.pascal || 'Layer', top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top), opacity: tail[8] / 255, blend, hidden: (tail[10] & 2) !== 0, clipping: tail[9] === 1, section: extra.section, channels, keys: extra.keys, masked: extra.masked });
  }
  let d = p;
  for (const l of layers) for (const c of l.channels) { c.at = d; d += c.length; }
  return { layers, compositeAt: sectionEnd, resourcesEnd };
}

const u16At = async (src: PsbSource, at: number): Promise<number> => dv(await src.read(at, 2)).getUint16(0);

/** How each colour and alpha channel of a layer is stored; a plan whose `comp` is above 1 (ZIP) is not read in bands. */
export async function planLayer(src: PsbSource, h: PsbHeader, l: PsbLayer): Promise<PsbPlan[]> {
  const out: PsbPlan[] = [];
  if (l.width <= 0 || l.height <= 0) return out;
  for (const c of l.channels) {
    if (c.length < 2 || c.id < -1 || c.id > 2) continue;
    const comp = await u16At(src, c.at);
    if (comp === 1) {
      const w = h.big ? 4 : 2, table = dv(await src.read(c.at + 2, l.height * w)), offsets = new Float64Array(l.height + 1);
      let o = c.at + 2 + l.height * w;
      for (let y = 0; y < l.height; y++) { offsets[y] = o; o += w === 4 ? table.getUint32(y * 4) : table.getUint16(y * 2); }
      offsets[l.height] = o;
      out.push({ id: c.id, comp, start: c.at + 2, offsets });
    } else out.push({ id: c.id, comp, start: c.at + 2, offsets: null });
  }
  return out;
}

/** How the merged image at the end of the file stores its colour channels (planar, all rows of one channel after another). */
export async function planComposite(src: PsbSource, h: PsbHeader, at: number): Promise<PsbPlan[]> {
  const comp = await u16At(src, at), bps = h.depth >> 3, n = Math.min(h.channels, 3), out: PsbPlan[] = [];
  if (comp === 1) {
    const w = h.big ? 4 : 2, rows = h.channels * h.height, table = dv(await src.read(at + 2, rows * w)), offsets = new Float64Array(rows + 1);
    let o = at + 2 + rows * w;
    for (let y = 0; y < rows; y++) { offsets[y] = o; o += w === 4 ? table.getUint32(y * 4) : table.getUint16(y * 2); }
    offsets[rows] = o;
    for (let c = 0; c < n; c++) out.push({ id: c, comp, start: 0, offsets: offsets.subarray(c * h.height, (c + 1) * h.height + 1) });
  } else for (let c = 0; c < n; c++) out.push({ id: c, comp, start: at + 2 + c * h.height * h.width * bps, offsets: null });
  return out;
}

function unpackBits(src: Uint8Array, i: number, end: number, dst: Uint8Array, o: number, n: number): void {
  const stop = o + n;
  while (i < end && o < stop) {
    const c = (src[i++] << 24) >> 24;
    if (c >= 0) {
      const k = c + 1, take = Math.min(k, stop - o);
      dst.set(src.subarray(i, i + take), o);
      o += take;
      i += k;
    } else if (c !== -128) {
      const k = Math.min(1 - c, stop - o), v = src[i++];
      dst.fill(v, o, o + k);
      o += k;
    }
  }
}

async function channelRows(src: PsbSource, plan: PsbPlan, rowBytes: number, y0: number, y1: number): Promise<Uint8Array> {
  const out = new Uint8Array((y1 - y0) * rowBytes);
  if (!plan.offsets) {
    const got = await src.read(plan.start + y0 * rowBytes, out.length);
    out.set(got.subarray(0, out.length));
    return out;
  }
  const a = plan.offsets[y0], z = plan.offsets[y1], data = await src.read(a, z - a);
  for (let y = y0; y < y1; y++) unpackBits(data, plan.offsets[y] - a, plan.offsets[y + 1] - a, out, (y - y0) * rowBytes, rowBytes);
  return out;
}

/** Rows y0 up to y1 of a layer (or the merged image) as 8-bit RGBA, straight alpha: grey replicated, 16 bits scaled to 8,
 *  alpha 255 where the plans hold none. */
export async function readBand(src: PsbSource, h: PsbHeader, plans: readonly PsbPlan[], width: number, y0: number, y1: number): Promise<Uint8ClampedArray<ArrayBuffer>> {
  const bps = h.depth >> 3, n = (y1 - y0) * width, rowBytes = width * bps, planes = new Map<number, Uint8Array>();
  for (const pl of plans) if (pl.comp <= 1) planes.set(pl.id, await channelRows(src, pl, rowBytes, y0, y1));
  const grey = h.mode === 1, R = planes.get(0), G = grey ? R : planes.get(1), B = grey ? R : planes.get(2), A = planes.get(-1), out = new Uint8ClampedArray(n * 4);
  if (bps === 1) {
    for (let i = 0, o = 0; i < n; i++, o += 4) { out[o] = R ? R[i] : 0; out[o + 1] = G ? G[i] : 0; out[o + 2] = B ? B[i] : 0; out[o + 3] = A ? A[i] : 255; }
  } else {
    const at = (p: Uint8Array | undefined, i: number, dflt: number): number => (p ? ((((p[i * 2] << 8) | p[i * 2 + 1]) + 128) / 257) | 0 : dflt);
    for (let i = 0, o = 0; i < n; i++, o += 4) { out[o] = at(R, i, 0); out[o + 1] = at(G, i, 0); out[o + 2] = at(B, i, 0); out[o + 3] = at(A, i, 255); }
  }
  return out;
}

/** Whether the image resources hold a resolution (resource 1005), in pixels per inch, from the bytes of that block. */
export function resolutionOf(block: Uint8Array | undefined): number | null {
  if (!block || block.length < 10) return null;
  const v = dv(block), ppi = (v.getInt32(0) / 65536) * (v.getUint16(4) === 2 ? 2.54 : 1);
  return ppi >= 1 && ppi <= 65535 ? Math.round(ppi * 100) / 100 : null;
}
