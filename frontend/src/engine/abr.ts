/** Brush files (.abr), read for their sampled tips, written for formvis with two open-source readers as the reference
 *  for the layout. Two families exist. Versions 1 and 2: a count, then each brush's type and size; sampled
 *  brushes (type 2) carry spacing, a name (version 2), bounds, depth and pixels, raw or PackBits-compressed by row.
 *  Versions 6 to 10: a subversion, then 8BIM sections; 'samp' holds the sampled tips, each a length, a key and header
 *  (47 bytes to skip for subversion 1, 301 for subversion 2), bounds, depth, a compression flag and pixels. The 'desc' section's
 *  folders give each brush its path, and its computed (round, parametric) brushes become soft tips; a tip takes the name its descriptor entry gives, else
 *  one made from the file. The 'desc' section is walked for each sampled brush's Spcn (spacing in percent), matched to its tip by the
 *  tip's key (the text at the start of its record); a tip with none keeps 25 percent.
 *  A tip's grey is the paint: 255 paints fully, 0 not at all. */

export interface SampledTip { w: number; h: number; data: Uint8Array }
/** `spacing` is a fraction of the tip's diameter: 0.25 is the file's 25 percent. */
export interface AbrBrush { name: string; tip: SampledTip; spacing: number; /** The folders it sat in, outermost first, joined by a slash. */ folder?: string }

class Reader {
  pos = 0;
  constructor(readonly v: DataView) {}
  get left(): number { return this.v.byteLength - this.pos; }
  u8(): number { return this.v.getUint8(this.pos++); }
  u16(): number { const x = this.v.getUint16(this.pos); this.pos += 2; return x; }
  i32(): number { const x = this.v.getInt32(this.pos); this.pos += 4; return x; }
  u32(): number { const x = this.v.getUint32(this.pos); this.pos += 4; return x; }
  skip(n: number): void { this.pos += n; }
}

/** Rows of PackBits: `h` row byte counts (16-bit), then each row's runs. */
function unpackRows(r: Reader, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h), counts: number[] = [];
  for (let y = 0; y < h; y++) counts.push(r.u16());
  for (let y = 0; y < h; y++) {
    const end = r.pos + counts[y];
    let x = 0;
    while (r.pos < end && x < w) {
      let n = r.u8();
      if (n >= 128) n -= 256;
      if (n < 0) { if (n === -128) continue; const v = r.u8(); for (let k = 0; k < 1 - n && x < w; k++) out[y * w + x++] = v; }
      else for (let k = 0; k < n + 1 && x < w; k++) out[y * w + x++] = r.u8();
    }
    r.pos = end;
  }
  return out;
}

/** Pixels of `depth` bits (8 or 16), raw or packed, as 8-bit greys. */
function pixels(r: Reader, w: number, h: number, depth: number, packed: boolean): Uint8Array | null {
  if (w <= 0 || h <= 0 || w * h > 16_000_000) return null;
  if (depth === 8) {
    if (packed) return unpackRows(r, w, h);
    if (r.left < w * h) return null;
    const out = new Uint8Array(r.v.buffer, r.v.byteOffset + r.pos, w * h).slice();
    r.skip(w * h);
    return out;
  }
  if (depth === 16 && !packed) {
    if (r.left < w * h * 2) return null;
    const out = new Uint8Array(w * h);
    for (let i = 0; i < out.length; i++) out[i] = r.u16() >> 8;
    return out;
  }
  return null;
}

function readOld(r: Reader, version: number, base: string): AbrBrush[] {
  const count = r.u16(), out: AbrBrush[] = [];
  for (let i = 0; i < count && r.left > 6; i++) {
    const type = r.u16(), size = r.u32(), next = r.pos + size;
    if (type === 2) {
      r.skip(4);
      const spacing = r.u16();
      let name = `${base} ${out.length + 1}`;
      if (version === 2) {
        const len = r.u32();
        let s = '';
        for (let k = 0; k < len; k++) { const c = r.u16(); if (c) s += String.fromCharCode(c); }
        if (s.trim()) name = s.trim();
      }
      r.skip(1 + 8);
      const top = r.i32(), left = r.i32(), bottom = r.i32(), right = r.i32(), depth = r.u16(), packed = r.u8() === 1;
      const data = pixels(r, right - left, bottom - top, depth, packed);
      if (data) out.push({ name, tip: { w: right - left, h: bottom - top, data }, spacing: spacing / 100 });
    }
    r.pos = next;
  }
  return out;
}

/** Each sampled brush's spacing (a fraction of its diameter) in a 'desc' section, by its sampledData key. The
 *  descriptor tree is walked for objects holding both; a value of a type not known ends the walk, keeping what was found. */
interface Computed { id: string; name: string; diameter: number; hardness: number; angle: number; roundness: number; spacing: number }

function readDescSpacing(r: Reader): { spacing: Map<string, number>; names: Map<string, string>; folders: Map<string, string[]>; computed: Computed[] } {
  const found = new Map<string, number>(), names = new Map<string, string>(), folders = new Map<string, string[]>(), computed: Computed[] = [], leaves = new WeakMap<object, string[]>();
  const id = (): string => { const n = r.u32(); let s = ''; for (let i = 0; i < (n || 4); i++) s += String.fromCharCode(r.u8()); return s; };
  const text = (): string => { const n = r.u32(); let s = ''; for (let i = 0; i < n; i++) { const c = r.u16(); if (c) s += String.fromCharCode(c); } return s; };
  const double = (): number => { const x = r.v.getFloat64(r.pos); r.skip(8); return x; };
  const value = (type: string): unknown => {
    switch (type) {
      case 'Objc': case 'GlbO': {
        text(); id();
        const vals: Record<string, unknown> = {};
        for (let n = r.u32(); n > 0; n--) { const key = id(); vals[key] = value(String.fromCharCode(r.u8(), r.u8(), r.u8(), r.u8())); }
        if (typeof vals.sampledData === 'string' && typeof vals.Spcn === 'number') found.set(vals.sampledData.trim(), Math.min(10, Math.max(0.01, vals.Spcn / 100)));
        const inner = vals.Brsh as Record<string, unknown> | undefined;
        if (typeof vals['Nm  '] === 'string' && inner && typeof inner.sampledData === 'string' && vals['Nm  '].trim()) names.set(inner.sampledData.trim(), vals['Nm  '].trim().slice(0, 60));
        const label = typeof vals['Nm  '] === 'string' ? vals['Nm  '].trim().slice(0, 60) : '';
        if (Array.isArray(inner)) {
          // A folder: the tips and computed brushes inside it, nested folders already walked, take its name at the front of their path.
          const ids: string[] = [];
          for (const it of inner) if (it && typeof it === 'object') ids.push(...(leaves.get(it) ?? []));
          leaves.set(vals, ids);
          if (label) for (const k of ids) folders.set(k, [label, ...(folders.get(k) ?? [])]);
        } else if (inner && typeof inner === 'object') {
          if (typeof inner.sampledData === 'string') leaves.set(vals, [inner.sampledData.trim()]);
          else if (typeof inner.Dmtr === 'number' && label) {
            const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d), id = `computed:${computed.length}`;
            computed.push({ id, name: label, diameter: num(inner.Dmtr, 20), hardness: num(inner.Hrdn, 100), angle: num(inner.Angl, 0), roundness: num(inner.Rndn, 100), spacing: num(inner.Spcn, 25) });
            leaves.set(vals, [id]);
          }
        }
        return vals;
      }
      case 'VlLs': { const items: unknown[] = []; for (let n = r.u32(); n > 0; n--) items.push(value(String.fromCharCode(r.u8(), r.u8(), r.u8(), r.u8()))); return items; }
      case 'doub': return double();
      case 'UntF': r.skip(4); return double();
      case 'long': return r.i32();
      case 'comp': r.skip(8); return 0;
      case 'bool': return r.u8() !== 0;
      case 'TEXT': return text();
      case 'enum': id(); return id();
      case 'type': case 'GlbC': text(); return id();
      case 'tdta': case 'alis': r.skip(r.u32()); return null;
      default: throw new Error('unknown descriptor value');
    }
  };
  try {
    if (r.u32() === 16) value('Objc');
  } catch { /* the rest keeps the default spacing */ }
  return { spacing: found, names, folders, computed };
}

/** A computed (round or elliptical) brush as a soft tip: full inside `hardness` percent of the radius, fading to nothing at the
 *  rim, squeezed to `roundness` percent and turned by `angle` degrees. At most 400 pixels across. */
function computedTip(c: Computed): SampledTip {
  const size = Math.max(2, Math.min(400, Math.round(c.diameter))), R = size / 2, hard = Math.max(0, Math.min(1, c.hardness / 100)), round = Math.max(0.01, Math.min(1, c.roundness / 100));
  const a = (-c.angle * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a), data = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x + 0.5 - R, dy = y + 0.5 - R, u = dx * ca + dy * sa, v = (-dx * sa + dy * ca) / round, d = Math.hypot(u, v) / R;
    data[y * size + x] = d >= 1 ? 0 : d <= hard ? 255 : Math.round(255 * (1 - (d - hard) / Math.max(0.001, 1 - hard)));
  }
  return { w: size, h: size, data };
}

function readSections(r: Reader, sub: number, base: string): AbrBrush[] {
  const out: AbrBrush[] = [], keys: string[] = [];
  let spacings = new Map<string, number>(), called = new Map<string, string>(), placed = new Map<string, string[]>(), round: Computed[] = [];
  while (r.left >= 12) {
    const sig = String.fromCharCode(r.u8(), r.u8(), r.u8(), r.u8()), key = String.fromCharCode(r.u8(), r.u8(), r.u8(), r.u8()), len = r.u32();
    if (sig !== '8BIM') break;
    const end = r.pos + len;
    if (key === 'samp') {
      while (r.pos < end - 4) {
        const size = r.u32(), next = r.pos + size + ((4 - (size % 4)) % 4), start = r.pos;
        let tipKey = '';
        for (let n = Math.min(r.u8(), size - 1), k = 0; k < n; k++) tipKey += String.fromCharCode(r.u8());
        r.pos = start;
        r.skip(sub === 1 ? 47 : 301);
        const top = r.i32(), left = r.i32(), bottom = r.i32(), right = r.i32(), depth = r.u16(), packed = r.u8() === 1;
        const data = pixels(r, right - left, bottom - top, depth, packed);
        if (data) { out.push({ name: `${base} ${out.length + 1}`, tip: { w: right - left, h: bottom - top, data }, spacing: 0.25 }); keys.push(tipKey.trim()); }
        r.pos = next;
      }
    } else if (key === 'desc') ({ spacing: spacings, names: called, folders: placed, computed: round } = readDescSpacing(r));
    r.pos = end;
  }
  out.forEach((b, i) => {
    b.spacing = spacings.get(keys[i]) ?? b.spacing; b.name = called.get(keys[i]) ?? b.name;
    const path = placed.get(keys[i]);
    if (path?.length) b.folder = path.join('/');
  });
  for (const c of round) {
    const path = placed.get(c.id);
    out.push({ name: c.name, tip: computedTip(c), spacing: Math.min(10, Math.max(0.01, c.spacing / 100)), ...(path?.length ? { folder: path.join('/') } : {}) });
  }
  return out;
}

/** The sampled tips in an .abr file; throws on a file that is not one. `base` names tips when the file does not. */
export function parseAbr(buf: ArrayBuffer, base = 'Brush'): AbrBrush[] {
  const r = new Reader(new DataView(buf));
  if (r.left < 4) throw new Error('This file is too short to be a brush file.');
  const version = r.u16();
  if (version === 1 || version === 2) return readOld(r, version, base);
  if (version >= 6 && version <= 10) { const sub = r.u16(); return readSections(r, sub, base); }
  throw new Error(`This is not an .abr brush file this reader knows (version ${version}).`);
}
