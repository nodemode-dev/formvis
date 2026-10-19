import type { Mat } from '../engine';
import type { ChannelPixels, Rect } from '../engine/types';

/** Deep pixels for the GPU displays (1.90.8): a 16 or 32 bit layer's floats become half-float textures, premultiplied
 *  as the 8-bit upload is so the composite shaders read both alike, in display encoding (32 bit documents hold linear
 *  light, encoded here), so the composite keeps more than 8 bits and, past 1.0, the values an HDR display can show. */

interface HalfArray { buffer: ArrayBufferLike; set(a: ArrayLike<number>): void }
const NativeHalf = (globalThis as unknown as { Float16Array?: new (n: number) => HalfArray }).Float16Array;

const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);

/** The IEEE half-float bits of a number (round to nearest even; past 65504 clamps, NaN is 0). */
export function halfBits(v: number): number {
  f32[0] = v > 65504 ? 65504 : v < -65504 ? -65504 : v;
  const x = u32[0], s = (x >>> 16) & 0x8000, e = ((x >>> 23) & 0xff) - 112, m = x & 0x7fffff;
  if ((x & 0x7fffffff) > 0x7f800000) return 0;
  if (e <= 0) return e < -10 ? s : s | (((m | 0x800000) + (1 << (13 - e))) >> (14 - e));
  return s | ((e << 10) + ((m + 0xfff + ((m >> 13) & 1)) >> 13));
}

/** sRGB encoding of a linear value, extended past 1 so brighter than white stays brighter. */
export const encodeLinear = (v: number): number => (v <= 0 ? 0 : v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

/** The half-float bits (RGBA, colour times alpha) of a box of an RGB layer's floats, `box.w * box.h * 4` of them. */
export function deepHalf(ch: ChannelPixels, linear: boolean, box: Rect): Uint16Array {
  const out = new Uint16Array(box.w * box.h * 4), row = new Float32Array(box.w * 4), d = ch.data, native = NativeHalf ? new NativeHalf(box.w * 4) : null;
  const bits = native ? new Uint16Array(native.buffer as ArrayBuffer) : null;
  for (let y = 0; y < box.h; y++) {
    let i = ((box.y + y) * ch.width + box.x) * 4;
    for (let x = 0, k = 0; x < box.w; x++, i += 4, k += 4) {
      const a = d[i + 3] < 0 ? 0 : d[i + 3] > 1 ? 1 : d[i + 3];
      if (a === 0) { row[k] = 0; row[k + 1] = 0; row[k + 2] = 0; row[k + 3] = 0; continue; }
      row[k] = (linear ? encodeLinear(d[i]) : d[i]) * a;
      row[k + 1] = (linear ? encodeLinear(d[i + 1]) : d[i + 1]) * a;
      row[k + 2] = (linear ? encodeLinear(d[i + 2]) : d[i + 2]) * a;
      row[k + 3] = a;
    }
    const at = y * box.w * 4;
    if (native && bits) { native.set(row); out.set(bits, at); }
    else for (let k = 0; k < row.length; k++) out[at + k] = halfBits(row[k]);
  }
  return out;
}

/** The levels of a full mipmap chain for a texture of this size. */
export const mipLevels = (w: number, h: number): number => Math.floor(Math.log2(Math.max(1, w, h))) + 1;

/** The mip level a layer drawn at this placement samples: 0 from half size up, else the level whose texels are about
 *  a screen pixel (the display's zoom-out below 50 percent). */
export function lodFor(m: Mat, w: number, h: number): number {
  const s = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  return s > 0 && s < 0.5 ? Math.min(-Math.log2(s), mipLevels(w, h) - 1) : 0;
}

/** One level of a mip chain from the one above it: the mean of each 2 by 2 block of premultiplied texels (WebGPU). */
export const MIP_WGSL = /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
  let p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  return vec4<f32>(p[i], 0.0, 1.0);
}
@fragment fn fs(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
  let m = vec2<i32>(textureDimensions(src, 0)) - vec2<i32>(1);
  let b = vec2<i32>(floor(pos.xy)) * 2;
  return 0.25 * (textureLoad(src, min(b, m), 0) + textureLoad(src, min(b + vec2<i32>(1, 0), m), 0) + textureLoad(src, min(b + vec2<i32>(0, 1), m), 0) + textureLoad(src, min(b + vec2<i32>(1, 1), m), 0));
}`;
