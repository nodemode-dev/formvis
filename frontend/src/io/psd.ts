import type { BlendMode as PsdBlend, Layer as PsdLayer, LayerEffectsInfo, LinkedFile, PatternInfo, Psd, UnitsValue } from 'ag-psd';
import {
  Raster, boundsOf, docTransform, effectsActive, integral, liveText, newLayer, placement, applyMat, uid, type BlendMode, type Doc, type ID, type Layer, type Surface, invert, mul, toBlob, type Pt, defaultEffects, patternById, addPattern, projectPatterns, createSurface, ctxOf, type LayerEffects, renderText, textKey, TEXT_FONTS, type TextSpec, ADJUSTMENT_LABELS,
} from '../engine';
import { fromPsdAdjustment, toPsdAdjustment } from './psd-adjust';
import { windingArea } from '../engine/custom-shapes';
import { addPathResources, readPathResources } from './psd-paths';
import type { PathSet, SubPath } from '../engine/paths';
import { maskEdgeTone } from '../engine/distort';

/** Layered PSD files, read and written with ag-psd (MIT). Pixel layers keep their position, opacity, blend mode and
 *  visibility, folders become groups and back, layer masks and clipping carry across, and the flattened image goes in
 *  as the composite for readers that ignore layers. What PSD stores in forms sonny does not write yet, layer styles,
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

export const isPsdFile = (f: File): boolean => /\.ps[db]$/i.test(f.name) || f.type === 'image/vnd.adobe.photoshop';

const canvas = (w: number, h: number): HTMLCanvasElement => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };

/** A PSD's layers as a sonny document, bottom to top as in the file, with notes on anything left out. */
/** A GUID, which Photoshop requires for a placed layer's id. */
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

/** A smart object's embedded contents as pixels: an image decoded directly, or a Photoshop document by its composite. */
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

const BEVEL_TO: Record<LayerEffects['bevel']['style'], 'inner bevel' | 'outer bevel' | 'emboss' | 'pillow emboss'> = { inner: 'inner bevel', outer: 'outer bevel', emboss: 'emboss', pillow: 'pillow emboss' };

/** A sonny layer style as Photoshop layer effects: each enabled effect in Photoshop's own terms. A pattern used by
 *  Pattern Overlay travels in the PSD's patterns, under a GUID. */
function toPsdEffects(fx: LayerEffects, patterns: PatternInfo[]): LayerEffectsInfo | null {
  const px = (value: number): UnitsValue => ({ units: 'Pixels', value }), bm = (m: BlendMode): PsdBlend => TO_PSD[m] ?? 'normal', on = { enabled: true, present: true, showInDialog: true };
  const e: LayerEffectsInfo = {};
  const d = fx.dropShadow, is = fx.innerShadow, g = fx.outerGlow, ig = fx.innerGlow, k = fx.stroke, co = fx.colorOverlay, go = fx.gradientOverlay, sa = fx.satin, bv = fx.bevel, po = fx.patternOverlay;
  if (d.enabled) e.dropShadow = [{ ...on, color: d.color, opacity: d.opacity, blendMode: bm(d.blend), angle: d.angle, distance: px(d.distance), size: px(d.size), useGlobalLight: false }];
  if (is.enabled) e.innerShadow = [{ ...on, color: is.color, opacity: is.opacity, blendMode: bm(is.blend), angle: is.angle, distance: px(is.distance), size: px(is.size), useGlobalLight: false }];
  if (g.enabled) e.outerGlow = { ...on, color: g.color, opacity: g.opacity, blendMode: bm(g.blend), size: px(g.size) };
  if (ig.enabled) e.innerGlow = { ...on, color: ig.color, opacity: ig.opacity, blendMode: bm(ig.blend), size: px(ig.size), source: 'edge' };
  if (k.enabled) e.stroke = [{ ...on, position: 'outside', fillType: 'color', color: k.color, opacity: k.opacity, blendMode: 'normal', size: px(k.size) }];
  if (co.enabled) e.solidFill = [{ ...on, color: co.color, opacity: co.opacity, blendMode: bm(co.blend) }];
  if (go.enabled) e.gradientOverlay = [{ ...on, opacity: go.opacity, blendMode: bm(go.blend), type: go.style, angle: go.angle, scale: go.scale, reverse: go.reverse, align: true,
    gradient: { name: 'sonny', type: 'solid', colorStops: [{ color: go.from, location: 0, midpoint: 0.5 }, { color: go.to, location: 1, midpoint: 0.5 }], opacityStops: [{ opacity: 1, location: 0, midpoint: 0.5 }, { opacity: 1, location: 1, midpoint: 0.5 }] } }];
  if (sa.enabled) e.satin = { ...on, color: sa.color, opacity: sa.opacity, blendMode: bm(sa.blend), angle: sa.angle, distance: px(sa.distance), size: px(sa.size), invert: sa.invert };
  if (bv.enabled) e.bevel = { ...on, style: BEVEL_TO[bv.style], technique: 'smooth', strength: bv.depth / 100, direction: bv.down ? 'down' : 'up', size: px(bv.size), soften: px(bv.soften), angle: bv.angle, altitude: bv.altitude, useGlobalLight: false,
    highlightColor: bv.highlight, highlightOpacity: bv.highlightOpacity, highlightBlendMode: bm(bv.highlightBlend), shadowColor: bv.shadow, shadowOpacity: bv.shadowOpacity, shadowBlendMode: bm(bv.shadowBlend) };
  const pat = po.enabled ? patternById(po.pattern) : null;
  if (pat) {
    let info = patterns.find((x) => x.name === pat.name && (x as PatternInfo & { sonny?: string }).sonny === pat.id);
    if (!info) {
      const w = pat.surface.width, h = pat.surface.height, rgba = ctxOf(pat.surface).getImageData(0, 0, w, h).data;
      info = { name: pat.name, id: guid(), x: 0, y: 0, bounds: { x: 0, y: 0, w, h }, data: new Uint8Array(rgba) };
      (info as PatternInfo & { sonny?: string }).sonny = pat.id;
      patterns.push(info);
    }
    e.patternOverlay = { ...on, opacity: po.opacity, blendMode: bm(po.blend), scale: po.scale, pattern: { name: info.name, id: info.id }, align: true };
  }
  return Object.keys(e).length ? e : null;
}

/** Photoshop layer effects as a sonny layer style, noting what sonny does not have. */
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
    if (list.length > 1) notes.push(`"${name}" has more than one ${what}; sonny kept the first.`);
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
    if ((k.position && k.position !== 'outside') || (k.fillType && k.fillType !== 'color')) notes.push(`"${name}" has a Photoshop stroke sonny draws as an outside colour stroke.`);
  }
  const co = first(info.solidFill, 'Color Overlay');
  if (co) fx.colorOverlay = { enabled: on(co), color: col(co.color, fx.colorOverlay.color), opacity: op(co.opacity, 1), blend: bm(co.blendMode, 'normal') };
  const go = first(info.gradientOverlay, 'Gradient Overlay');
  if (go) {
    const stops = go.gradient && 'colorStops' in go.gradient ? go.gradient.colorStops : [];
    fx.gradientOverlay = { enabled: on(go), from: col(stops[0]?.color, fx.gradientOverlay.from), to: col(stops[stops.length - 1]?.color, fx.gradientOverlay.to), opacity: op(go.opacity, 1), blend: bm(go.blendMode, 'normal'),
      angle: go.angle ?? 90, style: go.type === 'radial' ? 'radial' : 'linear', scale: Math.max(0.1, Math.min(1.5, go.scale ?? 1)), reverse: !!go.reverse };
    if (stops.length > 2 || (go.type && go.type !== 'linear' && go.type !== 'radial')) notes.push(`"${name}" has a Photoshop gradient sonny simplifies to two colours, linear or radial.`);
  }
  const sa = info.satin;
  if (sa) fx.satin = { enabled: on(sa), color: col(sa.color, fx.satin.color), opacity: op(sa.opacity, 0.5), blend: bm(sa.blendMode, 'multiply'), angle: sa.angle ?? 19, distance: px(sa.distance, 11), size: px(sa.size, 14), invert: sa.invert !== false };
  const bv = info.bevel;
  if (bv) {
    const style = bv.style === 'outer bevel' ? 'outer' : bv.style === 'emboss' ? 'emboss' : bv.style === 'pillow emboss' ? 'pillow' : 'inner';
    fx.bevel = { enabled: on(bv), style, depth: Math.max(1, Math.min(1000, Math.round((bv.strength ?? 1) * 100))), down: bv.direction === 'down', size: px(bv.size, 5), soften: px(bv.soften, 0), angle: bv.angle ?? 120, altitude: bv.altitude ?? 30,
      highlight: col(bv.highlightColor, fx.bevel.highlight), highlightOpacity: op(bv.highlightOpacity, 0.75), highlightBlend: bm(bv.highlightBlendMode, 'screen'), shadow: col(bv.shadowColor, fx.bevel.shadow), shadowOpacity: op(bv.shadowOpacity, 0.75), shadowBlend: bm(bv.shadowBlendMode, 'multiply') };
    if ((bv.technique && bv.technique !== 'smooth') || bv.style === 'stroke emboss') notes.push(`"${name}" has a Photoshop bevel sonny draws with its smooth technique.`);
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
    } else notes.push(`"${name}" uses a Photoshop pattern the file does not include; sonny shows Checker in its place.`);
    fx.patternOverlay = { enabled: on(po), pattern: id, opacity: op(po.opacity, 1), blend: bm(po.blendMode, 'normal'), scale: Math.max(0.1, Math.min(10, po.scale ?? 1)) };
  }
  if (info.disabled) { notes.push(`"${name}" has its Photoshop layer style switched off; sonny opened it switched off.`); return null; }
  return effectsActive(fx) ? fx : null;
}

/** Photoshop's PostScript names for sonny's type families; bold and italic travel as Photoshop's faux styles. */
const PS_FONT: Record<string, string> = { Inter: 'Inter-Regular', Arial: 'ArialMT', Helvetica: 'Helvetica', Georgia: 'Georgia', 'Times New Roman': 'TimesNewRomanPSMT', 'Courier New': 'CourierNewPSMT', Verdana: 'Verdana', 'Trebuchet MS': 'TrebuchetMS', Impact: 'Impact', serif: 'TimesNewRomanPSMT', 'sans-serif': 'ArialMT', monospace: 'CourierNewPSMT' };

/** The sonny family a Photoshop font name belongs to, by its PostScript name or its family part. */
function familyOf(psName: string): { family: string; bold: boolean; italic: boolean } {
  const known = Object.entries(PS_FONT).find(([fam, ps]) => ps === psName && fam !== 'serif' && fam !== 'sans-serif' && fam !== 'monospace');
  const bare = psName.replace(/-(Bold|Italic|BoldItalic|Regular|Oblique|BoldOblique)?(MT|PSMT)?$/i, '').replace(/(PSMT|MT)$/, '');
  const guess = TEXT_FONTS.find((f) => f.replace(/\s+/g, '').toLowerCase() === bare.replace(/\s+/g, '').toLowerCase());
  return { family: known?.[0] ?? guess ?? psName, bold: /bold/i.test(psName), italic: /italic|oblique/i.test(psName) };
}

export async function readPsdFile(file: File): Promise<{ doc: Doc; notes: string[]; activeId: ID | null; paths: PathSet | null }> {
  const { readPsd } = await import('ag-psd');
  const buffer = await file.arrayBuffer();
  const psd = readPsd(buffer, { skipThumbnail: true });
  // Smart objects' embedded contents, decoded before the layers are built.
  const contents = new Map<string, Raster | null>();
  for (const lf of psd.linkedFiles ?? []) if (lf.data) contents.set(lf.id, await decodeLinked(lf.data, readPsd));
  const doc: Doc = { id: uid(), width: psd.width, height: psd.height, resolution: 72, layers: [] };
  const layers: Layer[] = [], notes: string[] = [];
  const walk = (children: PsdLayer[] | undefined, parentId: ID | null): void => {
    let base: Layer | null = null;
    for (const pl of children ?? []) {
      const name = pl.name || 'Layer', blend = (pl.blendMode && FROM_PSD.get(pl.blendMode)) ?? 'normal';
      if (pl.children) {
        const group = newLayer(name, doc, { isGroup: true, parentId, visible: !pl.hidden, opacity: pl.opacity ?? 1 });
        walk(pl.children, group.id);
        layers.push(group); // after its children, where sonny keeps a folder's entry
        base = null;
        continue;
      }
      if (pl.blendMode && !FROM_PSD.has(pl.blendMode) && pl.blendMode !== 'pass through') notes.push(`"${name}" uses ${pl.blendMode}, which sonny does not have; it opened as Normal.`);
      const adj = pl.adjustment ? fromPsdAdjustment(pl.adjustment) : null;
      if (pl.adjustment && !adj) { notes.push(`"${name}" is a ${pl.adjustment.type} adjustment, which sonny does not have; sonny left it out.`); continue; }
      if (!adj && (!pl.canvas || !pl.canvas.width || !pl.canvas.height)) continue;
      const w = pl.canvas?.width ?? 0, h = pl.canvas?.height ?? 0, raster = adj || !pl.canvas ? null : Raster.from(pl.canvas, w, h);
      // An adjustment layer opens as sonny's own, live, with its mask, opacity, blend and clipping.
      const layer = adj ? newLayer(name, doc, { adjustment: adj, parentId, visible: !pl.hidden, opacity: pl.opacity ?? 1, blend })
        : newLayer(name, doc, { raster, parentId, transform: { ...docTransform(w, h), x: pl.left ?? 0, y: pl.top ?? 0 }, visible: !pl.hidden, opacity: pl.opacity ?? 1, blend });
      const mk = pl.mask;
      if (mk?.canvas && mk.canvas.width && mk.canvas.height) {
        // PSD masks are grey; sonny's are white with the level in alpha.
        const mw = mk.canvas.width, mh = mk.canvas.height, grey = mk.canvas.getContext('2d')?.getImageData(0, 0, mw, mh);
        if (grey) {
          const img = new ImageData(mw, mh);
          for (let i = 0; i < img.data.length; i += 4) { img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = grey.data[i]; }
          const mr = new Raster(mw, mh);
          mr.write(img);
          layer.mask = { raster: mr, enabled: !mk.disabled, linked: true, placement: { ...docTransform(mw, mh), x: mk.left ?? 0, y: mk.top ?? 0 } };
        }
      }
      const vm = pl.vectorMask, vf = pl.vectorFill, vs = pl.vectorStroke;
      if (vm?.paths?.length && (vf?.type === 'color' || vs?.strokeEnabled)) {
        // A Photoshop shape opens as a sonny shape layer: its pixels as saved, its outline editable again.
        const col = (c: unknown): { r: number; g: number; b: number } | null => {
          const o = c as Record<string, number> | null;
          if (!o) return null;
          if (typeof o.r === 'number') return { r: o.r, g: o.g, b: o.b };
          if (typeof o.fr === 'number') return { r: Math.round(o.fr * 255), g: Math.round(o.fg * 255), b: Math.round(o.fb * 255) };
          return null;
        };
        const path = { subpaths: vm.paths.map((bp) => ({ closed: !bp.open, anchors: bp.knots.map((k) => ({ inX: k.points[0], inY: k.points[1], x: k.points[2], y: k.points[3], outX: k.points[4], outY: k.points[5] })) })).filter((sp) => sp.anchors.length) };
        // A subtract outline cuts a hole: wound against the combined ones, as the nonzero rule sonny fills by needs.
        const ops = vm.paths.filter((bp) => bp.knots.length).map((bp) => bp.operation ?? 'combine');
        const mainArea = path.subpaths.reduce((m, sp, i) => (ops[i] !== 'subtract' && sp.closed && Math.abs(windingArea(sp.anchors)) > Math.abs(m) ? windingArea(sp.anchors) : m), 0);
        path.subpaths.forEach((sp, i) => {
          if (ops[i] !== 'subtract' || !sp.closed || !mainArea || Math.sign(windingArea(sp.anchors)) !== Math.sign(mainArea)) return;
          sp.anchors = sp.anchors.slice().reverse().map((a) => ({ x: a.x, y: a.y, inX: a.outX, inY: a.outY, outX: a.inX, outY: a.inY }));
        });
        const fill = vs?.fillEnabled === false || vf?.type !== 'color' ? null : col(vf.color);
        const sc = vs?.strokeEnabled && vs.content?.type === 'color' ? col(vs.content.color) : null;
        const stroke = sc ? { color: sc, width: vs?.lineWidth?.value ?? 1 } : null;
        if (path.subpaths.length && (fill || stroke)) layer.vector = { path, fill, stroke, origin: { x: pl.left ?? 0, y: pl.top ?? 0 } };
        // Photoshop's path operations kept as sonny's (subtract outlines were also wound against the rest above).
        path.subpaths.forEach((sp, i) => { const op = ops[i]; if (op === 'subtract' || op === 'intersect' || op === 'exclude') (sp as SubPath).op = op; });
      }
      const plc = pl.placedLayer;
      if (plc) {
        // A Photoshop smart object opens as a sonny one: its contents the source, its corners the warp, its pixels as
        // Photoshop saved them until it is next re-rendered.
        const source = contents.get(plc.id) ?? null, t8 = plc.nonAffineTransform ?? plc.transform;
        if (source && t8?.length === 8 && t8.every((v) => Number.isFinite(v))) {
          layer.smart = { source, filters: [], warp: [0, 2, 4, 6].map((k) => ({ x: t8[k], y: t8[k + 1] })), warpAt: layer.transform };
          if (plc.filter) notes.push(`"${name}" has Photoshop smart filters; they stay applied in its pixels and are not editable here.`);
        } else notes.push(`"${name}" is a smart object whose contents sonny cannot read; it opened as pixels.`);
      }
      const tx = pl.text;
      if (tx && typeof tx.text === 'string' && raster) {
        // Photoshop type opens as editable sonny type: Photoshop's pixels until it is edited, then sonny's.
        const st = tx.style ?? {}, m = tx.transform ?? [1, 0, 0, 1, 0, 0], scale = Math.hypot(m[2] ?? 0, m[3] ?? 1) || 1, face = familyOf(st.font?.name ?? 'ArialMT');
        const col = st.fillColor as Record<string, number> | undefined, just = tx.paragraphStyle?.justification;
        const size = Math.max(1, Math.round((st.fontSize ?? 12) * scale * 100) / 100);
        const spec: TextSpec = { content: tx.text.replace(/\r/g, '\n'), family: face.family, size, color: col && typeof col.r === 'number' ? { r: Math.round(col.r), g: Math.round(col.g), b: Math.round(col.b) } : col && typeof col.fr === 'number' ? { r: Math.round(col.fr * 255), g: Math.round(col.fg * 255), b: Math.round(col.fb * 255) } : { r: 0, g: 0, b: 0 },
          align: just === 'center' || just === 'right' ? just : 'left', bold: !!st.fauxBold || face.bold, italic: !!st.fauxItalic || face.italic, lineHeight: st.autoLeading === false && st.leading ? Math.round((st.leading * scale / size) * 100) / 100 : 1.2 };
        layer.text = { ...spec, rendered: textKey(raster) };
        if ((tx.styleRuns?.length ?? 0) > 1) notes.push(`"${name}" mixes type styles; sonny keeps the first for the whole text.`);
        const warped = !!tx.warp?.style && tx.warp.style !== 'none';
        if (tx.shapeType === 'box' || warped) notes.push(`"${name}" is ${warped ? 'warped' : 'paragraph'} type in Photoshop; sonny edits it as plain point type.`);
      }
      if (pl.effects) { const fx = fromPsdEffects(pl.effects, psd.patterns, name, notes); if (fx) layer.effects = fx; }
      if (pl.clipping && base) layer.clipId = base.id;
      else base = layer;
      layers.push(layer);
    }
  };
  walk(psd.children, null);
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
  return { doc: { ...doc, layers }, notes, activeId: layers.at(-1)?.id ?? null, paths };
}

/** The document as a layered PSD, with notes on what it could not carry. */
export async function writePsdFile(doc: Doc, composite: Surface, psb = false, paths: PathSet | null = null): Promise<{ bytes: ArrayBuffer; notes: string[] }> {
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
  /** The layer's mask on `out`, as Photoshop's grey mask placed on the canvas. */
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
    if (l.isGroup) return { name: l.name, hidden: !l.visible, opacity: l.opacity, blendMode: 'pass through', opened: true, children: build(l.id) };
    if (l.adjustment) {
      // An adjustment layer goes as Photoshop's, live, with its mask, opacity, blend and clipping.
      const adjustment = toPsdAdjustment(l.adjustment);
      if (!adjustment) { notes.push(`"${l.name}" is a ${ADJUSTMENT_LABELS[l.adjustment.kind]} adjustment, which Photoshop has no adjustment layer for; it is left out of the PSD.`); return null; }
      if (l.adjustment.kind === 'hsv' && (l.adjustment.data as { colorize?: unknown }).colorize === true) notes.push(`"${l.name}" uses Colorize, which the PSD's Hue/Saturation layer does not carry from sonny.`);
      const out: PsdLayer = { name: l.name, opacity: l.opacity, hidden: !l.visible, blendMode: TO_PSD[l.blend] ?? 'normal', clipping: !!l.clipId, adjustment };
      maskOnto(l, out);
      return out;
    }
    if (!l.raster) return null;
    const px = placed(l.raster, l.transform);
    if (!px) return null;


    const out: PsdLayer = { name: l.name, left: px.x, top: px.y, canvas: px.c, opacity: l.opacity, hidden: !l.visible, blendMode: TO_PSD[l.blend] ?? 'normal', clipping: !!l.clipId };
    if (effectsActive(l.effects)) { const e = toPsdEffects(l.effects, psdPatterns); if (e) out.effects = e; }
    if (liveText(l) && l.text && l.raster) {
      // Live type goes as Photoshop point type: anchored where sonny anchors it, on the first line's baseline, the
      // layer's placement carried into the text transform so moved, scaled or rotated type lands the same.
      const t = l.text, r = renderText(t), pm = placement(l.transform, l.raster.width, l.raster.height);
      const ax = t.align === 'center' ? r.raster.width / 2 : t.align === 'right' ? r.raster.width - r.pad : r.pad, at = applyMat(pm, ax * (l.raster.width / r.raster.width), r.baseline * (l.raster.height / r.raster.height));
      const k = Math.hypot(pm[2], pm[3]) * (l.raster.height / r.raster.height) || 1;
      out.text = { text: t.content.replace(/\n/g, '\r'), transform: [pm[0] / k * (l.raster.width / r.raster.width), pm[1] / k * (l.raster.width / r.raster.width), pm[2] / k * (l.raster.height / r.raster.height), pm[3] / k * (l.raster.height / r.raster.height), at.x, at.y],
        style: { font: { name: PS_FONT[t.family] ?? t.family.replace(/\s+/g, '') }, fontSize: t.size * k, fauxBold: t.bold, fauxItalic: t.italic, fillColor: t.color, autoLeading: false, leading: t.size * t.lineHeight * k },
        paragraphStyle: { justification: t.align }, shapeType: 'point' };
    }
    const embed = l.smart ? sources.get(l.id) : undefined;
    if (l.smart && embed && l.raster) {
      // A smart object goes as a Photoshop placed layer: its source embedded as PNG, its corners where it sits.
      const id = guid(), corners = smartCorners(l).flatMap((q) => [q.x, q.y]);
      linked.push({ id, name: `${l.name || 'Smart Object'}.png`, type: 'png ', data: embed });
      out.placedLayer = { id, placed: id, type: 'raster', transform: corners, nonAffineTransform: corners, width: l.smart.source.width, height: l.smart.source.height };
      if (l.smart.filters.some((f) => f.enabled)) notes.push(`"${l.name}" keeps its smart filters applied in its pixels; in Photoshop its smart object holds the original without them.`);
    }
    const v = l.vector, t = l.transform;
    if (v && l.raster) {
      // A shape layer goes as a Photoshop shape: its path as a vector mask, with its fill and stroke, beside its pixels.
      // Only a move keeps the path exact; after a scale, rotation or flip it goes as pixels.
      const moved = t.rotation === 0 && !t.flipX && !t.flipY && Math.abs(t.w - l.raster.width) < 1e-6 && Math.abs(t.h - l.raster.height) < 1e-6;
      if (moved) {
        const dx = t.x - v.origin.x, dy = t.y - v.origin.y, rgb = (c: { r: number; g: number; b: number }) => ({ r: c.r, g: c.g, b: c.b });
        // sonny fills by the nonzero rule, so an outline wound against the largest one is a hole; Photoshop says so with
        // the subtract operation.
        const live = v.path.subpaths.filter((sp) => sp.anchors.length), areas = live.map((sp) => (sp.closed ? windingArea(sp.anchors) : 0));
        const main = areas.reduce((m, a) => (Math.abs(a) > Math.abs(m) ? a : m), 0);
        out.vectorMask = { paths: live.map((sp, i) => ({
          open: !sp.closed, operation: sp.op && sp.op !== 'combine' ? sp.op : sp.closed && main && Math.sign(areas[i]) === -Math.sign(main) ? 'subtract' as const : 'combine' as const, fillRule: 'non-zero' as const,
          knots: sp.anchors.map((a) => ({ linked: Math.abs((a.outX - a.x) * (a.inY - a.y) - (a.outY - a.y) * (a.inX - a.x)) < 1e-6 && (a.outX !== a.x || a.outY !== a.y), points: [a.inX + dx, a.inY + dy, a.x + dx, a.y + dy, a.outX + dx, a.outY + dy] })),
        })) };
        out.vectorFill = { type: 'color', color: rgb(v.fill ?? v.stroke?.color ?? { r: 0, g: 0, b: 0 }) };
        out.vectorStroke = { strokeEnabled: !!v.stroke, fillEnabled: !!v.fill, lineWidth: { units: 'Pixels', value: v.stroke?.width ?? 1 }, lineCapType: 'round', lineJoinType: 'round', lineAlignment: 'center', content: { type: 'color', color: rgb(v.stroke?.color ?? v.fill ?? { r: 0, g: 0, b: 0 }) } };
      } else notes.push(`"${l.name}" goes as pixels; after a scale, rotation or flip the PSD cannot keep it as a shape.`);
    }
    maskOnto(l, out);
    return out;
  };
  const build = (parentId: ID | null): PsdLayer[] => doc.layers.filter((l) => l.parentId === parentId).map(toPsd).filter((x): x is PsdLayer => x !== null);
  const flat = canvas(doc.width, doc.height);
  (flat.getContext('2d') as CanvasRenderingContext2D).drawImage(composite as CanvasImageSource, 0, 0);
  const psd: Psd = { width: doc.width, height: doc.height, children: build(null), canvas: flat };
  if (linked.length) psd.linkedFiles = linked;
  if (psdPatterns.length) psd.patterns = psdPatterns;
  return { bytes: addPathResources(writePsd(psd, { generateThumbnail: false, psb }), paths, doc.width, doc.height), notes };
}
