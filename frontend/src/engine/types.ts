import type { Raster } from './surface';
import { isContour, type ContourId, type GlobalLight } from './style-extras';

export type ID = string;
export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }
export interface RGB { r: number; g: number; b: number }

export type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'difference'
  | 'color-dodge' | 'color-burn' | 'hue' | 'saturation' | 'color' | 'luminosity'
  | 'linear-dodge' | 'soft-light' | 'hard-light' | 'exclusion'
  | 'dissolve' | 'linear-burn' | 'darker-color' | 'lighter-color' | 'vivid-light' | 'linear-light' | 'pin-light' | 'hard-mix' | 'subtract' | 'divide';

/** Photoshop's menu order, all 27 of its layer modes, grouped darken, lighten, contrast, inversion, component.
 *  Linear Dodge (Add) is the canvas's `lighter`; the ten the canvas lacks are blended per pixel (`blend.ts`). */
export const BLEND_MODES: ReadonlyArray<{ id: BlendMode; label: string }> = [
  { id: 'normal', label: 'Normal' }, { id: 'dissolve', label: 'Dissolve' },
  { id: 'darken', label: 'Darken' }, { id: 'multiply', label: 'Multiply' }, { id: 'color-burn', label: 'Color Burn' }, { id: 'linear-burn', label: 'Linear Burn' }, { id: 'darker-color', label: 'Darker Color' },
  { id: 'lighten', label: 'Lighten' }, { id: 'screen', label: 'Screen' }, { id: 'color-dodge', label: 'Color Dodge' }, { id: 'linear-dodge', label: 'Linear Dodge (Add)' }, { id: 'lighter-color', label: 'Lighter Color' },
  { id: 'overlay', label: 'Overlay' }, { id: 'soft-light', label: 'Soft Light' }, { id: 'hard-light', label: 'Hard Light' }, { id: 'vivid-light', label: 'Vivid Light' }, { id: 'linear-light', label: 'Linear Light' }, { id: 'pin-light', label: 'Pin Light' }, { id: 'hard-mix', label: 'Hard Mix' },
  { id: 'difference', label: 'Difference' }, { id: 'exclusion', label: 'Exclusion' }, { id: 'subtract', label: 'Subtract' }, { id: 'divide', label: 'Divide' },
  { id: 'hue', label: 'Hue' }, { id: 'saturation', label: 'Saturation' }, { id: 'color', label: 'Color' }, { id: 'luminosity', label: 'Luminosity' },
];


const CANVAS_BLENDS: ReadonlySet<BlendMode> = new Set(['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'difference', 'color-dodge', 'color-burn', 'hue', 'saturation', 'color', 'luminosity', 'linear-dodge', 'soft-light', 'hard-light', 'exclusion']);
export const canvasBlend = (mode: BlendMode): boolean => CANVAS_BLENDS.has(mode);
export function compositeOp(mode: BlendMode): GlobalCompositeOperation { return mode === 'normal' || !CANVAS_BLENDS.has(mode) ? 'source-over' : mode === 'linear-dodge' ? 'lighter' : (mode as GlobalCompositeOperation); }
export function blendFromLabel(label: unknown): BlendMode { return BLEND_MODES.find((b) => b.label === label)?.id ?? 'normal'; }
export function blendLabel(mode: BlendMode): string { return BLEND_MODES.find((b) => b.id === mode)?.label ?? 'Normal'; }

export type Sampling = 'nearest' | 'smooth' | 'high';
export const SAMPLING_LABELS: Record<Sampling, string> = { nearest: 'Nearest', smooth: 'Smooth', high: 'High quality' };
export function samplingFromLabel(label: unknown): Sampling { return label === 'Nearest' ? 'nearest' : label === 'Smooth' ? 'smooth' : 'high'; }

export interface Transform { x: number; y: number; w: number; h: number; rotation: number; flipX: boolean; flipY: boolean; sampling: Sampling }
export interface Mask { raster: Raster | null; enabled: boolean; linked: boolean; placement: Transform | null }
export type AdjustmentKind = 'hsv' | 'levels' | 'curves' | 'exposure' | 'gradientMap' | 'grain' | import('./adjust-params').ParamKind;
export interface Adjustment { kind: AdjustmentKind; data: Record<string, unknown> }
/** Photoshop's layer locks (the target's Lock row): transparency (paint only where there are pixels), image pixels
 *  (no painting, filling or filtering), position (no moving or transforming), all (every one of them). */
export interface FrameSpec { x: number; y: number; w: number; h: number; shape: 'rect' | 'ellipse' }
export interface LayerLocks { transparency?: boolean; pixels?: boolean; position?: boolean; all?: boolean }
export interface Layer {
  readonly id: ID;
  /** Layer styles drawn beneath the layer; absent or null for none. */
  effects?: LayerEffects | null;
  /** A type layer's text, while its pixels are still the rendering of it; see `liveText`. */
  text?: TextSpec | null;
  /** A smart object's original pixels and live filter stack; `raster` shows the result. */
  smart?: SmartObject | null;
  /** On a top-level folder, makes it an artboard: its contents shown only inside `x, y, w, h` (document pixels), over
   *  `background` (none is transparent), and exported as its own image. */
  artboard?: Artboard | null;
  /** A shape layer's outline and fill colour, in document pixels at `origin`; `raster` is their rendering. */
  vector?: VectorLayer | null;
  name: string;
  raster: Raster | null;
  transform: Transform;
  visible: boolean;
  parentId: ID | null;
  isGroup: boolean;
  opacity: number;
  /** Fill (Photoshop's): the layer's own pixels at this share of its opacity, its layer styles at the full opacity;
   *  absent is 1. On an adjustment layer it acts as opacity does. */
  fill?: number;
  /** Absent is unlocked. */
  locks?: LayerLocks;
  /** A frame (the Frame tool, K, as Photoshop's): a folder whose mask is this shape; an image placed in it covers it. */
  frame?: FrameSpec | null;
  blend: BlendMode;
  mask: Mask | null;
  clipId: ID | null;
  adjustment: Adjustment | null;
  shape: Record<string, unknown> | null;
}
/** A ruler guide: `axis: 'x'` is a vertical guide at x = `at`, `'y'` a horizontal one, in document pixels. */
export interface Artboard { x: number; y: number; w: number; h: number; background: RGB | null }

/** An artboard read back from saved data, every field checked; null when it is not one. */
export function artboardFromData(raw: unknown): Artboard | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>, n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const x = n(o.x), y = n(o.y), w = n(o.w), h = n(o.h);
  if (x === null || y === null || w === null || h === null || w < 1 || h < 1 || w > 30000 || h > 30000) return null;
  const b = o.background as Record<string, unknown> | null | undefined, c = (v: unknown): number => Math.round(clamp(n(v) ?? 0, 0, 255));
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), background: b && typeof b === 'object' ? { r: c(b.r), g: c(b.g), b: c(b.b) } : null };
}

export interface Guide { axis: 'x' | 'y'; at: number }
/** A note pinned to the document (the Note tool, 1.49.6), and the Count tool's marks: saved with it, as Photoshop's. */
export interface DocNote { id: ID; x: number; y: number; text: string }
export interface Doc { readonly id: ID; width: number; height: number; resolution: number; layers: readonly Layer[]; guides?: readonly Guide[]; notes?: readonly DocNote[]; counts?: readonly { x: number; y: number }[]; globalLight?: GlobalLight; paragraphStyles?: readonly ParagraphStyle[] }

export type ToolId = 'move' | 'marquee' | 'lasso' | 'objectSelect' | 'wand' | 'crop' | 'brush' | 'remove' | 'spotHealing' | 'healingBrush' | 'patch' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'pathSelect' | 'directSelect' | 'freeformPen' | 'curvaturePen' | 'pen' | 'type' | 'eyedropper' | 'hand' | 'zoom' | 'bucket' | 'dodge' | 'burn' | 'sponge' | 'quickSelect' | 'historyBrush' | 'frame' | 'convertPoint' | 'selectionBrush' | 'pencil' | 'eraser' | 'magicEraser' | 'patternStamp' | 'backgroundEraser' | 'colorSampler' | 'ruler' | 'note' | 'count' | 'idle';

export const LIMITS = { side: 30000, pixels: 100_000_000, layers: 10000, depth: 64 } as const;

let counter = 0;
export function uid(): ID {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID().toUpperCase();
  counter += 1;
  return `ID-${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 10)}`.toUpperCase();
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function docTransform(w: number, h: number): Transform {
  return { x: 0, y: 0, w, h, rotation: 0, flipX: false, flipY: false, sampling: 'high' };
}

export function newLayer(name: string, size: { width: number; height: number }, patch: Partial<Layer> = {}): Layer {
  return {
    id: uid(), name, raster: null, transform: docTransform(size.width, size.height), visible: true, parentId: null,
    isGroup: false, opacity: 1, blend: 'normal', mask: null, clipId: null, adjustment: null, shape: null, ...patch,
  };
}

/** Layer styles, drawn beneath a layer from its visible silhouette. Sizes and distances are document pixels; the drop
 *  shadow's angle is where the light comes from, in degrees counter-clockwise from the right, so 120 casts the shadow
 *  down and to the right. */
export interface DropShadowEffect { enabled: boolean; color: RGB; opacity: number; blend: BlendMode; angle: number; distance: number; size: number; contour?: ContourId; useGlobal?: boolean }
export interface OuterGlowEffect { enabled: boolean; color: RGB; opacity: number; blend: BlendMode; size: number; contour?: ContourId }
/** `position`: Outside (the default, drawn beneath), Inside or Center (drawn over the layer, as Photoshop draws them). */
export interface StrokeEffect { enabled: boolean; color: RGB; opacity: number; size: number; position?: 'outside' | 'inside' | 'center' }
export interface InnerShadowEffect { enabled: boolean; color: RGB; opacity: number; blend: BlendMode; angle: number; distance: number; size: number; contour?: ContourId; useGlobal?: boolean }
export interface InnerGlowEffect { enabled: boolean; color: RGB; opacity: number; blend: BlendMode; size: number; contour?: ContourId }
export interface ColorOverlayEffect { enabled: boolean; color: RGB; opacity: number; blend: BlendMode }
/** A gradient across the layer's bounds, kept to its silhouette: from `from` to `to` along `angle` (degrees
 *  counter-clockwise from the right, so 90 runs bottom to top), or outward from the centre when radial; `scale` stretches
 *  it about the centre, and `reverse` swaps the ends. */
export interface GradientOverlayEffect { enabled: boolean; from: RGB; to: RGB; opacity: number; blend: BlendMode; angle: number; style: 'linear' | 'radial'; scale: number; reverse: boolean }
/** Bevel and Emboss: the silhouette, softened over `size`, taken as a height map and lit from `angle` (as Drop Shadow's)
 *  at `altitude` degrees; slopes facing the light take the highlight, those facing away the shadow. Inner shades inside
 *  the edge, outer outside it, emboss both, pillow both with the outside pressed in; `down` swaps light and dark. */
export interface BevelEffect { enabled: boolean; style: 'inner' | 'outer' | 'emboss' | 'pillow'; depth: number; down: boolean; size: number; soften: number; angle: number; altitude: number; highlight: RGB; highlightOpacity: number; highlightBlend: BlendMode; shadow: RGB; shadowOpacity: number; shadowBlend: BlendMode; gloss?: ContourId; useGlobal?: boolean }
/** Satin: the silhouette offset both ways along `angle` by `distance`, each copy softened over `size`, their difference
 *  kept inside the silhouette as a silky shading; `invert` shades where they agree instead. */
export interface SatinEffect { enabled: boolean; color: RGB; opacity: number; blend: BlendMode; angle: number; distance: number; size: number; invert: boolean }
/** Pattern Overlay: pattern `pattern` (an id) tiled from the layer's top-left corner at `scale`, kept to its silhouette,
 *  beneath the other overlays as in Photoshop. */
export interface PatternOverlayEffect { enabled: boolean; pattern: string; opacity: number; blend: BlendMode; scale: number }
export interface LayerEffects { dropShadow: DropShadowEffect; outerGlow: OuterGlowEffect; stroke: StrokeEffect; innerShadow: InnerShadowEffect; innerGlow: InnerGlowEffect; colorOverlay: ColorOverlayEffect; gradientOverlay: GradientOverlayEffect; bevel: BevelEffect; satin: SatinEffect; patternOverlay: PatternOverlayEffect; extra?: EffectExtras }
/** More instances of the effects Photoshop allows several of (up to ten in all, so nine here), drawn after the main
 *  one, each above the last. */
export interface EffectExtras { dropShadow?: DropShadowEffect[]; stroke?: StrokeEffect[]; innerShadow?: InnerShadowEffect[]; colorOverlay?: ColorOverlayEffect[]; gradientOverlay?: GradientOverlayEffect[] }
export type MultiEffect = keyof EffectExtras;
export const MULTI_EFFECTS: readonly MultiEffect[] = ['dropShadow', 'stroke', 'innerShadow', 'colorOverlay', 'gradientOverlay'];
export const MAX_EXTRA = 9;
/** Every instance of a multi effect: the main one, then its extras. */
export function instances<K extends MultiEffect>(fx: LayerEffects, k: K): Array<LayerEffects[K]> {
  return [fx[k], ...((fx.extra?.[k] as Array<LayerEffects[K]> | undefined) ?? [])];
}

/** Photoshop's starting values: a 75% multiplied black shadow at 120 degrees, 5 px away and 5 px soft; a 75% screened
 *  pale yellow glow of 5 px; a 3 px black outside stroke. All off. */
export function defaultEffects(): LayerEffects {
  return {
    dropShadow: { enabled: false, color: { r: 0, g: 0, b: 0 }, opacity: 0.75, blend: 'multiply', angle: 120, distance: 5, size: 5 },
    outerGlow: { enabled: false, color: { r: 255, g: 255, b: 190 }, opacity: 0.75, blend: 'screen', size: 5 },
    stroke: { enabled: false, color: { r: 0, g: 0, b: 0 }, opacity: 1, size: 3 },
    innerShadow: { enabled: false, color: { r: 0, g: 0, b: 0 }, opacity: 0.75, blend: 'multiply', angle: 120, distance: 5, size: 5 },
    innerGlow: { enabled: false, color: { r: 255, g: 255, b: 190 }, opacity: 0.75, blend: 'screen', size: 5 },
    colorOverlay: { enabled: false, color: { r: 255, g: 0, b: 0 }, opacity: 1, blend: 'normal' },
    gradientOverlay: { enabled: false, from: { r: 0, g: 0, b: 0 }, to: { r: 255, g: 255, b: 255 }, opacity: 1, blend: 'normal', angle: 90, style: 'linear', scale: 1, reverse: false },
    patternOverlay: { enabled: false, pattern: 'builtin:checker', opacity: 1, blend: 'normal', scale: 1 },
    satin: { enabled: false, color: { r: 0, g: 0, b: 0 }, opacity: 0.5, blend: 'multiply', angle: 19, distance: 11, size: 14, invert: true },
    bevel: { enabled: false, style: 'inner', depth: 100, down: false, size: 5, soften: 0, angle: 120, altitude: 30, highlight: { r: 255, g: 255, b: 255 }, highlightOpacity: 0.75, highlightBlend: 'screen', shadow: { r: 0, g: 0, b: 0 }, shadowOpacity: 0.75, shadowBlend: 'multiply' },
  };
}

export function effectsActive(fx: LayerEffects | null | undefined): fx is LayerEffects {
  return !!fx && (fx.dropShadow.enabled || fx.outerGlow.enabled || fx.stroke.enabled || fx.innerShadow.enabled || fx.innerGlow.enabled || fx.colorOverlay.enabled || fx.gradientOverlay.enabled || fx.bevel.enabled || fx.satin.enabled || fx.patternOverlay.enabled
    || MULTI_EFFECTS.some((k) => (fx.extra?.[k] ?? []).some((e) => e.enabled)));
}

/** Effects read back from saved data, every field checked and clamped; null when none is enabled. */
export function effectsFromData(raw: unknown): LayerEffects | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>, d = defaultEffects();
  const part = (k: string): Record<string, unknown> => (o[k] && typeof o[k] === 'object' ? (o[k] as Record<string, unknown>) : {});
  const num = (v: unknown, fallback: number, lo: number, hi: number): number => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : fallback);
  const rgb = (v: unknown, fallback: RGB): RGB => {
    const c = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
    return { r: Math.round(num(c.r, fallback.r, 0, 255)), g: Math.round(num(c.g, fallback.g, 0, 255)), b: Math.round(num(c.b, fallback.b, 0, 255)) };
  };
  const blend = (v: unknown, fallback: BlendMode): BlendMode => (BLEND_MODES.some((m) => m.id === v) ? (v as BlendMode) : fallback);
  const s = part('dropShadow'), g = part('outerGlow'), k = part('stroke'), is = part('innerShadow'), ig = part('innerGlow'), co = part('colorOverlay'), go = part('gradientOverlay'), bv = part('bevel'), sa = part('satin'), po = part('patternOverlay');
  const fx: LayerEffects = {
    dropShadow: { enabled: s.enabled === true, color: rgb(s.color, d.dropShadow.color), opacity: num(s.opacity, 0.75, 0, 1), blend: blend(s.blend, 'multiply'), angle: num(s.angle, 120, -360, 360), distance: num(s.distance, 5, 0, 1000), size: num(s.size, 5, 0, 250) },
    outerGlow: { enabled: g.enabled === true, color: rgb(g.color, d.outerGlow.color), opacity: num(g.opacity, 0.75, 0, 1), blend: blend(g.blend, 'screen'), size: num(g.size, 5, 0, 250) },
    stroke: { enabled: k.enabled === true, color: rgb(k.color, d.stroke.color), opacity: num(k.opacity, 1, 0, 1), size: num(k.size, 3, 1, 250) },
    innerShadow: { enabled: is.enabled === true, color: rgb(is.color, d.innerShadow.color), opacity: num(is.opacity, 0.75, 0, 1), blend: blend(is.blend, 'multiply'), angle: num(is.angle, 120, -360, 360), distance: num(is.distance, 5, 0, 1000), size: num(is.size, 5, 0, 250) },
    innerGlow: { enabled: ig.enabled === true, color: rgb(ig.color, d.innerGlow.color), opacity: num(ig.opacity, 0.75, 0, 1), blend: blend(ig.blend, 'screen'), size: num(ig.size, 5, 0, 250) },
    colorOverlay: { enabled: co.enabled === true, color: rgb(co.color, d.colorOverlay.color), opacity: num(co.opacity, 1, 0, 1), blend: blend(co.blend, 'normal') },
    gradientOverlay: { enabled: go.enabled === true, from: rgb(go.from, d.gradientOverlay.from), to: rgb(go.to, d.gradientOverlay.to), opacity: num(go.opacity, 1, 0, 1), blend: blend(go.blend, 'normal'), angle: num(go.angle, 90, -360, 360), style: go.style === 'radial' ? 'radial' : 'linear', scale: num(go.scale, 1, 0.1, 1.5), reverse: go.reverse === true },
    patternOverlay: { enabled: po.enabled === true, pattern: typeof po.pattern === 'string' && po.pattern ? po.pattern.slice(0, 120) : 'builtin:checker', opacity: num(po.opacity, 1, 0, 1), blend: blend(po.blend, 'normal'), scale: num(po.scale, 1, 0.1, 10) },
    satin: { enabled: sa.enabled === true, color: rgb(sa.color, d.satin.color), opacity: num(sa.opacity, 0.5, 0, 1), blend: blend(sa.blend, 'multiply'), angle: num(sa.angle, 19, -360, 360), distance: num(sa.distance, 11, 0, 250), size: num(sa.size, 14, 0, 250), invert: sa.invert !== false },
    bevel: { enabled: bv.enabled === true, style: bv.style === 'outer' || bv.style === 'emboss' || bv.style === 'pillow' ? bv.style : 'inner', depth: num(bv.depth, 100, 1, 1000), down: bv.down === true, size: num(bv.size, 5, 0, 250), soften: num(bv.soften, 0, 0, 16), angle: num(bv.angle, 120, -360, 360), altitude: num(bv.altitude, 30, 0, 90), highlight: rgb(bv.highlight, d.bevel.highlight), highlightOpacity: num(bv.highlightOpacity, 0.75, 0, 1), highlightBlend: blend(bv.highlightBlend, 'screen'), shadow: rgb(bv.shadow, d.bevel.shadow), shadowOpacity: num(bv.shadowOpacity, 0.75, 0, 1), shadowBlend: blend(bv.shadowBlend, 'multiply') },
  };
  const contour = (v: unknown): ContourId | undefined => (isContour(v) && v !== 'linear' ? v : undefined);
  for (const [dst, src] of [[fx.dropShadow, s], [fx.outerGlow, g], [fx.innerShadow, is], [fx.innerGlow, ig]] as const) { const c = contour(src.contour); if (c) dst.contour = c; }
  if (s.useGlobal === true) fx.dropShadow.useGlobal = true;
  if (is.useGlobal === true) fx.innerShadow.useGlobal = true;
  if (bv.useGlobal === true) fx.bevel.useGlobal = true;
  const gloss = contour(bv.gloss);
  if (gloss) fx.bevel.gloss = gloss;
  if (k.position === 'inside' || k.position === 'center') fx.stroke.position = k.position;
  const ex = o.extra && typeof o.extra === 'object' ? (o.extra as Record<string, unknown>) : null;
  if (ex) {
    const extra: EffectExtras = {};
    for (const key of MULTI_EFFECTS) {
      const list = Array.isArray(ex[key]) ? (ex[key] as unknown[]).slice(0, MAX_EXTRA) : [];
      const got = list.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const one = effectsFromData({ [key]: { ...(item as object), enabled: true } });
        return one ? [{ ...one[key], enabled: (item as { enabled?: unknown }).enabled === true }] : [];
      });
      if (got.length) (extra as Record<string, unknown>)[key] = got;
    }
    if (Object.keys(extra).length) fx.extra = extra;
  }
  return effectsActive(fx) ? fx : null;
}

/** A type layer's text and how it is set. `size` is in document pixels; `lineHeight` multiplies it from one baseline
 *  to the next. `rendered` pairs the spec with the raster it was drawn into (id and version): once the pixels are
 *  edited the pair breaks and the layer is plain pixels, as painting on type rasterizes it. */
/** `tracking`: extra space between characters in thousandths of an em, as Photoshop measures it; `kerning`: the font's
 *  own pair kerning ('metrics') or none ('none'). */
export interface TextSpec { content: string; family: string; size: number; color: RGB; align: 'left' | 'center' | 'right'; bold: boolean; italic: boolean; lineHeight: number; tracking: number; kerning: TextKerning; warp?: TextWarp | null; onPath?: TextPath | null; style?: ID | null; rendered?: string }
/** A paragraph style (Window > Paragraph Styles): a named set of type settings kept in the document; type layers linked
 *  to it by TextSpec.style take its settings, and redefining it updates every one of them. */
export interface ParagraphStyle { id: ID; name: string; family: string; size: number; color: RGB; align: 'left' | 'center' | 'right'; bold: boolean; italic: boolean; lineHeight: number; tracking: number; kerning: TextKerning }
/** Type on a path: the path's points in the layer's own pixels (a frame around the path, so editing the text never moves
 *  the layer), where the text starts along it (Start Offset, a percentage of its length), and the frame's size. */
export interface TextPath { points: Pt[]; offset: number; frame: { w: number; h: number } }
export type TextKerning = 'metrics' | 'none';
/** Warp Text, as Photoshop's: a style, its orientation, and Bend, Horizontal and Vertical Distortion (-100 to 100). */
export type WarpStyle = 'arc' | 'arcLower' | 'arcUpper' | 'arch' | 'bulge' | 'shellLower' | 'shellUpper' | 'flag' | 'wave' | 'fish' | 'rise' | 'fisheye' | 'inflate' | 'squeeze' | 'twist';
export interface TextWarp { style: WarpStyle; orientation: 'horizontal' | 'vertical'; bend: number; horizontal: number; vertical: number }

/** A smart filter: a filter kind and its settings (the noise seed among them), re-run on the smart object's source
 *  whenever the stack changes. */
export interface SmartFilter { id: ID; kind: string; settings: Record<string, unknown>; enabled: boolean }
/** A smart object: the pixels it was made from, kept untouched, and the filters shown on them. */
/** `warp`: where the source's corners land (top left, top right, bottom right, bottom left) after Distort or
 *  Perspective, kept so every re-render warps afresh from the source; `warpAt` is the layer transform its last render
 *  set, so a later move or transform of the layer can be carried into the warp. */
/** A linked smart object's file: an id for its source in the app's link registry, and the name, size and modified time
 *  its contents were last read at. */
export interface SmartLink { id: string; name: string; size: number; lastModified: number }
export interface SmartObject { source: Raster; filters: SmartFilter[]; warp?: Pt[] | null; warpAt?: Transform | null; filterMask?: Raster | null; filterMaskEnabled?: boolean; link?: SmartLink | null }

/** Smart filters read back from saved data, checked. */
export function smartFiltersFrom(raw: unknown): SmartFilter[] {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { filters?: unknown }).filters) ? (raw as { filters: unknown[] }).filters : [];
  return list.flatMap((f) => {
    if (!f || typeof f !== 'object') return [];
    const o = f as Record<string, unknown>;
    if (typeof o.kind !== 'string' || !o.settings || typeof o.settings !== 'object') return [];
    return [{ id: typeof o.id === 'string' && o.id ? o.id : uid(), kind: o.kind, settings: o.settings as Record<string, unknown>, enabled: o.enabled !== false }];
  });
}

/** A shape layer: a path with a fill colour, a stroke centred on it, or both. `origin` is where its raster was
 *  rendered, so a later move of the layer can carry the path along. */
export interface ShapeStroke { color: RGB; width: number }
export interface ShapeStyle { fill: RGB | null; stroke: ShapeStroke | null }
export interface VectorLayer { path: import('./paths').VectorPath; fill: RGB | null; stroke?: ShapeStroke | null; origin: Pt }
