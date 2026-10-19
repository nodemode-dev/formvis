import type { Raster } from './surface';
import type { TiledRaster } from './tiled';
import type { SelectionMask } from './selection';
import { isContour, type ContourId, type GlobalLight } from './style-extras';
import type { DocMeta } from './doc-meta';

export type ID = string;
export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }
export interface RGB { r: number; g: number; b: number }

/** The Layers panel's colour labels (1.87.3, CLOSE_GAPS P06). */
export const LAYER_LABELS = ['red', 'orange', 'yellow', 'green', 'blue', 'violet', 'gray'] as const;
export type LayerLabel = (typeof LAYER_LABELS)[number];

export type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'difference' | 'color-dodge' | 'color-burn'
  | 'hue' | 'saturation' | 'color' | 'luminosity'
  | 'linear-dodge' | 'soft-light' | 'hard-light' | 'exclusion'
  | 'dissolve' | 'linear-burn' | 'darker-color' | 'lighter-color' | 'vivid-light' | 'linear-light' | 'pin-light' | 'hard-mix' | 'subtract' | 'divide'
  | 'negation' | 'reflect' | 'glow' | 'xor';

/** The four modes beyond the 27 of the PSD format: composited per pixel on the CPU (`blend.ts`, `compose-float.ts`), never on the display card, and written to PSD as Normal. */
export type ExtraBlend = 'negation' | 'reflect' | 'glow' | 'xor';

/** The usual menu order, all 27 layer modes of the PSD format, grouped darken, lighten, contrast, inversion, component.
 *  Linear Dodge (Add) is the canvas's `lighter`; the ten the canvas lacks are blended per pixel (`blend.ts`). */
export const BLEND_MODES: ReadonlyArray<{ id: BlendMode; label: string }> = [
  { id: 'normal', label: 'Normal' }, { id: 'dissolve', label: 'Dissolve' },
  { id: 'darken', label: 'Darken' }, { id: 'multiply', label: 'Multiply' }, { id: 'color-burn', label: 'Color Burn' }, { id: 'linear-burn', label: 'Linear Burn' }, { id: 'darker-color', label: 'Darker Color' },
  { id: 'lighten', label: 'Lighten' }, { id: 'screen', label: 'Screen' }, { id: 'color-dodge', label: 'Color Dodge' }, { id: 'linear-dodge', label: 'Linear Dodge (Add)' }, { id: 'lighter-color', label: 'Lighter Color' },
  { id: 'overlay', label: 'Overlay' }, { id: 'soft-light', label: 'Soft Light' }, { id: 'hard-light', label: 'Hard Light' }, { id: 'vivid-light', label: 'Vivid Light' }, { id: 'linear-light', label: 'Linear Light' }, { id: 'pin-light', label: 'Pin Light' }, { id: 'hard-mix', label: 'Hard Mix' },
  { id: 'difference', label: 'Difference' }, { id: 'exclusion', label: 'Exclusion' }, { id: 'subtract', label: 'Subtract' }, { id: 'divide', label: 'Divide' },
  { id: 'hue', label: 'Hue' }, { id: 'saturation', label: 'Saturation' }, { id: 'color', label: 'Color' }, { id: 'luminosity', label: 'Luminosity' },
];
/** The four layer-only modes beyond the 27, listed after them in the Layers panel (blend.ts and compose-float.ts hold the formulas). */
export const EXTRA_BLEND_MODES: ReadonlyArray<{ id: ExtraBlend; label: string }> = [
  { id: 'negation', label: 'Negation' }, { id: 'reflect', label: 'Reflect' }, { id: 'glow', label: 'Glow' }, { id: 'xor', label: 'Xor' },
];
export const LAYER_BLEND_MODES: ReadonlyArray<{ id: BlendMode; label: string }> = [...BLEND_MODES, ...EXTRA_BLEND_MODES];


const CANVAS_BLENDS: ReadonlySet<BlendMode> = new Set(['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'difference', 'color-dodge', 'color-burn', 'hue', 'saturation', 'color', 'luminosity', 'linear-dodge', 'soft-light', 'hard-light', 'exclusion']);
export const canvasBlend = (mode: BlendMode): boolean => CANVAS_BLENDS.has(mode);
export function compositeOp(mode: BlendMode): GlobalCompositeOperation { return mode === 'normal' || !CANVAS_BLENDS.has(mode) ? 'source-over' : mode === 'linear-dodge' ? 'lighter' : (mode as GlobalCompositeOperation); }
export function blendFromLabel(label: unknown): BlendMode { return LAYER_BLEND_MODES.find((m) => m.label === label)?.id ?? 'normal'; }
export function blendLabel(mode: BlendMode): string { return LAYER_BLEND_MODES.find((m) => m.id === mode)?.label ?? 'Normal'; }

export type Sampling = 'nearest' | 'smooth' | 'high';
export const SAMPLING_LABELS: Record<Sampling, string> = { nearest: 'Nearest', smooth: 'Smooth', high: 'High quality' };
export function samplingFromLabel(label: unknown): Sampling { return (Object.keys(SAMPLING_LABELS) as Sampling[]).find((k) => SAMPLING_LABELS[k] === label) ?? 'high'; }

export interface Transform { x: number; y: number; w: number; h: number; rotation: number; flipX: boolean; flipY: boolean; sampling: Sampling }
export interface Mask { raster: Raster | null; enabled: boolean; linked: boolean; placement: Transform | null; /** Density in percent (100 or absent: the mask as painted) and feather in pixels (0 or absent), applied when drawn, never to the painted pixels. */ density?: number; feather?: number }
/** A vector mask (1.66.1): a path in document pixels showing the layer only inside it, or only outside it
 *  when `inverted`, its edge anti-aliased; with no outlines it shows all, or inverted hides all (Hide All). Linked, it
 *  moves and transforms with the layer; canvas changes carry it either way. */
export interface VectorMask { path: import('./paths').VectorPath; enabled: boolean; linked: boolean; inverted: boolean; /** Density in percent (100 or absent: as drawn) and feather in pixels (0 or absent), applied when drawn. */ density?: number; feather?: number }
export type AdjustmentKind = 'hsv' | 'levels' | 'curves' | 'exposure' | 'gradientMap' | 'grain' | 'filter' | import('./adjust-params').ParamKind;
export interface Adjustment { kind: AdjustmentKind; data: Record<string, unknown> }
/** Layer locks (the Lock row): transparency (paint only where there are pixels), image pixels
 *  (no painting, filling or filtering), position (no moving or transforming), all (every one of them). */
export interface FrameSpec { x: number; y: number; w: number; h: number; shape: 'rect' | 'ellipse' }
export interface LayerLocks { transparency?: boolean; pixels?: boolean; position?: boolean; all?: boolean; /** Auto-nesting: the layer stays in the artboard it is in (or out of all), however it is moved in the Layers panel. */ artboard?: boolean }

/** What made a picture generated on this computer: the prompt, seed, steps, LoRAs and the full parameters text. */
export interface GenerationInfo { prompt?: string; seed?: number; steps?: number; model?: string; sampler?: string; guidance?: number; loras?: Array<{ file: string; scale: number }>; parameters?: string }
export interface Layer {
  readonly id: ID;
  /** A reference picture for the generation dialogs: their References list starts with it chosen. */
  reference?: boolean;
  /** Layer styles drawn beneath the layer; absent or null for none. */
  effects?: LayerEffects | null;
  /** Blending Options (1.54.5, the parity plan's M2). Blend If: the layer's pixels shown only where this layer's
   *  value and the underlying composite's value fall inside each range, each end feathered between its two numbers
   *  (the split slider), on the grey (luminosity) or one channel. Knockout: where the layer has coverage, what lies
   *  below it down to the Background (deep) or to the bottom of its group (shallow) is punched through, the layer's
   *  own pixels showing at its fill. */
  blendIf?: BlendIf | null;
  knockout?: 'none' | 'shallow' | 'deep';
  /** Channel restrictions (Blending Options, Advanced): red, green and blue; a channel set false keeps what lies
   *  below it, the layer blending only into the others. Absent or null for all three. */
  blendChannels?: [boolean, boolean, boolean] | null;
  /** Blend Clipped Layers as Group: this layer and the layers clipped to it composite together first (each in its own
   *  mode against the group, not against what lies below), and that group blends in this layer's mode and opacity.
   *  Transparency Shapes Layer set false: effects and knockout are cast from the whole layer rectangle, not only its pixels. */
  blendClipped?: boolean;
  transparencyShapes?: boolean;
  /** A type layer's text, while its pixels are still the rendering of it; see `liveText`. */
  text?: TextSpec | null;
  /** A smart object's original pixels and live filter stack; `raster` shows the result. */
  smart?: SmartObject | null;
  /** A video layer (DEV_PLAN 33.4a): one raster per frame of its clip. `original` is the footage as loaded, `frames` the
   *  current, possibly painted, frames (they share Raster objects until a frame is altered); `raster` shows the frame
   *  at the playhead and is stored back into `frames` when the playhead leaves it. */
  video?: { frames: Raster[]; original: Raster[]; name: string; interpret?: FootageInterpretation; /** Show Altered Video off: the footage as loaded is shown in place of the painted frames. */ unaltered?: boolean } | null;
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
  /** Fill: the layer's own pixels at this share of its opacity, its layer styles at the full opacity;
   *  absent is 1. On an adjustment layer it acts as opacity does. */
  fill?: number;
  /** A folder drawn isolated even in Normal at full opacity (PSD's Normal group, as against Pass Through); a folder
   *  with another blend mode or less than full opacity is isolated whatever this says. Absent is pass-through. */
  isolate?: boolean;
  /** A colour label for finding the layer in the panel (1.87.3); absent is none. */
  label?: LayerLabel;
  /** Absent is unlocked. */
  locks?: LayerLocks;
  /** The settings a local model made this picture with; saved in the project, shown in File Info. */
  generation?: GenerationInfo;
  /** Layer > Link Layers (1.65.3): layers holding the same link move and transform together; a link one layer holds
   *  alone links nothing. Absent is unlinked. */
  link?: ID;
  /** A frame (the Frame tool, K): a folder whose mask is this shape; an image placed in it covers it. */
  frame?: FrameSpec | null;
  /** A fill layer's content (1.66.0); `raster` is its rendering over the whole canvas, drawn again when it changes. */
  fillContent?: FillContent | null;
  relight?: import('./relight').RelightContent | null;
  /** Layer > Vector Mask (1.66.1), beside `mask`; absent or null for none. */
  vectorMask?: VectorMask | null;
  blend: BlendMode;
  mask: Mask | null;
  clipId: ID | null;
  adjustment: Adjustment | null;
  shape: Record<string, unknown> | null;
}
/** Layer > New Fill Layer (1.66.0): a solid colour; a gradient (its stops resolved to colours, laid
 *  out across the canvas, or across what the layer's mask shows when `align`, at `angle` degrees, `scale` and `offset`
 *  as fractions of that frame); or a pattern (`scale` a fraction, `angle` degrees, its origin at the frame's corner
 *  when `link`, moved by `phase` pixels). The PSD format's own fields, so they travel in PSD files. */
export type FillContent =
  | { kind: 'solid'; color: RGB }
  | { kind: 'gradient'; stops: FillStop[]; style: 'linear' | 'radial' | 'angle' | 'reflected' | 'diamond'; angle: number; scale: number; reverse: boolean; dither: boolean; align: boolean; offset: Pt }
  | { kind: 'pattern'; pattern: ID; scale: number; angle: number; link: boolean; phase: Pt };
export interface FillStop { at: number; color: RGB; alpha: number; mid?: number }
/** A ruler guide: `axis: 'x'` is a vertical guide at x = `at`, `'y'` a horizontal one, in document pixels. */
export interface Artboard { x: number; y: number; w: number; h: number; background: RGB | null; /** The preset name a PSD gave the board (iPhone, A4), kept for re-save. */ preset?: string }

/** An artboard read back from saved data, every field checked; null when it is not one. */
export function artboardFromData(raw: unknown): Artboard | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>, n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const x = n(o.x), y = n(o.y), w = n(o.w), h = n(o.h);
  if (x === null || y === null || w === null || h === null || w < 1 || h < 1 || w > 30000 || h > 30000) return null;
  const b = o.background as Record<string, unknown> | null | undefined, c = (v: unknown): number => Math.round(clamp(n(v) ?? 0, 0, 255));
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), background: b && typeof b === 'object' ? { r: c(b.r), g: c(b.g), b: c(b.b) } : null, ...(typeof o.preset === 'string' && o.preset ? { preset: o.preset.slice(0, 80) } : {}) };
}

export interface Guide { axis: 'x' | 'y'; at: number; color?: string; board?: ID }
/** A note pinned to the document (the Note tool, 1.49.6), and the Count tool's marks: saved with it. */
export interface DocNote { id: ID; x: number; y: number; text: string; author?: string; color?: string }
export interface CountGroup { id: ID; name: string; color: string; hidden?: boolean }
/** A document's colour mode (1.50.2, the owner's walkthrough): RGB, Grayscale (8-bit grey), Bitmap (1-bit
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
/** A Layer Comp: per layer, any of visibility, position and appearance, plus a name and comment. */
export interface LayerComp {
  id: ID; name: string; comment: string; useVisibility: boolean; usePosition: boolean; useAppearance: boolean;
  layers: Record<ID, { visible?: boolean; x?: number; y?: number; opacity?: number; blend?: BlendMode; fill?: number; effects?: unknown; effectsHidden?: boolean }>;
}
/** A variable bound to a layer (Image > Variables, DEV_PLAN 29.9): its visibility, a type layer's text, or a pixel layer's image. */
export interface DocVariable { name: string; layer: ID; kind: 'visibility' | 'text' | 'pixels'; method?: 'fit' | 'fill' | 'asis' | 'conform'; /** Pixel Replacement: where the picture sits in the layer's box, 0 top left to 8 bottom right (4, the centre, when absent). */ align?: number; /** Pixel Replacement: false lets the picture run past the box (absent means it is clipped to the box). */ clip?: boolean }
/** A named row of values, one per variable name. */
export interface DataSet { name: string; values: Record<string, string> }
export interface Doc { /** Folders shown closed in the Layers panel: the panel's own state, mirrored from Project.collapsed and saved with the file, never a history step. */ collapsed?: ID[]; /** DEV_PLAN 36.14: Image Assets on; File > Save also writes the layers named like foo.png. Absent means off. */ assetsOnSave?: boolean; /** Width over height of one pixel (35.4 part b); absent means square. */ pixelAspect?: number; measureScale?: { pixels: number; length: number; units: string }; measurements?: Array<{ id: number; label: string; scale: number; units: string; area?: number; perimeter?: number; length?: number; angle?: number; count?: number; w?: number; h?: number; gray?: number; grayMin?: number; grayMax?: number; intDen?: number; cx?: number; cy?: number; /** Sixteen gray-level bins of the selection (0 to 255 in steps of 16), each the area in the record's squared units. */ hist?: number[] }>; multichannel?: { channels: { name: string; color: RGB; solidity: number; data: Raster }[] }; duotone?: { type: 'mono' | 'duo' | 'tri' | 'quad'; inks: { name: string; color: RGB; curve: number[] }[] }; variables?: DocVariable[]; dataSets?: DataSet[]; activeDataSet?: string | null; comps?: readonly LayerComp[]; activeComp?: ID | null; /** The layers' state before the first comp was applied, for Last Document State. Not saved. */ lastState?: LayerComp; depth?: 8 | 16 | 32; profile?: DocProfile; mode?: DocMode; palette?: readonly RGB[]; /** The Indexed Color entry whose pixels are clear. */ transparentIndex?: number; readonly id: ID; width: number; height: number; resolution: number; layers: readonly Layer[]; guides?: readonly Guide[]; slices?: readonly DocSlice[];notes?: readonly DocNote[]; counts?: readonly { x: number; y: number; /** The count group it belongs to; absent means the first. */ g?: ID }[]; /** Count groups (the Count tool): a name and a colour each, hidden or shown. Absent means one default group. */ countGroups?: readonly CountGroup[]; boxes?: readonly DocBox[]; globalLight?: GlobalLight; paragraphStyles?: readonly ParagraphStyle[]; characterStyles?: readonly CharacterStyle[]; alphas?: readonly AlphaChannel[]; meta?: DocMeta; /** 3D layers placed from a model, by layer id: the model's bytes in base64 and its pose, saved with the file so glb_edit works after reopening. */ glb?: Readonly<Record<ID, { name: string; view: object; data: string; depthId?: ID }>>; /** Saved layer styles kept with the file (the Styles panel mirrors them); each is a name, a group and the effects. */ stylePresets?: ReadonlyArray<{ id: string; name: string; effects: LayerEffects; group?: string }> }
/** An alpha channel (1.65.1): a selection saved with the document, `mask` null when nothing in it is selected. */
export interface AlphaChannel { readonly id: ID; readonly name: string; readonly mask: SelectionMask | null; /** Channel Options: the overlay colour, its opacity in percent, and whether the colour marks the masked or the selected area. Absent means red, 50 and masked. */ readonly color?: RGB; readonly opacity?: number; readonly indicates?: 'masked' | 'selected'; /** A spot channel: the colour is its ink, the opacity its solidity, and the mask is how much ink lands where. */ readonly spot?: boolean }

/** A user slice (Slice tool): a rectangle in document pixels with the web properties Slice Options will edit. */
/** Interpret Footage (DEV_PLAN 33.4): how a video layer's frames are read. `fps` is the footage's own rate (the
 *  timeline's when absent), `loop` how many times the clip plays, `alpha` how its transparency is read: 'ignore' makes
 *  every frame opaque, 'premultiplied' takes the colour back off `matte` (black when absent). */
export interface FootageInterpretation { fps?: number; loop?: number; alpha?: 'straight' | 'ignore' | 'premultiplied'; matte?: RGB }
export type SliceKind = 'image' | 'none';
export interface DocSlice { id: ID; name: string; x: number; y: number; w: number; h: number; layer?: ID; url?: string; alt?: string; /** Image (exported as a picture) or No Image (cell text only). */ kind?: SliceKind; /** Link target such as _blank. */ target?: string; /** Browser status bar message. */ message?: string; /** Cell text of a No Image slice. */ cell?: string; /** Background colour as #rrggbb; absent means none. */ bg?: string }
/** A layout box (Generate's region prompting): what the rectangle is for, in document pixels, with its words and name. */
export type BoxKind = 'new' | 'keep' | 'move' | 'remove' | 'reference' | 'text';
export interface DocBox { id: ID; kind: BoxKind; name: string; text: string; x: number; y: number; w: number; h: number }
export type ToolId = 'slice' | 'move' | 'artboard' |'marquee' | 'lasso' | 'objectSelect' | 'wand' | 'crop' | 'brush' | 'remove' | 'spotHealing' | 'healingBrush' | 'patch' | 'cloneStamp' | 'smear' | 'gradient' | 'shape' | 'pathSelect' | 'directSelect' | 'freeformPen' | 'curvaturePen' | 'pen' | 'type' | 'eyedropper' | 'hand' | 'zoom' | 'bucket' | 'dodge' | 'burn' | 'sponge' | 'quickSelect' | 'historyBrush' | 'mixer' | 'artHistory' | 'frame' | 'convertPoint' | 'selectionBrush' | 'pencil' | 'eraser' | 'magicEraser' | 'patternStamp' | 'colorReplace' | 'backgroundEraser' | 'colorSampler' | 'ruler' | 'note' | 'markup' | 'count' | 'boxes' | 'contentAwareMove' | 'redEye' | 'rotateView' | 'relight' | 'idle';

/** pixels follows this computer's memory (1.53.4, setPixelBudget from the engine's capabilities); 100 megapixels until known. */
export const LIMITS: { readonly side: number; pixels: number; readonly layers: number; readonly depth: number } = { side: 30000, pixels: 100_000_000, layers: 10000, depth: 64 };
const pixelCaps = { auto: 100_000_000, user: 0 };
function applyPixelCaps(): void { LIMITS.pixels = pixelCaps.user > 0 ? Math.min(pixelCaps.auto, pixelCaps.user) : pixelCaps.auto; }
export function setPixelBudget(pixels: number): void { if (Number.isFinite(pixels) && pixels >= 100_000_000) { pixelCaps.auto = Math.min(250_000_000, Math.round(pixels)); applyPixelCaps(); } }
/** The Memory Usage preference (PC-AU-0155): a smaller document cap than the computer allows; 0 or less leaves the automatic one. */
export function setPixelLimit(pixels: number): void { pixelCaps.user = Number.isFinite(pixels) && pixels > 0 ? Math.round(pixels) : 0; applyPixelCaps(); }

/** A background job the person can stop: bands done of bands planned, and whether a stop was asked for. */
export interface EngineJob { id: number; name: string; done: number; total: number; cancelled: boolean; startedAt: number }

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
export interface DropShadowEffect { enabled: boolean; color: RGB; opacity: number; blend: BlendMode; angle: number; distance: number; size: number; contour?: ContourId; useGlobal?: boolean; spread?: number; noise?: number; knockout?: boolean; antiAlias?: boolean }
/** Outer Glow: `spread` (0 to 100) grows the matte by that share of `size` before it softens; `technique` precise is a distance ramp
 *  instead of a blur; `range` (1 to 100) is the share of the glow's strength the contour is spread over; `noise` grains its opacity. */
export interface OuterGlowEffect { enabled: boolean; color: RGB; opacity: number; blend: BlendMode; size: number; contour?: ContourId; spread?: number; noise?: number; technique?: 'precise'; range?: number; antiAlias?: boolean }
/** `position`: Outside (the default, drawn beneath), Inside or Center (drawn over the layer). */
/** A stroke's gradient fill: `from` at the start to `to` along `angle` (linear) or from the centre (radial). */
export interface StrokeGradient { from: RGB; to: RGB; angle: number; style: 'linear' | 'radial'; reverse: boolean }
export interface StrokeEffect { enabled: boolean; color: RGB; opacity: number; size: number; position?: 'outside' | 'inside' | 'center'; gradient?: StrokeGradient }
/** `choke` (0 to 100) contracts the shadow's matte by that share of `size` before it softens; `noise` (0 to 100) grains its opacity. */
export interface InnerShadowEffect { enabled: boolean; color: RGB; opacity: number; blend: BlendMode; angle: number; distance: number; size: number; contour?: ContourId; useGlobal?: boolean; choke?: number; noise?: number; antiAlias?: boolean }
/** Inner Glow: `technique` softer (blurred) or precise (a distance ramp), `source` the edge or the centre, plus choke and noise as Inner Shadow's. */
export interface InnerGlowEffect { enabled: boolean; color: RGB; opacity: number; blend: BlendMode; size: number; contour?: ContourId; technique?: 'precise'; source?: 'center'; choke?: number; noise?: number; antiAlias?: boolean }
export interface ColorOverlayEffect { enabled: boolean; color: RGB; opacity: number; blend: BlendMode }
/** A gradient across the layer's bounds, kept to its silhouette: from `from` to `to` along `angle` (degrees
 *  counter-clockwise from the right, so 90 runs bottom to top), or outward from the centre when radial; `scale` stretches
 *  it about the centre, and `reverse` swaps the ends. */
/** Gradient Overlay. `stops` (36.8), when present, is the whole gradient (positions 0 to 1, each colour with its own
 *  alpha) and wins over `from` and `to`, which stay its two ends for the two-colour editor; editing either drops it. */
export type OverlayGradientStyle = 'linear' | 'radial' | 'angle' | 'reflected' | 'diamond';
export interface GradientOverlayEffect { enabled: boolean; from: RGB; to: RGB; opacity: number; blend: BlendMode; angle: number; style: OverlayGradientStyle; scale: number; reverse: boolean; stops?: GradientOverlayStop[]; dither?: boolean; method?: OverlayGradientMethod; smoothness?: number }
/** How a Gradient Overlay blends between stops: classic (straight in sRGB, the default), perceptual (in a gamma 1.6 space,
 *  between the two) or linear (in linear light, so mid tones run lighter). `smoothness` (1 to 100) eases each
 *  stretch between two stops with a smooth step by that share. */
export type OverlayGradientMethod = 'classic' | 'perceptual' | 'linear';
export interface GradientOverlayStop { at: number; color: RGB; alpha: number }
/** A Gradient Overlay's stops read back safely: two to 64, positions and alphas held to 0..1, sorted. */
export function overlayStopsFrom(raw: unknown): GradientOverlayStop[] | undefined {
  if (!Array.isArray(raw) || raw.length < 2) return undefined;
  const out: GradientOverlayStop[] = [];
  for (const s of raw.slice(0, 64)) {
    if (!s || typeof s !== 'object') return undefined;
    const o = s as { at?: unknown; color?: unknown; alpha?: unknown }, c = o.color as { r?: unknown; g?: unknown; b?: unknown } | null;
    if (typeof o.at !== 'number' || !c || typeof c.r !== 'number' || typeof c.g !== 'number' || typeof c.b !== 'number') return undefined;
    out.push({ at: Math.min(1, Math.max(0, o.at)), color: { r: c.r, g: c.g, b: c.b }, alpha: typeof o.alpha === 'number' ? Math.min(1, Math.max(0, o.alpha)) : 1 });
  }
  return out.sort((a, b) => a.at - b.at);
}
/** Bevel and Emboss: the silhouette, softened over `size`, taken as a height map and lit from `angle` (as Drop Shadow's)
 *  at `altitude` degrees; slopes facing the light take the highlight, those facing away the shadow. Inner shades inside
 *  the edge, outer outside it, emboss both, pillow both with the outside pressed in, stroke the layer's stroke; `down`
 *  swaps light and dark; a chisel `technique` slopes evenly from the edge. */
export interface BevelEffect { enabled: boolean; style: 'inner' | 'outer' | 'emboss' | 'pillow' | 'stroke'; depth: number; down: boolean; size: number; soften: number; angle: number; altitude: number; highlight: RGB; highlightOpacity: number; highlightBlend: BlendMode; shadow: RGB; shadowOpacity: number; shadowBlend: BlendMode; gloss?: ContourId; useGlobal?: boolean; technique?: 'chiselHard' | 'chiselSoft'; contour?: BevelContour; texture?: BevelTexture; antiAlias?: boolean }
/** Bevel & Emboss's Contour (1.65.2): the height through `id` over `range` (0.01 to 1). */
export interface BevelContour { enabled: boolean; id: ContourId; range: number }
/** Bevel & Emboss's Texture (1.65.2): a pattern's brightness added to the height, tiled from the layer's corner. */
export interface BevelTexture { enabled: boolean; pattern: string; scale: number; depth: number; invert: boolean; link?: boolean }
/** Satin: the silhouette offset both ways along `angle` by `distance`, each copy softened over `size`, their difference
 *  kept inside the silhouette as a silky shading; `invert` shades where they agree instead. */
export interface SatinEffect { enabled: boolean; color: RGB; opacity: number; blend: BlendMode; angle: number; distance: number; size: number; invert: boolean; contour?: ContourId; antiAlias?: boolean }
/** Pattern Overlay: pattern `pattern` (an id) tiled from the layer's top-left corner at `scale`, kept to its silhouette,
 *  beneath the other overlays. */
export interface PatternOverlayEffect { enabled: boolean; pattern: string; opacity: number; blend: BlendMode; scale: number; angle?: number; link?: boolean; phaseX?: number; phaseY?: number }
export interface LayerEffects { dropShadow: DropShadowEffect; outerGlow: OuterGlowEffect; stroke: StrokeEffect; innerShadow: InnerShadowEffect; innerGlow: InnerGlowEffect; colorOverlay: ColorOverlayEffect; gradientOverlay: GradientOverlayEffect; bevel: BevelEffect; satin: SatinEffect; patternOverlay: PatternOverlayEffect; extra?: EffectExtras; hidden?: boolean; blendInterior?: boolean; layerMaskHides?: boolean }
/** More instances of the effects a PSD can hold several of (up to ten in all, so nine here), drawn after the main
 *  one, each above the last. */
export interface EffectExtras { dropShadow?: DropShadowEffect[]; stroke?: StrokeEffect[]; innerShadow?: InnerShadowEffect[]; colorOverlay?: ColorOverlayEffect[]; gradientOverlay?: GradientOverlayEffect[] }
export type MultiEffect = keyof EffectExtras;
export const MULTI_EFFECTS: readonly MultiEffect[] = ['dropShadow', 'stroke', 'innerShadow', 'colorOverlay', 'gradientOverlay'];
export const MAX_EXTRA = 9;
/** Every instance of a multi effect: the main one, then its extras. */
export function instances<K extends MultiEffect>(fx: LayerEffects, k: K): Array<LayerEffects[K]> {
  return [fx[k], ...((fx.extra?.[k] as Array<LayerEffects[K]> | undefined) ?? [])];
}

/** The usual starting values: a 75% multiplied black shadow at 120 degrees, 5 px away and 5 px soft; a 75% screened
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
    outerGlow: { enabled: g.enabled === true, color: rgb(g.color, d.outerGlow.color), opacity: num(g.opacity, 0.75, 0, 1), blend: blend(g.blend, 'screen'), size: num(g.size, 5, 0, 500) },
    stroke: { enabled: k.enabled === true, color: rgb(k.color, d.stroke.color), opacity: num(k.opacity, 1, 0, 1), size: num(k.size, 3, 1, 500) },
    innerShadow: { enabled: is.enabled === true, color: rgb(is.color, d.innerShadow.color), opacity: num(is.opacity, 0.75, 0, 1), blend: blend(is.blend, 'multiply'), angle: num(is.angle, 120, -360, 360), distance: num(is.distance, 5, 0, 1000), size: num(is.size, 5, 0, 250) },
    innerGlow: { enabled: ig.enabled === true, color: rgb(ig.color, d.innerGlow.color), opacity: num(ig.opacity, 0.75, 0, 1), blend: blend(ig.blend, 'screen'), size: num(ig.size, 5, 0, 500) },
    colorOverlay: { enabled: co.enabled === true, color: rgb(co.color, d.colorOverlay.color), opacity: num(co.opacity, 1, 0, 1), blend: blend(co.blend, 'normal') },
    gradientOverlay: { enabled: go.enabled === true, from: rgb(go.from, d.gradientOverlay.from), to: rgb(go.to, d.gradientOverlay.to), opacity: num(go.opacity, 1, 0, 1), blend: blend(go.blend, 'normal'), angle: num(go.angle, 90, -360, 360), style: go.style === 'radial' || go.style === 'angle' || go.style === 'reflected' || go.style === 'diamond' ? go.style : 'linear', scale: num(go.scale, 1, 0.1, 1.5), reverse: go.reverse === true, ...(overlayStopsFrom(go.stops) ? { stops: overlayStopsFrom(go.stops) } : {}) },
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
  if (bt) fx.bevel.texture = { enabled: bt.enabled === true, pattern: typeof bt.pattern === 'string' && bt.pattern ? bt.pattern.slice(0, 120) : 'builtin:checker', scale: num(bt.scale, 1, 0.01, 10), depth: num(bt.depth, 1, -10, 10), invert: bt.invert === true, ...(bt.link === false ? { link: false } : {}) };
  if (k.position === 'inside' || k.position === 'center') fx.stroke.position = k.position;
  const kg = k.gradient && typeof k.gradient === 'object' ? (k.gradient as Record<string, unknown>) : null;
  if (kg) fx.stroke.gradient = { from: rgb(kg.from, { r: 0, g: 0, b: 0 }), to: rgb(kg.to, { r: 255, g: 255, b: 255 }), angle: num(kg.angle, 90, -360, 360), style: kg.style === 'radial' ? 'radial' : 'linear', reverse: kg.reverse === true };
  for (const [dst, src] of [[fx.innerShadow, is], [fx.innerGlow, ig]] as const) {
    if (typeof src.choke === 'number' && src.choke > 0) dst.choke = num(src.choke, 0, 0, 100);
    if (typeof src.noise === 'number' && src.noise > 0) dst.noise = num(src.noise, 0, 0, 100);
  }
  if (ig.technique === 'precise') fx.innerGlow.technique = 'precise';
  if (ig.source === 'center') fx.innerGlow.source = 'center';
  if (s.knockout === true) fx.dropShadow.knockout = true;
  if (go.dither === true) fx.gradientOverlay.dither = true;
  if (go.method === 'perceptual' || go.method === 'linear') fx.gradientOverlay.method = go.method;
  if (typeof go.smoothness === 'number' && go.smoothness > 0) fx.gradientOverlay.smoothness = num(go.smoothness, 0, 1, 100);
  if (g.technique === 'precise') fx.outerGlow.technique = 'precise';
  if (typeof g.range === 'number' && g.range < 100) fx.outerGlow.range = num(g.range, 100, 1, 100);
  for (const [dst, src] of [[fx.dropShadow, s], [fx.outerGlow, g]] as const) {
    if (typeof src.spread === 'number' && src.spread > 0) dst.spread = num(src.spread, 0, 0, 100);
    if (typeof src.noise === 'number' && src.noise > 0) dst.noise = num(src.noise, 0, 0, 100);
  }
  for (const [dst, src] of [[fx.dropShadow, s], [fx.outerGlow, g], [fx.innerShadow, is], [fx.innerGlow, ig], [fx.satin, sa], [fx.bevel, bv]] as const) if (src.antiAlias === true) dst.antiAlias = true;
  const satinContour = contour(sa.contour);
  if (satinContour) fx.satin.contour = satinContour;
  if (typeof po.angle === 'number' && po.angle !== 0) fx.patternOverlay.angle = num(po.angle, 0, -360, 360);
  if (po.link === false) fx.patternOverlay.link = false;
  if (typeof po.phaseX === 'number' && po.phaseX !== 0) fx.patternOverlay.phaseX = num(po.phaseX, 0, -4096, 4096);
  if (typeof po.phaseY === 'number' && po.phaseY !== 0) fx.patternOverlay.phaseY = num(po.phaseY, 0, -4096, 4096);
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
  if (o.blendInterior === true) fx.blendInterior = true;
  if (o.layerMaskHides === false) fx.layerMaskHides = false;
  return effectsPresent(fx) ? fx : null;
}

/** A type layer's text and how it is set. `size` is in document pixels; `lineHeight` multiplies it from one baseline
 *  to the next. `rendered` pairs the spec with the raster it was drawn into (id and version): once the pixels are
 *  edited the pair breaks and the layer is plain pixels, as painting on type rasterizes it. */
/** `tracking`: extra space between characters in thousandths of an em; `kerning`: the font's
 *  own pair kerning ('metrics') or none ('none'). */
/** box: paragraph text's box, wrapped to its width and clipped at its height (absent: point text); direction: vertical
 *  type stacks upright characters top to bottom in columns from right to left (1.49.7, the owner's tool list). */
/** antialias (1.50.4, the tool audit): the method, of those formvis renders truly: None (every edge pixel on or
 *  off), Sharp (steeper edges) or Smooth (absent). */
/** features (DEV_PLAN 32.6b): OpenType feature tags turned on ('smcp'), and '-liga' or '-calt' for a default feature off. */
/** hyphenate: paragraph text breaks a word that does not fit at a syllable-like point with a hyphen; language: a BCP 47 tag the canvas shapes the text for. */
export type TextShaping = 'default' | 'eastAsian' | 'middleEastern' | 'southAsian';
/** Character and paragraph attributes beyond the basics. caps: all capitals, or small capitals (the font's smcp when it has
 *  one, else lower case set as capitals at 80 percent); scaleX and scaleY: horizontal and vertical scale in percent;
 *  baselineShift: pixels, up positive; variations: variable font axis values ('wght': 600); indentFirst, indentLeft,
 *  indentRight, spaceBefore, spaceAfter: pixels; lastLine: where Justify puts a paragraph's last line (default left). */
export interface TextExtras {
  weight?: number; angle?: number; caps?: 'all' | 'small'; scaleX?: number; scaleY?: number; baselineShift?: number; underline?: boolean; strike?: boolean;
  variations?: Record<string, number> | null;
  indentFirst?: number; indentLeft?: number; indentRight?: number; spaceBefore?: number; spaceAfter?: number; lastLine?: 'left' | 'center' | 'right' | 'all';
  /** bidi: the paragraph's base direction (right-to-left sets Arabic and Hebrew runs and punctuation from the right); unset follows Language Options. */
  bidi?: 'ltr' | 'rtl';
}
/** OpenType features set on one character range (UTF-16 offsets into `content`, end exclusive): `on` and `off` are tags the
 *  range turns on or off over the layer's own `features`. */
export interface FeatureRun extends RunAttrs { start: number; end: number; on: string[]; off: string[] }
/** Character attributes one run sets over the layer's own (UTF-16 offsets as for features). A field left out inherits the
 *  layer's; `tracking` is in thousandths of an em, `baselineShift` in pixels (up positive), `size` in pixels, `language`
 *  a BCP 47 tag. Runs are kept sorted and apart; opentype.ts cleanRuns, withRunAttrs and styleSegments are the only readers. */
export interface RunAttrs { family?: string; size?: number; color?: RGB; weight?: number; bold?: boolean; italic?: boolean; baselineShift?: number; tracking?: number; language?: string; underline?: boolean; strike?: boolean; caps?: 'all' | 'small'; scaleX?: number; scaleY?: number }
export interface TextSpec extends TextExtras { runs?: FeatureRun[]; shaping?: TextShaping; hyphenate?: boolean; language?: string; features?: string[] | null; antialias?: 'none' | 'sharp' | 'crisp' | 'strong' | 'smooth' | 'windows-lcd' | 'windows'; box?: { w: number; h: number } | null; direction?: 'horizontal' | 'vertical'; content: string; family: string; size: number; color: RGB; align: 'left' | 'center' | 'right' | 'justify'; bold: boolean; italic: boolean; lineHeight: number; tracking: number; kerning: TextKerning; warp?: TextWarp | null; onPath?: TextPath | null; style?: ID | null; charStyle?: ID | null; rendered?: string }
/** A character style (DEV_PLAN 32.6c): only the fields it sets override the type layer's own; the layer links it by `TextSpec.charStyle`. */
export interface CharacterStyle extends Pick<TextExtras, 'caps' | 'scaleX' | 'scaleY' | 'baselineShift' | 'underline' | 'strike' | 'variations'> { id: ID; name: string; family?: string; size?: number; color?: RGB; bold?: boolean; italic?: boolean; tracking?: number; features?: string[] }
/** A paragraph style (Window > Paragraph Styles): a named set of type settings kept in the document; type layers linked
 *  to it by TextSpec.style take its settings, and redefining it updates every one of them. */
export interface ParagraphStyle extends Pick<TextExtras, 'indentFirst' | 'indentLeft' | 'indentRight' | 'spaceBefore' | 'spaceAfter' | 'lastLine'> { id: ID; name: string; family: string; size: number; color: RGB; align: 'left' | 'center' | 'right' | 'justify'; bold: boolean; italic: boolean; lineHeight: number; tracking: number; kerning: TextKerning }
/** Type on a path: the path's points in the layer's own pixels (a frame around the path, so editing the text never moves
 *  the layer), where the text starts along it (Start Offset, a percentage of its length), and the frame's size. */
export interface TextPath { points: Pt[]; offset: number; frame: { w: number; h: number }; /** The type hangs on the other side of the path. */ flip?: boolean }
export type TextKerning = 'metrics' | 'none' | 'optical';
/** Warp Text: a style, its orientation, and Bend, Horizontal and Vertical Distortion (-100 to 100). */
export type WarpStyle = 'arc' | 'arcLower' | 'arcUpper' | 'arch' | 'bulge' | 'shellLower' | 'shellUpper' | 'flag' | 'wave' | 'fish' | 'rise' | 'fisheye' | 'inflate' | 'squeeze' | 'twist';
export interface TextWarp { style: WarpStyle; orientation: 'horizontal' | 'vertical'; bend: number; horizontal: number; vertical: number }

/** A smart filter: a filter kind and its settings (the noise seed among them), re-run on the smart object's source
 *  whenever the stack changes. */
export interface SmartFilter { id: ID; kind: string; settings: Record<string, unknown>; enabled: boolean; /** Blending Options: the mode the filter's result is laid over the image before it in (absent: normal) and its opacity in percent (absent: 100). */ blend?: BlendMode; opacity?: number }
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
/** Warp, Puppet Warp or Perspective Warp kept as the smart object's live transform: the control data in document pixels,
 *  applied to the render (source plus filters) afresh every time it changes. `base` maps that render's pixels to the
 *  document before the warp, `pad` is the filter padding around the source, `at` the layer transform the last render set. */
export type SmartDeformData =
  | { kind: 'mesh'; gw: number; gh: number; points: Array<[number, number]>; us: number[]; vs: number[] }
  | { kind: 'puppet'; from: Array<[number, number]>; to: Array<[number, number]>; rot: number[]; depth: number[]; mode: 'rigid' | 'normal' | 'distort'; density: 'fewer' | 'normal' | 'more'; expansion: number }
  | { kind: 'perspective'; planes: Array<{ src: Array<[number, number]>; dst: Array<[number, number]> }> };
export type SmartDeform = SmartDeformData & { base: readonly [number, number, number, number, number, number]; pad: number; at: Transform };
/** A smart object's contents as a layered document of its own, kept whole (groups, adjustment, shape, type and smart
 *  object layers stay live inside it); `source` is its flattened render. Saved with the project, nested to any depth. */
export interface NestedContents { width: number; height: number; resolution?: number; layers: Layer[] }
export interface SmartObject { source: Raster; filters: SmartFilter[]; nested?: NestedContents | null; stack?: SmartStack | null; warp?: Pt[] | null; warpAt?: Transform | null; deform?: SmartDeform | null; filterMask?: Raster | null; filterMaskEnabled?: boolean; link?: SmartLink | null }

/** Smart filters read back from saved data, checked. */
export function smartFiltersFrom(raw: unknown): SmartFilter[] {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { filters?: unknown }).filters) ? (raw as { filters: unknown[] }).filters : [];
  return list.flatMap((f) => {
    if (!f || typeof f !== 'object') return [];
    const o = f as Record<string, unknown>;
    if (typeof o.kind !== 'string' || !o.settings || typeof o.settings !== 'object') return [];
    const blend = BLEND_MODES.find((m) => m.id === o.blend)?.id, opacity = typeof o.opacity === 'number' && Number.isFinite(o.opacity) ? Math.min(100, Math.max(0, o.opacity)) : undefined;
    return [{ id: typeof o.id === 'string' && o.id ? o.id : uid(), kind: o.kind, settings: o.settings as Record<string, unknown>, enabled: o.enabled !== false, ...(blend && blend !== 'normal' ? { blend } : {}), ...(opacity !== undefined && opacity < 100 ? { opacity } : {}) }];
  });
}

/** A shape layer: a path with a fill colour, a stroke centred on it, or both. `origin` is where its raster was
 *  rendered, so a later move of the layer can carry the path along. */
/** dash and align (1.52.8, the tool audit), the stroke options: solid, dashed or dotted; inside, centred
 *  on or outside the path (an open path is always centred). */
export interface ShapeStroke { color: RGB; width: number; dash?: 'solid' | 'dashed' | 'dotted'; align?: 'inside' | 'center' | 'outside'; cap?: 'butt' | 'round' | 'square'; join?: 'miter' | 'round' | 'bevel'; miter?: number; dashes?: number[]; dashOffset?: number; opacity?: number; /** Paints the stroke with a gradient across the shape's bounds in place of `color`. */ gradient?: ShapeGradient | null; /** Paints the stroke with a tiled pattern in place of `color` (a gradient wins when both are set). */ pattern?: ShapePattern | null }
/** A gradient fill across the shape's bounds: linear at `angle` degrees (0 runs left to right), radial from the centre, or
 *  angle (a sweep from the centre). The fill colour stays as the fallback and the colour a gradient-less restyle starts from. */
export interface ShapeGradient { type: 'linear' | 'radial' | 'angle'; angle: number; stops: Array<{ at: number; color: RGB; alpha?: number }> }
/** A pattern from the library tiled across the shape's bounds, `scale` times its size; it paints in place of the colour. */
export interface ShapePattern { id: ID; scale: number }
export interface ShapeStyle { fill: RGB | null; stroke: ShapeStroke | null; gradient?: ShapeGradient | null; pattern?: ShapePattern | null }
/** The parameters a polygon, star or triangle shape layer was drawn from, with the box it was fitted to (in the path's own
 *  frame), so the sides, the star's inset and the corner radius can be changed after the fact. A hand edit of the
 *  outline drops it. */
export interface LiveShape { kind: 'polygon' | 'star' | 'triangle'; sides: number; inset: number; radius: number; box: Rect }
export interface VectorLayer { path: import('./paths').VectorPath; fill: RGB | null; stroke?: ShapeStroke | null; gradient?: ShapeGradient | null; pattern?: ShapePattern | null; live?: LiveShape; origin: Pt }
