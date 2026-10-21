/** Swatch files: .aco (Color Swatches) and .ase (Swatch Exchange). Both are big-endian binary.
 *  Colours come back as '#rrggbb'; non-RGB spaces are converted plainly (CMYK naively, Lab through D50 XYZ). */

const clamp = (v: number, lo = 0, hi = 255): number => Math.min(hi, Math.max(lo, v));
const toHex = (r: number, g: number, b: number): string => `#${[r, g, b].map((v) => Math.round(clamp(v)).toString(16).padStart(2, '0')).join('')}`;
const parseHex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16) || 0, parseInt(h.slice(3, 5), 16) || 0, parseInt(h.slice(5, 7), 16) || 0];

function hsbToRgb(h: number, s: number, v: number): string {
  const f = (n: number): number => { const k = (n + h / 60) % 6; return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255; };
  return toHex(f(5), f(3), f(1));
}

function labToRgb(L: number, a: number, b: number): string {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const inv = (t: number): number => (t * t * t > 0.008856 ? t * t * t : (t - 16 / 116) / 7.787);
  const x = inv(fx) * 0.9642, y = inv(fy), z = inv(fz) * 0.8249;
  const lin = [3.1338561 * x - 1.6168667 * y - 0.4906146 * z, -0.9787684 * x + 1.9161415 * y + 0.033454 * z, 0.0719453 * x - 0.2289914 * y + 1.4052427 * z];
  const g = lin.map((c) => { const u = clamp(c, 0, 1); return (u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(u, 1 / 2.4) - 0.055) * 255; });
  return toHex(g[0], g[1], g[2]);
}

function cmykToRgb(c: number, m: number, y: number, k: number): string {
  return toHex(255 * (1 - c) * (1 - k), 255 * (1 - m) * (1 - k), 255 * (1 - y) * (1 - k));
}

/** One .aco colour record: a colour space id and four 16-bit values. */
function acoColour(space: number, w: number, x: number, y: number, z: number): string | null {
  switch (space) {
    case 0: return toHex(w / 257, x / 257, y / 257);
    case 1: return hsbToRgb((w / 65535) * 360, x / 65535, y / 65535);
    case 2: return cmykToRgb(1 - w / 65535, 1 - x / 65535, 1 - y / 65535, 1 - z / 65535);
    case 7: {
      const sg = (v: number): number => (v > 32767 ? v - 65536 : v);
      return labToRgb(w / 100, sg(x) / 100, sg(y) / 100);
    }
    case 8: { const g = (clamp(w, 0, 10000) / 10000) * 255; return toHex(g, g, g); }
    case 9: return cmykToRgb(clamp(w, 0, 10000) / 10000, clamp(x, 0, 10000) / 10000, clamp(y, 0, 10000) / 10000, clamp(z, 0, 10000) / 10000);
    default: return COLOUR_BOOKS[space] ? acoColour(2, w, x, y, z) : null;
  }
}

/** Colour book spaces (Pantone and the like): the file holds the book's own entry, which formvis does not carry, so the
 *  four values are read as inks and the swatch is kept by its name as an approximation. */
const COLOUR_BOOKS: Record<number, string> = { 3: 'Pantone', 4: 'Focoltone', 5: 'Trumatch', 6: 'Toyo', 10: 'HKS', 11: 'DIC' };

/** A sentence for each kind of approximation among swatches just read, empty when all of them came in as they were. */
export function swatchNotes(list: readonly SwatchItem[]): string[] {
  const books = new Map<string, number>();
  for (const s of list) if (s.book) books.set(s.book, (books.get(s.book) ?? 0) + 1);
  return [...books].map(([book, n]) => `${n} ${book} color book swatch${n === 1 ? '' : 'es'} shown with an approximate color; an .aco saved again carries the book's own entry.`);
}

/** One swatch as the files hold it: '#rrggbb', an optional name, and (.ase only) an optional group. */
export interface SwatchItem { c: string; name?: string; group?: string; /** The colour as the file held it when it was not RGB, at full precision: CMYK as 0 to 1 each, Lab as L 0 to 100 then a and b, Gray as 0 to 1. */ src?: SwatchSource; /** Global, spot or process (.ase colour types); absent means process. */ kind?: 'global' | 'spot'; /** The colour book (Pantone and the like) the file named; the colour is then an approximation. */ book?: string; /** A colour book entry's record as the .aco file held it (space, then four 16-bit values), written back as it was. */ raw?: [number, number, number, number, number] }
export interface SwatchSource { m: 'cmyk' | 'lab' | 'gray'; v: number[] }
const item = (c: string, name: string, group?: string, src?: SwatchSource, kind?: 'global' | 'spot', book?: string, raw?: SwatchItem['raw']): SwatchItem => ({ c, ...(name && name !== c ? { name: name.slice(0, 60) } : {}), ...(group ? { group: group.slice(0, 40) } : {}), ...(src ? { src } : {}), ...(kind ? { kind } : {}), ...(book ? { book } : {}), ...(raw ? { raw } : {}) });
const sourceOf = (space: number, w: number, x: number, y: number, z: number): SwatchSource | undefined => {
  const sg = (v: number): number => (v > 32767 ? v - 65536 : v);
  if (space === 9) return { m: 'cmyk', v: [w, x, y, z].map((q) => clamp(q, 0, 10000) / 10000) };
  return space === 2 ? { m: 'cmyk', v: [1 - w / 65535, 1 - x / 65535, 1 - y / 65535, 1 - z / 65535] } : space === 7 ? { m: 'lab', v: [w / 100, sg(x) / 100, sg(y) / 100] } : space === 8 ? { m: 'gray', v: [clamp(w, 0, 10000) / 10000] } : undefined;
};

export function parseAco(bytes: Uint8Array): SwatchItem[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;
  const section = (): { version: number; colours: SwatchItem[] } | null => {
    if (p + 4 > bytes.byteLength) return null;
    const version = dv.getUint16(p), count = dv.getUint16(p + 2);
    if (version !== 1 && version !== 2) return null;
    p += 4;
    const colours: SwatchItem[] = [];
    for (let i = 0; i < count; i += 1) {
      if (p + 10 > bytes.byteLength) break;
      const sp = dv.getUint16(p), w = dv.getUint16(p + 2), x = dv.getUint16(p + 4), y = dv.getUint16(p + 6), z = dv.getUint16(p + 8);
      const c = acoColour(sp, w, x, y, z), src = sourceOf(sp, w, x, y, z);
      p += 10;
      let name = '';
      if (version === 2) {
        if (p + 4 > bytes.byteLength) break;
        p += 2;
        const n = dv.getUint16(p);
        p += 2;
        for (let k = 0; k < n && p + 2 <= bytes.byteLength; k += 1) { const ch = dv.getUint16(p); p += 2; if (ch) name += String.fromCharCode(ch); }
      }
      if (c) colours.push(item(c, name, undefined, src, undefined, COLOUR_BOOKS[sp], COLOUR_BOOKS[sp] ? [sp, w, x, y, z] : undefined));
    }
    return { version, colours };
  };
  const first = section();
  if (!first) throw new Error('This is not an .aco swatch file.');
  const second = section();
  return second && second.colours.length ? second.colours : first.colours;
}

export const readAco = (bytes: Uint8Array): string[] => parseAco(bytes).map((s) => s.c);

/** Version 1 and version 2 sections; version 2 carries each swatch's name (the colour's hex when it has none). */
export function writeAco(list: ReadonlyArray<string | SwatchItem>): Uint8Array {
  const items = list.map((s) => (typeof s === 'string' ? { c: s } : s)), names = items.map((s) => s.name || s.c);
  const out = new Uint8Array(4 + items.length * 10 + 4 + names.reduce((n, t) => n + 14 + (t.length + 1) * 2, 0));
  const dv = new DataView(out.buffer);
  let p = 0;
  const u16 = (v: number): void => { dv.setUint16(p, v); p += 2; };
  for (const version of [1, 2]) {
    u16(version); u16(items.length);
    items.forEach((s, k) => {
      const [r, g, b] = parseHex(s.c), v = s.src?.v ?? [], q = (f: number): number => Math.round(clamp(f, 0, 1) * 65535), sg = (f: number): number => Math.round(clamp(f, -128, 127) * 100) & 0xffff;
      if (s.raw && COLOUR_BOOKS[s.raw[0]]) { for (const q of s.raw) u16(q); }
      else if (s.src?.m === 'cmyk' && v.length === 4) { u16(2); u16(65535 - q(v[0]!)); u16(65535 - q(v[1]!)); u16(65535 - q(v[2]!)); u16(65535 - q(v[3]!)); }
      else if (s.src?.m === 'lab' && v.length === 3) { u16(7); u16(Math.round(clamp(v[0]!, 0, 100) * 100)); u16(sg(v[1]!)); u16(sg(v[2]!)); u16(0); }
      else if (s.src?.m === 'gray' && v.length === 1) { u16(8); u16(Math.round(clamp(v[0]!, 0, 1) * 10000)); u16(0); u16(0); u16(0); }
      else { u16(0); u16(r * 257); u16(g * 257); u16(b * 257); u16(0); }
      if (version === 2) {
        const t = names[k]!;
        u16(0); u16(t.length + 1);
        for (let i = 0; i < t.length; i += 1) u16(t.charCodeAt(i));
        u16(0);
      }
    });
  }
  return out;
}

/** Colours with their names, and the group each sits in (group start and end blocks). */
export function parseAse(bytes: Uint8Array): SwatchItem[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12 || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'ASEF') throw new Error('This is not an .ase swatch file.');
  const blocks = dv.getUint32(8);
  let p = 12, group = '';
  const out: SwatchItem[] = [];
  const text = (at: number, chars: number): string => { let t = ''; for (let k = 0; k < chars && at + k * 2 + 2 <= bytes.byteLength; k += 1) { const ch = dv.getUint16(at + k * 2); if (ch) t += String.fromCharCode(ch); } return t; };
  for (let i = 0; i < blocks && p + 6 <= bytes.byteLength; i += 1) {
    const type = dv.getUint16(p), len = dv.getUint32(p + 2), end = p + 6 + len;
    if (end > bytes.byteLength) break;
    if (type === 0xc001) group = text(p + 8, dv.getUint16(p + 6));
    else if (type === 0xc002) group = '';
    else if (type === 0x0001) {
      let q = p + 6;
      const nameLen = dv.getUint16(q), name = text(q + 2, nameLen);
      q += 2 + nameLen * 2;
      const model = String.fromCharCode(bytes[q], bytes[q + 1], bytes[q + 2], bytes[q + 3]);
      q += 4;
      const f = (k: number): number => dv.getFloat32(q + k * 4);
      let c: string | null = null, src: SwatchSource | undefined, used = 0;
      if (model === 'RGB ') { c = toHex(f(0) * 255, f(1) * 255, f(2) * 255); used = 3; }
      else if (model === 'CMYK') { c = cmykToRgb(f(0), f(1), f(2), f(3)); src = { m: 'cmyk', v: [f(0), f(1), f(2), f(3)] }; used = 4; }
      else if (model === 'LAB ') { c = labToRgb(f(0) * 100, f(1), f(2)); src = { m: 'lab', v: [f(0) * 100, f(1), f(2)] }; used = 3; }
      else if (model === 'Gray') { const g = f(0) * 255; c = toHex(g, g, g); src = { m: 'gray', v: [f(0)] }; used = 1; }
      const kindAt = q + used * 4, code = kindAt + 2 <= end ? dv.getUint16(kindAt) : 2;
      if (c) out.push(item(c, name, group, src, code === 1 ? 'spot' : code === 0 ? 'global' : undefined));
    }
    p = end;
  }
  return out;
}

export const readAse = (bytes: Uint8Array): string[] => parseAse(bytes).map((s) => s.c);

/** RGB colour entries with their names (the colour's hex when it has none); a swatch with a group sits between that group's start and end blocks. */
export function writeAse(list: ReadonlyArray<string | SwatchItem>): Uint8Array {
  const items = list.map((s) => (typeof s === 'string' ? { c: s } : s));
  const chunks: Uint8Array[] = [];
  let blocks = 0, open = '';
  const block = (type: number, body: number[]): void => {
    const b = new Uint8Array(6 + body.length), dv = new DataView(b.buffer);
    dv.setUint16(0, type); dv.setUint32(2, body.length); b.set(body, 6);
    chunks.push(b); blocks += 1;
  };
  const u16 = (v: number): number[] => [(v >> 8) & 255, v & 255];
  const name = (t: string): number[] => [...u16(t.length + 1), ...Array.from({ length: t.length }, (_, i) => u16(t.charCodeAt(i))).flat(), 0, 0];
  const f32 = (v: number): number[] => { const a = new Uint8Array(4); new DataView(a.buffer).setFloat32(0, v); return [...a]; };
  for (const s of items) {
    const g = s.group ?? '';
    if (g !== open) {
      if (open) block(0xc002, []);
      if (g) block(0xc001, name(g));
      open = g;
    }
    const [r, gr, b] = parseHex(s.c), v = s.src?.v ?? [], code = s.kind === 'spot' ? 1 : s.kind === 'global' ? 0 : 2, tag = (t: string): number[] => Array.from(t, (ch) => ch.charCodeAt(0));
    const model = s.src?.m === 'cmyk' && v.length === 4 ? [...tag('CMYK'), ...v.flatMap(f32)] : s.src?.m === 'lab' && v.length === 3 ? [...tag('LAB '), ...f32(v[0]! / 100), ...f32(v[1]!), ...f32(v[2]!)]
      : s.src?.m === 'gray' && v.length === 1 ? [...tag('Gray'), ...f32(v[0]!)] : [...tag('RGB '), ...f32(r / 255), ...f32(gr / 255), ...f32(b / 255)];
    block(0x0001, [...name(s.name || s.c), ...model, ...u16(code)]);
  }
  if (open) block(0xc002, []);
  const head = new Uint8Array(12), hv = new DataView(head.buffer);
  head.set([0x41, 0x53, 0x45, 0x46], 0);
  hv.setUint16(4, 1); hv.setUint16(6, 0); hv.setUint32(8, blocks);
  const out = new Uint8Array(12 + chunks.reduce((n, c) => n + c.length, 0));
  out.set(head, 0);
  let at = 12;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}
