import { dissolveNoise } from './blend';
import { deepFromRaster, linearToSrgb, place, srgbToLinear, transferOf } from './deep';
import { transferLut } from './transfer-pow';
import { hierarchy, byId, ancestors, descendantIds, groupIsolated } from './tree';
import { placement, setMat } from './geometry';
import { shapedMask } from './layer-masks';
import { vectorCoverage } from './vector-mask';
import { applyLut4, inkOf, type Lut3x4, type Lut4 } from './colour-lut';
import { encodeLab, labFloatToRgb, renderLab, srgbToLab } from './lab';
import { paramValues } from './adjust-params';
import { kernelFor } from './renderer';
import type { Kernel } from './kernels';
import type { BlendMode, Doc, Layer, ID } from './types';
import { effectsActive } from './types';

/** Compositing in the mode (1.55.5, DEV_PLAN 22.5): the document composed on the one float model, for 16-bit, 32-bit
 *  and CMYK documents alike. Every separable blend mode runs per channel on the channel values (for CMYK on
 *  paper-white values, 1 minus ink, so Multiply darkens as CMYK ink does), with opacity and fill, the layer's
 *  own mask, its folders' masks, clipping to a base layer, and adjustment layers with a transfer (Levels, Curves,
 *  Invert, Posterize, Brightness/Contrast, Exposure) applied per channel under their masks. Every other adjustment
 *  and the non-separable modes (Hue, Saturation, Color, Luminosity, Darker and Lighter Color) run through the
 *  document's rendition (1.55.7, `viaKernel`); layer styles wait for 22.7 and say so. A folder that is isolated
 *  (`groupIsolated`) composites its layers on a clear buffer and is then blended with its mode and opacity; any other
 *  folder is pass-through, as the renderer treats them. An adjustment layer in a mode of its own blends its result
 *  with that mode, at its opacity and under its masks. */

type Sep = (b: number, s: number) => number;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const burn = (b: number, s: number): number => (b >= 1 ? 1 : s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s));
const dodge = (b: number, s: number): number => (b <= 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s)));
const hardLight = (b: number, s: number): number => (s <= 0.5 ? b * 2 * s : b + (2 * s - 1) - b * (2 * s - 1));
const softLight = (b: number, s: number): number => {
  if (s <= 0.5) return b - (1 - 2 * s) * b * (1 - b);
  const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
  return b + (2 * s - 1) * (d - b);
};
export const SEPARABLE_FLOAT: Partial<Record<BlendMode, Sep>> = {
  normal: (_b, s) => s,
  multiply: (b, s) => b * s,
  screen: (b, s) => b + s - b * s,
  overlay: (b, s) => hardLight(s, b),
  darken: (b, s) => Math.min(b, s),
  lighten: (b, s) => Math.max(b, s),
  'color-dodge': dodge,
  'color-burn': burn,
  'hard-light': hardLight,
  'soft-light': softLight,
  difference: (b, s) => Math.abs(b - s),
  exclusion: (b, s) => b + s - 2 * b * s,
  'linear-burn': (b, s) => clamp01(b + s - 1),
  'vivid-light': (b, s) => (s <= 0.5 ? burn(b, 2 * s) : dodge(b, 2 * (s - 0.5))),
  'linear-light': (b, s) => clamp01(b + 2 * s - 1),
  'pin-light': (b, s) => (s <= 0.5 ? Math.min(b, 2 * s) : Math.max(b, 2 * s - 1)),
  'hard-mix': (b, s) => (b + s >= 1 ? 1 : 0),
  subtract: (b, s) => clamp01(b - s),
  divide: (b, s) => (s <= 0 ? (b <= 0 ? 0 : 1) : Math.min(1, b / s)),
  'linear-dodge': (b, s) => clamp01(b + s),
  negation: (b, s) => 1 - Math.abs(1 - b - s),
  reflect: (b, s) => (s >= 1 ? 1 : Math.min(1, (b * b) / (1 - s))),
  glow: (b, s) => (b >= 1 ? 1 : Math.min(1, (s * s) / (1 - b))),
  xor: (b, s) => ((Math.round(b * 255) ^ Math.round(s * 255)) & 255) / 255,
};

/** At 32 bits (1.57.1) values are linear light and may pass 1: the modes usually offered there, unclamped. Darker and
 *  Lighter Color and Dissolve also work; the rest wait and are named. */
const LINEAR_FLOAT: Partial<Record<BlendMode, Sep>> = {
  normal: (_b, s) => s,
  multiply: (b, s) => b * s,
  darken: (b, s) => Math.min(b, s),
  lighten: (b, s) => Math.max(b, s),
  difference: (b, s) => Math.abs(b - s),
  'linear-dodge': (b, s) => b + s,
};

const lum = (r: number, g: number, b: number): number => 0.3 * r + 0.59 * g + 0.11 * b;
function clipColor(c: [number, number, number]): [number, number, number] {
  const l = lum(c[0], c[1], c[2]), n = Math.min(c[0], c[1], c[2]), x = Math.max(c[0], c[1], c[2]);
  let out = c;
  if (n < 0) out = out.map((v) => l + ((v - l) * l) / (l - n)) as [number, number, number];
  if (x > 1) out = out.map((v) => l + ((v - l) * (1 - l)) / (x - l)) as [number, number, number];
  return out;
}
const setLum = (c: [number, number, number], l: number): [number, number, number] => { const d = l - lum(c[0], c[1], c[2]); return clipColor([c[0] + d, c[1] + d, c[2] + d]); };
const sat = (c: [number, number, number]): number => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
function setSat(c: [number, number, number], s: number): [number, number, number] {
  const idx = [0, 1, 2].sort((a, b) => c[a] - c[b]), mn = idx[0], md = idx[1], mx = idx[2], out: [number, number, number] = [0, 0, 0];
  if (c[mx] > c[mn]) { out[md] = ((c[md] - c[mn]) * s) / (c[mx] - c[mn]); out[mx] = s; } else { out[md] = 0; out[mx] = 0; }
  out[mn] = 0;
  return out;
}
/** The W3C non-separable modes on RGB floats. */
function nonSeparable(mode: BlendMode, b: [number, number, number], s: [number, number, number]): [number, number, number] | null {
  switch (mode) {
    case 'hue': return setLum(setSat(s, sat(b)), lum(b[0], b[1], b[2]));
    case 'saturation': return setLum(setSat(b, sat(s)), lum(b[0], b[1], b[2]));
    case 'color': return setLum(s, lum(b[0], b[1], b[2]));
    case 'luminosity': return setLum(b, lum(s[0], s[1], s[2]));
    case 'darker-color': return lum(s[0], s[1], s[2]) < lum(b[0], b[1], b[2]) ? s : b;
    case 'lighter-color': return lum(s[0], s[1], s[2]) < lum(b[0], b[1], b[2]) ? b : s;
    default: return null;
  }
}

/** A CMYK document's two tables: ink to its sRGB rendition, and sRGB to ink (the profile's separation). */
export interface CmykLuts { out: Lut4; in: Lut3x4 }

/** Colour-model operations in the mode (1.55.7, DEV_PLAN 22.6). An adjustment defined on colour rather than on each
 *  channel (Hue/Saturation, Color Balance, Black and White, Gradient Map, Threshold...) runs its own 8-bit kernel on
 *  the composite's rendition, the same kernel RGB documents use. At 16 bits the change it makes is added to the floats,
 *  so the gradations between 8-bit levels survive. In CMYK the result is separated back to ink by the profile, and the
 *  original ink's structure (its black generation, a K-only black, detail beyond sRGB) is carried over in proportion
 *  to how small the change is: fully for an adjustment that changes nothing, not at all for one that changes a colour
 *  by 48 levels or more. An identity adjustment leaves every value exactly as it was. */
const KEEP_LEVELS = 48;
const MEMO = 65536, f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
function viaKernel(out: Float32Array, W: number, H: number, n: 3 | 4, kern: Kernel, op: number, cov: Float32Array | null, luts: CmykLuts | null, lab = false): void {
  const N = W * H, S = n + 1, A = n, rgba = new Uint8ClampedArray(N * 4);
  if (lab) renderLab(out, rgba);
  else if (n === 4 && luts) applyLut4(out, luts.out, rgba);
  else for (let j = 0; j < N; j++) { const i = j * S, o = j * 4; for (let c = 0; c < 3; c++) rgba[o + c] = Math.round(clamp01(out[i + c]) * 255); rgba[o + 3] = Math.round(clamp01(out[i + A]) * 255); }
  const adj = new Uint8ClampedArray(rgba);
  kern(adj, { width: W, height: H, originX: 0, originY: 0, unitsPerPixel: 1 });
  for (let j = 0; j < N; j++) {
    const i = j * S, o = j * 4, k = op * (cov ? cov[j] : 1);
    if (k <= 0 || out[i + A] <= 0) continue;
    if (adj[o] === rgba[o] && adj[o + 1] === rgba[o + 1] && adj[o + 2] === rgba[o + 2]) continue;
    if (lab) {
      const before = encodeLab(...srgbToLab(rgba[o], rgba[o + 1], rgba[o + 2])), after = encodeLab(...srgbToLab(adj[o], adj[o + 1], adj[o + 2]));
      const d = Math.max(Math.abs(adj[o] - rgba[o]), Math.abs(adj[o + 1] - rgba[o + 1]), Math.abs(adj[o + 2] - rgba[o + 2])), w = clamp01(1 - d / KEEP_LEVELS);
      for (let c = 0; c < 3; c++) { const target = clamp01(after[c] + w * (out[i + c] - before[c])); out[i + c] += (target - out[i + c]) * k; }
      continue;
    }
    if (n === 3 || !luts) { for (let c = 0; c < 3; c++) out[i + c] = clamp01(out[i + c] + ((adj[o + c] - rgba[o + c]) / 255) * k); continue; }
    const before = inkOf({ r: rgba[o], g: rgba[o + 1], b: rgba[o + 2] }, luts.in), after = inkOf({ r: adj[o], g: adj[o + 1], b: adj[o + 2] }, luts.in);
    const d = Math.max(Math.abs(adj[o] - rgba[o]), Math.abs(adj[o + 1] - rgba[o + 1]), Math.abs(adj[o + 2] - rgba[o + 2])), w = clamp01(1 - d / KEEP_LEVELS);
    for (let c = 0; c < 4; c++) { const target = clamp01(after[c] + w * (out[i + c] - before[c])); out[i + c] += (target - out[i + c]) * k; }
  }
}

/** Layer styles in the float compositor (1.56.9, DEV_PLAN 22.10): the engine's 8-bit renderer draws a styled layer
 *  alone twice, with and without its style (at full opacity, its Fill applied, no mask, outside any group); pixels the
 *  style leaves alone keep the layer's floats exactly, and the ones it draws come in through the mode's conversion with
 *  the derive rule (the old floats kept where the change is small). The engine registers the drawer at start. */
export type StyleDrawer = (doc: Doc, layer: Layer) => { styled: ImageData; plain: ImageData } | null;
let styleDrawer: StyleDrawer | null = null;
export function setStyleDrawer(fn: StyleDrawer | null): StyleDrawer | null { styleDrawer = fn; return fn; }

function withStyle(tmp: Float32Array, d: { styled: ImageData; plain: ImageData }, n: 3 | 4, toFloats: (r: number, g: number, b: number) => ArrayLike<number>, fill: number, linear = false): void {
  const A = n, S = n + 1, st = d.styled.data, pl = d.plain.data, N = st.length / 4;
  for (let j = 0; j < N; j++) {
    const o = j * 4, i = j * S;
    tmp[i + A] *= fill;
    if (st[o] === pl[o] && st[o + 1] === pl[o + 1] && st[o + 2] === pl[o + 2] && st[o + 3] === pl[o + 3]) continue;
    const after = toFloats(st[o], st[o + 1], st[o + 2]);
    const dd = Math.max(Math.abs(st[o] - pl[o]), Math.abs(st[o + 1] - pl[o + 1]), Math.abs(st[o + 2] - pl[o + 2])), w = pl[o + 3] === 0 ? 0 : clamp01(1 - dd / KEEP_LEVELS);
    const before = w ? toFloats(pl[o], pl[o + 1], pl[o + 2]) : after;
    for (let c = 0; c < A; c++) { const v = after[c] + w * (tmp[i + c] - before[c]); tmp[i + c] = linear ? Math.max(0, v) : clamp01(v); }
    tmp[i + A] = st[o + 3] / 255;
  }
}

/** One ink's 8-bit rendition through the display table, without allocating. */
const oneInk = new Float32Array(5), oneRgb = new Uint8ClampedArray(4);
function rgbOfInk(lut: Lut4, d: Float32Array, i: number): [number, number, number] {
  oneInk[0] = d[i]; oneInk[1] = d[i + 1]; oneInk[2] = d[i + 2]; oneInk[3] = d[i + 3]; oneInk[4] = 1;
  applyLut4(oneInk, lut, oneRgb);
  return [oneRgb[0], oneRgb[1], oneRgb[2]];
}

/** A mask raster's coverage at document size, 0 to 1 (white shows), through its placement. */
function maskCoverage(mask: { raster: { canvas: CanvasImageSource; width: number; height: number }; placement: import('./types').Transform; apart?: boolean }, W: number, H: number): Float32Array {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = mask.apart ? '#fff' : '#000'; g.fillRect(0, 0, W, H);
  setMat(g, placement(mask.placement, mask.raster.width, mask.raster.height));
  g.imageSmoothingEnabled = mask.placement.sampling !== 'nearest';
  if (mask.apart) { g.fillStyle = '#000'; g.fillRect(0, 0, mask.raster.width, mask.raster.height); }
  g.drawImage(mask.raster.canvas, 0, 0);
  const d = g.getImageData(0, 0, W, H).data, out = new Float32Array(W * H);
  for (let i = 0, j = 0; j < out.length; i += 4, j++) out[j] = d[i] / 255;
  return out;
}

function alphaCoverage(s: CanvasImageSource, W: number, H: number): Float32Array {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.drawImage(s, 0, 0);
  const d = g.getImageData(0, 0, W, H).data, out = new Float32Array(W * H);
  for (let i = 3, j = 0; j < out.length; i += 4, j++) out[j] = d[i] / 255;
  return out;
}

export interface FloatComposite { width: number; height: number; data: Float32Array }

export function composeFloat(doc: Doc, n: 3 | 4, paperWhite: boolean, luts: CmykLuts | null = null, linear = false): FloatComposite | { error: string } {
  const W = doc.width, H = doc.height, S = n + 1, A = n, N = W * H, out = new Float32Array(N * S), tmp = new Float32Array(N * S);
  const layers = doc.layers.map((l) => (l.parentId === undefined ? { ...l, parentId: null } : l)), walked = { ...doc, layers };
  const map = byId(walked), covers = new Map<string, Float32Array>(), clipAlpha = new Map<ID, Float32Array>();
  const toValue = paperWhite ? (v: number): number => 1 - v : (v: number): number => v, fromValue = toValue;
  const coverageOf = (l: Layer): Float32Array | null => {
    const up = ancestors(map, l), folders = up.filter((g) => g.mask?.raster && g.mask.enabled);
    const own = l.mask?.raster && l.mask.enabled ? l : null;
    const vectors = [l, ...up].filter((x) => x.vectorMask?.enabled), boards = up.filter((g) => g.artboard);
    if (!own && !folders.length && !vectors.length && !boards.length) return null;
    const cov = new Float32Array(N).fill(1);
    for (const m of [own, ...folders]) {
      if (!m?.mask?.raster) continue;
      const key = m.id;
      let c = covers.get(key);
      if (!c) { c = maskCoverage({ raster: shapedMask(m.mask) ?? m.mask.raster, placement: m.mask.placement ?? m.transform, apart: m !== own || !!m.mask.placement || !!m.adjustment }, W, H); covers.set(key, c); }
      for (let i = 0; i < N; i++) cov[i] *= c[i];
    }
    for (const x of vectors) {
      const key = `v:${x.id}`;
      let c = covers.get(key);
      if (!c) { const v = x.vectorMask ? vectorCoverage(x.vectorMask, W, H) : null; if (v) { c = alphaCoverage(v.surface as CanvasImageSource, W, H); covers.set(key, c); } }
      if (c) for (let i = 0; i < N; i++) cov[i] *= c[i];
    }
    for (const g of boards) {
      const a = g.artboard as NonNullable<Layer['artboard']>, x0 = Math.max(0, Math.round(a.x)), y0 = Math.max(0, Math.round(a.y)), x1 = Math.min(W, Math.round(a.x + a.w)), y1 = Math.min(H, Math.round(a.y + a.h));
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < x0 || x >= x1 || y < y0 || y >= y1) cov[y * W + x] = 0;
    }
    return cov;
  };
  const alphaOf = (base: Layer): Float32Array | null => {
    if (!base.raster) return null;
    let a = clipAlpha.get(base.id);
    if (a) return a;
    const src = base.channels ?? deepFromRaster(base.raster);
    if (src.n !== n) return null;
    tmp.fill(0); place(tmp, W, H, src, base.transform, 1, S);
    a = new Float32Array(N); for (let i = 0; i < N; i++) a[i] = tmp[i * S + A];
    clipAlpha.set(base.id, a);
    return a;
  };
  /** The source buffer blended onto dst in the mode, at op times cov times the source's alpha. `keep` is an
   *  adjustment's result: the pixels below are taken as opaque and their alpha is left as it was. */
  const blendInto = (dst: Float32Array, src: Float32Array, mode: BlendMode, op: number, cov: Float32Array | null, clipA: Float32Array | null, keep: boolean, name: string): { error: string } | null => {
    const sep = linear ? LINEAR_FLOAT[mode] : SEPARABLE_FLOAT[mode];
    // 32 bits (1.57.3): a mode outside the linear table blends the two colours in the display range (each clipped at
    // white, sRGB-encoded) by the 8-bit formula and comes back to linear light; light above white is kept wherever
    // only one of the two layers covers a pixel. Every blend mode works at 32 bits this way.
    const displayRange = linear && !sep && mode !== 'dissolve' && mode !== 'darker-color' && mode !== 'lighter-color';
    if (!displayRange && !sep && mode !== 'dissolve' && (!nonSeparable(mode, [0, 0, 0], [0, 0, 0]) || (n === 4 && !luts))) return { error: `${name} uses ${mode}, which needs the document's color tables in this mode.` };
    const bv: [number, number, number] = [0, 0, 0], sv: [number, number, number] = [0, 0, 0], lab = doc.mode === 'lab';
    for (let i = 0, j = 0; i < dst.length; i += S, j++) {
      let as = src[i + A] * op * (cov ? cov[j] : 1) * (clipA ? clipA[j] : 1);
      if (as <= 0) continue;
      const ab = keep ? (dst[i + A] > 0 ? 1 : 0) : dst[i + A];
      if (keep && ab === 0) continue;
      if (mode === 'dissolve') { if (dissolveNoise(j % W, Math.floor(j / W)) >= as) continue; as = 1; }
      const ao = as + ab * (1 - as), k1 = as * (1 - ab), k2 = as * ab, k3 = (1 - as) * ab;
      if (displayRange) {
        const enc = (v: number): number => linearToSrgb(Math.max(0, Math.min(1, v))), B = [enc(dst[i]), enc(dst[i + 1]), enc(dst[i + 2])] as [number, number, number], Sx = [enc(src[i]), enc(src[i + 1]), enc(src[i + 2])] as [number, number, number];
        const sep8 = SEPARABLE_FLOAT[mode], rr = sep8 ? [sep8(B[0], Sx[0]), sep8(B[1], Sx[1]), sep8(B[2], Sx[2])] : (nonSeparable(mode, B, Sx) ?? Sx);
        for (let c = 0; c < 3; c++) dst[i + c] = Math.max(0, (k1 * src[i + c] + k2 * srgbToLinear(clamp01(rr[c])) + k3 * dst[i + c]) / ao);
      } else if (lab && mode !== 'normal' && mode !== 'dissolve') {
        // Lab (1.56.6): the two colours' renditions blended by the RGB document's own formula, the result back in Lab.
        const B = labFloatToRgb(dst[i], dst[i + 1], dst[i + 2]), Sx = labFloatToRgb(src[i], src[i + 1], src[i + 2]);
        const rr = sep ? [sep(B[0], Sx[0]), sep(B[1], Sx[1]), sep(B[2], Sx[2])] : (nonSeparable(mode, B, Sx) ?? Sx);
        const r3 = encodeLab(...srgbToLab(clamp01(rr[0]) * 255, clamp01(rr[1]) * 255, clamp01(rr[2]) * 255));
        for (let c = 0; c < 3; c++) dst[i + c] = (k1 * src[i + c] + k2 * r3[c] + k3 * dst[i + c]) / ao;
      } else if (sep || mode === 'dissolve') {
        const f = sep ?? SEPARABLE_FLOAT.normal!;
        for (let c = 0; c < A; c++) { const b = toValue(dst[i + c]), s = toValue(src[i + c]), r = f(b, s); dst[i + c] = fromValue((k1 * s + k2 * r + k3 * b) / ao); }
      } else if (n === 4 && luts) {
        const B = rgbOfInk(luts.out, dst, i), Sx = rgbOfInk(luts.out, src, i), r4 = [0, 0, 0, 0];
        if (mode === 'darker-color' || mode === 'lighter-color') {
          const takeS = mode === 'darker-color' ? lum(Sx[0], Sx[1], Sx[2]) < lum(B[0], B[1], B[2]) : lum(Sx[0], Sx[1], Sx[2]) >= lum(B[0], B[1], B[2]);
          for (let c = 0; c < 4; c++) r4[c] = takeS ? src[i + c] : dst[i + c];
        } else {
          const rr = nonSeparable(mode, [B[0] / 255, B[1] / 255, B[2] / 255], [Sx[0] / 255, Sx[1] / 255, Sx[2] / 255]) ?? [Sx[0] / 255, Sx[1] / 255, Sx[2] / 255];
          const r8 = { r: clamp01(rr[0]) * 255, g: clamp01(rr[1]) * 255, b: clamp01(rr[2]) * 255 }, after = inkOf(r8, luts.in), before = inkOf({ r: B[0], g: B[1], b: B[2] }, luts.in);
          const w = clamp01(1 - Math.max(Math.abs(r8.r - B[0]), Math.abs(r8.g - B[1]), Math.abs(r8.b - B[2])) / KEEP_LEVELS);
          for (let c = 0; c < 4; c++) r4[c] = clamp01(after[c] + w * (dst[i + c] - before[c]));
        }
        for (let c = 0; c < 4; c++) dst[i + c] = (k1 * src[i + c] + k2 * r4[c] + k3 * dst[i + c]) / ao;
      } else {
        for (let c = 0; c < 3; c++) { bv[c] = toValue(dst[i + c]); sv[c] = toValue(src[i + c]); }
        const r = nonSeparable(mode, bv, sv) ?? sv;
        for (let c = 0; c < 3; c++) dst[i + c] = fromValue((k1 * sv[c] + k2 * r[c] + k3 * bv[c]) / ao);
      }
      if (!keep) dst[i + A] = ao;
    }
    return null;
  };
  /** One pass over the layers `only` names (all when null) onto buf; folders in `handled` are already composited. */
  const run = (out: Float32Array, only: ReadonlySet<ID> | null, handled: ReadonlySet<ID>): { error: string } | null => {
  const isoDone = new Set<ID>();
  let pending: (() => { error: string } | null) | null = null;
  const flush = (): { error: string } | null => { const p = pending; pending = null; return p ? p() : null; };
  for (const { layer: l, visible } of hierarchy(walked)) {
    const held = flush();
    if (held) return held;
    if (!visible || l.isGroup) continue;
    if (only && !only.has(l.id)) continue;
    // A layer in an isolated folder: the folder's layers composite on a clear buffer, blended in once, at the first.
    const iso = ancestors(map, l).reverse().find((g) => groupIsolated(g) && !handled.has(g.id));
    if (iso) {
      if (isoDone.has(iso.id)) continue;
      isoDone.add(iso.id);
      if (!(iso.opacity > 0)) continue;
      const inside = descendantIds(walked.layers, iso.id), sub = new Set<ID>(only ? inside.filter((id) => only.has(id)) : inside), nested = new Set<ID>(handled);
      nested.add(iso.id);
      const fb = new Float32Array(N * S), failed = run(fb, sub, nested);
      if (failed) return failed;
      const clash = blendInto(out, fb, iso.blend ?? 'normal', iso.opacity, null, null, false, `"${iso.name}"`);
      if (clash) return clash;
      continue;
    }
    const name = `"${l.name}"`;
    const drawn = effectsActive(l.effects) && !l.adjustment && l.raster ? styleDrawer?.(doc, l) ?? null : null;
    if (effectsActive(l.effects) && !l.adjustment && !drawn) return { error: `${name} has a layer style, which this mode's compositor cannot draw here.` };
    const op0 = l.opacity * (drawn ? 1 : l.fill ?? 1), cov0 = coverageOf(l), adjMode = l.adjustment ? l.blend ?? 'normal' : 'normal', viaMode = adjMode !== 'normal';
    // An adjustment in a mode of its own runs at full strength and is blended back in that mode at the next layer.
    const op = viaMode ? 1 : op0, cov = viaMode ? null : cov0;
    if (viaMode) {
      const below = out.slice();
      pending = () => {
        const adjusted = out.slice();
        for (let i = A; i < adjusted.length; i += S) adjusted[i] = below[i] > 0 ? 1 : 0;
        out.set(below);
        return blendInto(out, adjusted, adjMode, op0, cov0, null, true, name);
      };
    }
    if (l.adjustment && linear) {
      // 32 bits (1.53.9, on this compositor since 1.57.1): Exposure is exposure in linear light, unclamped.
      const e = l.adjustment.kind === 'exposure' ? (l.adjustment.data as { exposureSettings?: { exposure?: number; offset?: number; gamma?: number } }).exposureSettings : null;
      if (!e) {
        // Every other adjustment at 32 bits (1.57.7, DEV_PLAN 22.11): it acts on each pixel's colour within the display
        // range (the pixel divided by its brightest channel when that passes white, sRGB-encoded), and the brightness
        // above white is scaled back after, so a highlight keeps its light. Transfers (Levels, Curves and the like) run
        // in float; a kernel's change is added to the float, so precision is kept.
        const t = transferOf(l.adjustment), kern = t ? null : kernelFor(l.adjustment);
        if (!t && !kern) return { error: `${name} is an adjustment that waits at 32 bits (Exposure does).` };
        const N = W * H, scale = new Float32Array(N), rgba = kern ? new Uint8ClampedArray(N * 4) : null;
        for (let j = 0, i = 0; j < N; j++, i += S) {
          const m = Math.max(1, out[i], out[i + 1], out[i + 2]); scale[j] = m;
          if (rgba) { for (let c = 0; c < 3; c++) rgba[j * 4 + c] = Math.round(linearToSrgb(Math.max(0, out[i + c] / m)) * 255); rgba[j * 4 + 3] = 255; }
        }
        const adj = rgba ? new Uint8ClampedArray(rgba) : null;
        if (kern && adj) kern(adj, { width: W, height: H, originX: 0, originY: 0, unitsPerPixel: 1 });
        const memoKey = t ? [new Uint32Array(MEMO), new Uint32Array(MEMO), new Uint32Array(MEMO)] : null, memoVal = t ? [new Float64Array(MEMO), new Float64Array(MEMO), new Float64Array(MEMO)] : null;
        if (memoKey) for (let c = 0; c < 3; c++) memoKey[c].fill(0xffffffff);
        for (let j = 0, i = 0; j < N; j++, i += S) {
          const k = op * (cov ? cov[j] : 1), m = scale[j];
          if (k <= 0) continue;
          if (t && m === 1 && memoKey && memoVal) {
            for (let c = 0; c < 3; c++) {
              const x = out[i + c];
              let nu: number;
              if (x === x) {
                f32[0] = x > 0 ? x : 0;
                const bits = u32[0], h = Math.imul(bits, 2654435761) >>> 16;
                if (memoKey[c][h] === bits) nu = memoVal[c][h];
                else { nu = srgbToLinear(Math.max(0, Math.min(1, t(c, linearToSrgb(Math.min(1, f32[0])) * 255) / 255))); memoKey[c][h] = bits; memoVal[c][h] = nu; }
              } else nu = srgbToLinear(Math.max(0, Math.min(1, t(c, linearToSrgb(Math.min(1, Math.max(0, x))) * 255) / 255)));
              out[i + c] += (nu - out[i + c]) * k;
            }
            continue;
          }
          for (let c = 0; c < 3; c++) {
            const u = Math.max(0, out[i + c] / m);
            const nu = t ? srgbToLinear(Math.max(0, Math.min(1, t(c, linearToSrgb(Math.min(1, u)) * 255) / 255))) : Math.max(0, u + srgbToLinear((adj as Uint8ClampedArray)[j * 4 + c] / 255) - srgbToLinear((rgba as Uint8ClampedArray)[j * 4 + c] / 255));
            out[i + c] += (nu * m - out[i + c]) * k;
          }
        }
        continue;
      }
      const gain = 2 ** (e.exposure ?? 0), off = e.offset ?? 0, inv = 1 / Math.max(0.01, e.gamma ?? 1);
      if (inv === 1) { for (let i = 0, j = 0; i < out.length; i += S, j++) { const k = op * (cov ? cov[j] : 1); if (k <= 0) continue; for (let c = 0; c < A; c++) { const v = out[i + c], nv = Math.max(0, v * gain + off); out[i + c] = v + (nv - v) * k; } } continue; }
      for (let i = 0, j = 0; i < out.length; i += S, j++) { const k = op * (cov ? cov[j] : 1); if (k <= 0) continue; for (let c = 0; c < A; c++) { const v = out[i + c], nv = Math.pow(Math.max(0, v * gain + off), inv); out[i + c] = v + (nv - v) * k; } }
      continue;
    }
    if (l.adjustment && paperWhite && l.adjustment.kind === 'channelMixer') {
      // The Channel Mixer on inks (1.57.9, CMYK): each output ink is the four inks mixed by its row, plus its constant.
      const v = paramValues('channelMixer', (l.adjustment.data as { params?: unknown }).params), keys = ['Cy', 'Ma', 'Ye', 'Bk'];
      const rows = ['cyan', 'magenta', 'yellow', 'black'].map((o) => [...keys.map((k) => Number(v[`${o}${k}`] ?? 0) / 100), Number(v[`${o}Co`] ?? 0) / 100]);
      const mixed = [0, 0, 0, 0];
      for (let i = 0, j = 0; i < out.length; i += S, j++) {
        const k = op * (cov ? cov[j] : 1);
        if (k <= 0) continue;
        for (let o = 0; o < 4; o++) { const r = rows[o]; mixed[o] = clamp01(r[0] * out[i] + r[1] * out[i + 1] + r[2] * out[i + 2] + r[3] * out[i + 3] + r[4]); }
        for (let o = 0; o < 4; o++) out[i + o] += (mixed[o] - out[i + o]) * k;
      }
      continue;
    }
    if (l.adjustment) {
      const inLab = doc.mode === 'lab', kind = l.adjustment.kind, viaRgb = ((kind === 'exposure' || kind === 'hdrToning') && (inLab || paperWhite)) || (kind === 'channelMixer' && inLab);
      const perChannel = !viaRgb && (!inLab || ['levels', 'curves', 'invert', 'posterize'].includes(l.adjustment.kind));
      const t = perChannel ? transferOf(l.adjustment) : null;
      if (!t) {
        const kern = kernelFor(l.adjustment);
        if (!kern || (n === 4 && !luts)) return { error: `${name} is an adjustment that needs the document's color tables, which load with the document.` };
        viaKernel(out, W, H, n, kern, op, cov, n === 4 ? luts : null, inLab);
        continue;
      }
      transferLut(out, S, A, op, cov, paperWhite, t);
      continue;
    }
    if (!l.raster) continue;
    const src = l.channels ?? deepFromRaster(l.raster);
    if (src.n !== n) return { error: `${name} has no ${paperWhite ? 'ink' : 'float pixels'}; Image > Mode converts it.` };
    tmp.fill(0); place(tmp, W, H, src, l.transform, 1, S);
    if (drawn) {
      const isLab = doc.mode === 'lab';
      withStyle(tmp, drawn, n, isLab ? (r, g, b) => encodeLab(...srgbToLab(r, g, b)) : n === 4 && luts ? (r, g, b) => inkOf({ r, g, b }, luts.in) : linear ? (r, g, b) => [srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255)] : (r, g, b) => [r / 255, g / 255, b / 255], l.fill ?? 1, linear);
    }
    const clip = l.clipId ? map.get(l.clipId) : null, clipA = clip ? alphaOf(clip) : null;
    if (l.clipId && !clipA) return { error: `${name} is clipped to a layer this compositor cannot read.` };
    const clash = blendInto(out, tmp, l.blend ?? 'normal', op, cov, clipA, false, name);
    if (clash) return clash;
  }
  const last = flush();
  if (last) return last;
  return null;
  };
  const failed = run(out, null, new Set<ID>());
  if (failed) return failed;
  return { width: W, height: H, data: out };
}
