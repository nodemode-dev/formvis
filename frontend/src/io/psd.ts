import type { BlendMode as PsdBlend, EffectContour, Layer as PsdLayer, LayerEffectsInfo, LinkedFile, PatternInfo, Psd, TextStyle, TextStyleRun, UnitsValue, VectorContent } from 'ag-psd';
import {
  Raster, boundsOf, docTransform, effectsPresent, integral, liveText, newLayer, placement, applyMat, uid, type BlendMode, type Doc, type ID, type Layer, type SmartLink, type Surface, invert, mul, toBlob, type Pt, defaultEffects, patternById, addPattern, projectPatterns, createSurface, ctxOf, type LayerEffects, CONTOURS, contourCurve, customContourId, customContourPoints, instances, type ContourId, renderText, textKey, TEXT_FONTS, resolveFace, type TextSpec, ADJUSTMENT_LABELS, hsvFromData, type WarpStyle,
} from '../engine';
import { fromPsdAdjustment, keepPsdAdjustment, restorePsdAdjustment, toPsdAdjustment } from './psd-adjust';
import { fromPsdSmartFilters, toPsdFilter } from './psd-filters';
import type { NestedContents, SmartDeform, SmartOriginal } from '../engine/types';
import { evenSpacing } from '../engine/mesh-warp';
import { deformNow } from '../engine/smart-deform';
import { artboardFromData, blendIfActive, smartFiltersFrom, type BlendIf, type DocSlice, type LayerComp } from '../engine/types';
import { windingArea } from '../engine/custom-shapes';
import { addIccResource, addPathResources, addResourceBytes, block as resourceBlock, clippingPathName, readPathResources, resourceBlocks } from './psd-paths';
import { addExtraChannels, readExtraChannels, readIccProfile } from './psd-channels';
import { readPsdChannelMode, writeMultichannelPsd } from './psd-modes';
import { readChannelRestrictions } from './psd-blend';
import { readBevelDetails, type BevelDetail } from './psd-raw';
import { ADJUSTMENT_KEY, SMART_STACK_KEY, addLayerBlocks, adjustmentFromBlock, readLayerBlocks, type OwnBlock } from './psd-own';
import { vectorCoverage } from '../engine/vector-mask';
import { fromBase64, toBase64 } from './icc-read';
import { cameraFromTiff, exifBlockOf } from './exif';
import { cleanRuns, runsStyled, styleSegments } from '../engine/opentype';
import type { FeatureRun } from '../engine/types';
import { buildMergedXmp, metaFromXmp } from './xmp';
import { cleanMeta, MAX_XMP_RAW_CHARS, metaWritable } from '../engine/doc-meta';
import type { PathSet, SubPath } from '../engine/paths';
import type { SelectionMask } from '../engine/selection';
import { maskEdgeTone } from '../engine/distort';
import { groupIsolated } from '../engine/tree';
import { renderFill } from '../engine/fill-layers';
import { rasterFromDeep } from '../engine/deep';
import type { DeepPixels, ExtraBlend, FillContent, Guide, ShapeGradient, ShapePattern } from '../engine/types';

/** Layered PSD files, read and written with ag-psd (MIT). Pixel layers keep their position, opacity, blend mode and
 *  visibility, folders become groups and back, layer masks and clipping carry across, and the flattened image goes in
 *  as the composite for readers that ignore layers. What PSD stores in forms formvis does not write yet, layer styles,
 *  adjustment layers and editable type, is reported in the notes. The library loads on first use, keeping it out of
 *  the start-up bundle. */

const TO_PSD: Record<Exclude<BlendMode, ExtraBlend>, PsdBlend> & Partial<Record<ExtraBlend, PsdBlend>> = {
  normal: 'normal', darken: 'darken', multiply: 'multiply', 'color-burn': 'color burn', lighten: 'lighten', screen: 'screen',
  'color-dodge': 'color dodge', 'linear-dodge': 'linear dodge', overlay: 'overlay', 'soft-light': 'soft light', 'hard-light': 'hard light',
  difference: 'difference', exclusion: 'exclusion', hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity',
  dissolve: 'dissolve', 'linear-burn': 'linear burn', 'darker-color': 'darker color', 'lighter-color': 'lighter color', 'vivid-light': 'vivid light',
  'linear-light': 'linear light', 'pin-light': 'pin light', 'hard-mix': 'hard mix', subtract: 'subtract', divide: 'divide',
};
const FROM_PSD = new Map<PsdBlend, BlendMode>((Object.entries(TO_PSD) as Array<[BlendMode, PsdBlend]>).map(([k, v]) => [v, k]));

const WARP_STYLES = new Set<string>(['arc', 'arcLower', 'arcUpper', 'arch', 'bulge', 'shellLower', 'shellUpper', 'flag', 'wave', 'fish', 'rise', 'fisheye', 'inflate', 'squeeze', 'twist']);

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

/** What an embedded file is by its first bytes: its media type and the extension its name should end in. */
function sniffLinked(d: Uint8Array): { mime: string; ext: string } {
  const at = (s: string, i = 0): boolean => s.split('').every((c, k) => d[i + k] === c.charCodeAt(0));
  if (d[0] === 0x89 && at('PNG', 1)) return { mime: 'image/png', ext: '.png' };
  if (d[0] === 0xff && d[1] === 0xd8) return { mime: 'image/jpeg', ext: '.jpg' };
  if (at('GIF8')) return { mime: 'image/gif', ext: '.gif' };
  if (at('8BPS')) return { mime: 'image/vnd.adobe.photoshop', ext: '.psd' };
  if (at('RIFF') && at('WEBP', 8)) return { mime: 'image/webp', ext: '.webp' };
  if ((at('II') && d[2] === 42) || (at('MM') && d[3] === 42)) return { mime: 'image/tiff', ext: '.tif' };
  if (at('BM')) return { mime: 'image/bmp', ext: '.bmp' };
  return { mime: 'application/octet-stream', ext: '' };
}

const FILE_TYPE: Record<string, string> = { 'image/png': 'png ', 'image/jpeg': 'jpeg', 'image/gif': 'gif ', 'image/tiff': 'tiff', 'image/bmp': 'bmp ', 'image/webp': 'webp', 'image/vnd.adobe.photoshop': '8BPS' };

type Placed = NonNullable<PsdLayer['placedLayer']>;

/** The mesh of a placed layer's custom warp and its content's extent, or null when the warp is none or the mesh sits on its own grid. */
function warpMesh(plc: Placed, src: { width: number; height: number }): { gw: number; gh: number; nodes: Array<{ x: number; y: number }>; lw: number; lh: number } | null {
  const w = plc.warp, nodes = w?.customEnvelopeWarp?.meshPoints, gw = w?.uOrder ?? 0, gh = w?.vOrder ?? 0, b = w?.bounds;
  if (!w || w.style !== 'custom' || !nodes || gw < 2 || gh < 2 || nodes.length !== gw * gh) return null;
  const lw = b ? b.right.value - b.left.value : src.width, lh = b ? b.bottom.value - b.top.value : src.height;
  if (!(lw > 0) || !(lh > 0) || nodes.some((q) => !Number.isFinite(q.x) || !Number.isFinite(q.y))) return null;
  return nodes.every((q, i) => Math.abs(q.x - ((i % gw) / (gw - 1)) * lw) < 0.5 && Math.abs(q.y - (Math.floor(i / gw) / (gh - 1)) * lh) < 0.5) ? null : { gw, gh, nodes, lw, lh };
}

/** What kind of warp a placed layer carries, or null for none: a preset with nothing to bend, or a mesh on its own grid, is none. */
function warpKind(plc: Placed, src: { width: number; height: number }): string | null {
  const w = plc.warp;
  if (!w?.style || w.style === 'none') return null;
  if (w.style === 'custom') return warpMesh(plc, src) ? 'custom mesh' : null;
  return w.value || w.perspective || w.perspectiveOther ? w.style : null;
}

/** A custom warp mesh as a smart object's live Warp: its nodes, in the content's own pixels, carried by the placement into
 *  the document. Null unless the placement is a parallelogram and the nodes land over the layer's saved pixels (`box`). */
function meshDeform(plc: Placed, t8: number[], src: { width: number; height: number }, at: Layer['transform']): SmartDeform | null {
  const m = warpMesh(plc, src);
  if (!m) return null;
  const [x0, y0, x1, y1, x2, y2, x3, y3] = t8;
  if (Math.abs(x0 + x2 - x1 - x3) > 0.5 || Math.abs(y0 + y2 - y1 - y3) > 0.5) return null;
  const local = [(x1 - x0) / m.lw, (y1 - y0) / m.lw, (x3 - x0) / m.lh, (y3 - y0) / m.lh, x0, y0];
  const points = m.nodes.map((q): [number, number] => [local[0] * q.x + local[2] * q.y + local[4], local[1] * q.x + local[3] * q.y + local[5]]);
  const xs = points.map((q) => q[0]), ys = points.map((q) => q[1]), slack = Math.max(at.w, at.h) * 0.15 + 2;
  const x = Math.min(...xs), X = Math.max(...xs), y = Math.min(...ys), Y = Math.max(...ys);
  if (x < at.x - slack || X > at.x + at.w + slack || y < at.y - slack || Y > at.y + at.h + slack || X - x < at.w * 0.7 || Y - y < at.h * 0.7) return null;
  const base = [(x1 - x0) / src.width, (y1 - y0) / src.width, (x3 - x0) / src.height, (y3 - y0) / src.height, x0, y0] as const;
  return { kind: 'mesh', gw: m.gw, gh: m.gh, points, us: evenSpacing(m.gw), vs: evenSpacing(m.gh), base, pad: 0, at };
}

let nestedDepth = 0;
/** An embedded PSD read as the smart object's own layered contents; null for any other file. */
async function nestedOf(data: Uint8Array, name: string): Promise<NestedContents | null> {
  if (nestedDepth >= 3 || sniffLinked(data).ext !== '.psd') return null;
  nestedDepth++;
  try {
    const inner = await readPsdFile(new File([data.slice()], name || 'contents.psd'));
    return inner.doc.layers.length ? { width: inner.doc.width, height: inner.doc.height, resolution: inner.doc.resolution, layers: [...inner.doc.layers] } : null;
  } catch { return null; } finally { nestedDepth--; }
}

/** The file a smart object embeds in a PSD: the file it was placed from as it came, else its layered contents as a PSD of
 *  their own, else its source as a PNG. */
async function embedOf(l: Layer, notes: string[]): Promise<{ data: Uint8Array; name: string; type: string }> {
  const sm = l.smart as NonNullable<Layer['smart']>, base = l.name || 'Smart Object', kept = sm.original;
  if (kept) return { data: kept.data, name: kept.name, type: FILE_TYPE[kept.mime || sniffLinked(kept.data).mime] ?? '    ' };
  if (sm.nested?.layers.length) {
    const inner: Doc = { id: uid(), width: sm.nested.width, height: sm.nested.height, resolution: sm.nested.resolution ?? 72, layers: sm.nested.layers };
    const out = await writePsdFile(inner, sm.source.canvas);
    for (const n of out.notes) notes.push(`"${base}" contents: ${n}`);
    return { data: new Uint8Array(out.bytes), name: `${base}.psd`, type: '8BPS' };
  }
  return { data: new Uint8Array(await (await toBlob(sm.source.canvas)).arrayBuffer()), name: `${base}.png`, type: 'png ' };
}

const BEVEL_TO: Record<LayerEffects['bevel']['style'], 'inner bevel' | 'outer bevel' | 'emboss' | 'pillow emboss' | 'stroke emboss'> = { inner: 'inner bevel', outer: 'outer bevel', emboss: 'emboss', pillow: 'pillow emboss', stroke: 'stroke emboss' };

/** A formvis layer style as PSD layer effects: each enabled effect in the format's own terms. A pattern used by
 *  Pattern Overlay travels in the PSD's patterns, under a GUID. */
function toPsdEffects(fx: LayerEffects, patterns: PatternInfo[]): LayerEffectsInfo | null {
  const px = (value: number): UnitsValue => ({ units: 'Pixels', value }), bm = (m: BlendMode): PsdBlend => TO_PSD[m] ?? 'normal', on = { enabled: true, present: true, showInDialog: true };
  const e: LayerEffectsInfo = fx.hidden ? { disabled: true } : {};
  const d = fx.dropShadow, is = fx.innerShadow, g = fx.outerGlow, ig = fx.innerGlow, k = fx.stroke, co = fx.colorOverlay, go = fx.gradientOverlay, sa = fx.satin, bv = fx.bevel, po = fx.patternOverlay;
  const cn = (id: ContourId | undefined): { contour?: EffectContour } => { const c = toPsdContour(id); return c ? { contour: c } : {}; };
  const pct = (v: number | undefined): { choke?: UnitsValue } => (v ? { choke: px(Math.max(0, Math.min(100, v))) } : {});
  const shadowOf = (s: typeof d | typeof is, spread: number | undefined) => ({ ...on, color: s.color, opacity: s.opacity, blendMode: bm(s.blend), angle: s.angle, distance: px(s.distance), size: px(s.size), useGlobalLight: s.useGlobal === true, ...(s.antiAlias ? { antialiased: true } : {}), ...pct(spread), ...cn(s.contour) });
  const strokeOf = (s: typeof k) => ({ ...on, position: s.position ?? 'outside', opacity: s.opacity, blendMode: 'normal', size: px(s.size), color: s.color,
    ...(s.gradient ? { fillType: 'gradient', gradient: { name: 'formvis', type: 'solid', colorStops: [{ color: s.gradient.from, location: 0, midpoint: 0.5 }, { color: s.gradient.to, location: 1, midpoint: 0.5 }], opacityStops: [{ opacity: 1, location: 0, midpoint: 0.5 }, { opacity: 1, location: 1, midpoint: 0.5 }], style: s.gradient.style, angle: s.gradient.angle, reverse: s.gradient.reverse, scale: 1, align: true } } : { fillType: 'color', color: s.color }) });
  const gradientOf = (go: typeof fx.gradientOverlay) => ({ ...on, opacity: go.opacity, blendMode: bm(go.blend), type: go.style, angle: go.angle, scale: go.scale, reverse: go.reverse, align: true, ...(go.dither ? { dither: true } : {}), ...(go.method ? { interpolationMethod: go.method } : {}),
    gradient: { name: 'formvis', type: 'solid',   // every stop and its alpha when the overlay has them (36.8)
      colorStops: go.stops ? go.stops.map((s) => ({ color: s.color, location: s.at, midpoint: 0.5 })) : [{ color: go.from, location: 0, midpoint: 0.5 }, { color: go.to, location: 1, midpoint: 0.5 }],
      opacityStops: go.stops ? go.stops.map((s) => ({ opacity: s.alpha, location: s.at, midpoint: 0.5 })) : [{ opacity: 1, location: 0, midpoint: 0.5 }, { opacity: 1, location: 1, midpoint: 0.5 }] } });
  // Each effect the format can repeat goes once per enabled instance, the main one first, then the extras.
  const ds = instances(fx, 'dropShadow').filter((x) => x.enabled), ins = instances(fx, 'innerShadow').filter((x) => x.enabled), sk = instances(fx, 'stroke').filter((x) => x.enabled), cos = instances(fx, 'colorOverlay').filter((x) => x.enabled), gos = instances(fx, 'gradientOverlay').filter((x) => x.enabled);
  if (ds.length) e.dropShadow = ds.map((x) => shadowOf(x, x.spread)) as LayerEffectsInfo['dropShadow'];
  if (ins.length) e.innerShadow = ins.map((x) => shadowOf(x, x.choke)) as LayerEffectsInfo['innerShadow'];
  if (g.enabled) e.outerGlow = { ...on, color: g.color, opacity: g.opacity, blendMode: bm(g.blend), size: px(g.size), ...pct(g.spread), ...(g.noise ? { noise: g.noise / 100 } : {}), ...(g.range ? { range: g.range / 100 } : {}), ...(g.antiAlias ? { antialiased: true } : {}), ...cn(g.contour) };
  if (ig.enabled) e.innerGlow = { ...on, color: ig.color, opacity: ig.opacity, blendMode: bm(ig.blend), size: px(ig.size), source: ig.source === 'center' ? 'center' : 'edge', technique: ig.technique === 'precise' ? 'precise' : 'softer', ...pct(ig.choke), ...(ig.noise ? { noise: ig.noise / 100 } : {}), ...(ig.antiAlias ? { antialiased: true } : {}), ...cn(ig.contour) };
  if (sk.length) e.stroke = sk.map(strokeOf) as LayerEffectsInfo['stroke'];
  if (cos.length) e.solidFill = cos.map((x) => ({ ...on, color: x.color, opacity: x.opacity, blendMode: bm(x.blend) }));
  if (gos.length) e.gradientOverlay = gos.map(gradientOf) as LayerEffectsInfo['gradientOverlay'];
  if (sa.enabled) e.satin = { ...on, color: sa.color, opacity: sa.opacity, blendMode: bm(sa.blend), angle: sa.angle, distance: px(sa.distance), size: px(sa.size), invert: sa.invert, ...(sa.antiAlias ? { antialiased: true } : {}), ...cn(sa.contour) };
  if (bv.enabled) e.bevel = { ...on, style: BEVEL_TO[bv.style], technique: bv.technique === 'chiselHard' ? 'chisel hard' : bv.technique === 'chiselSoft' ? 'chisel soft' : 'smooth', strength: bv.depth / 100, direction: bv.down ? 'down' : 'up', size: px(bv.size), soften: px(bv.soften), angle: bv.angle, altitude: bv.altitude, useGlobalLight: bv.useGlobal === true,
    highlightColor: bv.highlight, highlightOpacity: bv.highlightOpacity, highlightBlendMode: bm(bv.highlightBlend), shadowColor: bv.shadow, shadowOpacity: bv.shadowOpacity, shadowBlendMode: bm(bv.shadowBlend), ...cn(bv.gloss), ...(bv.antiAlias ? { antialiasGloss: true } : {}),
    // The Texture sub-panel (pattern, scale, link) and a Linear edge Contour with its range go in the effect's own keys; the writer has none for the texture's depth and invert or a curved edge contour.
    ...(bv.texture?.enabled && psdPattern(bv.texture.pattern, patterns) ? (() => { const t = bv.texture as NonNullable<typeof bv.texture>, info = psdPattern(t.pattern, patterns) as PatternInfo; return { useTexture: true, pattern: { name: info.name, id: info.id }, scale: t.scale, align: t.link !== false }; })() : {}),
    ...(bv.contour?.enabled && bv.contour.id === 'linear' ? { useShape: true, range: Math.min(1, Math.max(0.01, bv.contour.range)) } : {}) } as LayerEffectsInfo['bevel'];
  const info = po.enabled ? psdPattern(po.pattern, patterns) : null;
  if (info) e.patternOverlay = { ...on, opacity: po.opacity, blendMode: bm(po.blend), scale: po.scale, pattern: { name: info.name, id: info.id }, align: po.link !== false, ...(po.phaseX || po.phaseY ? { phase: { x: po.phaseX ?? 0, y: po.phaseY ?? 0 } } : {}) };
  return Object.keys(e).length ? e : null;
}

/** A contour as the PSD's curve (33 samples, or a custom contour's own points, on a 0 to 255 scale); null for Linear. */
function toPsdContour(id: ContourId | undefined): EffectContour | null {
  if (!id || id === 'linear') return null;
  const f = contourCurve(id), pts = customContourPoints(id);
  if (!f) return null;
  const at = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 255);
  return { name: CONTOURS.find((c) => c.id === id)?.label ?? 'Custom', curve: pts ? pts.map((p) => ({ x: at(p.x), y: at(p.y) })) : Array.from({ length: 33 }, (_, i) => ({ x: at(i / 32), y: at(f(i / 32)) })) };
}

/** A PSD contour curve as a contour id: a preset it matches to within 3 percent, a custom contour otherwise, undefined for Linear. */
function fromPsdContour(c: EffectContour | undefined): ContourId | undefined {
  const pts = (c?.curve ?? []).map((p) => ({ x: p.x / 255, y: p.y / 255 })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).sort((a, b) => a.x - b.x);
  if (pts.length < 2) return undefined;
  const at = (t: number): number => {
    if (t <= pts[0].x) return pts[0].y;
    for (let i = 1; i < pts.length; i++) if (t <= pts[i].x) { const a = pts[i - 1], b = pts[i]; return a.y + (b.y - a.y) * (t - a.x) / Math.max(1e-6, b.x - a.x); }
    return pts[pts.length - 1].y;
  };
  const fits = (f: (t: number) => number): boolean => { for (let i = 0; i <= 32; i++) if (Math.abs(f(i / 32) - at(i / 32)) > 0.03) return false; return true; };
  if (fits((t) => t)) return undefined;
  const preset = CONTOURS.find((x) => x.id !== 'linear' && fits(x.f));
  if (preset) return preset.id;
  const keep = pts.length > 32 ? Array.from({ length: 32 }, (_, i) => pts[Math.round(i * (pts.length - 1) / 31)]) : pts;
  return customContourId(keep);
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
  const square = Math.abs(c.angle % 90) < 1e-6, quarter = square ? (((Math.round(c.angle / 90) % 4) + 4) % 4) : 0;
  const scaled = c.scale > 0 && (c.scale !== 1 || quarter !== 0);
  const info = scaled ? scaledPsdPattern(c.pattern, c.scale, patterns, quarter) : psdPattern(c.pattern, patterns);
  if (!info) return null;
  if (!square) notes.push(`"${name}"'s pattern angle of ${Math.round(c.angle * 100) / 100} degrees is not written to the PSD (the library that writes it has no angle field for a pattern fill, and only quarter turns can be turned into the tile); it draws the pattern unturned.`);
  else if (c.scale !== 1 && !scaled) notes.push(`"${name}"'s pattern scale is not written to the PSD; it draws the pattern at 100 percent.`);
  if (!c.link) notes.push(`"${name}"'s pattern goes linked with the layer, the format's default; the library's writer rejects the unlink flag (its Lnkd field is typed as an integer, so a boolean cannot be written).`);
  return { type: 'pattern', name: info.name, id: info.id, phase: { ...c.phase } };
}

/** A pattern tile resampled by `scale` (0.01 to 16) and added under a GUID, so a fill drawn at that scale reads back
 *  at 100 percent the same size: the file's pattern fill has no scale of its own in the writer. */
function scaledPsdPattern(id: ID, scale: number, patterns: PatternInfo[], quarter = 0): PatternInfo | null {
  const pat = patternById(id), k = Math.min(16, Math.max(0.01, scale));
  if (!pat) return null;
  const tag = `${pat.id}@${k}${quarter ? `r${quarter}` : ''}`;
  let info = patterns.find((x) => (x as PatternInfo & { formvis?: string }).formvis === tag);
  if (!info) {
    const sw = Math.max(1, Math.round(pat.surface.width * k)), sh = Math.max(1, Math.round(pat.surface.height * k)), w = quarter % 2 ? sh : sw, h = quarter % 2 ? sw : sh, c = canvas(w, h), g = c.getContext('2d') as CanvasRenderingContext2D;
    g.imageSmoothingEnabled = k < 1;
    g.translate(w / 2, h / 2);
    g.rotate(-quarter * Math.PI / 2);   // the fill turns counter-clockwise by its angle
    g.drawImage(pat.surface as CanvasImageSource, -sw / 2, -sh / 2, sw, sh);
    info = { name: `${pat.name} ${Math.round(k * 100)}%${quarter ? ` ${quarter * 90} deg` : ''}`, id: guid(), x: 0, y: 0, bounds: { x: 0, y: 0, w, h }, data: new Uint8Array(g.getImageData(0, 0, w, h).data) };
    (info as PatternInfo & { formvis?: string }).formvis = tag;
    patterns.push(info);
  }
  return info;
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

function fromPsdEffects(info: LayerEffectsInfo, patterns: PatternInfo[] | undefined, name: string, notes: string[], all = false, detail?: BevelDetail): LayerEffects | null {
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
    if (list.length > 10) notes.push(`"${name}" has more than ten ${what} instances; formvis kept ten.`);
    return list[0];
  };
  const on = (x: { enabled?: boolean } | null | undefined): boolean => !!x && x.enabled !== false;
  const ct = (c: EffectContour | undefined): { contour?: ContourId } => { const id = fromPsdContour(c); return id ? { contour: id } : {}; };
  const d = first(info.dropShadow, 'Drop Shadow');
  if (d) fx.dropShadow = { enabled: on(d), color: col(d.color, fx.dropShadow.color), opacity: op(d.opacity, fx.dropShadow.opacity), blend: bm(d.blendMode, 'multiply'), angle: d.angle ?? 120, distance: px(d.distance, 5), size: px(d.size, 5), ...(d.useGlobalLight ? { useGlobal: true } : {}), ...(d.antialiased ? { antiAlias: true } : {}), ...(px(d.choke, 0) > 0 ? { spread: Math.min(100, px(d.choke, 0)) } : {}), ...ct(d.contour) };
  const is = first(info.innerShadow, 'Inner Shadow');
  if (is) fx.innerShadow = { enabled: on(is), color: col(is.color, fx.innerShadow.color), opacity: op(is.opacity, fx.innerShadow.opacity), blend: bm(is.blendMode, 'multiply'), angle: is.angle ?? 120, distance: px(is.distance, 5), size: px(is.size, 5), ...(is.useGlobalLight ? { useGlobal: true } : {}), ...(is.antialiased ? { antiAlias: true } : {}), ...(px(is.choke, 0) > 0 ? { choke: Math.min(100, px(is.choke, 0)) } : {}), ...ct(is.contour) };
  const g = info.outerGlow;
  if (g) fx.outerGlow = { enabled: on(g), color: col(g.color, fx.outerGlow.color), opacity: op(g.opacity, fx.outerGlow.opacity), blend: bm(g.blendMode, 'screen'), size: px(g.size, 5), ...(px(g.choke, 0) > 0 ? { spread: Math.min(100, px(g.choke, 0)) } : {}), ...(g.noise ? { noise: Math.min(100, Math.round(g.noise * 100)) } : {}), ...(g.range !== undefined && g.range < 1 ? { range: Math.max(1, Math.round(g.range * 100)) } : {}), ...(g.antialiased ? { antiAlias: true } : {}), ...ct(g.contour) };
  const ig = info.innerGlow;
  if (ig) fx.innerGlow = { enabled: on(ig), color: col(ig.color, fx.innerGlow.color), opacity: op(ig.opacity, fx.innerGlow.opacity), blend: bm(ig.blendMode, 'screen'), size: px(ig.size, 5), ...(ig.source === 'center' ? { source: 'center' as const } : {}), ...(ig.technique === 'precise' ? { technique: 'precise' as const } : {}), ...(px(ig.choke, 0) > 0 ? { choke: Math.min(100, px(ig.choke, 0)) } : {}), ...(ig.noise ? { noise: Math.min(100, Math.round(ig.noise * 100)) } : {}), ...(ig.antialiased ? { antiAlias: true } : {}), ...ct(ig.contour) };
  const k = first(info.stroke, 'Stroke');
  if (k) {
    fx.stroke = { enabled: on(k), color: col(k.color, fx.stroke.color), opacity: op(k.opacity, 1), size: px(k.size, 3), ...(k.position === 'inside' || k.position === 'center' ? { position: k.position } : {}) };
    const kg = k.fillType === 'gradient' && k.gradient && 'colorStops' in k.gradient ? k.gradient : null;
    if (kg && kg.colorStops.length >= 2) fx.stroke.gradient = { from: col(kg.colorStops[0].color, fx.stroke.color), to: col(kg.colorStops[kg.colorStops.length - 1].color, fx.stroke.color), angle: kg.angle ?? 90, style: kg.style === 'radial' ? 'radial' : 'linear', reverse: !!kg.reverse };
    if (k.fillType === 'pattern' || (k.fillType === 'gradient' && !kg) || (kg && kg.style && kg.style !== 'linear' && kg.style !== 'radial')) notes.push(`"${name}" has a stroke fill formvis draws as a colour or a linear or radial gradient.`);
  }
  const co = first(info.solidFill, 'Color Overlay');
  if (co) fx.colorOverlay = { enabled: on(co), color: col(co.color, fx.colorOverlay.color), opacity: op(co.opacity, 1), blend: bm(co.blendMode, 'normal') };
  const go = first(info.gradientOverlay, 'Gradient Overlay');
  if (go) {
    const stops = go.gradient && 'colorStops' in go.gradient ? go.gradient.colorStops : [];
    fx.gradientOverlay = { enabled: on(go), from: col(stops[0]?.color, fx.gradientOverlay.from), to: col(stops[stops.length - 1]?.color, fx.gradientOverlay.to), opacity: op(go.opacity, 1), blend: bm(go.blendMode, 'normal'),
      angle: go.angle ?? 90, style: go.type === 'radial' || go.type === 'angle' || go.type === 'reflected' || go.type === 'diamond' ? go.type : 'linear', scale: Math.max(0.1, Math.min(1.5, go.scale ?? 1)), reverse: !!go.reverse, ...(go.dither ? { dither: true } : {}),
      ...(go.interpolationMethod === 'perceptual' || go.interpolationMethod === 'linear' || go.interpolationMethod === 'classic' ? { method: go.interpolationMethod } : {}) };
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
  }
  const sa = info.satin;
  if (sa) fx.satin = { enabled: on(sa), color: col(sa.color, fx.satin.color), opacity: op(sa.opacity, 0.5), blend: bm(sa.blendMode, 'multiply'), angle: sa.angle ?? 19, distance: px(sa.distance, 11), size: px(sa.size, 14), invert: sa.invert !== false, ...(sa.antialiased ? { antiAlias: true } : {}), ...ct(sa.contour) };
  const bv = info.bevel;
  if (bv) {
    const style = bv.style === 'outer bevel' ? 'outer' : bv.style === 'emboss' ? 'emboss' : bv.style === 'pillow emboss' ? 'pillow' : bv.style === 'stroke emboss' ? 'stroke' : 'inner';
    fx.bevel = { enabled: on(bv), style, depth: Math.max(1, Math.min(1000, Math.round((bv.strength ?? 1) * 100))), down: bv.direction === 'down', size: px(bv.size, 5), soften: px(bv.soften, 0), angle: bv.angle ?? 120, altitude: bv.altitude ?? 30,
      highlight: col(bv.highlightColor, fx.bevel.highlight), highlightOpacity: op(bv.highlightOpacity, 0.75), highlightBlend: bm(bv.highlightBlendMode, 'screen'), shadow: col(bv.shadowColor, fx.bevel.shadow), shadowOpacity: op(bv.shadowOpacity, 0.75), shadowBlend: bm(bv.shadowBlendMode, 'multiply') };
    if (bv.useGlobalLight) fx.bevel.useGlobal = true;
    if (bv.technique === 'chisel hard' || bv.technique === 'chisel soft') fx.bevel.technique = bv.technique === 'chisel hard' ? 'chiselHard' : 'chiselSoft';
    if (detail) {
      const gloss = fromPsdContour(detail.gloss), edge = fromPsdContour(detail.edge);
      if (gloss) fx.bevel.gloss = gloss;
      if (detail.antiAlias) fx.bevel.antiAlias = true;
      if (detail.useShape) fx.bevel.contour = { enabled: true, id: edge ?? 'linear', range: detail.range ?? 0.5 };
      if (detail.useTexture && detail.texture) {
        const t = detail.texture, src = patterns?.find((x) => x.id.replace(/\0+$/, '') === (t.patternId ?? '').replace(/\0+$/, ''));
        let id = 'builtin:checker';
        if (src?.data && src.bounds.w > 0 && src.bounds.h > 0) {
          const w = src.bounds.w, h = src.bounds.h, surface = createSurface(w, h), img = new ImageData(w, h);
          img.data.set(src.data.subarray(0, w * h * 4));
          ctxOf(surface).putImageData(img, 0, 0);
          id = `psd-${src.id}`;
          if (!patternById(id)) { addPattern(src.name || 'Pattern', surface, id); projectPatterns.add(id); }
        } else notes.push(`"${name}" has a bevel texture whose pattern the file does not include; formvis shows Checker in its place.`);
        fx.bevel.texture = { enabled: true, pattern: id, scale: t.scale, depth: t.depth, invert: t.invert, ...(t.link ? {} : { link: false }) };
      }
    } else if (bv.useShape || bv.useTexture) notes.push(`"${name}" has a bevel with a Contour or Texture whose settings this file did not let formvis read; formvis draws the bevel without them.`);
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
    fx.patternOverlay = { enabled: on(po), pattern: id, opacity: op(po.opacity, 1), blend: bm(po.blendMode, 'normal'), scale: Math.max(0.1, Math.min(10, po.scale ?? 1)), ...(po.align === false ? { link: false } : {}),
      ...(po.phase && Number.isFinite(po.phase.x) && Number.isFinite(po.phase.y) && (po.phase.x || po.phase.y) ? { phaseX: Math.max(-4096, Math.min(4096, Math.round(po.phase.x))), phaseY: Math.max(-4096, Math.min(4096, Math.round(po.phase.y))) } : {}) };
  }
  if (!all) {
    // The second to tenth instance of each effect the file can repeat, each read the same way and kept in the layer's extras.
    const extra: NonNullable<LayerEffects['extra']> = {}, more = (key: 'dropShadow' | 'innerShadow' | 'stroke' | 'solidFill' | 'gradientOverlay'): LayerEffectsInfo[typeof key] => (info[key] as unknown[] | undefined)?.slice(1, 10) as LayerEffectsInfo[typeof key];
    for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
      const part: LayerEffectsInfo = {};
      for (const key of ['dropShadow', 'innerShadow', 'stroke', 'solidFill', 'gradientOverlay'] as const) { const one = more(key)?.[i]; if (one) (part as Record<string, unknown>)[key] = [one]; }
      if (!Object.keys(part).length) break;
      const sub = fromPsdEffects(part, patterns, name, notes, true);
      if (!sub) continue;
      if (part.dropShadow) (extra.dropShadow ??= []).push(sub.dropShadow);
      if (part.innerShadow) (extra.innerShadow ??= []).push(sub.innerShadow);
      if (part.stroke) (extra.stroke ??= []).push(sub.stroke);
      if (part.solidFill) (extra.colorOverlay ??= []).push(sub.colorOverlay);
      if (part.gradientOverlay) (extra.gradientOverlay ??= []).push(sub.gradientOverlay);
    }
    if (Object.keys(extra).length) fx.extra = extra;
  }
  if (info.disabled) fx.hidden = true;
  return all || effectsPresent(fx) ? fx : null;
}

/** PostScript names for formvis's type families in PSD files; bold and italic travel as the format's faux styles. */
const PS_FONT: Record<string, string> = { Inter: 'Inter-Regular', Arial: 'ArialMT', Helvetica: 'Helvetica', Georgia: 'Georgia', 'Times New Roman': 'TimesNewRomanPSMT', 'Courier New': 'CourierNewPSMT', Verdana: 'Verdana', 'Trebuchet MS': 'TrebuchetMS', Impact: 'Impact', 'JetBrains Mono': 'JetBrainsMono-Regular', Lato: 'Lato-Regular', Montserrat: 'Montserrat-Regular', 'Open Sans': 'OpenSans-Regular', Roboto: 'Roboto-Regular', Lora: 'Lora-Regular', Merriweather: 'Merriweather-Regular', 'Playfair Display': 'PlayfairDisplay-Regular', Anton: 'Anton-Regular', 'Bebas Neue': 'BebasNeue-Regular', Oswald: 'Oswald-Regular', Caveat: 'Caveat-Regular', 'Dancing Script': 'DancingScript-Regular', Pacifico: 'Pacifico-Regular', 'IBM Plex Mono': 'IBMPlexMono-Regular', 'Source Code Pro': 'SourceCodePro-Regular', serif: 'TimesNewRomanPSMT', 'sans-serif': 'ArialMT', monospace: 'CourierNewPSMT' };

/** The formvis family a PSD font name belongs to, by its PostScript name or its family part. */
/** A group's 'artb' artboard data (36.27): its rectangle in document pixels and its background, as a formvis artboard. */
export function fromPsdArtboard(pl: PsdLayer): { artboard: NonNullable<Layer['artboard']> } | Record<string, never> {
  const a = pl.artboard;
  if (!a?.rect) return {};
  const r = a.rect, c = a.color as unknown as { r?: number; g?: number; b?: number } | undefined, k = (v: unknown): number => Math.round(Math.min(255, Math.max(0, Number(v) || 0)));
  const bg = a.backgroundType === 3 ? null : a.backgroundType === 2 ? { r: 0, g: 0, b: 0 } : a.backgroundType === 4 && c && typeof c.r === 'number' ? { r: k(c.r), g: k(c.g), b: k(c.b) } : { r: 255, g: 255, b: 255 };
  const board = artboardFromData({ x: r.left, y: r.top, w: r.right - r.left, h: r.bottom - r.top, background: bg, preset: a.presetName });
  return board ? { artboard: board } : {};
}

/** A top-level artboard folder as 'artb' data: Top, Left, Btom, Rght, and a white, black, transparent or custom background. */
export function toPsdArtboard(l: Layer): Pick<PsdLayer, 'artboard'> | Record<string, never> {
  const a = l.artboard;
  if (!a || l.parentId) return {};
  const bg = a.background, white = !!bg && bg.r === 255 && bg.g === 255 && bg.b === 255, black = !!bg && !bg.r && !bg.g && !bg.b;
  return { artboard: { rect: { top: a.y, left: a.x, bottom: a.y + a.h, right: a.x + a.w }, presetName: a.preset ?? '', backgroundType: !bg ? 3 : white ? 1 : black ? 2 : 4, ...(bg ? { color: { r: bg.r, g: bg.g, b: bg.b } } : {}) } };
}

function familyOf(psName: string): { family: string; bold: boolean; italic: boolean } {
  const known = Object.entries(PS_FONT).find(([fam, ps]) => ps === psName && fam !== 'serif' && fam !== 'sans-serif' && fam !== 'monospace');
  const hit = resolveFace(psName, TEXT_FONTS);
  return { family: known?.[0] ?? hit?.family ?? psName, bold: /bold/i.test(psName) || !!hit?.bold, italic: /italic|oblique/i.test(psName) || !!hit?.italic };
}

/** Per-range type attributes as the PSD's style runs: each piece of the text carries a whole style, the layer's own with
 *  the run's attributes laid over it. Null when no run sets an attribute. */
function toPsdStyleRuns(t: TextSpec, k: number): TextStyleRun[] | null {
  if (!runsStyled(t.runs)) return null;
  return styleSegments(null, t.runs, 0, t.content.length).map((s) => {
    const a = s.attrs, size = a.size ?? t.size, family = a.family ?? t.family;
    const style: TextStyle = { font: { name: PS_FONT[family] ?? family.replace(/\s+/g, '') }, fontSize: size * k, fauxBold: a.bold ?? t.bold, fauxItalic: a.italic ?? t.italic, fillColor: a.color ?? t.color,
      autoLeading: false, leading: size * t.lineHeight * k, tracking: a.tracking ?? t.tracking, autoKerning: t.kerning !== 'none', ...(a.baselineShift ? { baselineShift: a.baselineShift * k } : {}) };
    return { length: s.to - s.from, style };
  });
}

/** A PSD text layer's style runs as formvis runs: what each piece sets that the layer's own style does not. */
function fromPsdStyleRuns(list: TextStyleRun[] | undefined, spec: TextSpec, scale: number, length: number): FeatureRun[] {
  if (!list || list.length < 2) return [];
  const out: Array<Record<string, unknown>> = [], num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  let at = 0;
  for (const r of list) {
    const s = r.style ?? {}, a: Record<string, unknown> = {}, face = s.font?.name ? familyOf(s.font.name) : null;
    if (face && face.family !== spec.family) a.family = face.family;
    if (s.fontSize !== undefined) { const size = Math.round(s.fontSize * scale * 100) / 100; if (size !== spec.size) a.size = size; }
    const bold = !!s.fauxBold || !!face?.bold, italic = !!s.fauxItalic || !!face?.italic;
    if (face && bold !== spec.bold) a.bold = bold;
    if (face && italic !== spec.italic) a.italic = italic;
    const c = s.fillColor as Record<string, number> | undefined, col = c && typeof c.r === 'number' ? { r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) } : c && typeof c.fr === 'number' ? { r: Math.round(c.fr * 255), g: Math.round(c.fg * 255), b: Math.round(c.fb * 255) } : null;
    if (col && (col.r !== spec.color.r || col.g !== spec.color.g || col.b !== spec.color.b)) a.color = col;
    if (s.tracking !== undefined && Math.round(num(s.tracking)) !== spec.tracking) a.tracking = Math.round(num(s.tracking));
    if (num(s.baselineShift)) a.baselineShift = Math.round(num(s.baselineShift) * scale * 100) / 100;
    out.push({ ...a, start: at, end: at + r.length, on: [], off: [] });
    at += r.length;
  }
  return cleanRuns(out, length);
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

/** A 16 or 32 bit layer's RGBA samples as the engine's float pixels: 16 bits scaled to 0..1, 32 bits kept as stored (linear light). */
function deepOfPixels(d: { data: ArrayLike<number>; width: number; height: number }, bits: number): DeepPixels {
  const data = new Float32Array(d.width * d.height * 4), scale = bits === 16 ? 1 / 65535 : 1;
  for (let i = 0; i < data.length; i++) data[i] = d.data[i] * scale;
  return { mode: 'rgb', n: 3, width: d.width, height: d.height, data };
}

/** A layer's pixels cut to the canvas; null where it does not overlap it. */
function cropToCanvas(c: HTMLCanvasElement, left: number, top: number, W: number, H: number): { canvas: HTMLCanvasElement; left: number; top: number } | null {
  const x0 = Math.max(0, left), y0 = Math.max(0, top), x1 = Math.min(W, left + c.width), y1 = Math.min(H, top + c.height);
  if (x1 <= x0 || y1 <= y0) return null;
  const out = canvas(x1 - x0, y1 - y0);
  (out.getContext('2d') as CanvasRenderingContext2D).drawImage(c, x0 - left, y0 - top, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0);
  return { canvas: out, left: x0, top: y0 };
}

/** True where the pixels cover the whole canvas and none is clear (read in strips; a canvas over 64 megapixels is not scanned). */
function coversOpaque(c: HTMLCanvasElement, left: number, top: number, W: number, H: number): boolean {
  if (left > 0 || top > 0 || left + c.width < W || top + c.height < H || W * H > 64_000_000) return false;
  const ctx = c.getContext('2d');
  if (!ctx) return false;
  for (let y = Math.max(0, -top); y < Math.max(0, -top) + H; y += 256) {
    const rows = Math.min(256, Math.max(0, -top) + H - y), d = ctx.getImageData(Math.max(0, -left), y, W, rows).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] !== 255) return false;
  }
  return true;
}

const baseName = (p: string): string => p.split(/[\\/]/).pop() ?? p;

/** The file a linked smart object points at: one of the files opened with the PSD that has its name, or, in the desktop
 *  app where the PSD's disk path is known, the file at the stored relative path from the PSD's folder. */
async function resolveLinked(lf: NonNullable<Psd['linkedFiles']>[number], psdFile: File, siblings: readonly File[]): Promise<File | null> {
  const want = baseName(lf.linkedFile?.relativePath || lf.linkedFile?.name || lf.name).toLowerCase();
  if (!want) return null;
  const hit = siblings.find((s) => s !== psdFile && s.name.toLowerCase() === want);
  if (hit) return hit;
  const at = Reflect.get(psdFile, 'path');
  const rel = lf.linkedFile?.relativePath;
  if (typeof at !== 'string' || !at || !rel || !('__TAURI_INTERNALS__' in window)) return null;
  const parts = at.split(/[\\/]/).slice(0, -1);
  for (const seg of rel.split(/[\\/]/)) { if (seg === '..') parts.pop(); else if (seg && seg !== '.') parts.push(seg); }
  try {
    const res = await fetch(`/api/file?path=${encodeURIComponent(parts.join('/'))}`);
    return res.ok ? new File([await res.blob()], baseName(rel), { type: res.headers.get('Content-Type') ?? '' }) : null;
  } catch { return null; }
}

export async function readPsdFile(file: File, siblings: readonly File[] = []): Promise<{ doc: Doc; notes: string[]; activeId: ID | null; paths: PathSet | null; report: PsdReport }> {
  const { readPsd } = await import('ag-psd');
  const buffer = await file.arrayBuffer();
  // The layer reader swaps the bytes of 16 bit samples in place, so the raw-sample read below starts from an untouched copy.
  const pristine = buffer.byteLength > 26 && new DataView(buffer).getUint16(22) > 8 ? buffer.slice(0) : null;
  const chanMode = readPsdChannelMode(buffer, psdResolution(buffer));
  if (chanMode) return { doc: chanMode.doc, notes: chanMode.notes, activeId: chanMode.activeId, paths: null, report: reportOf(1, [], chanMode.notes) };
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
  const contents = new Map<string, Raster | null>(), linkOfFile = new Map<string, SmartLink>(), unresolved = new Map<string, string>(), originals = new Map<string, SmartOriginal>(), nests = new Map<string, NestedContents>();
  for (const lf of psd.linkedFiles ?? []) {
    if (lf.data) {
      contents.set(lf.id, await decodeLinked(lf.data, readPsd));
      const kind = sniffLinked(lf.data), base = lf.name || 'Smart Object', inner = await nestedOf(lf.data, base);
      originals.set(lf.id, { name: /\.[A-Za-z0-9]{1,8}$/.test(base) ? base : `${base}${kind.ext}`, mime: kind.mime, data: lf.data.slice() });
      if (inner) nests.set(lf.id, inner);
      continue;
    }
    // A linked (not embedded) smart object: its file is found among the files opened with the PSD, else beside it on disk in the desktop app.
    const found = await resolveLinked(lf, file, siblings);
    const raster = found ? await decodeLinked(new Uint8Array(await found.arrayBuffer()), readPsd).catch(() => null) : null;
    if (found && raster) { contents.set(lf.id, raster); linkOfFile.set(lf.id, { id: uid(), name: found.name, size: found.size, lastModified: found.lastModified }); }
    else unresolved.set(lf.id, lf.linkedFile?.relativePath || lf.linkedFile?.name || lf.name);
  }
  const xmpText = psd.imageResources?.xmpMetadata, fromXmp = xmpText ? metaFromXmp(xmpText) : null;   // File Info (29.2): the XMP image resource
  const fileInfo = xmpText && xmpText.length <= MAX_XMP_RAW_CHARS ? cleanMeta({ ...(fromXmp ?? {}), xmpRaw: xmpText }) : fromXmp;   // the whole packet kept, so its other properties go back out
  const parRead = psd.imageResources?.pixelAspectRatio?.aspect;   // Pixel Aspect Ratio (35.4 part b)
  const doc: Doc = { id: uid(), width: psd.width, height: psd.height, resolution: psdResolution(buffer) ?? 72, layers: [], ...(fileInfo ? { meta: fileInfo } : {}), ...(typeof parRead === 'number' && parRead > 0 && parRead !== 1 ? { pixelAspect: parRead } : {}) };
  const layers: Layer[] = [], notes: string[] = [], links = new Map<number, ID>(), psdIds = new Map<PsdLayer, ID>();
  if (cut === 'merged') notes.push('This PSD is cut short: its layers opened, but its merged image is incomplete.');
  if (cut === 'layers') notes.push('This PSD is cut short: the layers after the cut are blank and its merged image is missing.');
  const kept: string[] = [], blocks = resourceBlocks(buffer), colorMode = psd.colorMode as number | undefined, bits = psd.bitsPerChannel ?? 8;
  // A 16 or 32 bit RGB or grey file is read a second time as raw samples, so its pixel layers open deep.
  const deepOf = new Map<PsdLayer, DeepPixels>();
  let deepFlat: DeepPixels | null = null;
  if (pristine && (bits === 16 || bits === 32) && !cut && (colorMode === undefined || colorMode === 1 || colorMode === 3)) {
    try {
      const raw = readPsd(pristine, { skipThumbnail: true, skipLinkedFilesData: true, skipCompositeImageData: !!psd.children?.length, useImageData: true });
      const pair = (a: PsdLayer[] | undefined, b: PsdLayer[] | undefined): void => {
        if (!a || !b || a.length !== b.length) return;
        a.forEach((pl, i) => { const px = b[i].imageData; if (px && !pl.children && px.width * px.height * 4 === px.data.length) deepOf.set(pl, deepOfPixels(px, bits)); pair(pl.children, b[i].children); });
      };
      pair(psd.children, raw.children);
      if (raw.imageData && raw.imageData.width * raw.imageData.height * 4 === raw.imageData.data.length) deepFlat = deepOfPixels(raw.imageData, bits);
    } catch { deepOf.clear(); }
  }
  const deepDoc = deepOf.size > 0 || deepFlat !== null;
  if (deepDoc) { doc.depth = bits as 16 | 32; kept.push(`Opened at ${bits} bits per channel.`); }
  else if (bits !== 8) notes.push(`This ${bits}-bit file opened at 8 bits per channel.`);
  if (colorMode === 1) { doc.mode = 'grayscale'; kept.push('Grayscale mode.'); }
  else if (colorMode === 0) { doc.mode = 'bitmap'; kept.push('Bitmap mode.'); }
  else if (colorMode === 2 && psd.palette?.length) { doc.mode = 'indexed'; doc.palette = psd.palette.map((c) => ({ r: c.r, g: c.g, b: c.b })); kept.push(`Indexed Color with ${psd.palette.length} colours.`); }
  else if (colorMode === 2) notes.push('This Indexed Color file has no colour table that formvis could read; it opened as RGB.');
  const icc = readIccProfile(buffer);
  if (icc) { doc.profile = icc; kept.push(`Colour profile ${icc.name}.`); }
  const exifRes = blocks.get(1058);
  if (exifRes && exifRes.length >= 8 && exifRes.length <= 64000) {
    const camera = cameraFromTiff(exifRes);
    doc.meta = { ...(doc.meta ?? {}), exif: toBase64(exifRes), ...(camera && !doc.meta?.camera ? { camera } : {}) };
    kept.push('Exif block.');
  }
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
  const closedGroups: ID[] = [], restrictions = readChannelRestrictions(buffer, psd), bevels = readBevelDetails(buffer, psd), ownStacks = readLayerBlocks(buffer, psd, SMART_STACK_KEY), ownAdjusts = readLayerBlocks(buffer, psd, ADJUSTMENT_KEY);
  const maskOf =(mk: PsdLayer['mask']): Layer['mask'] | null => {
    if (!mk?.canvas || !mk.canvas.width || !mk.canvas.height) return null;
    // PSD masks are grey; formvis's are white with the level in alpha.
    const mw = mk.canvas.width, mh = mk.canvas.height, grey = mk.canvas.getContext('2d')?.getImageData(0, 0, mw, mh);
    if (!grey) return null;
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
    return { raster: mr, enabled: !mk.disabled, linked: true, placement: { ...docTransform(rw, rh), x: mx, y: my }, ...(dens ? { density: dens } : {}), ...(feather ? { feather } : {}) };
  };
  const vectorMaskOf = (pl: PsdLayer): Layer['vectorMask'] | null => {
    const vm = pl.vectorMask;
    if (!vm?.paths?.length) return null;
    const path = fromPsdOutlines(vm.paths);
    if (!path.subpaths.length) return null;
    const vmd = pl.realMask ?? pl.mask, vd = typeof vmd?.vectorMaskDensity === 'number' && vmd.vectorMaskDensity < 1 ? Math.round(vmd.vectorMaskDensity * 100) : 0, vfe = typeof vmd?.vectorMaskFeather === 'number' && vmd.vectorMaskFeather > 0 ? vmd.vectorMaskFeather : 0;
    return { path, enabled: !vm.disable, linked: !vm.notLink, inverted: !!vm.invert, ...(vd ? { density: vd } : {}), ...(vfe ? { feather: vfe } : {}) };
  };
  const walk = (children: PsdLayer[] | undefined, parentId: ID | null): void => {
    let base: Layer | null = null, basePl: PsdLayer | null = null;
    for (const pl of children ?? []) {
      const name = pl.name || 'Layer', blend = (pl.blendMode && FROM_PSD.get(pl.blendMode)) ?? 'normal';
      if (pl.children) {
        // A group's blend mode: Pass Through is formvis's folder with Normal and no isolation; any other mode, Normal
        // included, composites the group on its own.
        const through = !pl.blendMode || pl.blendMode === 'pass through', gblend = through ? 'normal' : FROM_PSD.get(pl.blendMode as PsdBlend) ?? 'normal';
        if (!through && !FROM_PSD.has(pl.blendMode as PsdBlend)) notes.push(`"${name}" uses ${pl.blendMode}, which formvis does not have; it opened as Normal.`);
        const group = newLayer(name, doc, { isGroup: true, parentId, visible: !pl.hidden, opacity: pl.opacity ?? 1, blend: gblend, ...(!through && gblend === 'normal' ? { isolate: true } : {}), ...linkOf(pl), ...labelOf(pl), ...(!parentId ? fromPsdArtboard(pl) : {}) });
        const gmask = maskOf(pl.mask), gvec = vectorMaskOf(pl);
        if (gmask) group.mask = gmask;
        if (gvec) group.vectorMask = gvec;
        if (pl.effects) { const gfx = fromPsdEffects(pl.effects, psd.patterns, name, notes, false, bevels.get(pl)); if (gfx) group.effects = gfx; }
        if (pl.opened === false) closedGroups.push(group.id);
        walk(pl.children, group.id);
        psdIds.set(pl, group.id);
        layers.push(group); // after its children, where formvis keeps a folder's entry
        base = null;
        basePl = null;
        continue;
      }
      if (pl.blendMode && !FROM_PSD.has(pl.blendMode) && pl.blendMode !== 'pass through') notes.push(`"${name}" uses ${pl.blendMode}, which formvis does not have; it opened as Normal.`);
      const adj = pl.adjustment ? fromPsdAdjustment(pl.adjustment) : adjustmentFromBlock(ownAdjusts.get(pl));
      if (adj && !pl.adjustment) kept.push(`"${name}" opens as the live ${ADJUSTMENT_LABELS[adj.kind]} adjustment from formvis's own block.`);
      const keptAdj = pl.adjustment && !adj ? keepPsdAdjustment(pl.adjustment) : null;
      if (keptAdj) notes.push(`"${name}" is a ${pl.adjustment?.type} adjustment, which formvis does not draw; it opened as an empty layer that keeps the adjustment's settings for a PSD saved again.`);
      // A PSD fill layer (a colour, a gradient or a pattern, with no shape's path) opens as formvis's (1.66.0).
      // A shape filled with a gradient or a pattern and not stroked is a fill layer behind a vector mask.
      const shapeFill = !!pl.vectorMask?.paths?.length && (pl.vectorFill?.type === 'solid' || pl.vectorFill?.type === 'pattern') && !pl.vectorStroke?.strokeEnabled && pl.vectorStroke?.fillEnabled !== false;
      const fillSpec = !adj && pl.vectorFill && ((!pl.vectorMask?.paths?.length && !pl.vectorStroke) || shapeFill) ? fromPsdFill(pl.vectorFill, psd.patterns, name, notes) : null;
      const emptyPixels = !adj && !fillSpec && (!pl.canvas || !pl.canvas.width || !pl.canvas.height);
      const drawn = fillSpec && (shapeFill || !pl.canvas || !pl.canvas.width || !pl.canvas.height) ? renderFill(fillSpec, doc.width, doc.height, { x: 0, y: 0, w: doc.width, h: doc.height }) : null;
      if (fillSpec && !drawn && (!pl.canvas || !pl.canvas.width || !pl.canvas.height)) continue;
      // A plain pixel layer more than four canvases large is cut to the canvas; type, shapes and smart objects keep all their pixels.
      const cut = adj || drawn || !pl.canvas || pl.placedLayer || pl.text || pl.vectorMask || pl.vectorFill || pl.canvas.width * pl.canvas.height <= 4 * doc.width * doc.height ? null : cropToCanvas(pl.canvas, pl.left ?? 0, pl.top ?? 0, doc.width, doc.height);
      if (cut) croppedCount++;
      const src = emptyPixels ? undefined : cut?.canvas ?? pl.canvas, atX = cut ? cut.left : emptyPixels ? 0 : pl.left ?? 0, atY = cut ? cut.top : emptyPixels ? 0 : pl.top ?? 0;
      const w = drawn?.width ?? src?.width ?? (emptyPixels ? doc.width : 0), h = drawn?.height ?? src?.height ?? (emptyPixels ? doc.height : 0);
      const dp = !adj && !drawn && !cut && !pl.text && !pl.placedLayer && !pl.vectorMask && !pl.vectorFill ? deepOf.get(pl) : undefined, deep = dp && dp.width === w && dp.height === h ? dp : undefined;
      const raster = adj ? null : deep ? rasterFromDeep(deep, bits === 32) : drawn ?? (src ? Raster.from(src, w, h) : emptyPixels ? new Raster(w, h) : null);
      // An adjustment layer opens as formvis's own, live, with its mask, opacity, blend and clipping.
      const pr = pl.protected, all = !!(pr?.transparency && pr?.composite && pr?.position);
      const lk = pr && (pr.transparency || pr.composite || pr.position) ? { locks: all ? { all: true } : { ...(pr.transparency ? { transparency: true } : {}), ...(pr.composite ? { pixels: true } : {}), ...(pr.position ? { position: true } : {}) } } : {};
      const fill = { ...(pl.fillOpacity !== undefined && pl.fillOpacity !== 1 ? { fill: Math.min(1, Math.max(0, pl.fillOpacity)) } : {}), ...lk, ...linkOf(pl) };
      // Channel restrictions are read from the layer records (the layer reader drops the last entry); Transparency Shapes Layer off is kept.
      const restricted = restrictions.get(pl);
      const advanced = { ...labelOf(pl), ...(restricted ? { blendChannels: restricted } : {}), ...(pl.transparencyShapesLayer === false ? { transparencyShapes: false } : {}) };
      if (pl.channelBlendingRestrictions?.length && !restricted) notes.push(`"${name}" restricts the channels it blends into, which this file's layer records did not let formvis read; it opened with all channels.`);
      const layer = adj ? newLayer(name, doc, { adjustment: adj, parentId, visible: !pl.hidden, opacity: pl.opacity ?? 1, blend, ...fill, ...advanced })
        : newLayer(name, doc, { raster, parentId, ...(deep ? { channels: deep } : {}), transform: { ...docTransform(w, h), x: drawn ? 0 : atX, y: drawn ? 0 : atY }, visible: !pl.hidden, opacity: pl.opacity ?? 1, blend, ...fill, ...advanced, ...(fillSpec ? { fillContent: fillSpec } : {}), ...(keptAdj ? { psdAdjustment: keptAdj } : {}) });
      const made = maskOf(pl.mask);
      if (made) layer.mask = made;
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
        // A gradient on the fill or the stroke becomes the shape's own gradient, drawn across its bounds.
        const gradOf = (c: VectorContent | undefined): ShapeGradient | null => {
          const g = c?.type === 'solid' ? fromPsdFill(c, psd.patterns, name, []) : null;
          if (!g || g.kind !== 'gradient') return null;
          const stops = (g.reverse ? g.stops.map((s) => ({ ...s, at: 1 - s.at })) : g.stops).map((s) => ({ at: s.at, color: s.color, alpha: s.alpha }));
          return { type: g.style === 'radial' ? 'radial' : g.style === 'angle' ? 'angle' : 'linear', angle: -g.angle, stops };
        };
        const fillGrad = vs?.fillEnabled === false ? null : gradOf(vf), strokeGrad = vs?.strokeEnabled ? gradOf(vs.content) : null;
        // A pattern fill or stroke is the library pattern the file's patterns hold, with a mid grey standing in for the colour.
        const patOf = (c: VectorContent | undefined): ShapePattern | null => { const g = c?.type === 'pattern' ? fromPsdFill(c, psd.patterns, name, []) : null; return g && g.kind === 'pattern' ? { id: g.pattern, scale: 1 } : null; };
        const fillPat = vs?.fillEnabled === false ? null : patOf(vf), strokePat = vs?.strokeEnabled ? patOf(vs.content) : null, grey = { r: 128, g: 128, b: 128 };
        const fill = vs?.fillEnabled === false ? null : vf?.type === 'color' ? col(vf.color) : fillGrad ? fillGrad.stops[0].color : fillPat ? grey : null;
        const sc = vs?.strokeEnabled && vs.content?.type === 'color' ? col(vs.content.color) : strokeGrad ? strokeGrad.stops[0].color : strokePat ? grey : null;
        const stroke = sc ? { color: sc, width: vs?.lineWidth?.value ?? 1, ...(strokeGrad ? { gradient: strokeGrad } : {}), ...(strokePat ? { pattern: strokePat } : {}),
          ...(vs?.lineAlignment === 'inside' || vs?.lineAlignment === 'outside' ? { align: vs.lineAlignment } : {}), ...(vs?.lineCapType === 'butt' || vs?.lineCapType === 'square' ? { cap: vs.lineCapType } : {}), ...(vs?.lineJoinType === 'miter' || vs?.lineJoinType === 'bevel' ? { join: vs.lineJoinType } : {}),
          ...(typeof vs?.miterLimit === 'number' && vs.miterLimit >= 1 && vs.miterLimit <= 10 ? { miter: vs.miterLimit } : {}), ...(typeof vs?.opacity === 'number' && vs.opacity >= 0 && vs.opacity < 1 ? { opacity: vs.opacity } : {}) } : null;
        if (path.subpaths.length && (fill || stroke)) layer.vector = { path, fill, stroke, ...(fillGrad ? { gradient: fillGrad } : {}), ...(fillPat ? { pattern: fillPat } : {}), origin: { x: pl.left ?? 0, y: pl.top ?? 0 } };
      } else if (vm?.paths?.length) {
        // A vector mask on a pixel layer (Layer > Vector Mask): kept as formvis's own, with its invert, link and disable flags.
        const vmask = vectorMaskOf(pl);
        if (vmask) layer.vectorMask = vmask;
      }
      const plc = pl.placedLayer;
      if (plc) {
        // A PSD smart object opens as a formvis one: its contents the source, its corners the warp, its pixels as
        // saved until it is next re-rendered.
        const source = contents.get(plc.id) ?? null, t8 = plc.nonAffineTransform ?? plc.transform;
        if (source && t8?.length === 8 && t8.every((v) => Number.isFinite(v))) {
          const deform = meshDeform(plc, t8, source, layer.transform);
          layer.smart = { source, filters: [], warp: deform ? null : [0, 2, 4, 6].map((k) => ({ x: t8[k], y: t8[k + 1] })), warpAt: deform ? null : layer.transform, ...(deform ? { deform } : {}),...(linkOfFile.has(plc.id) ? { link: linkOfFile.get(plc.id) } : {}), ...(originals.has(plc.id) ? { original: originals.get(plc.id) } : {}), ...(nests.has(plc.id) ? { nested: nests.get(plc.id) } : {}) };
          const bent = warpKind(plc, source);
          if (deform) kept.push(`"${name}" keeps its warp mesh as a live Warp.`);
          else if (bent) notes.push(`"${name}" has a ${bent} warp; formvis keeps its four-corner transform, so the saved pixels show the warp until the smart object is next re-rendered, which straightens it.`);
          if (nests.has(plc.id)) kept.push(`"${name}" opens its layers as the smart object's contents.`);
          if (plc.filter?.list?.length) {
            // Smart filters come in as the live stack when every one of them maps; the pixels stay as saved until the next render.
            const got = fromPsdSmartFilters(plc.filter.list, plc.filter.enabled !== false, (m) => FROM_PSD.get(m as PsdBlend));
            if ('filters' in got) { layer.smart.filters = got.filters; kept.push(`"${name}" has ${got.filters.length} editable smart filter${got.filters.length === 1 ? '' : 's'}.`); }
            else notes.push(`"${name}" has smart filters formvis does not have (${got.missing.join(', ')}); the stack stays applied in its pixels and is not editable here.`);
          }
          const ownStack = layer.smart.filters.length ? [] : smartFiltersFrom(ownStacks.get(pl));
          if (ownStack.length) { layer.smart.filters = ownStack; kept.push(`"${name}" has ${ownStack.length} editable smart filter${ownStack.length === 1 ? '' : 's'} from formvis's own block.`); }
        } else if (unresolved.has(plc.id)) notes.push(`"${name}" is linked to ${unresolved.get(plc.id)}, which was not found with the PSD (open it together with the PSD to link it); it opened as pixels.`);
        else notes.push(`"${name}" is a smart object whose contents formvis cannot read; it opened as pixels.`);
      }
      const tx = pl.text;
      if (tx && typeof tx.text === 'string' && raster) {
        // PSD type opens as editable formvis type: the file's pixels until it is edited, then formvis's.
        const longest = (tx.styleRuns?.length ?? 0) > 1 ? tx.styleRuns?.reduce((a, r) => (r.length > a.length ? r : a)) : undefined;   // the style most of the text has is the layer's own; the other runs differ from it
        const st = { ...(tx.style ?? {}), ...(longest?.style ?? {}) }, m = tx.transform ?? [1, 0, 0, 1, 0, 0], scale = Math.hypot(m[2] ?? 0, m[3] ?? 1) || 1, face = familyOf(st.font?.name ?? 'ArialMT');
        const col = st.fillColor as Record<string, number> | undefined, just = tx.paragraphStyle?.justification;
        const size = Math.max(1, Math.round((st.fontSize ?? 12) * scale * 100) / 100);
        const spec: TextSpec = { content: tx.text.replace(/\r/g, '\n'), family: face.family, size, color: col && typeof col.r === 'number' ? { r: Math.round(col.r), g: Math.round(col.g), b: Math.round(col.b) } : col && typeof col.fr === 'number' ? { r: Math.round(col.fr * 255), g: Math.round(col.fg * 255), b: Math.round(col.fb * 255) } : { r: 0, g: 0, b: 0 },
          align: just === 'center' || just === 'right' ? just : 'left', bold: !!st.fauxBold || face.bold, italic: !!st.fauxItalic || face.italic, lineHeight: st.autoLeading === false && st.leading ? Math.round((st.leading * scale / size) * 100) / 100 : 1.2,
          tracking: Math.round(Math.min(10000, Math.max(-1000, st.tracking ?? 0))), kerning: st.autoKerning === false ? 'none' : 'metrics' };
        // Paragraph (box) type, warp, vertical type, the character flags and the indents the file states travel with the type.
        const ps = tx.paragraphStyle ?? {}, wsc = Math.hypot(m[0] ?? 1, m[1] ?? 0) || 1, bb = tx.boxBounds, wp = tx.warp, num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
        if (tx.shapeType === 'box' && bb?.length === 4 && bb[2] - bb[0] > 0 && bb[3] - bb[1] > 0) spec.box = { w: Math.round((bb[2] - bb[0]) * wsc), h: Math.round((bb[3] - bb[1]) * scale) };
        if (tx.orientation === 'vertical') spec.direction = 'vertical';
        if (st.underline) spec.underline = true;
        if (st.strikethrough) spec.strike = true;
        if (st.fontCaps === 1) spec.caps = 'small'; else if (st.fontCaps === 2) spec.caps = 'all';
        if (num(st.baselineShift)) spec.baselineShift = Math.round(num(st.baselineShift) * scale * 100) / 100;
        if (num(st.horizontalScale) && st.horizontalScale !== 1) spec.scaleX = Math.round(st.horizontalScale as number * 100);
        if (num(st.verticalScale) && st.verticalScale !== 1) spec.scaleY = Math.round(st.verticalScale as number * 100);
        if (num(ps.firstLineIndent)) spec.indentFirst = Math.round(num(ps.firstLineIndent) * wsc);
        if (num(ps.startIndent)) spec.indentLeft = Math.round(num(ps.startIndent) * wsc);
        if (num(ps.endIndent)) spec.indentRight = Math.round(num(ps.endIndent) * wsc);
        if (num(ps.spaceBefore)) spec.spaceBefore = Math.round(num(ps.spaceBefore) * scale);
        if (num(ps.spaceAfter)) spec.spaceAfter = Math.round(num(ps.spaceAfter) * scale);
        if (just === 'justify-left' || just === 'justify-center' || just === 'justify-right' || just === 'justify-all') spec.align = 'justify';
        const warped = !!wp?.style && wp.style !== 'none' && WARP_STYLES.has(wp.style);
        if (warped && wp) spec.warp = { style: wp.style as WarpStyle, orientation: wp.rotate === 'vertical' ? 'vertical' : 'horizontal', bend: Math.max(-100, Math.min(100, num(wp.value))), horizontal: Math.max(-100, Math.min(100, num(wp.perspective))), vertical: Math.max(-100, Math.min(100, num(wp.perspectiveOther))) };
        else if (wp?.style && wp.style !== 'none') notes.push(`"${name}" has ${wp.style} warped type, which formvis does not have; it edits it as unwarped type.`);
        layer.text = { ...spec, rendered: textKey(raster) };
        const styled = fromPsdStyleRuns(tx.styleRuns, spec, scale, tx.text.length);
        if (styled.length) layer.text = { ...layer.text, runs: styled };
      }
      if (pl.effects) { const fx = fromPsdEffects(pl.effects, psd.patterns, name, notes, false, bevels.get(pl)); if (fx) layer.effects = fx; }
      // Blend Interior Effects as Group and Layer Mask Hides Effects belong to the layer style; they are kept when it has one.
      if (layer.effects) {
        if (pl.blendInteriorElements) layer.effects.blendInterior = true;
        if (pl.layerMaskAsGlobalMask === false) layer.effects.layerMaskHides = false;
      }
      Object.assign(layer, fromPsdBlending(pl));
      // The file's Background layer is the bottom one, opaque over the whole canvas; it opens locked, as there.
      if (!parentId && !layers.length && name === 'Background' && src && raster && !pl.mask && !pl.text && !pl.placedLayer && !pl.clipping && !fillSpec && (pl.opacity ?? 1) === 1 && blend === 'normal' && coversOpaque(src, atX, atY, doc.width, doc.height)) {
        layer.locks = { ...(layer.locks ?? {}), all: true };
        kept.push('Locked Background layer.');
      }
      if (pl.clipping && base) {
        layer.clipId = base.id;
        if (basePl?.blendClippendElements === true && !base.isGroup && !base.adjustment) base.blendClipped = true;   // Blend Clipped Layers as Group, on the base
      } else { base = layer; basePl = pl; }
      psdIds.set(pl, layer.id);
      layers.push(layer);
    }
  };
  walk(psd.children, null);
  if (closedGroups.length) doc.collapsed = closedGroups;
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
  const allGuides = psd.imageResources?.gridAndGuidesInformation?.guides ?? [], guideAt = new Map<number, number>();
  const guideList = allGuides.filter((g, i) => { const ok = Number.isFinite(g.location) && g.location >= 0; if (ok) guideAt.set(i, guideAt.size); return ok; });
  if (guideList.length) {
    const made: Guide[] = guideList.map((g) => ({ axis: g.direction === 'horizontal' ? 'y' as const : 'x' as const, at: Math.round(g.location * 2) / 2 }));
    // An artboard's own guides: its artboard data lists their places in the file's guide list.
    for (const [pl, lid] of psdIds) {
      if (!pl.artboard?.guideIndices?.length || !layers.some((l) => l.id === lid && l.artboard)) continue;
      for (const idx of pl.artboard.guideIndices) { const at = guideAt.get(Number(idx)); if (at !== undefined) made[at] = { ...made[at], board: lid }; }
    }
    doc.guides = made;
  }
  const noteList = (psd.annotations ?? []).filter((a) => a.type === 'text' && typeof a.data === 'string' && a.data.trim());
  if (noteList.length) doc.notes = noteList.map((a) => ({ id: uid(), x: Math.max(0, Math.min(psd.width, a.iconLocation.left)), y: Math.max(0, Math.min(psd.height, a.iconLocation.top)), text: a.data as string }));
  if (psd.annotations && psd.annotations.length > noteList.length) notes.push('Sound notes in the PSD were left out.');
  if (!layers.length && psd.canvas) {
    const flat = deepFlat && deepFlat.width === psd.width && deepFlat.height === psd.height ? deepFlat : null;
    layers.push(newLayer('Background', doc, flat ? { raster: rasterFromDeep(flat, bits === 32), channels: flat } : { raster: Raster.from(psd.canvas, psd.width, psd.height) }));
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
export async function writePsdFile(doc: Doc, composite: Surface, psb = false, paths: PathSet | null = null, maximize = true, quickMask: SelectionMask | null = null): Promise<{ bytes: ArrayBuffer; notes: string[] }> {
  const multi = writeMultichannelPsd(doc, psb);
  if (multi) return multi;
  const { writePsd } = await import('ag-psd');
  const notes: string[] = [], linked: LinkedFile[] = [], sources = new Map<ID, { data: Uint8Array; name: string; type: string }>(), psdPatterns: PatternInfo[] = [], own = new Map<PsdLayer, OwnBlock>();
  for (const l of doc.layers) if (l.smart) sources.set(l.id, await embedOf(l, notes));
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
    out.mask = { canvas: mp.c, left: mp.x, top: mp.y, defaultColor: maskEdgeTone(mk.raster), disabled: !mk.enabled, ...(mk.density !== undefined && mk.density < 100 ? { userMaskDensity: mk.density / 100 } : {}), ...(mk.feather ? { userMaskFeather: mk.feather } : {}), ...(l.vectorMask?.density !== undefined && l.vectorMask.density < 100 ? { vectorMaskDensity: l.vectorMask.density / 100 } : {}), ...(l.vectorMask?.feather ? { vectorMaskFeather: l.vectorMask.feather } : {}) };
  };
  const toPsd = (l: Layer): PsdLayer | null => {
    const tag: Pick<PsdLayer, 'layerColor'> = l.label ? { layerColor: l.label } : {};
    if (l.isGroup) return { name: l.name, hidden: !l.visible, opacity: l.opacity, blendMode: groupIsolated(l) ? TO_PSD[l.blend] ?? 'normal' : 'pass through', opened: true, children: build(l.id), ...(effectsPresent(l.effects) ? (() => { const e = toPsdEffects(l.effects as LayerEffects, psdPatterns); return e ? { effects: e } : {}; })() : {}), ...tag, ...toPsdArtboard(l) };
    const keptAdj = !l.adjustment && l.psdAdjustment ? restorePsdAdjustment(l.psdAdjustment) : null;
    if (keptAdj) {
      // An adjustment formvis cannot draw goes back as the file had it.
      const out: PsdLayer = { name: l.name, opacity: l.opacity, ...(l.fill !== undefined && l.fill !== 1 ? { fillOpacity: l.fill } : {}), hidden: !l.visible, blendMode: TO_PSD[l.blend] ?? 'normal', clipping: !!l.clipId, adjustment: keptAdj, ...tag, ...toPsdBlending(l) };
      maskOnto(l, out);
      return out;
    }
    if (l.adjustment) {
      // An adjustment layer goes as a PSD one, live, with its mask, opacity, blend and clipping.
      const adjustment = toPsdAdjustment(l.adjustment);
      if (!adjustment) {
        const held: PsdLayer = { name: l.name, opacity: l.opacity, hidden: !l.visible, blendMode: TO_PSD[l.blend] ?? 'normal', clipping: !!l.clipId, ...tag };
        own.set(held, { key: ADJUSTMENT_KEY, json: { adjustment: l.adjustment } });
        maskOnto(l, held);
        notes.push(`"${l.name}" is a ${ADJUSTMENT_LABELS[l.adjustment.kind]} adjustment, which the PSD format has no adjustment layer for; it is written as an empty layer, and formvis keeps its settings in a block of its own so it opens here as the live adjustment.`);
        return held;
      }
      if (l.adjustment.kind === 'hsv' && hsvFromData(l.adjustment.data as never).colorize && hsvFromData(l.adjustment.data as never).range !== 'Master') notes.push(`"${l.name}" colorizes with a colour range selected; the PSD's Colorize is the Master's, so it is written there.`);
      const out: PsdLayer = { name: l.name, opacity: l.opacity, ...(l.fill !== undefined && l.fill !== 1 ? { fillOpacity: l.fill } : {}), ...(l.locks ? { protected: { transparency: !!(l.locks.all || l.locks.transparency), composite: !!(l.locks.all || l.locks.pixels), position: !!(l.locks.all || l.locks.position) } } : {}), hidden: !l.visible, blendMode: TO_PSD[l.blend] ?? 'normal', clipping: !!l.clipId, adjustment, ...tag, ...toPsdBlending(l) };
      maskOnto(l, out);
      return out;
    }
    const px = l.raster ? placed(l.raster, l.transform) : null;
    if (!px) return { name: l.name, opacity: l.opacity, hidden: !l.visible, blendMode: TO_PSD[l.blend] ?? 'normal', clipping: !!l.clipId, ...tag };


    const out: PsdLayer = { name: l.name, left: px.x, top: px.y, canvas: px.c, opacity: l.opacity, ...(l.fill !== undefined && l.fill !== 1 ? { fillOpacity: l.fill } : {}), ...(l.locks ? { protected: { transparency: !!(l.locks.all || l.locks.transparency), composite: !!(l.locks.all || l.locks.pixels), position: !!(l.locks.all || l.locks.position) } } : {}), hidden: !l.visible, blendMode: TO_PSD[l.blend] ?? 'normal', clipping: !!l.clipId, ...tag, ...toPsdBlending(l) };
    if (effectsPresent(l.effects)) { const e = toPsdEffects(l.effects, psdPatterns); if (e) out.effects = e; }
    out.blendClippendElements = l.blendClipped === true;
    if (l.transparencyShapes === false) out.transparencyShapesLayer = false;
    if (l.blendChannels?.some((on) => !on)) out.channelBlendingRestrictions = l.blendChannels.flatMap((on, i) => (on ? [] : [i]));
    const bv = l.effects?.bevel;
    if (bv?.enabled) {
      const left = [...(bv.contour?.enabled && bv.contour.id !== 'linear' ? ['edge Contour curve'] : []), ...(bv.texture?.enabled && (bv.texture.invert || bv.texture.depth !== 1) ? ['Texture depth and invert'] : [])];
      if (left.length) notes.push(`"${l.name}"'s Bevel & Emboss ${left.join(' and ')} ${left.length > 1 ? 'are' : 'is'} not written to the PSD (the library that writes it has no key for ${left.length > 1 ? 'them' : 'it'}); the bevel keeps the rest.`);
    }
    if (liveText(l) && l.text && l.raster) {
      // Live type goes as PSD point type: anchored where formvis anchors it, on the first line's baseline, the
      // layer's placement carried into the text transform so moved, scaled or rotated type lands the same.
      const t = l.text, r = renderText(t), pm = placement(l.transform, l.raster.width, l.raster.height);
      const ax = t.align === 'center' ? r.raster.width / 2 : t.align === 'right' ? r.raster.width - r.pad : r.pad, at = applyMat(pm, ax * (l.raster.width / r.raster.width), r.baseline * (l.raster.height / r.raster.height));
      const k = Math.hypot(pm[2], pm[3]) * (l.raster.height / r.raster.height) || 1;
      const styleRuns = toPsdStyleRuns(t, k);
      out.text = { ...(styleRuns ? { styleRuns } : {}), text: t.content.replace(/\n/g, '\r'), transform: [pm[0] / k * (l.raster.width / r.raster.width), pm[1] / k * (l.raster.width / r.raster.width), pm[2] / k * (l.raster.height / r.raster.height), pm[3] / k * (l.raster.height / r.raster.height), at.x, at.y],
        style: { font: { name: PS_FONT[t.family] ?? t.family.replace(/\s+/g, '') }, fontSize: t.size * k, fauxBold: t.bold, fauxItalic: t.italic, fillColor: t.color, autoLeading: false, leading: t.size * t.lineHeight * k, tracking: t.tracking, autoKerning: t.kerning !== 'none' },   // tracking and kerning written (36.9), as the reader takes them
        // Justify is the format's justify-left (every line but a paragraph's last spread; that one left); a box is area text.
        antiAlias: t.antialias === 'windows' ? 'platform' : t.antialias === 'windows-lcd' ? 'platformLCD' : t.antialias ?? 'smooth', paragraphStyle: { justification: t.align === 'justify' ? 'justify-left' : t.align }, shapeType: t.box ? 'box' : 'point', ...(t.box ? { boxBounds: [0, 0, t.box.w * k, t.box.h * k] } : {}), ...(t.direction === 'vertical' ? { orientation: 'vertical' } : {}) };
    }
    const embed = l.smart ? sources.get(l.id) : undefined;
    if (l.smart && embed && l.raster) {
      // A smart object goes as a PSD placed layer: its source embedded as PNG, its corners where it sits.
      const live = deformNow(l), mesh = live?.kind === 'mesh' ? live : null, sw = l.smart.source.width, sh = l.smart.source.height, o = mesh?.pad ?? 0, b = mesh?.base;
      const home = b ? [[o, o], [o + sw, o], [o + sw, o + sh], [o, o + sh]].flatMap(([x, y]) => [b[0] * x + b[2] * y + b[4], b[1] * x + b[3] * y + b[5]]) : null;
      const id = guid(), corners = home ?? smartCorners(l).flatMap((q) => [q.x, q.y]);
      linked.push({ id, name: embed.name, type: embed.type, data: embed.data });
      if (l.smart.link) notes.push(`"${l.name}" is linked to ${l.smart.link.name}; the PSD embeds its contents so it stays whole.`);
      out.placedLayer = { id, placed: id, type: 'raster', transform: corners, nonAffineTransform: corners, width: sw, height: sh };
      if (mesh && b && mesh.us.every((u, i) => Math.abs(u - i / (mesh.gw - 1)) < 1e-6) && mesh.vs.every((v, j) => Math.abs(v - j / (mesh.gh - 1)) < 1e-6)) {
        const det = b[0] * b[3] - b[1] * b[2], un = (value: number): UnitsValue => ({ units: 'Pixels', value });
        out.placedLayer.warp = { style: 'custom', value: 0, perspective: 0, perspectiveOther: 0, rotate: 'horizontal', bounds: { top: un(0), left: un(0), bottom: un(sh), right: un(sw) }, uOrder: mesh.gw, vOrder: mesh.gh,
          customEnvelopeWarp: { meshPoints: mesh.points.map(([x, y]) => ({ x: ((x - b[4]) * b[3] - (y - b[5]) * b[2]) / det - o, y: ((y - b[5]) * b[0] - (x - b[4]) * b[1]) / det - o })) } };
      } else if (live) notes.push(`"${l.name}" has a ${live.kind === 'puppet' ? 'Puppet Warp' : live.kind === 'perspective' ? 'Perspective Warp' : 'Warp with uneven grid lines'} that the PSD's smart object cannot hold live; it is written with its pixels and the smart object's corners.`);
      const sf = l.smart.filters, listed = sf.map((f) => toPsdFilter(f, (m) => TO_PSD[m] ?? 'normal')).filter((f): f is NonNullable<typeof f> => f !== null);
      if (sf.length && listed.length < sf.length) own.set(out, { key: SMART_STACK_KEY, json: { filters: sf } });
      if (sf.length && listed.length === sf.length && !l.smart.filterMask) out.placedLayer.filter = { enabled: true, validAtPosition: true, maskEnabled: l.smart.filterMaskEnabled !== false, maskLinked: true, maskExtendWithWhite: false, list: listed };
      else if (sf.some((f) => f.enabled)) notes.push(`"${l.name}" keeps its smart filters applied in its pixels; in the PSD its smart object holds the original without them${l.smart.filterMask ? ' (a filter mask is not written)' : listed.length < sf.length ? ' (the PSD stack holds only filters it has a record for; formvis keeps the whole stack in a block of its own, so the filters stay editable when formvis opens the file again)' : ''}.`);
    }
    const v = l.vector, t = l.transform;
    if (v && l.raster) {
      // A shape layer goes as a PSD shape: its path as a vector mask, with its fill and stroke, beside its pixels.
      // A move keeps the path exact; a scale, rotation or flip carries the placement into the outline's points.
      {
        const moved = t.rotation === 0 && !t.flipX && !t.flipY && Math.abs(t.w - l.raster.width) < 1e-6 && Math.abs(t.h - l.raster.height) < 1e-6;
        const m = placement(t, l.raster.width, l.raster.height), rgb = (c: { r: number; g: number; b: number }) => ({ r: c.r, g: c.g, b: c.b });
        const at = (x: number, y: number): Pt => { const q = applyMat(m, x - v.origin.x, y - v.origin.y); return { x: q.x, y: q.y }; };
        const subpaths = moved ? v.path.subpaths : v.path.subpaths.map((sp) => ({ ...sp, anchors: sp.anchors.map((a) => { const p = at(a.x, a.y), i = at(a.inX, a.inY), o = at(a.outX, a.outY); return { x: p.x, y: p.y, inX: i.x, inY: i.y, outX: o.x, outY: o.y }; }) }));
        const k = moved ? 1 : Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
        // formvis fills by the nonzero rule, so an outline wound against the largest one is a hole; the PSD says so with
        // the subtract operation.
        out.vectorMask = { paths: psdOutlines(subpaths, moved ? t.x - v.origin.x : 0, moved ? t.y - v.origin.y : 0) };
        // A shape's gradient (fill or stroke) is the format's gradient content; its stops carry their alpha as opacity stops.
        const gradientContent = (g: ShapeGradient): VectorContent => ({ type: 'solid', name: 'formvis', colorStops: g.stops.map((s) => ({ color: rgb(s.color), location: s.at, midpoint: 0.5 })), opacityStops: g.stops.map((s) => ({ opacity: s.alpha ?? 1, location: s.at, midpoint: 0.5 })),
          style: g.type, angle: g.angle ? -g.angle : 0, scale: 1, reverse: false, dither: false, align: true, offset: { x: 0, y: 0 } });
        const fg = v.fill && v.gradient && v.gradient.stops.length >= 2 ? v.gradient : null, sg = v.stroke?.gradient && v.stroke.gradient.stops.length >= 2 ? v.stroke.gradient : null;
        // A pattern fill or stroke is the format's pattern content, the library pattern added under a GUID (resampled when drawn at another scale).
        const patternOf = (p: ShapePattern | null | undefined): VectorContent | null => { const info = p ? (p.scale && p.scale !== 1 ? scaledPsdPattern(p.id, p.scale, psdPatterns) : psdPattern(p.id, psdPatterns)) : null; return info ? { type: 'pattern', name: info.name, id: info.id, phase: { x: 0, y: 0 } } : null; };
        const fp = v.fill && !fg ? patternOf(v.pattern) : null, sp = v.stroke && !sg ? patternOf(v.stroke.pattern) : null, sk = v.stroke;
        out.vectorFill = fg ? gradientContent(fg) : fp ?? { type: 'color', color: rgb(v.fill ?? v.stroke?.color ?? { r: 0, g: 0, b: 0 }) };
        out.vectorStroke = { strokeEnabled: !!sk, fillEnabled: !!v.fill, lineWidth: { units: 'Pixels', value: (v.stroke?.width ?? 1) * k }, lineCapType: sk?.cap ?? 'round', lineJoinType: sk?.join ?? 'round', lineAlignment: sk?.align ?? 'center', ...(sk?.miter ? { miterLimit: sk.miter } : {}), ...(sk?.opacity !== undefined && sk.opacity < 1 ? { opacity: Math.max(0, sk.opacity) } : {}), content: sg ? gradientContent(sg) : sp ?? { type: 'color', color: rgb(v.stroke?.color ?? v.fill ?? { r: 0, g: 0, b: 0 }) } };
        if ((v.fill && v.pattern && !fp) || (v.stroke?.pattern && !sp)) notes.push(`"${l.name}"'s pattern fill or stroke names a pattern the project no longer has, so the PSD shape keeps its colour.`);
        if (sk && (sk.dash && sk.dash !== 'solid' || sk.dashes?.length)) notes.push(`"${l.name}"'s dashed stroke is written solid; the PSD shape's dash record is not written yet.`);
      }
    }
    const vm = l.vectorMask;
    if (vm && !v && l.fillContent && l.fillContent.kind !== 'solid' && vm.path.subpaths.some((sp) => sp.anchors.length)) {
      // A gradient or pattern fill behind a vector mask is a PSD shape: the outlines and the fill, the pixels cut by the mask.
      const paths = psdOutlines(vm.path.subpaths, 0, 0), cov = vm.enabled ? vectorCoverage(vm, doc.width, doc.height) : null;
      out.vectorMask = { paths, ...(vm.inverted ? { invert: true } : {}), ...(vm.linked ? {} : { notLink: true }), ...(vm.enabled ? {} : { disable: true }) };
      if (cov) {
        const g = px.c.getContext('2d') as CanvasRenderingContext2D;
        g.globalCompositeOperation = 'destination-in';
        g.drawImage(cov.surface as CanvasImageSource, -px.x, -px.y);
        g.globalCompositeOperation = 'source-over';
      }
    } else if (vm && !v && !l.fillContent) {
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
  if (metaWritable(doc.meta)) psd.imageResources = { ...(psd.imageResources ?? {}), xmpMetadata: buildMergedXmp(doc.meta) };   // kept beside the layer comps   // File Info (29.2) as the XMP image resource
  if (doc.pixelAspect && doc.pixelAspect !== 1) psd.imageResources = { ...(psd.imageResources ?? {}), pixelAspectRatio: { aspect: doc.pixelAspect } };   // Pixel Aspect Ratio (35.4 part b)
  const ppi = doc.resolution && doc.resolution >= 1 && doc.resolution <= 65535 ? doc.resolution : 72;   // image resource 1005
  psd.imageResources = { ...(psd.imageResources ?? {}), resolutionInfo: { horizontalResolution: ppi, horizontalResolutionUnit: 'PPI', widthUnit: 'Inches', verticalResolution: ppi, verticalResolutionUnit: 'PPI', heightUnit: 'Inches' } };
  const guideList = (doc.guides ?? []).filter((g) => Number.isFinite(g.at) && g.at >= 0);
  if (guideList.length) psd.imageResources = { ...(psd.imageResources ?? {}), gridAndGuidesInformation: { guides: guideList.map((g) => ({ location: Math.round(g.at * 2) / 2, direction: g.axis === 'y' ? 'horizontal' as const : 'vertical' as const })) } };   // 1032, in pixels
  // An artboard's own guides: its artboard data lists their places in the file's guide list.
  guideList.forEach((g, i) => { const ab = g.board ? built.get(g.board)?.artboard : undefined; if (ab) (ab.guideIndices ??= []).push(i); });
  const noteList = (doc.notes ?? []).filter((n) => n.text.trim());
  if (noteList.length) psd.annotations = noteList.map((n) => ({ type: 'text' as const, open: false, iconLocation: { left: Math.round(n.x), top: Math.round(n.y), right: Math.round(n.x) + 18, bottom: Math.round(n.y) + 18 }, popupLocation: { left: Math.round(n.x) + 20, top: Math.round(n.y), right: Math.round(n.x) + 220, bottom: Math.round(n.y) + 120 }, color: { r: 255, g: 220, b: 0 }, author: '', name: '', date: '', data: n.text }));   // text notes (Anno)
  if (doc.globalLight) psd.imageResources = { ...(psd.imageResources ?? {}), globalAngle: Math.round(doc.globalLight.angle), globalAltitude: Math.round(doc.globalLight.altitude) };   // 1037 and 1049
  let icc: Uint8Array | null = null;
  try { icc = doc.profile ? fromBase64(doc.profile.icc) : null; } catch { notes.push('The document\'s colour profile could not be read, so the PSD carries none.'); }
  const alphas = quickMask ? [...(doc.alphas ?? []).filter((a) => !/^quick mask$/i.test(a.name)), { id: 'quick-mask', name: 'Quick Mask', mask: quickMask, color: { r: 255, g: 0, b: 0 }, opacity: 50, indicates: 'masked' as const }] : doc.alphas ?? [];
  if (alphas.length > 50) notes.push('A PSD holds at most 56 channels; the alpha channels after the first 50 are left out.');
  const exif = metaWritable(doc.meta) ? exifBlockOf(doc.meta) : null;
  const withExif = (bytes: ArrayBuffer): ArrayBuffer => (exif && exif.length <= 64000 ? addResourceBytes(bytes, resourceBlock(1058, '', exif)) : bytes);   // image resource 1058, the Exif block
  return { bytes: withExif(addExtraChannels(addIccResource(addPathResources(addLayerBlocks(writePsd(psd, { generateThumbnail: maximize, psb }), psd.children ?? [], own), paths, doc.width, doc.height), icc), alphas)), notes };
}
