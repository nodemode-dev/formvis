/** Colour spaces for export, written for formvis. formvis works in sRGB (browser canvases are sRGB); an export can be
 *  converted to Display P3 or Adobe RGB (1998) and carry that space's ICC profile, which this module also writes: a
 *  version 2 display profile with the space's primaries adapted to the D50 connection space by Bradford, as ICC
 *  requires, its D65 white point, and its tone curve (sRGB's piecewise curve as a 1024-entry table, Adobe RGB's pure
 *  gamma of 563/256). Conversions go through linear light and CIE XYZ; all three spaces share D65, so no adaptation is
 *  needed between them, and values outside the target are clipped. */

export type SpaceId = 'srgb' | 'display-p3' | 'adobe-rgb';
type XY = [number, number];
interface Space { id: SpaceId; label: string; primaries: [XY, XY, XY]; white: XY; trc: 'srgb' | number }

export const SPACES: Record<SpaceId, Space> = {
  srgb: { id: 'srgb', label: 'sRGB IEC61966-2.1', primaries: [[0.64, 0.33], [0.3, 0.6], [0.15, 0.06]], white: [0.3127, 0.329], trc: 'srgb' },
  'display-p3': { id: 'display-p3', label: 'Display P3', primaries: [[0.68, 0.32], [0.265, 0.69], [0.15, 0.06]], white: [0.3127, 0.329], trc: 'srgb' },
  'adobe-rgb': { id: 'adobe-rgb', label: 'Adobe RGB (1998)', primaries: [[0.64, 0.33], [0.21, 0.71], [0.15, 0.06]], white: [0.3127, 0.329], trc: 563 / 256 },
};

type M3 = number[];
const mul3 = (a: M3, b: M3): M3 => [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]));
const apply3 = (m: M3, v: number[]): number[] => [0, 1, 2].map((r) => m[r * 3] * v[0] + m[r * 3 + 1] * v[1] + m[r * 3 + 2] * v[2]);
function inv3(m: M3): M3 {
  const [a, b, c, d, e, f, g, h, i] = m, A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((x) => x / det);
}
const xyz = ([x, y]: XY): number[] => [x / y, 1, (1 - x - y) / y];

/** RGB (linear) to XYZ for a space, white scaled to Y = 1. */
export function toXyz(s: Space): M3 {
  const [r, g, b] = s.primaries.map(xyz), P: M3 = [r[0], g[0], b[0], r[1], g[1], b[1], r[2], g[2], b[2]], S = apply3(inv3(P), xyz(s.white));
  return [P[0] * S[0], P[1] * S[1], P[2] * S[2], P[3] * S[0], P[4] * S[1], P[5] * S[2], P[6] * S[0], P[7] * S[1], P[8] * S[2]];
}

const decode = (trc: Space['trc'], v: number): number => (trc === 'srgb' ? (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4) : v ** trc);
const encode = (trc: Space['trc'], v: number): number => (trc === 'srgb' ? (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055) : v ** (1 / trc));

/** Converts straight RGBA pixels from one space to another in place (alpha untouched); a no-op for the same space. */
export function convertPixels(data: Uint8ClampedArray, from: SpaceId, to: SpaceId): void {
  if (from === to) return;
  const s = SPACES[from], t = SPACES[to], m = mul3(inv3(toXyz(t)), toXyz(s)), lin = new Float32Array(256);
  for (let i = 0; i < 256; i++) lin[i] = decode(s.trc, i / 255);
  // Encoding through a fine table: 4096 steps of linear light are enough for 8-bit output.
  const N = 4096, enc = new Uint8Array(N + 1);
  for (let i = 0; i <= N; i++) enc[i] = Math.round(Math.min(1, Math.max(0, encode(t.trc, i / N))) * 255);
  const e = (v: number): number => enc[Math.round(Math.min(1, Math.max(0, v)) * N)];
  for (let i = 0; i < data.length; i += 4) {
    const r = lin[data[i]], g = lin[data[i + 1]], b = lin[data[i + 2]];
    data[i] = e(m[0] * r + m[1] * g + m[2] * b);
    data[i + 1] = e(m[3] * r + m[4] * g + m[5] * b);
    data[i + 2] = e(m[6] * r + m[7] * g + m[8] * b);
  }
}

// Bradford adaptation from D65 to D50, the ICC connection space's white.
const BRADFORD: M3 = [0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296];
const D50 = [0.9642, 1, 0.8249];
function adaptToD50(white: XY): M3 {
  const src = apply3(BRADFORD, xyz(white)), dst = apply3(BRADFORD, D50);
  const scale: M3 = [dst[0] / src[0], 0, 0, 0, dst[1] / src[1], 0, 0, 0, dst[2] / src[2]];
  return mul3(inv3(BRADFORD), mul3(scale, BRADFORD));
}

/** The ICC version 2 display profile for a space, as bytes. */
export function iccProfile(id: SpaceId): Uint8Array {
  const s = SPACES[id], m = mul3(adaptToD50(s.white), toXyz(s)), cols = [0, 1, 2].map((c) => [m[c], m[3 + c], m[6 + c]]);
  const tags: Array<[string, number[]]> = [];
  const u32 = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255], u16 = (v: number) => [(v >> 8) & 255, v & 255];
  const sig = (t: string) => Array.from(t).map((c) => c.charCodeAt(0));
  const s15 = (v: number) => u32(Math.round(v * 65536) >>> 0);
  const xyzTag = (v: number[]) => [...sig('XYZ '), 0, 0, 0, 0, ...v.flatMap(s15)];
  const ascii = (text: string) => [...Array.from(text).map((c) => c.charCodeAt(0) & 127), 0];
  const desc = [...sig('desc'), 0, 0, 0, 0, ...u32(s.label.length + 1), ...ascii(s.label), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...new Array(67).fill(0)];
  let curve: number[];
  if (s.trc === 'srgb') {
    const n = 1024, entries: number[] = [];
    for (let i = 0; i < n; i++) entries.push(...u16(Math.round(decode('srgb', i / (n - 1)) * 65535)));
    curve = [...sig('curv'), 0, 0, 0, 0, ...u32(n), ...entries];
  } else curve = [...sig('curv'), 0, 0, 0, 0, ...u32(1), ...u16(Math.round(s.trc * 256))];
  tags.push(['desc', desc], ['cprt', [...sig('text'), 0, 0, 0, 0, ...ascii('No copyright, use freely')]], ['wtpt', xyzTag(xyz(s.white).map((v) => v * 1))],
    ['rXYZ', xyzTag(cols[0])], ['gXYZ', xyzTag(cols[1])], ['bXYZ', xyzTag(cols[2])], ['rTRC', curve], ['gTRC', curve], ['bTRC', curve]);
  const pad = (a: number[]) => { while (a.length % 4) a.push(0); return a; };
  const table: number[] = [], body: number[] = [];
  let offset = 128 + 4 + tags.length * 12;
  const seen = new Map<number[], number>();
  for (const [name, data] of tags) {
    let at = seen.get(data);
    if (at === undefined) { at = offset; seen.set(data, at); const d = pad(data.slice()); body.push(...d); offset += d.length; }
    table.push(...sig(name), ...u32(at), ...u32(data.length));
  }
  const size = 128 + 4 + table.length + body.length;
  const header = [...u32(size), 0, 0, 0, 0, 2, 0x10, 0, 0, ...sig('mntrRGB XYZ '), ...u16(2026), ...u16(1), ...u16(1), 0, 0, 0, 0, 0, 0, ...sig('acsp'), ...new Array(4 + 4 + 4 + 4 + 8 + 4).fill(0), ...D50.flatMap(s15), ...new Array(4 + 16 + 28).fill(0)];
  return new Uint8Array([...header, ...u32(tags.length), ...table, ...body]);
}
