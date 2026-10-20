import type { BlendMode } from './types';
import { wasmBlend } from './wasm-kernels';

/** Blend modes the browser canvas has no operation for, composited here per pixel with the standard formula
 *  (W3C Compositing and Blending): the result colour is the source over the backdrop, where the part of the source
 *  that covers backdrop shows B(backdrop, source). Channels are 0 to 1. Dissolve keeps a pixel of the source fully or
 *  not at all, with a chance equal to its opacity, on a pattern fixed to document pixels. */
export const PIXEL_BLENDS: ReadonlySet<BlendMode> = new Set<BlendMode>(['dissolve', 'linear-burn', 'darker-color', 'lighter-color', 'vivid-light', 'linear-light', 'pin-light', 'hard-mix', 'subtract', 'divide']);

export const EXTRA_BLENDS: ReadonlySet<BlendMode> = new Set<BlendMode>(['negation', 'reflect', 'glow', 'xor']);

const burn = (b: number, s: number): number => (b >= 1 ? 1 : s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s));
const dodge = (b: number, s: number): number => (b <= 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s)));
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

type Sep = (b: number, s: number) => number;
const SEPARABLE: Partial<Record<BlendMode, Sep>> = {
  'linear-burn': (b, s) => clamp01(b + s - 1),
  'vivid-light': (b, s) => (s <= 0.5 ? burn(b, 2 * s) : dodge(b, 2 * (s - 0.5))),
  'linear-light': (b, s) => clamp01(b + 2 * s - 1),
  'pin-light': (b, s) => (s <= 0.5 ? Math.min(b, 2 * s) : Math.max(b, 2 * s - 1)),
  'hard-mix': (b, s) => (b + s >= 1 ? 1 : 0),
  subtract: (b, s) => clamp01(b - s),
  divide: (b, s) => (s <= 0 ? (b <= 0 ? 0 : 1) : Math.min(1, b / s)),
  negation: (b, s) => 1 - Math.abs(1 - b - s),
  reflect: (b, s) => (s >= 1 ? 1 : Math.min(1, (b * b) / (1 - s))),
  glow: (b, s) => (b >= 1 ? 1 : Math.min(1, (s * s) / (1 - b))),
  xor: (b, s) => ((Math.round(b * 255) ^ Math.round(s * 255)) & 255) / 255,
};

/** A stable value in [0, 1) for a document pixel. */
export function dissolveNoise(x: number, y: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Blends `src` onto `dst` in place (both RGBA, same size) with `mode` at `opacity`. `docAt(i)` gives the document
 *  pixel under index `i` for Dissolve's pattern. */
export function blendPixels(dst: Uint8ClampedArray, src: Uint8ClampedArray, mode: BlendMode, opacity: number, docAt: (i: number) => [number, number]): void {
  if (mode !== 'dissolve' && wasmBlend(dst, src, mode, opacity)) return;
  const sep = SEPARABLE[mode], lum = (r: number, g: number, b: number): number => 0.3 * r + 0.59 * g + 0.11 * b;
  for (let i = 0; i < dst.length; i += 4) {
    const as = (src[i + 3] / 255) * opacity;
    if (as <= 0) continue;
    const ab = dst[i + 3] / 255;
    if (mode === 'dissolve') {
      const [x, y] = docAt(i >> 2);
      if (dissolveNoise(x, y) >= as) continue;
      dst[i] = src[i]; dst[i + 1] = src[i + 1]; dst[i + 2] = src[i + 2]; dst[i + 3] = 255;
      continue;
    }
    const sr = src[i] / 255, sg = src[i + 1] / 255, sb = src[i + 2] / 255, br = dst[i] / 255, bg = dst[i + 1] / 255, bb = dst[i + 2] / 255;
    let rr: number, rg: number, rb: number;
    if (sep) { rr = sep(br, sr); rg = sep(bg, sg); rb = sep(bb, sb); }
    else {
      const darker = lum(sr, sg, sb) < lum(br, bg, bb);
      const takeSource = mode === 'darker-color' ? darker : !darker;
      [rr, rg, rb] = takeSource ? [sr, sg, sb] : [br, bg, bb];
    }
    const ao = as + ab * (1 - as);
    if (ao <= 0) continue;
    const k1 = as * (1 - ab), k2 = as * ab, k3 = (1 - as) * ab;
    dst[i] = Math.round(((k1 * sr + k2 * rr + k3 * br) / ao) * 255);
    dst[i + 1] = Math.round(((k1 * sg + k2 * rg + k3 * bg) / ao) * 255);
    dst[i + 2] = Math.round(((k1 * sb + k2 * rb + k3 * bb) / ao) * 255);
    dst[i + 3] = Math.round(ao * 255);
  }
}
