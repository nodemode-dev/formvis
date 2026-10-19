import { Raster, newLayer, uid, type BlendMode, type Doc, type ID, type Layer } from '../engine';

/** Paint.NET (.pdn, DEV_PLAN 34.5 part b), versions 3.x and 4.x: the magic PDN3, a three byte length and an XML header (size,
 *  layer count, a PNG thumbnail), then a .NET BinaryFormatter stream describing the layers, then every layer's pixels as
 *  gzip chunks in the order the memory blocks were serialized. Read in TypeScript from the format's public layout; a file it
 *  cannot follow opens as its thumbnail. */
export const isPdnFile = (f: File): boolean => /\.pdn$/i.test(f.name) || f.type === 'application/x-paintdotnet';

// --- the BinaryFormatter reader --------------------------------------------------------------------------------------

interface Obj { id: number; cls: string; m: Map<string, Val> }
class Ref { constructor(readonly id: number) {} }
type Val = number | string | boolean | null | Uint8Array | Obj | Ref | Val[];
interface Meta { cls: string; names: string[]; types: number[]; extra: (number | string | undefined)[] }

// A member named for its declaring class, as BinaryFormatter writes inherited fields ("Layer+properties"), is read by
// its own name ("properties").
const norm = (k: string): string => k.replace(/^<(.+)>k__BackingField$/, '$1').replace(/^[^+]*\+/, '').replace(/^_+/, '').toLowerCase();

class Reader {
  p = 0;
  readonly v: DataView;
  readonly objs = new Map<number, Val>();
  readonly all: Obj[] = [];
  private readonly metas = new Map<number, Meta>();
  private nulls = 0;
  constructor(readonly d: Uint8Array) { this.v = new DataView(d.buffer, d.byteOffset, d.byteLength); }

  u8(): number { if (this.p >= this.d.length) throw new Error('the layer data ends early'); return this.d[this.p++]; }
  i32(): number { const n = this.v.getInt32(this.p, true); this.p += 4; return n; }
  u32be(): number { const n = this.v.getUint32(this.p, false); this.p += 4; return n; }
  bytes(n: number): Uint8Array {
    if (n < 0 || this.p + n > this.d.length) throw new Error('the layer data ends early');
    const b = this.d.subarray(this.p, this.p + n);
    this.p += n;
    return b;
  }
  str(): string {
    let len = 0, shift = 0;
    for (let i = 0; i < 5; i++) { const b = this.u8(); len |= (b & 127) << shift; if (!(b & 128)) break; shift += 7; }
    return new TextDecoder().decode(this.bytes(len));
  }

  prim(t: number): Val {
    const v = this.v;
    const take = <T>(n: number, f: (at: number) => T): T => { if (this.p + n > this.d.length) throw new Error('the layer data ends early'); const r = f(this.p); this.p += n; return r; };
    switch (t) {
      case 1: return this.u8() !== 0;
      case 2: return this.u8();
      case 3: { const b = this.u8(); const extra = b >= 0xf0 ? 3 : b >= 0xe0 ? 2 : b >= 0xc0 ? 1 : 0; this.p += extra; return String.fromCharCode(b); }
      case 5: case 18: return this.str();
      case 6: return take(8, (at) => v.getFloat64(at, true));
      case 7: return take(2, (at) => v.getInt16(at, true));
      case 8: return take(4, (at) => v.getInt32(at, true));
      case 9: return take(8, (at) => Number(v.getBigInt64(at, true)));
      case 10: return take(1, (at) => v.getInt8(at));
      case 11: return take(4, (at) => v.getFloat32(at, true));
      case 12: case 13: return take(8, (at) => Number(v.getBigInt64(at, true)));
      case 14: return take(2, (at) => v.getUint16(at, true));
      case 15: return take(4, (at) => v.getUint32(at, true));
      case 16: return take(8, (at) => Number(v.getBigUint64(at, true)));
      default: throw new Error('an unknown value type');
    }
  }

  private classInfo(): { id: number; cls: string; names: string[] } {
    const id = this.i32(), cls = this.str(), n = this.i32();
    if (n < 0 || n > 4096) throw new Error('a damaged class record');
    const names: string[] = [];
    for (let i = 0; i < n; i++) names.push(this.str());
    return { id, cls, names };
  }

  private memberTypes(n: number): { types: number[]; extra: (number | string | undefined)[] } {
    const types: number[] = [];
    for (let i = 0; i < n; i++) types.push(this.u8());
    const extra = types.map((t): number | string | undefined => {
      if (t === 0 || t === 7) return this.u8();
      if (t === 3) return this.str();
      if (t === 4) { const s = this.str(); this.i32(); return s; }
      return undefined;
    });
    return { types, extra };
  }

  private instance(id: number, meta: Meta): Obj {
    const o: Obj = { id, cls: meta.cls, m: new Map() };
    this.objs.set(id, o);
    this.all.push(o);
    for (let i = 0; i < meta.names.length; i++) {
      const t = meta.types[i];
      o.m.set(norm(meta.names[i]), t === 0 ? this.prim(meta.extra[i] as number) : this.value());
    }
    return o;
  }

  private array(len: number, item: number, prim: number | undefined): Val[] | Uint8Array {
    if (len < 0 || len > 50_000_000) throw new Error('a damaged array');
    if (item === 0 && prim === 2) return this.bytes(len).slice();
    const out: Val[] = [];
    for (let i = 0; i < len; i++) out.push(item === 0 ? this.prim(prim as number) : this.value());
    return out;
  }

  /** One record that stands for a value: an object, a string, a reference, a null or an array. */
  value(): Val {
    if (this.nulls > 0) { this.nulls--; return null; }
    for (;;) {
      const rec = this.u8();
      switch (rec) {
        case 12: this.i32(); this.str(); continue;   // BinaryLibrary, then the record it introduces
        case 1: {
          const id = this.i32(), meta = this.metas.get(this.i32());
          if (!meta) throw new Error('a class record names no description');
          return this.instance(id, meta);
        }
        case 2: case 4: {
          const ci = this.classInfo(), mt = rec === 4 ? this.memberTypes(ci.names.length) : null;
          if (!mt) throw new Error('an untyped class record');
          const meta: Meta = { cls: ci.cls, names: ci.names, types: mt.types, extra: mt.extra };
          this.metas.set(ci.id, meta);
          return this.instance(ci.id, meta);
        }
        case 3: case 5: {
          const ci = this.classInfo();
          if (rec === 3) throw new Error('an untyped class record');
          const mt = this.memberTypes(ci.names.length);
          this.i32();
          const meta: Meta = { cls: ci.cls, names: ci.names, types: mt.types, extra: mt.extra };
          this.metas.set(ci.id, meta);
          return this.instance(ci.id, meta);
        }
        case 6: { const id = this.i32(), s = this.str(); this.objs.set(id, s); return s; }
        case 7: {
          const id = this.i32(), kind = this.u8(), rank = this.i32();
          if (rank < 1 || rank > 32) throw new Error('a damaged array');
          let total = 1;
          for (let i = 0; i < rank; i++) total *= this.i32();
          if (kind >= 3 && kind <= 5) for (let i = 0; i < rank; i++) this.i32();
          const t = this.u8();
          const prim = t === 0 || t === 7 ? this.u8() : t === 3 ? (this.str(), undefined) : t === 4 ? (this.str(), this.i32(), undefined) : undefined;
          const arr = this.array(total, t === 0 ? 0 : 1, prim);
          this.objs.set(id, arr);
          return arr;
        }
        case 8: { const t = this.u8(); return this.prim(t); }
        case 9: return new Ref(this.i32());
        case 10: return null;
        case 13: this.nulls = this.u8() - 1; return null;
        case 14: this.nulls = this.i32() - 1; return null;
        case 15: { const id = this.i32(), len = this.i32(), t = this.u8(), arr = this.array(len, 0, t); this.objs.set(id, arr); return arr; }
        case 16: case 17: { const id = this.i32(), len = this.i32(), arr = this.array(len, 1, undefined); this.objs.set(id, arr); return arr; }
        default: throw new Error('an unknown record type');
      }
    }
  }

  /** The whole stream, from the serialization header to MessageEnd. */
  run(): void {
    if (this.u8() !== 0) throw new Error('the stream has no header');
    this.p += 16;
    for (;;) {
      if (this.p < this.d.length && this.d[this.p] === 11) { this.p++; return; }
      this.value();
    }
  }

  deref(v: Val | undefined): Val | undefined { return v instanceof Ref ? this.objs.get(v.id) : v; }

  /** The first object at or below `v` whose class name matches. */
  find(v: Val | undefined, re: RegExp, seen = new Set<Obj>(), depth = 0): Obj | null {
    const x = this.deref(v);
    if (!x || typeof x !== 'object' || x instanceof Uint8Array || depth > 12) return null;
    if (Array.isArray(x)) { for (const e of x) { const f = this.find(e, re, seen, depth + 1); if (f) return f; } return null; }
    if (x instanceof Ref || seen.has(x)) return null;
    seen.add(x);
    if (re.test(x.cls)) return x;
    for (const e of x.m.values()) { const f = this.find(e, re, seen, depth + 1); if (f) return f; }
    return null;
  }

  num(o: Obj | null, ...keys: string[]): number | null {
    for (const k of keys) { const v = this.deref(o?.m.get(k)); if (typeof v === 'number' && Number.isFinite(v)) return v; }
    return null;
  }
}

// --- layers ----------------------------------------------------------------------------------------------------------

const BLENDS: [RegExp, BlendMode | null][] = [
  [/Multiply/i, 'multiply'], [/Additive/i, 'linear-dodge'], [/ColorBurn/i, 'color-burn'], [/ColorDodge/i, 'color-dodge'],
  [/Overlay/i, 'overlay'], [/Difference/i, 'difference'], [/Lighten/i, 'lighten'], [/Darken/i, 'darken'], [/Screen/i, 'screen'],
  [/Reflect/i, 'reflect'], [/Glow/i, 'glow'], [/Negation/i, 'negation'], [/Xor/i, 'xor'], [/Normal/i, 'normal'],
];

interface PdnLayer { name: string; visible: boolean; opacity: number; blend: BlendMode; w: number; h: number; stride: number; len: number; px: Uint8Array | null }

async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([new Uint8Array(data)]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** One memory block's payload: raw, or gzip chunks, each placed by its chunk number. */
async function readBlock(r: Reader, len: number, keep: boolean): Promise<Uint8Array | null> {
  const format = r.u8();
  if (format === 1) { const b = r.bytes(len); return keep ? b.slice() : null; }
  if (format !== 0) throw new Error('an unknown pixel storage format');
  const chunk = r.u32be();
  if (chunk < 1) throw new Error('a damaged pixel block');
  const count = Math.ceil(len / chunk), out = keep ? new Uint8Array(len) : null;
  for (let i = 0; i < count; i++) {
    const no = r.u32be(), size = r.u32be(), comp = r.bytes(size);
    if (!out) continue;
    const raw = await gunzip(comp);
    if (no >= count) throw new Error('a damaged pixel block');
    out.set(raw.subarray(0, Math.max(0, Math.min(raw.length, len - no * chunk))), no * chunk);
  }
  return out;
}

async function readLayers(body: Uint8Array, notes: Set<string>): Promise<PdnLayer[]> {
  const r = new Reader(body);
  r.run();
  const layers: PdnLayer[] = [], blocks: Obj[] = r.all.filter((o) => /MemoryBlock$/.test(o.cls));
  for (const l of r.all.filter((o) => /BitmapLayer$/.test(o.cls))) {
    const props = r.find(l, /LayerProperties$/), surface = r.find(l, /Surface$/);
    const w = r.num(surface, 'width') ?? r.num(l, 'width'), h = r.num(surface, 'height') ?? r.num(l, 'height');
    if (!w || !h || w < 1 || h < 1) throw new Error('a layer has no size');
    const nameV = r.deref(props?.m.get('name')), visV = r.deref(props?.m.get('visible')), hidV = r.deref(props?.m.get('hidden'));
    const op = r.num(props, 'opacity') ?? 255;
    const bv = r.deref(props?.m.get('blendop') ?? props?.m.get('blendmode'));
    // Paint.NET 4 stores blendMode as an enum object holding value__ (0 Normal ... 13 Xor); 3.x a blendOp object by class.
    const ENUM = ['Normal', 'Multiply', 'Additive', 'ColorBurn', 'ColorDodge', 'Reflect', 'Glow', 'Overlay', 'Difference', 'Negation', 'Lighten', 'Darken', 'Screen', 'Xor'];
    const isObj = !!bv && typeof bv === 'object' && !(bv instanceof Uint8Array) && !Array.isArray(bv) && !(bv instanceof Ref);
    const ev = isObj ? r.num(bv, 'value__') : typeof bv === 'number' ? bv : null;
    const bn = ev !== null ? ENUM[ev] ?? 'Normal' : typeof bv === 'string' ? bv : isObj ? bv.cls : 'Normal';
    const hit = BLENDS.find(([re]) => re.test(bn));
    if (hit && hit[1] === null) notes.add(`${bn.replace(/^.*[.+]/, '').replace(/BlendOp$/, '')} is not a blend mode formvis has; those layers open as Normal.`);
    layers.push({
      name: typeof nameV === 'string' && nameV ? nameV : `Layer ${layers.length + 1}`,
      visible: typeof visV === 'boolean' ? visV : typeof hidV === 'boolean' ? !hidV : true,
      opacity: Math.min(1, Math.max(0, (op > 1 ? op : op * 255) / 255)),
      blend: hit?.[1] ?? 'normal', w, h, stride: r.num(surface, 'stride') ?? w * 4, len: 0, px: null,
    });
  }
  if (!layers.length) throw new Error('no layers were found');
  let k = 0;
  for (const b of blocks) {
    const len = r.num(b, 'length64', 'length') ?? -1;
    if (len < 0) throw new Error('a pixel block has no length');
    const want = k < layers.length ? layers[k] : null, match = !!want && len === want.stride * want.h;
    const px = await readBlock(r, len, match);
    if (match && want) { want.px = px; want.len = len; k++; }
  }
  if (k < layers.length) throw new Error('some layers have no pixel data');
  return layers;
}

export async function readPdn(file: File): Promise<{ doc: Doc; notes: string[]; activeId: ID | null; paths: null }> {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf.length < 9 || String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) !== 'PDN3') throw new Error('it is not a Paint.NET file');
  const n = buf[4] | (buf[5] << 8) | (buf[6] << 16);
  if (7 + n + 2 > buf.length) throw new Error('its header is cut short');
  const xml = new DOMParser().parseFromString(new TextDecoder().decode(buf.subarray(7, 7 + n)), 'application/xml');
  const image = xml.querySelector('pdnImage');
  if (!image || xml.querySelector('parsererror')) throw new Error('its header cannot be read');
  const W = Math.round(Number(image.getAttribute('width'))), H = Math.round(Number(image.getAttribute('height')));
  if (!Number.isFinite(W) || !Number.isFinite(H) || W < 1 || H < 1 || W > 30000 || H > 30000) throw new Error('its size is not one formvis can open');
  const doc: Doc = { id: uid(), width: W, height: H, resolution: 72, layers: [] };
  const notes = new Set<string>(), layers: Layer[] = [];

  let reason = '';
  try {
    if (buf[7 + n] !== 0 || buf[8 + n] !== 1) throw new Error('its layers are stored compressed, which formvis does not read');
    const read = await readLayers(buf.subarray(9 + n), notes);
    for (const l of read) {
      if (l.stride !== l.w * 4 || !l.px) throw new Error('a layer is stored in a form formvis does not read');
      if (l.w * l.h > 400_000_000) { notes.add('A layer is too large to open and was left out.'); continue; }
      const img = new ImageData(l.w, l.h), src = l.px;
      for (let i = 0; i < l.w * l.h * 4; i += 4) { img.data[i] = src[i + 2]; img.data[i + 1] = src[i + 1]; img.data[i + 2] = src[i]; img.data[i + 3] = src[i + 3]; }
      const raster = new Raster(l.w, l.h);
      raster.write(img);
      layers.push(newLayer(l.name, doc, { raster, visible: l.visible, opacity: l.opacity, blend: l.blend }));   // bottom first, as saved
    }
    if (!layers.length) throw new Error('no layer could be opened');
  } catch (e) {
    reason = e instanceof Error ? e.message : String(e);
    layers.length = 0;
    notes.clear();
  }

  if (reason) {
    const png = image.querySelector('thumb')?.getAttribute('png');
    if (!png) throw new Error(`${reason}, and it holds no thumbnail to open instead`);
    const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const raster = new Raster(W, H);
    raster.ctx.drawImage(bmp, 0, 0, W, H); bmp.close(); raster.touch();
    layers.push(newLayer('Background', doc, { raster }));
    notes.add('The layers of this Paint.NET file could not be read; it opened as its thumbnail, one layer.');
  }
  doc.layers = layers;
  return { doc, notes: [...notes], activeId: layers.at(-1)?.id ?? null, paths: null };
}
