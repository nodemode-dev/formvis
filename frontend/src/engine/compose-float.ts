import { dissolveNoise } from './blend';
import { deepFromRaster, place, transferOf } from './deep';
import { hierarchy, byId, ancestors } from './tree';
import { placement, setMat } from './geometry';
import type { BlendMode, Doc, Layer, ID } from './types';

/** Compositing in the mode (1.55.5, DEV_PLAN 22.5): the document composed on the one float model, for 16-bit, 32-bit
 *  and CMYK documents alike. Every separable blend mode runs per channel on the channel values (for CMYK on
 *  paper-white values, 1 minus ink, so Multiply darkens as Photoshop's CMYK does), with opacity and fill, the layer's
 *  own mask, its folders' masks, clipping to a base layer, and adjustment layers with a transfer (Levels, Curves,
 *  Invert, Posterize, Brightness/Contrast, Exposure) applied per channel under their masks. The non-separable modes
 *  (Hue, Saturation, Color, Luminosity, Darker and Lighter Color) run on RGB floats by the W3C formulas and wait for
 *  Lab in CMYK; layer styles wait for 22.7; both say so. Groups are pass-through, as the renderer treats them. */

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

/** A mask raster's coverage at document size, 0 to 1 (white shows), through its placement. */
function maskCoverage(mask: { raster: { canvas: CanvasImageSource; width: number; height: number }; placement: import('./types').Transform }, W: number, H: number): Float32Array {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  setMat(g, placement(mask.placement, mask.raster.width, mask.raster.height));
  g.drawImage(mask.raster.canvas, 0, 0);
  const d = g.getImageData(0, 0, W, H).data, out = new Float32Array(W * H);
  for (let i = 0, j = 0; j < out.length; i += 4, j++) out[j] = d[i] / 255;
  return out;
}

export interface FloatComposite { width: number; height: number; data: Float32Array }

export function composeFloat(doc: Doc, n: 3 | 4, paperWhite: boolean): FloatComposite | { error: string } {
  const W = doc.width, H = doc.height, S = n + 1, A = n, N = W * H, out = new Float32Array(N * S), tmp = new Float32Array(N * S);
  const layers = doc.layers.map((l) => (l.parentId === undefined ? { ...l, parentId: null } : l)), walked = { ...doc, layers };
  const map = byId(walked), covers = new Map<string, Float32Array>(), clipAlpha = new Map<ID, Float32Array>();
  const toValue = paperWhite ? (v: number): number => 1 - v : (v: number): number => v, fromValue = toValue;
  const coverageOf = (l: Layer): Float32Array | null => {
    const folders = ancestors(map, l).filter((g) => g.mask?.raster && g.mask.enabled);
    const own = l.mask?.raster && l.mask.enabled ? l : null;
    if (!own && !folders.length) return null;
    const cov = new Float32Array(N).fill(1);
    for (const m of [own, ...folders]) {
      if (!m?.mask?.raster) continue;
      const key = m.id;
      let c = covers.get(key);
      if (!c) { c = maskCoverage({ raster: m.mask.raster, placement: m.mask.placement ?? m.transform }, W, H); covers.set(key, c); }
      for (let i = 0; i < N; i++) cov[i] *= c[i];
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
  for (const { layer: l, visible } of hierarchy(walked)) {
    if (!visible || l.isGroup) continue;
    const name = `"${l.name}"`;
    if (l.effects) return { error: `${name} has a layer style, which this mode's compositor does not draw yet.` };
    const op = l.opacity * (l.fill ?? 1), cov = coverageOf(l);
    if (l.adjustment) {
      const t = transferOf(l.adjustment);
      if (!t) return { error: `${name} is an adjustment that waits for Lab in this mode.` };
      for (let i = 0, j = 0; i < out.length; i += S, j++) {
        const k = op * (cov ? cov[j] : 1);
        if (k <= 0) continue;
        for (let c = 0; c < A; c++) { const v = toValue(out[i + c]), nv = clamp01(t(c, v * 255) / 255); out[i + c] = fromValue(v + (nv - v) * k); }
      }
      continue;
    }
    if (!l.raster) continue;
    const src = l.channels ?? deepFromRaster(l.raster);
    if (src.n !== n) return { error: `${name} has no ${paperWhite ? 'ink' : 'float pixels'}; Image > Mode converts it.` };
    tmp.fill(0); place(tmp, W, H, src, l.transform, 1, S);
    const clip = l.clipId ? map.get(l.clipId) : null, clipA = clip ? alphaOf(clip) : null;
    if (l.clipId && !clipA) return { error: `${name} is clipped to a layer this compositor cannot read.` };
    const mode = l.blend ?? 'normal', sep = SEPARABLE_FLOAT[mode];
    if (!sep && mode !== 'dissolve' && (n !== 3 || !nonSeparable(mode, [0, 0, 0], [0, 0, 0]))) return { error: `${name} uses ${mode}, which waits for Lab in this mode.` };
    const bv: [number, number, number] = [0, 0, 0], sv: [number, number, number] = [0, 0, 0];
    for (let i = 0, j = 0; i < out.length; i += S, j++) {
      let as = tmp[i + A] * op * (cov ? cov[j] : 1) * (clipA ? clipA[j] : 1);
      if (as <= 0) continue;
      const ab = out[i + A];
      if (mode === 'dissolve') { if (dissolveNoise(j % W, Math.floor(j / W)) >= as) continue; as = 1; }
      const ao = as + ab * (1 - as), k1 = as * (1 - ab), k2 = as * ab, k3 = (1 - as) * ab;
      if (sep || mode === 'dissolve') {
        const f = sep ?? SEPARABLE_FLOAT.normal!;
        for (let c = 0; c < A; c++) { const b = toValue(out[i + c]), s = toValue(tmp[i + c]), r = f(b, s); out[i + c] = fromValue((k1 * s + k2 * r + k3 * b) / ao); }
      } else {
        for (let c = 0; c < 3; c++) { bv[c] = toValue(out[i + c]); sv[c] = toValue(tmp[i + c]); }
        const r = nonSeparable(mode, bv, sv) ?? sv;
        for (let c = 0; c < 3; c++) out[i + c] = fromValue((k1 * sv[c] + k2 * r[c] + k3 * bv[c]) / ao);
      }
      out[i + A] = ao;
    }
  }
  return { width: W, height: H, data: out };
}
