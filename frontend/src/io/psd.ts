import type { BlendMode as PsdBlend, Layer as PsdLayer, LayerEffectsInfo, LinkedFile, PatternInfo, Psd, UnitsValue, VectorContent } from 'ag-psd';
import {
  Raster, boundsOf, docTransform, effectsPresent, integral, liveText, newLayer, placement, applyMat, uid, type BlendMode, type Doc, type ID, type Layer, type Surface, invert, mul, toBlob, type Pt, defaultEffects, patternById, addPattern, projectPatterns, createSurface, ctxOf, type LayerEffects, renderText, textKey, TEXT_FONTS, type TextSpec, ADJUSTMENT_LABELS,
} from '../engine';
import { fromPsdAdjustment, toPsdAdjustment } from './psd-adjust';
import { artboardFromData, blendIfActive, type BlendIf, type DocSlice, type LayerComp } from '../engine/types';
import { windingArea } from '../engine/custom-shapes';
import { addIccResource, addPathResources, clippingPathName, readPathResources, resourceBlocks } from './psd-paths';
import { readExtraChannels, readIccProfile } from './psd-channels';
import { fromBase64 } from './icc-read';
import { buildXmp, metaFromXmp } from './xmp';
import { metaWritable } from '../engine/doc-meta';
import type { PathSet, SubPath } from '../engine/paths';
import { maskEdgeTone } from '../engine/distort';
import { groupIsolated } from '../engine/tree';
import { renderFill } from '../engine/fill-layers';
import type { FillContent } from '../engine/types';

/** Layered PSD files, read and written with ag-psd (MIT). Pixel layers keep their position, opacity, blend mode and
 *  visibility, folders become groups and back, layer masks and clipping carry across, and the flattened image goes in
 *  as the composite for readers that ignore layers. What PSD stores in forms formvis does not write yet, layer styles,
 *  adjustment layers and editable type, is reported in the notes. The library loads on first use, keeping it out of
 *  the start-up bundle. */

const TO_PSD: Record<BlendMode, PsdBlend> = {
  normal: 'normal', darken: 'darken', multiply: 'multiply', 'color-burn': 'color burn', lighten: 'lighten', screen: 'screen',
  'color-dodge': 'color dodge', 'linear-dodge': 'linear dodge', overlay: 'overlay', 'soft-light': 'soft light', 'hard-light': 'hard light',
  difference: 'difference', exclusion: 'exclusion', hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity',
  dissolve: 'dissolve', 'linear-burn': 'linear burn', 'darker-color': 'darker color', 'lighter-color': 'lighter color', 'vivid-light': 'vivid light',
  'linear-light': 'linear light', 'pin-light': 'pin light', 'hard-mix': 'hard mix', subtract: 'subtract', divide: 'divide',
};
const FROM_PSD = new Map<PsdBlend, BlendMode>(Object.entries(TO_PSD).map(([k, v]) => [v, k as BlendMode]));

export const isPsdFile = (f: File): boolean => /\.(ps[db]|psdt)$/i.test(f.name) || f.type === 'image/vnd.adobe.photoshop';

const canvas = (w: number, h: number): HTMLCanvasElement => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };

/** A PSD's layers as a formvis document, bottom to top as in the file, with notes on anything left out. */
/** A GUID, which the PSD format requires for a placed layer's id. */
function guid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const h = (n: number): string => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${h(8)}-${h(4)}-4${h(3)}-${'89ab'[Math.floor(Math.random() * 4)]}${h(3)}-${h(12)}`;
}

/** Where a smart object's source corners sit in the document (top left, top right, bottom right, bottom left): its
 *  warp, with any move since its last render carried in, or its placement when it has none. */
function smartCorners(l: Layer): Pt[] {
  const sm = l.smart as NonNullable<Layer['smart']>, r = l.raster as Raster;
  if (sm.warp) {
    if (!sm.warpAt || JSON.stringify(sm.warpAt) === JSON.stringify(l.transform)) return sm.warp;
    const move = mul(placement(l.transform, r.width, r.height), invert(placement(sm.warpAt, r.width, r.height)));
    return sm.warp.map((q) => applyMat(move, q.x, q.y));
  }
  const mx = (r.width - sm.source.width) / 2, my = (r.height - sm.source.height) / 2, m = placement(l.transform, r.width, r.height);
  return [[mx, my], [mx + sm.source.width, my], [mx + sm.source.width, my + sm.source.height], [mx, my + sm.source.height]].map(([x, y]) => applyMat(m, x, y));
}

/** A smart object's embedded contents as pixels: an image decoded directly, or a PSD by its composite. */
async function decodeLinked(data: Uint8Array, readPsd: typeof import('ag-psd').readPsd): Promise<Raster | null> {
  try {
    if (String.fromCharCode(data[0], data[1], data[2], data[3]) === '8BPS') {
      const inner = readPsd(data.slice().buffer, { skipLayerImageData: true, skipThumbnail: true });
      return inner.canvas ? Raster.from(inner.canvas, inner.canvas.width, inner.canvas.height) : null;
    }
    const bmp = await createImageBitmap(new Blob([data.slice()]));
    return Raster.from(bmp, bmp.width, bmp.height);
  } catch { return null; }
}

const BEVEL_TO: Record<LayerEffects['bevel']['style'], 'inner bevel' | 'outer bevel' | 'emboss' | 'pillow emboss' | 'stroke emboss'> = { inner: 'inner bevel', outer: 'outer bevel', emboss: 'emboss', pillow: 'pillow emboss', stroke: 'stroke emboss' };

/** A formvis layer style as PSD layer effects: each enabled effect in the format's own terms. A pattern used by
 *  Pattern Overlay travels in the PSD's patterns, under a GUID. */
function toPsdEffects(fx: LayerEffects, patterns: PatternInfo[]): LayerEffectsInfo | null {
  const px = (value: number): UnitsValue => ({ units: 'Pixels', value }), bm = (m: BlendMode): PsdBlend => TO_PSD[m] ?? 'normal', on = { enabled: true, present: true, showInDialog: true };
  const e: LayerEffectsInfo = fx.hidden ? { disabled: true } : {};
  const d = fx.dropShadow, is = fx.innerShadow, g = fx.outerGlow, ig = fx.innerGlow, k = fx.stroke, co = fx.colorOverlay, go = fx.gradientOverlay, sa = fx.satin, bv = fx.bevel, po = fx.patternOverlay;
  if (d.enabled) e.dropShadow = [{ ...on, color: d.color, opacity: d.opacity, blendMode: bm(d.blend), angle: d.angle, distance: px(d.distance), size: px(d.size), useGlobalLight: false }];
  if (is.enabled) e.innerShadow = [{ ...on, color: is.color, opacity: is.opacity, blendMode: bm(is.blend), angle: is.angle, distance: px(is.distance), size: px(is.size), useGlobalLight: false }];
  if (g.enabled) e.outerGlow = { ...on, color: g.color, opacity: g.opacity, blendMode: bm(g.blend), size: px(g.size) };
  if (ig.enabled) e.innerGlow = { ...on, color: ig.color, opacity: ig.opacity, blendMode: bm(ig.blend), size: px(ig.size), source: 'edge' };
  if (k.enabled) e.stroke = [{ ...on, position: 'outside', fillType: 'color', color: k.color, opacity: k.opacity, blendMode: 'normal', size: px(k.size) }];
  if (co.enabled) e.solidFill = [{ ...on, color: co.color, opacity: co.opacity, blendMode: bm(co.blend) }];
  if (go.enabled) e.gradientOverlay = [{ ...on, opacity: go.opacity, blendMode: bm(go.blend), type: go.style, angle: go.angle, scale: go.scale, reverse: go.reverse, align: true,
    gradient: { name: 'formvis', type: 'solid',   // every stop and its alpha when the overlay has them (36.8)
      colorStops: go.stops ? go.stops.map((s) => ({ color: s.color, location: s.at, midpoint: 0.5 })) : [{ color: go.from, location: 0, midpoint: 0.5 }, { color: go.to, location: 1, midpoint: 0.5 }],
      opacityStops: go.stops ? go.stops.map((s) => ({ opacity: s.alpha, location: s.at, midpoint: 0.5 })) : [{ opacity: 1, location: 0, midpoint: 0.5 }, { opacity: 1, location: 1, midpoint: 0.5 }] } }];
  if (sa.enabled) e.satin = { ...on, color: sa.color, opacity: sa.opacity, blendMode: bm(sa.blend), angle: sa.angle, distance: px(sa.distance), size: px(sa.size), invert: sa.invert };
  if (bv.enabled) e.bevel = { ...on, style: BEVEL_TO[bv.style], technique: bv.technique === 'chiselHard' ? 'chisel hard' : bv.technique === 'chiselSoft' ? 'chisel soft' : 'smooth', strength: bv.depth / 100, direction: bv.down ? 'down' : 'up', size: px(bv.size), soften: px(bv.soften), angle: bv.angle, altitude: bv.altitude, useGlobalLight: false,
    highlightColor: bv.highlight, highlightOpacity: bv.highlightOpacity, highlightBlendMode: bm(bv.highlightBlend), shadowColor: bv.shadow, shadowOpacity: bv.shadowOpacity, shadowBlendMode: bm(bv.shadowBlend) };
  const info = po.enabled ? psdPattern(po.pattern, patterns) : null;
  if (info) e.patternOverlay = { ...on, opacity: po.opacity, blendMode: bm(po.blend), scale: po.scale, pattern: { name: info.name, id: info.id }, align: true };
  return Object.keys(e).length ? e : null;
}

/** A formvis pattern in the PSD's patterns, added under a GUID the first time a layer uses it; null when undefined. */
function psdPattern(id: ID, patterns: PatternInfo[]): PatternInfo | null {
  const pat = patternById(id);
  if (!pat) return null;
  let info = patterns.find((x) => x.name === pat.name && (x as PatternInfo & { formvis?: string }).formvis === pat.id);
  if (!info) {
    const w = pat.surface.width, h = pat.surface.height, rgba = ctxOf(pat.surface).getImageData(0, 0, w, h).data;
    info = { name: pat.name, id: guid(), x: 0, y: 0, bounds: { x: 0, y: 0, w, h }, data: new Uint8Array(rgba) };
    (info as PatternInfo & { formvis?: string }).formvis = pat.id;
    patterns.push(info);
  }
  return info;
}

/** A fill layer's content in the PSD format's terms (1.66.0): a colour, a gradient with its colour and opacity stops,
 *  or a pattern in the PSD's patterns; what the file keeps that the reader does not (a pattern fill's scale and
 *  angle) is noted. */
function toPsdFill(c: FillContent, patterns: PatternInfo[], name: string, notes: string[]): VectorContent | null {
  if (c.kind === 'solid') return { type: 'color', color: { ...c.color } };
  if (c.kind === 'gradient') return { type: 'solid', name: 'formvis', colorStops: c.stops.map((s) => ({ color: { ...s.color }, location: s.at, midpoint: 0.5 })), opacityStops: c.stops.map((s) => ({ opacity: s.alpha, location: s.at, midpoint: 0.5 })),
    style: c.style, angle: c.angle, scale: c.scale, reverse: c.reverse, dither: c.dither, align: c.align, offset: { ...c.offset } };
  const info = psdPattern(c.pattern, patterns);
  if (!info) return null;
  if (c.scale !== 1 || c.angle !== 0) notes.push(`"${name}"'s pattern scale and angle are not written to the PSD; it draws the pattern at 100 percent, unturned.`);
  if (!c.link) notes.push(`"${name}"'s pattern goes linked with the layer, the format's default; the writer cannot mark it unlinked.`);
  return { type: 'pattern', name: info.name, id: info.id, phase: { ...c.phase } };
}

/** A PSD fill layer's content as a formvis fill (1.66.0): its pattern registered from the file's patterns; null,
 *  noted, for a noise gradient or a pattern the file does not include. */
function fromPsdFill(v: VectorContent, patterns: PatternInfo[] | undefined, name: string, notes: string[]): FillContent | null {
  const col = (c: unknown): { r: number; g: number; b: number } => {
    const o = (c ?? {}) as Record<string, number>;
    if (typeof o.fr === 'number') return { r: Math.round(o.fr * 255), g: Math.round(o.fg * 255), b: Math.round(o.fb * 255) };
    return { r: Math.round(o.r ?? 0), g: Math.round(o.g ?? 0), b: Math.round(o.b ?? 0) };
  };
  if (v.type === 'color') return { kind: 'solid', color: col(v.color) };
  if (v.type === 'solid') {
    const ops = [...(v.opacityStops ?? [])].sort((a, b) => a.location - b.location);
    const opacityAt = (t: number): number => {
      if (!ops.length) return 1;
      const i = ops.findIndex((o) => o.location >= t);
      if (i <= 0) return ops[i < 0 ? ops.length - 1 : 0].opacity;
      const a = ops[i - 1], b = ops[i];
      return a.opacity + (b.opacity - a.opacity) * ((t - a.location) / Math.max(1e-6, b.location - a.location));
    };
    const stops = (v.colorStops ?? []).map((s) => ({ at: Math.min(1, Math.max(0, s.location)), color: col(s.color), alpha: Math.min(1, Math.max(0, opacityAt(s.location))) }));
    if (stops.length < 2) return null;
    return { kind: 'gradient', stops, style: v.style ?? 'linear', angle: v.angle ?? 90, scale: Math.min(1.5, Math.max(0.1, v.scale ?? 1)), reverse: !!v.reverse, dither: !!v.dither, align: v.align !== false, offset: { x: v.offset?.x ?? 0, y: v.offset?.y ?? 0 } };
  }
  if (v.type === 'pattern') {
    const src = patterns?.find((x) => x.id === v.id);
    if (!src?.data || src.bounds.w <= 0 || src.bounds.h <= 0) { notes.push(`"${name}" fills with a pattern the file does not include; it opened as pixels.`); return null; }
    const w = src.bounds.w, h = src.bounds.h, surface = createSurface(w, h), img = new ImageData(w, h), id = `psd-${src.id}`;
    img.data.set(src.data.subarray(0, w * h * 4));
    ctxOf(surface).putImageData(img, 0, 0);
    if (!patternById(id)) { addPattern(src.name || 'Pattern', surface, id); projectPatterns.add(id); }
    return { kind: 'pattern', pattern: id, scale: 1, angle: 0, link: v.linked !== false, phase: { x: v.phase?.x ?? 0, y: v.phase?.y ?? 0 } };
  }
  notes.push(`"${name}" is a noise gradient fill, which formvis does not draw; it opened as pixels.`);
  return null;
}

/** PSD layer effects as a formvis layer style, noting what formvis does not have. */
/** Blending Options (1.54.5, M2) in the PSD format's terms. A range is [blackStart, blackEnd, whiteStart, whiteEnd]. The
 *  composite grey pair carries a Gray Blend If; one of the three channel pairs a Red, Green or Blue one. The format's
 *  'knko' is a single flag, so Shallow and Deep both write true and read back as Shallow. */
const IDENT: [number, number, number, number] = [0, 0, 255, 255];
function toPsdBlending(l: Layer): { blendingRanges?: NonNullable<PsdLayer['blendingRanges']>; knockout?: boolean } {
  const out: { blendingRanges?: NonNullable<PsdLayer['blendingRanges']>; knockout?: boolean } = {};
  if (l.knockout && l.knockout !== 'none') out.knockout = true;
  const b = l.blendIf;
  if (b && blendIfActive(b)) {
    const ch = { r: 0, g: 1, b: 2 }[b.channel as 'r' | 'g' | 'b'];
    out.blendingRanges = { compositeGrayBlendSource: b.channel === 'gray' ? [...b.thisLayer] : [...IDENT], compositeGraphBlendDestinationRange: b.channel === 'gray' ? [...b.underlying] : [...IDENT],
      ranges: [0, 1, 2, 3].map((i) => (i === ch ? { sourceRange: [...b.thisLayer], destRange: [...b.underlying] } : { sourceRange: [...IDENT], destRange: [...IDENT] })) };
  }
  return out;
}
function fromPsdBlending(pl: PsdLayer): { blendIf?: BlendIf; knockout?: 'shallow' } {
  const out: { blendIf?: BlendIf; knockout?: 'shallow' } = {};
  if (pl.knockout) out.knockout = 'shallow';
  const r = pl.blendingRanges;
  if (!r) return out;
  const four = (a: number[] | undefined): [number, number, number, number] => [a?.[0] ?? 0, a?.[1] ?? 0, a?.[2] ?? 255, a?.[3] ?? 255];
  const ident = (a: [number, number, number, number]): boolean => a.every((v, i) => v === IDENT[i]);
  const g = four(r.compositeGrayBlendSource), gd = four(r.compositeGraphBlendDestinationRange);
  if (!ident(g) || !ident(gd)) { out.blendIf = { channel: 'gray', thisLayer: g, underlying: gd }; return out; }
  for (const [i, ch] of (['r', 'g', 'b'] as const).entries()) {
    const s = four(r.ranges?.[i]?.sourceRange), d = four(r.ranges?.[i]?.destRange);
    if (!ident(s) || !ident(d)) { out.blendIf = { channel: ch, thisLayer: s, underlying: d }; return out; }
  }
  return out;
}

function fromPsdEffects(info: LayerEffectsInfo, patterns: PatternInfo[] | undefined, name: string, notes: string[]): LayerEffects | null {
  const fx = defaultEffects(), px = (u: UnitsValue | undefined, d: number): number => (u && typeof u.value === 'number' ? u.value : d);
  const col = (c: unknown, d: { r: number; g: number; b: number }): { r: number; g: number; b: number } => {
    const o = c as Record<string, number> | null | undefined;
    if (o && typeof o.r === 'number') return { r: Math.round(o.r), g: Math.round(o.g), b: Math.round(o.b) };
    if (o && typeof o.fr === 'number') return { r: Math.round(o.fr * 255), g: Math.round(o.fg * 255), b: Math.round(o.fb * 255) };
    return d;
  };
  const bm = (m: string | undefined, d: BlendMode): BlendMode => (m && FROM_PSD.get(m as PsdBlend)) || d, op = (v: number | undefined, d: number): number => (typeof v === 'number' ? Math.max(0, Math.min(1, v)) : d);
  const first = <T extends { enabled?: boolean }>(list: T[] | undefined, what: string): T | null => {
    if (!list?.length) return null;
    if (list.length > 1) notes.push(`"${name}" has more than one ${what}; formvis kept the first.`);
    return list[0];
  };
  const on = (x: { enabled?: boolean } | null | undefined): boolean => !!x && x.enabled !== false;
  const d = first(info.dropShadow, 'Drop Shadow');
  if (d) fx.dropShadow = { enabled: on(d), color: col(d.color, fx.dropShadow.color), opacity: op(d.opacity, fx.dropShadow.opacity), blend: bm(d.blendMode, 'multiply'), angle: d.angle ?? 120, distance: px(d.distance, 5), size: px(d.size, 5) };
  const is = first(info.innerShadow, 'Inner Shadow');
  if (is) fx.innerShadow = { enabled: on(is), color: col(is.color, fx.innerShadow.color), opacity: op(is.opacity, fx.innerShadow.opacity), blend: bm(is.blendMode, 'multiply'), angle: is.angle ?? 120, distance: px(is.distance, 5), size: px(is.size, 5) };
  const g = info.outerGlow;
  if (g) fx.outerGlow = { enabled: on(g), color: col(g.color, fx.outerGlow.color), opacity: op(g.opacity, fx.outerGlow.opacity), blend: bm(g.blendMode, 'screen'), size: px(g.size, 5) };
  const ig = info.innerGlow;
  if (ig) fx.innerGlow = { enabled: on(ig), color: col(ig.color, fx.innerGlow.color), opacity: op(ig.opacity, fx.innerGlow.opacity), blend: bm(ig.blendMode, 'screen'), size: px(ig.size, 5) };
  const k = first(info.stroke, 'Stroke');
  if (k) {
    fx.stroke = { enabled: on(k), color: col(k.color, fx.stroke.color), opacity: op(k.opacity, 1), size: px(k.size, 3) };
    if ((k.position && k.position !== 'outside') || (k.fillType && k.fillType !== 'color')) notes.push(`"${name}" has a stroke formvis draws as an outside colour stroke.`);
  }
  const co = first(info.solidFill, 'Color Overlay');
  if (co) fx.colorOverlay = { enabled: on(co), color: col(co.color, fx.colorOverlay.color), opacity: op(co.opacity, 1), blend: bm(co.blendMode, 'normal') };
  const go = first(info.gradientOverlay, 'Gradient Overlay');
  if (go) {
    const stops = go.gradient && 'colorStops' in go.gradient ? go.gradient.colorStops : [];
    fx.gradientOverlay = { enabled: on(go), from: col(stops[0]?.color, fx.gradientOverlay.from), to: col(stops[stops.length - 1]?.color, fx.gradientOverlay.to), opacity: op(go.opacity, 1), blend: bm(go.blendMode, 'normal'),
      angle: go.angle ?? 90, style: go.type === 'radial' ? 'radial' : 'linear', scale: Math.max(0.1, Math.min(1.5, go.scale ?? 1)), reverse: !!go.reverse };
    // Every colour stop, each with the alpha the opacity stops give at its place (36.8), kept when it is more than two opaque ends.
    const ops = go.gradient && 'opacityStops' in go.gradient ? [...go.gradient.opacityStops].sort((a, b) => a.location - b.location) : [];
    const alphaAt = (t: number): number => {
      if (!ops.length) return 1;
      if (t <= ops[0].location) return ops[0].opacity;
      for (let i = 1; i < ops.length; i++) if (t <= ops[i].location) { const a = ops[i - 1], b = ops[i], k = (t - a.location) / Math.max(1e-6, b.location - a.location); return a.opacity + (b.opacity - a.opacity) * k; }
      return ops[ops.length - 1].opacity;
    };
    const full = stops.map((s) => ({ at: s.location, color: col(s.color, fx.gradientOverlay.from), alpha: alphaAt(s.location) }));
    if (full.length > 2 || full.some((s) => s.alpha < 1)) fx.gradientOverlay.stops = full;
    if (go.type && go.type !== 'linear' && go.type !== 'radial') notes.push(`"${name}" has a gradient type formvis draws as linear or radial.`);
  }
  const sa = info.satin;
  if (sa) fx.satin = { enabled: on(sa), color: col(sa.color, fx.satin.color), opacity: op(sa.opacity, 0.5), blend: bm(sa.blendMode, 'multiply'), angle: sa.angle ?? 19, distance: px(sa.distance, 11), size: px(sa.size, 14), invert: sa.invert !== false };
  const bv = info.bevel;
  if (bv) {
    const style = bv.style === 'outer bevel' ? 'outer' : bv.style === 'emboss' ? 'emboss' : bv.style === 'pillow emboss' ? 'pillow' : bv.style === 'stroke emboss' ? 'stroke' : 'inner';
    fx.bevel = { enabled: on(bv), style, depth: Math.max(1, Math.min(1000, Math.round((bv.strength ?? 1) * 100))), down: bv.direction === 'down', size: px(bv.size, 5), soften: px(bv.soften, 0), angle: bv.angle ?? 120, altitude: bv.altitude ?? 30,
      highlight: col(bv.highlightColor, fx.bevel.highlight), highlightOpacity: op(bv.highlightOpacity, 0.75), highlightBlend: bm(bv.highlightBlendMode, 'screen'), shadow: col(bv.shadowColor, fx.bevel.shadow), shadowOpacity: op(bv.shadowOpacity, 0.75), shadowBlend: bm(bv.shadowBlendMode, 'multiply') };
    if (bv.technique === 'chisel hard' || bv.technique === 'chisel soft') fx.bevel.technique = bv.technique === 'chisel hard' ? 'chiselHard' : 'chiselSoft';
    if (bv.useShape || bv.useTexture) notes.push(`"${name}" has a bevel with a Contour or Texture whose settings the file's reader does not give; formvis draws the bevel without them.`);
  }
  const po = info.patternOverlay;
  if (po) {
    const src = patterns?.find((x) => x.id === po.pattern?.id);
    let id = 'builtin:checker';
    if (src && src.data && src.bounds.w > 0 && src.bounds.h > 0) {
      const w = src.bounds.w, h = src.bounds.h, surface = createSurface(w, h), img = new ImageData(w, h);
      img.data.set(src.data.subarray(0, w * h * 4));
      ctxOf(surface).putImageData(img, 0, 0);
      id = `psd-${src.id}`;
      if (!patternById(id)) { addPattern(src.name || 'Pattern', surface, id); projectPatterns.add(id); }
    } else notes.push(`"${name}" uses a pattern the file does not include; formvis shows Checker in its place.`);
    fx.patternOverlay = { enabled: on(po), pattern: id, opacity: op(po.opacity, 1), blend: bm(po.blendMode, 'normal'), scale: Math.max(0.1, Math.min(10, po.scale ?? 1)) };
  }
  if (info.disabled) fx.hidden = true;
  return effectsPresent(fx) ? fx : null;
}

/** PostScript names for formvis's type families in PSD files; bold and italic travel as the format's faux styles. */
const PS_FONT: Record<string, string> = { Inter: 'Inter-Regular', Arial: 'ArialMT', Helvetica: 'Helvetica', Georgia: 'Georgia', 'Times New Roman': 'TimesNewRomanPSMT', 'Courier New': 'CourierNewPSMT', Verdana: 'Verdana', 'Trebuchet MS': 'TrebuchetMS', Impact: 'Impact', serif: 'TimesNewRomanPSMT', 'sans-serif': 'ArialMT', monospace: 'CourierNewPSMT' };

/** The formvis family a PSD font name belongs to, by its PostScript name or its family part. */
/** A group's 'artb' artboard data (36.27): its rectangle in document pixels and its background, as a formvis artboard. */
export function fromPsdArtboard(pl: PsdLayer): { artboard: NonNullable<Layer['artboard']> } | Record<string, never> {
  const a = pl.artboard;
  if (!a?.rect) return {};
  const r = a.rect, c = a.color as unknown as { r?: number; g?: number; b?: number } | undefined, k = (v: unknown): number => Math.round(Math.min(255, Math.max(0, Number(v) || 0)));
  const bg = a.backgroundType === 3 ? null : a.backgroundType === 2 ? { r: 0, g: 0, b: 0 } : a.backgroundType === 4 && c && typeof c.r === 'number' ? { r: k(c.r), g: k(c.g), b: k(c.b) } : { r: 255, g: 255, b: 255 };
  const board = artboardFromData({ x: r.left, y: r.top, w: r.right - r.left, h: r.bottom - r.top, background: bg });
  return board ? { artboard: board } : {};
}

/** A top-level artboard folder as 'artb' data: Top, Left, Btom, Rght, and a white, black, transparent or custom background. */
export function toPsdArtboard(l: Layer): Pick<PsdLayer, 'artboard'> | Record<string, never> {
  const a = l.artboard;
  if (!a || l.parentId) return {};
  const bg = a.background, white = !!bg && bg.r === 255 && bg.g === 255 && bg.b === 255, black = !!bg && !bg.r && !bg.g && !bg.b;
  return { artboard: { rect: { top: a.y, left: a.x, bottom: a.y + a.h, right: a.x + a.w }, presetName: '', backgroundType: !bg ? 3 : white ? 1 : black ? 2 : 4, ...(bg ? { color: { r: bg.r, g: bg.g, b: bg.b } } : {}) } };
}

function familyOf(psName: string): { family: string; bold: boolean; italic: boolean } {
  const known = Object.entries(PS_FONT).find(([fam, ps]) => ps === psName && fam !== 'serif' && fam !== 'sans-serif' && fam !== 'monospace');
  const bare = psName.replace(/-(Bold|Italic|BoldItalic|Regular|Oblique|BoldOblique)?(MT|PSMT)?$/i, '').replace(/(PSMT|MT)$/, '');
  const guess = TEXT_FONTS.find((f) => f.replace(/\s+/g, '').toLowerCase() === bare.replace(/\s+/g, '').toLowerCase());
  return { family: known?.[0] ?? guess ?? psName, bold: /bold/i.test(psName), italic: /italic|oblique/i.test(psName) };
}

/** Where the sections of a PSD or PSB start, from its header; null when the header is not one or is cut short. */
function psdSections(buf: ArrayBuffer): { big: boolean; cmStart: number; resStart: number; resEnd: number; layerStart: number } | null {
  if (buf.byteLength < 38) return null;
  const v = new DataView(buf);
  if (v.getUint32(0) !== 0x38425053) return null;
  const big = v.getUint16(4) === 2, cmStart = 26, resStart = cmStart + 4 + v.getUint32(cmStart);
  if (resStart + 4 > buf.byteLength) return null;
  const resEnd = resStart + 4 + v.getUint32(resStart);
  return resEnd <= buf.byteLength ? { big, cmStart, resStart, resEnd, layerStart: resEnd } : null;
}

/** The print resolution in pixels per inch from image resource 1005, or null where the file states none. */
function psdResolution(buf: ArrayBuffer): number | null {
  const s = psdSections(buf);
  if (!s) return null;
  const v = new DataView(buf);
  for (let i = s.resStart + 4; i + 12 <= s.resEnd;) {
    const id = v.getUint16(i + 4), nameLen = v.getUint8(i + 6), at = i + 6 + ((1 + nameLen + 1) & ~1), size = v.getUint32(at);
    if (id === 1005 && size >= 16 && at + 8 <= s.resEnd) {
      const ppi = v.getInt32(at + 4) / 65536 * (v.getUint16(at + 8) === 2 ? 2.54 : 1);
      return ppi >= 1 && ppi <= 65535 ? Math.round(ppi * 100) / 100 : null;
    }
    i = at + 4 + ((size + 1) & ~1);
  }
  return null;
}

/** The file with zeros added where it ends before its layer section does, so the layers that are whole still read;
 *  null when the file is not short that way. */
function padToLayers(buf: ArrayBuffer): ArrayBuffer | null {
  const s = psdSections(buf);
  if (!s) return null;
  const lenSize = s.big ? 8 : 4;
  if (s.layerStart + lenSize > buf.byteLength) return null;
  const v = new DataView(buf), end = s.layerStart + lenSize + (s.big ? Number(v.getBigUint64(s.layerStart)) : v.getUint32(s.layerStart));
  if (end <= buf.byteLength || end - buf.byteLength > 256 * 1024 * 1024) return null;
  const out = new Uint8Array(end);
  out.set(new Uint8Array(buf));
  return out.buffer;
}

/** True where the merged image at the end of a PSD is plainly cut short (raw or run-length coded data). */
function mergedIsShort(buf: ArrayBuffer): boolean {
  const s = psdSections(buf);
  if (!s) return false;
  const lenSize = s.big ? 8 : 4, v = new DataView(buf);
  if (s.layerStart + lenSize > buf.byteLength) return false;
  const at = s.layerStart + lenSize + (s.big ? Number(v.getBigUint64(s.layerStart)) : v.getUint32(s.layerStart));
  if (at + 2 > buf.byteLength) return at >= buf.byteLength;
  const channels = v.getUint16(12), height = v.getUint32(14), width = v.getUint32(18), bytes = Math.max(1, v.getUint16(22) >> 3), mode = v.getUint16(at);
  if (mode === 0) return buf.byteLength - at - 2 < width * height * channels * bytes;
  if (mode !== 1) return false;
  const rows = channels * height, wide = s.big ? 4 : 2;
  if (at + 2 + rows * wide > buf.byteLength) return true;
  let total = 2 + rows * wide;
  for (let i = 0; i < rows; i++) total += s.big ? v.getUint32(at + 2 + i * 4) : v.getUint16(at + 2 + i * 2);
  return at + total > buf.byteLength;
}

/** A PSD whose layers could not be read, opened from what is left: the merged image at the end of the file, else the
 *  one `decode` (the engine's flat reading) returns. Throws when neither can be read. */
export async function readPsdFlat(file: File, decode?: (f: File) => Promise<Blob>): Promise<{ doc: Doc; notes: string[]; activeId: ID | null; paths: PathSet | null; report: PsdReport }> {
  const buffer = await file.arrayBuffer(), s = psdSections(buffer), resolution = psdResolution(buffer);
  let flat: { source: CanvasImageSource; width: number; height: number } | null = null;
  if (s) {
    try {
      // The same file with an empty layer section, so the merged image after it reads on its own.
      const v = new DataView(buffer), lenAt = s.layerStart, lenSize = s.big ? 8 : 4, layerLen = s.big ? Number(v.getBigUint64(lenAt)) : v.getUint32(lenAt);
      const tail = lenAt + lenSize + layerLen;
      if (tail < buffer.byteLength) {
        const head = new Uint8Array(buffer, 0, s.layerStart), rest = new Uint8Array(buffer, tail), out = new Uint8Array(head.length + lenSize * 2 + rest.length);
        out.set(head);
        new DataView(out.buffer).setUint32(head.length + lenSize - 4, lenSize);   // a layer section holding only a zero layer-info length
        out.set(rest, head.length + lenSize * 2);
        const { readPsd } = await import('ag-psd');
        const psd = readPsd(out.buffer, { skipThumbnail: true });
        if (psd.canvas) flat = { source: psd.canvas, width: psd.width, height: psd.height };
      }
    } catch { /* the merged image is damaged too */ }
  }
  if (!flat && decode) {
    try {
      const bmp = await createImageBitmap(await decode(file));
      flat = { source: bmp, width: bmp.width, height: bmp.height };
    } catch { /* the engine could not read it either */ }
  }
  if (!flat) throw new Error('This PSD is damaged: neither its layers nor its merged image could be read.');
  const c = canvas(flat.width, flat.height);
  (c.getContext('2d') as CanvasRenderingContext2D).drawImage(flat.source, 0, 0);
  const doc: Doc = { id: uid(), width: flat.width, height: flat.height, resolution: resolution ?? 72, layers: [] };
  const layer = newLayer('Background', doc, { raster: Raster.from(c, flat.width, flat.height) });
  const mode = s ? new DataView(buffer).getUint16(24) : -1, notes = [mode === 7 || mode === 8 ? `This is a ${mode === 7 ? 'Multichannel' : 'Duotone'} file, which formvis cannot read layer by layer; its layers could not be read, so it opened as one flattened RGB layer without its ink channels.` : 'This PSD is damaged: its layers could not be read, so it opened as one flattened layer.'];
  if (mergedIsShort(buffer)) notes.push('The merged image is cut short too, so part of it is blank.');
  return { doc: { ...doc, layers: [layer] }, notes, activeId: layer.id, paths: null, report: reportOf(1, [], notes) };
}

/** What opening a PSD did to it: how many layers came in, what was kept as is (`kept`), what was approximated and what
 *  was left out, each a sentence. `notes` on a read are the approximated and dropped ones together. */
export interface PsdReport { layers: number; kept: string[]; approximated: string[]; dropped: string[] }

const LEFT_OUT = /left out|left them out|could not be read|were left|is blank|are blank|cut short|did not open/i;
export function reportOf(layers: number, kept: string[], notes: readonly string[]): PsdReport {
  return { layers, kept, approximated: notes.filter((n) => !LEFT_OUT.test(n)), dropped: notes.filter((n) => LEFT_OUT.test(n)) };
}

/** The report as one readable block for the open sheet: counts first, then each item. */
export function reportText(r: PsdReport): string {
  const lines = [`${r.layers} layer${r.layers === 1 ? '' : 's'} read`, ...(r.kept.length ? [`Kept: ${r.kept.join(' ')}`] : []), ...(r.approximated.length ? [`Approximated (${r.approximated.length}): ${r.approximated.join(' ')}`] : []), ...(r.dropped.length ? [`Left out (${r.dropped.length}): ${r.dropped.join(' ')}`] : [])];
  return lines.join(' · ');
}

/** A layer's colour label from the file's layer colour. */
const labelOf = (pl: PsdLayer): { label?: Layer['label'] } => (pl.layerColor && pl.layerColor !== 'none' ? { label: pl.layerColor as Layer['label'] } : {});

/** A PSD pattern in the project's patterns under its own id; the id, or null when it holds no pixels. */
function registerPsdPattern(src: PatternInfo): string | null {
  if (!src.data || src.bounds.w <= 0 || src.bounds.h <= 0) return null;
  const id = `psd-${src.id}`;
  if (patternById(id)) return id;
  const w = src.bounds.w, h = src.bounds.h, surface = createSurface(w, h), img = new ImageData(w, h);
  img.data.set(src.data.subarray(0, w * h * 4));
  ctxOf(surface).putImageData(img, 0, 0);
  addPattern(src.name || 'Pattern', surface, id);
  projectPatterns.add(id);
  return id;
}

/** A layer's pixels cut to the canvas; null where it does not overlap it. */
function cropToCanvas(c: HTMLCanvasElement, left: number, top: number, W: number, H: number): { canvas: HTMLCanvasElement; left: number; top: number } | null {
  const x0 = Math.max(0, left), y0 = Math.max(0, top), x1 = Math.min(W, left + c.width), y1 = Math.min(H, top + c.height);
  if (x1 <= x0 || y1 <= y0) return null;
  const out = canvas(x1 - x0, y1 - y0);
  (out.getContext('2d') as CanvasRenderingContext2D).drawImage(c, x0 - left, y0 - top, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0);
  return { canvas: out, left: x0, top: y0 };
}

export async function readPsdFile(file: File): Promise<{ doc: Doc; notes: string[]; activeId: ID | null; paths: PathSet | null; report: PsdReport }> {
  const { readPsd } = await import('ag-psd');
  const buffer = await file.arrayBuffer();
  let psd: Psd, cut: 'merged' | 'layers' | null = null;
  try { psd = readPsd(buffer, { skipThumbnail: true }); if (mergedIsShort(buffer)) cut = 'merged'; } catch (err) {
    // A file cut short loses its merged image first, then its last layers; what is whole still reads.
    try { psd = readPsd(buffer, { skipThumbnail: true, skipCompositeImageData: true }); cut = 'merged'; } catch {
      const padded = padToLayers(buffer);
      if (!padded) throw err;
      try { psd = readPsd(padded, { skipThumbnail: true, skipCompositeImageData: true }); cut = 'layers'; } catch { throw err; }
    }
  }
  // Smart objects' embedded contents, decoded before the layers are built.
  const contents = new Map<string, Raster | null>();
  for (const lf of psd.linkedFiles ?? []) if (lf.data) contents.set(lf.id, await decodeLinked(lf.data, readPsd));
  const fileInfo = psd.imageResources?.xmpMetadata ? metaFromXmp(psd.imageResources.xmpMetadata) : null;   // File Info (29.2): the XMP image resource
  const parRead = psd.imageResources?.pixelAspectRatio?.aspect;   // Pixel Aspect Ratio (35.4 part b)
  const doc: Doc = { id: uid(), width: psd.width, height: psd.height, resolution: psdResolution(buffer) ?? 72, layers: [], ...(fileInfo ? { meta: fileInfo } : {}), ...(typeof parRead === 'number' && parRead > 0 && parRead !== 1 ? { pixelAspect: parRead } : {}) };
  const layers: Layer[] = [], notes: string[] = [], links = new Map<number, ID>(), psdIds = new Map<PsdLayer, ID>();
  if (cut === 'merged') notes.push('This PSD is cut short: its layers opened, but its merged image is incomplete.');
  if (cut === 'layers') notes.push('This PSD is cut short: the layers after the cut are blank and its merged image is missing.');
  const kept: string[] = [], blocks = resourceBlocks(buffer), colorMode = psd.colorMode as number | undefined, bits = psd.bitsPerChannel ?? 8;
  if (bits !== 8) notes.push(`This ${bits}-bit file opened at 8 bits per channel.`);
  if (colorMode === 1) { doc.mode = 'grayscale'; kept.push('Grayscale mode.'); }
  else if (colorMode === 0) { doc.mode = 'bitmap'; kept.push('Bitmap mode.'); }
  else if (colorMode === 2 && psd.palette?.length) { doc.mode = 'indexed'; doc.palette = psd.palette.map((c) => ({ r: c.r, g: c.g, b: c.b })); kept.push(`Indexed Color with ${psd.palette.length} colours.`); }
  else if (colorMode === 2) notes.push('This Indexed Color file has no colour table that formvis could read; it opened as RGB.');
  const icc = readIccProfile(buffer);
  if (icc) { doc.profile = icc; kept.push(`Colour profile ${icc.name}.`); }
  const gAngle = psd.imageResources?.globalAngle, gAlt = psd.imageResources?.globalAltitude;
  if (typeof gAngle === 'number' && (gAngle !== 120 || (typeof gAlt === 'number' && gAlt !== 30))) { doc.globalLight = { angle: gAngle, altitude: typeof gAlt === 'number' ? gAlt : 30 }; kept.push(`Global light ${gAngle} degrees.`); }
  if (psd.imageResources?.resolutionInfo) kept.push(`Resolution ${doc.resolution} ppi.`);
  const clipName = clippingPathName(blocks);
  if (clipName) notes.push(`The file's clipping path is the saved path "${clipName}"; formvis keeps the path but does not clip with it on export.`);
  let patternCount = 0;
  for (const pat of psd.patterns ?? []) if (registerPsdPattern(pat)) patternCount++;
  if (patternCount) kept.push(`${patternCount} pattern${patternCount === 1 ? '' : 's'} added to the project.`);
  const extra = readExtraChannels(buffer);
  if (extra.alphas.length) { doc.alphas = extra.alphas; kept.push(`${extra.alphas.length} alpha channel${extra.alphas.length === 1 ? '' : 's'}.`); }
  notes.push(...extra.notes);
  let croppedCount = 0;
  const linkOf =(pl: PsdLayer): { link?: ID } => {
    const g = pl.linkGroup;
    if (!g || pl.linkGroupEnabled === false) return {};
    if (!links.has(g)) links.set(g, uid());
    return { link: links.get(g) as ID };
  };
  const walk = (children: PsdLayer[] | undefined, parentId: ID | null): void => {
    let base: Layer | null = null;
    for (const pl of children ?? []) {
      const name = pl.name || 'Layer', blend = (pl.blendMode && FROM_PSD.get(pl.blendMode)) ?? 'normal';
      if (pl.children) {
        // A group's blend mode: Pass Through is formvis's folder with Normal and no isolation; any other mode, Normal
        // included, composites the group on its own.
        const through = !pl.blendMode || pl.blendMode === 'pass through', gblend = through ? 'normal' : FROM_PSD.get(pl.blendMode as PsdBlend) ?? 'normal';
        if (!through && !FROM_PSD.has(pl.blendMode as PsdBlend)) notes.push(`"${name}" uses ${pl.blendMode}, which formvis does not have; it opened as Normal.`);
        const group = newLayer(name, doc, { isGroup: true, parentId, visible: !pl.hidden, opacity: pl.opacity ?? 1, blend: gblend, ...(!through && gblend === 'normal' ? { isolate: true } : {}), ...linkOf(pl), ...labelOf(pl), ...(!parentId ? fromPsdArtboard(pl) : {}) });
        walk(pl.children, group.id);
        psdIds.set(pl, group.id);
        layers.push(group); // after its children, where formvis keeps a folder's entry
        base = null;
        continue;
      }
      if (pl.blendMode && !FROM_PSD.has(pl.blendMode) && pl.blendMode !== 'pass through') notes.push(`"${name}" uses ${pl.blendMode}, which formvis does not have; it opened as Normal.`);
      const adj = pl.adjustment ? fromPsdAdjustment(pl.adjustment) : null;
      if (pl.adjustment && !adj) { notes.push(`"${name}" is a ${pl.adjustment.type} adjustment, which formvis does not have; formvis left it out.`); continue; }
      // A PSD fill layer (a colour, a gradient or a pattern, with no shape's path) opens as formvis's (1.66.0).
      const fillSpec = !adj && pl.vectorFill && !pl.vectorMask?.paths?.length && !pl.vectorStroke ? fromPsdFill(pl.vectorFill, psd.patterns, name, notes) : null;
      if (!adj && !fillSpec && (!pl.canvas || !pl.canvas.width || !pl.canvas.height)) continue;
      const drawn = fillSpec && (!pl.canvas || !pl.canvas.width || !pl.canvas.height) ? renderFill(fillSpec, doc.width, doc.height, { x: 0, y: 0, w: doc.width, h: doc.height }) : null;
      if (fillSpec && !drawn && (!pl.canvas || !pl.canvas.width || !pl.canvas.height)) continue;
      // A plain pixel layer more than four canvases large is cut to the canvas; type, shapes and smart objects keep all their pixels.
      const cut = adj || drawn || !pl.canvas || pl.placedLayer || pl.text || pl.vectorMask || pl.vectorFill || pl.canvas.width * pl.canvas.height <= 4 * doc.width * doc.height ? null : cropToCanvas(pl.canvas, pl.left ?? 0, pl.top ?? 0, doc.width, doc.height);
      if (cut) croppedCount++;
      const src = cut?.canvas ?? pl.canvas, atX = cut ? cut.left : pl.left ?? 0, atY = cut ? cut.top : pl.top ?? 0;
      const w = drawn?.width ?? src?.width ?? 0, h = drawn?.height ?? src?.height ?? 0, raster = adj ? null : drawn ?? (src ? Raster.from(src, w, h) : null);
      // An adjustment layer opens as formvis's own, live, with its mask, opacity, blend and clipping.
      const pr = pl.protected, all = !!(pr?.transparency && pr?.composite && pr?.position);
      const lk = pr && (pr.transparency || pr.composite || pr.position) ? { locks: all ? { all: true } : { ...(pr.transparency ? { transparency: true } : {}), ...(pr.composite ? { pixels: true } : {}), ...(pr.position ? { position: true } : {}) } } : {};
      const fill = { ...(pl.fillOpacity !== undefined && pl.fillOpacity !== 1 ? { fill: Math.min(1, Math.max(0, pl.fillOpacity)) } : {}), ...lk, ...linkOf(pl) };
      // The reader stops one channel short of the file's restriction list, so which channels are restricted cannot be told; the layer is only reported.
      const advanced = labelOf(pl);
      if (pl.channelBlendingRestrictions) notes.push(`"${name}" restricts the channels it blends into, which formvis cannot read from the file; it opened with all channels.`);
      if (pl.blendInteriorElements) notes.push(`"${name}" blends interior effects as a group, which formvis does not do; it opened without it.`);
      if (pl.blendClippendElements === false) notes.push(`"${name}" does not blend clipped layers as a group, which formvis does not do; it opened with the default.`);
      if (pl.transparencyShapesLayer === false) notes.push(`"${name}" has Transparency Shapes Layer off, which formvis does not do; it opened with it on.`);
      const layer = adj ? newLayer(name, doc, { adjustment: adj, parentId, visible: !pl.hidden, opacity: pl.opacity ?? 1, blend, ...fill, ...advanced })
        : newLayer(name, doc, { raster, parentId, transform: { ...docTransform(w, h), x: drawn ? 0 : atX, y: drawn ? 0 : atY }, visible: !pl.hidden, opacity: pl.opacity ?? 1, blend, ...fill, ...advanced, ...(fillSpec ? { fillContent: fillSpec } : {}) });
      const mk = pl.mask;
      if (mk?.canvas && mk.canvas.width && mk.canvas.height) {
        // PSD masks are grey; formvis's are white with the level in alpha.
        const mw = mk.canvas.width, mh = mk.canvas.height, grey = mk.canvas.getContext('2d')?.getImageData(0, 0, mw, mh);
        if (grey) {
          const img = new ImageData(mw, mh);
          for (let i = 0; i < img.data.length; i += 4) { img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = grey.data[i]; }
          let mr = new Raster(mw, mh), rw = mw, rh = mh, mx = mk.left ?? 0, my = mk.top ?? 0;
          mr.write(img);
          const outside = mk.defaultColor === 255 ? 255 : 0;
          if (maskEdgeTone(mr) !== outside) {
            // The file's default colour shows past the mask's pixels; formvis shows the tone of the mask's edge, so a ring of it is added.
            const ring = new ImageData(mw + 2, mh + 2);
            for (let i = 0; i < ring.data.length; i += 4) { ring.data[i] = ring.data[i + 1] = ring.data[i + 2] = 255; ring.data[i + 3] = outside; }
            mr = new Raster(mw + 2, mh + 2);
            mr.ctx.putImageData(ring, 0, 0);
            mr.ctx.putImageData(img, 1, 1);
            mr.touch();
            rw = mw + 2; rh = mh + 2; mx -= 1; my -= 1;
          }
          const dens = typeof mk.userMaskDensity === 'number' && mk.userMaskDensity < 1 ? Math.round(mk.userMaskDensity * 100) : 0, feather = typeof mk.userMaskFeather === 'number' && mk.userMaskFeather > 0 ? mk.userMaskFeather : 0;
          layer.mask = { raster: mr, enabled: !mk.disabled, linked: true, placement: { ...docTransform(rw, rh), x: mx, y: my }, ...(dens ? { density: dens } : {}), ...(feather ? { feather } : {}) };
        }
      }
      const vm = pl.vectorMask, vf = pl.vectorFill, vs = pl.vectorStroke;
      if (vm?.paths?.length && (vf?.type === 'color' || vs?.strokeEnabled)) {
        // A PSD shape opens as a formvis shape layer: its pixels as saved, its outline editable again.
        const col = (c: unknown): { r: number; g: number; b: number } | null => {
          const o = c as Record<string, number> | null;
          if (!o) return null;
          if (typeof o.r === 'number') return { r: o.r, g: o.g, b: o.b };
          if (typeof o.fr === 'number') return { r: Math.round(o.fr * 255), g: Math.round(o.fg * 255), b: Math.round(o.fb * 255) };
          return null;
        };
        const path = fromPsdOutlines(vm.paths);
        const fill = vs?.fillEnabled === false || vf?.type !== 'color' ? null : col(vf.color);
        const sc = vs?.strokeEnabled && vs.content?.type === 'color' ? col(vs.content.color) : null;
        const stroke = sc ? { color: sc, width: vs?.lineWidth?.value ?? 1 } : null;
        if (path.subpaths.length && (fill || stroke)) layer.vector = { path, fill, stroke, origin: { x: pl.left ?? 0, y: pl.top ?? 0 } };
      } else if (vm?.paths?.length) {
        // A vector mask on a pixel layer (Layer > Vector Mask): kept as formvis's own, with its invert, link and disable flags.
        const path = fromPsdOutlines(vm.paths);
        if (path.subpaths.length) layer.vectorMask = { path, enabled: !vm.disable, linked: !vm.notLink, inverted: !!vm.invert };
      }
      const vmd = pl.realMask ?? pl.mask;
      if (vm?.paths?.length && vmd && ((typeof vmd.vectorMaskDensity === 'number' && vmd.vectorMaskDensity < 1) || (vmd.vectorMaskFeather ?? 0) > 0)) notes.push(`"${name}" has a vector mask density or feather, which formvis does not read; the mask opened sharp.`);
      const plc = pl.placedLayer;
      if (plc) {
        // A PSD smart object opens as a formvis one: its contents the source, its corners the warp, its pixels as
        // saved until it is next re-rendered.
        const source = contents.get(plc.id) ?? null, t8 = plc.nonAffineTransform ?? plc.transform;
        if (source && t8?.length === 8 && t8.every((v) => Number.isFinite(v))) {
          layer.smart = { source, filters: [], warp: [0, 2, 4, 6].map((k) => ({ x: t8[k], y: t8[k + 1] })), warpAt: layer.transform };
          if (plc.filter?.list?.length) notes.push(`"${name}" has smart filters (${plc.filter.list.map((f) => f.name || f.type).join(', ')}${plc.filter.enabled === false ? '; switched off in the file' : ''}); they stay applied in its pixels and are not editable here.`);        } else notes.push(`"${name}" is a smart object whose contents formvis cannot read; it opened as pixels.`);
      }
      const tx = pl.text;
      if (tx && typeof tx.text === 'string' && raster) {
        // PSD type opens as editable formvis type: the file's pixels until it is edited, then formvis's.
        const st = tx.style ?? {}, m = tx.transform ?? [1, 0, 0, 1, 0, 0], scale = Math.hypot(m[2] ?? 0, m[3] ?? 1) || 1, face = familyOf(st.font?.name ?? 'ArialMT');
        const col = st.fillColor as Record<string, number> | undefined, just = tx.paragraphStyle?.justification;
        const size = Math.max(1, Math.round((st.fontSize ?? 12) * scale * 100) / 100);
        const spec: TextSpec = { content: tx.text.replace(/\r/g, '\n'), family: face.family, size, color: col && typeof col.r === 'number' ? { r: Math.round(col.r), g: Math.round(col.g), b: Math.round(col.b) } : col && typeof col.fr === 'number' ? { r: Math.round(col.fr * 255), g: Math.round(col.fg * 255), b: Math.round(col.fb * 255) } : { r: 0, g: 0, b: 0 },
          align: just === 'center' || just === 'right' ? just : 'left', bold: !!st.fauxBold || face.bold, italic: !!st.fauxItalic || face.italic, lineHeight: st.autoLeading === false && st.leading ? Math.round((st.leading * scale / size) * 100) / 100 : 1.2,
          tracking: Math.round(Math.min(10000, Math.max(-1000, st.tracking ?? 0))), kerning: st.autoKerning === false ? 'none' : 'metrics' };
        layer.text = { ...spec, rendered: textKey(raster) };
        if ((tx.styleRuns?.length ?? 0) > 1) notes.push(`"${name}" mixes type styles; formvis keeps the first for the whole text.`);
        const warped = !!tx.warp?.style && tx.warp.style !== 'none';
        if (tx.shapeType === 'box' || warped) notes.push(`"${name}" is ${warped ? 'warped' : 'paragraph'} type in the PSD; formvis edits it as plain point type.`);
      }
      if (pl.effects) { const fx = fromPsdEffects(pl.effects, psd.patterns, name, notes); if (fx) layer.effects = fx; }
      Object.assign(layer, fromPsdBlending(pl));
      if (pl.clipping && base) layer.clipId = base.id;
      else base = layer;
      psdIds.set(pl, layer.id);
      layers.push(layer);
    }
  };
  walk(psd.children, null);
  // Layer Comps (33.3 part d): the document's list, then each layer's per-comp settings. Captured info bits are
  // 1 visibility, 2 position, 4 appearance; a position offset is relative to the layer's own position.
  const lc = psd.imageResources?.layerComps;
  if (lc?.list.length) {
    const compIds = new Map<number, ID>(), byComp = new Map<number, LayerComp>(), byLayer = new Map<ID, Layer>(layers.map((l) => [l.id, l]));
    const comps: LayerComp[] = lc.list.map((c) => {
      const id = uid(), comp: LayerComp = { id, name: c.name, comment: c.comment ?? '', useVisibility: (c.capturedInfo & 1) !== 0, usePosition: (c.capturedInfo & 2) !== 0, useAppearance: (c.capturedInfo & 4) !== 0, layers: {} };
      compIds.set(c.id, id); byComp.set(c.id, comp);
      return comp;
    });
    for (const [pl, lid] of psdIds) {
      const layer = byLayer.get(lid);
      for (const s of pl.comps?.settings ?? []) for (const cid of s.compList) {
        const comp = byComp.get(cid);
        if (!comp) continue;
        const entry = comp.layers[lid] ?? (comp.layers[lid] = {});
        if (comp.useVisibility) entry.visible = s.enabled !== false;
        if (comp.usePosition && s.offset && layer && !layer.isGroup) { entry.x = layer.transform.x + s.offset.x; entry.y = layer.transform.y + s.offset.y; }
      }
    }
    doc.comps = comps;
    doc.activeComp = lc.lastApplied !== undefined ? compIds.get(lc.lastApplied) ?? null : null;
  }
  // Slices (29.5 part d): user and layer slices come in; auto slices are skipped because formvis computes them. A layer slice maps back through the numeric id.
  const sliceGroups = psd.imageResources?.slices;
  if (sliceGroups?.length) {
    const byNumeric = new Map<number, ID>();
    for (const [pl, lid] of psdIds) if (pl.id !== undefined) byNumeric.set(pl.id, lid);
    const got: DocSlice[] = [];
    for (const g of sliceGroups) for (const s of g.slices) {
      if (s.origin === 'autoGenerated') continue;
      const w = s.bounds.right - s.bounds.left, h = s.bounds.bottom - s.bounds.top;
      if (w < 1 || h < 1) continue;
      const layer = s.origin === 'layer' ? byNumeric.get(s.associatedLayerId) : undefined;
      got.push({ id: uid(), name: s.name || `Slice ${got.length + 1}`, x: s.bounds.left, y: s.bounds.top, w, h, ...(layer ? { layer } : {}), ...(s.url ? { url: s.url } : {}), ...(s.altTag ? { alt: s.altTag } : {}) });
    }
    if (got.length) doc.slices = got;
  }
  // Guides and text notes (Import Notes): the file's guides in pixels, and each text note at its icon's corner.
  const guideList = (psd.imageResources?.gridAndGuidesInformation?.guides ?? []).filter((g) => Number.isFinite(g.location) && g.location >= 0);
  if (guideList.length) doc.guides = guideList.map((g) => ({ axis: g.direction === 'horizontal' ? 'y' as const : 'x' as const, at: Math.round(g.location * 2) / 2 }));
  const noteList = (psd.annotations ?? []).filter((a) => a.type === 'text' && typeof a.data === 'string' && a.data.trim());
  if (noteList.length) doc.notes = noteList.map((a) => ({ id: uid(), x: Math.max(0, Math.min(psd.width, a.iconLocation.left)), y: Math.max(0, Math.min(psd.height, a.iconLocation.top)), text: a.data as string }));
  if (psd.annotations && psd.annotations.length > noteList.length) notes.push('Sound notes in the PSD were left out.');
  if (!layers.length && psd.canvas) {
    layers.push(newLayer('Background', doc, { raster: Raster.from(psd.canvas, psd.width, psd.height) }));
    notes.push('This PSD has no layers; it opened as a single one.');
  }
  // The Paths panel: saved paths and the Work Path, which ag-psd leaves in the image resources.
  let paths: PathSet | null = null;
  try {
    const list = readPathResources(buffer, psd.width, psd.height);
    if (list.length) paths = { list, active: null };
  } catch { notes.push('The file\'s paths could not be read; the layers opened without them.'); }
  if (croppedCount) notes.push(`${croppedCount} layer${croppedCount === 1 ? ' was' : 's were'} more than four canvases large and cut to the canvas; the pixels outside it were left out.`);
  return { doc: { ...doc, layers }, notes, activeId: layers.at(-1)?.id ?? null, paths, report: reportOf(layers.filter((l) => !l.isGroup).length, kept, notes) };
}

/** A PSD vector mask's bezier paths as formvis outlines. A subtract outline cuts a hole, so it is wound against the
 *  combined ones, as the nonzero rule formvis fills by needs; the file's other operations are kept on the outline. */
function fromPsdOutlines(paths: NonNullable<PsdLayer['vectorMask']>['paths']): { subpaths: SubPath[] } {
  const path = { subpaths: paths.map((bp) => ({ closed: !bp.open, anchors: bp.knots.map((k) => ({ inX: k.points[0], inY: k.points[1], x: k.points[2], y: k.points[3], outX: k.points[4], outY: k.points[5] })) })).filter((sp) => sp.anchors.length) as SubPath[] };
  const ops = paths.filter((bp) => bp.knots.length).map((bp) => bp.operation ?? 'combine');
  const mainArea = path.subpaths.reduce((m, sp, i) => (ops[i] !== 'subtract' && sp.closed && Math.abs(windingArea(sp.anchors)) > Math.abs(m) ? windingArea(sp.anchors) : m), 0);
  path.subpaths.forEach((sp, i) => {
    if (ops[i] !== 'subtract' || !sp.closed || !mainArea || Math.sign(windingArea(sp.anchors)) !== Math.sign(mainArea)) return;
    sp.anchors = sp.anchors.slice().reverse().map((a) => ({ x: a.x, y: a.y, inX: a.outX, inY: a.outY, outX: a.inX, outY: a.inY }));
  });
  path.subpaths.forEach((sp, i) => { const op = ops[i]; if (op === 'subtract' || op === 'intersect' || op === 'exclude') sp.op = op; });
  return path;
}

/** A layer's outlines as PSD bezier paths moved by (dx, dy). formvis fills by the nonzero rule, so an outline wound
 *  against the largest one is a hole; the PSD says so with the subtract operation. */
function psdOutlines(subpaths: SubPath[], dx: number, dy: number): NonNullable<PsdLayer['vectorMask']>['paths'] {
  const live = subpaths.filter((sp) => sp.anchors.length), areas = live.map((sp) => (sp.closed ? windingArea(sp.anchors) : 0));
  const main = areas.reduce((m, a) => (Math.abs(a) > Math.abs(m) ? a : m), 0);
  return live.map((sp, i) => ({
    open: !sp.closed, operation: sp.op && sp.op !== 'combine' ? sp.op : sp.closed && main && Math.sign(areas[i]) === -Math.sign(main) ? 'subtract' as const : 'combine' as const, fillRule: 'non-zero' as const,
    knots: sp.anchors.map((a) => ({ linked: Math.abs((a.outX - a.x) * (a.inY - a.y) - (a.outY - a.y) * (a.inX - a.x)) < 1e-6 && (a.outX !== a.x || a.outY !== a.y), points: [a.inX + dx, a.inY + dy, a.x + dx, a.y + dy, a.outX + dx, a.outY + dy] })),
  }));
}

/** The document as a layered PSD, with notes on what it could not carry. */
export async function writePsdFile(doc: Doc, composite: Surface, psb = false, paths: PathSet | null = null, maximize = true): Promise<{ bytes: ArrayBuffer; notes: string[] }> {
  const { writePsd } = await import('ag-psd');
  const notes: string[] = [], linked: LinkedFile[] = [], sources = new Map<ID, Uint8Array>(), psdPatterns: PatternInfo[] = [];
  for (const l of doc.layers) if (l.smart) sources.set(l.id, new Uint8Array(await (await toBlob(l.smart.source.canvas)).arrayBuffer()));
  /** A raster drawn through `t` into a box aligned to the canvas; null when it covers nothing. */
  const placed = (r: Raster, t: Layer['transform']): { c: HTMLCanvasElement; x: number; y: number } | null => {
    const m = placement(t, r.width, r.height);
    const box = integral(boundsOf([applyMat(m, 0, 0), applyMat(m, r.width, 0), applyMat(m, r.width, r.height), applyMat(m, 0, r.height)]));
    if (box.w < 1 || box.h < 1) return null;
    const c = canvas(box.w, box.h), g = c.getContext('2d') as CanvasRenderingContext2D;
    g.imageSmoothingEnabled = t.sampling !== 'nearest';
    g.setTransform(m[0], m[1], m[2], m[3], m[4] - box.x, m[5] - box.y);
    g.drawImage(r.canvas as CanvasImageSource, 0, 0);
    return { c, x: box.x, y: box.y };
  };
  /** The layer's mask on `out`, as a grey PSD mask placed on the canvas. */
  const maskOnto = (l: Layer, out: PsdLayer): void => {
    const mk = l.mask;
    if (!mk?.raster) return;
    const mp = placed(mk.raster, mk.placement ?? l.transform);
    if (!mp) return;
    const g = mp.c.getContext('2d') as CanvasRenderingContext2D, img = g.getImageData(0, 0, mp.c.width, mp.c.height);
    for (let i = 0; i < img.data.length; i += 4) { const a = img.data[i + 3]; img.data[i] = img.data[i + 1] = img.data[i + 2] = a; img.data[i + 3] = 255; }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.putImageData(img, 0, 0);
    out.mask = { canvas: mp.c, left: mp.x, top: mp.y, defaultColor: maskEdgeTone(mk.raster), disabled: !mk.enabled };
  };
  const toPsd = (l: Layer): PsdLayer | null => {
    if (l.isGroup) return { name: l.name, hidden: !l.visible, opacity: l.opacity, blendMode: groupIsolated(l) ? TO_PSD[l.blend] ?? 'normal' : 'pass through', opened: true, children: build(l.id), ...toPsdArtboard(l) };
    if (l.adjustment) {
      // An adjustment layer goes as a PSD one, live, with its mask, opacity, blend and clipping.
      const adjustment = toPsdAdjustment(l.adjustment);
      if (!adjustment) { notes.push(`"${l.name}" is a ${ADJUSTMENT_LABELS[l.adjustment.kind]} adjustment, which the PSD format has no adjustment layer for; it is left out of the PSD.`); return null; }
      if (l.adjustment.kind === 'hsv' && (l.adjustment.data as { colorize?: unknown }).colorize === true) notes.push(`"${l.name}" uses Colorize, which the PSD's Hue/Saturation layer does not carry from formvis.`);
      const out: PsdLayer = { name: l.name, opacity: l.opacity, ...(l.fill !== undefined && l.fill !== 1 ? { fillOpacity: l.fill } : {}), ...(l.locks ? { protected: { transparency: !!(l.locks.all || l.locks.transparency), composite: !!(l.locks.all || l.locks.pixels), position: !!(l.locks.all || l.locks.position) } } : {}), hidden: !l.visible, blendMode: TO_PSD[l.blend] ?? 'normal', clipping: !!l.clipId, adjustment, ...toPsdBlending(l) };
      maskOnto(l, out);
      return out;
    }
    if (!l.raster) return null;
    const px = placed(l.raster, l.transform);
    if (!px) return null;


    const out: PsdLayer = { name: l.name, left: px.x, top: px.y, canvas: px.c, opacity: l.opacity, ...(l.fill !== undefined && l.fill !== 1 ? { fillOpacity: l.fill } : {}), ...(l.locks ? { protected: { transparency: !!(l.locks.all || l.locks.transparency), composite: !!(l.locks.all || l.locks.pixels), position: !!(l.locks.all || l.locks.position) } } : {}), hidden: !l.visible, blendMode: TO_PSD[l.blend] ?? 'normal', clipping: !!l.clipId, ...toPsdBlending(l) };
    if (effectsPresent(l.effects)) { const e = toPsdEffects(l.effects, psdPatterns); if (e) out.effects = e; }
    const bv = l.effects?.bevel;
    if (bv?.enabled && (bv.contour?.enabled || bv.texture?.enabled)) notes.push(`"${l.name}"'s Bevel & Emboss Contour and Texture are not written to the PSD; it draws the bevel without them.`);
    if (liveText(l) && l.text && l.raster) {
      // Live type goes as PSD point type: anchored where formvis anchors it, on the first line's baseline, the
      // layer's placement carried into the text transform so moved, scaled or rotated type lands the same.
      const t = l.text, r = renderText(t), pm = placement(l.transform, l.raster.width, l.raster.height);
      const ax = t.align === 'center' ? r.raster.width / 2 : t.align === 'right' ? r.raster.width - r.pad : r.pad, at = applyMat(pm, ax * (l.raster.width / r.raster.width), r.baseline * (l.raster.height / r.raster.height));
      const k = Math.hypot(pm[2], pm[3]) * (l.raster.height / r.raster.height) || 1;
      out.text = { text: t.content.replace(/\n/g, '\r'), transform: [pm[0] / k * (l.raster.width / r.raster.width), pm[1] / k * (l.raster.width / r.raster.width), pm[2] / k * (l.raster.height / r.raster.height), pm[3] / k * (l.raster.height / r.raster.height), at.x, at.y],
        style: { font: { name: PS_FONT[t.family] ?? t.family.replace(/\s+/g, '') }, fontSize: t.size * k, fauxBold: t.bold, fauxItalic: t.italic, fillColor: t.color, autoLeading: false, leading: t.size * t.lineHeight * k, tracking: t.tracking, autoKerning: t.kerning !== 'none' },   // tracking and kerning written (36.9), as the reader takes them
        // Justify is the format's justify-left (every line but a paragraph's last spread; that one left); a box is area text.
        antiAlias: t.antialias === 'windows' ? 'platform' : t.antialias === 'windows-lcd' ? 'platformLCD' : t.antialias ?? 'smooth', paragraphStyle: { justification: t.align === 'justify' ? 'justify-left' : t.align }, shapeType: t.box ? 'box' : 'point', ...(t.box ? { boxBounds: [0, 0, t.box.w * k, t.box.h * k] } : {}), ...(t.direction === 'vertical' ? { orientation: 'vertical' } : {}) };
    }
    const embed = l.smart ? sources.get(l.id) : undefined;
    if (l.smart && embed && l.raster) {
      // A smart object goes as a PSD placed layer: its source embedded as PNG, its corners where it sits.
      const id = guid(), corners = smartCorners(l).flatMap((q) => [q.x, q.y]);
      linked.push({ id, name: `${l.name || 'Smart Object'}.png`, type: 'png ', data: embed });
      out.placedLayer = { id, placed: id, type: 'raster', transform: corners, nonAffineTransform: corners, width: l.smart.source.width, height: l.smart.source.height };
      if (l.smart.filters.some((f) => f.enabled)) notes.push(`"${l.name}" keeps its smart filters applied in its pixels; in the PSD its smart object holds the original without them.`);
    }
    const v = l.vector, t = l.transform;
    if (v && l.raster) {
      // A shape layer goes as a PSD shape: its path as a vector mask, with its fill and stroke, beside its pixels.
      // Only a move keeps the path exact; after a scale, rotation or flip it goes as pixels.
      const moved = t.rotation === 0 && !t.flipX && !t.flipY && Math.abs(t.w - l.raster.width) < 1e-6 && Math.abs(t.h - l.raster.height) < 1e-6;
      if (moved) {
        const dx = t.x - v.origin.x, dy = t.y - v.origin.y, rgb = (c: { r: number; g: number; b: number }) => ({ r: c.r, g: c.g, b: c.b });
        // formvis fills by the nonzero rule, so an outline wound against the largest one is a hole; the PSD says so with
        // the subtract operation.
        out.vectorMask = { paths: psdOutlines(v.path.subpaths, dx, dy) };
        out.vectorFill = { type: 'color', color: rgb(v.fill ?? v.stroke?.color ?? { r: 0, g: 0, b: 0 }) };
        out.vectorStroke = { strokeEnabled: !!v.stroke, fillEnabled: !!v.fill, lineWidth: { units: 'Pixels', value: v.stroke?.width ?? 1 }, lineCapType: 'round', lineJoinType: 'round', lineAlignment: 'center', content: { type: 'color', color: rgb(v.stroke?.color ?? v.fill ?? { r: 0, g: 0, b: 0 }) } };
      } else notes.push(`"${l.name}" goes as pixels; after a scale, rotation or flip the PSD cannot keep it as a shape.`);
    }
    const vm = l.vectorMask;
    if (vm && !v && !l.fillContent) {
      // Layer > Vector Mask on a pixel, type or smart layer: the outlines as the PSD's vector mask beside the pixels.
      const paths = psdOutlines(vm.path.subpaths, 0, 0);
      if (paths.length) out.vectorMask = { paths, ...(vm.inverted ? { invert: true } : {}), ...(vm.linked ? {} : { notLink: true }), ...(vm.enabled ? {} : { disable: true }) };
      else notes.push(`"${l.name}"'s vector mask holds no outline, so it is left out of the PSD.`);
    } else if (vm && (v || l.fillContent)) notes.push(`"${l.name}" is a shape or fill layer, whose vector mask the PSD keeps as its own outline; the separate vector mask is left out.`);
    if (l.fillContent) {
      // A fill layer goes as a PSD one (1.66.0): its content beside its pixels, drawn again from it on reading.
      const vf = toPsdFill(l.fillContent, psdPatterns, l.name, notes);
      if (vf) out.vectorFill = vf;
    }
    maskOnto(l, out);
    return out;
  };
  const held = new Map<ID, number>(), linkNo = new Map<ID, number>();
  for (const l of doc.layers) if (l.link) held.set(l.link, (held.get(l.link) ?? 0) + 1);
  for (const [k, n] of held) if (n > 1) linkNo.set(k, linkNo.size + 1);
  const built = new Map<ID, PsdLayer>();
  const build = (parentId: ID | null): PsdLayer[] => doc.layers.filter((l) => l.parentId === parentId).map((l) => { const o = toPsd(l); if (o) built.set(l.id, o); if (o && l.link && linkNo.has(l.link)) o.linkGroup = linkNo.get(l.link); return o; }).filter((x): x is PsdLayer => x !== null);
  const flat = canvas(doc.width, doc.height);
  (flat.getContext('2d') as CanvasRenderingContext2D).drawImage(composite as CanvasImageSource, 0, 0);
  const psd: Psd = { width: doc.width, height: doc.height, children: build(null), ...(maximize ? { canvas: flat } : {}) };   // Maximize Compatibility: the flattened composite beside the layers, for readers that ignore layers
  const boards = doc.layers.filter((l) => l.isGroup && !l.parentId && l.artboard).length;
  if (boards) psd.artboards = { count: boards };   // 'artd', the document-wide artboard record a reader looks for beside each group's 'artb'
  const comps = doc.comps ?? [], sliceList = doc.slices ?? [];
  { let layerNo = 0; for (const o of built.values()) o.id = ++layerNo; }   // a numeric id on every layer, which comps and layer slices need and other readers expect
  if (sliceList.length) {   // Slices (29.5 part d): one group named after the document
    const resources = psd.imageResources ?? (psd.imageResources = {});
    resources.slices = [{
      groupName: doc.meta?.title || 'Untitled', bounds: { left: 0, top: 0, right: doc.width, bottom: doc.height },
      slices: sliceList.map((s, i) => {
        const lid = s.layer ? built.get(s.layer)?.id : undefined;
        return {
          id: i + 1, groupId: 0, origin: lid !== undefined ? 'layer' as const : 'userGenerated' as const, associatedLayerId: lid ?? 0, name: s.name, type: 'image' as const,
          bounds: { left: s.x, top: s.y, right: s.x + s.w, bottom: s.y + s.h }, url: s.url ?? '', target: '', message: '', altTag: s.alt ?? '', cellTextIsHTML: false, cellText: '',
          horizontalAlignment: 'default' as const, verticalAlignment: 'default' as const, backgroundColorType: 'none' as const, backgroundColor: { r: 0, g: 0, b: 0, a: 0 },
        };
      }),
    }];
  }
  if (comps.length) {
    const resources = psd.imageResources ?? (psd.imageResources = {});
    resources.layerComps = {
      list: comps.map((c, i) => ({ id: i + 1, name: c.name, comment: c.comment, capturedInfo: (c.useVisibility ? 1 : 0) | (c.usePosition ? 2 : 0) | (c.useAppearance ? 4 : 0) })),
      ...(doc.activeComp ? { lastApplied: comps.findIndex((c) => c.id === doc.activeComp) + 1 || undefined } : {}),
    };
    for (const [lid, o] of built) {
      const l = doc.layers.find((x) => x.id === lid);
      const settings: NonNullable<PsdLayer['comps']>['settings'] = [];
      comps.forEach((c, i) => {
        const e = c.layers[lid];
        if (!e) return;
        const pos = c.usePosition && l && e.x !== undefined && e.y !== undefined ? { offset: { x: e.x - l.transform.x, y: e.y - l.transform.y } } : {};
        settings.push({ enabled: c.useVisibility ? e.visible !== false : l?.visible ?? true, compList: [i + 1], ...pos });
      });
      if (settings.length) o.comps = { settings };
    }
    if (comps.some((c) => c.useAppearance)) notes.push('Layer comp appearance is not written to PSD.');
  }
  if (linked.length) psd.linkedFiles = linked;
  if (psdPatterns.length) psd.patterns = psdPatterns;
  if (metaWritable(doc.meta)) psd.imageResources = { ...(psd.imageResources ?? {}), xmpMetadata: buildXmp(doc.meta) };   // kept beside the layer comps   // File Info (29.2) as the XMP image resource
  if (doc.pixelAspect && doc.pixelAspect !== 1) psd.imageResources = { ...(psd.imageResources ?? {}), pixelAspectRatio: { aspect: doc.pixelAspect } };   // Pixel Aspect Ratio (35.4 part b)
  const ppi = doc.resolution && doc.resolution >= 1 && doc.resolution <= 65535 ? doc.resolution : 72;   // image resource 1005
  psd.imageResources = { ...(psd.imageResources ?? {}), resolutionInfo: { horizontalResolution: ppi, horizontalResolutionUnit: 'PPI', widthUnit: 'Inches', verticalResolution: ppi, verticalResolutionUnit: 'PPI', heightUnit: 'Inches' } };
  const guideList = (doc.guides ?? []).filter((g) => Number.isFinite(g.at) && g.at >= 0);
  if (guideList.length) psd.imageResources = { ...(psd.imageResources ?? {}), gridAndGuidesInformation: { guides: guideList.map((g) => ({ location: Math.round(g.at * 2) / 2, direction: g.axis === 'y' ? 'horizontal' as const : 'vertical' as const })) } };   // 1032, in pixels
  const noteList = (doc.notes ?? []).filter((n) => n.text.trim());
  if (noteList.length) psd.annotations = noteList.map((n) => ({ type: 'text' as const, open: false, iconLocation: { left: Math.round(n.x), top: Math.round(n.y), right: Math.round(n.x) + 18, bottom: Math.round(n.y) + 18 }, popupLocation: { left: Math.round(n.x) + 20, top: Math.round(n.y), right: Math.round(n.x) + 220, bottom: Math.round(n.y) + 120 }, color: { r: 255, g: 220, b: 0 }, author: '', name: '', date: '', data: n.text }));   // text notes (Anno)
  if (doc.globalLight) psd.imageResources = { ...(psd.imageResources ?? {}), globalAngle: Math.round(doc.globalLight.angle), globalAltitude: Math.round(doc.globalLight.altitude) };   // 1037 and 1049
  let icc: Uint8Array | null = null;
  try { icc = doc.profile ? fromBase64(doc.profile.icc) : null; } catch { notes.push('The document\'s colour profile could not be read, so the PSD carries none.'); }
  return { bytes: addIccResource(addPathResources(writePsd(psd, { generateThumbnail: maximize, psb }), paths, doc.width, doc.height), icc), notes };
}
