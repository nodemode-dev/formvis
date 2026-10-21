/* The read direction of the container and object graph reader from the schist project (https://github.com/infrawrench/schist,
 * crates/codec-affinity: archive.rs, graph.rs, import/bitmap.rs, import/layers.rs, import/mod.rs), ported to TypeScript.
 * Copyright (c) 2026 Infrawrench LLC, MIT License (see NOTICE.md). The file format notes there (affinity-format.md) are the
 * source of every field tag below. Everything in the file is untrusted: each size, count, offset and depth is bounded. */

export class AfError extends Error {}

const MAX_ENTRY = 1 << 28;
const MAX_ENTRIES = 1 << 21;
const MAX_FATS = 10000;
const MAX_NODES = 1 << 22;
const MAX_ARRAY = 1 << 24;
const MAX_DEPTH = 200;
const MAX_LAYER_PIXELS = 1 << 26;
const MAX_TOTAL_PIXELS = 3 << 26;
const MAX_TOTAL_BYTES = 1 << 29;
const MAX_LAYERS = 4000;

const bad = (m: string): AfError => new AfError(m);

class Cursor {
  readonly v: DataView;
  pos = 0;
  constructor(readonly b: Uint8Array) { this.v = new DataView(b.buffer, b.byteOffset, b.byteLength); }
  need(n: number): void { if (!(n >= 0) || this.pos + n > this.b.length) throw bad(`truncated at ${this.pos}`); }
  u8(): number { this.need(1); return this.b[this.pos++]; }
  u16(): number { this.need(2); const r = this.v.getUint16(this.pos, true); this.pos += 2; return r; }
  u32(): number { this.need(4); const r = this.v.getUint32(this.pos, true); this.pos += 4; return r; }
  f32(): number { this.need(4); const r = this.v.getFloat32(this.pos, true); this.pos += 4; return r; }
  f64(): number { this.need(8); const r = this.v.getFloat64(this.pos, true); this.pos += 8; return r; }
  u64(): number { this.need(8); const r = Number(this.v.getBigUint64(this.pos, true)); this.pos += 8; return r; }
  i64(): number { this.need(8); const r = Number(this.v.getBigInt64(this.pos, true)); this.pos += 8; return r; }
  take(n: number): Uint8Array { this.need(n); const r = this.b.subarray(this.pos, this.pos + n); this.pos += n; return r; }
  seek(p: number): void { if (!(p >= 0) || p > this.b.length || !Number.isSafeInteger(p)) throw bad(`offset ${p} is outside the file`); this.pos = p; }
  left(): number { return this.b.length - this.pos; }
}

const lit = (s: string): number => (s.charCodeAt(0) | (s.charCodeAt(1) << 8) | (s.charCodeAt(2) << 16) | (s.charCodeAt(3) << 24)) >>> 0;
const T_INF = lit('#Inf'), T_PROT = lit('Prot'), T_THMB = lit('Thmb'), T_FIL = lit('#Fil');
const T_FATS = new Set([lit('#FAT'), lit('#FT2'), lit('#FT3'), lit('#FT4')]);
const T_FAT = lit('#FAT'), T_FT2 = lit('#FT2'), T_FT4 = lit('#FT4');

export const isAfBytes = (b: Uint8Array): boolean => b.length >= 4 && b[0] === 0x00 && b[1] === 0xff && b[2] === 0x4b && b[3] === 0x41;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();

export function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface AfEntry { id: number; flag: number; offset: number; size: number; csize: number; crc: number; comp: number; savepoint: number }

export class AfArchive {
  readonly entries: AfEntry[] = [];
  readonly names = new Map<string, number>();
  readonly heads = new Map<number, number>();
  private thumbAt = 0;
  private spent = 0;
  constructor(readonly bytes: Uint8Array) {
    if (!isAfBytes(bytes)) throw bad('not an .af file');
    const c = new Cursor(bytes);
    c.pos = 4;
    const version = c.u16(), flags = c.u16();
    c.u32();
    if (version < 7 || version > 12) throw bad(`container version ${version} is not known`);
    if (flags & 3) throw bad(`header flags ${flags} are not known`);
    if (c.u32() !== T_INF) throw bad('no #Inf block');
    const fatAt = c.u64();
    this.thumbAt = c.u64();
    c.u64(); c.u64(); c.u64(); c.u32(); c.u32();
    if (version > 7) { if (c.u32() !== T_PROT) throw bad('no Prot block'); c.u32(); }
    this.readFats(c, fatAt);
    this.entries.forEach((e, at) => {
      const cur = this.heads.get(e.id);
      if (cur === undefined || e.savepoint >= this.entries[cur].savepoint) this.heads.set(e.id, at);
    });
  }

  private readFats(c: Cursor, first: number): void {
    let off = first, seen = 0;
    while (off !== 0) {
      if (++seen > MAX_FATS) throw bad('the file table chain does not end');
      c.seek(off);
      const tag = c.u32();
      if (!T_FATS.has(tag)) throw bad('bad file table tag');
      const next = c.u64(), savepoint = c.u64();
      c.u64(); c.u64(); c.u64();
      const files = c.u32();
      c.u32(); c.u32();
      const dirs = c.u16();
      c.u8();
      for (let i = 0; i < files; i++) {
        if (this.entries.length >= MAX_ENTRIES) throw bad('too many entries');
        const id = c.u32(), flag = c.u8();
        if (flag > 2) throw bad(`bad entry flag ${flag}`);
        const e: AfEntry = { id, flag, offset: 0, size: 0, csize: 0, crc: 0, comp: 0, savepoint };
        if (flag !== 2) {
          e.offset = c.u64(); e.size = c.u64(); e.csize = c.u64(); e.crc = c.u32(); e.comp = c.u8();
          if (tag !== T_FAT) c.u32();
          if (tag === T_FT4) c.u32();
          if (tag === T_FAT || tag === T_FT2) e.comp = e.comp === 1 ? 0x01 : e.comp === 2 ? 0x41 : e.comp === 3 ? 0x81 : e.comp === 4 ? 0xc1 : 0;
        }
        if (flag === 0) {
          const name = new TextDecoder().decode(c.take(c.u16()));
          const had = this.names.get(name);
          if (had !== undefined && had !== id) throw bad('a name maps to two ids');
          if (had === undefined) this.names.set(name, id);
        }
        this.entries.push(e);
      }
      for (let i = 0; i < dirs; i++) {
        const len = c.u16(), extra = c.u16();
        c.u64(); c.take(len);
        if (extra !== 0) throw bad('unexpected directory payload');
      }
      off = next;
    }
  }

  head(name: string): AfEntry | null {
    const id = this.names.get(name);
    if (id === undefined) return null;
    const at = this.heads.get(id);
    if (at === undefined) return null;
    const e = this.entries[at];
    return e.flag === 2 ? null : e;
  }

  thumbnail(): Uint8Array | null {
    if (!this.thumbAt) return null;
    try {
      const c = new Cursor(this.bytes);
      c.seek(this.thumbAt);
      if (c.u32() !== 0xffffffff || c.u32() !== T_THMB) return null;
      c.u32();
      const block = c.take(c.u32());
      const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
      for (let i = 0; i + 8 <= block.length; i++) {
        let ok = true;
        for (let k = 0; k < 8 && ok; k++) ok = block[i + k] === sig[k];
        if (ok) return block.subarray(i);
      }
    } catch { return null; }
    return null;
  }

  async extract(e: AfEntry): Promise<Uint8Array> {
    if (e.size === 0) throw bad('empty entry');
    if (e.size > MAX_ENTRY) throw bad(`an entry declares ${e.size} bytes`);
    this.spent += e.size;
    if (this.spent > MAX_TOTAL_BYTES) throw bad('the file expands past the limit');
    const c = new Cursor(this.bytes);
    c.seek(e.offset);
    if (c.u32() !== T_FIL) throw bad('entry does not point at a #Fil block');
    const algo = e.comp & 3;
    let flag = (e.comp >> 5) & 1, type: number;
    switch (e.comp & 0xc0) {
      case 0x40: flag = 0; type = 1; break;
      case 0x80: type = 2; break;
      case 0xc0: type = 3; break;
      default: flag = 0; type = 0;
    }
    let plain: Uint8Array;
    if (algo === 1) plain = await inflate(c.take(e.csize), e.size);
    else if (algo === 2) {
      const { decompress } = await import('fzstd');
      try { plain = decompress(c.take(e.csize), new Uint8Array(e.size)); } catch (err) { throw bad(`zstd: ${err instanceof Error ? err.message : err}`); }
    } else if (algo === 0) plain = c.take(e.size).slice();
    else throw bad('unknown compression');
    if (plain.length !== e.size) throw bad('an entry expanded to the wrong size');
    if (flag === 0) {
      if (type === 1) undoDelta8(plain);
      if (type === 2) undoDelta16(plain);
    } else if (type === 2) {
      undoDelta8(plain);
      if (plain.length === 0x10000) plain = unplane16(plain);
    }
    if (crc32(plain) !== e.crc) throw bad('an entry fails its checksum');
    return plain;
  }
}

async function inflate(raw: Uint8Array, limit: number): Promise<Uint8Array> {
  const reader = new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  const out = new Uint8Array(limit);
  let n = 0;
  for (;;) {
    let r: ReadableStreamReadResult<Uint8Array>;
    try { r = await reader.read(); } catch { throw bad('zlib data is damaged'); }
    if (r.done) break;
    if (n + r.value.length > limit) { await reader.cancel().catch(() => undefined); throw bad('zlib data expands past its declared size'); }
    out.set(r.value, n);
    n += r.value.length;
  }
  return n === limit ? out : out.subarray(0, n);
}

function undoDelta8(d: Uint8Array): void { let a = 0; for (let i = 0; i < d.length; i++) { a = (a + d[i]) & 0xff; d[i] = a; } }
function undoDelta16(d: Uint8Array): void {
  let a = 0;
  for (let i = 0; i + 1 < d.length; i += 2) { a = (a + (d[i] | (d[i + 1] << 8))) & 0xffff; d[i] = a & 0xff; d[i + 1] = a >> 8; }
}
function unplane16(d: Uint8Array): Uint8Array {
  const o = new Uint8Array(0x10000);
  for (let k = 0; k < 0x4000; k++) { o[4 * k + 1] = d[2 * k]; o[4 * k + 3] = d[2 * k + 1]; o[4 * k] = d[0x8000 + 2 * k]; o[4 * k + 2] = d[0x8000 + 2 * k + 1]; }
  return o;
}

export interface AfEnum { t: 'enum'; id: number; ver: number }
export interface AfEmbedded { t: 'emb'; name: string }
export interface AfClass { t: 'cls'; i: number | null }
export type AfValue = number | boolean | string | Uint8Array | number[] | AfEnum | AfEmbedded | AfClass | AfValue[];
export interface AfNode { types: [string, number][]; f: [string, AfValue][]; id: number }
export interface AfGraph { nodes: AfNode[] }

const tagName = (c: Cursor): string => { const b = c.take(4); return String.fromCharCode(b[3], b[2], b[1], b[0]); };

export function parseGraph(bytes: Uint8Array): AfGraph {
  const c = new Cursor(bytes);
  if (c.u32() !== 0x534bff00) throw bad('not an object graph');
  const fileVer = c.u16();
  const rootTag = tagName(c);
  const typeVer = c.u16();
  if (fileVer > 2) throw bad(`object graph version ${fileVer} is not known`);
  if (fileVer === 2) c.u32();
  const nodes: AfNode[] = [{ types: [[rootTag, typeVer]], f: [], id: 0 }];
  const byId = new Map<number, number>();
  let depth = 0;
  const push = (n: AfNode): number => { if (nodes.length >= MAX_NODES) throw bad('too many objects'); nodes.push(n); return nodes.length - 1; };

  const scalars = (array: boolean, read: () => AfValue): AfValue => {
    if (!array) return read();
    const n = c.u32();
    if (n > c.left()) throw bad('array count exceeds the data');
    const out: AfValue[] = [];
    for (let i = 0; i < n; i++) out.push(read());
    return out;
  };
  const vec = (n: number, read: () => number): (() => AfValue) => () => { const v: number[] = []; for (let i = 0; i < n; i++) v.push(read()); return v; };

  const fields = (withTags: boolean): [string, AfValue][] => {
    if (++depth > MAX_DEPTH) throw bad('objects nest too deep');
    const out: [string, AfValue][] = [];
    for (;;) {
      const tb = c.u8(), array = (tb & 0x80) !== 0, ty = tb & 0x7f;
      if (ty === 0) { depth--; return out; }
      if (!withTags && ((ty >= 0x30 && ty <= 0x33) || ty === 0x75)) throw bad('untagged class field');
      const tag = withTags ? tagName(c) : '';
      out.push([tag, value(ty, array)]);
    }
  };

  const value = (ty: number, array: boolean): AfValue => {
    switch (ty) {
      case 0x01: return scalars(array, () => c.u8());
      case 0x02: return scalars(array, () => c.u16());
      case 0x03: case 0x2f: case 0x34: return scalars(array, () => c.u32());
      case 0x04: return scalars(array, () => c.u64());
      case 0x05: return scalars(array, () => (c.u8() << 24) >> 24);
      case 0x06: return scalars(array, () => (c.u16() << 16) >> 16);
      case 0x07: return scalars(array, () => c.u32() | 0);
      case 0x08: return scalars(array, () => c.i64());
      case 0x09: return scalars(array, () => c.f32());
      case 0x0a: return scalars(array, () => c.f64());
      case 0x29: {
        if (!array) return c.u8() !== 0;
        const n = c.u32();
        if (n > MAX_ARRAY) throw bad('boolean array too large');
        const b = c.take(Math.ceil(n / 8));
        const out: boolean[] = [];
        for (let i = 0; i < n; i++) out.push(((b[i >> 3] >> (i & 7)) & 1) !== 0);
        return out;
      }
      case 0x2a: {
        if (!array) { const id = c.u16(), ver = c.u16(); return { t: 'enum', id, ver }; }
        const n = c.u32(), ver = c.u16();
        if (n > c.left()) throw bad('enum count exceeds the data');
        const out: AfEnum[] = [];
        for (let i = 0; i < n; i++) out.push({ t: 'enum', id: c.u16(), ver });
        return out;
      }
      case 0x2b: case 0x2e: {
        const one = (): string => new TextDecoder().decode(c.take(c.u32()));
        if (!array) return one();
        c.u32();
        const n = c.u32();
        if (n > c.left()) throw bad('string count exceeds the data');
        const out: string[] = [];
        for (let i = 0; i < n; i++) out.push(one());
        return out;
      }
      case 0x2c: {
        const n = array ? c.u32() : 1, size = c.u16();
        if (![12, 16, 18, 24, 32].includes(size)) throw bad('unknown curve record size');
        if (n * size > c.left()) throw bad('curve count exceeds the data');
        const out: Uint8Array[] = [];
        for (let i = 0; i < n; i++) out.push(c.take(size));
        return array ? out : out[0];
      }
      case 0x2d: { if (array) throw bad('binary arrays do not occur'); return c.take(c.u32()); }
      case 0x30: case 0x31: case 0x32: return classes(ty, array);
      case 0x33: { if (array) throw bad('embedded arrays do not occur'); c.u32(); return { t: 'emb', name: new TextDecoder().decode(c.take(c.u32())) }; }
      case 0x75: {
        if (array) throw bad('flag-set arrays do not occur');
        c.u16();
        const n = c.u8();
        if (n > 8) throw bad('flag set too wide');
        c.take(n);
        return 0;
      }
      default:
    }
    if (ty >= 0x15 && ty <= 0x19) return scalars(array, vec(ty - 0x15 + 2, () => c.u32() | 0));
    if (ty >= 0x1f && ty <= 0x23) return scalars(array, vec(ty - 0x1f + 2, () => c.f32()));
    if (ty >= 0x24 && ty <= 0x28) return scalars(array, vec(ty - 0x24 + 2, () => c.f64()));
    if (ty >= 0x35 && ty <= 0x74) { const n = ty - 0x34; return scalars(array, () => c.take(n)); }
    throw bad(`unknown field type ${ty}`);
  };

  const classes = (ty: number, array: boolean): AfValue => {
    let count = 1, shared: [string, number] | null = null;
    if (array) {
      count = c.u32();
      if (ty === 0x32) shared = [tagName(c), c.u16()];
      if (count > c.left()) throw bad('class count exceeds the data');
    }
    const items: AfClass[] = [];
    for (let i = 0; i < count; i++) items.push({ t: 'cls', i: ty === 0x30 ? untagged() : ty === 0x31 ? shared31() : tagged(shared) });
    return array ? items : items[0];
  };

  const untagged = (): number => push({ types: [], f: fields(false), id: 0 });

  const tagged = (shared: [string, number] | null): number | null => {
    const st = c.u8();
    if (st === 0) return null;
    if (st !== 1) throw bad('unknown class flag');
    let t: string, v: number;
    if (shared) [t, v] = shared; else { t = tagName(c); v = c.u16(); }
    return push({ types: [[t, v]], f: fields(true), id: 0 });
  };

  const shared31 = (): number | null => {
    const st = c.u8();
    if (st === 0) return null;
    if (st === 2) {
      const at = byId.get(c.u32());
      if (at === undefined) throw bad('link to an undefined object');
      return at;
    }
    if (st !== 1) throw bad('unknown class flag');
    const id = c.u32();
    if (byId.has(id)) throw bad('object defined twice');
    const index = push({ types: [], f: [], id });
    byId.set(id, index);
    for (;;) {
      const s = c.u8();
      if (s === 0) {
        const t = tagName(c), v = c.u16();
        const fs = fields(true);
        nodes[index].types.push([t, v]);
        nodes[index].f.push(...fs);
      } else if (s === 1) { nodes[index].types.push([tagName(c), 0]); break; }
      else if (s === 2) break;
      else throw bad('unknown type section flag');
    }
    nodes[index].f.push(...fields(true));
    return index;
  };

  nodes[0].f = fields(true);
  return { nodes };
}

export const field = (n: AfNode, tag: string): AfValue | undefined => { for (const [t, v] of n.f) if (t === tag) return v; return undefined; };
export const typeTag = (n: AfNode): string => n.types[0]?.[0] ?? '';
export const child = (g: AfGraph, n: AfNode, tag: string): AfNode | null => {
  const v = field(n, tag);
  if (v && typeof v === 'object' && !Array.isArray(v) && (v as AfClass).t === 'cls' && (v as AfClass).i !== null) return g.nodes[(v as AfClass).i as number];
  return null;
};
export const children = (g: AfGraph, n: AfNode, tag: string): AfNode[] => {
  const v = field(n, tag);
  const out: AfNode[] = [];
  if (Array.isArray(v)) for (const x of v) { const k = x as AfClass; if (k && k.t === 'cls' && k.i !== null) out.push(g.nodes[k.i]); }
  return out;
};
const num = (n: AfNode, tag: string): number | undefined => { const v = field(n, tag); return typeof v === 'number' ? v : undefined; };
const bool = (n: AfNode, tag: string): boolean | undefined => { const v = field(n, tag); return typeof v === 'boolean' ? v : undefined; };
const str = (n: AfNode, tag: string): string | undefined => { const v = field(n, tag); return typeof v === 'string' ? v : undefined; };
const enm = (n: AfNode, tag: string): AfEnum | undefined => { const v = field(n, tag); return v && typeof v === 'object' && !Array.isArray(v) && (v as AfEnum).t === 'enum' ? (v as AfEnum) : undefined; };
const nums = (n: AfNode, tag: string, len: number): number[] | undefined => { const v = field(n, tag); return Array.isArray(v) && v.length >= len && v.slice(0, len).every((x) => typeof x === 'number') ? (v.slice(0, len) as number[]) : undefined; };

export type Mat = [number, number, number, number, number, number];
export const matThen = (a: Mat, b: Mat): Mat => [
  a[0] * b[0] + a[1] * b[3], a[0] * b[1] + a[1] * b[4], a[0] * b[2] + a[1] * b[5] + a[2],
  a[3] * b[0] + a[4] * b[3], a[3] * b[1] + a[4] * b[4], a[3] * b[2] + a[4] * b[5] + a[5],
];

export type AfDecodeImage = (bytes: Uint8Array) => Promise<{ width: number; height: number; rgba: Uint8ClampedArray } | null>;

export interface AfBitmap { width: number; height: number; rgba: Uint8ClampedArray }
export interface AfLayer {
  name: string; kind: 'raster' | 'group'; visible: boolean; opacity: number;
  blend: { id: number; ver: number } | null; isolated: boolean; map: Mat;
  bitmap?: AfBitmap; children?: AfLayer[]; clipped?: AfLayer[];
}
export interface AfModel {
  width: number; height: number; layers: AfLayer[];
  leftOut: { name: string; what: string }[]; notes: string[]; thumbnail: Uint8Array | null; rasterCount: number; version: number;
}

const FORMATS: Record<number, { bps: number; ch: number; kind: 'rgba' | 'gray' | 'cmyk' | 'mask' }> = {
  0: { bps: 1, ch: 4, kind: 'rgba' }, 1: { bps: 2, ch: 4, kind: 'rgba' }, 2: { bps: 1, ch: 2, kind: 'gray' }, 3: { bps: 2, ch: 2, kind: 'gray' },
  4: { bps: 1, ch: 5, kind: 'cmyk' }, 6: { bps: 1, ch: 1, kind: 'mask' }, 9: { bps: 4, ch: 4, kind: 'rgba' },
};

const statusesOf = (n: AfNode): number[] => {
  const out: number[] = [];
  for (const t of ['Sta1', 'Sta2', 'Sta3', 'Sta4', 'Sta5']) { const v = field(n, t); if (Array.isArray(v)) for (const x of v) if (typeof x === 'number') out.push(x); }
  return out;
};

const tilePayload = (data: Uint8Array): Uint8Array | null => {
  if (data.length === 0x10000) return data;
  try {
    const g = parseGraph(data);
    for (const [, v] of g.nodes[0].f) if (v instanceof Uint8Array && v.length === 0x10000) return v;
  } catch { return null; }
  return null;
};

class Budget { pixels = 0; layers = 0; }

async function decodeBitmap(a: AfArchive, g: AfGraph, bm: AfNode, budget: Budget, decode: AfDecodeImage | undefined): Promise<AfBitmap> {
  const fe = enm(bm, 'Frmt');
  const fmt = fe ? FORMATS[fe.id] : undefined;
  if (!fmt) throw bad(`pixel format ${fe ? fe.id : '?'} is not read`);
  const width = num(bm, 'BmpW') ?? 0, height = num(bm, 'BmpH') ?? 0;
  if (!(width > 0) || !(height > 0) || width > 1 << 20 || height > 1 << 20 || !Number.isInteger(width) || !Number.isInteger(height)) throw bad(`implausible bitmap ${width} by ${height}`);
  if (width * height > MAX_LAYER_PIXELS) throw bad('the bitmap is larger than formvis reads from this format');
  budget.pixels += width * height;
  if (budget.pixels > MAX_TOTAL_PIXELS) throw bad('the layers together are larger than formvis reads from this format');
  const rowBytes = width * fmt.bps, pitch = Math.ceil(rowBytes / 256) * 256, rows = Math.ceil(height / 256) * 256;
  if (pitch * rows * fmt.ch > 1 << 29) throw bad('the bitmap is larger than formvis reads from this format');
  const sta = statusesOf(bm);

  const source = async (): Promise<AfBitmap> => {
    const emb = field(bm, 'Bckg');
    if (!emb || typeof emb !== 'object' || Array.isArray(emb) || (emb as AfEmbedded).t !== 'emb') throw bad('no source image');
    const e = a.head((emb as AfEmbedded).name);
    if (!e) throw bad('the source image entry is missing');
    const sg = parseGraph(await a.extract(e));
    const blob = field(sg.nodes[0], 'Data');
    if (!(blob instanceof Uint8Array)) throw bad('the source entry has no file data');
    const img = decode ? await decode(blob) : null;
    if (!img) throw bad('the source image could not be decoded');
    if (img.width !== width || img.height !== height) throw bad('the source image does not match the bitmap');
    return img;
  };
  if (sta.length === 0 && field(bm, 'Bckg') !== undefined) return source();
  const src = sta.includes(5) ? await source() : null;

  const planes: Uint8Array[] = [];
  const cache = new Map<string, Uint8Array>();
  for (let ch = 0; ch < fmt.ch; ch++) {
    const st = field(bm, `Sta${ch + 1}`);
    const statuses = Array.isArray(st) ? st.filter((x): x is number => typeof x === 'number') : [];
    const blocks = children(g, bm, `Idx${ch + 1}`);
    const twi = num(bm, `TWi${ch + 1}`);
    const gw = twi && twi > 0 ? Math.min(twi, 1 << 20) : Math.ceil(rowBytes / 256);
    const plane = new Uint8Array(pitch * rows);
    let next = 0;
    for (let i = 0; i < statuses.length; i++) {
      const x = (i % gw) * 256, y = Math.floor(i / gw) * 256;
      if (y >= height) break;
      const s = statuses[i];
      if (s === 0 || s === 1) continue;
      if (x + 256 > pitch) { if (s === 4) next++; continue; }
      if (s === 2 || s === 3) {
        for (let r = 0; r < 256 && y + r < rows; r++) {
          const base = (y + r) * pitch + x;
          if (s === 2) plane.fill(0xff, base, base + 256);
          else for (let k = 0; k < 256; k += 4) { plane[base + k + 2] = 0x80; plane[base + k + 3] = 0x3f; }
        }
      } else if (s === 4) {
        const blk = blocks[next++];
        if (!blk) throw bad('more stored tiles than blocks');
        const rv = field(blk, 'Rect') ?? field(blk, 'IRct');
        const rect = Array.isArray(rv) && rv.length === 4 && rv.every((q) => typeof q === 'number') ? (rv as number[]) : [0, 0, 256, 256];
        const dv = field(blk, 'Data');
        if (!dv || typeof dv !== 'object' || Array.isArray(dv) || (dv as AfEmbedded).t !== 'emb') throw bad('a block has no data reference');
        const name = (dv as AfEmbedded).name;
        let tile = cache.get(name);
        if (!tile) {
          const e = a.head(name);
          if (!e) throw bad('a tile entry is missing');
          const p = tilePayload(await a.extract(e));
          if (!p) throw bad('a tile has no 64 KiB payload');
          tile = p;
          cache.set(name, p);
        }
        const cl = (v: number): number => Math.min(256, Math.max(0, v));
        const x0 = cl(rect[0]), y0 = cl(rect[1]), x1 = cl(rect[2]), y1 = cl(rect[3]);
        for (let ty = y0; ty < y1; ty++) {
          if (y + ty >= rows) break;
          const n = Math.min(x1 - x0, pitch - (x + x0));
          if (n > 0) plane.set(tile.subarray(ty * 256 + x0, ty * 256 + x0 + n), (y + ty) * pitch + x + x0);
        }
      } else if (s === 5) {
        if (!src || ch >= 4) throw bad('a source-backed tile has no source image');
        const per = 256 / fmt.bps, px0 = x / fmt.bps;
        for (let ty = 0; ty < 256; ty++) {
          const sy = y + ty;
          if (sy >= src.height || sy >= rows) break;
          for (let tx = 0; tx < per; tx++) {
            const sx = px0 + tx;
            if (sx >= src.width) break;
            const v = src.rgba[(sy * src.width + sx) * 4 + ch], at = sy * pitch + x + tx * fmt.bps;
            if (fmt.bps === 1) plane[at] = v;
            else if (fmt.bps === 2) { const w = v * 257; plane[at] = w & 0xff; plane[at + 1] = w >> 8; }
            else new DataView(plane.buffer).setFloat32(at, v / 255, true);
          }
        }
      } else throw bad(`unknown tile status ${s}`);
    }
    planes.push(plane);
  }

  const rgba = new Uint8ClampedArray(width * height * 4);
  const views = fmt.bps === 4 ? planes.map((p) => new DataView(p.buffer)) : [];
  const sample = (p: number, x: number, y: number): number => {
    const at = y * pitch + x * fmt.bps;
    if (fmt.bps === 1) return planes[p][at];
    if (fmt.bps === 2) return Math.round(((planes[p][at] | (planes[p][at + 1] << 8)) / 65535) * 255);
    return Math.round(Math.min(1, Math.max(0, views[p].getFloat32(at, true))) * 255);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (fmt.kind === 'rgba') { rgba[o] = sample(0, x, y); rgba[o + 1] = sample(1, x, y); rgba[o + 2] = sample(2, x, y); rgba[o + 3] = sample(3, x, y); }
      else if (fmt.kind === 'gray') { const v = sample(0, x, y); rgba[o] = v; rgba[o + 1] = v; rgba[o + 2] = v; rgba[o + 3] = sample(1, x, y); }
      else if (fmt.kind === 'mask') { const v = sample(0, x, y); rgba[o] = v; rgba[o + 1] = v; rgba[o + 2] = v; rgba[o + 3] = 255; }
      else {
        const k = 1 - sample(3, x, y) / 255;
        rgba[o] = (1 - sample(0, x, y) / 255) * k * 255; rgba[o + 1] = (1 - sample(1, x, y) / 255) * k * 255; rgba[o + 2] = (1 - sample(2, x, y) / 255) * k * 255; rgba[o + 3] = sample(4, x, y);
      }
    }
  }
  return { width, height, rgba };
}

const KIND_LABEL: Record<string, string> = {
  ShpN: 'a vector shape', PCrv: 'a vector curve', TxtA: 'text', TxtF: 'text', FlRN: 'a live filter', CrRA: 'a Curves adjustment', HsRA: 'an HSL adjustment',
  LeRA: 'a Levels adjustment', ExRA: 'an Exposure adjustment', BCRA: 'a Brightness and Contrast adjustment', BWRA: 'a Black and White adjustment', WBRA: 'a White Balance adjustment',
  MRst: 'a mask', FRst: 'a filter layer',
};

const KIND_NAME: Record<string, string> = { ShpN: 'Shape', PCrv: 'Curve', TxtA: 'Text', TxtF: 'Text', FlRN: 'Live filter', MRst: 'Mask' };

export async function readAfModel(bytes: Uint8Array, decode?: AfDecodeImage): Promise<AfModel> {
  const a = new AfArchive(bytes);
  const e = a.head('doc.dat');
  if (!e) throw bad('the container has no doc.dat');
  const g = parseGraph(await a.extract(e));
  const root = g.nodes[0];
  const docNode = child(g, root, 'DocR');
  if (!docNode) throw bad('no document node');
  const spreads = children(g, docNode, 'Chld');
  const spread = spreads[0];
  if (!spread) throw bad('the document has no spreads');
  let ox = 0, oy = 0, width: number, height: number;
  const sb = nums(spread, 'SprB', 4), df = nums(docNode, 'DfSz', 2);
  if (sb) { ox = sb[0]; oy = sb[1]; width = Math.round(sb[2] - sb[0]); height = Math.round(sb[3] - sb[1]); }
  else if (df) { width = Math.round(df[0]); height = Math.round(df[1]); }
  else throw bad('no spread bounds or document size');
  if (!(width > 0) || !(height > 0) || width > 1 << 20 || height > 1 << 20 || width * height > 1 << 28) throw bad(`implausible canvas ${width} by ${height}`);

  const model: AfModel = { width, height, layers: [], leftOut: [], notes: [], thumbnail: a.thumbnail(), rasterCount: 0, version: 0 };
  if (spreads.length > 1) model.notes.push(`This file has ${spreads.length} spreads or artboards; formvis opened the first.`);
  const budget = new Budget();
  const origin: Mat = [1, 0, -ox, 0, 1, -oy];
  const out = (name: string, what: string): void => { if (model.leftOut.length < 200) model.leftOut.push({ name, what }); };

  const hasContent = (bm: AfNode): boolean => statusesOf(bm).some((s) => s > 1) || (statusesOf(bm).length === 0 && field(bm, 'Bckg') !== undefined);

  const unread = (node: AfNode, name: string): void => {
    const attached = children(g, node, 'AdCh');
    if (attached.some((m) => m.types.some((t) => t[0] === 'MRst'))) out(name, 'its mask, so the layer shows without it');
    if (attached.some((m) => m.types.some((t) => t[0] === 'FlRN'))) out(name, 'its live filter, so the layer shows without it');
    if (children(g, node, 'FiEf').some((f) => bool(f, 'Enab') === true)) out(name, 'its layer effects, so the layer shows without them');
  };

  const layerOf = async (node: AfNode, ctm: Mat, depth: number): Promise<AfLayer | null> => {
    if (depth > 64) { out('(nested)', 'nested too deep'); return null; }
    if (++budget.layers > MAX_LAYERS) throw bad('too many layers');
    const kind = typeTag(node);
    const raw = str(node, 'Desc') ?? '';
    const name = raw || (kind === 'Grup' ? 'Group' : kind === 'Scop' ? 'Layer' : kind === 'ImgN' ? str(node, 'IRFN') || 'Image' : kind === 'Rstr' ? 'Pixel' : node.types.some((t) => t[0] === 'AdjR') ? 'Adjustment' : KIND_NAME[kind] ?? kind);
    const xf = nums(node, 'Xfrm', 6);
    const map = xf ? matThen(ctm, xf as Mat) : ctm;
    const common = (): Pick<AfLayer, 'visible' | 'opacity' | 'blend' | 'isolated' | 'map'> => {
      const be = enm(node, 'Blnd');
      return { visible: bool(node, 'Visi') ?? true, opacity: Math.min(1, Math.max(0, num(node, 'Opac') ?? 1)), blend: be ? { id: be.id, ver: be.ver } : null, isolated: bool(node, 'PasT') === false, map };
    };
    if (kind === 'Grup' || kind === 'Scop') {
      const kids: AfLayer[] = [];
      for (const k of children(g, node, 'Chld')) { const l = await layerOf(k, map, depth + 1); if (l) kids.push(l); }
      unread(node, name);
      return { name, kind: 'group', ...common(), children: kids };
    }
    if (kind === 'Rstr' || kind === 'ImgN') {
      const bm = child(g, node, 'Bitm');
      if (!bm || typeTag(bm) !== 'DyBm') { out(name, 'pixels in a form formvis does not read'); return null; }
      if (!hasContent(bm)) return null;
      let bitmap: AfBitmap;
      try { bitmap = await decodeBitmap(a, g, bm, budget, decode); } catch (err) { if (err instanceof AfError) { out(name, err.message); return null; } throw err; }
      const layer: AfLayer = { name, kind: 'raster', ...common(), bitmap };
      model.rasterCount++;
      const clipped: AfLayer[] = [];
      for (const k of children(g, node, 'Chld')) { const l = await layerOf(k, map, depth + 1); if (l) clipped.push(l); }
      if (clipped.length) layer.clipped = clipped;
      unread(node, name);
      return layer;
    }
    out(name, KIND_LABEL[kind] ?? (node.types.some((t) => t[0] === 'AdjR') ? 'an adjustment' : `a layer of kind ${kind}`));
    return null;
  };

  const ras = child(g, spread, 'RasS');
  if (ras) {
    const bm = child(g, ras, 'Bitm');
    if (bm && typeTag(bm) === 'DyBm' && hasContent(bm)) {
      try {
        const bitmap = await decodeBitmap(a, g, bm, budget, decode);
        model.layers.push({ name: 'Background', kind: 'raster', visible: true, opacity: 1, blend: null, isolated: false, map: origin, bitmap });
        model.rasterCount++;
      } catch (err) { if (err instanceof AfError) out('Background', err.message); else throw err; }
    }
  }
  for (const k of children(g, spread, 'Chld')) { const l = await layerOf(k, origin, 0); if (l) model.layers.push(l); }
  return model;
}
