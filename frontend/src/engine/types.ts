import type { Raster } from './surface';
import type { TiledRaster } from './tiled';
import type { SelectionMask } from './selection';
import { isContour, type ContourId, type GlobalLight } from './style-extras';
import type { DocMeta } from './doc-meta';

export type ID = string;
export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }
export interface RGB { r: number; g: number; b: number }

export type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'difference' | 'color-dodge' | 'color-burn'
  | 'hue' | 'saturation' | 'color' | 'luminosity'
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
export function blendFromLabel(label: unknown): BlendMode { return BLEND_MODES.find((m) => m.label === label)?.id ?? 'normal'; }
export function blendLabel(mode: BlendMode): string { return BLEND_MODES.find((m) => m.id === mode)?.label ?? 'Normal'; }

export type Sampling = 'nearest' | 'smooth' | 'high';
export const SAMPLING_LABELS: Record<Sampling, string> = { nearest: 'Nearest', smooth: 'Smooth', high: 'High quality' };
export function samplingFromLabel(label: unknown): Sampling { return (Object.keys(SAMPLING_LABELS) as Sampling[]).find((k) => SAMPLING_LABELS[k] === label) ?? 'high'; }

export interface Transform { x: number; y: number; w: number; h: number; rotation: number; flipX: boolean; flipY: boolean; sampling: Sampling }
export interface Mask { raster: Raster | null; enabled: boolean; linked: boolean; placement: Transform | null }
/** A vector mask (1.66.1, Photoshop's): a path in document pixels showing the layer only inside it, or only outside it
 *  when `inverted`, its edge anti-aliased; with no outlines it shows all, or inverted hides all (Hide All). Linked, it
 *  moves and transforms with the layer; canvas changes carry it either way. */
export interface VectorMask { path: import('./paths').VectorPath; enabled: boolean; linked: boolean; inverted: boolean }
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
  /** Blending Options (1.54.5, the parity plan's M2). Blend If: the layer's pixels shown only where this layer's
   *  value and the underlying composite's value fall inside each range, each end feathered between its two numbers
   *  (the split slider), on the grey (luminosity) or one channel. Knockout: where the layer has coverage, what lies
   *  below it down to the Background (deep) or to the bottom of its group (shallow) is punched through, the layer's
   *  own pixels showing at its fill. */
  blendIf?: BlendIf | null;
  knockout?: 'none' | 'shallow' | 'deep';
  /** A type layer's text, while its pixels are still the rendering of it; see `liveText`. */
  text?: TextSpec | null;
  /** A smart object's original pixels and live filter stack; `raster` shows the result. */
  smart?: SmartObject | null;
  /** A video layer (DEV_PLAN 33.4a): one raster per frame of its clip. `original` is the footage as loaded, `frames` the
   *  current, possibly painted, frames (they share Raster objects until a frame is altered); `raster` shows the frame
   *  at the playhead and is stored back into `frames` when the playhead leaves it. */
  video?: { frames: Raster[]; original: Raster[]; name: string; interpret?: FootageInterpretation } | null;
  /** On a top-level folder, makes it an artboard: its contents shown only inside `x, y, w, h` (document pixels), over
   *  `background` (none is transparent), and exported as its own image. */
  artboard?: Artboard | null;
  /** A shape layer's outline and fill colour, in document pixels at `origin`; `raster` is their rendering. */
  vector?: VectorLayer | null;
  /** The settings of a 3D extrusion layer (DEV_PLAN 32.9), kept so it can be re-rendered; read by ui/panels/extrude3d-dialog. */
  extrude3d?: unknown;
  name: string;
  raster: Raster | null;
  /** A layer past one canvas's 2^28 pixels kept as tiles (1.62.3, DEV_PLAN 26.6b); `raster` is null on it, so code
   *  written for ordinary layers declines it as it declines an adjustment, until each stage teaches that code tiles. */
  tiled?: TiledRaster | null;
  /** The layer's float pixels beyond 8-bit RGB (16 and 32 bits, CMYK, Lab); `raster` is their rendition. */
  channels?: ChannelPixels;
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
  /** Layer > Link Layers (1.65.3): layers holding the same link move and transform together; a link one layer holds
   *  alone links nothing. Absent is unlinked. */
  link?: ID;
  /** A frame (the Frame tool, K, as Photoshop's): a folder whose mask is this shape; an image placed in it covers it. */
  frame?: FrameSpec | null;
  /** A fill layer's content (1.66.0); `raster` is its rendering over the whole canvas, drawn again when it changes. */
  fillContent?: FillContent | null;
  /** Layer > Vector Mask (1.66.1), beside `mask`; absent or null for none. */
  vectorMask?: VectorMask | null;
  blend: BlendMode;
  mask: Mask | null;
  clipId: ID | null;
  adjustment: Adjustment | null;
  shape: Record<string, unknown> | null;
}
/** Layer > New Fill Layer (1.66.0), as Photoshop's: a solid colour; a gradient (its stops resolved to colours, laid
 *  out across the canvas, or across what the layer's mask shows when `align`, at `angle` degrees, `scale` and `offset`
 *  as fractions of that frame); or a pattern (`scale` a fraction, `angle` degrees, its origin at the frame's corner
 *  when `link`, moved by `phase` pixels). Photoshop's own fields, so they travel in PSD files. */
export type FillContent =
  | { kind: 'solid'; color: RGB }
  | { kind: 'gradient'; stops: FillStop[]; style: 'linear' | 'radial' | 'angle' | 'reflected' | 'diamond'; angle: number; scale: number; reverse: boolean; dither: boolean; align: boolean; offset: Pt }
  | { kind: 'pattern'; pattern: ID; scale: number; angle: number; link: boolean; phase: Pt };
export interface FillStop { at: number; color: RGB; alpha: number }
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
/** A document's colour mode (1.50.2, the owner's walkthrough), as Photoshop's: RGB, Grayscale (8-bit grey), Bitmap (1-bit
 *  black and white) or Indexed Color (a palette of at most 256). Absent means RGB. */
export type DocMode = 'rgb' | 'grayscale' | 'bitmap' | 'indexed' | 'cmyk' | 'lab' | 'duotone' | 'multichannel';
/** Blend If ranges, 0 to 255: [blackStart, blackEnd, whiteStart, whiteEnd] for this layer and for the underlying
 *  composite; between the two numbers of a split the layer fades. Identity is [0, 0, 255, 255] on both. */
export interface BlendIf { channel: 'gray' | 'r' | 'g' | 'b'; thisLayer: [number, number, number, number]; underlying: [number, number, number, number] }
export const BLEND_IF_IDENTITY: BlendIf = { channel: 'gray', thisLayer: [0, 0, 255, 255], underlying: [0, 0, 255, 255] };
export const blendIfActive = (b: BlendIf | null | undefined): boolean => !!b && (b.thisLayer.some((v, i) => v !== BLEND_IF_IDENTITY.thisLayer[i]) || b.underlying.some((v, i) => v !== BLEND_IF_IDENTITY.underlying[i]));
/** A document's colour profile (1.53.5, H2): its name and ICC bytes, base64; none means sRGB, the working space. */
export interface DocProfile { name: string; icc: string }
/** A layer's pixels at 16 bits (1.53.6, H1): RGBA as floats 0 to 1, straight alpha, the size of its raster, which
 *  holds their 8-bit rendition for display and 8-bit tools. */
/** The one float pixel model (1.54.3, DEV_PLAN 22.3): a layer's pixels beyond 8-bit RGB. `mode` says what the channels
 *  are (RGB at 16 or 32 bits, 0 to 1 or linear and unbounded; CMYK ink 0 paper to 1 full; Lab as L 0 to 100 and a, b
 *  signed), `n` how many, then straight alpha last, `n + 1` floats a pixel. `raster` holds the sRGB rendition for
 *  display and for tools that have not moved. */
export interface ChannelPixels { mode: 'rgb' | 'cmyk' | 'lab'; n: 3 | 4; width: number; height: number; data: Float32Array }
/** The RGB kind of ChannelPixels, as 16- and 32-bit documents hold it. */
export type DeepPixels = ChannelPixels;
/** A Layer Comp (Photoshop's): per layer, any of visibility, position and appearance, plus a name and comment. */
export interface LayerComp {
  id: ID; name: string; comment: string; useVisibility: boolean; usePosition: boolean; useAppearance: boolean;
  layers: Record<ID, { visible?: boolean; x?: number; y?: number; opacity?: number; blend?: BlendMode; fill?: number; effects?: unknown; effectsHidden?: boolean }>;
}
/** A variable bound to a layer (Image > Variables, DEV_PLAN 29.9): its visibility, a type layer's text, or a pixel layer's image. */
export interface DocVariable { name: string; layer: ID; kind: 'visibility' | 'text' | 'pixels'; method?: 'fit' | 'fill' | 'asis' | 'conform' }
/** A named row of values, one per variable name. */
export interface DataSet { name: string; values: Record<string, string> }
export interface Doc { /** Width over height of one pixel (35.4 part b); absent means square. */ pixelAspect?: number; measureScale?: { pixels: number; length: number; units: string }; measurements?: Array<{ id: number; label: string; scale: number; units: string; area?: number; perimeter?: number; length?: number; angle?: number; count?: number; w?: number; h?: number; gray?: number; grayMin?: number; grayMax?: number; intDen?: number; cx?: number; cy?: number }>; multichannel?: { channels: { name: string; color: RGB; solidity: number; data: Raster }[] }; duotone?: { type: 'mono' | 'duo' | 'tri' | 'quad'; inks: { name: string; color: RGB; curve: number[] }[] }; variables?: DocVariable[]; dataSets?: DataSet[]; activeDataSet?: string | null; comps?: readonly LayerComp[]; activeComp?: ID | null; depth?: 8 | 16 | 32; profile?: DocProfile; mode?: DocMode; palette?: readonly RGB[]; readonly id: ID; width: number; height: number; resolution: number; layers: readonly Layer[]; guides?: readonly Guide[]; slices?: readonly DocSlice[];notes?: readonly DocNote[]; counts?: readonly { x: number; y: number }[]; globalLight?: GlobalLight; paragraphStyles?: readonly ParagraphStyle[]; characterStyles?: readonly CharacterStyle[]; alphas?: readonly AlphaChannel[]; meta?: DocMeta }
/** An alpha channel (1.65.1): a selection saved with the document, `mask` null when nothing in it is selected. */
export interface AlphaChannel { readonly id: ID; readonly name: string; readonly mask: SelectionMask | null }

/** A user slice (Slice tool): a rectangle in document pixels with the web properties Slice Options will edit. */
/** Interpret Footage (DEV_PLAN 33.4): how a video layer's frames are read. `fps` is the footage's own rate (the
 *  timeline's when absent), `loop` how many times the clip plays, `alpha` how its transparency is read: 'ignore' makes
 *  every frame opaque, 'premultiplied' takes the colour back off `matte` (black when absent). */
export interface FootageInterpretation { fps?: number; loop?: number; alpha?: 'straight' | 'ignore' | 'premultiplied'; matte?: RGB }
export interface DocSlice { id: ID; name: string; x: number; y: number; w: number; h: number; layer?: ID; url?: string; alt?: string }
export type ToolId = 'slice' | 'move' |'marquee' | 'lasso' | 'objectSelect' | 'wand' | 'crop' | 'brush' | 'remove' | 'spotHealing' | 'healingBrush' | 'patch' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'pathSelect' | 'directSelect' | 'freeformPen' | 'curvaturePen' | 'pen' | 'type' | 'eyedropper' | 'hand' | 'zoom' | 'bucket' | 'dodge' | 'burn' | 'sponge' | 'quickSelect' | 'historyBrush' | 'mixer' | 'artHistory' | 'frame' | 'convertPoint' | 'selectionBrush' | 'pencil' | 'eraser' | 'magicEraser' | 'patternStamp' | 'backgroundEraser' | 'colorSampler' | 'ruler' | 'note' | 'markup' | 'count' | 'contentAwareMove' | 'redEye' | 'rotateView' | 'idle';

/** pixels follows this computer's memory (1.53.4, setPixelBudget from the engine's capabilities); 100 megapixels until known. */
export const LIMITS: { readonly side: number; pixels: number; readonly layers: number; readonly depth: number } = { side: 30000, pixels: 100_000_000, layers: 10000, depth: 64 };
export function setPixelBudget(pixels: number): void { if (Number.isFinite(pixels) && pixels >= 100_000_000) LIMITS.pixels = Math.min(250_000_000, Math.round(pixels)); }

let idCounter = 0;
export function uid(): ID {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID().toUpperCase();
  idCounter += 1;
  return 'ID-' + (Date.now().toString(36) + idCounter.toString(36) + Math.random().toString(36).slice(2, 8)).toUpperCase();
}

export function clamp(v: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, v)); }

export function docTransform(w: number, h: number): Transform {
  return { x: 0, y: 0, w, h, rotation: 0, flipX: false, flipY: false, sampling: 'high' };
}

export function newLayer(name: string, size: { width: number; height: number }, patch: Partial<Layer> = {}): Layer {
  const base: Layer = {
    id: uid(), name, raster: null, transform: docTransform(size.width, size.height), visible: true, parentId: null, isGroup: false,
    opacity: 1, blend: 'normal', mask: null, clipId: null, adjustment: null, shape: null,
  };
  return { ...base, ...patch };
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
 *  the edge, outer outside it, emboss both, pillow both with the outside pressed in, stroke the layer's stroke; `down`
 *  swaps light and dark; a chisel `technique` slopes evenly from the edge. */
export interface BevelEffect { enabled: boolean; style: 'inner' | 'outer' | 'emboss' | 'pillow' | 'stroke'; depth: number; down: boolean; size: number; soften: number; angle: number; altitude: number; highlight: RGB; highlightOpacity: number; highlightBlend: BlendMode; shadow: RGB; shadowOpacity: number; shadowBlend: BlendMode; gloss?: ContourId; useGlobal?: boolean; technique?: 'chiselHard' | 'chiselSoft'; contour?: BevelContour; texture?: BevelTexture }
/** Bevel & Emboss's Contour (1.65.2): the height through `id` over `range` (0.01 to 1). */
export interface BevelContour { enabled: boolean; id: ContourId; range: number }
/** Bevel & Emboss's Texture (1.65.2): a pattern's brightness added to the height, tiled from the layer's corner. */
export interface BevelTexture { enabled: boolean; pattern: string; scale: number; depth: number; invert: boolean }
/** Satin: the silhouette offset both ways along `angle` by `distance`, each copy softened over `size`, their difference
 *  kept inside the silhouette as a silky shading; `invert` shades where they agree instead. */
export interface SatinEffect { enabled: boolean; color: RGB; opacity: number; blend: BlendMode; angle: number; distance: number; size: number; invert: boolean }
/** Pattern Overlay: pattern `pattern` (an id) tiled from the layer's top-left corner at `scale`, kept to its silhouette,
 *  beneath the other overlays as in Photoshop. */
export interface PatternOverlayEffect { enabled: boolean; pattern: string; opacity: number; blend: BlendMode; scale: number }
export interface LayerEffects { dropShadow: DropShadowEffect; outerGlow: OuterGlowEffect; stroke: StrokeEffect; innerShadow: InnerShadowEffect; innerGlow: InnerGlowEffect; colorOverlay: ColorOverlayEffect; gradientOverlay: GradientOverlayEffect; bevel: BevelEffect; satin: SatinEffect; patternOverlay: PatternOverlayEffect; extra?: EffectExtras; hidden?: boolean }
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

/** Whether the layer's style draws: some effect is on and the style is not hidden (Hide All Effects, 1.65.2). */
export function effectsActive(fx: LayerEffects | null | undefined): fx is LayerEffects {
  return effectsPresent(fx) && !fx.hidden;
}

/** Whether the layer has a style at all, shown or hidden. */
export function effectsPresent(fx: LayerEffects | null | undefined): fx is LayerEffects {
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
    bevel: { enabled: bv.enabled === true, style: bv.style === 'outer' || bv.style === 'emboss' || bv.style === 'pillow' || bv.style === 'stroke' ? bv.style : 'inner', depth: num(bv.depth, 100, 1, 1000), down: bv.down === true, size: num(bv.size, 5, 0, 250), soften: num(bv.soften, 0, 0, 16), angle: num(bv.angle, 120, -360, 360), altitude: num(bv.altitude, 30, 0, 90), highlight: rgb(bv.highlight, d.bevel.highlight), highlightOpacity: num(bv.highlightOpacity, 0.75, 0, 1), highlightBlend: blend(bv.highlightBlend, 'screen'), shadow: rgb(bv.shadow, d.bevel.shadow), shadowOpacity: num(bv.shadowOpacity, 0.75, 0, 1), shadowBlend: blend(bv.shadowBlend, 'multiply') },
  };
  const contour = (v: unknown): ContourId | undefined => (isContour(v) && v !== 'linear' ? v : undefined);
  for (const [dst, src] of [[fx.dropShadow, s], [fx.outerGlow, g], [fx.innerShadow, is], [fx.innerGlow, ig]] as const) { const c = contour(src.contour); if (c) dst.contour = c; }
  if (s.useGlobal === true) fx.dropShadow.useGlobal = true;
  if (is.useGlobal === true) fx.innerShadow.useGlobal = true;
  if (bv.useGlobal === true) fx.bevel.useGlobal = true;
  const gloss = contour(bv.gloss);
  if (gloss) fx.bevel.gloss = gloss;
  if (bv.technique === 'chiselHard' || bv.technique === 'chiselSoft') fx.bevel.technique = bv.technique;
  const bc = bv.contour && typeof bv.contour === 'object' ? (bv.contour as Record<string, unknown>) : null, bt = bv.texture && typeof bv.texture === 'object' ? (bv.texture as Record<string, unknown>) : null;
  if (bc) fx.bevel.contour = { enabled: bc.enabled === true, id: isContour(bc.id) ? bc.id : 'linear', range: num(bc.range, 0.5, 0.01, 1) };
  if (bt) fx.bevel.texture = { enabled: bt.enabled === true, pattern: typeof bt.pattern === 'string' && bt.pattern ? bt.pattern.slice(0, 120) : 'builtin:checker', scale: num(bt.scale, 1, 0.01, 10), depth: num(bt.depth, 1, -10, 10), invert: bt.invert === true };
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
  if (o.hidden === true) fx.hidden = true;
  return effectsPresent(fx) ? fx : null;
}

/** A type layer's text and how it is set. `size` is in document pixels; `lineHeight` multiplies it from one baseline
 *  to the next. `rendered` pairs the spec with the raster it was drawn into (id and version): once the pixels are
 *  edited the pair breaks and the layer is plain pixels, as painting on type rasterizes it. */
/** `tracking`: extra space between characters in thousandths of an em, as Photoshop measures it; `kerning`: the font's
 *  own pair kerning ('metrics') or none ('none'). */
/** box: paragraph text's box, wrapped to its width and clipped at its height (absent: point text); direction: vertical
 *  type stacks upright characters top to bottom in columns from right to left (1.49.7, the owner's tool list). */
/** antialias (1.50.4, the tool audit): Photoshop's method, of those formvis renders truly: None (every edge pixel on or
 *  off), Sharp (steeper edges) or Smooth (absent). */
/** features (DEV_PLAN 32.6b): OpenType feature tags turned on ('smcp'), and '-liga' or '-calt' for a default feature off. */
export interface TextSpec { features?: string[] | null; antialias?: 'none' | 'sharp' | 'smooth'; box?: { w: number; h: number } | null; direction?: 'horizontal' | 'vertical'; content: string; family: string; size: number; color: RGB; align: 'left' | 'center' | 'right' | 'justify'; bold: boolean; italic: boolean; lineHeight: number; tracking: number; kerning: TextKerning; warp?: TextWarp | null; onPath?: TextPath | null; style?: ID | null; charStyle?: ID | null; rendered?: string }
/** A character style (DEV_PLAN 32.6c): only the fields it sets override the type layer's own; the layer links it by `TextSpec.charStyle`. */
export interface CharacterStyle { id: ID; name: string; family?: string; size?: number; color?: RGB; bold?: boolean; italic?: boolean; tracking?: number; features?: string[] }
/** A paragraph style (Window > Paragraph Styles): a named set of type settings kept in the document; type layers linked
 *  to it by TextSpec.style take its settings, and redefining it updates every one of them. */
export interface ParagraphStyle { id: ID; name: string; family: string; size: number; color: RGB; align: 'left' | 'center' | 'right' | 'justify'; bold: boolean; italic: boolean; lineHeight: number; tracking: number; kerning: TextKerning }
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
export interface SmartLink { id: string; name: string; size: number; lastModified: number; path?: string }
/** `stack` (33.1): a smart object made from several layers keeps their document-size renders, bottom first; `source` is
 *  the stack mode's result over them (the top one under None). */
export interface SmartStack { sources: Raster[]; mode: import('./stack-modes').StackMode }
export interface SmartObject { source: Raster; filters: SmartFilter[]; stack?: SmartStack | null; warp?: Pt[] | null; warpAt?: Transform | null; filterMask?: Raster | null; filterMaskEnabled?: boolean; link?: SmartLink | null }

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
/** dash and align (1.52.8, the tool audit), as Photoshop's stroke options: solid, dashed or dotted; inside, centred
 *  on or outside the path (an open path is always centred). */
export interface ShapeStroke { color: RGB; width: number; dash?: 'solid' | 'dashed' | 'dotted'; align?: 'inside' | 'center' | 'outside' }
export interface ShapeStyle { fill: RGB | null; stroke: ShapeStroke | null }
export interface VectorLayer { path: import('./paths').VectorPath; fill: RGB | null; stroke?: ShapeStroke | null; origin: Pt }
