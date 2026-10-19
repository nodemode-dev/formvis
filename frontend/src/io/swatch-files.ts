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
    default: return null;
  }
}

export function readAco(bytes: Uint8Array): string[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;
  const section = (): { version: number; colours: string[] } | null => {
    if (p + 4 > bytes.byteLength) return null;
    const version = dv.getUint16(p), count = dv.getUint16(p + 2);
    if (version !== 1 && version !== 2) return null;
    p += 4;
    const colours: string[] = [];
    for (let i = 0; i < count; i += 1) {
      if (p + 10 > bytes.byteLength) break;
      const c = acoColour(dv.getUint16(p), dv.getUint16(p + 2), dv.getUint16(p + 4), dv.getUint16(p + 6), dv.getUint16(p + 8));
      p += 10;
      if (version === 2) {
        if (p + 4 > bytes.byteLength) break;
        p += 2;
        const n = dv.getUint16(p);
        p += 2 + n * 2;
      }
      if (c) colours.push(c);
    }
    return { version, colours };
  };
  const first = section();
  if (!first) throw new Error('This is not an .aco swatch file.');
  const second = section();
  return second && second.colours.length ? second.colours : first.colours;
}

export function writeAco(list: string[]): Uint8Array {
  const out = new Uint8Array(4 + list.length * 10 + 4 + list.reduce((n, h) => n + 14 + (h.length + 1) * 2, 0));
  const dv = new DataView(out.buffer);
  let p = 0;
  const u16 = (v: number): void => { dv.setUint16(p, v); p += 2; };
  for (const version of [1, 2]) {
    u16(version); u16(list.length);
    for (const h of list) {
      const [r, g, b] = parseHex(h);
      u16(0); u16(r * 257); u16(g * 257); u16(b * 257); u16(0);
      if (version === 2) {
        u16(0); u16(h.length + 1);
        for (let i = 0; i < h.length; i += 1) u16(h.charCodeAt(i));
        u16(0);
      }
    }
  }
  return out;
}

export function readAse(bytes: Uint8Array): string[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12 || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'ASEF') throw new Error('This is not an .ase swatch file.');
  const blocks = dv.getUint32(8);
  let p = 12;
  const out: string[] = [];
  for (let i = 0; i < blocks && p + 6 <= bytes.byteLength; i += 1) {
    const type = dv.getUint16(p), len = dv.getUint32(p + 2), end = p + 6 + len;
    if (type === 0x0001 && end <= bytes.byteLength) {
      let q = p + 6;
      const nameLen = dv.getUint16(q);
      q += 2 + nameLen * 2;
      const model = String.fromCharCode(bytes[q], bytes[q + 1], bytes[q + 2], bytes[q + 3]);
      q += 4;
      const f = (k: number): number => dv.getFloat32(q + k * 4);
      if (model === 'RGB ') out.push(toHex(f(0) * 255, f(1) * 255, f(2) * 255));
      else if (model === 'CMYK') out.push(cmykToRgb(f(0), f(1), f(2), f(3)));
      else if (model === 'LAB ') out.push(labToRgb(f(0) * 100, f(1), f(2)));
      else if (model === 'Gray') { const g = f(0) * 255; out.push(toHex(g, g, g)); }
    }
    p = end;
  }
  return out;
}

export function writeAse(list: string[]): Uint8Array {
  const size = 12 + list.reduce((n, h) => n + 6 + 2 + (h.length + 1) * 2 + 4 + 12 + 2, 0);
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  out.set([0x41, 0x53, 0x45, 0x46], 0);
  dv.setUint16(4, 1); dv.setUint16(6, 0); dv.setUint32(8, list.length);
  let p = 12;
  for (const h of list) {
    const nameChars = h.length + 1, len = 2 + nameChars * 2 + 4 + 12 + 2;
    dv.setUint16(p, 0x0001); dv.setUint32(p + 2, len);
    p += 6;
    dv.setUint16(p, nameChars);
    p += 2;
    for (let i = 0; i < h.length; i += 1) { dv.setUint16(p, h.charCodeAt(i)); p += 2; }
    p += 2;
    out.set([0x52, 0x47, 0x42, 0x20], p);
    p += 4;
    const [r, g, b] = parseHex(h);
    dv.setFloat32(p, r / 255); dv.setFloat32(p + 4, g / 255); dv.setFloat32(p + 8, b / 255);
    p += 12;
    dv.setUint16(p, 2);
    p += 2;
  }
  return out;
}
