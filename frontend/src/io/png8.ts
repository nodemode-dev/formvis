import { palette } from './gif';

/** DEV_PLAN 36.14: a true PNG-8, an indexed PNG (colour type 3) with a PLTE palette and, when the picture has see-through
 *  pixels, a tRNS chunk. The palette comes from the GIF encoder's median cut. Colors is 2 to 256; Dither is none or
 *  Floyd-Steinberg diffusion; Transparency keeps pixels under half opacity transparent (palette entry 0), or off
 *  composites the picture onto the matte. The bit depth follows the palette size (1, 2, 4 or 8). No DOM. */
export interface Png8Options { colors: number; dither: 'none' | 'diffusion'; transparency: boolean; matte?: [number, number, number] }
export interface Png8Image { data: Uint8ClampedArray; width: number; height: number }

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (b: Uint8Array): number => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = TABLE[(c ^ b[i]!) & 255]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length), dv = new DataView(out.buffer);
  dv.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  dv.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}

async function zlib(raw: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The indexed pixels (one palette index a pixel) and the palette they point into, entry 0 being the transparent one when `transparent`. */
export function quantize8(img: Png8Image, o: Png8Options): { indices: Uint8Array; colors: number[][]; transparent: boolean } {
  const { width: w, height: h } = img, px = new Uint8ClampedArray(img.data), matte = o.matte ?? [255, 255, 255];
  let clear = false;
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3]!;
    if (o.transparency) { if (a < 128) { clear = true; } else { px[i + 3] = 255; } continue; }
    if (a < 255) for (let c = 0; c < 3; c++) px[i + c] = Math.round((px[i + c]! * a + matte[c]! * (255 - a)) / 255);
    px[i + 3] = 255;
  }
  const max = Math.max(2, Math.min(256, Math.round(o.colors)));
  let opaque = false;
  for (let i = 3; i < px.length; i += 4) if (px[i]! >= 128) { opaque = true; break; }
  const pal = opaque ? palette(px, clear ? max - 1 : max) : { colors: [[0, 0, 0]], index: () => 0 };
  const off = clear ? 1 : 0, colors = clear ? [[0, 0, 0], ...pal.colors] : pal.colors;
  const indices = new Uint8Array(w * h);
  const dither = o.dither === 'diffusion' && pal.colors.length > 1;
  let cur = new Float32Array((w + 2) * 3), next = new Float32Array((w + 2) * 3);
  for (let y = 0; y < h; y++) {
    next.fill(0);
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      if (px[p + 3]! < 128) { indices[y * w + x] = 0; continue; }
      const r = px[p]!, g = px[p + 1]!, b = px[p + 2]!;
      const ar = dither ? Math.max(0, Math.min(255, r + cur[(x + 1) * 3]!)) : r;
      const ag = dither ? Math.max(0, Math.min(255, g + cur[(x + 1) * 3 + 1]!)) : g;
      const ab = dither ? Math.max(0, Math.min(255, b + cur[(x + 1) * 3 + 2]!)) : b;
      const k = pal.index(Math.round(ar), Math.round(ag), Math.round(ab));
      indices[y * w + x] = k + off;
      if (!dither) continue;
      const c = pal.colors[k]!, e = [ar - c[0]!, ag - c[1]!, ab - c[2]!];
      for (let ch = 0; ch < 3; ch++) {
        cur[(x + 2) * 3 + ch] = cur[(x + 2) * 3 + ch]! + (e[ch]! * 7) / 16;
        next[x * 3 + ch] = next[x * 3 + ch]! + (e[ch]! * 3) / 16;
        next[(x + 1) * 3 + ch] = next[(x + 1) * 3 + ch]! + (e[ch]! * 5) / 16;
        next[(x + 2) * 3 + ch] = next[(x + 2) * 3 + ch]! + e[ch]! / 16;
      }
    }
    [cur, next] = [next, cur];
  }
  return { indices, colors, transparent: clear };
}

/** An Indexed Color document's picture as an indexed PNG that keeps the document's own palette (at most 256 entries);
 *  each pixel takes its exact palette entry, else the nearest, and a see-through pixel takes `clearIndex` when given. */
export async function encodeIndexedPng(img: Png8Image, colors: ReadonlyArray<readonly [number, number, number]>, clearIndex?: number): Promise<Uint8Array> {
  const { width: w, height: h, data } = img, pal = colors.slice(0, 256), seen = new Map<number, number>(), indices = new Uint8Array(w * h);
  const near = (r: number, g: number, b: number): number => {
    let best = 0, bd = Infinity;
    for (let k = 0; k < pal.length; k++) {
      const c = pal[k]!, d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2;
      if (d < bd) { bd = d; best = k; if (d === 0) break; }
    }
    return best;
  };
  for (let i = 0, p = 0; i < indices.length; i++, p += 4) {
    if (clearIndex !== undefined && data[p + 3]! < 128) { indices[i] = clearIndex; continue; }
    const key = (data[p]! << 16) | (data[p + 1]! << 8) | data[p + 2]!;
    let k = seen.get(key);
    if (k === undefined) { k = near(data[p]!, data[p + 1]!, data[p + 2]!); seen.set(key, k); }
    indices[i] = k;
  }
  return packIndexed(w, h, indices, pal.map((c) => [c[0], c[1], c[2]]), clearIndex !== undefined && clearIndex < pal.length ? clearIndex : -1);
}

/** The PNG-8 file for `img`. */
export async function encodePng8(img: Png8Image, o: Png8Options): Promise<Uint8Array> {
  const q = quantize8(img, o);
  return packIndexed(img.width, img.height, q.indices, q.colors, q.transparent ? 0 : -1);
}

/** Indexed pixels and their palette as a PNG; `clear` is the palette entry that is see-through, or -1 for none. */
async function packIndexed(w: number, h: number, indices: Uint8Array, colors: number[][], clear: number): Promise<Uint8Array> {
  const q = { indices, colors, clear }, n = q.colors.length;
  const depth = n <= 2 ? 1 : n <= 4 ? 2 : n <= 16 ? 4 : 8, perByte = 8 / depth, stride = Math.ceil(w / perByte);
  const raw = new Uint8Array((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (stride + 1);
    for (let x = 0; x < w; x++) raw[row + 1 + Math.floor(x / perByte)]! |= q.indices[y * w + x]! << (8 - depth - (x % perByte) * depth);
  }
  const head = new Uint8Array(13), hv = new DataView(head.buffer);
  hv.setUint32(0, w); hv.setUint32(4, h); head[8] = depth; head[9] = 3;
  const plte = new Uint8Array(n * 3);
  q.colors.forEach((c, i) => plte.set(c as number[], i * 3));
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', head), chunk('PLTE', plte)];
  if (q.clear >= 0) parts.push(chunk('tRNS', Uint8Array.from({ length: q.clear + 1 }, (_, i) => (i === q.clear ? 0 : 255))));
  parts.push(chunk('IDAT', await zlib(raw)), chunk('IEND', new Uint8Array(0)));
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
