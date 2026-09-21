import type { Raster } from './surface';

export type ID = string;
export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }
export interface RGB { r: number; g: number; b: number }

export type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'difference'
  | 'color-dodge' | 'color-burn' | 'hue' | 'saturation' | 'color' | 'luminosity'
  | 'linear-dodge' | 'soft-light' | 'hard-light' | 'exclusion';

/** Photoshop's menu order, grouped darken, lighten, contrast, inversion, component; the modes the browser canvas
 *  composites natively. Linear Dodge (Add) is the canvas's `lighter`. */
export const BLEND_MODES: ReadonlyArray<{ id: BlendMode; label: string }> = [
  { id: 'normal', label: 'Normal' },
  { id: 'darken', label: 'Darken' }, { id: 'multiply', label: 'Multiply' }, { id: 'color-burn', label: 'Color Burn' },
  { id: 'lighten', label: 'Lighten' }, { id: 'screen', label: 'Screen' }, { id: 'color-dodge', label: 'Color Dodge' }, { id: 'linear-dodge', label: 'Linear Dodge (Add)' },
  { id: 'overlay', label: 'Overlay' }, { id: 'soft-light', label: 'Soft Light' }, { id: 'hard-light', label: 'Hard Light' },
  { id: 'difference', label: 'Difference' }, { id: 'exclusion', label: 'Exclusion' },
  { id: 'hue', label: 'Hue' }, { id: 'saturation', label: 'Saturation' }, { id: 'color', label: 'Color' }, { id: 'luminosity', label: 'Luminosity' },
];

/** The modes a `.ref` project can hold; others export as Normal. */
export const REF_BLEND_MODES: ReadonlySet<BlendMode> = new Set(['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'difference', 'color-dodge', 'color-burn', 'hue', 'saturation', 'color', 'luminosity']);

export function compositeOp(mode: BlendMode): GlobalCompositeOperation { return mode === 'normal' ? 'source-over' : mode === 'linear-dodge' ? 'lighter' : mode; }
export function blendFromLabel(label: unknown): BlendMode { return BLEND_MODES.find((b) => b.label === label)?.id ?? 'normal'; }
export function blendLabel(mode: BlendMode): string { return BLEND_MODES.find((b) => b.id === mode)?.label ?? 'Normal'; }

export type Sampling = 'nearest' | 'smooth' | 'high';
export const SAMPLING_LABELS: Record<Sampling, string> = { nearest: 'Nearest', smooth: 'Smooth', high: 'High quality' };
export function samplingFromLabel(label: unknown): Sampling { return label === 'Nearest' ? 'nearest' : label === 'Smooth' ? 'smooth' : 'high'; }

export interface Transform { x: number; y: number; w: number; h: number; rotation: number; flipX: boolean; flipY: boolean; sampling: Sampling }
export interface Mask { raster: Raster | null; enabled: boolean; linked: boolean; placement: Transform | null }
export type AdjustmentKind = 'hsv' | 'levels' | 'curves' | 'exposure' | 'gradientMap' | 'grain';
export interface Adjustment { kind: AdjustmentKind; data: Record<string, unknown> }
export interface Layer {
  readonly id: ID;
  /** Layer styles drawn beneath the layer; absent or null for none. */
  effects?: LayerEffects | null;
  /** A type layer's text, while its pixels are still the rendering of it; see `liveText`. */
  text?: TextSpec | null;
  /** A smart object's original pixels and live filter stack; `raster` shows the result. */
  smart?: SmartObject | null;
  /** A shape layer's outline and fill colour, in document pixels at `origin`; `raster` is their rendering. */
  vector?: VectorLayer | null;
  name: string;
  raster: Raster | null;
  transform: Transform;
  visible: boolean;
  parentId: ID | null;
  isGroup: boolean;
  opacity: number;
  blend: BlendMode;
  mask: Mask | null;
  clipId: ID | null;
  adjustment: Adjustment | null;
  shape: Record<string, unknown> | null;
}
export interface Doc { readonly id: ID; width: number; height: number; resolution: number; layers: readonly Layer[] }

export type ToolId = 'move' | 'marquee' | 'lasso' | 'wand' | 'crop' | 'brush' | 'spotHealing' | 'healingBrush' | 'patch' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'directSelect' | 'pen' | 'type' | 'eyedropper' | 'hand' | 'zoom' | 'idle';

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
export interface DropShadowEffect { enabled: boolean; color: RGB; opacity: number; blend: BlendMode; angle: number; distance: number; size: number }
export interface OuterGlowEffect { enabled: boolean; color: RGB; opacity: number; blend: BlendMode; size: number }
export interface StrokeEffect { enabled: boolean; color: RGB; opacity: number; size: number }
export interface InnerShadowEffect { enabled: boolean; color: RGB; opacity: number; blend: BlendMode; angle: number; distance: number; size: number }
export interface InnerGlowEffect { enabled: boolean; color: RGB; opacity: number; blend: BlendMode; size: number }
export interface ColorOverlayEffect { enabled: boolean; color: RGB; opacity: number; blend: BlendMode }
export interface LayerEffects { dropShadow: DropShadowEffect; outerGlow: OuterGlowEffect; stroke: StrokeEffect; innerShadow: InnerShadowEffect; innerGlow: InnerGlowEffect; colorOverlay: ColorOverlayEffect }

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
  };
}

export function effectsActive(fx: LayerEffects | null | undefined): fx is LayerEffects {
  return !!fx && (fx.dropShadow.enabled || fx.outerGlow.enabled || fx.stroke.enabled || fx.innerShadow.enabled || fx.innerGlow.enabled || fx.colorOverlay.enabled);
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
  const s = part('dropShadow'), g = part('outerGlow'), k = part('stroke'), is = part('innerShadow'), ig = part('innerGlow'), co = part('colorOverlay');
  const fx: LayerEffects = {
    dropShadow: { enabled: s.enabled === true, color: rgb(s.color, d.dropShadow.color), opacity: num(s.opacity, 0.75, 0, 1), blend: blend(s.blend, 'multiply'), angle: num(s.angle, 120, -360, 360), distance: num(s.distance, 5, 0, 1000), size: num(s.size, 5, 0, 250) },
    outerGlow: { enabled: g.enabled === true, color: rgb(g.color, d.outerGlow.color), opacity: num(g.opacity, 0.75, 0, 1), blend: blend(g.blend, 'screen'), size: num(g.size, 5, 0, 250) },
    stroke: { enabled: k.enabled === true, color: rgb(k.color, d.stroke.color), opacity: num(k.opacity, 1, 0, 1), size: num(k.size, 3, 1, 250) },
    innerShadow: { enabled: is.enabled === true, color: rgb(is.color, d.innerShadow.color), opacity: num(is.opacity, 0.75, 0, 1), blend: blend(is.blend, 'multiply'), angle: num(is.angle, 120, -360, 360), distance: num(is.distance, 5, 0, 1000), size: num(is.size, 5, 0, 250) },
    innerGlow: { enabled: ig.enabled === true, color: rgb(ig.color, d.innerGlow.color), opacity: num(ig.opacity, 0.75, 0, 1), blend: blend(ig.blend, 'screen'), size: num(ig.size, 5, 0, 250) },
    colorOverlay: { enabled: co.enabled === true, color: rgb(co.color, d.colorOverlay.color), opacity: num(co.opacity, 1, 0, 1), blend: blend(co.blend, 'normal') },
  };
  return effectsActive(fx) ? fx : null;
}

/** A type layer's text and how it is set. `size` is in document pixels; `lineHeight` multiplies it from one baseline
 *  to the next. `rendered` pairs the spec with the raster it was drawn into (id and version): once the pixels are
 *  edited the pair breaks and the layer is plain pixels, as painting on type rasterizes it. */
export interface TextSpec { content: string; family: string; size: number; color: RGB; align: 'left' | 'center' | 'right'; bold: boolean; italic: boolean; lineHeight: number; rendered?: string }

/** A smart filter: a filter kind and its settings (the noise seed among them), re-run on the smart object's source
 *  whenever the stack changes. */
export interface SmartFilter { id: ID; kind: string; settings: Record<string, unknown>; enabled: boolean }
/** A smart object: the pixels it was made from, kept untouched, and the filters shown on them. */
export interface SmartObject { source: Raster; filters: SmartFilter[] }

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

/** A shape layer: a path filled with a colour. `origin` is where its raster was rendered, so a later move of the layer
 *  can carry the path along. */
export interface VectorLayer { path: import('./paths').VectorPath; fill: RGB; origin: Pt }
