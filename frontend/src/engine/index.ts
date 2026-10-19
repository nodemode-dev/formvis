import { applyLut, inkOf, renditionOf, type ColourLut, type Ink, type Lut3x4, type Lut4 } from './colour-lut';
import { composeChannels, labGreyValue, rasterFromChannels, strokeChannels, strokeLabChannel } from './channels';
import { trapInk } from './trap';
import { deriveRegion, deriveWhole, renderRegion, type DeriveTables } from './derive';
import { sameImage, solidFillPixels, type SolidFill } from './fill-recipe';
import { DEFAULT_MIXER, mixerSource, mixerStart, windowSampler, type MixerSettings, type MixerState } from './mixer';
import { artHistoryTexture, type ArtStyle } from './art-history';
import { decodeLab, labFromFloats, labFromRgba, labToSrgb, renderLab } from './lab';
import { composeFloat, setStyleDrawer } from './compose-float';
import { deepFromRaster, deepToLinear, deepToned, rasterFromDeep, resampleDeep, strokeDeep } from './deep';
import type { ChannelPixels, DeepPixels, DocProfile } from './types';
import { applyComp, captureComp, type CompOptions } from './layer-comps';
import { captureFrame, frameLayers, type Frame, type FrameLayer, type Timeline } from './timeline';
import { newVideoTimeline, sampleToFrames, stateAt, valueAt, type FadeColor, type VideoTimeline } from './video-timeline';
import { fillVector, mapPath, pathBounds, samplePath, shiftPath, tracePath, type NamedPath, type PathOp, type PathSet, type SubPath, type VectorPath } from './paths';
import { simplify, smoothAnchors } from './curve-fit';
export { PATH_OPS, type PathOp } from './paths';
import { charStyleOf, defaultText, liveText, loadTextFont, renderText, styleOf, textKey, withCharStyle, withStyle } from './text';
import type { CharacterStyle } from './types';
import { Emitter } from './events';
import { bumpMap, heightField, heightFromNormal, normalMap } from './normal-map';
import * as VR from './variables';
import type { DocVariable, LayerLabel } from './types';
import type { RelightContent } from './relight';
import { History, type HistoryEntry, type PixelPatch, type Snapshot } from './history';
import { Renderer, renderDoc, type LayerOverride } from './renderer';
import { applyDuotoneLut, curveAt, DUOTONE_COUNT, duotoneLut, type Duotone } from './duotone';
import { compositeChannels, splitChannels } from './multichannel';
import { PixelStroke, dropSpareSurfaces, sameBytes, spareBytes, strokeWindowFrom, warmStrokeSurfaces } from './stroke';
import { PREVIEW, TiledRaster } from './tiled';
import { SelectionMask, traceOutline, type SelectionMode } from './selection';
import { CANVAS_PIXELS, CANVAS_SIDE, Raster, createSurface, ctxOf, toBlob, type Surface, type Ctx2D } from './surface';
import { projectBack, type PanoramaLink } from './panorama';
import { applyMat, boundsOf, contains, integral, intersectRect, invert, isAxisAligned, mul, placement, rotation, sameTransform, scaling, setMat, transformBounds, translation, unionRect, type Mat } from './geometry';
import { ancestors, byId, descendantIds, groupIsolated, hierarchy, isDescendant } from './tree';
import { dragged, following, rounded, type DragMode } from './transform';
import { againQuad, carried, cornersOf, cropWarp, distortDragged, distortUsable, maskEdgeTone, visibleBounds, warpRaster, type DistortMode, type Warped, imageCorners, homography, project, inverse3 } from './distort';
import { withResolution } from './dpi';
import { antialiasMask, levelsKernel, wandMask } from './kernels';
import { Project } from './project';
import { DocViews, type DocView, type FloatRect } from './doc-views';
import { computeStack, type StackMode } from './stack-modes';
import * as LS from './layer-structure';
import * as LM from './layer-masks';
import * as FS from './file-scripts';
import * as PM from './pixel-move';
import * as TC from './transform-commit';
import * as PO from './paint-ops';
import * as SO from './select-ops';
import * as IE from './image-edit';
import { diffRegions } from './image-diff';
import * as DS from './document-size';
import * as AB from './artboard-ops';
import * as GD from './guides-ops';
import * as PR from './profile-ops';
import * as NT from './notes-ops';
import * as SM from './smart-ops';
import * as SOB from './smart-object-ops';
import * as MO from './mode-ops';
import * as SN from './snapshot-ops';
import * as FR from './frame-ops';
import * as PA from './path-ops';
import * as TX from './text-ops';
import * as VD from './video-ops';
import * as TE from './transform-entry';
import { type DocMode, BLEND_MODES, LIMITS, clamp, compositeOp, docTransform, newLayer, uid, blendIfActive, type BlendIf, type BlendMode, type Doc, type Guide, type ID, type Layer, type LayerLocks, type Mask, type Pt, type Rect, type RGB, type ToolId, type Transform, type ParagraphStyle, effectsActive, type LayerEffects, type TextSpec, type SmartFilter, type SmartLink, type SmartObject, type ShapeStroke, type ShapeStyle, type FootageInterpretation, effectsFromData, type Artboard, artboardFromData, type AlphaChannel, effectsPresent } from './types';
import { allPatterns, patternById } from './patterns';
import { fillFrame, fillName, renderFill } from './fill-layers';
import type { FillContent, VectorMask } from './types';
import { boxChange, followVector, hasOutline, movedVector, vectorCoverage } from './vector-mask';

export * from './types';
export * from './geometry';
export { Project } from './project';
export { Viewport } from './viewport';
export type { DocView, FloatRect } from './doc-views';
export { SelectionMask } from './selection';
export type { SelectionMode } from './selection';
export { Raster, createSurface, ctxOf, sizeSurface, toBlob } from './surface';
export type { Surface, Ctx2D } from './surface';
export { HANDLES } from './transform';
export type { DragMode } from './transform';
export { hierarchy, byId } from './tree';
export { runFilterOffThread } from './filter-jobs';
export type { FilterSettings } from './filter-jobs';
export type { Entry as HierarchyEntry } from './tree';
import { ADJUSTMENT_LABELS, autoLevels, defaultAdjustmentData, desaturatePixels, equalizePixels, replaceColorPixels, type ReplaceColorSettings } from './adjust';
import { fromGray, gaussianBlur, histogram, resizeMask, toGray } from './filters';
import { APPLY_CHANNELS, APPLY_MODES, applyImagePixels, channelSource, coverageSource, maskStrength, type ApplyChannel, type ApplyMode } from './apply-image';
import { averageImage } from './filters-lib/blur';
import type { LibFrame, LibImage, LibPath } from './filter-library';
import type { FilterKind, FilterSettings } from './filter-jobs';
import { POOL_FROM, bandPlan, bandPoolReady, bandPoolSize, runBandOnPool } from './band-pool';
import { sharpenSample } from './filters-more';
import { diamondFill, presetById, reflectStops, resolveStops, type GradientType } from './gradients';
import { convexQuad, evenSpacing, meshSurfacePoint, meshWarpImage, removeSplit, splitGrid, type P2 } from './mesh-warp';
import { liquifyImage, type LiquifyField } from './liquify';
import { puppetImage } from './puppet';
import { applyH, convexQuadTLTRBRBL, homography as quadHomography, perspectiveImage, straighten, type Plane, type Quad } from './perspective';
import { findWires } from './distractions';
import type { SampledTip } from './abr';
import { DEFAULT_GLOBAL_LIGHT, scaledEffects, type GlobalLight } from './style-extras';
export { CONTOURS, DEFAULT_GLOBAL_LIGHT, withGlobalLight, type ContourId, type GlobalLight } from './style-extras';
import { mergeMeta, type DocMeta, type MetaPatch } from './doc-meta';
export { COPYRIGHT_STATUSES, META_TEXT, cleanMeta, metaWritable, mergeMeta, parseKeywords, sameMeta, tabName, type CameraData, type CopyrightStatus, type DocMeta } from './doc-meta';
import { UPRIGHT, allBrushPresets, defaultShape, noDynamics, noSymmetry, pressureOption, shapeActive, type BrushSymmetry, type BrushDynamics, type BrushPreset, type BrushShape, type PenPose } from './brush-dynamics';
import { DEFAULT_PATH_SHAPE, boxedShapePath, linePath, type PathShapeKind, type PathShapeOptions } from './shape-paths';
import { markupPath, type MarkupKind } from './markup';
import { allCustomShapes } from './custom-shapes';
import { traceAlpha } from './trace-outline';
export { CUSTOM_SHAPES, allCustomShapes, addCustomShape, loadCustomShapes } from './custom-shapes';
import { FILL_DEFAULTS, WarpStroke, contentFill, diffusionFill, frequencySplit, ringVariance, SMOOTH_RING_VARIANCE, fillTransparent, healFromSource, premultiply, scaleHealCorrection, spotHeal, unpremultiply, type FillOptions, type HealBlend, type HealMode, type HealSample } from './retouch';
import { dissolveNoise } from './blend';
import { LUT3_N, adjustmentLut, adjustmentLut3 } from './lut';
import { decontaminate } from './select-mask';
import { alphaToMask, defringe, distanceSquared, removeMatte } from './matting';
import { alphasMoved, alphasRedrawn, nextAlphaName } from './alphas';
import { CALC_COLOR_CHANNELS, CALC_MODES, blendGreys, channelOf, invertGrey, type CalcColorChannel, type CalcMode } from './calculations';

/** One Calculations source: a layer (id or name, or Merged), a channel and whether it is inverted. */
export interface CalcSource { layer?: string; channel?: string; invert?: boolean; doc?: string }
export interface CalcOptions { source1: CalcSource; source2: CalcSource; mode?: CalcMode; opacity?: number; scale?: number; offset?: number; mask?: string; result?: 'channel' | 'document' | 'selection'; name?: string }

/** One entry of the GPU display's layer list (gpuLayers): a pixel layer's image, or an adjustment's lookup table applied
 *  to what is below it (per channel, 256 x 1; or 3D, 52 x 52 x 52 packed into 2704 x 52, with lut3 set). */
export interface GpuLayerSpec { image: Surface | null; lut?: Uint8Array; lut3?: boolean; mask?: GpuMaskSpec; clip?: GpuClipSpec; folders?: GpuMaskSpec[]; version: number; width: number; height: number; matrix: Mat; opacity: number; blend: BlendMode }
/** A clipping base for the GPU: its pixels, placement and opacity, and its own mask; its coverage clips the layer. */
export interface GpuClipSpec { image: Surface; version: number; width: number; height: number; matrix: Mat; opacity: number; mask?: GpuMaskSpec }
/** A layer's mask for the GPU: its pixels (alpha is coverage), their version, size and placement. */
export interface GpuMaskSpec { image: Surface; version: number; width: number; height: number; matrix: Mat }
export type { HealMode } from './retouch';
import type { AdjustmentKind } from './types';
export { ADJUSTMENT_KINDS, ADJUSTMENT_LABELS, COLOR_RANGES, defaultAdjustmentData, defaultHsv, grainFromData, grainKernel, hsvFromData, hsvKernel, hsvToData, randomSeed } from './adjust';
export type { ColorRange, GrainSettings, HsvSettings } from './adjust';
export { addNoise, gaussianBlur, gaussianMargin, histogram, lensDistort, motionBlur, motionMargin, unsharpMask } from './filters';
export { defaultDevelopState, developImage, type DevelopState } from './develop';
export { TEXT_ANTIALIAS, TEXT_FONTS, defaultText, fontCss, liveText, paragraphStylesFrom, characterStylesFrom, charStyleOf, withCharStyle, styleOf, textFromData, textKey, textMetrics, renderText, withStyle } from './text';
export { addPattern, allPatterns, patternById, projectPatterns, type Pattern } from './patterns';
export { FRAME_DELAYS, captureFrame, frameLayers, timelineData, timelineFrom, type Frame, type FrameLayer, type Timeline } from './timeline';
export { anchorNear, cornerAt, nearestSegment, pathBounds, pathData, pathFrom, pathSetData, pathSetFrom, splitSegment, tracePath, type Anchor, type NamedPath, type PathSet, type SubPath, type VectorPath } from './paths';
export { curvesKernel, exposureKernel, gradientMapKernel, levelsKernel } from './kernels';
export type { Kernel, KernelContext } from './kernels';

export interface Notice { kind: 'info' | 'error'; text: string }
export interface EngineEvents {
  projects: null; doc: null; selection: null; active: null; viewport: null; tool: null; options: null;
  history: null; colors: null; render: Rect | null; overlay: null; busy: boolean; notice: Notice; paths: null; timeline: null;
}
export interface BrushSettings { diameter: number; hardness: number; opacity: number; tip?: SampledTip | null }
/** `deep`: linear-light floats of an OpenEXR or Radiance HDR, of which `source` is the 8-bit rendition; a layer placed
 *  into a 16 or 32 bit document keeps them at that depth. `resolution`: the file's own ppi. */
export interface ImportedImage { source: CanvasImageSource; width: number; height: number; name: string; profile?: DocProfile; mode?: DocMode; meta?: DocMeta; resolution?: number; deep?: DeepPixels }
type Target = 'pixels' | 'mask';
type Settings = Pick<Engine, 'selectionMode' | 'marqueeKind' | 'lassoKind' | 'showPixelGrid' | 'showTransformControls' | 'autoSelect' | 'autoSelectTarget' | 'lockRatio'>;

export function luminance(c: RGB): number { return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255; }
export function rgbCss(c: RGB, a = 1): string { return `rgba(${c.r},${c.g},${c.b},${a})`; }
export function hexOf(c: RGB): string { return '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''); }
export function stripExt(name: string): string { return name.replace(/\.[A-Za-z0-9]{1,8}$/, '') || 'Untitled'; }

function followMask(l: Layer, next: Transform): Mask | null {
  const m = l.mask, t = l.transform;
  if (!m || !m.linked || !m.placement) return m;
  if (t.w !== next.w || t.h !== next.h || t.rotation !== next.rotation || t.flipX !== next.flipX || t.flipY !== next.flipY) return m;
  return { ...m, placement: { ...m.placement, x: m.placement.x + (next.x - t.x), y: m.placement.y + (next.y - t.y) } };
}

function mirrored(t: Transform, horizontal: boolean, W: number, H: number): Transform {
  return horizontal
    ? { ...t, x: W - (t.x + t.w), flipX: !t.flipX, rotation: -t.rotation }
    : { ...t, y: H - (t.y + t.h), flipY: !t.flipY, rotation: -t.rotation };
}

interface DistortedMask {
  warped: Warped | null;
  placement: Transform | null;
}

/** Why a smart object's pixels cannot be changed directly, and what to do instead. */
const SHAPE_NOTICE = 'This is a shape layer. Reshape it with Direct Selection on its Shape Path, or rasterize it (Layer > Rasterize Layer) to change its pixels.';
const SMART_NOTICE = 'This layer is a smart object. Rasterize it (Layer > Rasterize Layer) to change its pixels; its filters stay editable in Layer > Smart Filters.';
const FILL_NOTICE = 'This is a fill layer. Change it in Layer > Layer Content Options, paint its mask, or rasterize it (Layer > Rasterize > Fill Content) to change its pixels.';

/** Tools that paint with a PixelStroke, whose surfaces are warmed when the tool is chosen. */
const PAINT_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>(['brush', 'mixer', 'cloneStamp', 'healingBrush', 'spotHealing', 'remove']);

/** The tools Stroke Path can stroke with, and their names in its dialog. */
export type StrokeTool = 'brush' | 'eraser' | 'clone' | 'healBrush' | 'spotHealing' | 'dodge' | 'burn' | 'sponge' | 'blur' | 'sharpen';
export const STROKE_TOOLS: ReadonlyArray<readonly [StrokeTool, string]> = [['brush', 'Brush'], ['eraser', 'Eraser'], ['clone', 'Clone Stamp'], ['healBrush', 'Healing Brush'], ['spotHealing', 'Spot Healing Brush'], ['blur', 'Blur'], ['sharpen', 'Sharpen'], ['dodge', 'Dodge'], ['burn', 'Burn'], ['sponge', 'Sponge']];

/** A rectangle shape's four corner radii (top left, top right, bottom right, bottom left) when it carries them and
 *  they are all finite and not negative; null when it has one radius for all. */
export function cornerRadiiOf(style: Record<string, unknown>): number[] | null {
  const r = style.cornerRadii;
  return Array.isArray(r) && r.length === 4 && r.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0) ? (r as number[]).slice() : null;
}

/** The Background Eraser's settings: Tolerance, Sampling, Limits (contiguous or not), Protect Foreground. */
export interface BgEraseOpts { tolerance: number; sampling: 'continuous' | 'once'; contiguous: boolean; protectForeground: boolean }

export class Engine {
  readonly events = new Emitter<EngineEvents>();
  readonly projects: Project[] = [];
  /** Further views of open documents (New Window for Document, Float in Window; DEV_PLAN 36.16): view state only, the project is shared. */
  readonly docViews = new DocViews();
  tool: ToolId = 'move';
  brush: BrushSettings = { diameter: 40, hardness: 1, opacity: 1 };
  /** The Brush and Eraser's Flow (0.01 to 1), in the options bar: how much paint each dab lays down.
   *  Kept apart from `brush`, which the retouch tools spread into their own strokes. */
  brushFlow = 1;
  /** The Crop tool's Delete Cropped Pixels: on by default, as is usual; off,
   *  cropped pixels stay beyond the canvas and Image > Reveal All brings them back. */
  cropDeletePixels = true;
  /** Preferences > Performance: History States (steps kept for undo, 1 to 1000) and the memory history may hold. Each
   *  project takes them when made; changing them applies to every open project from its next step. */
  historyLimits = { states: 100, bytes: 256 * 1024 * 1024 };
  /** The memory chosen for history, or null for automatic (1.61.3): 40% of the memory budget once known, at least
   *  256 MB, so a large layer's whole-layer step is kept (then paged to the engine's disk) rather than trimmed. */
  private historyBytesChosen: number | null = null;
  setHistoryLimits(states: number, bytes: number | null): void {
    this.historyBytesChosen = bytes === null ? null : Math.round(clamp(bytes, 16 * 1024 * 1024, 4096 * 1024 * 1024));
    const auto = Math.max(256 * 1024 * 1024, Math.round(this.memoryBudget * 0.4));
    this.historyLimits = { states: Math.round(clamp(states, 1, 1000)), bytes: this.historyBytesChosen ?? auto };
    for (const p of this.projects) { p.history.entryLimit = this.historyLimits.states; p.history.byteLimit = this.historyLimits.bytes; }
  }
  /** Pen pressure's effect on the Brush's size, flow and opacity; size follows pressure from the start (a mouse presses
   *  at 1, so it paints as always), flow and opacity until a preset or the options turn them on. */
  brushDynamics: BrushDynamics = { ...noDynamics(), size: pressureOption(0.1) };
  /** Brush Settings (Window > Brush Settings): tip shape, shape dynamics, scattering, texture and dual brush. */
  brushShape: BrushShape = defaultShape();
  /** Painting symmetry for the Brush, Pencil and Eraser; the centre follows the document unless set. */
  brushSymmetry: BrushSymmetry = noSymmetry();
  /** The pen pressure response: sampled output at even input steps, null for a straight line. */
  pressureCurve: number[] | null = null;
  /** The preset last applied, for the options bar; cleared by nothing, since changing a value keeps the preset named. */
  brushPresetId: string | null = null;

  /** Size, hardness, opacity and dynamics from a preset. */
  applyBrushPreset(preset: BrushPreset): void {
    this.brushDynamics = structuredClone(preset.dynamics);
    const hadSpacing = this.brushPresetId !== null && allBrushPresets().find((p) => p.id === this.brushPresetId)?.spacing !== undefined;
    this.brushPresetId = preset.id;
    // The preset's tip shape, or a round tip: another preset's angle never lingers. Its spacing too; a preset with none
    // leaves the Brush Settings spacing alone unless the last preset had set it.
    this.brushShape = { ...this.brushShape, angle: preset.angle ?? 0, roundness: preset.roundness ?? 100, spacing: preset.spacing ?? (hadSpacing ? null : this.brushShape.spacing) };
    this.setBrush({ diameter: preset.diameter, hardness: preset.hardness, opacity: preset.opacity, tip: preset.tip ?? null });
  }
  brushMode: 'paint' | 'erase' = 'paint';
  /** The Brush's Mode (1.50.3, the tool audit): a blend mode, or Behind (only where the layer is empty)
   *  or Clear (the paint erases). Only the modes the canvas truly draws are offered (canvasBlend). */
  brushBlend: BlendMode | 'behind' | 'clear' = 'normal';
  setBrushBlend(m: BlendMode | 'behind' | 'clear'): void { this.brushBlend = m; this.emit('options', null); }
  /** The foreground and background, kept to the document's mode (greys, black and white, or the palette). */
  private fgc: RGB = { r: 0, g: 0, b: 0 };
  private bgc: RGB = { r: 255, g: 255, b: 255 };
  /** In a CMYK document (1.54.2), the ink behind each colour: set from the picker's C, M, Y and K, or read through the
   *  document's table when an RGB colour is set; `paintChannel` is the one ink a stroke writes when a channel is solo. */
  fgInk: Ink = [0, 0, 0, 1];
  bgInk: Ink = [0, 0, 0, 0];
  paintChannel: 0 | 1 | 2 | 3 | null = null;
  /** In a Lab document (1.71.9), the one plane (L, a or b) a Brush, Pencil or Eraser stroke writes when it is solo. */
  paintLab: 0 | 1 | 2 | null = null;
  get fg(): RGB { return this.fgc; }
  set fg(c: RGB) { this.fgc = this.inMode(c); if (this.current?.doc.mode === 'cmyk' && this.current.cmykIn) this.fgInk = inkOf(this.fgc, this.current.cmykIn); }
  get bg(): RGB { return this.bgc; }
  set bg(c: RGB) { this.bgc = this.inMode(c); if (this.current?.doc.mode === 'cmyk' && this.current.cmykIn) this.bgInk = inkOf(this.bgc, this.current.cmykIn); }
  /** The picker's ink entry: the colour's rendition follows through the display table. */
  setInk(which: 'fg' | 'bg', ink: Ink): void {
    const lut = this.current?.cmykLut;
    if (!lut) return;
    if (which === 'fg') { this.fgInk = ink; this.fgc = renditionOf(ink, lut); } else { this.bgInk = ink; this.bgc = renditionOf(ink, lut); }
    this.emit('colors', null); this.emit('options', null);
  }
  /** A colour as the current document's mode allows it. */
  inMode(c: RGB, doc = this.current?.doc): RGB {
    const m = doc?.mode ?? 'rgb';
    if (m === 'rgb' || m === 'cmyk') return { r: c.r, g: c.g, b: c.b };
    const v = Math.round(0.299 * c.r + 0.587 * c.g + 0.114 * c.b);
    if (m === 'grayscale') return { r: v, g: v, b: v };
    if (m === 'bitmap') { const k = v < 128 ? 0 : 255; return { r: k, g: k, b: k }; }
    const pal = doc?.palette ?? [];
    let best = pal[0] ?? c, bd = Infinity;
    for (const q of pal) { const d = (q.r - c.r) ** 2 + (q.g - c.g) ** 2 + (q.b - c.b) ** 2; if (d < bd) { bd = d; best = q; } }
    return { r: best.r, g: best.g, b: best.b };
  }
  selectionMode: SelectionMode = 'replace';
  marqueeKind: 'rectangle' | 'ellipse' | 'row' | 'column' = 'rectangle';
  /** The Marquee's Feather (pixels) and Style, in the options bar: Normal, Fixed Ratio (width to
   *  height) or Fixed Size (pixels). */
  marqueeFeather = 0;
  marqueeStyle: 'normal' | 'ratio' | 'size' = 'normal';
  marqueeRatio = { w: 1, h: 1 };
  marqueeSize = { w: 64, h: 64 };
  /** The Lasso's Feather (pixels), kept apart from the Marquee's: each tool keeps its own. */
  lassoFeather = 0;
  lassoKind: 'freehand' | 'polygonal' | 'magnetic' = 'freehand';
  wand = { tolerance: 32, contiguous: true, sampleAll: false, sampleSize: 0, antialias: true };
  selectionAntialiased = true;
  showPixelGrid = true;
  showTransformControls = true;
  autoSelect = false;
  /** Auto-Select's target: the layer under the pointer, or the top-most folder holding it. */
  autoSelectTarget: 'layer' | 'group' = 'layer';
  lockRatio = true;
  transformEdit: TE.TransformEditState | null = null;
  selectionShift: TE.SelectionShift | null = null;
  private currentId: string | null = null;
  private viewSize = { w: 800, h: 600 };
  private readonly display = new Renderer();
  private readonly work = new Renderer();
  private stroke: { project: Project; layerId: ID; target: Target; s: PixelStroke; heal?: HealMode | 'remove'; healFrom?: Pt; quick?: Raster; meet?: SelectionMask | null } | null = null;

  /** Quick Mask (Q): the Brush and Eraser paint the selection itself, white adding to it and black
   *  taking away (the Eraser the other way), shown as a red tint where nothing is selected. Each stroke becomes the new
   *  selection in its own history step, so undo gives back the one before. No selection means all is selected, so
   *  painting black begins one. */
  quickMask = false;
  toggleQuickMask(): void {
    if (this.stroke || !this.current) return;
    this.quickMask = !this.quickMask;
    this.emit('options', null);
    this.emit('selection', null);
  }
  /** The Quick Mask stroke in progress (the selection as painted so far), for the tint to follow it live. */
  get quickMaskLive(): Surface | null { return this.stroke?.quick ? this.stroke.s.working : null; }

  /** The Selection Brush (W; 1.49.4, the owner's tool list): paints the selection itself, adding, or taking away with
   *  Alt, whether or not Quick Mask is on; with no selection it starts from nothing selected. One step per stroke. */
  beginSelectionBrushStroke(pt: Pt, subtract: boolean, pressure = 1, pose: PenPose = UPRIGHT, intersect = false): boolean {
    const p = this.current;
    if (!p || this.stroke) return false;
    this.settle();
    return this.beginQuickMaskStroke(p, pt, pressure, pose, intersect ? 'intersect' : subtract ? 'subtract' : 'add');
  }

  /** `force` 'intersect' paints the area to keep: the stroke's coverage is met with the selection as it was when it ends. */
  private beginQuickMaskStroke(p: Project, pt: Pt, pressure: number, pose: PenPose, force?: 'add' | 'subtract' | 'intersect'): boolean {
    const { width: W, height: H } = p.doc, sel = p.selection, r = new Raster(W, H);
    p.history.begin(force ? 'Selection Brush' : 'Quick Mask', p.snapshot());
    const img = new ImageData(W, H), d = img.data;
    if (!sel && !force) d.fill(255);   // Quick Mask: no selection is all selected; the Selection Brush starts from none
    else if (sel && force !== 'intersect') for (let y = 0; y < sel.h; y++) {
      const Y = sel.y + y;
      if (Y < 0 || Y >= H) continue;
      for (let x = 0; x < sel.w; x++) { const X = sel.x + x; if (X < 0 || X >= W) continue; const i = (Y * W + X) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = sel.data[y * sel.w + x]; }
    }
    ctxOf(r.canvas).putImageData(img, 0, 0);
    const white = force ? force !== 'subtract' : luminance(this.fg) >= 0.5 !== (this.brushMode === 'erase');
    const s = new PixelStroke(r, [1, 0, 0, 1, 0, 0], { ...this.brush, color: { r: 255, g: 255, b: 255 }, flow: this.brushFlow }, white ? 'source-over' : 'destination-out', null);
    s.keepWhole();   // its working surface is the live mask, read whole (1.60.6)
    s.dynamics = structuredClone(this.brushDynamics);
    s.setShape(this.brushShape, null);
    this.stroke = { project: p, layerId: p.activeId ?? '', target: 'pixels', s, quick: r, ...(force === 'intersect' ? { meet: sel } : {}) };
    s.to(pt, pressure, pose);
    s.compose();
    this.emit('selection', null);
    return true;
  }
  private lastBrush: { layerId: ID; target: Target; p: Pt } | null = null;
  private opacityOpen: Project | null = null;
  private fillOpen: Project | null = null;
  /** A blend mode shown on the selected layers for rendering only (the Layers panel's hover preview); never recorded. */
  private blendPreview: { project: Project; mode: BlendMode } | null = null;
  private swipeOpen: Project | null = null;
  private busyCount = 0;

  on<K extends keyof EngineEvents>(key: K, fn: (p: EngineEvents[K]) => void): () => void { return this.events.on(key, fn); }
  emit<K extends keyof EngineEvents>(key: K, payload: EngineEvents[K]): void { this.events.emit(key, payload); }
  /** Set while a preview computes, so its refusals stay quiet; the dialog's OK says them. */
  private quiet = false;

  notice(text: string, kind: Notice['kind'] = 'info'): void {
    if (this.quiet) return;
    // A lock's reason stands alone: the generic 'Select a pixel layer' that a refused operation adds just after it is not
    // shown, since the layer is a pixel layer, only locked.
    if (this.lockedAt && performance.now() - this.lockedAt < 50 && !text.startsWith('The layer')) return;
    this.emit('notice', { kind, text });
  }
  private lockedAt = 0;
  /** Whether a lock stops this edit to the layer, saying so once when it does. */
  private locked(l: Layer | null | undefined, what: 'pixels' | 'position'): boolean {
    const k = l?.locks;
    if (!k || !(k.all || k[what])) return false;
    this.notice(what === 'pixels' ? 'The layer’s pixels are locked. Unlock them in the Layers panel.' : 'The layer’s position is locked. Unlock it in the Layers panel.');
    this.lockedAt = performance.now();
    return true;
  }

  /** Layers > Lock: the selected layers' locks, as one undo step (Layer Locks); `deep` (Layer > Lock All Layers in
   *  Group) takes the layers inside selected folders too. */
  setLocks(patch: LayerLocks, deep = false): void {
    this.edit('Layer Locks', (p) => {
      let changed = false;
      const map = deep ? byId(p.doc) : null;
      for (const id of map ? p.doc.layers.filter((l) => p.selectedIds.has(l.id) || [...p.selectedIds].some((s) => isDescendant(map, l.id, s))).map((l) => l.id) : p.selectedIds) {
        const l = p.layer(id);
        if (!l) continue;
        const next = { ...(l.locks ?? {}), ...patch }, clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v)) as LayerLocks;
        if (JSON.stringify(clean) !== JSON.stringify(l.locks ?? {})) { p.updateLayer(id, { locks: Object.keys(clean).length ? clean : undefined }); changed = true; }
      }
      return changed;
    });
  }
  /** A Lock row button or the "/" key: the selected layers get this lock unless every one of them already has it, then it
   *  comes off them all. */
  toggleLock(kind: keyof LayerLocks): void {
    const p = this.current;
    if (!p) return;
    const sel = [...p.selectedIds].map((id) => p.layer(id)).filter((l): l is Layer => !!l);
    if (sel.length) this.setLocks({ [kind]: !sel.every((l) => l.locks?.[kind]) });
  }
  /** Layer Comps: record the layers' visibility, position and appearance as a new comp (all three on by default). */
  newLayerComp(opts: CompOptions = {}): ID | null {
    let id: ID | null = null;
    this.edit('New Layer Comp', (p) => { const c = captureComp(p.doc, uid(), opts); p.doc = { ...p.doc, comps: [...(p.doc.comps ?? []), c], activeComp: c.id }; id = c.id; return true; });
    return id;
  }
  /** Layer Comps: put a comp's recorded state back on its layers; layers it does not mention stay as they are. */
  applyLayerComp(id: ID): void {
    this.edit('Apply Layer Comp', (p) => {
      const c = p.doc.comps?.find((x) => x.id === id);
      if (!c) return false;
      p.setLayers(applyComp(p.doc, c));
      p.doc = { ...p.doc, activeComp: id };
      return true;
    });
  }
  /** Layer Comps: re-record a comp from the layers as they are now, under the comp's own switches. */
  updateLayerComp(id: ID): void {
    this.edit('Update Layer Comp', (p) => {
      const c = p.doc.comps?.find((x) => x.id === id);
      if (!c) return false;
      const next = captureComp(p.doc, id, {}, c);
      p.doc = { ...p.doc, comps: p.doc.comps!.map((x) => (x.id === id ? next : x)), activeComp: id };
      return true;
    });
  }
  deleteLayerComp(id: ID): void {
    this.edit('Delete Layer Comp', (p) => {
      const list = p.doc.comps ?? [];
      if (!list.some((x) => x.id === id)) return false;
      const rest = list.filter((x) => x.id !== id);
      p.doc = { ...p.doc, comps: rest.length ? rest : undefined, activeComp: p.doc.activeComp === id ? null : p.doc.activeComp };
      return true;
    });
  }
  renameLayerComp(id: ID, name: string): void {
    this.edit('Rename Layer Comp', (p) => {
      const list = p.doc.comps ?? [];
      if (!name.trim() || !list.some((x) => x.id === id && x.name !== name)) return false;
      p.doc = { ...p.doc, comps: list.map((x) => (x.id === id ? { ...x, name } : x)) };
      return true;
    });
  }
  /** Layer Comps, Last Document State: clear the active comp as one step. The layers keep the state they have now;
   *  stepping back to before a comp was applied is Undo. */
  clearLayerComp(): void {
    this.edit('Last Document State', (p) => {
      if (!p.doc.activeComp) return false;
      p.doc = { ...p.doc, activeComp: null };
      return true;
    });
  }
  /** Layer Comps: step to the next (1) or previous (-1) comp, wrapping, and apply it. */
  nextLayerComp(dir: 1 | -1 = 1): void {
    const d = this.current?.doc, list = d?.comps ?? [];
    if (!list.length) return;
    const at = list.findIndex((c) => c.id === d?.activeComp);
    this.applyLayerComp(list[at < 0 ? (dir > 0 ? 0 : list.length - 1) : (at + dir + list.length) % list.length].id);
  }
  get current(): Project | null { return this.projects.find((p) => p.id === this.currentId) ?? null; }
  get activeLayer(): Layer | null { return this.current?.activeLayer ?? null; }
  get stroking(): boolean { return this.stroke !== null; }
  get busy(): boolean { return this.busyCount > 0; }

  async task<T>(fn: () => Promise<T>): Promise<T> {
    this.busyCount++;
    if (this.busyCount === 1) this.emit('busy', true);
    try {
      return await fn();
    } finally {
      this.busyCount--;
      if (this.busyCount === 0) this.emit('busy', false);
    }
  }

  private refresh(): void {
    for (const k of ['doc', 'selection', 'active', 'history', 'render', 'options'] as const) this.emit(k, null);
    this.schedulePaging();   // 1.60.8
  }

  /** The engine's undo store (1.60.8, DEV_PLAN 26.3), given by the app once the engine answers; null keeps every undo
   *  tile in the window. */
  undoStore: { put(bytes: Uint8Array<ArrayBuffer>): Promise<string>; get(key: string): Promise<ArrayBuffer>; drop(key: string): void; dropMany?(keys: string[]): void } | null = null;

  /** Keys forgotten together, in one request where the store can (1.63.0): a closed document after a filter over a
   *  giant layer has tens of thousands, and one request each held the window's other requests behind them. */
  private dropKeys(keys: string[]): void {
    const s = this.undoStore;
    if (!s || !keys.length) return;
    if (s.dropMany) s.dropMany(keys);
    else for (const k of keys) s.drop(k);
  }
  /** What a document's undo tiles may hold in the window before the oldest go to the store: 15% of the memory budget
   *  (256 MB while it is unknown); `undoShareOverride` sets it for checks. */
  undoShareOverride: number | null = null;
  private undoShare(): number { return this.undoShareOverride ?? (this.memoryBudget ? this.memoryBudget * 0.15 : 256 * 1048576); }
  private paging = false;
  private pageTimer = 0;
  private readonly pageJobs = new Map<string, Promise<void>>();

  /** After an edit settles (0.8 s), the oldest undo tiles past the share go to the store. */
  private schedulePaging(): void {
    if (!this.undoStore) return;
    clearTimeout(this.pageTimer);
    this.pageTimer = window.setTimeout(() => { void this.pageOut(); void this.pageTiles(); }, 800);   // tiles too (1.62.4)
  }

  /** The undo tiles a document holds in the window. */
  undoBytes(p: Project): number {
    let n = 0;
    for (const e of p.history.entries()) for (const q of e.patches) if (!q.paged) n += q.before.data.length + q.after.data.length;
    return n;
  }

  /** Each document's oldest undo tiles (its last two steps spared) sent to the store until it holds no more than its
   *  share; a tile's pixels are let go only once the store has them. One round at a time; resolves when done. */
  async pageOut(keep = 2, all = false): Promise<number> {
    const store = this.undoStore;
    if (!store || this.paging) return 0;
    this.paging = true;
    let sent = 0;
    try {
      for (const p of [...this.projects]) {
        let held = this.undoBytes(p);
        for (const q of p.history.pageable(keep)) {
          if (!all && held <= this.undoShare()) break;
          if (q.paged) continue;
          const w = q.before.width, h = q.before.height, n = w * h * 4, lazy = !!q.lazy || !!q.redo, bytes = new Uint8Array(lazy ? n : n * 2);
          bytes.set(q.before.data, 0);
          if (!lazy) bytes.set(q.after.data, n);   // a lazy tile keeps only its before (1.60.9)
          const key = await store.put(bytes);
          // Closed, or its step trimmed, while it was on its way: the key is dropped rather than left behind (1.60.8).
          if (!this.projects.includes(p)) { store.drop(key); break; }
          if (q.paged || (!!q.lazy || !!q.redo) !== lazy || !p.history.entries().some((s) => s.patches.includes(q))) { store.drop(key); continue; }
          q.paged = { key, w, h };
          q.before = new ImageData(1, 1);
          q.after = new ImageData(1, 1);
          held -= lazy ? n : n * 2;
          sent += 1;
        }
      }
    } catch { /* the store out of reach: the tiles stay in the window */ } finally {
      this.paging = false;
    }
    if (sent) this.emit('history', null);
    return sent;
  }

  /** Rasters kept in the undo store (1.61.3, DEV_PLAN 26.4): a whole layer an edit replaced (a growing filter's old
   *  layer), its 1,024-pixel tiles stored and its canvas freed; brought back before a step that restores it. */
  private readonly pagedRasters = new WeakMap<Raster, Array<{ key: string; x: number; y: number; w: number; h: number }>>();
  private readonly rasterJobs = new Map<Raster, Promise<void>>();

  /** The memory budget set (1.61.3), and with it the history's memory when that is automatic (a chosen figure stays). */
  setMemoryBudget(bytes: number): void {
    this.memoryBudget = bytes;
    this.setHistoryLimits(this.historyLimits.states, this.historyBytesChosen);
  }

  /** Raster `r`, no longer in `p`'s document, to the store tile by tile, its canvas freed once all are stored; left as
   *  it was (its stored tiles dropped) if the store fails, the document closes, the raster comes back into use, or no
   *  step holds it any more (trimmed). */
  private async pageRasterOut(p: Project, r: Raster): Promise<void> {
    const store = this.undoStore;
    if (!store || this.pagedRasters.has(r) || this.rasterJobs.has(r)) return;
    const T = 1024, tiles: Array<{ key: string; x: number; y: number; w: number; h: number }> = [];
    const held = (): boolean => p.history.entries().some((e) => [e.before, e.after].some((s) => s.doc.layers.some((l) => l.raster === r || l.mask?.raster === r)));
    const abandoned = (): boolean => !this.projects.includes(p) || p.doc.layers.some((l) => l.raster === r || l.mask?.raster === r) || !held();
    const undoAll = (): void => { for (const t of tiles) store.drop(t.key); };
    try {
      for (let y = 0; y < r.height; y += T) {
        for (let x = 0; x < r.width; x += T) {
          const w = Math.min(T, r.width - x), h = Math.min(T, r.height - y), d = r.ctx.getImageData(x, y, w, h).data;
          tiles.push({ key: await store.put(new Uint8Array(d.buffer, d.byteOffset, d.length) as Uint8Array<ArrayBuffer>), x, y, w, h });
          if (abandoned()) { undoAll(); return; }
        }
      }
    } catch { undoAll(); return; }
    if (abandoned()) { undoAll(); return; }
    this.pagedRasters.set(r, tiles);
    r.canvas.width = 0;
    r.canvas.height = 0;
    this.emit('history', null);
  }

  /** A paged raster brought back: its canvas made its size again and each tile fetched, written and dropped in turn. */
  private unpageRaster(r: Raster): Promise<void> {
    const tiles = this.pagedRasters.get(r), store = this.undoStore;
    if (!tiles || !store) return Promise.resolve();
    let job = this.rasterJobs.get(r);
    if (!job) {
      job = (async () => {
        r.canvas.width = r.width;
        r.canvas.height = r.height;
        for (const t of tiles) { r.ctx.putImageData(new ImageData(new Uint8ClampedArray(await store.get(t.key)), t.w, t.h), t.x, t.y); store.drop(t.key); }
        this.pagedRasters.delete(r);
        r.touch();
      })().finally(() => this.rasterJobs.delete(r));
      this.rasterJobs.set(r, job);
    }
    return job;
  }

  /** Whether a step needs anything brought back before it is applied: its paged tiles, or a paged raster in the
   *  document it restores. */
  private needsBack(e: HistoryEntry | null, op: 'undo' | 'redo'): boolean {
    if (!e) return false;
    if (e.streamed) return true;   // applied a tile at a time from the store (1.62.7)
    if (e.patches.some((q) => q.paged)) return true;
    // A stroke on a tiled layer writes back into tiles that may be on disk now (1.62.5).
    if (e.patches.some((q) => q.raster instanceof TiledRaster && q.raster.pagedIn(q.x, q.y, q.paged?.w ?? q.before.width, q.paged?.h ?? q.before.height))) return true;
    return (op === 'undo' ? e.before : e.after).doc.layers.some((l) => [l.raster, l.mask?.raster].some((r) => !!r && this.pagedRasters.has(r)));
  }
  private async bringBack(e: HistoryEntry, op: 'undo' | 'redo'): Promise<void> {
    if (e.streamed && this.undoStore) {   // a tile at a time: fetched, written in, let go; undo in reverse (1.62.7)
      const store = this.undoStore, order = op === 'undo' ? [...e.patches].reverse() : e.patches;
      for (const q of order) {
        if (!q.disk) continue;
        if (q.raster instanceof TiledRaster) await q.raster.ensure(q.x, q.y, q.disk.w, q.disk.h, store);
        const buf = await store.get(op === 'undo' ? q.disk.before : q.disk.after);
        q.raster.write(new ImageData(new Uint8ClampedArray(buf), q.disk.w, q.disk.h), q.x, q.y);
        if (q.raster instanceof TiledRaster) await this.pageTiles();
      }
      return;
    }
    await this.pageIn(e);
    const store = this.undoStore;   // then the tiles its patches land on (1.62.5)
    if (store) for (const q of e.patches) if (q.raster instanceof TiledRaster) await q.raster.ensure(q.x, q.y, q.before.width, q.before.height, store);
    for (const l of (op === 'undo' ? e.before : e.after).doc.layers) for (const r of [l.raster, l.mask?.raster]) if (r && this.pagedRasters.has(r)) await this.unpageRaster(r);
  }

  /** What a giant document's tiles may hold in memory before the least used go to the engine's store (1.62.4, DEV_PLAN
   *  26.6c): 40% of the memory budget, 512 MB until it is known; `tileShareOverride` sets it for checks. */
  tileShareOverride: number | null = null;
  tileShare(): number { return this.tileShareOverride ?? (this.memoryBudget ? this.memoryBudget * 0.4 : 512 * 1048576); }
  private tilePaging = false;

  /** Each tiled layer's tiles past the share sent to the store, least recently used first, never one in view; a tile
   *  goes only once stored and keeps a preview. One round at a time; the number sent. */
  async pageTiles(): Promise<number> {
    const store = this.undoStore;
    if (!store || this.tilePaging || this.stroke) return 0;   // never under a stroke in progress (1.62.5)
    this.tilePaging = true;
    let sent = 0;
    try {
      for (const p of [...this.projects]) {
        for (const l of p.doc.layers) {
          const t = l.tiled;
          while (t && t.residentBytes > this.tileShare()) {
            const key = t.leastUsed();
            if (key === null) break;   // every tile in memory is in view
            if (await t.pageOut(key, store)) sent += 1;
            else break;                // drawn into or in view meanwhile: the next round
          }
        }
      }
    } catch { /* the store out of reach: the tiles stay in memory */ } finally {
      this.tilePaging = false;
    }
    return sent;
  }

  private tileRedraw = 0;
  /** A tile on disk the view asked for, brought back; one redraw however many arrive together. */
  private bringTile(t: TiledRaster, key: number): void {
    const store = this.undoStore;
    if (!store) return;
    void t.pageIn(key, store).then(() => {
      clearTimeout(this.tileRedraw);
      this.tileRedraw = window.setTimeout(() => this.emit('render', null), 0);
    }, () => this.notice('A part of the picture could not be brought back from the engine.', 'error'));
  }

  /** Room made for an operation needing `extra` bytes (1.61.4, DEV_PLAN 26.5): if it would not fit the budget, every
   *  undo tile still in the window goes to the store first, the newest steps' too, after any paging round under way.
   *  A large filter straight after painting (as an agent works) had found the strokes' undo all still in memory. */
  async relieveFor(extra: number): Promise<void> {
    if (!this.memoryBudget || this.memoryUse() + extra <= this.memoryBudget) return;
    dropSpareSurfaces();   // the stroke pool first: speed, not work (up to 256 MB)
    if (!this.undoStore || this.memoryUse() + extra <= this.memoryBudget) return;
    while (this.paging) await new Promise((r) => setTimeout(r, 100));
    await this.pageOut(0, true);
  }

  /** A step's paged tiles brought back from the store (each fetched once, however many ask), then dropped there. */
  private pageIn(e: HistoryEntry): Promise<void> {
    const store = this.undoStore;
    if (!store) return Promise.resolve();
    return Promise.all(e.patches.filter((q) => q.paged).map((q) => {
      const { key, w, h } = q.paged as { key: string; w: number; h: number };
      let job = this.pageJobs.get(key);
      if (!job) {
        job = store.get(key).then((buf) => {
          const all = new Uint8ClampedArray(buf), n = w * h * 4;
          q.before = new ImageData(all.slice(0, n), w, h);
          if (!q.lazy && !q.redo) q.after = new ImageData(all.slice(n, n * 2), w, h);   // a lazy tile's after is read at undo (1.60.9)
          q.paged = null;
          store.drop(key);
        }).finally(() => this.pageJobs.delete(key));
        this.pageJobs.set(key, job);
      }
      return job;
    })).then(() => undefined);
  }

  setViewSize(w: number, h: number): void {
    if (w < 2 || h < 2) return;
    this.viewSize = { w, h };
    for (const p of this.projects) {
      p.viewport.resize(w, h);
      if (p.viewport.fitted) p.viewport.fit(p.doc.width, p.doc.height);
    }
    this.emit('viewport', null);
    this.emit('render', null);
  }

  private uniqueName(name: string): string {
    const taken = (n: string): boolean => this.projects.some((p) => p.name === n);
    if (!taken(name)) return name;
    let i = 2;
    while (taken(`${name} ${i}`)) i++;
    return `${name} ${i}`;
  }

  addProject(doc: Doc, name: string, activeId: ID | null = null): Project {
    for (const l of doc.layers) if (l.tiled && !l.tiled.onMissing) l.tiled.onMissing = (t, key) => this.bringTile(t, key);   // opened giant layers (1.62.8)
    const p = new Project(doc, this.uniqueName(name));
    p.history.entryLimit = this.historyLimits.states;
    p.history.byteLimit = this.historyLimits.bytes;
    p.viewport.resize(this.viewSize.w, this.viewSize.h);
    p.viewport.fit(doc.width, doc.height);
    p.activeId = doc.layers.some((l) => l.id === activeId) ? activeId : doc.layers[doc.layers.length - 1]?.id ?? null;
    p.selectedIds = new Set(p.activeId ? [p.activeId] : []);
    this.projects.push(p);
    this.openingSnapshot(p);
    this.switchTo(p.id);
    return p;
  }

  /** Automatically Create First Snapshot: each document keeps itself as opened, the History Brush's first
   *  source, within the snapshots' memory budget (past it, none is taken and the brush says so). */
  autoFirstSnapshot = true;
  /** Rotate View (R; 1.49.9, the owner's tool list): turns the view, not the image, normalised to -180..180. */
  setViewRotation(deg: number): void {
    const v = this.current?.viewport;
    if (!v) return;
    let d = ((deg % 360) + 360) % 360;
    if (d > 180) d -= 360;
    if (Math.abs(d) < 1e-6) d = 0;
    if (d === v.rotation) return;
    v.rotation = d;
    this.emit('viewport', null);
  }
  /** Measuring (1.49.6, the owner's tool list): per document, the Color Sampler's points (ten at most) and the Ruler's
   *  line, shown on the canvas and in the Info panel; not part of the document's pixels. */
  private measures = new WeakMap<Project, { samplers: Pt[]; ruler: { a: Pt; b: Pt } | null }>();
  get measure(): { samplers: Pt[]; ruler: { a: Pt; b: Pt } | null } | null {
    const p = this.current;
    if (!p) return null;
    let m = this.measures.get(p);
    if (!m) { m = { samplers: [], ruler: null }; this.measures.set(p, m); }
    return m;
  }
  measureChanged(): void { this.emit('overlay', null); this.emit('options', null); }
  /** A change of the canvas carries the sampler points and the ruler line with the pixels; the marks either side of it are
   *  kept against the document it began from, so the step's undo and redo bring them back (they are not in the document). */
  private markSteps = new WeakMap<Doc, { name: string; after: Doc; before: { samplers: Pt[]; ruler: { a: Pt; b: Pt } | null }; then: { samplers: Pt[]; ruler: { a: Pt; b: Pt } | null } }>();
  private marksNow(p: Project): { samplers: Pt[]; ruler: { a: Pt; b: Pt } | null } {
    const m = this.measures.get(p);
    return { samplers: (m?.samplers ?? []).map((s) => ({ ...s })), ruler: m?.ruler ? { a: { ...m.ruler.a }, b: { ...m.ruler.b } } : null };
  }
  private marksMove(p: Project, map: (x: number, y: number) => Pt, clip: boolean): void {
    let m = this.measures.get(p);
    if (!m) { m = { samplers: [], ruler: null }; this.measures.set(p, m); }
    const keep = (q: Pt): boolean => !clip || (q.x >= 0 && q.y >= 0 && q.x <= p.doc.width && q.y <= p.doc.height);
    m.samplers = m.samplers.map((s) => map(s.x, s.y)).filter(keep);
    if (m.ruler) { const a = map(m.ruler.a.x, m.ruler.a.y), b = map(m.ruler.b.x, m.ruler.b.y); m.ruler = keep(a) || keep(b) ? { a, b } : null; }
    this.measureChanged();
  }
  private marksKeep(p: Project, prior: Doc, name: string, before: { samplers: Pt[]; ruler: { a: Pt; b: Pt } | null }): void {
    this.markSteps.set(prior, { name, after: p.doc, before, then: this.marksNow(p) });
  }
  carryMeasure(p: Project, prior: Doc, name: string, map: (x: number, y: number) => Pt): void {
    const before = this.marksNow(p);
    this.marksMove(p, map, true);
    this.marksKeep(p, prior, name, before);
  }
  private marksBack(p: Project, e: { name: string; before: { doc: Doc }; after: { doc: Doc } }, undoing: boolean): void {
    const r = this.markSteps.get(e.before.doc);
    if (!r || (r.name !== e.name && r.after !== e.after.doc)) return;
    const s = undoing ? r.before : r.then;
    this.measures.set(p, { samplers: s.samplers.map((q) => ({ ...q })), ruler: s.ruler ? { a: { ...s.ruler.a }, b: { ...s.ruler.b } } : null });
    this.measureChanged();
  }

  /** Notes (the Note tool; 1.49.6, the owner's tool list): pinned to the document, saved with it; each change one step. */
  activeNote: ID | null = null;
  addNote(pt: Pt): ID | null { return NT.addNote(this.noteHost, pt); }
  setNote(id: ID, patch: { text?: string; x?: number; y?: number }, name = 'Edit Note'): void { NT.setNote(this.noteHost, id, patch, name); }
  removeNote(id: ID): void { NT.removeNote(this.noteHost, id); }
  /** Notes panel > Delete All (36.17): every note goes in one undo step. */
  clearNotes(): void { NT.clearNotes(this.noteHost); }

  /** Counting (the Count tool): numbered marks on the document, saved with it; each change one step. */
  addCount(pt: Pt): void { NT.addCount(this.noteHost, pt); }
  removeCount(i: number): void { NT.removeCount(this.noteHost, i); }
  clearCounts(): void { NT.clearCounts(this.noteHost); }
  /** Measurement scale and records (DEV_PLAN 31.6 part a): document-level, saved with it; each change one step. */
  setMeasureScale(pixels: number, length: number, units: string): void {
    if (!(pixels > 0) || !(length > 0)) { this.notice('The pixel length and the logical length must both be above zero.', 'info'); return; }
    const u = units.trim().slice(0, 12) || 'px';
    this.edit('Set Measurement Scale', (p) => { p.doc = { ...p.doc, measureScale: { pixels, length, units: u } }; return true; });
  }
  /** Image Assets on save (36.14): whether File > Save regenerates the layers named like foo.png. One undo step. */
  setAssetsOnSave(on: boolean): void {
    this.edit('Image Assets on Save', (p) => {
      if (!!p.doc.assetsOnSave === on) return false;
      const { assetsOnSave: _drop, ...rest } = p.doc;
      p.doc = on ? { ...rest, assetsOnSave: true } : rest;
      return true;
    });
  }
  /** Pixel Aspect Ratio (35.4 part b): width over height of one pixel; 1 drops the field. One undo step. */
  setPixelAspect(r: number): void {
    if (!(r >= 0.1 && r <= 10)) { this.notice('The pixel aspect ratio must be between 0.1 and 10.', 'info'); return; }
    this.edit('Set Pixel Aspect Ratio', (p) => {
      const cur = p.doc.pixelAspect ?? 1;
      if (cur === r) return false;
      const { pixelAspect: _drop, ...rest } = p.doc;
      p.doc = r === 1 ? rest : { ...rest, pixelAspect: r };
      return true;
    });
  }
  recordMeasurements(): number | null {
    const p = this.current;
    if (!p) return null;
    const sc = p.doc.measureScale, k = sc ? sc.length / sc.pixels : 1, units = sc ? sc.units : 'px';
    const rec: NonNullable<Doc['measurements']>[number] = { id: 0, label: '', scale: k, units };
    let any = false;
    const sel = p.selection;
    if (sel) {
      let area = 0, edge = 0;
      const { w, h, data } = sel;
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const v = data[j * w + i];
          if (!v) continue;
          area += v / 255;
          if (v < 128) continue;
          if (i === 0 || j === 0 || i === w - 1 || j === h - 1 || data[j * w + i - 1] < 128 || data[j * w + i + 1] < 128 || data[(j - 1) * w + i] < 128 || data[(j + 1) * w + i] < 128) edge++;
        }
      }
      if (area > 0) { rec.area = area * k * k; rec.perimeter = edge * k; rec.w = w * k; rec.h = h * k; any = true; }
      // Gray value, integrated density and centroid (31.6 part d): one pass over the selection's bounds on the flattened composite.
      const flat = area > 0 ? this.flattened() : null;
      if (flat) {
        let x0 = w, y0 = h, x1 = -1, y1 = -1;
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (data[j * w + i]) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; }
        const bw = Math.min(x1 + 1, flat.width) - x0, bh = Math.min(y1 + 1, flat.height) - y0;
        if (bw > 0 && bh > 0) {
          const px = ctxOf(flat).getImageData(x0, y0, bw, bh).data;
          let sum = 0, wt = 0, mn = 255, mx = 0, sx = 0, sy = 0, cw = 0;
          for (let j = 0; j < bh; j++) {
            for (let i = 0; i < bw; i++) {
              const m = data[(y0 + j) * w + x0 + i];
              if (!m) continue;
              const wgt = m / 255;
              sx += (x0 + i + 0.5) * wgt; sy += (y0 + j + 0.5) * wgt; cw += wgt;
              const o = (j * bw + i) * 4;
              if (px[o + 3] === 0) continue;
              const y = 0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2];
              sum += y * wgt; wt += wgt;
              if (y < mn) mn = y;
              if (y > mx) mx = y;
            }
          }
          if (cw > 0) { rec.cx = (sx / cw) * k; rec.cy = (sy / cw) * k; }
          if (wt > 0 && rec.area !== undefined) { rec.gray = sum / wt; rec.grayMin = mn; rec.grayMax = mx; rec.intDen = rec.area * rec.gray; }
        }
      }
    }
    const r = this.measure?.ruler;
    if (r) {
      rec.length = Math.hypot(r.b.x - r.a.x, r.b.y - r.a.y) * k;
      rec.angle = (Math.atan2(r.a.y - r.b.y, r.b.x - r.a.x) * 180) / Math.PI;
      any = true;
    }
    const n = p.doc.counts?.length ?? 0;
    if (n > 0) { rec.count = n; any = true; }
    if (!any) { this.notice('Nothing to measure: make a selection, draw a ruler line or place counts first.', 'info'); return null; }
    const id = (p.doc.measurements ?? []).reduce((m, x) => Math.max(m, x.id), 0) + 1;
    rec.id = id;
    rec.label = `Measurement ${id}`;
    this.edit('Record Measurements', (q) => { q.doc = { ...q.doc, measurements: [...(q.doc.measurements ?? []), rec] }; return true; });
    return id;
  }
  deleteMeasurement(id: number): void {
    this.edit('Delete Measurement', (p) => { const m = p.doc.measurements ?? []; if (!m.some((x) => x.id === id)) return false; p.doc = { ...p.doc, measurements: m.filter((x) => x.id !== id) }; return true; });
  }
  clearMeasurements(): void {
    this.edit('Clear Measurements', (p) => { if (!p.doc.measurements?.length) return false; p.doc = { ...p.doc, measurements: [] }; return true; });
  }
  placeScaleMarker(opts: { lengthUnits: number; text: boolean; color: 'black' | 'white' }): void {
    const p = this.current, sc = p?.doc.measureScale;
    if (!p || !sc) { this.notice('Set the measurement scale first.', 'info'); return; }
    const bar = Math.max(1, Math.round(opts.lengthUnits * sc.pixels / sc.length));
    const label = `${String(Number(opts.lengthUnits.toFixed(3)))} ${sc.units}`;
    const probe = ctxOf(createSurface(1, 1));
    probe.font = '12px sans-serif';
    const tw = opts.text ? Math.ceil(probe.measureText(label).width) : 0;
    const w = Math.max(bar, tw, 1), h = opts.text ? 20 : 4;
    const s = createSurface(w, h), c = ctxOf(s);
    c.fillStyle = opts.color;
    c.fillRect(0, h - 4, bar, 4);
    if (opts.text) { c.font = '12px sans-serif'; c.textBaseline = 'alphabetic'; c.fillText(label, 0, 12); }
    this.insertRasterLayer(Raster.from(s, w, h), 'Measurement Scale Marker', 10, p.doc.height - 10 - h, {}, 'Place Scale Marker');
  }
  /** The Pattern Stamp's pattern (null: the first). */
  patternStampPattern: ID | null = null;
  /** Preferences > Cursors: how painting tools show where they will paint (drawn by brush-common's drawBrushCursor). */
  cursorPrefs: { paint: 'tip' | 'precise' | 'standard'; crosshair: boolean } = { paint: 'tip', crosshair: false };
  private openingSnapshot(p: Project): void { SN.openingSnapshot(this.snapshotHost, p); }

  /** Frame layers (the Frame tool, K; not the Timeline's frames): a folder named Frame N whose mask is the frame's rectangle or ellipse;
   *  one undo step; it is selected, so an image imported next goes into it and covers it (insertImages). */
  frameShape: 'rect' | 'ellipse' = 'rect';
  newFrameLayer(r: { x: number; y: number; w: number; h: number }, shape: 'rect' | 'ellipse' = this.frameShape): ID | null {
    let made: ID | null = null;
    this.edit('New Frame', (p) => {
      const W = p.doc.width, H = p.doc.height, x = Math.round(r.x), y = Math.round(r.y), w = Math.max(2, Math.round(r.w)), h = Math.max(2, Math.round(r.h));
      const mask = new Raster(W, H);
      mask.ctx.fillStyle = '#ffffff';
      if (shape === 'ellipse') { mask.ctx.beginPath(); mask.ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); mask.ctx.fill(); }
      else mask.ctx.fillRect(x, y, w, h);
      let n = p.doc.layers.filter((l) => l.frame).length + 1;
      while (p.doc.layers.some((l) => l.name === `Frame ${n}`)) n += 1;
      const layer = newLayer(`Frame ${n}`, p.doc, { isGroup: true, frame: { x, y, w, h, shape }, mask: { raster: mask, enabled: true, linked: true, placement: null } });
      p.setLayers([...p.doc.layers, layer]);
      this.focus(p, layer.id);
      made = layer.id;
      return true;
    });
    return made;
  }

  /** The History Brush's source: a snapshot chosen in the History panel, or the document's first. */
  /** The History panel's source column for Edit > Fill with History: a history row index (0 the starting point, k the
   *  state after k steps), or null for the oldest kept step. The History Brush keeps its snapshot source below. */
  historySourceIndex: number | null = null;
  setHistorySourceIndex(i: number | null): void { if (this.historySourceIndex === i) return; this.historySourceIndex = i; this.emit('history', null); }
  historyBrushSource: ID | null = null;
  setHistoryBrushSource(id: ID): void { this.historyBrushSource = id; this.emit('history', null); }
  get historyBrushSourceId(): ID | null { return SN.historyBrushSourceId(this.snapshotHost); }

  switchTo(id: string): void {
    if (this.stroke || !this.projects.some((q) => q.id === id)) return;
    this.settle();
    this.currentId = id;
    this.emit('projects', null);
    this.emit('viewport', null);
    this.emit('tool', null);
    this.refresh();
  }

  closeProject(id: string): void {
    const i = this.projects.findIndex((q) => q.id === id);
    if (i < 0 || this.stroke || this.waiting()) return;
    if (this.transformEdit && this.transformEdit.project === this.projects[i]) this.transformEdit = null;
    if (this.floatSel && this.floatSel.project === this.projects[i]) this.floatSel = null;
    const closing = this.projects[i];
    this.projects.splice(i, 1);
    this.docViews.closeAllOf(id);   // the document's further views go with it (36.16)
    if (this.currentId === id) this.currentId = (this.projects[i] ?? this.projects[this.projects.length - 1])?.id ?? null;
    this.emit('projects', null);
    this.emit('viewport', null);
    this.refresh();
    // Its memory back now (1.60.4, DEV_PLAN 26.2): measured, a closed 150 MP document's canvases stayed in the browser
    // until it collected them, while the count already said free. Each canvas only it keeps (its layers and its undo
    // history; no other open document's) is shrunk to nothing, which frees it at once.
    // Its stored undo (1.60.8) and its streamed steps' (1.62.7), in one request (1.63.0).
    this.dropKeys(closing.history.entries().flatMap((e) => e.patches.flatMap((q) => [...(q.paged ? [q.paged.key] : []), ...(q.disk ? [q.disk.before, q.disk.after] : [])])));
    for (const r of this.rastersOf(closing)) { const t = this.pagedRasters.get(r); if (t) { for (const x of t) this.undoStore?.drop(x.key); this.pagedRasters.delete(r); } }   // and its paged layers (1.61.3)
    if (this.undoStore) for (const l of closing.doc.layers) l.tiled?.dropAll(this.undoStore);   // and its stored tiles (1.62.4)
    const kept = new Set<Raster>();
    for (const q of this.projects) for (const r of this.rastersOf(q)) kept.add(r);
    for (const r of this.rastersOf(closing)) if (!kept.has(r)) { try { r.canvas.width = 0; r.canvas.height = 0; } catch { /* already gone */ } }
  }

  /** Every raster a document keeps: its layers' (pixels, masks, smart objects' sources and filter masks) and its history's. */
  private rastersOf(p: Project): Set<Raster> {
    const out = p.history.rasters();
    for (const l of p.doc.layers) for (const r of [l.raster, l.mask?.raster, l.smart?.source, l.smart?.filterMask]) if (r) out.add(r);
    return out;
  }

  markSaved(p: Project, name: string, libraryName: string | null): void {
    p.name = name;
    p.libraryName = libraryName;
    p.history.markSaved();
    this.emit('projects', null);
    this.emit('history', null);
  }

  /** File > Revert (1.65.8): the current document as last saved, read back by the app, in
   *  place of what it holds now as one Revert step that also carries its paths and timeline, so Undo brings every change
   *  back; the tab, its name and the view stay (fitted again when the size differs), and it counts as saved. */
  revertTo(doc: Doc, activeId: ID | null, paths: PathSet | null, timeline: Timeline | null): boolean {
    const p = this.current;
    if (!p || this.stroke || this.waiting()) return false;
    this.settle();
    for (const l of doc.layers) if (l.tiled && !l.tiled.onMissing) l.tiled.onMissing = (t, key) => this.bringTile(t, key);
    const was = this.timelineFor(p), next = timeline ?? { frames: [], current: null, loops: 0 }, set = paths ?? { list: [], active: null }, sized = doc.width !== p.doc.width || doc.height !== p.doc.height;
    const film = (t: Timeline): unknown => structuredClone({ frames: t.frames, current: t.current, loops: t.loops });
    p.history.begin('Revert', { ...p.snapshot(), paths: structuredClone(this.pathSet(p)), video: structuredClone(was.video ?? null), frames: film(was) });
    p.doc = { ...doc, id: p.doc.id };
    p.selection = null;
    this.pathStore.sets.set(p, { list: set.list, active: set.list.some((n) => n.id === set.active) ? set.active : null });
    this.timelines.set(p, next);
    this.focus(p, activeId && doc.layers.some((l) => l.id === activeId) ? activeId : doc.layers[doc.layers.length - 1]?.id ?? null);
    p.history.end({ ...p.snapshot(), paths: structuredClone(this.pathSet(p)), video: structuredClone(next.video ?? null), frames: film(next) });
    p.history.markSaved();
    this.pathsChanged(p);
    this.emit('timeline', null);
    this.emit('projects', null);
    this.refresh();
    if (sized) this.fit();
    return true;
  }

  /** How many times newDocument has been called, so Script Events (30.6) can tell a new document from an opened one. */
  newCount = 0;

  /** Spherical panorama edit views (DEV_PLAN 35.8), by the project id of the edit view; not saved with the document. */
  readonly panoramaLinks = new Map<string, PanoramaLink>();

  /** Apply View to Panorama: the current edit view, flattened, is projected back onto a transparent equirectangular
   *  image the size of its source document and added there as a layer 'Panorama edit' above the source layer, as one
   *  undo step on the source, which then becomes the current document. */
  applyPanoramaView(): boolean {
    const v = this.current, link = v ? this.panoramaLinks.get(v.id) : undefined;
    if (!v || !link) return false;
    const src = this.projects.find((x) => x.id === link.sourceProjectId);
    if (!src) { this.notice('The panorama this view came from is no longer open.'); return false; }
    const flat = this.flattenedOf(v);
    if (!flat) return false;
    const view = ctxOf(flat).getImageData(0, 0, flat.width, flat.height), W = src.doc.width, H = src.doc.height;
    const projected = projectBack({ data: new Uint8ClampedArray(W * H * 4), width: W, height: H }, view, link.view);
    const raster = new Raster(W, H);
    raster.write(new ImageData(projected.data, W, H));
    this.switchTo(src.id);
    if (link.layerId && src.layer(link.layerId)) src.activeId = link.layerId;
    this.insertRasterLayer(raster, 'Panorama edit', 0, 0, {}, 'Apply View to Panorama');
    return true;
  }

  newDocument(width: number, height: number, name = 'Untitled', fill: 'transparent' | 'white' | 'background' = 'transparent', resolution = 72): Project | null {
    this.newCount++;
    // Past what one canvas may hold here (a side past 30,000, or more pixels than the budget) but within 65,535 a side,
    // a tiled document (1.62.3, DEV_PLAN 26.6b): its background costs nothing until drawn into. Before 1.62.3 refused.
    if (Number.isInteger(width) && Number.isInteger(height) && width >= 1 && height >= 1 && width <= 65535 && height <= 65535 &&
        (width > LIMITS.side || height > LIMITS.side || width * height > LIMITS.pixels)) {
      const doc: Doc = { id: uid(), width, height, resolution: Number.isFinite(resolution) && resolution >= 1 && resolution <= 10000 ? resolution : 72, layers: [] };
      const tiled = new TiledRaster(width, height);
      tiled.onMissing = (t, key) => this.bringTile(t, key);   // a tile on disk the view wants (1.62.4)
      if (fill === 'white') tiled.base = [255, 255, 255, 255];
      else if (fill === 'background') tiled.base = [this.bg.r, this.bg.g, this.bg.b, 255];
      const layer = newLayer(fill === 'transparent' ? 'Layer 1' : 'Background', doc, { tiled });
      this.notice(`A ${Math.round(width * height / 1e6).toLocaleString('en-US')} megapixel document is kept in tiles: it opens, zooms and pans now; painting, filters, export and undo on it come in the next releases.`);
      return this.addProject({ ...doc, layers: [layer] }, name, layer.id);
    }
    // Its layer and its display, and its opening snapshot when one will be taken (1.60.2, recounted 1.60.5).
    const px = width * height * 4, snap = this.autoFirstSnapshot && px <= this.snapshotByteLimit && (!this.memoryBudget || px <= this.memoryBudget / 4) ? px : 0;
    if (Number.isInteger(width) && Number.isInteger(height) && !this.room(px * 2 + snap, 'A new document')) return null;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > LIMITS.side || height > LIMITS.side || width * height > LIMITS.pixels) {
      this.notice(`Canvas sides must be 1 to 30,000 px, and the canvas at most ${Math.round(LIMITS.pixels / 1_000_000)} megapixels.`, 'error');
      return null;
    }
    const base: Doc = { id: uid(), width, height, resolution: Number.isFinite(resolution) && resolution >= 1 && resolution <= 10000 ? resolution : 72, layers: [] };
    const layer = newLayer(fill === 'transparent' ? 'Layer 1' : 'Background', base);
    if (fill !== 'transparent') layer.raster = Raster.filled(width, height, fill === 'white' ? '#ffffff' : rgbCss(this.bg));
    return this.addProject({ ...base, layers: [layer] }, name, layer.id);
  }

  /** What is running that edits must wait for (1.62.7: a filter on a giant layer, which works a band at a time and
   *  awaits the engine's disk between bands), or null. */
  busyWith: string | null = null;
  private waiting(): boolean {
    if (!this.busyWith) return false;
    this.notice(`Wait for ${this.busyWith} to finish.`);
    return true;
  }

  edit(name: string, fn: (p: Project) => boolean | void): boolean {
    const p = this.current;
    if (!p || this.stroke || this.waiting()) return false;
    this.settle();
    const nested = p.history.open;
    p.history.begin(name, p.snapshot());
    let ok: boolean | void = true;
    const cmyk = p.doc.mode === 'cmyk';
    const deepBefore = (p.doc.depth ?? 8) > 8 || cmyk || p.doc.mode === 'lab' ? new Map(p.doc.layers.map((l) => [l.id, l])) : null;
    try { ok = fn(p); } catch (err) {
      if (nested) throw err;
      this.rollBack(p, name, err);
      return false;
    }
    if (deepBefore && !nested) this.deriveChannels(p, deepBefore, p.history.pendingPatches);
    if (deepBefore && !nested && p.doc.layers.some((l) => { const o = deepBefore.get(l.id); return !!o?.channels && l.raster !== o.raster && l.channels === o.channels; })) {
      const r = p.history.rollback();
      if (r) { for (let i = r.patches.length - 1; i >= 0; i--) { const q = r.patches[i]; q.raster.write(q.before, q.x, q.y); } p.doc = r.before.doc; p.selection = r.before.selection; }
      this.refresh();
      this.notice(cmyk ? `${name} does not work in CMYK yet. Image > Mode > RGB Color to use it.` : `${name} does not work in ${p.doc.depth} bits yet. Image > Mode > 8 Bits/Channel to use it.`);
      return false;
    }
    p.history.end(p.snapshot());
    this.refresh();
    return ok !== false;
  }

  /** Undoes whatever a failed operation had done so far, pixels and structure, and says so; nothing is recorded. */
  private rollBack(p: Project, name: string, err: unknown): void {
    const r = p.history.rollback();
    if (r) {
      for (let i = r.patches.length - 1; i >= 0; i--) { const q = r.patches[i]; q.raster.write(q.before, q.x, q.y); }
      p.doc = r.before.doc;
      p.selection = r.before.selection;
      this.focus(p, r.before.activeId && r.before.doc.layers.some((l) => l.id === r.before.activeId) ? r.before.activeId : null);
    }
    this.refresh();
    this.failures.push({ at: Date.now(), what: name, message: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
    if (this.failures.length > 50) this.failures.shift();
    this.notice(`${name} could not finish and was undone: ${err instanceof Error ? err.message : String(err)}`, 'error');
  }

  /** Operations that failed and were rolled back this session, newest last, for the error log. */
  readonly failures: Array<{ at: number; what: string; message: string }> = [];

  settle(keepFloating = false): void {
    if (this.distortEdit) this.applyDistort();
    if (this.gradient) this.commitGradient();
    if (this.transformEdit) this.endTransform();
    if (this.selectionShift) this.endSelectionShift();
    if (this.opacityOpen) this.endOpacityEdit();
    if (this.fillOpen) this.endFillEdit();
    if (this.swipeOpen) this.endVisibilitySwipe();
    if (this.floatSel && !keepFloating) this.commitSelectionTransform();
  }

  private focus(p: Project, id: ID | null): void {
    p.activeId = id;
    p.selectedIds = new Set(id ? [id] : []);
    p.maskTarget = false;
  }

  private readonly snapshotStore = new SN.SnapshotStore();
  /** Each open document's snapshots (the store's lists), read by the memory count and the History Brush. */
  private get historySnapshots(): WeakMap<Project, SN.SnapshotEntry[]> { return this.snapshotStore.lists; }

  /** A copy of `doc` whose layer pixels and masks are copies too: strokes change pixels in place, so a snapshot that
   *  only referred to them would change with later painting. Type stays editable on its copied pixels; smart sources,
   *  paths and shapes are never changed in place, so they are shared. */
  private copyDoc(doc: Doc): Doc { return SN.copyDoc(doc); }

  /** Snapshots copy every layer's pixels, so beside the history's own limit they have a budget of their own, per
   *  document; past it, New Snapshot declines rather than risk running out of memory. */
  snapshotByteLimit = 768 * 1024 * 1024;

  private docBytes(doc: Doc): number { return SN.docBytes(doc); }

  /** The current document's snapshots, newest last, with the memory each keeps. They live with the open document and
   *  are not saved. */
  get snapshots(): ReadonlyArray<{ id: ID; name: string; bytes: number }> { return SN.snapshots(this.snapshotHost); }

  /** History > New Snapshot: the document as it is now, kept to return to however far the steps move on. */
  takeSnapshot(name?: string): void { SN.takeSnapshot(this.snapshotHost, name); }

  /** Gives a snapshot a name of its own (the History panel: double-click it). */
  renameSnapshot(id: ID, name: string): boolean { return SN.renameSnapshot(this.snapshotHost, id, name); }

  /** Returns the document to a snapshot as one undo step, from a fresh copy, so the snapshot stays as it was taken. */
  revertToSnapshot(id: ID): void { SN.revertToSnapshot(this.snapshotHost, id); }

  deleteSnapshot(id: ID): void { SN.deleteSnapshot(this.snapshotHost, id); }

  /** The History panel's list for the current document. */
  get historySteps(): { names: string[]; current: number } { return this.current?.history.steps ?? { names: [], current: 0 }; }

  /** Renames the latest done step of the current document (the assistant: the step carries the command's label). */
  renameLastStep(name: string): void {
    const p = this.current;
    if (!p || p.history.undoName === name) return;
    p.history.renameLast(name);
    this.emit('history', null);
  }

  /** Goes to the state after step `index` (0 is before the first step kept) by undoing or redoing in turn, so
   *  everything that follows undo and redo, frames included, stays right. */
  jumpHistory(index: number): void {
    const p = this.current;
    if (!p || this.stroke) return;
    const { names, current } = p.history.steps, target = Math.max(0, Math.min(names.length, Math.round(index)));
    for (let k = current; k > target; k--) this.undo();
    for (let k = current; k < target; k++) this.redo();
  }

  /** Waits until the queued undo and redo steps have all been made. */
  private async historyIdle(): Promise<void> {
    for (let i = 0; i < 500 && (this.historyOps.length || this.draining); i++) await new Promise<void>((r) => setTimeout(r, 10));
  }

  /** History panel > Delete: the state at row `index` (1 is the first step) and every state after it are forgotten, the
   *  document left as it was just before that step. False when there is no such step. */
  async deleteHistoryState(index: number): Promise<boolean> {
    const p = this.current;
    if (!p || this.stroke || !Number.isInteger(index) || index < 1 || index > p.history.steps.names.length) return false;
    this.jumpHistory(index - 1);
    await this.historyIdle();
    if (this.current !== p || p.history.steps.current !== index - 1) return false;
    p.history.discardRedo();
    this.emit('history', null);
    return true;
  }

  /** History panel > New Document: a copy of the document as it was at row `index` (0 the start). The document itself
   *  ends where it was; the copy opens in its own tab. */
  async newDocumentFromState(index: number, name = ''): Promise<Project | null> {
    const p = this.current;
    if (!p || this.stroke || !Number.isInteger(index) || index < 0 || index > p.history.steps.names.length) return null;
    const back = p.history.steps.current;
    this.jumpHistory(index);
    await this.historyIdle();
    if (this.current !== p) return null;
    const q = this.duplicateDocument(name || `${p.name} state ${index}`);
    this.switchTo(p.id);
    this.jumpHistory(back);
    await this.historyIdle();
    if (q) this.switchTo(q.id);
    return q;
  }

  undo(): void { this.historyOp('undo'); }

  /** Undo and redo in the order asked (1.60.8, DEV_PLAN 26.3): at once when the step is in the window and nothing
   *  waits; else queued, each step's tiles brought back from the undo store before it is applied. */
  private readonly historyOps: Array<'undo' | 'redo'> = [];
  private draining = false;
  private historyOp(op: 'undo' | 'redo'): void {
    const p = this.current;
    if (!p || this.stroke || this.waiting()) return;
    const next = op === 'undo' ? p.history.peekUndo() : p.history.peekRedo();
    if (!this.historyOps.length && !this.needsBack(next, op)) { if (op === 'undo') this.undoNow(); else this.redoNow(); return; }
    this.historyOps.push(op);
    void this.drainHistory();
  }
  private async drainHistory(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.historyOps.length) {
        const p = this.current, op = this.historyOps[0];
        if (!p) { this.historyOps.length = 0; break; }
        const next = op === 'undo' ? p.history.peekUndo() : p.history.peekRedo();
        if (next && this.needsBack(next, op)) await this.bringBack(next, op);   // tiles and rasters (1.61.3)
        this.historyOps.shift();
        if (op === 'undo') this.undoNow(); else this.redoNow();
      }
    } catch {
      this.historyOps.length = 0;
      this.notice('That step could not be brought back from the engine.', 'error');
    } finally {
      this.draining = false;
    }
  }

  private undoNow(): void {
    const p = this.current;
    if (!p || this.stroke) return;
    this.settle();
    const e = p.history.undo();
    if (!e) return;
    for (let i = e.streamed ? -1 : e.patches.length - 1; i >= 0; i--) {   // a streamed step's are already in (1.62.7)
      const q = e.patches[i];
      if (q.lazy) { q.after = q.raster.read(q.x, q.y, q.before.width, q.before.height); q.lazy = false; }   // 1.60.9
      q.raster.write(q.before, q.x, q.y);
    }
    this.restore(p, e.before);
    this.marksBack(p, e, true);
    this.reconcileFrame(p, e.name === 'Select Frame');
  }

  redo(): void { this.historyOp('redo'); }

  /** Edit > Toggle Last State (1.65.7): undoes the last step, or redoes the one just undone. */
  toggleLastState(): void { if (this.current?.history.canRedo) this.redo(); else this.undo(); }

  private redoNow(): void {
    const p = this.current;
    if (!p || this.stroke) return;
    this.settle();
    const e = p.history.redo();
    if (!e) return;
    if (!e.streamed) for (const q of e.patches) q.raster.write(q.redo ? q.redo() : q.after, q.x, q.y);   // a recipe's after is worked out again (36.18); a streamed step's are already in (1.62.7)
    this.restore(p, e.after);
    this.marksBack(p, e, false);
    this.reconcileFrame(p, e.name === 'Select Frame');
  }

  private restore(p: Project, s: Snapshot): void {
    p.doc = s.doc;
    p.selection = s.selection;
    if (s.paths) { this.pathStore.sets.set(p, structuredClone(s.paths) as PathSet); this.pathsChanged(p); }   // a path edit's step
    if (s.frames !== undefined) {   // a step carrying the frame animation (1.59.8: Convert to Frame Animation)
      const f = structuredClone(s.frames) as { frames: Frame[]; current: ID | null; loops: number };
      this.timelines.set(p, { ...this.timelineOf(p), frames: f.frames, current: f.current, loops: f.loops });
      this.emit('timeline', null);
    }
    if (s.video !== undefined) {   // a timeline edit's step (1.59.5): its timeline back, the playhead where it is now
      const now = this.timelineOf(p).video, v = s.video ? structuredClone(s.video) as VideoTimeline : null;
      if (v && now) v.current = Math.min(now.current, v.duration - 1);
      this.timelines.set(p, { ...this.timelineOf(p), video: v });
      this.emit('timeline', null);
    }
    this.focus(p, s.doc.layers.some((l) => l.id === s.activeId) ? s.activeId : null);
    this.refresh();
  }

  update(patch: Partial<Settings>): void {
    Object.assign(this, patch);
    this.emit('options', null);
    this.emit('tool', null);
    this.emit('render', null);
  }

  setTool(id: ToolId): void {
    if (PAINT_TOOLS.has(id)) {
      // Painting tools ready their stroke surfaces in idle time, so the first stroke starts at once on large images.
      const warm = (): void => {
        const p = this.current, r = p?.activeLayer?.raster, w = r?.width ?? p?.doc.width ?? 0, h = r?.height ?? p?.doc.height ?? 0;
        if (w > 0 && h > 0 && w * h <= 25_000_000) warmStrokeSurfaces(w, h);
      };
      // Idle time, but within half a second even on a page that is never idle.
      const idle = (window as unknown as { requestIdleCallback?: (f: () => void, o: { timeout: number }) => void }).requestIdleCallback;
      if (idle) idle(warm, { timeout: 500 }); else window.setTimeout(warm, 200);
    }
    if (this.stroke) return;
    this.settle();
    if (this.tool !== id) { this.tool = id; this.transformConstraint = null; this.emit('tool', null); }
    this.emit('overlay', null);
  }

  tipDrag: { at: Pt; startX: number; diameter: number; hardness: number } | null = null;

  beginTipDrag(at: Pt, screenX: number): boolean {
    if (this.stroke) return false;
    this.tipDrag = { at, startX: screenX, diameter: this.brush.diameter, hardness: this.brush.hardness };
    this.emit('overlay', null);
    return true;
  }

  updateTipDrag(screenX: number, shift: boolean): void {
    const t = this.tipDrag;
    if (!t) return;
    const dx = screenX - t.startX;
    if (shift) {
      this.setBrush({ hardness: Math.min(1, Math.max(0, t.hardness + dx / 200)), diameter: t.diameter });
    } else {
      const zoom = this.current ? Math.max(0.0001, this.current.viewport.zoom) : 1;
      this.setBrush({ diameter: Math.min(2000, Math.max(1, Math.round(t.diameter + (2 * dx) / zoom))), hardness: t.hardness });
    }
  }

  endTipDrag(): void {
    if (!this.tipDrag) return;
    this.tipDrag = null;
    this.emit('overlay', null);
  }

  setBrush(patch: Partial<BrushSettings>): void {
    this.brush = {
      ...this.brush,
      diameter: Math.min(5000, Math.max(1, Math.round(patch.diameter ?? this.brush.diameter))),
      hardness: Math.min(1, Math.max(0, patch.hardness ?? this.brush.hardness)),
      opacity: Math.min(1, Math.max(0.01, patch.opacity ?? this.brush.opacity)),
      tip: 'tip' in patch ? patch.tip ?? null : this.brush.tip ?? null,
    };
    this.emit('options', null);
    this.emit('overlay', null);
  }

  setBrushMode(mode: 'paint' | 'erase'): void { this.brushMode = mode; this.emit('options', null); this.emit('tool', null); }
  setWand(patch: Partial<Engine['wand']>): void { this.wand = { ...this.wand, ...patch }; this.emit('options', null); }
  /** Paint Bucket: fills the area of similar colour clicked with the foreground colour. */
  /** The Paint Bucket's settings; source and pattern and mode (1.49.10, the owner's tool list): the foreground or a
   *  pattern (tiled from the layer's corner, as Edit > Fill's), in a blend mode. */
  bucket: { tolerance: number; contiguous: boolean; sampleAll: boolean; opacity: number; antiAlias: boolean; source: 'fg' | 'pattern'; pattern: ID | null; mode: BlendMode } =
    { tolerance: 32, contiguous: true, sampleAll: false, opacity: 1, antiAlias: true, source: 'fg', pattern: null, mode: 'normal' };
  setBucket(patch: Partial<Engine['bucket']>): void { this.bucket = { ...this.bucket, ...patch }; this.emit('options', null); }
  /** Dodge and Burn lighten and darken, weighted to a tonal range by Exposure; Sponge moves colour away from or toward
   *  its own grey by Flow. */
  /** protectTones and vibrance (1.50.7, the tool audit), on by default: Dodge and Burn change brightness
   *  and keep the colour, easing it toward grey only as far as keeps it from clipping; the Sponge saturates the least
   *  saturated most, so nothing clips. */
  tone: { range: 'shadows' | 'midtones' | 'highlights'; exposure: number; spongeMode: 'desaturate' | 'saturate'; flow: number; protectTones: boolean; vibrance: boolean } = { range: 'midtones', exposure: 0.5, spongeMode: 'desaturate', flow: 0.5, protectTones: true, vibrance: true };
  /** The Eyedropper's Sample (1.50.7): the active layer, it and those below, or everything shown. */
  eyedropperSample: HealSample = 'all';
  setTone(patch: Partial<Engine['tone']>): void { this.tone = { ...this.tone, ...patch }; this.emit('options', null); }
  setColors(fg?: RGB, bg?: RGB): void {
    if (fg) this.fg = fg;
    if (bg) this.bg = bg;
    this.emit('colors', null); this.emit('options', null);
  }
  swapColors(): void { this.setColors(this.bg, this.fg); }
  defaultColors(): void { this.setColors({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }); }

  /** View > Fill Screen (1.50.7, the Zoom tool's bar): the image covering the visible area, centred. */
  fillScreen(): void { const p = this.current; if (!p) return; p.viewport.fill(p.doc.width, p.doc.height); this.emit('viewport', null); this.emit('render', null); }
  fit(): void {
    const p = this.current;
    if (!p) return;
    p.viewport.fit(p.doc.width, p.doc.height);
    this.emit('viewport', null); this.emit('render', null);
  }
  /** View > Fit Layer(s) on Screen (27.11): the selected layers' content bounds fitted to the view. False when they hold nothing. */
  fitLayers(): boolean {
    const p = this.current;
    if (!p) return false;
    let r: Rect | null = null;
    for (const id of p.selectedIds.size ? p.selectedIds : new Set(p.activeId ? [p.activeId] : [])) {
      const b = this.contentBounds(id, p);
      if (b) r = r ? unionRect(r, b) : b;
    }
    if (!r || r.w < 1 || r.h < 1) return false;
    p.viewport.fitRect(r);
    this.emit('viewport', null); this.emit('render', null);
    return true;
  }

  /** View > Fit Artboard on Screen (27.11): the artboard holding the active layer (or the first artboard) fitted to the view. */
  fitArtboard(): boolean {
    const p = this.current;
    if (!p) return false;
    let l = p.activeLayer ?? null;
    while (l && !l.artboard && l.parentId) l = p.layer(l.parentId) ?? null;
    const a = l?.artboard ?? p.doc.layers.find((x) => x.artboard)?.artboard;
    if (!a) return false;
    p.viewport.fitRect(a);
    this.emit('viewport', null); this.emit('render', null);
    return true;
  }

  zoomTo(z: number, at?: Pt): void {
    const v = this.current?.viewport;
    if (!v) return;
    const a = at ?? { x: v.centerX, y: v.height / 2 };
    v.zoomAt(z, a.x, a.y);
    this.emit('viewport', null);
    this.emit('render', null);
  }
  zoomStep(inward: boolean, at?: Pt): void {
    const z = this.current?.viewport.zoom ?? 1;
    this.zoomTo(inward ? z * 1.25 : z / 1.25, at);
  }
  pan(dx: number, dy: number): void {
    const v = this.current?.viewport;
    if (!v) return;
    v.panBy(dx, dy);
    this.emit('viewport', null);
    this.emit('render', null);
  }

  /** Multichannel (31.3b): the channels overprinted on white, drawn once per channel set. */
  private mcCache: { key: object; s: Surface } | null = null;
  private multichannelSurface(doc: Doc): Surface | null {
    const mc = doc.multichannel;
    if (!mc) return null;
    if (this.mcCache?.key === mc) return this.mcCache.s;
    const W = doc.width, H = doc.height;
    const chs = mc.channels.map((ch) => {
      const d = ch.data.ctx.getImageData(0, 0, W, H).data, g = new Uint8ClampedArray(W * H);
      for (let i = 0; i < g.length; i++) g[i] = d[i * 4];
      return { color: ch.color, solidity: ch.solidity, grey: g };
    });
    const s = createSurface(W, H), img = ctxOf(s).createImageData(W, H);
    compositeChannels(chs, img.data);
    ctxOf(s).putImageData(img, 0, 0);
    this.mcCache = { key: mc, s };
    return s;
  }

  compose(target: Surface, view: Mat, quality: ImageSmoothingQuality = 'high'): void {
    const p = this.current;
    if (!p) return;
    if (p.doc.mode === 'multichannel' && p.doc.multichannel) {
      const s = this.multichannelSurface(p.doc), c = ctxOf(target);
      if (s) {
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, target.width, target.height);
        c.setTransform(view[0], view[1], view[2], view[3], view[4], view[5]);
        c.imageSmoothingQuality = quality;
        c.drawImage(s as CanvasImageSource, 0, 0);
        c.setTransform(1, 0, 0, 1, 0, 0);
        return;
      }
    }
    this.display.render({ doc: p.doc, target, view, overrides: this.overrides(p), quality });
  }

  /** The GPU display's view of the current document (Phase 18.2b): its visible layers bottom to top, each with its
   *  pixels, placement, opacity and blend mode, live previews applied as `compose` applies them; or the reason the
   *  document still draws on the CPU (what the GPU path does not draw yet). */
  gpuLayers(view: { matrix: Mat; width: number; height: number } | null = null): { layers: GpuLayerSpec[] } | { reason: string } {
    const p = this.current;
    if (!p) return { reason: 'no document is open' };
    const ov = this.overrides(p), layers: GpuLayerSpec[] = [], map = byId(p.doc), clips = new Map<ID, GpuClipSpec | null | 'nested'>(), fchains = new Map<ID | null, GpuMaskSpec[] | undefined>();
    for (const o of ov?.values() ?? []) if (o.patch) return { reason: 'a stroke on a large layer' };   // drawn by the CPU while it lasts (1.60.6)
    // A giant document's tiles in view go to the GPU (1.62.9, DEV_PLAN 26.6g; the CPU drew them since 1.62.3), which
    // needs the view to know which; asked without one (the bench), it stays on the CPU.
    if (!view && p.doc.layers.some((x) => x.tiled)) return { reason: 'a layer past 268 megapixels, asked without a view' };
    // A layer's mask, as the CPU renderer's maskOf reads it: enabled with pixels, the live preview's source while
    // painting, and its own placement, else the layer's (Phase 18, masks).
    const maskFor = (x: Layer, xo: LayerOverride | undefined): GpuMaskSpec | undefined => {
      const m = x.mask, msrc = m?.enabled && m.raster ? xo?.maskSource ?? m.raster.canvas : null;
      return m && msrc ? { image: msrc, version: xo?.maskSource ? -1 : (m.raster as Raster).version, width: msrc.width, height: msrc.height,
        matrix: placement(xo?.maskPlacement ?? m.placement ?? xo?.transform ?? x.transform, msrc.width, msrc.height) } : undefined;
    };
    // A vector mask (1.66.1) as the CPU renderer's vectorOf draws it: its coverage over the canvas, going with a linked
    // layer's live move or transform (`t`).
    const vecFor = (x: Layer, t: Transform = x.transform): GpuMaskSpec[] => {
      const v = x.vectorMask, c = v?.enabled ? vectorCoverage(v, p.doc.width, p.doc.height) : null;
      const along = !!v?.linked && t !== x.transform && !sameTransform(t, x.transform) && x.transform.w > 0 && x.transform.h > 0;
      return c ? [{ image: c.surface, version: c.version, width: p.doc.width, height: p.doc.height, matrix: along ? boxChange(x.transform, t) : [1, 0, 0, 1, 0, 0] }] : [];
    };
    // A clipping base, as the CPU renderer's clipCoverage reads it: its pixels at its opacity through its own mask (its
    // visibility and folder masks do not enter); null where it cannot clip (a folder, no pixels), which hides the
    // clipped layer; a base that is itself clipped stays on the CPU.
    const clipOf = (id: ID): GpuClipSpec | null | 'nested' => {
      const b = map.get(id);
      if (!b || b.isGroup || !b.raster) return null;
      if (b.clipId) return 'nested';
      const bo = ov?.get(b.id), src = bo?.source ?? b.raster.canvas, t = bo?.transform ?? b.transform;
      return { image: src, version: bo?.source ? -1 : b.raster.version, width: src.width, height: src.height, matrix: placement(t, src.width, src.height), opacity: bo?.opacity ?? b.opacity, mask: maskFor(b, bo) };
    };
    for (const { layer: l, visible } of hierarchy(p.doc)) {
      // A pass-through folder is its layers in order, hidden with the folder; one with its own opacity or blend mode is
      // composited on its own surface, which the CPU renderer does.
      if (l.isGroup) { if (l.artboard && visible) return { reason: 'artboards' }; if (visible && groupIsolated(l)) return { reason: 'a folder with its own opacity or blend mode' }; continue; }
      const o = ov?.get(l.id);
      if (o?.hidden || !visible) continue;
      // The masks of the folders around it, as the CPU renderer's folderMasks lists them (their pixels as they are, their
      // own placement, else the folder's), one array per parent folder so its layers share one coverage on the GPU.
      if (!fchains.has(l.parentId ?? null)) {
        const chain = ancestors(map, l).flatMap((g) => [...(g.mask?.enabled && g.mask.raster ? [{ image: g.mask.raster.canvas, version: g.mask.raster.version, width: g.mask.raster.width, height: g.mask.raster.height,
          matrix: placement(g.mask.placement ?? g.transform, g.mask.raster.width, g.mask.raster.height) }] : []), ...vecFor(g)]);
        fchains.set(l.parentId ?? null, chain.length ? chain : undefined);
      }
      // A layer's own vector mask (1.66.1) joins its folders' masks, one array of its own.
      const own = vecFor(l, o?.transform), folders = own.length ? [...(fchains.get(l.parentId ?? null) ?? []), ...own] : fchains.get(l.parentId ?? null);
      if (folders && l.clipId) return { reason: 'a clipped layer with a vector mask or inside a masked folder' };
      if (visible && (blendIfActive(l.blendIf) || (l.knockout && l.knockout !== 'none'))) return { reason: 'Blend If or Knockout' };
      const mask = maskFor(l, o);
      let clip: GpuClipSpec | undefined;
      if (l.clipId) {
        if (!clips.has(l.clipId)) clips.set(l.clipId, clipOf(l.clipId));
        const c = clips.get(l.clipId), cb = map.get(l.clipId);
        if (c === 'nested') return { reason: 'nested clipping masks' };
        if (cb && vecFor(cb).length) return { reason: 'a clipping base with a vector mask' };
        if (!c) continue;
        clip = c;
      }
      if (l.adjustment) {
        // Phase 18.5: a per-channel adjustment goes to the GPU as its proven lookup table (engine/lut.ts); others, by name,
        // keep the document on the CPU, as does one with a blend mode of its own.
        if ((o?.blend ?? l.blend) !== 'normal') return { reason: 'an adjustment layer with a blend mode' };
        const lut = adjustmentLut(l.adjustment);
        if (lut) {
          layers.push({ image: null, lut, mask, clip, folders, version: 0, width: 256, height: 1, matrix: [1, 0, 0, 1, 0, 0], opacity: (o?.opacity ?? l.opacity) * (l.fill ?? 1), blend: 'normal' });
          continue;
        }
        const lut3 = adjustmentLut3(l.adjustment);
        if (!lut3) return { reason: `a ${ADJUSTMENT_LABELS[l.adjustment.kind] ?? l.adjustment.kind} adjustment layer` };
        layers.push({ image: null, lut: lut3, lut3: true, mask, clip, folders, version: 0, width: LUT3_N * LUT3_N, height: LUT3_N, matrix: [1, 0, 0, 1, 0, 0], opacity: (o?.opacity ?? l.opacity) * (l.fill ?? 1), blend: 'normal' });
        continue;
      }
      // Layer styles: the renderer's own cached effect parts (images at document coordinates), drawn below and above the
      // layer as the CPU draws them; where the CPU draws effects per render instead, the document stays on the CPU.
      let fxParts: ReturnType<Renderer['gpuEffectParts']> = [];
      if (effectsActive(o?.effects ?? l.effects)) {
        if (clip || folders) return { reason: 'layer styles on a clipped layer, a vector mask or inside a masked folder' };
        fxParts = this.display.gpuEffectParts(l, o, p.doc);
        if (!fxParts) return { reason: 'layer styles on a layer being edited' };
      }
      // Dissolve's pattern is fixed to document pixels; the display composites in screen pixels, so it stays on the CPU.
      if ((o?.blend ?? l.blend) === 'dissolve') return { reason: 'a layer in Dissolve mode' };
      if (l.tiled && view) {   // a giant layer: its tiles in view, each its own texture (1.62.9)
        if (mask || clip || fxParts.length) return { reason: 'a mask, clipping mask or style on a layer kept in tiles' };
        this.tileSpecs(l.tiled, o?.transform ?? l.transform, (o?.opacity ?? l.opacity) * (l.fill ?? 1), o?.blend ?? l.blend, folders, view, layers);
        continue;
      }
      const img = o?.source ?? l.raster?.canvas;
      if (!img || !l.raster) continue;
      const lop = o?.opacity ?? l.opacity;
      const part = (q: NonNullable<typeof fxParts>[number]): GpuLayerSpec => ({ image: q.image, version: 0, width: q.image.width, height: q.image.height, matrix: q.matrix, opacity: q.alpha * lop, blend: q.blend });
      for (const q of fxParts) if (!q.above) layers.push(part(q));
      layers.push({ image: img, version: o?.source ? -1 : l.raster.version, width: img.width, height: img.height, matrix: placement(o?.transform ?? l.transform, img.width, img.height), opacity: (o?.opacity ?? l.opacity) * (l.fill ?? 1), blend: o?.blend ?? l.blend, mask, clip, folders });
      for (const q of fxParts) if (q.above) layers.push(part(q));
    }
    return { layers };
  }

  private effectPreview: { project: Project; layerId: ID; effects: LayerEffects | null } | null = null;

  /** Layer > Layer Style: sets or clears a pixel layer's effects as one undo step; nothing is recorded when the
   *  effects are unchanged. */
  /** The document's Global Light (Layer > Layer Style > Global Light), shared by effects that use it. */
  setGlobalLight(light: GlobalLight): void {
    const next = { angle: clamp(Math.round(light.angle), -180, 180), altitude: clamp(Math.round(light.altitude), 0, 90) };
    this.edit('Global Light', (p) => {
      const cur = p.doc.globalLight ?? DEFAULT_GLOBAL_LIGHT;
      if (cur.angle === next.angle && cur.altitude === next.altitude) return false;
      p.doc = { ...p.doc, globalLight: next };
      return true;
    });
  }

  /** File > File Info (29.2): the fields named in `patch` set on the document's metadata as one step called File Info;
   *  false, and no step, when nothing changes. The camera's record and the created date are not set from here. */
  setMeta(patch: MetaPatch): boolean {
    return this.edit('File Info', (p) => {
      const next = mergeMeta(p.doc.meta, patch, new Date().toISOString());
      if (next === p.doc.meta) return false;
      const { meta: _gone, ...rest } = p.doc;
      p.doc = next ? { ...rest, meta: next } : rest;
      return true;
    });
  }

  /** The Layer Style dialog's OK: the layer's effects and, when it changed, the document's Global Light, one step. */
  applyStyleAndLight(id: ID, effects: LayerEffects | null, light: GlobalLight | null, blending: { blendIf: BlendIf | null; knockout: 'none' | 'shallow' | 'deep' } | null = null): void {
    this.edit('Layer Style', (p) => {
      if (light) this.setGlobalLight(light);
      this.setLayerEffects(id, effects);
      if (blending) p.updateLayer(id, { blendIf: blendIfActive(blending.blendIf) ? blending.blendIf : null, knockout: blending.knockout });
      return true;
    });
  }

  setLayerEffects(id: ID, effects: LayerEffects | null): void {
    this.effectPreview = null;
    this.display.fastEffects = false;
    // Normalised, so a partial style gets every effect's defaults rather than failing later in the renderer.
    const whole = effects ? effectsFromData(JSON.parse(JSON.stringify(effects))) : null;
    const next = effectsPresent(whole) ? whole : null;
    const ok = this.edit('Layer Style', (p) => {
      const l = p.layer(id);
      if (!l || l.isGroup || l.adjustment) return false;
      if (JSON.stringify(l.effects ?? null) === JSON.stringify(next)) return false;
      p.updateLayer(id, { effects: next });
    });
    if (!ok) this.emit('render', null);
  }

  private textEditing: { project: Project; layerId: ID } | null = null;

  /** Hides type layer `id` while its text is edited on the canvas; null shows it again. */
  setTextEditing(id: ID | null): void {
    const p = this.current;
    this.textEditing = p && id ? { project: p, layerId: id } : null;
    this.emit('render', null);
  }

  /** The Type dialog's last settings, which new text starts from. */
  textSettings: TextSpec = defaultText();

  liveText(l: Layer | null | undefined): boolean { return liveText(l); }

  /** The topmost visible type layer whose box contains `pt`, for the Type tool to edit. */
  textLayerAt(pt: Pt): ID | null { return TX.textLayerAt(this.textHost, pt); }

  /** A new type layer: the click point `at` is where the first line's baseline starts (its centre or end when the text
   *  is centred or right-aligned), as point type does. */
  /** The Type tool's mask kinds (Horizontal and Vertical Type Mask): typing makes a selection, not a layer. */
  typeMask = false;
  /** Type Mask: the text rendered and placed as a layer would be, its coverage made the selection; one
   *  step, no layer. */
  async createTextSelection(at: Pt, spec: TextSpec): Promise<void> { return TX.createTextSelection(this.textHost, at, spec); }

  async createTextLayer(at: Pt, spec: TextSpec): Promise<void> { return TX.createTextLayer(this.textHost, at, spec); }

  /** Layer > Type on Path: `content` set along the active path's first subpath of two or more anchors, in the current
   *  type settings, from `offset` percent of its length; the path kept with the type, relative to a frame around it
   *  (its bounds and a margin of one and a half times the type size), where the layer is placed. */
  async createTextOnPath(content: string, offset: number): Promise<boolean> { return TX.createTextOnPath(this.textHost, content, offset); }

  /** Layer > Type > Type on Arc / Type on Circle: `content` set along an arc (degrees, 0 at the top, clockwise; the type
   *  reads left to right along the top when start is minus half the sweep) or a full circle, live and editable. */
  async createTextOnShape(content: string, shape: { kind: 'arc' | 'circle'; cx: number; cy: number; r: number; start: number; sweep: number }, offset: number): Promise<boolean> { return TX.createTextOnShape(this.textHost, content, shape, offset); }

  /** The centre type on an arc or circle is set around: the selection's centre, else the document's. */
  shapeCentre(): { x: number; y: number } | null {
    const p = this.current;
    if (!p) return null;
    const s = p.selection?.rect;
    return s && s.w > 0 && s.h > 0 ? { x: s.x + s.w / 2, y: s.y + s.h / 2 } : { x: p.doc.width / 2, y: p.doc.height / 2 };
  }

  /** Window > Arrange > New Window for Document, and Float in Window with a `floating` rectangle: another view of the
   *  document `id` (the current one by default), with its own zoom, pan and rotation (the tab's rotation to begin with). */
  openView(id: string | null = null, floating: FloatRect | null = null): DocView | null {
    const p = id ? this.projects.find((q) => q.id === id) : this.current;
    if (!p) return null;
    const v = this.docViews.open(p.id, p.viewport.rotation, floating);
    this.emit('projects', null);
    return v;
  }

  /** Closes one further view; the document stays open (its tab, and any other view). True when it existed. */
  closeView(viewId: string): boolean {
    if (!this.docViews.close(viewId)) return false;
    this.emit('projects', null);
    return true;
  }

  /** Close Tab on a document that still has a further view closes that view first (the newest), keeping the document
   *  open while another view remains. True when a view was closed; false means the document has none. */
  closeSpareView(projectId: string): boolean {
    const list = this.docViews.of(projectId);
    return list.length > 0 && this.closeView(list[list.length - 1].id);
  }

  /** Window > Arrange > Match Zoom, Match Location, Match Rotation: the current document's view copied to every other
   *  open document. Location puts the same document point at the view's centre. */
  matchViews(what: { zoom?: boolean; location?: boolean; rotation?: boolean }): void {
    const cur = this.current;
    if (!cur || this.projects.length < 2) return;
    const v = cur.viewport, mid = v.toDoc(v.centerX, v.height / 2);
    for (const p of this.projects) {
      if (p === cur) continue;
      const w = p.viewport;
      if (what.zoom) { w.zoom = v.zoom; w.fitted = false; }
      if (what.rotation) w.rotation = v.rotation;
      if (what.location) { w.panX = w.centerX - mid.x * w.zoom; w.panY = w.height / 2 - mid.y * w.zoom; w.fitted = false; }
    }
    this.emit('viewport', null);
    this.emit('render', null);
  }

  /** Window > Paragraph Styles: the document's styles. */
  get paragraphStyles(): readonly ParagraphStyle[] { return this.current?.doc.paragraphStyles ?? []; }

  /** New Paragraph Style: the selected type layer's settings as a style, the layer linked to it; one step. */
  newParagraphStyle(name?: string): ID | null {
    const p = this.current, l = p?.activeLayer, t = l?.text;
    if (!p || !l || !liveText(l) || !t) { this.notice('Select a type layer to make a paragraph style from it.'); return null; }
    const list = p.doc.paragraphStyles ?? [], id = uid(), style = styleOf(t, id, name?.trim() || `Paragraph Style ${list.length + 1}`);
    this.edit('New Paragraph Style', (pp) => { pp.doc = { ...pp.doc, paragraphStyles: [...list, style] }; pp.updateLayer(l.id, { text: { ...t, style: id } }); });
    return id;
  }

  /** Type > Load Default Type Styles: Heading 1, Heading 2, Body and Caption added as paragraph styles of the document,
   *  those whose name it already has left alone; one step. Returns how many were added. */
  loadDefaultTypeStyles(): number {
    const p = this.current;
    if (!p) return 0;
    const list = p.doc.paragraphStyles ?? [], base = defaultText();
    const defs: Array<[string, Partial<TextSpec>]> = [['Heading 1', { size: 48, bold: true, lineHeight: 1.1 }], ['Heading 2', { size: 32, bold: true, lineHeight: 1.15 }], ['Body', { size: 16, lineHeight: 1.5 }], ['Caption', { size: 12, italic: true, lineHeight: 1.3 }]];
    const add = defs.filter(([name]) => !list.some((s) => s.name === name)).map(([name, v]) => styleOf({ ...base, ...v }, uid(), name));
    if (!add.length) { this.notice('The default type styles are already in this document.'); return 0; }
    this.edit('Load Default Type Styles', (pp) => { pp.doc = { ...pp.doc, paragraphStyles: [...list, ...add] }; });
    return add.length;
  }

  /** Apply a paragraph style to the selected type layer: its settings, the layer's own text, warp and path kept. */
  async applyParagraphStyle(id: ID): Promise<void> {
    const p = this.current, l = p?.activeLayer, s = p?.doc.paragraphStyles?.find((x) => x.id === id);
    if (!p || !l || !liveText(l) || !l.text || !s) { this.notice('Select a type layer and a paragraph style.'); return; }
    await this.updateTextLayer(l.id, withStyle(l.text, s));
  }

  /** Redefine a paragraph style from the selected type layer's settings, and re-render every type layer linked to it,
   *  each keeping its scale and its left edge, centre or right edge, as editing its text does; one step. */
  async redefineParagraphStyle(id: ID): Promise<void> {
    const p = this.current, src = p?.activeLayer, old = p?.doc.paragraphStyles?.find((x) => x.id === id);
    if (!p || !src || !liveText(src) || !src.text || !old) { this.notice('Select a type layer to redefine the style from.'); return; }
    const style = styleOf(src.text, id, old.name);
    const linked = p.doc.layers.filter((l) => liveText(l) && l.raster && (l.text?.style === id || l.id === src.id));
    const specs = linked.map((l) => withStyle(l.text as TextSpec, style));
    // Drawn with each layer's character style over the paragraph style (32.6c); the layer keeps its own spec.
    const charOf = (s: TextSpec): TextSpec => withCharStyle(s, s.charStyle ? p.doc.characterStyles?.find((x) => x.id === s.charStyle) : undefined);
    for (const s of specs) await loadTextFont(charOf(s));
    if (this.current !== p) return;
    this.edit('Redefine Paragraph Style', (pp) => {
      pp.doc = { ...pp.doc, paragraphStyles: (pp.doc.paragraphStyles ?? []).map((x) => (x.id === id ? style : x)) };
      linked.forEach((l, i) => {
        const spec = specs[i], r = renderText(charOf(spec)), oldR = l.raster as Raster, t = l.transform;
        const nw = r.raster.width * (t.w / oldR.width), nh = r.raster.height * (t.h / oldR.height);
        // Vertical type keeps its right edge (its first column); paragraph text its box's corner; point text its alignment.
    const x = spec.box ? t.x : spec.direction === 'vertical' ? t.x + t.w - nw : spec.align === 'center' ? t.x + (t.w - nw) / 2 : spec.align === 'right' ? t.x + t.w - nw : t.x;
        pp.updateLayer(l.id, { raster: r.raster, transform: { ...t, x, w: nw, h: nh }, text: { ...spec, rendered: textKey(r.raster) } });
      });
    });
  }

  /** Delete a paragraph style; the type linked to it keeps its look and is simply unlinked; one step. */
  deleteParagraphStyle(id: ID): void {
    const p = this.current;
    if (!p || !p.doc.paragraphStyles?.some((x) => x.id === id)) return;
    this.edit('Delete Paragraph Style', (pp) => {
      pp.doc = { ...pp.doc, paragraphStyles: (pp.doc.paragraphStyles ?? []).filter((x) => x.id !== id) };
      for (const l of pp.doc.layers) if (l.text?.style === id) pp.updateLayer(l.id, { text: { ...l.text, style: null } });
    });
  }

  /** Window > Character Styles: the document's character styles. */
  get characterStyles(): readonly CharacterStyle[] { return this.current?.doc.characterStyles ?? []; }

  /** New Character Style: the selected type layer's family, size, colour, weight, slant, tracking and features as a style,
   *  the layer linked to it; one step. */
  newCharacterStyle(name?: string): ID | null {
    const p = this.current, l = p?.activeLayer, t = l?.text;
    if (!p || !l || !liveText(l) || !t) { this.notice('Select a type layer to make a character style from it.'); return null; }
    const list = p.doc.characterStyles ?? [], id = uid(), style = charStyleOf(t, id, name?.trim() || `Character Style ${list.length + 1}`);
    this.edit('New Character Style', (pp) => { pp.doc = { ...pp.doc, characterStyles: [...list, style] }; pp.updateLayer(l.id, { text: { ...t, charStyle: id } }); });
    return id;
  }

  /** Apply a character style to the selected type layer (sets its link); the style's set fields then draw over its own. */
  async applyCharacterStyle(id: ID): Promise<void> {
    const p = this.current, l = p?.activeLayer;
    if (!p || !l || !liveText(l) || !l.text || !p.doc.characterStyles?.some((x) => x.id === id)) { this.notice('Select a type layer and a character style.'); return; }
    await this.updateTextLayer(l.id, { ...l.text, charStyle: id });
  }

  /** Clear Override: unlink the selected type layer from its character style so its own settings draw. */
  async clearCharacterStyle(): Promise<void> {
    const l = this.current?.activeLayer;
    if (!l || !liveText(l) || !l.text?.charStyle) { this.notice('Select a type layer that has a character style.'); return; }
    await this.updateTextLayer(l.id, { ...l.text, charStyle: null });
  }

  /** Redefine a character style from the selected type layer, re-rendering every layer linked to it; one step. */
  async redefineCharacterStyle(id: ID): Promise<void> {
    const p = this.current, src = p?.activeLayer, old = p?.doc.characterStyles?.find((x) => x.id === id);
    if (!p || !src || !liveText(src) || !src.text || !old) { this.notice('Select a type layer to redefine the style from.'); return; }
    const style = charStyleOf(src.text, id, old.name), next = (p.doc.characterStyles ?? []).map((x) => (x.id === id ? style : x));
    const linked = p.doc.layers.filter((l) => liveText(l) && l.raster && l.text && (l.text.charStyle === id || l.id === src.id));
    const patches: Array<{ id: ID; patch: Partial<Layer> }> = [];
    for (const l of linked) {
      const patch = await this.textPatch(p, l.id, { ...(l.text as TextSpec), charStyle: id }, next);
      if (this.current !== p) return;
      if (patch) patches.push({ id: l.id, patch });
    }
    this.edit('Redefine Character Style', (pp) => {
      pp.doc = { ...pp.doc, characterStyles: next };
      for (const x of patches) pp.updateLayer(x.id, x.patch);
    });
  }

  /** Rename a character style; one step. */
  renameCharacterStyle(id: ID, name: string): void {
    const p = this.current, clean = name.trim().slice(0, 80);
    if (!p || !clean || !p.doc.characterStyles?.some((x) => x.id === id)) return;
    this.edit('Rename Character Style', (pp) => { pp.doc = { ...pp.doc, characterStyles: (pp.doc.characterStyles ?? []).map((x) => (x.id === id ? { ...x, name: clean } : x)) }; });
  }

  /** Delete a character style; the type linked to it keeps its look (the style's fields are written into the layer) and is unlinked; one step. */
  deleteCharacterStyle(id: ID): void {
    const p = this.current, s = p?.doc.characterStyles?.find((x) => x.id === id);
    if (!p || !s) return;
    this.edit('Delete Character Style', (pp) => {
      pp.doc = { ...pp.doc, characterStyles: (pp.doc.characterStyles ?? []).filter((x) => x.id !== id) };
      for (const l of pp.doc.layers) if (l.text?.charStyle === id) pp.updateLayer(l.id, { text: { ...withCharStyle(l.text, s), charStyle: null } });
    });
  }

  /** Binds a variable to a layer (Image > Variables > Define, DEV_PLAN 29.9), replacing any variable of the same name: one undo step. */
  defineVariable(v: DocVariable): boolean {
    const p = this.current, l = p?.layer(v.layer), name = v.name.trim().slice(0, 120);
    if (!p || !l || !name) { this.notice('A variable needs a name and a layer.'); return false; }
    if (v.kind === 'text' && !liveText(l)) { this.notice('Text Replacement needs a type layer.'); return false; }
    if (v.kind === 'pixels' && (l.isGroup || l.adjustment || l.text || l.shape || l.smart)) { this.notice('Pixel Replacement needs a pixel layer.'); return false; }
    const entry: DocVariable = { name, layer: l.id, kind: v.kind, ...(v.kind === 'pixels' ? { method: v.method ?? 'fit' } : {}) };
    return this.edit('Define Variable', (pp) => { pp.doc = { ...pp.doc, variables: [...(pp.doc.variables ?? []).filter((x) => x.name !== name), entry] }; return true; });
  }

  /** Data sets from CSV or tab-separated text, replacing the document's data sets: one undo step. Returns how many were read. */
  importDataSets(text: string): number {
    const { dataSets } = VR.buildDataSets(text);
    if (!dataSets.length) { this.notice('No data sets found: the first row names the variables, each later row is a data set.'); return 0; }
    return this.edit('Import Data Sets', (pp) => { pp.doc = { ...pp.doc, dataSets, activeDataSet: null }; return true; }) ? dataSets.length : 0;
  }

  /** Applies a data set: visibility, type text (style kept) and pixel replacement (images from `files`, by name, placed
   *  within the layer's bounds), all in one undo step. */
  async applyDataSet(name: string, files: ReadonlyMap<string, File> = new Map()): Promise<boolean> {
    const p = this.current, set = p?.doc.dataSets?.find((d) => d.name === name);
    if (!p || !set) { this.notice('No such data set.'); return false; }
    const plan = VR.planFor(p.doc, set), texts = new Map<ID, { raster: Raster; spec: TextSpec }>(), pixels = new Map<ID, Raster>();
    for (const c of plan) {
      const l = p.layer(c.layer);
      if (!l) continue;
      if (c.kind === 'text' && l.text && c.content.trim()) {
        const spec = { ...l.text, content: c.content }, drawn = withCharStyle(spec, spec.charStyle ? p.doc.characterStyles?.find((x) => x.id === spec.charStyle) : undefined);
        await loadTextFont(drawn);
        texts.set(l.id, { raster: renderText(drawn).raster, spec });
      } else if (c.kind === 'pixels') {
        const f = files.get(c.file);
        if (!f) { this.notice(`Image not supplied: ${c.file}`); continue; }
        try {
          const bmp = await createImageBitmap(f), t = l.transform, r = new Raster(p.doc.width, p.doc.height), q = VR.placeInBox(bmp.width, bmp.height, t.x, t.y, t.w, t.h, c.method);
          r.ctx.save(); r.ctx.beginPath(); r.ctx.rect(t.x, t.y, t.w, t.h); r.ctx.clip();
          r.ctx.drawImage(bmp, q.x, q.y, q.w, q.h);
          r.ctx.restore(); bmp.close(); r.touch();
          pixels.set(l.id, r);
        } catch { this.notice(`Could not read image: ${c.file}`); }
      }
    }
    if (this.current !== p) return false;
    return this.edit('Apply Data Set', (pp) => {
      for (const c of plan) {
        const l = pp.layer(c.layer);
        if (!l) continue;
        if (c.kind === 'visibility') pp.updateLayer(l.id, { visible: c.visible });
        else if (c.kind === 'text') {
          const n = texts.get(l.id), old = l.raster;
          if (!n || !old) continue;
          const t = l.transform, nw = n.raster.width * (t.w / old.width), nh = n.raster.height * (t.h / old.height), s = n.spec;
          const x = s.box ? t.x : s.direction === 'vertical' ? t.x + t.w - nw : s.align === 'center' ? t.x + (t.w - nw) / 2 : s.align === 'right' ? t.x + t.w - nw : t.x;
          pp.updateLayer(l.id, { raster: n.raster, transform: { ...t, x, w: nw, h: nh }, text: { ...s, rendered: textKey(n.raster) } });
        } else if (c.kind === 'pixels') { const r = pixels.get(l.id); if (r) pp.updateLayer(l.id, { raster: r, transform: docTransform(pp.doc.width, pp.doc.height) }); }
      }
      pp.doc = { ...pp.doc, activeDataSet: name };
      return true;
    });
  }

  /** New text or settings for a type layer, re-rendered in place as one undo step: any scaling of the layer is kept,
   *  and so is its left edge, centre or right edge, by its alignment. */
  async updateTextLayer(id: ID, spec: TextSpec): Promise<void> { return TX.updateTextLayer(this.textHost, id, spec); }

  /** The new pixels, place and name of type layer `id` set to `spec`, rendered but not applied, so several layers can
   *  change in one undo step (Find and Replace Text, Update All Text Layers). Null when the layer is not live type. */
  private async textPatch(p: Project, id: ID, spec: TextSpec, styles: readonly CharacterStyle[] | undefined = p.doc.characterStyles): Promise<Partial<Layer> | null> { return TX.textPatch(this.textHost, p, id, spec, styles); }

  /** Find and Replace Text: replaces matches in the content of every live type layer (or only the active one) and
   *  returns the number of replacements, all as one undo step. */
  async replaceText(find: string, replace: string, opts: { caseSensitive: boolean; wholeWord: boolean; all: boolean }): Promise<number> { return TX.replaceText(this.textHost, find, replace, opts); }

  /** Converts the active type layer between point text (no box) and paragraph text (a box around its current size). */
  async convertTextKind(to: 'point' | 'paragraph'): Promise<boolean> { return TX.convertTextKind(this.textHost, to); }

  /** Re-renders every live type layer with its own spec; returns how many it handled. */
  async updateAllTextLayers(): Promise<number> { return TX.updateAllTextLayers(this.textHost); }

  /** The live type layers' id, name, content and font family, for Check Spelling and Resolve Missing Fonts. */
  textLayerInfo(): Array<{ id: ID; name: string; content: string; family: string }> { return TX.textLayerInfo(this.textHost); }

  /** New content for live type layers as one undo step named `step`; returns how many changed. */
  async setTextContents(edits: ReadonlyArray<{ id: ID; content: string }>, step: string): Promise<number> { return TX.setTextContents(this.textHost, edits, step); }

  /** Swaps font families on live type layers (old family to new) as one undo step named `step`; returns how many changed. */
  async replaceFontFamilies(map: ReadonlyMap<string, string>, step: string): Promise<number> { return TX.replaceFontFamilies(this.textHost, map, step); }

  /** True, with a notice, when the active layer is a smart object and an edit would change its pixels rather than its
   *  mask. Checked before any history step opens. */
  private smartLocked(p: Project): boolean {
    const l = p.activeLayer;
    if (!(l?.smart || l?.vector || l?.fillContent) || (p.maskTarget && l.mask)) return false;
    this.notice(l.vector ? SHAPE_NOTICE : l.fillContent ? FILL_NOTICE : SMART_NOTICE);
    return true;
  }

  /** Runs one smart filter on `src`, supplied by the app, since the filter code lives with the Filter dialog. */
  smartFilterRunner: ((kind: string, settings: Record<string, unknown>, src: ImageData) => ImageData) | null = null;

  /** How far a smart filter's effect reaches past its input, supplied by the app with the runner. */
  smartFilterMargin: ((kind: string, settings: Record<string, unknown>) => number) | null = null;

  /** A smart object's pixels: its source padded by the shown filters' total reach, with each applied in order. */
  private smartMargin(filters: SmartFilter[]): number { return SOB.smartMargin(this.smartObjectHost, filters); }

  /** A distorted smart object's warp as the layer now sits: a move or transform since its last render carried in. */
  private smartWarpNow(l: Layer): Pt[] | null { return SOB.smartWarpNow(l); }

  /** The render `r` (the source padded by `margin`) warped so the source's corners land on `warp`, the padding
   *  following the same perspective, cropped to what shows. */
  private warpedSmart(r: Raster, margin: number, source: Raster, warp: Pt[]): Warped | null { return SOB.warpedSmart(r, margin, source, warp); }

  private renderSmart(source: Raster, filters: SmartFilter[], mask: Raster | null = null): Raster { return SOB.renderSmart(this.smartObjectHost, source, filters, mask); }

  /** Layer > Convert to Smart Object: keeps the layer's pixels as the untouched source of a smart object. */
  convertToSmartObject(): void { SOB.convertToSmartObject(this.smartObjectHost); }

  /** 33.1: several selected pixel layers (bottom first) become one smart object on the top one, keeping their document-size
   *  renders as a stack (mode None, the top one shows); the other layers go. One step. */
  private stackToSmartObject(sel: Layer[]): void { SOB.stackToSmartObject(this.smartObjectHost, sel); }

  /** The active smart object's stack mode, or null when it has no stack. */
  get stackMode(): StackMode | null { return SOB.stackMode(this.smartObjectHost); }

  /** Layer > Smart Objects > Stack Mode: recomputes the active smart object's source from its stack and re-renders it
   *  through the filters, one undo step. */
  setStackMode(mode: StackMode): boolean { return SOB.setStackMode(this.smartObjectHost, mode); }

  /** Layer > Rasterize Layer: a smart object or a type layer becomes plain pixels, looking as it does now. */
  rasterizeLayer(): void {
    this.edit('Rasterize Layer', (p) => {
      const l = p.activeLayer;
      // Live shapes too (1.53.3): a plain filled rectangle or ellipse keeps its pixels and becomes an ordinary layer.
      if (!l || (!l.smart && !l.text && !l.vector && !l.shape && !l.fillContent)) return false;
      p.updateLayer(l.id, { smart: null, text: null, vector: null, shape: null, fillContent: null });
    });
  }

  /** Layer > Rasterize > Type, Shape, Fill Content, Smart Object or Layer on the selected layers of that kind, or All
   *  Layers on every type, shape, fill and smart object layer in the document. One step. */
  rasterizeLayers(kind: 'type' | 'shape' | 'fill' | 'smart' | 'layer' | 'all'): void {
    const of = (l: Layer): boolean => (kind === 'type' ? !!l.text : kind === 'shape' ? !!(l.vector || l.shape) : kind === 'fill' ? !!l.fillContent : kind === 'smart' ? !!l.smart : !!(l.smart || l.text || l.vector || l.shape || l.fillContent));
    const name = { type: 'Rasterize Type', shape: 'Rasterize Shape', fill: 'Rasterize Fill Content', smart: 'Rasterize Smart Object', layer: 'Rasterize Layer', all: 'Rasterize All Layers' }[kind];
    this.edit(name, (p) => {
      const ids = p.doc.layers.filter((l) => of(l) && (kind === 'all' || p.selectedIds.has(l.id))).map((l) => l.id);
      if (!ids.length) return false;
      for (const id of ids) p.updateLayer(id, { smart: null, text: null, vector: null, shape: null, fillContent: null });
      return true;
    });
  }

  /** Layer > Smart Objects > New Smart Object via Copy (1.68.1): the active smart object becomes a second, independent one
   *  above it (its own copy of the source, the filter stack and the filter mask), named "<name> copy": one step. */
  newSmartObjectViaCopy(): void { SOB.newSmartObjectViaCopy(this.smartObjectHost); }

  /** Layer > Smart Objects > Convert to Layers (1.68.1): the smart object's source, at its current placement (transform and
   *  warp applied, smart filters not), becomes a plain pixel layer keeping name, opacity, blend mode and mask: one step. */
  smartToLayers(): void { SOB.smartToLayers(this.smartObjectHost); }

  /** The active smart object's name and source raster, for Layer > Smart Objects > Export Contents; null when none. */
  smartContents(): { name: string; raster: Raster } | null { return SM.smartContents(this.smartHost); }

  /** Adds a filter to the active smart object's stack and re-renders it, as one undo step. */
  addSmartFilter(kind: string, settings: Record<string, unknown>): void { SM.addSmartFilter(this.smartHost, kind, settings); }

  /** Replaces a smart object's filter stack and re-renders its pixels from the source, as one undo step. */
  setSmartFilters(id: ID, filters: SmartFilter[], name = 'Smart Filters'): void { SM.setSmartFilters(this.smartHost, id, filters, name); }

  /** Layer > Smart Filter > Disable Smart Filters (1.68.0): true while the active smart object has filters and all are off,
   *  so the command reads Enable Smart Filters. */
  get smartFiltersOff(): boolean { return SM.smartFiltersOff(this.smartHost); }
  /** Turns every filter of the active smart object off, or on when all are off: one step. */
  toggleSmartFilters(): void { SM.toggleSmartFilters(this.smartHost); }
  /** Layer > Smart Filter > Clear Smart Filters (1.68.0): removes the active smart object's filters, one step. */
  clearSmartFilters(): void { SM.clearSmartFilters(this.smartHost); }

  /** Edit > Purge (1.68.0). Histories: the document's undo and redo steps go, its state and its snapshots stay. */
  purgeHistories(all: boolean): number {
    if (this.stroke) return 0;
    let n = 0;
    const targets = all ? this.projects : this.current ? [this.current] : [], held = new Set<Raster>();
    for (const p of targets) { for (const r of p.history.rasters()) held.add(r); n += p.history.clear(); }
    // The canvases only the forgotten steps kept (a layer a growing filter replaced, a smart object's old source) are
    // shrunk to nothing as closing a document shrinks its own, so the memory is back now rather than when the browser
    // next collects (36.18); a raster any document still shows or holds in its layers stays.
    const kept = new Set<Raster>();
    for (const q of this.projects) for (const r of this.rastersOf(q)) kept.add(r);
    for (const r of held) {
      if (kept.has(r)) continue;
      const t = this.pagedRasters.get(r);
      if (t) { for (const x of t) this.undoStore?.drop(x.key); this.pagedRasters.delete(r); }
      try { r.canvas.width = 0; r.canvas.height = 0; } catch { /* already gone */ }
    }
    this.historyOps.length = 0;
    this.emit('history', null);
    return n;
  }
  /** A document just made and then set to its mode and bit depth (New Document, which converts it as Image > Mode does):
   *  its steps are forgotten, its opening snapshot is taken again from the state it has now, and that state counts as
   *  saved, so its history starts clean with nothing to undo and no unsaved mark. */
  startHistoryClean(): void {
    const p = this.current;
    if (!p || this.stroke) return;
    this.purgeHistories(false);
    this.openingSnapshot(p);
    p.history.markSaved();
    this.emit('history', null);
  }
  /** Clipboard: formvis's own copy of pixels goes; the style clipboard is Layer > Layer Style's and stays. */
  purgeClipboard(): boolean {
    const c = this.clipboard;
    this.clipboard = null;
    if (c) { try { c.surface.width = 0; c.surface.height = 0; } catch { /* already gone */ } }   // its pixels back now, not at the next collection (36.18)
    return !!c;
  }

  /** Layer > Smart Objects > Replace Contents: a new source for the active smart object, shown at the same scale per
   *  source pixel and about the same centre, its filters and mask re-run, as one step. */
  replaceContents(source: Raster): boolean { return SOB.replaceContents(this.smartObjectHost, source); }

  /** Adds a smart filter mask to the active smart object: from the selection (mapped into the source's pixels) when
   *  there is one and the object is not distorted, else white, showing the filters everywhere. */
  addSmartFilterMask(): void { SM.addSmartFilterMask(this.smartHost); }

  deleteSmartFilterMask(): void { SM.deleteSmartFilterMask(this.smartHost); }

  toggleSmartFilterMask(): void { SM.toggleSmartFilterMask(this.smartHost); }

  /** File > Place Linked: `raster` as a new smart object, centred, linked to a file through `link`. */
  placeEmbedded(raster: Raster, name: string): void { SOB.placeEmbedded(this.smartObjectHost, raster, name); }

  placeLinked(raster: Raster, link: SmartLink, name: string): void { SOB.placeLinked(this.smartObjectHost, raster, link, name); }

  /** New contents read from a linked file: the smart object `id` re-rendered from `raster` at the same scale and
   *  centre, its link noting what was read, as one step. */
  updateLinkedContents(id: ID, raster: Raster, link: SmartLink, name = 'Update Modified Content'): boolean { return SOB.updateLinkedContents(this.smartObjectHost, id, raster, link, name); }

  /** Layer > Embed Linked: the smart object keeps its contents and forgets the file. */
  embedLinked(): void { SOB.embedLinked(this.smartObjectHost); }

  /** Layer > Smart Objects > Convert to Linked: the embedded smart object keeps its contents and takes `link`, one step. */
  convertToLinked(link: SmartLink): boolean { return SOB.convertToLinked(this.smartObjectHost, link); }

  /** A change made as one undo step in `p`, which need not be the document in view. */
  private editOn(p: Project, name: string, fn: () => boolean | void): boolean {
    if (p === this.current) return this.edit(name, () => fn());
    if (this.stroke) return false;
    p.history.begin(name, p.snapshot());
    let ok: boolean | void = true;
    try { ok = fn(); } finally { p.history.end(p.snapshot()); }
    this.emit('projects', null);
    return ok !== false;
  }

  /** Re-renders smart object `id` in `p` from a new source, a new filter stack, or both, as one undo step. */
  /** Runs one smart filter off the main thread, supplied by the app with the filter worker. */
  smartFilterRunnerAsync: ((kind: string, settings: Record<string, unknown>, src: ImageData) => Promise<ImageData>) | null = null;
  private readonly smartStore = new SOB.SmartObjectStore();

  /** The filters a smart object's dialog shows: those last asked for while their render is still running, else its own. */
  smartFiltersShown(id: ID): SmartFilter[] | null { return SOB.smartFiltersShown(this.smartObjectHost, id); }

  /** Re-renders a smart object: at once when it is small (up to 2 megapixels) or shows no filter, else in the
   *  background, the result applied as one undo step when it is ready. A later change to the same object supersedes a
   *  render still running, and a render whose source changed meanwhile is dropped. */
  private restackSoon(p: Project, id: ID, source: Raster | null, filters: SmartFilter[] | null, name: string, maskChange: { filterMask: Raster | null; filterMaskEnabled: boolean } | null = null, extra: Partial<SmartObject> | null = null): boolean {
    return SOB.restackSoon(this.smartObjectHost, p, id, source, filters, name, maskChange, extra);
  }

  /** Layer > Edit Contents: the active smart object's original pixels open as their own document. Saving that document
   *  writes it back into the smart object. */
  editContents(): Project | null { return SOB.editContents(this.smartObjectHost); }

  /** True for a document opened by Edit Contents, whether or not its smart object is still open. */
  isContents(p: Project | null): boolean { return SOB.isContents(this.smartObjectHost, p); }

  /** The smart object a contents document writes back to, while it is still open; null otherwise. */
  contentsOf(p: Project | null): { parent: Project; layer: Layer } | null { return SOB.contentsOf(this.smartObjectHost, p); }

  /** Saving a contents document (the one in view): its flattened pixels become the smart object's new source and the
   *  filters re-run, as one undo step in the smart object's document. A new size keeps the object's scale per pixel. */
  updateContents(): boolean { return SOB.updateContents(this.smartObjectHost); }

  private readonly timelines = new WeakMap<Project, Timeline>();

  private timelineOf(p: Project): Timeline {
    let t = this.timelines.get(p);
    if (!t) { t = { frames: [], current: null, loops: 0 }; this.timelines.set(p, t); }
    return t;
  }

  /** The current frame keeps what the layers show now while it is selected. */
  private syncFrame(p: Project): void {
    const t = this.timelineOf(p), f = t.frames.find((x) => x.id === t.current);
    if (f) f.state = captureFrame(p.doc);
  }

  /** After undo or redo. Undoing or redoing a frame change selects the frame the layers now show, overwriting none;
   *  undoing or redoing any other change belongs to the selected frame, which takes the result. */
  private reconcileFrame(p: Project, frameStep: boolean): void {
    const t = this.timelineOf(p);
    if (!t.frames.length) return;
    if (frameStep) {
      const now = JSON.stringify(captureFrame(p.doc)), match = t.frames.find((f) => JSON.stringify(f.state) === now);
      if (match) t.current = match.id;
    } else this.syncFrame(p);
    this.emit('timeline', null);
  }

  /** The current document's animation frames, the selected one brought up to date with the layers. */
  get timeline(): Timeline {
    const p = this.current;
    if (!p) return { frames: [], current: null, loops: 0 };
    this.syncFrame(p);
    return this.timelineOf(p);
  }

  /** Timeline > New Frame: a copy of the selected frame after it, selected. With no frames yet, frame 1 is the layers
   *  as they are, and the copy is frame 2. */
  /** Create Frame Animation (1.59.8): one frame, the document as it is; refused beside a video timeline
   *  or an animation already begun. */
  startFrameAnimation(): boolean { return FR.startFrameAnimation(this.frameHost); }

  newFrame(): void { FR.newFrame(this.frameHost); }

  /** Selects a frame, applying its layer states as one undo step, after the frame being left keeps its own. */
  selectFrame(id: ID): void { FR.selectFrame(this.frameHost, id); }

  /** Timeline > Delete Frame: removes the selected frame, or the one given, and selects its neighbour. */
  deleteFrame(id?: ID): void { FR.deleteFrame(this.frameHost, id); }

  /** Moves frame `id` to position `to`, counted from 0, as dragging it in the Timeline does. */
  moveFrame(id: ID, to: number): void { FR.moveFrame(this.frameHost, id, to); }

  /** Timeline > Tween: `count` frames between frame `id` and the one after it, stepping each layer's position and
   *  opacity evenly. A layer shown in only one of the two fades, shown in the new frames with its opacity stepping from
   *  or to nothing; without opacity it keeps the first frame's visibility. New frames take the first frame's delay. */
  tween(id: ID, count: number, opts: { position: boolean; opacity: boolean; easing?: 'linear' | 'in' | 'out' | 'inOut' }): boolean { return FR.tween(this.frameHost, id, count, opts); }

  setFrameDelay(id: ID, ms: number): void { FR.setFrameDelay(this.frameHost, id, ms); }

  /** How often the animation plays: 0 repeats forever. */
  setLoops(n: number): void { FR.setLoops(this.frameHost, n); }

  /** Frame `f` of the current document at full size, rendered without touching the layers; the document as it stands
   *  when `f` is null. */
  renderFrame(f: Frame | null): Surface | null { return FR.renderFrame(this.frameHost, f); }

  /** The current document's video timeline (1.59.2, DEV_PLAN 25.1), or null. */
  get video(): VideoTimeline | null { return VD.video(this.videoHost); }

  /** Timeline > Create Video Timeline: `fps` frames a second for `seconds`, a track per layer; refused while the
   *  document has a frame animation or a video timeline already (the two modes are one or the other). */
  createVideoTimeline(fps = 30, seconds = 5): boolean { return VD.createVideoTimeline(this.videoHost, fps, seconds); }

  /** Delete Timeline (the video one), a step. */
  deleteVideoTimeline(): boolean { return VD.deleteVideoTimeline(this.videoHost); }

  /** The video timeline changed through `fn` on a copy, then put in place and shown. With a `name` it is one undoable
   *  step (1.59.5, carrying the timeline as path edits carry paths); inside a gesture (`beginVideoGesture`) it is live,
   *  the gesture being the step; without either it is live and no step at all (the playhead moving). */
  editVideo(fn: (vt: VideoTimeline) => void, name?: string): boolean { return VD.editVideo(this.videoHost, fn, name); }

  /** Fade In, Fade Out or both on layer `id`'s clip over `frames` (0 removes them), one step (1.59.7: from the panel
   *  into the engine, which the MCP tools share). False when the layer has no clip. */
  fadeClip(id: ID, frames: number, inn: boolean, out: boolean, color: FadeColor | null = null): boolean { return VD.fadeClip(this.videoHost, id, frames, inn, out, color); }

  /** Cross Fade: layer `id`'s clip with the clip that starts or ends within it and overlaps it most
   *  (one covering it whole, a background, is no partner), over their overlap, fading only the upper of the two (in
   *  when it starts later, out when it ends first) so the picture never dips. Null when done, else why not. */
  crossFade(id: ID): string | null { return VD.crossFade(this.videoHost, id); }

  /** Split at a frame (Split at Playhead): layer `id`'s clip ends at `frame`, and a copy of the layer
   *  carries on from it with the rest of the clip and the same keyframes. The copy's id, or null when `frame` is not
   *  inside the clip. */
  splitClip(id: ID, frame: number): ID | null { return VD.splitClip(this.videoHost, id, frame); }

  /** A drag in the timeline (a clip moved or trimmed, a keyframe moved) as one step, from press to release. */
  beginVideoGesture(name: string): void { VD.beginVideoGesture(this.videoHost, name); }
  endVideoGesture(): void { VD.endVideoGesture(this.videoHost); }

  /** The playhead moved to frame `f` (kept within the timeline); the canvas shows that frame. */
  setVideoTime(f: number): void { VD.setVideoTime(this.videoHost, f); }

  /** The open timeline drag, and the raster version each video layer's shown frame had (video-ops.ts). */
  private readonly videoStoreState = new VD.VideoStore();

  /** Interpret Footage: the active video layer's rate, loop count and alpha reading, its clip made as long as the
   *  footage now plays. One undo step. */
  interpretFootage(it: FootageInterpretation): boolean { return VD.interpretFootage(this.videoHost, it); }

  /** New Video Layer: `frames` become a pixel layer whose clip starts at `start` (the playhead) and lasts as many frames;
   *  a video timeline is made if there is none. One undo step. */
  addVideoLayer(name: string, frames: Raster[], start?: number): boolean { return VD.addVideoLayer(this.videoHost, name, frames, start); }

  /** New Blank Video Layer: an empty document-size frame for every frame of the timeline (150 when there is none). */
  newBlankVideoLayer(): boolean { return VD.newBlankVideoLayer(this.videoHost); }

  /** Insert Blank Frame: an empty frame after the playhead's, which moves onto it. The clip grows by one. */
  insertBlankFrame(): boolean { return VD.insertBlankFrame(this.videoHost); }

  /** Duplicate Frame: a copy of the playhead's frame after it, the playhead moving onto the copy. */
  duplicateFrame(): boolean { return VD.duplicateFrame(this.videoHost); }

  /** Delete Frame: the playhead's frame goes and the clip shortens; the last frame of a clip stays. */
  deleteVideoFrame(): boolean { return VD.deleteVideoFrame(this.videoHost); }

  /** Restore Frame: the playhead's frame back to the footage as loaded. */
  restoreFrame(): boolean { return VD.restoreFrame(this.videoHost); }

  /** Restore All Frames: every frame back to the footage as loaded. */
  restoreAllFrames(): boolean { return VD.restoreAllFrames(this.videoHost); }

  /** Rasterize Video Layer: the layer becomes an ordinary pixel layer holding the frame at the playhead. */
  rasterizeVideo(): boolean { return VD.rasterizeVideo(this.videoHost); }

  /** The picture at video frame `f`: the layers in the state the timeline gives them there. */
  renderVideoFrame(f: number): Surface | null { return VD.renderVideoFrame(this.videoHost, f); }

  /** Keeps the painted frame under the playhead in each video layer's `frames`, as saving and rendering read them. */
  flushVideo(): void { VD.flushVideo(this.videoHost); }

  /** Replace Footage: the active video layer's original and painted frames both become `frames`, and its clip as long as
   *  they are. One undo step. */
  replaceFootage(frames: Raster[]): boolean { return VD.replaceFootage(this.videoHost, frames); }

  /** Convert to Frame Animation: a frame for each frame of the work area (500 at most), the video timeline gone. */
  convertVideoToFrames(): boolean { return VD.convertVideoToFrames(this.videoHost); }

  /** Any open document's timeline, as saving reads it, and replacing it, as opening restores it. */
  timelineFor(p: Project): Timeline { if (p === this.current) { this.flushVideo(); this.syncFrame(p); } return this.timelineOf(p); }
  setTimelineFor(p: Project, t: Timeline): void { this.timelines.set(p, t); if (p === this.current) this.emit('timeline', null); }

  /** Each open document's paths, the working copies of a shape's and a vector mask's path, and the open path gesture
   *  (path-ops.ts). */
  private readonly pathStore = new PA.PathStore();

  private pathSet(p: Project): PathSet { return PA.pathSet(this.pathHost, p); }

  /** A shape layer's pixels: its path filled with its colour, in a raster over the path's bounds. */
  private renderShape(path: VectorPath, style: ShapeStyle): { raster: Raster; x: number; y: number } | null {
    const b = pathBounds(path);
    if (!b || (!style.fill && !style.stroke)) return null;
    const pad = (style.stroke ? (style.stroke.align === 'outside' ? style.stroke.width : style.stroke.width / 2) : 0) + 1;
    const x = Math.floor(b.x - pad), y = Math.floor(b.y - pad), w = Math.min(LIMITS.side, Math.ceil(b.x + b.w + pad) - x), h = Math.min(LIMITS.side, Math.ceil(b.y + b.h + pad) - y);
    const raster = new Raster(Math.max(1, w), Math.max(1, h)), c = raster.ctx, shape = tracePath(path);
    c.translate(-x, -y);
    if (style.fill) { c.fillStyle = rgbCss(style.fill); fillVector(c, path); }
    if (style.stroke && style.stroke.width > 0) strokeShape(c, shape, style.stroke, path.subpaths.every((sp) => sp.closed));
    c.setTransform(1, 0, 0, 1, 0, 0);
    raster.touch();
    return { raster, x, y };
  }

  /** Re-renders shape layer `id` in `p` from `path` and `fill`. */
  private reshape(p: Project, id: ID, path: VectorPath, style?: ShapeStyle): void {
    const l = p.layer(id), v = l?.vector;
    if (!l || !v) return;
    const look = style ?? { fill: v.fill, stroke: v.stroke ?? null }, r = this.renderShape(path, look);
    if (!r) return;
    const stored = structuredClone(path);
    p.updateLayer(id, { raster: r.raster, transform: { ...l.transform, x: r.x, y: r.y, w: r.raster.width, h: r.raster.height, rotation: 0, flipX: false, flipY: false }, vector: { path: stored, fill: look.fill, stroke: look.stroke, origin: { x: r.x, y: r.y } }, shape: null });
    const e = this.pathStore.shapeEdit, now = p.layer(id);
    if (e && e.project === p && e.layerId === id && now) { e.layer = now; e.path = path; }
  }

  /** Brackets a pointer gesture on the selected path, so a gesture on a Shape Path is one undo step. */
  beginPathEdit(): void { PA.beginPathEdit(this.pathHost); }

  endPathEdit(): void { PA.endPathEdit(this.pathHost); }

  /** Layer > New Shape Layer from Path: the selected path filled with the foreground colour as a shape layer, whose
   *  outline stays editable. */
  newShapeFromPath(): void {
    const p = this.current, vp = this.workPath;
    if (!p || !vp || !pathBounds(vp)) { this.notice('Select or draw a path first.'); return; }
    // A path with a closed part is filled; one of open lines only is stroked, as wide as the brush.
    const path = structuredClone(vp), closed = path.subpaths.some((sp) => sp.closed && sp.anchors.length > 2);
    const look: ShapeStyle = closed ? { fill: { ...this.fg }, stroke: null } : { fill: null, stroke: { color: { ...this.fg }, width: Math.min(200, Math.max(1, Math.round(this.brush.diameter))) } };
    const r = this.renderShape(path, look);
    if (!r) return;
    let n = 1;
    while (p.doc.layers.some((l) => l.name === `Shape ${n}`)) n++;
    this.insertRasterLayer(r.raster, `Shape ${n}`, r.x, r.y, { vector: { path, fill: look.fill, stroke: look.stroke, origin: { x: r.x, y: r.y } } }, 'New Shape Layer');
  }

  /** Layer > Type > Create Work Path (DEV_PLAN 32.7 part b): the active type layer's outlines, traced from its rendered
   *  pixels (not read from the font), become the Work Path. Paths sit outside undo, so this is not a history step. Placement
   *  uses the layer's x, y and size only; rotation is ignored. */
  typeToWorkPath(): boolean { return TX.typeToWorkPath(this.textHost); }

  /** Layer > Type > Convert to Shape: Create Work Path, then a shape layer in the text colour above the type layer, which
   *  is hidden. The shape and the hiding are one undo step. */
  typeToShape(): boolean { return TX.typeToShape(this.textHost); }

  /** File > Open SVG as Layers (DEV_PLAN 34.4): one shape layer per entry, in order, each outline still editable. insertRasterLayer
   *  records its own undo step, so each layer is one step. Returns the number of layers made. */
  addShapeLayers(shapes: Array<{ name: string; path: VectorPath; fill: RGB | null; stroke: ShapeStroke | null; opacity?: number }>, dropEmptyBase = false): number {
    // Rendered first, then inserted in one edit, so the whole SVG is one undo step.
    const made = shapes.flatMap((s) => { const look: ShapeStyle = { fill: s.fill, stroke: s.stroke }, r = this.renderShape(s.path, look); return r ? [{ s, look, r }] : []; });
    if (!made.length) return 0;
    this.edit('Open SVG as Layers', (p) => {
      // A new document's blank base layer (34.4f) is removed when asked: only a pixel layer with nothing painted.
      const painted = (d: Uint8ClampedArray): boolean => { for (let i = 3; i < d.length; i += 4) if (d[i]) return true; return false; };
      const blank = dropEmptyBase ? p.doc.layers.filter((l) => !l.isGroup && !l.vector && !l.text && !l.adjustment && !l.smart && (!l.raster || !painted(l.raster.read().data))) : [];
      for (const { s, look, r } of made) {
        const base = newLayer(s.name, p.doc, { raster: r.raster, parentId: this.parentForNew(p), opacity: s.opacity ?? 1 });
        this.insertAboveActive(p, { ...base, transform: { ...docTransform(r.raster.width, r.raster.height), x: r.x, y: r.y }, vector: { path: s.path, fill: look.fill, stroke: look.stroke, origin: { x: r.x, y: r.y } } });
      }
      if (blank.length) { const gone = new Set(blank.map((l) => l.id)); p.setLayers(p.doc.layers.filter((l) => !gone.has(l.id))); }
    });
    return made.length;
  }

  /** The Markup tool's choice (1.60.3, the register's L2, DEV_PLAN 23.13): what a drag makes, its colour and width. */
  markupKind: MarkupKind = 'arrow';
  markupColor: RGB = { r: 230, g: 40, b: 40 };
  markupWidth = 6;

  /** A mark from a drag `a` to `b` (Markup), its own vector layer and one step: an arrow in the markup colour; a callout
   *  (a white box outlined in it, its tail at `a`); a highlight (yellow, Multiply at 60%); a redaction box (black,
   *  named Redaction N, which Apply Redactions burns in). */
  addMarkup(a: Pt, b: Pt): boolean {
    const p = this.current;
    if (!p || Math.hypot(b.x - a.x, b.y - a.y) < 4) return false;
    const k = this.markupKind, w = this.markupWidth, c = this.markupColor;
    const path = markupPath(k, a, b, w);
    const look: ShapeStyle = k === 'arrow' ? { fill: { ...c }, stroke: null }
      : k === 'callout' ? { fill: { r: 255, g: 255, b: 255 }, stroke: { color: { ...c }, width: Math.max(1, Math.round(w / 2)) } }
        : k === 'highlight' ? { fill: { r: 255, g: 226, b: 0 }, stroke: null } : { fill: { r: 0, g: 0, b: 0 }, stroke: null };
    const r = this.renderShape(path, look);
    if (!r) return false;
    const base = k === 'redact' ? 'Redaction' : k === 'callout' ? 'Callout' : k === 'highlight' ? 'Highlight' : 'Arrow';
    let n = 1;
    while (p.doc.layers.some((l) => l.name === `${base} ${n}`)) n++;
    this.insertRasterLayer(r.raster, `${base} ${n}`, r.x, r.y, { vector: { path, fill: look.fill, stroke: look.stroke, origin: { x: r.x, y: r.y } }, ...(k === 'highlight' ? { blend: 'multiply' as BlendMode, opacity: 0.6 } : {}) }, `Markup ${base}`);
    return true;
  }

  /** Layer > Apply Redactions (1.60.3): every Redaction box burned into the pixels of every layer beneath it, so what
   *  it hides is gone from layered files too (a box alone only covers it). Text, shape and smart object layers under a
   *  box become pixels (their originals would keep the text); the boxes themselves stay as black pixel layers named
   *  Redacted N. One step. A rotated or scaled layer under a box is named and refused, to be rasterized first. */
  applyRedactions(): number {
    const p = this.current;
    if (!p) return 0;
    const boxes = p.doc.layers.filter((l) => l.vector && /^Redaction \d+$/.test(l.name));
    if (!boxes.length) { this.notice('No redaction boxes: draw them with the Markup tool set to Redact.'); return 0; }
    const ids = new Set(boxes.map((l) => l.id)), rects = boxes.map((l) => ({ x: l.transform.x, y: l.transform.y, w: l.transform.w, h: l.transform.h }));
    const under = (l: Layer): boolean => !ids.has(l.id) && !!l.raster && rects.some((r) => r.x < l.transform.x + l.transform.w && r.x + r.w > l.transform.x && r.y < l.transform.y + l.transform.h && r.y + r.h > l.transform.y);
    const skewed = p.doc.layers.filter((l) => under(l) && (l.transform.rotation || l.transform.flipX || l.transform.flipY || Math.abs(l.transform.w - (l.raster?.width ?? 0)) > 0.5 || Math.abs(l.transform.h - (l.raster?.height ?? 0)) > 0.5));
    if (skewed.length) { this.notice(`Rasterize ${skewed.map((l) => l.name).join(', ')} first (rotated or scaled beneath a redaction), then apply again.`, 'error'); return 0; }
    let burned = 0;
    this.edit('Apply Redactions', (q) => {
      for (const l of q.doc.layers) {
        if (!under(l) || !l.raster) continue;
        const copy = Raster.from(l.raster.canvas as CanvasImageSource, l.raster.width, l.raster.height);   // a new raster: undo keeps the old
        copy.ctx.fillStyle = '#000';
        for (const r of rects) copy.ctx.fillRect(r.x - l.transform.x, r.y - l.transform.y, r.w, r.h);
        copy.touch();
        q.updateLayer(l.id, { raster: copy, text: null, vector: null, shape: null, smart: null, fillContent: null });
        burned += 1;
      }
      boxes.forEach((bx, i) => q.updateLayer(bx.id, { vector: null, name: `Redacted ${i + 1}` }));
      return true;
    });
    return burned;
  }

  /** The Shape tool's polygon, star, line, arrow and heart: a new vector layer filled in the foreground colour. A box
   *  (`a` and `b` as corners) fits polygons, stars and hearts; lines and arrows run from `a` to `b`. */
  createPathShape(a: Pt, b: Pt): void {
    const p = this.current, st = this.shapeSettings, kind = st.kind;
    if (!p || kind === 'rectangle' || kind === 'ellipse') return;
    const line = kind === 'line' || kind === 'arrow';
    if (line ? Math.hypot(b.x - a.x, b.y - a.y) < 2 : Math.abs(b.x - a.x) < 2 || Math.abs(b.y - a.y) < 2) return;
    const path = line ? linePath(kind, a, b, st) : boxedShapePath(kind, { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }, st);
    const look: ShapeStyle = { fill: { ...this.fg }, stroke: null }, r = this.renderShape(path, look);
    if (!r) return;
    const name = kind === 'custom' ? allCustomShapes().find((s) => s.id === st.custom)?.label ?? 'Custom Shape' : { polygon: 'Polygon', star: 'Star', line: 'Line', arrow: 'Arrow', heart: 'Heart', triangle: 'Triangle' }[kind];
    let n = 1;
    while (p.doc.layers.some((l) => l.name === `${name} ${n}`)) n++;
    this.insertRasterLayer(r.raster, `${name} ${n}`, r.x, r.y, { vector: { path, fill: look.fill, stroke: null, origin: { x: r.x, y: r.y } } }, `New ${name}`);
  }

  /** A vector shape layer from a path, with its fill and stroke (drawShape's; createPathShape always had no stroke). */
  private createVectorShape(path: VectorPath, look: ShapeStyle, name: string): void {
    const p = this.current;
    if (!p) return;
    const r = this.renderShape(path, look);
    if (!r) return;
    const st = this.shapeSettings, label = st.kind === 'custom' ? allCustomShapes().find((c) => c.id === st.custom)?.label ?? name : name;
    let n = 1;
    while (p.doc.layers.some((l) => l.name === `${label} ${n}`)) n++;
    this.insertRasterLayer(r.raster, `${label} ${n}`, r.x, r.y, { vector: { path, fill: look.fill, stroke: look.stroke, origin: { x: r.x, y: r.y } } }, `New ${label}`);
  }

  /** Layer > Shape Color from Foreground: the active shape layer refilled in the foreground colour. */
  recolorShape(): void {
    const l = this.current?.activeLayer;
    if (!l?.vector) { this.notice('Select a shape layer first.'); return; }
    const v = l.vector, dx = l.transform.x - v.origin.x, dy = l.transform.y - v.origin.y;
    this.edit('Shape Color', (p) => this.reshape(p, l.id, shiftPath(v.path, dx, dy), { fill: { ...this.fg }, stroke: v.stroke ?? null }));
  }

  /** Layer > Shape Fill and Stroke: the active shape layer's fill and stroke, as one undo step. */
  setShapeStyle(style: ShapeStyle): void {
    const l = this.current?.activeLayer;
    if (!l?.vector) { this.notice('Select a shape layer first.'); return; }
    if (!style.fill && !style.stroke) { this.notice('A shape needs a fill, a stroke or both.'); return; }
    const v = l.vector, dx = l.transform.x - v.origin.x, dy = l.transform.y - v.origin.y;
    this.edit('Shape Style', (p) => this.reshape(p, l.id, shiftPath(v.path, dx, dy), structuredClone(style)));
  }

  /** The look copied by Layer > Copy Shape Fill and Stroke, kept for Paste Shape Fill and Stroke. */
  shapeStyleClip: ShapeStyle | null = null;

  copyShapeStyle(): boolean {
    const v = this.current?.activeLayer?.vector;
    if (!v) { this.notice('Select a shape layer first.'); return false; }
    this.shapeStyleClip = structuredClone({ fill: v.fill, stroke: v.stroke ?? null });
    return true;
  }

  pasteShapeStyle(): boolean {
    const l = this.current?.activeLayer;
    if (!this.shapeStyleClip) { this.notice('Copy a shape fill and stroke first.'); return false; }
    if (!l?.vector) { this.notice('Select a shape layer first.'); return false; }
    this.setShapeStyle(structuredClone(this.shapeStyleClip));
    return true;
  }

  /** A shape layer's outline where its pixels are now: its path, drawn at `origin`, carried through the layer's placement
   *  (a move, scale, turn or flip). */
  private placedPath(l: Layer): VectorPath | null {
    const v = l.vector, r = l.raster;
    if (!v || !r) return null;
    const m = placement(l.transform, r.width, r.height);
    return mapPath(v.path, (q) => applyMat(m, q.x - v.origin.x, q.y - v.origin.y));
  }

  /** The plain outline of what `path` fills, its operations baked in: its coverage drawn at up to 4 times and traced. */
  private mergedOutline(path: VectorPath): VectorPath | null {
    const b = pathBounds(path);
    if (!b) return null;
    const k = Math.max(1, Math.min(4, Math.sqrt(16e6 / ((b.w + 4) * (b.h + 4))))), x0 = Math.floor(b.x) - 2, y0 = Math.floor(b.y) - 2;
    const w = Math.ceil((b.w + 6) * k), h = Math.ceil((b.h + 6) * k), s = createSurface(w, h), c = ctxOf(s);
    c.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
    c.fillStyle = '#ffffff';
    fillVector(c, path);
    const d = c.getImageData(0, 0, w, h).data, a = new Uint8Array(w * h);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
    const subpaths = this.tracedOutline(a, w, h, 0, 0);
    return subpaths.length ? mapPath({ subpaths }, (q) => ({ x: x0 + q.x / k, y: y0 + q.y / k })) : null;
  }

  /** Layer > Combine Shapes (1.65.4): with several shape layers selected, the front ones' outlines join
   *  the back one's, each taking `op` (Unite Shapes keeps their own), and the front layers go; with one, its outlines
   *  after the first take `op`. Merge Shape Components ('merge') unites them and bakes every operation into plain
   *  outlines. The back layer keeps its fill, stroke, mask and style. One step. */
  combineShapes(op: PathOp | 'merge'): void {
    const p = this.current;
    if (!p || this.stroke) return;
    const shapes = p.doc.layers.filter((l) => p.selectedIds.has(l.id) && !!l.vector && !!l.raster);
    if (!shapes.length) { this.notice('Select one or more shape layers first.'); return; }
    const paths = shapes.map((l) => this.placedPath(l) as VectorPath);
    let subpaths = paths[0].subpaths;
    if (shapes.length > 1) subpaths = [...subpaths, ...paths.slice(1).flatMap((vp) => (op === 'merge' || op === 'combine' ? vp.subpaths : vp.subpaths.map((sp) => ({ ...sp, op }))))];
    else if (op !== 'merge') {
      if (subpaths.length < 2) { this.notice('Combine Shapes needs two shapes: select two shape layers, or a shape with two outlines.'); return; }
      subpaths = subpaths.map((sp, i) => (i === 0 ? sp : op === 'combine' ? { closed: sp.closed, anchors: sp.anchors } : { ...sp, op }));
    }
    const path = op === 'merge' ? this.mergedOutline({ subpaths }) : { subpaths };
    if (!path) { this.notice('The shapes fill nothing to merge.'); return; }
    const back = shapes[0].id, gone = new Set(shapes.slice(1).map((l) => l.id));
    this.settle();
    this.edit(op === 'merge' ? 'Merge Shape Components' : 'Combine Shapes', (q) => {
      if (gone.size) q.setLayers(this.normalizeClips(q.doc.layers.filter((l) => !gone.has(l.id))));
      this.reshape(q, back, path);
      this.focus(q, back);
      return true;
    });
  }

  private pathsChanged(p: Project): void { PA.pathsChanged(this.pathHost, p); }

  /** The current document's paths, the Work Path among them, and which one is selected. Paths live with the document
   *  and save with the project, outside undo. */
  get paths(): PathSet { return PA.pathsOfCurrent(this.pathHost); }

  /** The selected path, which the Pen, Direct Selection and the path commands work on; null when none is selected. */
  get workPath(): VectorPath | null { return PA.workPath(this.pathHost); }

  /** Sets the selected path's points. With none selected, a new Work Path takes them, replacing the old one; a Work
   *  Path left with no points goes away, while a named path stays, empty. */
  setWorkPath(vp: VectorPath | null): void { PA.setWorkPath(this.pathHost, vp); }

  /** Selects a path by id, or none, so the next Pen drawing starts a new Work Path. */
  selectPath(id: ID | null): void { PA.selectPath(this.pathHost, id); }

  /** Paths > New Path: an empty named path, selected, for the Pen to draw into. */
  newPath(): void { PA.newPath(this.pathHost); }

  /** Renames a path; naming the Work Path saves it, so it stays when a new one is drawn. */
  renamePath(id: ID, name: string): void { PA.renamePath(this.pathHost, id, name); }
  setClippingPath(id: ID | null, flatness = 0): boolean { return PA.setClippingPath(this.pathHost, id, flatness); }

  /** Paths > Delete Path: removes the selected path, or the one given. */
  deletePath(id?: ID): void { PA.deletePath(this.pathHost, id); }

  /** Any open document's paths, as saving reads them. */
  pathsOf(p: Project): PathSet { return this.pathSet(p); }

  /** Replaces an open document's paths, as opening a project restores them. */
  setPathsOf(p: Project, set: PathSet): void { PA.setPathsOf(this.pathHost, p, set); }

  /** Select > Make Selection from Path: the path's inside, by the non-zero winding rule, becomes the selection. */
  pathToSelection(): void { PA.pathToSelection(this.pathHost); }

  /** Edit > Fill Path: the path's inside painted into the active layer in the foreground colour, within any selection. */
  fillPath(): void { PA.fillPath(this.pathHost); }

  /** Edit > Stroke Path: the path traced in the foreground colour as wide as the brush, within any selection. */
  strokePath(): void { PA.strokePath(this.pathHost); }

  /** Stroke Path with its dialog's settings: each subpath stroked with `tool` at its current
   *  settings, following the curves; Simulate Pressure runs the pressure from nothing at each end to full in the middle
   *  (thin, thick, thin), and when the brush's size does not follow pressure it does so for this stroke. One step. */
  strokePathWith(tool: StrokeTool, simulatePressure: boolean): void { PA.strokePathWith(this.pathHost, tool, simulatePressure); }

  private paintPath(name: string, paint: (c: Ctx2D, shape: Path2D, vp: VectorPath) => void, given?: VectorPath): void { PA.paintPath(this.pathHost, name, paint, given); }

  private styleClipboard: LayerEffects | null = null;

  get canPasteLayerStyle(): boolean { return !!this.styleClipboard; }

  /** Copy Layer Style: remembers the active layer's effects for Paste Layer Style. */
  copyLayerStyle(): void {
    const l = this.current?.activeLayer;
    if (!l || !effectsPresent(l.effects)) { this.notice('This layer has no layer style to copy.'); return; }
    this.styleClipboard = structuredClone(l.effects);
  }

  /** Layer Style > Hide All Effects and Show All Effects (1.65.2): every style in the document hidden or shown, one step. */
  get effectsShown(): boolean { return !!this.current?.doc.layers.some((l) => effectsActive(l.effects)); }
  setAllEffectsHidden(hidden: boolean): void {
    this.edit(hidden ? 'Hide All Effects' : 'Show All Effects', (p) => {
      const layers = p.doc.layers.map((l) => {
        const fx = l.effects;
        if (!effectsPresent(fx) || !!fx.hidden === hidden) return l;
        const next = { ...fx };
        if (hidden) next.hidden = true; else delete next.hidden;
        return { ...l, effects: next };
      });
      if (layers.every((l, i) => l === p.doc.layers[i])) return false;
      p.setLayers(layers);
      return true;
    });
  }

  /** Layer Style > Scale Effects (1.65.2): the selected layers' effect sizes, distances and scales times `k`, one step. */
  scaleEffects(k: number): void {
    if (!Number.isFinite(k) || k <= 0) return;
    this.edit('Scale Effects', (p) => {
      let changed = false;
      for (const id of p.selectedIds.size ? [...p.selectedIds] : p.activeId ? [p.activeId] : []) {
        const l = p.layer(id);
        if (!l || !effectsPresent(l.effects) || k === 1) continue;
        const next = effectsFromData(scaledEffects(l.effects, k));
        if (next) { p.updateLayer(id, { effects: next }); changed = true; }
      }
      return changed;
    });
  }

  /** Layer Style > Create Layers (1.65.2): the active layer's effects become layers of their own, the look kept; those
   *  kept to its pixels clip to it, the rest stand below or above it unclipped; its style is cleared. One step. */
  effectsToLayers(): boolean {
    const p = this.current, l = p?.activeLayer;
    if (!p || !l) return false;
    if (!effectsActive(l.effects)) { this.notice('This layer has no shown layer style to turn into layers.'); return false; }
    if (l.clipId) { this.notice('Create Layers works on a layer that is not clipped to another.'); return false; }
    const parts = this.work.effectLayers(l, p.doc);
    if (!parts.length) { this.notice('The layer style draws nothing to turn into layers.'); return false; }
    if (parts.some((q) => q.above && !q.kept) && p.doc.layers.some((x) => x.clipId === l.id)) { this.notice('This style draws outside the layer above it, which would split the layers clipped to it: unclip them first.'); return false; }
    return this.edit('Create Layers', (pp) => {
      const made = (q: (typeof parts)[number]): Layer => {
        const r = new Raster(q.s.width, q.s.height);
        r.ctx.drawImage(q.s as CanvasImageSource, 0, 0);
        r.touch();
        const blend = BLEND_MODES.find((m) => m.id === q.op)?.id ?? (q.op === 'lighter' ? 'linear-dodge' : 'normal');
        return newLayer(`${l.name}'s ${q.name}`, pp.doc, { raster: r, transform: { ...docTransform(r.width, r.height), x: q.x, y: q.y }, parentId: l.parentId, blend, opacity: clamp(q.alpha * (q.kept ? 1 : l.opacity), 0, 1), ...(q.kept ? { clipId: l.id } : {}) });
      };
      const below = parts.filter((q) => !q.above).map(made), above = parts.filter((q) => q.above).map(made), list = [...pp.doc.layers], at = list.findIndex((x) => x.id === l.id);
      list.splice(at + 1, 0, ...above);
      list.splice(at, 0, ...below);
      pp.setLayers(list.map((x) => (x.id === l.id ? { ...x, effects: null } : x)));
      return true;
    });
  }

  /** Paste Layer Style: gives every selected pixel layer the copied effects, as one undo step. */
  pasteLayerStyle(): void {
    const fx = this.styleClipboard;
    if (fx) this.restyle('Paste Layer Style', fx);
  }

  /** Clear Layer Style: removes the effects from every selected layer, as one undo step. */
  clearLayerStyle(): void { this.restyle('Clear Layer Style', null); }

  /** Applies `fx`, or no style, to the active or selected layers as one undo step, as Actions replay a Layer Style. */
  applyLayerStyle(fx: LayerEffects | null): boolean {
    const l = this.current?.activeLayer;
    if (!l || l.isGroup || l.adjustment) return false;
    this.restyle(fx ? 'Layer Style' : 'Clear Layer Style', fx ? structuredClone(fx) : null);
    return true;
  }

  private restyle(name: string, fx: LayerEffects | null): void {
    this.effectPreview = null;
    this.display.fastEffects = false;
    this.edit(name, (p) => {
      let changed = false;
      for (const id of p.selectedIds.size ? [...p.selectedIds] : p.activeId ? [p.activeId] : []) {
        const l = p.layer(id);
        if (!l || l.isGroup || l.adjustment || (!fx && !l.effects)) continue;
        p.updateLayer(id, { effects: fx ? structuredClone(fx) : null });
        changed = true;
      }
      return changed;
    });
  }

  /** Shows `effects` on layer `id` without recording anything, while the Layer Style dialog is open; null ends it. */
  previewLayerEffects(id: ID | null, effects: LayerEffects | null = null): void {
    const p = this.current;
    this.effectPreview = p && id ? { project: p, layerId: id, effects: effects ? structuredClone(effects) : null } : null;
    // The screen computes a previewed style's effects at reduced resolution on large layers; exports never do.
    this.display.fastEffects = !!this.effectPreview;
    this.emit('render', null);
  }

  private overrides(p: Project): Map<ID, LayerOverride> | undefined {
    const m = new Map<ID, LayerOverride>();
    // The video timeline (1.59.3, DEV_PLAN 25.2): the canvas shows the playhead's frame, each layer hidden outside its
    // clip and placed, faded and styled as its keyframes say there; the layers themselves keep their own values.
    const vt = this.timelines.get(p)?.video;
    if (vt) {
      const state = stateAt(p.doc, vt, vt.current);
      for (const l of p.doc.layers) {
        const s = state[l.id];
        if (!s) continue;
        const o: LayerOverride = {};
        if (!s.visible && l.visible) o.hidden = true;
        if (s.x !== l.transform.x || s.y !== l.transform.y) o.transform = { ...l.transform, x: s.x, y: s.y };
        if (s.opacity !== l.opacity) o.opacity = s.opacity;
        if (s.fx !== undefined && s.fx !== (l.effects ?? null)) o.effects = s.fx;   // a style set aside, or a colour fade (1.60.1)
        if (Object.keys(o).length) m.set(l.id, o);
      }
    }
    const st = this.stroke;
    if (st && st.project === p) m.set(st.layerId, { ...(m.get(st.layerId) ?? {}), ...(st.target !== 'pixels' ? { maskSource: st.s.working } : st.s.windowed ? { patch: { surface: st.s.working, x: st.s.ox, y: st.s.oy } } : { source: st.s.working }) });   // a windowed stroke as a patch (1.60.6)
    const te = this.transformEdit;
    if (te && te.project === p) {
      // A keyed layer's draft shown where its keys place it (1.59.9), so the drag follows the layer as seen.
      const keyed = (id: ID, t: Transform): Transform => { const o = this.keyedOffset(p, id); return o.dx || o.dy ? { ...t, x: t.x + o.dx, y: t.y + o.dy } : t; };
      if (te.group) for (const [id, orig] of te.group.originals) m.set(id, { ...(m.get(id) ?? {}), transform: keyed(id, following(orig, te.group.box, te.draft)) });
      else m.set(te.layerId, { ...(m.get(te.layerId) ?? {}), ...(te.mask ? { maskPlacement: te.draft } : { transform: keyed(te.layerId, te.draft) }) });
    }
    const de = this.distortEdit;
    if (de && de.project === p) for (const [id, v] of de.previews) {
      if (!v.pixels) continue;
      const o: LayerOverride = { source: v.pixels.raster.canvas, transform: v.pixels.t };
      if (v.mask?.warped) o.maskSource = v.mask.warped.raster.canvas;
      if (v.mask?.placement) o.maskPlacement = v.mask.placement;
      m.set(id, { ...(m.get(id) ?? {}), ...o });
    }
    const pv = this.preview;
    const mw = this.meshWarpEdit;
    if (mw && mw.project === p && mw.preview) m.set(mw.layerId, { ...(m.get(mw.layerId) ?? {}), source: mw.preview.raster.canvas, transform: mw.preview.t });
    const pw = this.puppetEdit;
    if (pw && pw.project === p && pw.preview) m.set(pw.layerId, { ...(m.get(pw.layerId) ?? {}), source: pw.preview.raster.canvas, transform: pw.preview.t });
    const px = this.perspectiveEdit;
    if (px && px.project === p && px.preview) m.set(px.layerId, { ...(m.get(px.layerId) ?? {}), source: px.preview.raster.canvas, transform: px.preview.t });
    if (pv && pv.project === p) m.set(pv.layerId, { ...(m.get(pv.layerId) ?? {}), ...(pv.target === 'pixels' ? { source: pv.surface } : { maskSource: pv.surface }), ...(pv.transform ? { transform: pv.transform } : {}) });
    const gr = this.gradient;
    if (gr && gr.project === p) m.set(gr.layerId, { ...(m.get(gr.layerId) ?? {}), ...(gr.target === 'pixels' ? { source: gr.surface } : { maskSource: gr.surface }) });
    const ws = this.warpState;
    if (ws && ws.project === p) m.set(ws.layerId, { ...(m.get(ws.layerId) ?? {}), source: ws.surface, transform: docTransform(p.doc.width, p.doc.height) });
    const tx = this.textEditing;
    if (tx && tx.project === p) m.set(tx.layerId, { ...(m.get(tx.layerId) ?? {}), hidden: true });
    const ep = this.effectPreview;
    if (ep && ep.project === p) m.set(ep.layerId, { ...(m.get(ep.layerId) ?? {}), effects: ep.effects });
    const bp = this.blendPreview;
    if (bp && bp.project === p) for (const id of p.selectedIds) { const l = p.layer(id); if (l && !l.artboard) m.set(id, { ...(m.get(id) ?? {}), blend: bp.mode }); }
    const fp = this.fillPreview;
    if (fp && fp.project === p) m.set(fp.layerId, { ...(m.get(fp.layerId) ?? {}), source: fp.source });
    const rp = this.relightPreview;
    if (rp && rp.project === p) m.set(rp.layerId, { ...(m.get(rp.layerId) ?? {}), source: rp.source, transform: docTransform(p.doc.width, p.doc.height) });
    const fl = this.floating;
    if (fl && fl.project === p) m.set(fl.layerId, { ...(m.get(fl.layerId) ?? {}), source: fl.preview });
    const fs = this.floatSel;
    if (fs && fs.project === p && !fs.outline) m.set(fs.sourceId, { ...(m.get(fs.sourceId) ?? {}), source: fs.hole });
    if (this.channelView !== null && (p.doc.mode === 'cmyk' || p.doc.mode === 'lab')) { for (const l of p.doc.layers) if (l.channels && !m.get(l.id)?.source) m.set(l.id, { ...(m.get(l.id) ?? {}), source: this.channelGrey(l.channels, this.channelView).canvas }); }
    else if (!this.stroke && this.composesFloats(p)) {
      const composed = this.composedRendition(p);
      if (composed) { const first = p.doc.layers.find((l) => l.raster && !l.isGroup); for (const l of p.doc.layers) m.set(l.id, l === first ? { ...(m.get(l.id) ?? {}), source: composed.canvas, transform: docTransform(p.doc.width, p.doc.height), opacity: 1, blend: 'normal' } : { ...(m.get(l.id) ?? {}), hidden: true }); }
    }
    return m.size ? m : undefined;
  }

  /** A CMYK document with adjustment layers shown as its composed ink (1.54.4): Levels and Curves act per ink in
   *  composeChannels, and the display follows that rather than the per-layer renditions. */
  private composedCache: { doc: Doc; r: Raster | null } | null = null;
  private composedRendition(p: Project): Raster | null {
    if (this.composedCache && this.composedCache.doc === p.doc) return this.composedCache.r;
    let r: Raster | null = null;
    if (p.doc.mode === 'lab') {
      const c = composeFloat(p.doc, 3, false);
      if (!('error' in c)) { r = new Raster(c.width, c.height); const img = r.ctx.createImageData(c.width, c.height); renderLab(c.data, img.data); r.ctx.putImageData(img, 0, 0); r.touch(); }
    } else if (p.doc.depth === 32) {
      const c = composeFloat(p.doc, 3, false, null, true);
      if (!('error' in c)) r = rasterFromDeep({ mode: 'rgb', n: 3, width: c.width, height: c.height, data: c.data }, true);
    } else {
      const ink = composeChannels(p.doc, p.cmykTables);
      r = 'error' in ink || !p.cmykLut ? null : rasterFromChannels({ mode: 'cmyk', n: 4, width: ink.width, height: ink.height, data: ink.data }, p.cmykLut);
    }
    this.composedCache = { doc: p.doc, r };
    return r;
  }

  /** Whether the canvas and exports show the composed floats rather than the layers' renditions (1.54.4, Lab 1.56.6):
   *  a CMYK or Lab document with a visible adjustment layer or a blend mode other than Normal. */
  private composesFloats(p: Project): boolean {
    if (p.doc.depth === 32) return p.doc.layers.some((l) => l.visible && (!!l.adjustment || (!!l.blend && l.blend !== 'normal') || effectsActive(l.effects) || !!l.mask || !!l.clipId));
    return ((p.doc.mode === 'cmyk' && !!p.cmykLut) || p.doc.mode === 'lab') && p.doc.layers.some((l) => l.visible && (l.adjustment || (l.blend && l.blend !== 'normal') || effectsActive(l.effects)));
  }

  /** The Channels panel's single-ink view (1.54.3): one ink of a CMYK layer as grey (paper white, full ink black),
   *  drawn in place of its rendition; the view only, never the pixels. */
  channelView: 0 | 1 | 2 | 3 | null = null;
  private readonly channelGreys = new WeakMap<ChannelPixels, { k: number; r: Raster }>();
  setChannelView(k: 0 | 1 | 2 | 3 | null): void { if (this.channelView === k) return; this.channelView = k; this.emit('render', null); }
  private channelGrey(ch: ChannelPixels, k: number): Raster {
    const hit = this.channelGreys.get(ch);
    if (hit && hit.k === k) return hit.r;
    const r = new Raster(ch.width, ch.height), img = r.ctx.createImageData(ch.width, ch.height), S = ch.n + 1, d = img.data;
    const lab = ch.mode === 'lab';   // 1.57.9: a Lab channel shows its own value; an ink, paper minus ink
    for (let i = 0, o = 0; i < ch.data.length; i += S, o += 4) { const x = Math.min(1, Math.max(0, ch.data[i + k])), v = Math.round((lab ? x : 1 - x) * 255); d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = Math.round(Math.min(1, Math.max(0, ch.data[i + ch.n])) * 255); }
    r.ctx.putImageData(img, 0, 0); r.touch();
    this.channelGreys.set(ch, { k, r });
    return r;
  }

  private get structHost(): LS.StructHost {
    return {
      current: this.current,
      projects: this.projects,
      busy: !!this.stroke,
      settle: () => this.settle(),
      emit: (what) => this.emit(what, null),
      edit: (label, fn) => this.edit(label, fn),
      focus: (p, id) => this.focus(p, id),
      notice: (m) => this.notice(m),
      room: (bytes, what) => this.room(bytes, what),
      switchTo: (key) => this.switchTo(key),
      clipCoverage: (doc, baseId) => this.work.clipCoverageOf(doc, baseId),
      renderOnly: (doc, target, view, only) => this.work.render({ doc, target, view, only, quality: 'high', ignoreFolderMasks: true }),
      deleteMask: () => this.deleteMask(false),
    };
  }

  private get maskHost(): LM.MaskHost {
    return {
      current: this.current,
      edit: (label, fn) => this.edit(label, fn),
      focus: (p, id) => this.focus(p, id),
      notice: (m) => this.notice(m),
      applySelection: (sel, mode, label) => this.applySelection(sel, mode, label),
    };
  }

  selectLayer(id: ID, how: 'replace' | 'toggle' | 'range' = 'replace'): void { LS.selectLayer(this.structHost, id, how); }

  /** Select > All Layers (Alt+Ctrl+A), or with `all` false Deselect Layers; not history steps. */
  selectAllLayers(all = true): void {
    const p = this.current;
    if (!p || this.stroke || (all ? !p.doc.layers.length : !p.activeId && !p.selectedIds.size)) return;
    this.settle();
    const order = hierarchy(p.doc, true).map((e) => e.layer.id);
    p.activeId = all ? (p.activeId && p.layer(p.activeId) ? p.activeId : order[0]) : null;
    p.selectedIds = new Set(all ? order : []);
    p.maskTarget = false;
    this.emit('active', null);
    this.emit('options', null);
    this.emit('overlay', null);
  }

  setMaskTarget(on: boolean): void {
    const p = this.current;
    if (!p) return;
    const v = on && !!p.activeLayer?.mask;
    if (p.maskTarget === v) return;
    p.maskTarget = v;
    this.emit('active', null);
  }

  /** Opens or closes a folder; `deep` (Alt-click on its triangle) does the same to every folder inside it. */
  toggleCollapsed(id: ID, deep = false): void {
    const p = this.current;
    if (!p) return;
    const open = p.collapsed.has(id);
    const ids = deep ? [id, ...descendantIds(p.doc.layers, id).filter((x) => p.layer(x)?.isGroup)] : [id];
    for (const x of ids) { if (open) p.collapsed.delete(x); else p.collapsed.add(x); }
    this.emit('doc', null);
  }

  /** The Move tool's marquee: the visible layers with a pixel inside the document rectangle `r` become the selection
   *  (`add` keeps the current one), the top one active. Not a history step. */
  selectLayersInRect(r: Rect, add = false): number {
    const p = this.current;
    if (!p || this.stroke) return 0;
    this.settle();
    const hits: Layer[] = [];
    for (const e of hierarchy(p.doc, true)) {
      const l = e.layer, ras = l.raster;
      if (l.isGroup || !ras || !l.visible || !e.visible) continue;
      const box = intersectRect(r, transformBounds(l.transform));
      if (!box) continue;
      const inv = invert(placement(l.transform, ras.width, ras.height));
      const xs: number[] = [], ys: number[] = [];
      for (const [cx, cy] of [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h]]) { const q = applyMat(inv, cx, cy); xs.push(q.x); ys.push(q.y); }
      const x0 = Math.max(0, Math.floor(Math.min(...xs))), y0 = Math.max(0, Math.floor(Math.min(...ys)));
      const x1 = Math.min(ras.width, Math.ceil(Math.max(...xs))), y1 = Math.min(ras.height, Math.ceil(Math.max(...ys)));
      if (x1 <= x0 || y1 <= y0) continue;
      const d = ras.read(x0, y0, x1 - x0, y1 - y0).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 8) { hits.push(l); break; }
    }
    const ids = hits.map((l) => l.id);
    if (!ids.length && !add) return 0;
    p.selectedIds = new Set(add ? [...p.selectedIds, ...ids] : ids);
    if (ids.length) p.activeId = ids[0];
    p.maskTarget = false;
    this.emit('active', null);
    this.emit('options', null);
    this.emit('overlay', null);
    return ids.length;
  }

  private selectedRoots(p: Project): ID[] { return LS.selectedRoots(p); }

  private normalizeClips(layers: Layer[]): Layer[] { return LS.normalizeClips(layers); }

  private cloneLayer(l: Layer, patch: Partial<Layer> = {}): Layer { return LS.cloneLayer(l, patch); }

  /** Layer > New > Layer; the New Layer dialog passes its name, blending mode, opacity and whether to clip the new layer
   *  to the one below (Use Previous Layer to Create Clipping Mask). One step either way. */
  /** Memory (1.60.2, DEV_PLAN 26.1, the register's M5): the bytes formvis may hold in pixels, set from this computer's
   *  memory by the engine (0 while unknown: no limit), so an operation that would not fit is refused with a message
   *  rather than the browser's page being killed (measured: a 150 MP document's second layer and stroke at 3.45 GB). */
  memoryBudget = 0;

  /** The pixels held for every open document: its layers and masks (each raster once), one document-size copy for
   *  the display, and what its undo history keeps beyond them. */
  memoryUse(): number {
    let n = 0;
    for (const p of this.projects) {
      const seen = new Set<string>();
      // Each raster once, the document's display once, the History panel's snapshots (each a copy of every pixel), and
      // what the undo history keeps beyond the layers. (1.60.5: the large canvases made as a document opens, watched,
      // were its layer and its opening snapshot; 1.60.4 had read the snapshot as a second copy of each layer.)
      for (const l of p.doc.layers) for (const r of [l.raster, l.mask?.raster]) if (r && !seen.has(r.id)) { seen.add(r.id); n += r.width * r.height * 4; }
      // A tiled layer counts the tiles it holds, and its document no full-size display copy: the CPU display draws only
      // the view (1.62.3; at 600 MP that copy would be 2.4 GB never made).
      const tiled = p.doc.layers.some((l) => l.tiled);
      for (const l of p.doc.layers) if (l.tiled && !seen.has(l.tiled.id)) { seen.add(l.tiled.id); n += l.tiled.bytes; }
      for (const s of this.historySnapshots.get(p) ?? []) n += this.docBytes(s.state.doc);
      n += (tiled ? 0 : p.doc.width * p.doc.height * 4) + p.history.retained(p.snapshot());
    }
    return n + spareBytes() + (this.stroke?.s.bytes ?? 0);   // the strokes' spare surfaces (1.60.5), and one in progress (1.60.6)
  }

  /** Room for `what`, needing `extra` bytes more: true when it fits the budget, else false with a message. */
  room(extra: number, what: string): boolean {
    if (!this.memoryBudget || extra <= 0) return true;
    const use = this.memoryUse();
    if (use + extra <= this.memoryBudget) return true;
    const mb = (b: number): string => `${Math.round(b / 1048576).toLocaleString()} MB`;
    this.notice(`${what} needs about ${mb(extra)} more, and formvis is holding ${mb(use)} of the ${mb(this.memoryBudget)} this computer allows it. Merge or delete layers, close a document, or work on a smaller copy.`);
    return false;
  }

  /** A full layer's bytes in the current document (what a new layer, a stroke's working copy or a filter's buffer takes). */
  layerBytes(): number {
    const p = this.current, r = p?.activeLayer?.raster;
    if (p?.activeLayer?.tiled) return 0;   // declined by paintable, with the true reason, not a memory figure (1.62.3)
    return r ? r.width * r.height * 4 : p ? p.doc.width * p.doc.height * 4 : 0;
  }

  addLayer(opts: { name?: string; blend?: BlendMode; opacity?: number; clip?: boolean } = {}): void { LS.addLayer(this.structHost, opts); }

  /** Layer > New > Group; the New Group dialog passes a name. One step. */
  addFolder(name?: string): void { LS.addFolder(this.structHost, name); }

  /** The bottom layer when it is the document's Background: named so, as a new document and Flatten Image make it. */
  backgroundLayer(): Layer | null {
    const l = this.current?.doc.layers.find((x) => !x.parentId) ?? null;
    return l && !l.isGroup && l.name === 'Background' ? l : null;
  }

  /** Layer > New > Layer from Background: renamed (Layer 0 unless given), mode and opacity set, locks cleared. One step. */
  layerFromBackground(opts: { name?: string; blend?: BlendMode; opacity?: number } = {}): void {
    const id = this.backgroundLayer()?.id;
    if (!id) return;
    this.edit('Layer from Background', (p) => {
      p.updateLayer(id, { name: opts.name?.trim().slice(0, 200) || 'Layer 0', locks: undefined, ...(opts.blend ? { blend: opts.blend } : {}), ...(opts.opacity !== undefined ? { opacity: clamp(opts.opacity, 0, 1) } : {}) });
      this.focus(p, id);
    });
  }

  /** Layer > New > Background from Layer (1.87.3, CLOSE_GAPS P06): the active pixel layer, as it shows, over the
   *  background colour at the canvas size, at the bottom of the stack named Background, in place of the layer. One step;
   *  refused while a Background exists. */
  backgroundFromLayer(): boolean {
    const p = this.current, l = p?.activeLayer;
    if (!p || !l || l.isGroup || l.adjustment) { this.notice('Select a pixel layer first.'); return false; }
    if (this.backgroundLayer()) { this.notice('The document already has a Background.'); return false; }
    const r = new Raster(p.doc.width, p.doc.height), c = this.bgc;
    r.ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
    r.ctx.fillRect(0, 0, p.doc.width, p.doc.height);
    if (l.raster) r.ctx.drawImage(this.renderLayerAlone(l.id) as CanvasImageSource, 0, 0);
    r.touch();
    const id = l.id;
    this.edit('Background from Layer', (q) => {
      const layer = newLayer('Background', q.doc, { raster: r });
      q.setLayers([{ ...layer, id }, ...q.doc.layers.filter((x) => x.id !== id)]);
      this.focus(q, id);
    });
    return true;
  }

  /** The document's artboards, top to bottom as the Layers panel lists them. */
  artboards(p: Project | null = this.current): Layer[] { return AB.artboards(this.artboardHost, p); }

  /** Where the next artboard goes: over the whole canvas when there is none yet; otherwise the last one's size, 100 px
   *  to the right of the rightmost; `size` given, that size there instead. */
  nextArtboardRect(size?: { w: number; h: number }): Rect | null { return AB.nextArtboardRect(this.artboardHost, size); }

  /** The first free name of the form Artboard N. */
  nextArtboardName(): string { return AB.nextArtboardName(this.artboardHost); }

  /** Layer > New > Artboard: at `nextArtboardRect` unless `rect` is given, the canvas widened to hold it,
   *  named `name` or Artboard N. White by default. One step. */
  newArtboard(rect: { x: number; y: number; w: number; h: number } | null = null, background: RGB | null = { r: 255, g: 255, b: 255 }, name?: string): ID | null { return AB.newArtboard(this.artboardHost, rect, background, name); }

  /** Layer > New > Artboard from Layers: the selected top-level layers moved into a new artboard fitted to their
   *  visible pixels, transparent behind them. One step. */
  artboardFromLayers(): ID | null { return AB.artboardFromLayers(this.artboardHost); }

  /** The document bounds of the visible pixels of layer `id` and of the layers inside it; null when they have none. */
  contentBounds(id: ID, p: Project | null = this.current): Rect | null { return AB.contentBounds(this.artboardHost, id, p); }

  /** Layer > New > Artboard from Group (1.65.4): a folder outside any other made an artboard over its contents (or
   *  the canvas when it holds no pixels), `w` by `h` when given, renamed when `name` is given; transparent behind, as
   *  Artboard from Layers makes them. One step. */
  artboardFromGroup(id: ID, opts: { name?: string; w?: number; h?: number } = {}): boolean { return AB.artboardFromGroup(this.artboardHost, id, opts); }

  /** Layer > New > Frame from Layers (1.65.4): each selected pixel layer put in a new rectangular frame fitted to its
   *  visible pixels, where it lies, as the Frame tool makes them. One step. */
  frameFromLayers(): void { AB.frameFromLayers(this.artboardHost); }

  /** Artboard Options: its rectangle and background, checked, as one step. */
  setArtboard(id: ID, patch: Partial<Artboard>): boolean { return AB.setArtboard(this.artboardHost, id, patch); }

  /** The Artboard tool (36.27): artboard `id` set to `rect`, its contents left where they are, the canvas widened to
   *  hold it as a new artboard does. One step. */
  resizeArtboard(id: ID, rect: Rect): boolean { return AB.resizeArtboard(this.artboardHost, id, rect); }

  /** The Artboard tool: artboard `id` moved by (dx, dy) with everything in it (boxes, mask placements, vector masks),
   *  the canvas widened to hold it. One step. */
  moveArtboard(id: ID, dx: number, dy: number): boolean { return AB.moveArtboard(this.artboardHost, id, dx, dy); }

  /** Layer > Duplicate Layer; the dialog passes a name, used when one layer or folder is duplicated. One step. */
  duplicateLayers(name?: string): void { LS.duplicateLayers(this.structHost, name); }

  /** The layers that stay but are clipped to a layer that is being deleted. Deleting their base asks whether to bake
   *  their masked look into their pixels or to drop the links; `deleteLayers(true)` bakes. */
  liveMaskDependents(): ID[] { return LS.liveMaskDependents(this.structHost); }

  deleteLayers(bake = false): void { LS.deleteLayers(this.structHost, bake); }

  /** Layer > Delete > Hidden Layers, with what hidden folders hold. One step. */
  deleteHiddenLayers(): void {
    this.edit('Delete Hidden Layers', (p) => {
      const doomed = new Set<ID>();
      for (const l of p.doc.layers) if (!l.visible) { doomed.add(l.id); for (const d of descendantIds(p.doc.layers, l.id)) doomed.add(d); }
      if (!doomed.size) return false;
      if (doomed.size === p.doc.layers.length) { this.notice('Every layer is hidden, and a document keeps at least one: nothing was deleted.'); return false; }
      p.setLayers(this.normalizeClips(p.doc.layers.filter((l) => !doomed.has(l.id)).map((l) => (l.clipId && doomed.has(l.clipId) ? { ...l, clipId: null } : l))));
      if (p.activeId && !doomed.has(p.activeId)) p.selectedIds = new Set([...p.selectedIds].filter((id) => !doomed.has(id)));
      else this.focus(p, hierarchy(p.doc, true)[0]?.layer.id ?? null);
    });
  }

  /** File > Scripts > Delete All Empty Layers (30.1): pixel layers with nothing visible in them and groups left empty,
   *  deleted; the Background and adjustment, fill, type, shape and smart object layers stay. One step; returns how many
   *  layers and groups went. */
  deleteEmptyLayers(): number {
    let count = 0;
    this.edit('Delete All Empty Layers', (p) => {
      const found = FS.emptyLayerIds(p.doc, this.backgroundLayer()?.id ?? null);
      if (!found.ids.size) { this.notice('There are no empty layers to delete.'); return false; }
      if (found.ids.size >= p.doc.layers.length) { this.notice('Every layer is empty, and a document keeps at least one: nothing was deleted.'); return false; }
      const doomed = found.ids;
      p.setLayers(this.normalizeClips(p.doc.layers.filter((l) => !doomed.has(l.id)).map((l) => (l.clipId && doomed.has(l.clipId) ? { ...l, clipId: null } : l))));
      if (p.activeId && !doomed.has(p.activeId)) p.selectedIds = new Set([...p.selectedIds].filter((id) => !doomed.has(id)));
      else this.focus(p, hierarchy(p.doc, true)[0]?.layer.id ?? null);
      count = doomed.size;
      this.notice(`Deleted ${found.layers} empty layer${found.layers === 1 ? '' : 's'} and ${found.groups} empty group${found.groups === 1 ? '' : 's'}.`);
    });
    return count;
  }

  /** File > Scripts > Flatten All Layer Effects (30.1): every layer style drawn into its layer's pixels, as Rasterize >
   *  Layer Style does; a type, shape or fill layer that carries one is rasterized. One step; returns the layers baked. */
  flattenAllEffects(): number {
    let count = 0;
    this.edit('Flatten All Layer Effects', (p) => {
      const { patches, rasterized } = FS.bakeEffects(p.doc, this.work);
      if (!patches.size) { this.notice('No layer has a shown layer style to flatten.'); return false; }
      for (const [id, patch] of patches) p.updateLayer(id, patch);
      count = patches.size;
      this.notice(`Flattened the layer styles of ${count} layer${count === 1 ? '' : 's'}${rasterized ? `, rasterizing ${rasterized} type, shape or fill layer${rasterized === 1 ? '' : 's'}` : ''}.`);
    });
    return count;
  }

  /** File > Scripts > Flatten All Masks (30.1): every layer mask and vector mask multiplied into its layer's pixels and
   *  removed; a type, shape or fill layer that carries one is rasterized. One step; returns the masks applied. */
  flattenAllMasks(): number {
    let count = 0;
    this.edit('Flatten All Masks', (p) => {
      const { patches, masks, rasterized } = FS.bakeMasks(p.doc);
      if (!patches.size) { this.notice('No layer has a mask to apply.'); return false; }
      for (const [id, patch] of patches) p.updateLayer(id, patch);
      p.maskTarget = false;
      count = masks;
      this.notice(`Applied ${masks} mask${masks === 1 ? '' : 's'} on ${patches.size} layer${patches.size === 1 ? '' : 's'}${rasterized ? `, rasterizing ${rasterized} type, shape or fill layer${rasterized === 1 ? '' : 's'}` : ''}.`);
    });
    return count;
  }

  /** The selected layers' colour label (1.87.3), null for none; one step. */
  setLayerLabel(label: LayerLabel | null): void {
    this.edit('Layer Color', (p) => {
      let changed = false;
      for (const id of p.selectedIds.size ? p.selectedIds : p.activeId ? [p.activeId] : []) {
        const l = p.layer(id);
        if (l && (l.label ?? null) !== label) { p.updateLayer(id, { label: label ?? undefined }); changed = true; }
      }
      return changed;
    });
  }

  renameLayer(id: ID, name: string): void {
    const n = name.trim().slice(0, 200);
    if (!n || !this.current || this.current.layer(id)?.name === n) return;
    this.edit('Rename Layer', (p) => { if (!p.layer(id)) return false; p.updateLayer(id, { name: n }); });
  }

  toggleVisibility(id: ID): void {
    const l = this.current?.layer(id);
    if (!l) return;
    const was = l.visible;
    this.edit(was ? 'Hide Layer' : 'Show Layer', (p) => { p.updateLayer(id, { visible: !was }); });
  }

  /** Layer > Hide Layers or Show Layers: every selected layer hidden, or shown, as one step. */
  setLayersVisible(visible: boolean): void {
    this.edit(visible ? 'Show Layers' : 'Hide Layers', (p) => {
      let changed = false;
      for (const id of p.selectedIds) { const l = p.layer(id); if (l && l.visible !== visible) { p.updateLayer(id, { visible }); changed = true; } }
      return changed;
    });
  }

  /** Show Only This Layer (Alt-click an eye; 1.87.3, CLOSE_GAPS P06): every other layer hidden except the folders
   *  holding it, as one step; the same Alt-click again brings back the visibility it had before. */
  soloLayer(id: ID): void {
    const p = this.current, l = p?.layer(id);
    if (!p || !l) return;
    const up = new Set<ID>([id, ...ancestors(byId(p.doc), l).map((a) => a.id)]), inside = new Set<ID>(l.isGroup ? descendantIds(p.doc.layers, id) : []);
    const back = this.soloed.get(p.id), before = new Map(p.doc.layers.map((x) => [x.id, x.visible] as const));
    const restoring = !!back && back.id === id;
    this.edit(restoring ? 'Show All Layers' : 'Show Only This Layer', (q) => {
      let changed = false;
      for (const x of q.doc.layers) {
        const want = restoring ? back.visible.get(x.id) ?? x.visible : up.has(x.id) ? true : inside.has(x.id) ? x.visible : false;
        if (x.visible !== want) { q.updateLayer(x.id, { visible: want }); changed = true; }
      }
      return changed;
    });
    if (restoring) this.soloed.delete(p.id);
    else this.soloed.set(p.id, { id, visible: before });
  }
  private readonly soloed = new Map<string, { id: ID; visible: Map<ID, boolean> }>();

  /** Stamp Visible (Shift+Alt+Mod+E; 1.87.3, CLOSE_GAPS P06): what the canvas shows merged into a new layer above the
   *  active one; every layer stays as it is. */
  stampVisible(): boolean {
    const flat = this.current ? this.flattened() : null;
    if (!flat) return false;
    const r = new Raster(flat.width, flat.height);
    r.ctx.drawImage(flat as CanvasImageSource, 0, 0);
    r.touch();
    this.insertRasterLayer(r, 'Stamp Visible', 0, 0, {}, 'Stamp Visible');
    return true;
  }

  /** Frequency Separation: what the canvas shows, split at `radius` px into a Low Frequency layer (colour and tone, the
   *  blurred picture) and above it a High Frequency layer (the detail, in Linear Light), so that the two together look
   *  as the picture did; each can be retouched alone. Both go above the active layer in one step. */
  frequencySeparation(radius = 8): boolean {
    const flat = this.current ? this.flattened() : null;
    if (!this.current || !flat) return false;
    const { low, high } = frequencySplit(ctxOf(flat).getImageData(0, 0, flat.width, flat.height), clamp(radius, 0.5, 100));
    const put = (img: ImageData): Raster => { const r = new Raster(flat.width, flat.height); r.write(img, 0, 0); return r; };
    this.edit('Frequency Separation', (p) => {
      const parentId = this.parentForNew(p);
      const lo = { ...newLayer('Low Frequency', p.doc, { raster: put(low), parentId }), transform: docTransform(flat.width, flat.height) };
      this.insertAboveActive(p, lo);
      this.insertAboveActive(p, { ...newLayer('High Frequency', p.doc, { raster: put(high), parentId }), transform: docTransform(flat.width, flat.height), blend: 'linear-light' as BlendMode });
    });
    return true;
  }

  /** Stamp Down (1.87.4): a copy of the active layer merged into the pixel layer below it, or copies of several selected
   *  layers merged into a new layer above them; the originals stay. */
  stampDown(): boolean { return LS.stampDown(this.structHost); }

  beginVisibilitySwipe(id: ID): boolean | null {
    const p = this.current;
    const l = p?.layer(id);
    if (!p || !l || this.stroke) return null;
    this.settle();
    const next = !l.visible;
    p.history.begin(next ? 'Show Layer' : 'Hide Layer', p.snapshot());
    this.swipeOpen = p;
    p.updateLayer(id, { visible: next });
    this.emit('doc', null);
    this.emit('render', null);
    return next;
  }

  swipeVisibility(id: ID, visible: boolean): void {
    const p = this.swipeOpen;
    if (!p) return;
    const l = p.layer(id);
    if (!l || l.visible === visible) return;
    p.updateLayer(id, { visible });
    this.emit('doc', null);
    this.emit('render', null);
  }

  endVisibilitySwipe(): void {
    const p = this.swipeOpen;
    if (!p) return;
    this.swipeOpen = null;
    p.history.end(p.snapshot());
    this.refresh();
  }

  beginOpacityEdit(): void {
    const p = this.current;
    if (!p || this.stroke || this.opacityOpen) return;
    this.settle();
    p.history.begin('Layer Opacity', p.snapshot());
    this.opacityOpen = p;
  }

  setOpacityLive(value: number): void {
    const p = this.opacityOpen;
    if (!p) return;
    const v = clamp(value, 0, 1);
    for (const id of p.selectedIds) { const l = p.layer(id); if (l && !l.artboard && l.opacity !== v) p.updateLayer(id, { opacity: v }); }
    this.emit('doc', null);
    this.emit('render', null);
  }

  endOpacityEdit(): void {
    const p = this.opacityOpen;
    if (!p) return;
    this.opacityOpen = null;
    p.history.end(p.snapshot());
    this.refresh();
  }

  setOpacity(value: number): void { this.beginOpacityEdit(); this.setOpacityLive(value); this.endOpacityEdit(); }

  /** Layers > Fill: the selected layers' fill (their pixels at this share of the opacity, their styles at the full
   *  opacity), as one undo step; nothing is recorded when no layer changes. */
  setFill(value: number): void {
    const v = clamp(value, 0, 1);
    this.edit('Layer Fill', (p) => {
      let changed = false;
      for (const id of p.selectedIds) { const l = p.layer(id); if (l && !l.isGroup && (l.fill ?? 1) !== v) { p.updateLayer(id, { fill: v }); changed = true; } }
      return changed;
    });
  }

  /** The Layers panel's Fill drag, as the Opacity drag: begin opens one 'Layer Fill' step, setFillLive changes the selected
   *  layers' fill as the slider moves, end closes it, so a whole drag is one undo step. */
  beginFillEdit(): void {
    const p = this.current;
    if (!p || this.stroke || this.fillOpen) return;
    this.settle();
    p.history.begin('Layer Fill', p.snapshot());
    this.fillOpen = p;
  }

  setFillLive(value: number): void {
    const p = this.fillOpen;
    if (!p) return;
    const v = clamp(value, 0, 1);
    for (const id of p.selectedIds) { const l = p.layer(id); if (l && !l.isGroup && (l.fill ?? 1) !== v) p.updateLayer(id, { fill: v }); }
    this.emit('doc', null);
    this.emit('render', null);
  }

  endFillEdit(): void {
    const p = this.fillOpen;
    if (!p) return;
    this.fillOpen = null;
    p.history.end(p.snapshot());
    this.refresh();
  }

  /** Shows `mode` on the selected layers for rendering only, without a history step, while the blend menu is hovered;
   *  null ends it. */
  previewBlend(mode: BlendMode | null): void {
    const p = this.current;
    const next = p && mode ? { project: p, mode } : null;
    if (this.blendPreview?.project === next?.project && this.blendPreview?.mode === next?.mode) return;
    this.blendPreview = next;
    this.emit('render', null);
  }

  /** `isolate`, for the folders among the selection, sets Layer.isolate (false is Pass Through, true a Normal folder
   *  composited on its own); other layers ignore it. */
  setBlend(mode: BlendMode, isolate?: boolean): void {
    if (this.blendPreview) this.previewBlend(null);
    this.edit('Layer Blend Mode', (p) => {
      let changed = false;
      for (const id of p.selectedIds) {
        const l = p.layer(id);
        if (!l || l.artboard) continue;
        const patch: Partial<Layer> = {};
        if (l.blend !== mode) patch.blend = mode;
        if (isolate !== undefined && l.isGroup && !!l.isolate !== isolate) patch.isolate = isolate;
        if (Object.keys(patch).length) { p.updateLayer(id, patch); changed = true; }
      }
      return changed;
    });
  }

  cycleBlend(forward: boolean): void {
    const l = this.activeLayer;
    if (!l || l.artboard) return;
    const n = BLEND_MODES.length, i = BLEND_MODES.findIndex((m) => m.id === l.blend);
    this.setBlend(BLEND_MODES[(i + (forward ? 1 : n - 1)) % n].id);
  }

  moveLayers(ids: ID[], targetId: ID, where: 'above' | 'below' | 'inside', duplicate = false): void { LS.moveLayers(this.structHost, ids, targetId, where, duplicate); }

  moveActive(by: 1 | -1): void { LS.moveActive(this.structHost, by); }

  /** Layer > Arrange > Bring to Front, Send to Back and Reverse, on the selected layers. One step. */
  arrangeLayers(how: 'front' | 'back' | 'reverse'): void {
    this.edit(how === 'front' ? 'Bring to Front' : how === 'back' ? 'Send to Back' : 'Reverse', (p) => {
      const roots = new Set(this.selectedRoots(p));
      if (!roots.size || (how === 'reverse' && roots.size < 2)) return false;
      const prev = p.doc.layers, layers = [...prev];
      if (how === 'reverse') {
        const slots = prev.flatMap((l, i) => (roots.has(l.id) ? [i] : []));
        if (slots.some((i) => prev[i].artboard) && slots.some((i) => prev[i].parentId)) { this.notice('Reverse cannot move an artboard into a folder.'); return false; }
        const moved = slots.map((i) => prev[i]).reverse();
        slots.forEach((i, k) => { layers[i] = moved[k].parentId === prev[i].parentId ? moved[k] : { ...moved[k], parentId: prev[i].parentId }; });
      } else {
        for (const parent of new Set(prev.filter((l) => roots.has(l.id)).map((l) => l.parentId))) {
          const slots = prev.flatMap((l, i) => (l.parentId === parent ? [i] : []));
          const sibs = slots.map((i) => prev[i]), picked = sibs.filter((l) => roots.has(l.id)), rest = sibs.filter((l) => !roots.has(l.id));
          const order = how === 'front' ? [...rest, ...picked] : [...picked, ...rest];
          slots.forEach((i, k) => { layers[i] = order[k]; });
        }
      }
      const next = this.normalizeClips(layers);
      if (next.every((l, i) => l.id === prev[i].id && l.parentId === prev[i].parentId && l.clipId === prev[i].clipId)) return false;
      p.setLayers(next);
    });
  }

  /** Layer > Group Layers, and New > Group from Layers with the dialog's name. One step. */
  groupLayers(name?: string): void { LS.groupLayers(this.structHost, name); }

  moveOutOfFolder(): void { LS.moveOutOfFolder(this.structHost); }

  /** Layer > Ungroup Layers: each selected folder's layers out to its place, the folder removed. One step. */
  ungroupLayers(): void {
    this.edit('Ungroup Layers', (p) => {
      const groups = this.selectedRoots(p).map((id) => p.layer(id) as Layer).filter((g) => g.isGroup && !g.artboard);
      if (!groups.length) return false;
      let layers = [...p.doc.layers];
      const freed = new Set<ID>();
      for (const g of groups) {
        const kids = layers.filter((l) => l.parentId === g.id).map((l) => ({ ...l, parentId: g.parentId, visible: l.visible && g.visible }));
        layers = layers.filter((l) => l.parentId !== g.id);
        layers.splice(layers.findIndex((l) => l.id === g.id), 1, ...kids);
        for (const l of kids) freed.add(l.id);
        p.collapsed.delete(g.id);
      }
      p.setLayers(this.normalizeClips(layers));
      const top = hierarchy(p.doc, true).find((e) => freed.has(e.layer.id))?.layer.id ?? hierarchy(p.doc, true)[0]?.layer.id ?? null;
      this.focus(p, top);
      if (freed.size) p.selectedIds = freed;
    });
  }

  /** The Option-drag from a mask thumbnail: puts a copy of the source's mask on the target, where it sits on the
   *  document, replacing any mask the target had, as one step. The target becomes active with its mask targeted.
   *  The raster is copied, so painting one mask never changes the other. */
  copyMask(source: ID, target: ID): void { LM.copyMask(this.maskHost, source, target); }

  copyLayerToProject(id: ID, targetKey: string): boolean { return LS.copyLayerToProject(this.structHost, id, targetKey); }

  toggleClip(id?: ID): void { LS.toggleClip(this.structHost, id); }

  mergeLayers(): void { LS.mergeLayers(this.structHost); }

  /** Layer > Merge Visible: hidden layers stay; each artboard merges on its own. One step. */
  mergeVisible(): void {
    this.edit('Merge Visible', (p) => {
      const map = byId(p.doc), board = (l: Layer | undefined): boolean => !!l?.isGroup && !l.parentId && !!l.artboard;
      const shown = new Set(hierarchy(p.doc).filter((e) => e.visible).map((e) => e.layer.id));
      const roots = new Map<ID | null, Layer[]>();
      for (const l of p.doc.layers) {
        if (!shown.has(l.id) || board(l) || (l.parentId && !board(map.get(l.parentId)))) continue;
        roots.set(l.parentId, [...(roots.get(l.parentId) ?? []), l]);
      }
      const plans = [...roots].filter(([, list]) => list.length > 1 || list.some((l) => l.isGroup));
      if (!plans.length) { this.notice('Merge Visible needs two visible layers, or a visible folder.'); return false; }
      const canvas = { x: 0, y: 0, w: p.doc.width, h: p.doc.height };
      const merged = new Map<ID, Layer>(), lifted = new Map<ID, Layer[]>(), gone = new Set<ID>();
      for (const [parent, list] of plans) {
        const set = new Set(list.map((l) => l.id));
        for (const r of list) for (const d of descendantIds(p.doc.layers, r.id)) if (shown.has(d)) set.add(d);
        const out = p.doc.layers.filter((l) => !set.has(l.id) && !!l.parentId && set.has(l.parentId)).map((l) => ({ ...l, parentId: parent }));
        const a = parent ? map.get(parent)?.artboard : null;
        let b: Rect = a ? { x: a.x, y: a.y, w: a.w, h: a.h } : canvas;
        if (!a) for (const l of p.doc.layers) if (set.has(l.id) && l.raster && !l.isGroup) b = unionRect(b, transformBounds(l.transform));
        let r = integral(b);
        if (r.w > LIMITS.side || r.h > LIMITS.side || r.w * r.h > LIMITS.pixels) r = intersectRect(r, canvas) ?? r;
        if (!this.room(r.w * r.h * 4, 'Merge Visible')) return false;
        const s = createSurface(r.w, r.h);
        this.work.render({ doc: p.doc, target: s, view: translation(-r.x, -r.y), only: set, quality: 'high' });
        merged.set(list[0].id, newLayer(list[0].name, p.doc, { raster: Raster.from(s, r.w, r.h), parentId: parent, transform: { ...docTransform(r.w, r.h), x: r.x, y: r.y } }));
        lifted.set(list[0].id, out);
        for (const id of set) gone.add(id);
        for (const l of out) gone.add(l.id);
      }
      const next: Layer[] = [];
      for (const l of p.doc.layers) {
        const m = merged.get(l.id);
        if (m) next.push(m, ...(lifted.get(l.id) ?? []));
        if (!gone.has(l.id)) next.push(l);
      }
      p.setLayers(this.normalizeClips(next));
      const top = plans.find(([c]) => c === null) ?? plans[0];
      this.focus(p, (merged.get(top[1][0].id) as Layer).id);
    });
  }

  /** Select and Mask's OK: the refined selection (`data`, 0 to 255 over the whole canvas) sent to its outputs:
   *  the selection itself, a layer mask on the active layer (replacing one it has), a new layer of the selected
   *  pixels, or a new layer (a duplicate) with it as a mask. One step; outputs other than the selection deselect. */
  applyRefinedSelection(data: Uint8Array, output: 'selection' | 'mask' | 'layer' | 'layerMask', decontam = 0): void {
    const p0 = this.current;
    if (!p0 || data.length !== p0.doc.width * p0.doc.height) return;
    if (!data.some((v) => v > 0)) { this.notice('Nothing is selected after refining.'); return; }
    const sel = SelectionMask.cropped(0, 0, p0.doc.width, p0.doc.height, data);
    this.edit('Select and Mask', (p) => {
      this.applySelection(sel, 'replace', 'Select and Mask');
      if (output === 'selection') return true;
      if (output === 'layer') this.layerViaCopy();
      else {
        const original = p.activeLayer?.id ?? null;
        if (output === 'layerMask') this.duplicateLayers();
        const l = p.activeLayer;
        if (l?.mask) p.updateLayer(l.id, { mask: null });
        this.addMask(false);
        if (output === 'layerMask' && original && original !== p.activeLayer?.id) p.updateLayer(original, { visible: false });
      }
      // Decontaminate Colors, on a new layer's own pixels (only for output to a new layer): the refined
      // mask read in the layer's coordinates, which needs the layer unrotated, unflipped and unscaled.
      if (decontam > 0 && (output === 'layer' || output === 'layerMask')) {
        const l = p.activeLayer, r = l?.raster, t = l?.transform;
        if (l && r && t && !t.rotation && !t.flipX && !t.flipY && Math.abs(t.w - r.width) < 0.5 && Math.abs(t.h - r.height) < 0.5) {
          const W = p.doc.width, H = p.doc.height, local = new Float32Array(r.width * r.height), ox = Math.round(t.x), oy = Math.round(t.y);
          for (let y = 0; y < r.height; y++) for (let x = 0; x < r.width; x++) {
            const dx = ox + x, dy = oy + y;
            local[y * r.width + x] = dx >= 0 && dy >= 0 && dx < W && dy < H ? data[dy * W + dx] / 255 : 0;
          }
          r.ctx.putImageData(decontaminate(r.ctx.getImageData(0, 0, r.width, r.height), local, decontam), 0, 0);
          r.touch();
        } else this.notice('Decontaminate Colors needs a layer that is not rotated, flipped or scaled; the colours were left as they are.');
      }
      p.selection = null;
      return true;
    });
  }

  addMask(hide = false, fromSelection = true): void { LM.addMask(this.maskHost, hide, fromSelection); }

  /** Layer > Layer Mask > From Transparency: the layer's alpha becomes its mask and its pixels opaque. One step. */
  maskFromTransparency(): void {
    this.edit('Add Layer Mask', (p) => {
      const l = p.activeLayer;
      if (!l || l.mask || !this.paintable(l) || l.adjustment || !l.raster || this.smartLocked(p)) return false;
      const { mask, opaque } = alphaToMask(l.raster.read());
      const m = new Raster(l.raster.width, l.raster.height);
      m.write(mask);
      const r = new Raster(l.raster.width, l.raster.height);
      r.write(opaque);
      p.updateLayer(l.id, { raster: r, mask: { raster: m, enabled: true, linked: true, placement: null } });
      p.maskTarget = true;
      return true;
    });
  }

  /** What Mask All Objects reads: a layer with pixels drawn alone at document size over white, else the visible image. */
  objectSource(id: ID): Surface | null {
    const p = this.current, l = p?.layer(id);
    if (!p || !l) return null;
    if (!l.raster) return this.flattened();
    const s = createSurface(p.doc.width, p.doc.height);
    this.work.render({ doc: p.doc, target: s, view: translation(0, 0), only: new Set([id]), background: '#ffffff', quality: 'high' });
    return s;
  }

  /** Layer > Mask All Objects: above the layer, a folder holding an empty folder per object found (largest first), each
   *  masked to its object (`masks`, document size, white with the mask as alpha), for adjustments to go in. One step. */
  maskAllObjects(layerId: ID, masks: readonly Surface[]): void {
    this.edit('Mask All Objects', (p) => {
      const l = p.layer(layerId);
      if (!l || !masks.length) return false;
      const outer = newLayer('Objects', p.doc, { isGroup: true, parentId: l.parentId });
      const inner = masks.map((s, i) => newLayer(`Object ${i + 1}`, p.doc, { isGroup: true, parentId: outer.id, mask: { raster: Raster.from(s, s.width, s.height), enabled: true, linked: true, placement: null } }));
      const layers = [...p.doc.layers];
      layers.splice(layers.indexOf(l) + 1, 0, ...inner.reverse(), outer);
      p.setLayers(layers);
      this.focus(p, outer.id);
      return true;
    });
  }

  /** Layer > Matting: Defringe (`width` px), Remove Black Matte, Remove White Matte, and Color Decontaminate (`amount`
   *  percent over `radius` px, by the layer's mask when it has one, else its alpha), on the whole layer. One step. */
  matting(kind: 'defringe' | 'black' | 'white' | 'decontaminate', width = 1, amount = 100, radius = 6): void {
    const p0 = this.current, l0 = p0?.activeLayer;
    if (p0?.maskTarget && l0?.mask) { this.notice('Matting changes a layer\'s pixels: click the layer\'s thumbnail, not its mask.'); return; }
    const name = { defringe: 'Defringe', black: 'Remove Black Matte', white: 'Remove White Matte', decontaminate: 'Color Decontaminate' }[kind];
    this.regionEdit(name, ({ raster, rect }) => {
      const img = raster.read(rect.x, rect.y, rect.w, rect.h), l = this.current?.activeLayer as Layer;
      let out: ImageData;
      if (kind === 'defringe') out = defringe(img, clamp(Math.round(width), 1, 200));
      else if (kind !== 'decontaminate') out = removeMatte(img, kind === 'white');
      else {
        const m = l.mask?.enabled && l.mask.raster ? l.mask : null, a = new Float32Array(rect.w * rect.h);
        if (m?.raster) {
          const s = createSurface(raster.width, raster.height), c = ctxOf(s);
          setMat(c, mul(invert(placement(l.transform, raster.width, raster.height)), placement(m.placement ?? l.transform, m.raster.width, m.raster.height)));
          c.drawImage(m.raster.canvas, 0, 0);
          const md = c.getImageData(rect.x, rect.y, rect.w, rect.h).data;
          for (let i = 0; i < a.length; i++) a[i] = md[i * 4 + 3] / 255;
        } else for (let i = 0; i < a.length; i++) a[i] = img.data[i * 4 + 3] / 255;
        out = decontaminate(img, a, clamp(amount, 0, 100), clamp(radius, 1, 100) / 6);
      }
      raster.write(out, rect.x, rect.y);
    }, null);
  }

  deleteMask(apply: boolean): void { LM.deleteMask(this.maskHost, apply); }

  toggleMaskEnabled(): void { LM.toggleMaskEnabled(this.maskHost); }

  toggleMaskLink(): void { LM.toggleMaskLink(this.maskHost); }

  /** Layer > Vector Mask (1.66.1): Reveal All and Hide All give the active layer an empty vector mask
   *  showing or hiding all of it, Current Path one from the selected path (the layer showing inside it). One step. */
  addVectorMask(kind: 'reveal' | 'hide' | 'path'): boolean {
    const p0 = this.current, l0 = p0?.activeLayer, path = kind === 'path' ? this.workPath : null;
    if (!p0 || !l0 || l0.vectorMask) return false;
    if (kind === 'path' && (!path || !hasOutline(path))) { this.notice('Select a path with an outline first: Current Path makes the vector mask from it.'); return false; }
    return this.edit(kind === 'hide' ? 'Add Vector Mask Hiding All' : 'Add Vector Mask', (p) => {
      const l = p.activeLayer;
      if (!l || l.vectorMask) return false;
      p.updateLayer(l.id, { vectorMask: { path: path ? structuredClone(path) : { subpaths: [] }, enabled: true, linked: true, inverted: kind === 'hide' } });
      return true;
    });
  }

  /** Layer > Vector Mask > Delete, Enable or Disable, Link or Unlink (1.66.1), on the active layer's vector mask. */
  changeVectorMask(change: 'delete' | 'enable' | 'link' | 'invert'): boolean {
    const v0 = this.current?.activeLayer?.vectorMask;
    if (!v0) return false;
    const name = change === 'delete' ? 'Delete Vector Mask' : change === 'invert' ? 'Invert Vector Mask' : change === 'enable' ? (v0.enabled ? 'Disable Vector Mask' : 'Enable Vector Mask') : v0.linked ? 'Unlink Vector Mask' : 'Link Vector Mask';
    return this.edit(name, (p) => {
      const l = p.activeLayer, v = l?.vectorMask;
      if (!l || !v) return false;
      p.updateLayer(l.id, { vectorMask: change === 'delete' ? null : change === 'invert' ? { ...v, inverted: !v.inverted } : change === 'enable' ? { ...v, enabled: !v.enabled } : { ...v, linked: !v.linked } });
      return true;
    });
  }

  /** Layer > Rasterize > Vector Mask (1.66.1): the vector mask drawn into the layer mask, made for it if
   *  there is none, and kept where both hid; a disabled vector mask is dropped unchanged. One step. */
  rasterizeVectorMask(): boolean {
    const p0 = this.current, l0 = p0?.activeLayer;
    if (!p0 || !l0?.vectorMask) return false;
    return this.edit('Rasterize Vector Mask', (p) => {
      const l = p.activeLayer, v = l?.vectorMask;
      if (!l || !v) return false;
      const cov = v.enabled ? vectorCoverage(v, p.doc.width, p.doc.height) : null;
      if (!cov) { p.updateLayer(l.id, { vectorMask: null }); return true; }
      const m = l.mask, mr = m?.raster ?? null, place = m?.placement ?? l.transform;
      const w = mr?.width ?? l.raster?.width ?? Math.max(1, Math.round(l.transform.w)), h = mr?.height ?? l.raster?.height ?? Math.max(1, Math.round(l.transform.h));
      const out = mr ? mr.clone() : Raster.filled(w, h, '#ffffff');
      setMat(out.ctx, invert(placement(place, w, h)));
      out.ctx.globalCompositeOperation = 'destination-in';
      out.ctx.drawImage(cov.surface as CanvasImageSource, 0, 0);
      out.ctx.globalCompositeOperation = 'source-over';
      out.ctx.setTransform(1, 0, 0, 1, 0, 0);
      out.touch();
      p.updateLayer(l.id, { vectorMask: null, mask: m ? { ...m, raster: out } : { raster: out, enabled: true, linked: true, placement: null } });
      return true;
    });
  }

  /** Every vector mask in `layers` carried by `f`, a change of the whole canvas (1.66.1): linked or not, they move with it. */
  private carryVectors(layers: readonly Layer[], f: (x: number, y: number) => Pt): Layer[] {
    return layers.map((l) => (l.vectorMask ? { ...l, vectorMask: movedVector(l.vectorMask, f) } : l));
  }

  flipLayers(horizontal: boolean): void { PO.flipLayers(this.paintHost, horizontal); }

  /** Image > Image Rotation (1.55.3, DEV_PLAN 22.4): the canvas turned by quarter turns. Every layer's box turns about
   *  the document's centre and its rotation follows, masks and artboards with it, the selection too; no pixel is
   *  resampled, so this works at every depth and in every mode. */
  rotateCanvas(quarters: 1 | 2 | 3): void {
    const name = quarters === 1 ? 'Rotate 90° Clockwise' : quarters === 2 ? 'Rotate 180°' : 'Rotate 90° Counter Clockwise';
    this.edit(name, (p) => {
      const { width: W, height: H } = p.doc, deg = quarters * 90;
      const turn = (t: Transform): Transform => {
        const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
        const nx = quarters === 1 ? H - cy : quarters === 2 ? W - cx : cy, ny = quarters === 1 ? cx : quarters === 2 ? H - cy : W - cx;
        return { ...t, x: nx - t.w / 2, y: ny - t.h / 2, rotation: t.rotation + deg };
      };
      const rect = (a: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number } =>
        quarters === 1 ? { x: H - a.y - a.h, y: a.x, w: a.h, h: a.w } : quarters === 2 ? { x: W - a.x - a.w, y: H - a.y - a.h, w: a.w, h: a.h } : { x: a.y, y: W - a.x - a.w, w: a.h, h: a.w };
      const layers = p.doc.layers.map((l) => ({
        ...l,
        transform: turn(l.transform),
        mask: l.mask?.placement ? { ...l.mask, placement: turn(l.mask.placement) } : l.mask,
        ...(l.artboard ? { artboard: { ...l.artboard, ...rect(l.artboard) } } : {}),
      }));
      const to = (x: number, y: number): Pt => (quarters === 1 ? { x: H - y, y: x } : quarters === 2 ? { x: W - x, y: H - y } : { x: y, y: W - x });
      const spun = this.carryVectors(layers, to), prior = p.doc;
      p.doc = { ...p.doc, width: quarters === 2 ? W : H, height: quarters === 2 ? H : W, layers: spun, ...alphasMoved(p.doc, (m) => m.rotated(quarters, W, H)), ...GD.carryMarks(p.doc, { map: to, width: quarters === 2 ? W : H, height: quarters === 2 ? H : W, swap: quarters !== 2 }) };
      if (p.selection) p.selection = p.selection.rotated(quarters, W, H);
      this.carryMeasure(p, prior, name, to);
      return true;
    });
    // The turned document stays centred where it was on screen (1.85.2): a quarter turn swaps the sides, so the view
    // moves by half their difference instead of leaving the document hanging off one edge.
    const p = this.current;
    if (p && quarters !== 2 && p.doc.width !== p.doc.height) {
      const z = p.viewport.zoom, dw = (p.doc.height - p.doc.width) / 2 * z;
      this.pan(dw, -dw);
    }
  }

  flipCanvas(horizontal: boolean): void {
    this.edit(horizontal ? 'Flip Canvas Horizontal' : 'Flip Canvas Vertical', (p) => {
      const W = p.doc.width, H = p.doc.height, prior = p.doc;
      p.setLayers(this.carryVectors(p.doc.layers.map((l) => ({
        ...l,
        transform: mirrored(l.transform, horizontal, W, H),
        ...(l.mask?.placement ? { mask: { ...l.mask, placement: mirrored(l.mask.placement, horizontal, W, H) } } : {}),
        ...(l.artboard ? { artboard: horizontal ? { ...l.artboard, x: W - l.artboard.x - l.artboard.w } : { ...l.artboard, y: H - l.artboard.y - l.artboard.h } } : {}),
      })), (x, y) => (horizontal ? { x: W - x, y } : { x, y: H - y })));
      if (p.selection) p.selection = p.selection.flipped(horizontal, W, H);
      if (p.doc.alphas?.length) p.doc = { ...p.doc, ...alphasMoved(p.doc, (m) => m.flipped(horizontal, W, H)) };
      const flip = (x: number, y: number): Pt => (horizontal ? { x: W - x, y } : { x, y: H - y });
      p.doc = { ...p.doc, ...GD.carryMarks(p.doc, { map: flip, width: W, height: H }) };
      this.carryMeasure(p, prior, horizontal ? 'Flip Canvas Horizontal' : 'Flip Canvas Vertical', flip);
    });
  }

  /** Image > Image Rotation > Arbitrary (1.65.5): every layer turned `deg` degrees clockwise (counter-clockwise when
   *  negative) about the canvas's centre, the canvas grown to hold the turned canvas; the Background, when there is
   *  one, is redrawn canvas-sized over the background colour, which fills the corners the turn opens.
   *  Alpha channels and the selection turn with it. Whole quarter turns go to `rotateCanvas`. One step. */
  rotateCanvasBy(deg: number): boolean {
    const p0 = this.current;
    if (!p0 || !Number.isFinite(deg)) return false;
    const turn = ((deg % 360) + 360) % 360;
    if (!turn) return false;
    if (turn % 90 === 0) { this.rotateCanvas((turn / 90) as 1 | 2 | 3); return true; }
    if (p0.doc.layers.some((l) => l.artboard)) { this.notice('Artboards stay upright: turn the layers in them with Free Transform instead.'); return false; }
    const a = (turn * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a), W = p0.doc.width, H = p0.doc.height;
    const W2 = Math.ceil(Math.abs(W * cs) + Math.abs(H * sn) - 1e-6), H2 = Math.ceil(Math.abs(W * sn) + Math.abs(H * cs) - 1e-6);
    if (!this.sizeOk(W2, H2)) return false;
    const c = { x: W / 2, y: H / 2 }, dx = (W2 - W) / 2, dy = (H2 - H) / 2, bg = this.backgroundLayer(), fill = { ...this.bg };
    this.settle();
    const ok = this.edit('Rotate Canvas', (p) => {
      const turned = (t: Transform): Transform => {
        const lx = t.x + t.w / 2 - c.x, ly = t.y + t.h / 2 - c.y;
        return { ...t, x: c.x + lx * cs - ly * sn - t.w / 2 + dx, y: c.y + lx * sn + ly * cs - t.h / 2 + dy, rotation: t.rotation + turn };
      };
      const layers = p.doc.layers.map((l) => {
        if (l.isGroup) return l;
        const t = turned(l.transform), moved = { ...l, transform: t, mask: l.mask?.placement ? { ...l.mask, placement: turned(l.mask.placement) } : l.mask };
        if (l.id !== bg?.id || !l.raster || l.mask || l.channels || l.smart || l.vector) return moved;
        const r = Raster.filled(W2, H2, rgbCss(fill));
        setMat(r.ctx, placement(t, l.raster.width, l.raster.height));
        r.ctx.drawImage(l.raster.canvas, 0, 0);
        r.ctx.setTransform(1, 0, 0, 1, 0, 0);
        r.touch();
        return { ...moved, raster: r, transform: docTransform(W2, H2) };
      });
      const spin = (g: Ctx2D): void => { g.translate(W2 / 2, H2 / 2); g.rotate(a); g.translate(-W / 2, -H / 2); };
      const to = (x: number, y: number): Pt => ({ x: c.x + (x - c.x) * cs - (y - c.y) * sn + dx, y: c.y + (x - c.x) * sn + (y - c.y) * cs + dy });
      const spun = this.carryVectors(layers, to), prior = p.doc;
      p.doc = { ...p.doc, width: W2, height: H2, layers: spun, ...alphasRedrawn(p.doc, W2, H2, (g, m) => { spin(g); g.drawImage(m.surface(), m.x, m.y); }), ...GD.carryMarks(p.doc, { map: to, width: W2, height: H2, upright: false }) };
      this.carryMeasure(p, prior, 'Rotate Canvas', to);
      if (p.selection) {
        const s = createSurface(W2, H2), g = ctxOf(s), sel = p.selection;
        spin(g);
        g.drawImage(sel.surface() as CanvasImageSource, sel.x, sel.y);
        p.selection = SelectionMask.fromAlpha(0, 0, W2, H2, ctxOf(s).getImageData(0, 0, W2, H2).data);
      }
      return true;
    });
    if (ok) this.fit();
    return ok;
  }

  /** Image > Crop (1.65.5): the canvas cut to the selection's bounds, as the Crop tool's crop. */
  cropToSelection(): boolean {
    const s = this.current?.selection;
    if (!s) { this.notice('Make a selection first: Image > Crop cuts the canvas to its bounds.'); return false; }
    return this.cropTo(s.rect);
  }

  /** Image > Auto Tone, Auto Contrast and Auto Color (1.65.5): Levels set from the histogram of the active layer (of
   *  its selected area, when there is a selection) by `autoLevels` (per channel; one range for all three; per channel
   *  with neutral midtones) and applied to it, within the selection, as one step. */
  autoAdjust(kind: 'tone' | 'contrast' | 'color'): void {
    const t = this.targetImage();
    if (!t) { this.notice('Select a layer with pixels first.'); return; }
    const bins = histogram(t.image, this.targetCoverage(t));
    const k = levelsKernel({ ranges: autoLevels(bins, kind === 'tone' ? 'color' : kind === 'contrast' ? 'contrast' : 'neutral') });
    this.applyImageEdit({ tone: 'Auto Tone', contrast: 'Auto Contrast', color: 'Auto Color' }[kind], (src, scale) => {
      const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
      k(out.data, { width: src.width, height: src.height, originX: 0, originY: 0, unitsPerPixel: 1 / scale });
      return out;
    });
  }

  /** Image > Adjustments > Desaturate, Equalize and Replace Color (1.65.5) on the active layer within the selection,
   *  each one step; Replace Color's settings are its dialog's. */
  pixelAdjust(kind: 'desaturate' | 'equalize'): void {
    const t = kind === 'equalize' ? this.targetImage() : null, cov = t ? this.targetCoverage(t) : null;
    this.applyImageEdit(kind === 'desaturate' ? 'Desaturate' : 'Equalize', (src) => {
      const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
      if (kind === 'desaturate') desaturatePixels(out.data); else equalizePixels(out.data, cov && cov.length === out.data.length ? cov : null);
      return out;
    });
  }
  replaceColor(o: ReplaceColorSettings, preview = false): void {
    const run = (src: ImageData): ImageData => {
      const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
      replaceColorPixels(out.data, o);
      return out;
    };
    if (preview) this.previewImageEdit(run); else this.applyImageEdit('Replace Color', run);
  }

  /** Image > Apply Image (31.2): a channel of a document, layer or the merged image blended into the active layer's
   *  pixels (within the selection) by a mode at `opacity` (0 to 1), through an optional mask; one step. A source or mask
   *  document must be the target's pixel size. `channel` is rgb, red, green, blue, transparency or a saved alpha
   *  channel's id or name. Returns whether it ran. */
  applyImage(opts: { doc?: ID; layer?: ID | 'merged'; channel?: string; invert?: boolean; mode?: ApplyMode; opacity?: number; scale?: number; offset?: number; mask?: { doc?: ID; layer?: ID | 'merged'; channel?: string; invert?: boolean } | null; preview?: boolean } = {}): boolean {
    const t = this.targetImage();
    if (!t) { this.notice('Apply Image needs a layer to apply to.'); return false; }
    this.settle();
    const grab = (s: { doc?: ID; layer?: ID | 'merged'; channel?: string; invert?: boolean }, what: string): Uint8ClampedArray | null => {
      const q = s.doc ? this.alphaDocuments().find((d) => d.id === s.doc) : this.current;
      if (!q) { this.notice(`Apply Image: the ${what} document must be open and the same pixel size as the target.`); return null; }
      const ch = s.channel ?? 'rgb', alpha = q.doc.alphas?.find((a) => a.id === ch || a.name === ch);
      if (alpha) {
        const W = q.doc.width, H = q.doc.height;
        if (W !== t.width || H !== t.height) { this.notice(`Apply Image: the ${what} must be the same pixel size as the target.`); return null; }
        const cov = new Uint8Array(W * H);
        if (alpha.mask) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) cov[y * W + x] = alpha.mask.valueAt(x, y);
        return coverageSource(cov, !!s.invert);
      }
      if (!(APPLY_CHANNELS as readonly string[]).includes(ch)) { this.notice(`Apply Image: no channel named ${ch}.`); return null; }
      let img: ImageData;
      if (s.layer === 'merged') img = ctxOf(renderDoc(this.work, q.doc)).getImageData(0, 0, q.doc.width, q.doc.height);
      else {
        const l = s.layer ? q.doc.layers.find((x) => x.id === s.layer) : q.activeLayer;
        if (!l || !l.raster) { this.notice(`Apply Image: the ${what} layer has no pixels.`); return null; }
        img = l.raster.read();
      }
      if (img.width !== t.width || img.height !== t.height) { this.notice(`Apply Image: the ${what} must be the same pixel size as the target.`); return null; }
      return channelSource(img.data, ch as ApplyChannel, !!s.invert);
    };
    const src = grab(opts, 'source');
    if (!src) return false;
    let mask: Uint8ClampedArray | null = null;
    if (opts.mask) { const m = grab(opts.mask, 'mask'); if (!m) return false; mask = maskStrength(m); }
    const mode = opts.mode && (APPLY_MODES as readonly string[]).includes(opts.mode) ? opts.mode : 'normal';
    const o = { mode, opacity: Math.min(1, Math.max(0, opts.opacity ?? 1)), scale: Math.min(255, Math.max(1, opts.scale ?? 1)), offset: Math.min(255, Math.max(-255, opts.offset ?? 0)), mask };
    const run = (s: ImageData): ImageData => {
      const out = new ImageData(new Uint8ClampedArray(s.data), s.width, s.height);
      if (s.width === t.width && s.height === t.height) { applyImagePixels(out.data, src, s.width, o); return out; }
      // A preview's reduced copy: sample the full-size source and mask at the reduced pixels (nearest).
      const rs = new Uint8ClampedArray(s.width * s.height * 4), rm = o.mask ? new Uint8ClampedArray(s.width * s.height) : null;
      for (let y = 0; y < s.height; y++) {
        const fy = Math.min(t.height - 1, Math.floor(((y + 0.5) * t.height) / s.height));
        for (let x = 0; x < s.width; x++) {
          const fi = fy * t.width + Math.min(t.width - 1, Math.floor(((x + 0.5) * t.width) / s.width)), di = y * s.width + x;
          rs.set(src.subarray(fi * 4, fi * 4 + 4), di * 4);
          if (rm && o.mask) rm[di] = o.mask[fi];
        }
      }
      applyImagePixels(out.data, rs, s.width, { ...o, mask: rm });
      return out;
    };
    if (opts.preview) this.previewImageEdit(run); else this.applyImageEdit('Apply Image', run);
    return true;
  }

  /** Replace Color's preview (1.65.5): the active layer's pixels (its mask's, when the mask is the target), fitted in
   *  `boxW` by `boxH`, scored as `replaceColor` scores them. */
  replaceColorScores(o: ReplaceColorSettings, boxW: number, boxH: number): { mask: Uint8Array; w: number; h: number } | null {
    const p = this.current, l = p?.activeLayer, r = !l || l.isGroup || l.tiled ? null : p?.maskTarget && l.mask ? l.mask.raster : l.raster;
    if (!r) return null;
    const k = Math.min(1, boxW / r.width, boxH / r.height), w = Math.max(1, Math.round(r.width * k)), h = Math.max(1, Math.round(r.height * k)), c = ctxOf(createSurface(w, h));
    c.drawImage(r.canvas as CanvasImageSource, 0, 0, w, h);
    return { mask: replaceColorPixels(c.getImageData(0, 0, w, h).data, o, false), w, h };
  }

  /** The selection's coverage of the pixels `targetImage` read, or null with no selection. */
  private targetCoverage(t: { target: Target; width: number; height: number }): Uint8ClampedArray | null {
    const p = this.current, l = p?.activeLayer;
    return p && l ? this.coverageFor(p, l, t.target, t.width, t.height) : null;
  }

  /** The current document as Flatten Image would make it, in one Background layer, its size, resolution, mode, guides,
   *  notes and alpha channels kept, as a new document's (Duplicate's Merged Layers Only; File > Save a Copy without
   *  Layers, 1.65.8); null past 268 megapixels a layer, which is not flattened yet. */
  mergedDoc(): Doc | null {
    const p = this.current;
    if (!p) return null;
    if (p.doc.layers.some((l) => l.tiled)) { this.notice('A document with layers past 268 megapixels cannot be flattened into a copy yet.'); return null; }
    const flat = this.flattened();
    if (!flat) return null;
    const layer = newLayer('Background', p.doc, { raster: Raster.from(flat as CanvasImageSource, p.doc.width, p.doc.height) });
    return { ...p.doc, id: uid(), layers: [layer] };
  }

  /** Image > Duplicate (1.65.5): a new document holding a copy of this one, its layers' pixels and masks copied (or,
   *  `merged`, the picture as Flatten Image makes it, in one layer), named `name`, with its paths and, unmerged, its
   *  timeline. */
  duplicateDocument(name: string, merged = false): Project | null {
    const p = this.current;
    if (!p) return null;
    if (p.doc.layers.some((l) => l.tiled)) { this.notice('A document with layers past 268 megapixels cannot be duplicated yet: save it and open the copy.'); return null; }
    this.settle();
    const title = name.trim().slice(0, 200) || `${p.name} copy`, flat = merged ? this.mergedDoc() : null;
    let doc: Doc, active: ID | null = p.activeId;
    if (flat) {
      doc = flat;
      active = flat.layers[0].id;
    } else doc = { ...this.copyDoc(p.doc), id: uid() };
    const paths = this.pathSet(p), tl = !flat && this.timelines.has(p) ? structuredClone(this.timelineFor(p)) : null;
    const q = this.addProject(doc, title, active);
    if (paths.list.length) this.pathStore.sets.set(q, structuredClone(paths));
    if (tl && (tl.frames.length || tl.video)) this.setTimelineFor(q, tl);
    return q;
  }

  /** Whether a layer can take paint (1.50.2, the owner's walkthrough: tools refused layers that should
   *  take paint): a group says so; a locked layer says why; an adjustment layer paints its mask, and a fill layer
   *  its mask when that is the target (1.66.0); a type, shape, fill or smart-object layer asks to be rasterized first
   *  (and is, on OK, so the next action paints). A refusal's own message stands alone: the caller's generic one is held
   *  back (lockedAt). */
  private paintable(l: Layer | null, allowTiled = false): l is Layer {   // allowTiled: the plain stroke (1.62.5)
    if (!l) return false;
    if (l.isGroup) { this.notice(`"${l.name}" is a group: choose a layer inside it.`); this.lockedAt = performance.now(); return false; }
    // A layer past 268 MP, kept in tiles (1.62.3): painting it had given it a full-size canvas the browser cannot make.
    if (l.tiled && !allowTiled) { this.notice(`"${l.name}" is past 268 megapixels and kept in tiles: the brush, pencil and eraser paint it; this comes in a later release.`); this.lockedAt = performance.now(); return false; }
    if (this.locked(l, 'pixels')) return false;
    if (l.adjustment || (l.fillContent && l.mask && this.current?.maskTarget)) return true;
    const kind = liveText(l) ? 'type layer' : l.smart ? 'Smart Object' : l.vector || l.shape ? 'shape layer' : l.fillContent ? 'fill layer' : null;
    if (kind) {
      this.lockedAt = performance.now();
      if (!this.asking && this.askRasterize) {
        this.asking = true;
        const id = l.id;
        void this.askRasterize(l.name, kind).then((ok) => { this.asking = false; if (ok && this.current?.activeLayer?.id === id) this.rasterizeLayer(); });
      }
      return false;
    }
    return true;
  }
  /** Asks to rasterize a layer before painting on it (the app shows the usual question); resolves true on OK. */
  askRasterize: ((name: string, kind: string) => Promise<boolean>) | null = null;
  private asking = false;

  private ensurePixels(p: Project, layer: Layer): Raster {
    if (!layer.raster) {
      const r = new Raster(p.doc.width, p.doc.height);
      p.updateLayer(layer.id, { raster: r, transform: docTransform(p.doc.width, p.doc.height) });
      return r;
    }
    const canvasRect = { x: 0, y: 0, w: p.doc.width, h: p.doc.height };
    return this.growLayer(p, layer, canvasRect);
  }

  private growLayer(p: Project, layer: Layer, want: Rect): Raster { return PO.growLayer(p, layer, want); }

  private ensureMask(p: Project, layer: Layer): Raster {
    const m = layer.mask as NonNullable<Layer['mask']>;
    if (m.raster) return m.raster;
    const r = Raster.filled(layer.raster ? layer.raster.width : p.doc.width, layer.raster ? layer.raster.height : p.doc.height, '#ffffff');
    p.updateLayer(layer.id, { mask: { ...m, raster: r } });
    return r;
  }

  private target(p: Project): { layer: Layer; target: Target; raster: Raster; local: Mat } | null {
    const l0 = p.activeLayer;
    if (!this.paintable(l0)) return null;
    // An adjustment layer paints its mask (made, revealing all, when it has none).
    if (l0.adjustment && !l0.mask) p.updateLayer(l0.id, { mask: { raster: null, enabled: true, linked: true, placement: null } });
    const la = p.layer(l0.id) as Layer, target: Target = la.adjustment || (p.maskTarget && la.mask) ? 'mask' : 'pixels';
    const raster = target === 'mask' ? this.ensureMask(p, la) : this.ensurePixels(p, la);
    const l = p.layer(l0.id) as Layer;
    const t = target === 'mask' ? (l.mask?.placement ?? l.transform) : l.transform;
    return { layer: l, target, raster, local: placement(t, raster.width, raster.height) };
  }

  /** opts (1.49.5, the owner's tool list): aliased paints hard pixel-exact dabs (the Pencil); autoErase paints the
   *  background colour when the stroke starts on the foreground colour (the Pencil's Auto Erase); name names the step. */
  beginStroke(pt: Pt, shift: boolean, pressure = 1, pose: PenPose = UPRIGHT, opts: { aliased?: boolean; square?: boolean; autoErase?: boolean; name?: string } = {}): boolean {
    if (!this.deepPaintOk()) return false;   // 16 bits: Brush, Pencil and Eraser paint (1.53.8)
    const p = this.current;
    if (!p || this.stroke || this.waiting()) return false;
    this.tileFreshLayer(p);   // a fresh layer on a giant document: tiles, not a full-size canvas (1.62.8)
    // What a stroke makes (1.60.5, engine/stroke.ts): its working and paint surfaces, each the layer's size, a third
    // with a selection; and the layer's own pixels when this stroke is the first on it.
    const fresh = p.activeLayer && !p.activeLayer.raster && !p.activeLayer.tiled ? p.doc.width * p.doc.height * 4 : 0;   // a tiled layer is never given one (1.62.3)
    // A large layer's stroke works in a window around where it paints, grown within the budget (1.60.6): it asks room
    // here only for a first window around the brush.
    const lb = this.layerBytes(), first = lb / 4 > strokeWindowFrom() ? Math.min(lb, (this.brush.diameter + 1026) ** 2 * 4) : lb;
    if (!this.room(first * ((p.selection ? 3 : 2) + 1.25) + fresh, 'This stroke')) return false;
    this.settle();
    if (this.quickMask) return this.beginQuickMaskStroke(p, pt, pressure, pose);   // paints the selection, any layer
    if (!this.paintable(p.activeLayer, true)) { this.notice('Select a pixel layer to paint on.'); return false; }
    if (this.smartLocked(p)) return false;
    // A giant layer kept in tiles (1.62.5, DEV_PLAN 26.6d): the plain brush, pencil and eraser paint it; what needs
    // the whole layer declines here, before any history step opens.
    const lt = p.activeLayer?.tiled ?? null;
    if (lt) {
      const whole = this.tool === 'mixer' ? 'The Mixer Brush' : p.maskTarget ? 'Painting a mask' : p.selection ? 'Painting inside a selection'
        : !opts.aliased && shapeActive(this.brushShape) ? 'Brush Settings (shape and scattering, texture, dual brush, wet edges)' : null;
      if (whole) { this.notice(`${whole} on a layer kept in tiles comes in a later release; the plain brush, pencil and eraser paint it now.`); return false; }
    }
    p.history.begin(opts.name ?? (this.brushMode === 'erase' ? 'Eraser' : this.tool === 'mixer' ? 'Mixer Brush' : 'Brush'), p.snapshot());
    // A tiled layer's target is its tiles, placed as target places a layer (target would give it a full-size canvas).
    const al = p.activeLayer as Layer;
    const pick: { layer: Layer; target: Target; raster: Raster | TiledRaster; local: Mat } = lt
      ? { layer: al, target: 'pixels', raster: lt, local: placement(al.transform, lt.width, lt.height) }
      : this.target(p) as NonNullable<ReturnType<Engine['target']>>;
    const white = pick.target === 'mask' && ((luminance(this.fg) >= 0.5) !== (this.brushMode === 'erase'));
    // Lock Transparency: paint only where the layer has pixels (source-atop); the Eraser then paints the background
    // colour, since it may not make pixels transparent.
    const keepAlpha = pick.target !== 'mask' && !!p.activeLayer?.locks?.transparency;
    const op: GlobalCompositeOperation = pick.target === 'mask' ? (white ? 'source-over' : 'destination-out') : keepAlpha ? 'source-atop' : this.brushMode === 'erase' ? 'destination-out' : this.brushBlend === 'behind' ? 'destination-over' : this.brushBlend === 'clear' ? 'destination-out' : compositeOp(this.brushBlend);
    let color = pick.target === 'mask' ? { r: 255, g: 255, b: 255 } : keepAlpha && this.brushMode === 'erase' ? this.bg : this.fg;
    if (opts.autoErase && pick.target !== 'mask' && this.brushMode !== 'erase') {
      // Auto Erase: starting on the foreground colour, the stroke paints the background colour.
      const q = applyMat(invert(pick.local) ?? [1, 0, 0, 1, 0, 0], pt.x, pt.y), rr = pick.raster;
      let px: Uint8ClampedArray;
      try { px = 'ctx' in rr ? rr.ctx.getImageData(Math.floor(q.x), Math.floor(q.y), 1, 1).data : rr.read(Math.floor(q.x), Math.floor(q.y), 1, 1).data; } catch { px = new Uint8ClampedArray(4); }   // a tile on disk: not the foreground
      if (px[3] > 0 && px[0] === this.fg.r && px[1] === this.fg.g && px[2] === this.fg.b) color = this.bg;
    }
    const s = new PixelStroke(pick.raster, pick.local, { ...this.brush, color, bg: { ...this.bg }, flow: this.brushFlow, aliased: !!opts.aliased || !!opts.square, square: !!opts.square, dabColor: this.tool === 'mixer' && pick.target !== 'mask' && this.brushMode !== 'erase' ? this.mixerSourceFor(p, pick.raster as Raster, pick.local) : null }, op, p.selection);
    s.dynamics = structuredClone(this.brushDynamics);
    if (this.pressureCurve) for (const o of [s.dynamics.size, s.dynamics.flow, s.dynamics.opacity]) for (const sn of o.sensors) if (sn.id === 'pressure' && !sn.curve) sn.curve = this.pressureCurve;
    if (this.brushSymmetry.mode !== 'off') s.symmetry = { ...this.brushSymmetry, cx: p.doc.width / 2, cy: p.doc.height / 2 };
    // Brush Settings (tip shape, shape dynamics, scattering, texture, dual brush); inactive, the stroke is as before.
    if (!opts.aliased) s.setShape(this.brushShape, this.brushShape.texture.on ? (patternById(this.brushShape.texture.pattern) ?? allPatterns()[0])?.surface ?? null : null);
    this.stroke = { project: p, layerId: pick.layer.id, target: pick.target, s };
    s.canGrow = (b) => !this.memoryBudget || this.memoryUse() + b <= this.memoryBudget;   // its window, within the budget (1.60.6)
    const last = this.lastBrush;
    if (shift && last && last.layerId === pick.layer.id && last.target === pick.target) s.to(last.p, pressure, pose);
    s.to(pt, pressure, pose);
    s.compose();
    this.emit('render', null);
    return true;
  }

  /** By default a stroke frame repaints only the region it changed;
   *  switched off, every frame redraws the whole scene. */
  dirtyRendering = true;

  strokeTo(pt: Pt, pressure = 1, pose: PenPose = UPRIGHT): void {
    const st = this.stroke;
    if (!st) return;
    st.s.to(pt, pressure, pose);
    this.strokeShow();
  }

  /** The Airbrush's tick (1.50.4, the tool audit): another dab where the pointer rests, building up. */
  airbrushTick(pressure = 1): void {
    const st = this.stroke;
    if (!st) return;
    st.s.stamp(pressure);
    this.strokeShow();
  }

  /** Composes what the stroke laid since last time and repaints that much. */
  private strokeShow(): void {
    const st = this.stroke;
    if (!st) return;
    const f = st.s.compose();
    if (!f) return;
    if (st.quick) { this.emit('selection', null); return; }   // Quick Mask: the tint follows the stroke; no layer repaints
    const l = st.project.layer(st.layerId), r = st.target === 'mask' ? l?.mask?.raster : l?.raster;
    const t = st.target === 'mask' ? (l?.mask?.placement ?? l?.transform) : l?.transform;
    // Styled layers' effects are cached at document resolution, so a region repaint shows them whole; the layer being
    // painted, clipped layers and layers in folders draw their effects per render, so those repaint whole.
    const styled = st.project.doc.layers.some((x) => effectsActive(x.effects) && (x.id === st.layerId || !!x.clipId || x.parentId !== null));
    if (!this.dirtyRendering || !l || !r || !t || styled) { this.emit('render', null); return; }
    const m = placement(t, r.width, r.height);
    const corners = [applyMat(m, f.x, f.y), applyMat(m, f.x + f.w, f.y), applyMat(m, f.x + f.w, f.y + f.h), applyMat(m, f.x, f.y + f.h)];
    this.emit('render', boundsOf(corners));
  }

  endStroke(): void {
    const st = this.stroke;
    if (!st) return;
    this.stroke = null;
    if (st.s.clipped) this.notice('The stroke stopped where it would have needed more memory than this computer allows formvis. Merge or delete layers, close a document, or paint in shorter strokes.');   // 1.60.6
    if (st.quick) {
      // Quick Mask: the painted coverage is the new selection, in this stroke's history step (the raster was temporary).
      st.s.commit();
      const W = st.quick.width, H = st.quick.height, d = ctxOf(st.quick.canvas).getImageData(0, 0, W, H).data, a = new Uint8Array(W * H);
      for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
      if (st.meet !== undefined) for (let i = 0; i < a.length; i++) if (a[i]) a[i] = Math.min(a[i], st.meet ? st.meet.valueAt(i % W, Math.floor(i / W)) : 0);
      st.project.selection = SelectionMask.cropped(0, 0, W, H, a);
      st.project.history.end(st.project.snapshot());
      st.s.release();
      this.emit('selection', null);
      this.refresh();
      return;
    }
    // A plain stroke on pixels in an 8-bit RGB document keeps its undo as the tiles it changed (1.60.7, DEV_PLAN 26.3);
    // healing, masks and deep, CMYK or Lab documents keep the whole patch, which their steps below read.
    const plain = !st.heal && !st.healFrom && st.target === 'pixels' && (st.project.doc.depth ?? 8) <= 8 && st.project.doc.mode !== 'cmyk' && st.project.doc.mode !== 'lab';
    if (plain) for (const t of st.s.commitTiles()) st.project.history.addPatch(t);
    const patch = plain ? null : st.heal === 'remove' ? this.removePatch(st.s) : st.heal ? this.healPatch(st.s, st.heal) : st.healFrom ? this.healFromPatch(st.s, st.healFrom) : st.s.commit();
    if (patch) st.project.history.addPatch(patch);
    // Cut where a giant layer's tiles were still on disk (1.62.5): said, and those tiles brought back to paint again.
    const miss = st.s.missing, mt = st.project.layer(st.layerId)?.tiled;
    if (miss && mt && this.undoStore) {
      void mt.ensure(miss.x, miss.y, miss.w, miss.h, this.undoStore).then(() => this.emit('render', null));
      this.notice('That stroke reached parts of the picture still on disk and stopped there; they are loading, so paint there again in a moment.');
    }
    if (st.target === 'pixels' && st.project.layer(st.layerId)?.shape) st.project.updateLayer(st.layerId, { shape: null });
    const dl = patch && st.target === 'pixels' && ((st.project.doc.depth ?? 8) > 8 || st.project.doc.mode === 'cmyk' || st.project.doc.mode === 'lab') ? st.project.layer(st.layerId) : null;
    const exact = (this.tool === 'brush' || this.tool === 'pencil' || this.tool === 'eraser') && !this.colourDynamics() && st.project.doc.depth !== 32;
    if (patch && exact && dl?.channels?.mode === 'rgb' && dl.raster === patch.raster) {
      const after = patch.raster.ctx.getImageData(patch.x, patch.y, patch.before.width, patch.before.height);
      const erasing = this.brushMode === 'erase' || this.tool === 'eraser', cover = erasing === (st.s.op === 'destination-out') ? st.s.coverFor(patch.x, patch.y, patch.before.width, patch.before.height) : null;
      st.project.updateLayer(st.layerId, { channels: strokeDeep(dl.channels, patch.before, after, patch.x, patch.y, erasing ? null : this.fg, this.bg, cover) });
    } else if (patch && exact && dl?.channels?.mode === 'cmyk' && dl.raster === patch.raster && st.project.cmykLut) {
      const after = patch.raster.ctx.getImageData(patch.x, patch.y, patch.before.width, patch.before.height);
      const r = strokeChannels(dl.channels, patch.before, after, patch.x, patch.y, this.brushMode === 'erase' || this.tool === 'eraser' ? null : this.fgInk, this.bgInk, st.project.cmykLut, this.paintChannel);
      after.data.set(r.region); patch.raster.ctx.putImageData(after, patch.x, patch.y); patch.raster.touch(); patch.after.data.set(r.region);
      st.project.updateLayer(st.layerId, { channels: r.channels });
    } else if (patch && exact && dl?.channels?.mode === 'lab' && this.paintLab !== null && dl.raster === patch.raster) {
      const after = patch.raster.ctx.getImageData(patch.x, patch.y, patch.before.width, patch.before.height), erasing = this.brushMode === 'erase' || this.tool === 'eraser';
      const r = strokeLabChannel(dl.channels, patch.before, after, patch.x, patch.y, erasing ? this.bgc : this.fgc, labGreyValue(erasing ? this.bgc : this.fgc), erasing, this.paintLab);
      after.data.set(r.region); patch.raster.ctx.putImageData(after, patch.x, patch.y); patch.raster.touch(); patch.after.data.set(r.region);
      st.project.updateLayer(st.layerId, { channels: r.channels });
    } else if (patch && dl?.channels && dl.raster === patch.raster) {
      const t = dl.channels.mode === 'cmyk' ? this.deriveTables(st.project) : null;
      if (dl.channels.mode !== 'cmyk' || t) {
        const after = patch.raster.ctx.getImageData(patch.x, patch.y, patch.before.width, patch.before.height);
        const linear = st.project.doc.depth === 32, ch = deriveRegion(dl.channels, patch.x, patch.y, patch.before, after, t, linear), img = renderRegion(ch, patch.x, patch.y, after.width, after.height, t ? t.out : null, linear);
        patch.raster.ctx.putImageData(img, patch.x, patch.y); patch.raster.touch(); patch.after.data.set(img.data);
        st.project.updateLayer(st.layerId, { channels: ch });
      }
    }
    st.project.history.end(st.project.snapshot());
    const lp = st.s.lastPoint;
    if (lp) this.lastBrush = { layerId: st.layerId, target: st.target, p: lp };   // shift-click draws a line from here
    this.refresh();
    st.s.release();
  }

  cancelStroke(): void {
    const st = this.stroke;
    if (!st) return;
    this.stroke = null;
    const snap = st.project.history.abort();
    if (snap) { st.project.doc = snap.doc; st.project.selection = snap.selection; }
    this.refresh();
    st.s.release();
  }

  private regionEdit(name: string, apply: (a: { raster: Raster; target: Target; rect: Rect; cover: Surface | null }) => void, region?: SelectionMask | null): void { IE.regionEdit(this.editHost, name, apply, region); }

  /** A pattern tiled from the raster's corner over `rect`, kept to `cover` (the Paint Bucket's Pattern source). */
  private patternTint(rect: Rect, tile: Surface, cover: Surface | null): Surface {
    const s = createSurface(rect.w, rect.h), c = ctxOf(s), fill = c.createPattern(tile as CanvasImageSource, 'repeat');
    if (fill) { c.translate(-rect.x, -rect.y); c.fillStyle = fill; c.fillRect(rect.x, rect.y, rect.w, rect.h); c.setTransform(1, 0, 0, 1, 0, 0); }
    if (cover) { c.globalCompositeOperation = 'destination-in'; c.drawImage(cover, 0, 0); }
    return s;
  }

  private tint(rect: Rect, style: string, cover: Surface | null): Surface { return IE.tint(rect, style, cover); }

  /** Edit > Fill: the selection, or the whole layer, filled with a colour or a pattern (tiled from the layer's corner)
   *  in a blend mode at an opacity, optionally keeping transparent pixels transparent, as one step. On a mask the
   *  colour's grey is used and patterns are refused. */
  /** The active layer as it was at the oldest kept history step, drawn in document space: its raster from that
   *  step's snapshot with every later patch on it written back, newest first. Null when the layer did not exist then. */
  private historySource(p: Project): Surface | null {
    const l = p.activeLayer;
    if (!l) return null;
    const { first, patches } = p.history.origin(this.historySourceIndex ?? 0), l0 =(first?.doc ?? p.doc).layers.find((x) => x.id === l.id), R0 = l0?.raster;
    if (!l0 || !R0) return null;
    const copy = createSurface(R0.width, R0.height), cc = ctxOf(copy);
    cc.drawImage(R0.canvas, 0, 0);
    for (let i = patches.length - 1; i >= 0; i--) if (patches[i].raster === R0) cc.putImageData(patches[i].before, patches[i].x, patches[i].y);
    const doc = createSurface(p.doc.width, p.doc.height), dc = ctxOf(doc);
    setMat(dc, placement(l0.transform, R0.width, R0.height));
    dc.drawImage(copy, 0, 0);
    return doc;
  }

  fillWith(contents: { color: RGB } | { patternId: ID } | { history: true }, blend: BlendMode, opacity: number, preserveTransparency: boolean, opts: { name?: string; region?: SelectionMask | null } = {}): void {
    const hist = 'history' in contents && this.current ? this.historySource(this.current) : null;
    if ('history' in contents && !hist) { this.notice('This layer did not exist at the oldest history step, so there is nothing to fill from.'); return; }
    const pat = 'patternId' in contents ? patternById(contents.patternId) : null;
    if ('patternId' in contents && !pat) { this.notice('That pattern is no longer available.'); return; }
    const rec: { f: SolidFill | null } = { f: null };   // a solid colour fill's recipe (36.18)
    const last0 = this.current?.history.last ?? null;
    this.regionEdit(opts.name ?? 'Fill', ({ raster, target, rect, cover }) => {
      const rc = raster.ctx;
      rc.save();
      rc.setTransform(1, 0, 0, 1, 0, 0);
      if (target === 'mask') {
        if (!('color' in contents)) { rc.restore(); return; }
        const t = this.tint(rect, '#ffffff', cover), v = luminance(contents.color);
        rc.globalAlpha = opacity;
        rc.globalCompositeOperation = 'destination-out';
        rc.drawImage(t, rect.x, rect.y);
        if (v > 0) { rc.globalCompositeOperation = 'lighter'; rc.globalAlpha = v * opacity; rc.drawImage(t, rect.x, rect.y); }
        rc.restore();
        return;
      }
      const s = createSurface(rect.w, rect.h), sc = ctxOf(s);
      if (hist) {
        const l = (this.current as Project).activeLayer as Layer;
        setMat(sc, mul(translation(-rect.x, -rect.y), invert(placement(l.transform, raster.width, raster.height))));
        sc.drawImage(hist, 0, 0);
        sc.setTransform(1, 0, 0, 1, 0, 0);
      } else {
        if (pat) { const cp = sc.createPattern(pat.surface, 'repeat'); if (cp) { cp.setTransform(new DOMMatrix().translate(-rect.x, -rect.y)); sc.fillStyle = cp; } }
        else if ('color' in contents) { sc.fillStyle = rgbCss(contents.color); rec.f = { color: contents.color, blend, opacity, preserve: preserveTransparency, w: rect.w, h: rect.h, cover }; }
        sc.fillRect(0, 0, rect.w, rect.h);
      }
      if (cover) { sc.globalCompositeOperation = 'destination-in'; sc.drawImage(cover, 0, 0); }
      const orig = createSurface(rect.w, rect.h), out = createSurface(rect.w, rect.h), oc = ctxOf(out);
      ctxOf(orig).putImageData(raster.read(rect.x, rect.y, rect.w, rect.h), 0, 0);
      oc.drawImage(orig, 0, 0);
      oc.globalAlpha = opacity;
      oc.globalCompositeOperation = compositeOp(blend);
      oc.drawImage(s, 0, 0);
      if (preserveTransparency) { oc.globalAlpha = 1; oc.globalCompositeOperation = 'destination-in'; oc.drawImage(orig, 0, 0); }
      rc.clearRect(rect.x, rect.y, rect.w, rect.h);
      rc.drawImage(out, rect.x, rect.y);
      rc.restore();
    }, opts.region);
    if (rec.f && this.current && this.current.history.last !== last0) this.keepFillAsRecipe(this.current, rec.f);
  }

  /** A solid fill's step made cheaper (DEV_PLAN 36.18): the pixels it left (`after`) are let go and redo works them out
   *  again from the step's `before` and the recipe (8 bits), or from the step's floats (16 and 32 bits, whose pixels
   *  are rendered from them). Done only when the pixels worked out equal those the fill left, byte for byte. */
  private keepFillAsRecipe(p: Project, f: SolidFill): void {
    const e = p.history.peekUndo(), q = e?.patches.length === 1 ? e.patches[0] : null;
    if (!e || !q || q.redo || q.lazy || q.paged || q.disk || !(q.raster instanceof Raster) || q.before.width !== f.w || q.before.height !== f.h) return;
    const deep = (p.doc.depth ?? 8) > 8;
    if (deep && (p.doc.mode ?? 'rgb') !== 'rgb') return;
    const redo = deep
      ? (): ImageData => { const ch = e.after.doc.layers.find((l) => l.raster === q.raster)?.channels; if (!ch) throw new Error('no floats'); return renderRegion(ch, q.x, q.y, f.w, f.h, null, p.doc.depth === 32); }
      : (): ImageData => solidFillPixels(q.before, f);
    try { if (!sameImage(redo(), q.after)) return; } catch { return; }
    q.after = new ImageData(1, 1);
    q.redo = redo;
  }

  /** Edit > Stroke (1.65.7): a band `width` pixels wide along the selection's edge (with no selection,
   *  along the edge of the active layer's pixels, each taken at half coverage), inside it, centred on it or outside it,
   *  each pixel covered as far as its centre lies within the band (the distance to the nearest pixel across the edge,
   *  less half a pixel), so a whole width on a straight edge is crisp; worked out over the edge's bounds grown by the
   *  width (past the canvas too, so an edge on the canvas's border is stroked inside it), and filled with `color` at
   *  `blend` and `opacity`, keeping the layer's transparency when `preserve`, as Edit > Fill fills. One Stroke step. */
  strokeSelection(o: { width: number; color: RGB; location: 'inside' | 'center' | 'outside'; blend: BlendMode; opacity: number; preserve: boolean }): void {
    const p = this.current, l = p?.activeLayer, sel = p?.selection ?? null;
    if (!p || !l) return;
    if (!sel && (!l.raster || l.isGroup)) { this.notice('Make a selection first, or choose a layer with pixels to stroke around.'); return; }
    const w = Math.max(1, Math.min(250, o.width)), b = sel ? sel.rect : transformBounds(l.transform), pad = Math.ceil(w) + 2;
    const R = { x: Math.floor(b.x) - pad, y: Math.floor(b.y) - pad, w: Math.ceil(b.w) + 2 * pad + 1, h: Math.ceil(b.h) + 2 * pad + 1 };
    if (R.w * R.h > LIMITS.pixels) { this.notice('That edge is too long to stroke here.'); return; }
    const c = ctxOf(createSurface(R.w, R.h));
    if (sel) c.drawImage(sel.surface() as CanvasImageSource, sel.x - R.x, sel.y - R.y);
    else if (l.raster) { setMat(c, mul(translation(-R.x, -R.y), placement(l.transform, l.raster.width, l.raster.height))); c.drawImage(l.raster.canvas as CanvasImageSource, 0, 0); }
    const d = c.getImageData(0, 0, R.w, R.h).data, inside = new Uint8Array(R.w * R.h), outside = new Uint8Array(R.w * R.h);
    for (let i = 0; i < inside.length; i++) { const on = d[i * 4 + 3] >= 128 ? 1 : 0; inside[i] = on; outside[i] = 1 - on; }
    const toOut = o.location === 'outside' ? null : distanceSquared(outside, R.w, R.h), toIn = o.location === 'inside' ? null : distanceSquared(inside, R.w, R.h);
    const reach = o.location === 'center' ? w / 2 : w, band = new Uint8Array(inside.length);
    let any = false;
    for (let i = 0; i < band.length; i++) {
      const dist = inside[i] ? (toOut ? Math.sqrt(toOut[i]) : Infinity) : (toIn ? Math.sqrt(toIn[i]) : Infinity);
      const v = Math.round(clamp(reach + 1 - dist, 0, 1) * 255);
      band[i] = v;
      if (v) any = true;
    }
    if (!any) { this.notice('There is no edge to stroke.'); return; }
    this.fillWith({ color: o.color }, o.blend, Math.max(0, Math.min(1, o.opacity)), o.preserve, { name: 'Stroke', region: SelectionMask.cropped(R.x, R.y, R.w, R.h, band) });
  }

  /** A mask feathered as Select > Modify > Feather feathers: a Gaussian of half the radius over its values, on the
   *  current document. Masks are trimmed to their pixels, so the blur runs over a region grown by its reach, clipped to
   *  the canvas. Used by Fill Path and by the Marquee and Lasso's Feather. The input is untouched. */
  featherMask(mask: SelectionMask, radius: number): SelectionMask | null {
    const p = this.current, f = Math.max(0, Math.min(250, radius));
    if (!p || !(f > 0)) return mask;
    const pad = Math.ceil(f * 1.5) + 2;
    const region = intersectRect({ x: mask.x - pad, y: mask.y - pad, w: mask.w + 2 * pad, h: mask.h + 2 * pad }, { x: 0, y: 0, w: p.doc.width, h: p.doc.height });
    if (!region) return mask;
    const img = new ImageData(region.w, region.h);
    for (let j = 0; j < region.h; j++) for (let i = 0; i < region.w; i++) { const k = (j * region.w + i) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = mask.valueAt(region.x + i, region.y + j); }
    const blurred = gaussianBlur(img, f / 2), out = new Uint8Array(region.w * region.h);
    for (let i = 0; i < out.length; i++) out[i] = blurred.data[i * 4 + 3];
    return SelectionMask.cropped(region.x, region.y, region.w, region.h, out);
  }

  /** Fill Path with its dialog's settings: the path's inside (its operations applied),
   *  anti-aliased or not and feathered by `feather` pixels, within any selection, filled as Edit > Fill fills
   *  (contents, mode, opacity, Preserve Transparency), as one Fill Path step. */
  fillPathWith(contents: { color: RGB } | { patternId: ID } | { history: true }, blend: BlendMode, opacity: number, preserve: boolean, feather: number, antialias: boolean): void {
    const p = this.current, vp = this.workPath, b = vp ? pathBounds(vp) : null;
    if (!p || !vp || !b) { this.notice('Draw a path with the Pen tool first.'); return; }
    const W = p.doc.width, H = p.doc.height, f = Math.max(0, Math.min(250, feather));
    let mask = SelectionMask.fromPath(W, H, b, (c) => fillVector(c as CanvasRenderingContext2D, vp), antialias);
    if (mask && f > 0) mask = this.featherMask(mask, f);
    if (mask && p.selection) mask = mask.combine(p.selection, 'intersect');
    if (!mask) { this.notice('The path lies outside the canvas or the selection.'); return; }
    this.fillWith(contents, blend, opacity, preserve, { name: 'Fill Path', region: mask });
  }

  /** Filter > Liquify's OK: the active layer's pixels resampled through `field` (built over this layer's raster by
   *  the Liquify dialog), within the selection's bounds when there is one, as one step. */
  applyLiquify(layerId: ID, field: LiquifyField): void {
    const p = this.current;
    if (!p || p.activeId !== layerId) return;
    this.regionEdit('Liquify', ({ raster, target, rect }) => {
      if (target !== 'pixels') return;
      const g = field.gw - 1, h = field.gh - 1;
      if (g < Math.ceil(raster.width / field.cell) || h < Math.ceil(raster.height / field.cell)) return;
      raster.ctx.putImageData(liquifyImage(raster.read(), field), 0, 0, rect.x, rect.y, rect.w, rect.h);
    });
  }

  fill(which: 'fg' | 'bg'): void { PO.fill(this.paintHost, which); }

  /** The Background Eraser (E; 1.49.5, the owner's tool list): erases, within the brush, the pixels of
   *  the active layer whose colour is within Tolerance of the colour sampled under the brush's centre (at every dab, or
   *  once at the start), feathered by the brush's hardness; Contiguous keeps to the matching pixels joined to the centre;
   *  Protect Foreground Color keeps the foreground's; the selection bounds it. The whole stroke is one step. */
  private bgErase: { p: Project; raster: Raster; local: Mat; full: ImageData; touched: Rect | null; sample: RGB | null; last: Pt; opts: BgEraseOpts } | null = null;
  beginBackgroundErase(pt: Pt, opts: BgEraseOpts): boolean {
    const p = this.current;
    if (!p || this.stroke || this.bgErase) return false;
    this.settle();
    if (!this.paintable(p.activeLayer)) { this.notice('Select a pixel layer to erase.'); return false; }
    if (this.smartLocked(p)) return false;
    const pick = this.target(p);
    if (!pick || pick.target !== 'pixels') { this.notice('The Background Eraser works on a layer\'s pixels, not its mask.'); return false; }
    p.history.begin('Background Eraser', p.snapshot());
    this.bgErase = { p, raster: pick.raster, local: pick.local, full: pick.raster.ctx.getImageData(0, 0, pick.raster.width, pick.raster.height), touched: null, sample: null, last: pt, opts };
    this.bgDab(pt);
    return true;
  }
  backgroundEraseTo(pt: Pt): void {
    const b = this.bgErase;
    if (!b) return;
    const d = Math.hypot(pt.x - b.last.x, pt.y - b.last.y), step = Math.max(1, this.brush.diameter / 6), n = Math.max(1, Math.ceil(d / step));
    for (let i = 1; i <= n; i++) this.bgDab({ x: b.last.x + ((pt.x - b.last.x) * i) / n, y: b.last.y + ((pt.y - b.last.y) * i) / n });
    b.last = pt;
    this.emit('render', null);
    this.refresh();
  }
  endBackgroundErase(cancel = false): void {
    const b = this.bgErase;
    if (!b) return;
    this.bgErase = null;
    const r = b.touched;
    if (r) {
      const before = new ImageData(r.w, r.h);
      for (let y = 0; y < r.h; y++) before.data.set(b.full.data.subarray(((r.y + y) * b.full.width + r.x) * 4, ((r.y + y) * b.full.width + r.x + r.w) * 4), y * r.w * 4);
      if (cancel) { b.raster.ctx.putImageData(before, r.x, r.y); b.raster.touch(); }
      else b.p.history.addPatch({ raster: b.raster, x: r.x, y: r.y, before, after: b.raster.read(r.x, r.y, r.w, r.h) });
    }
    b.p.history.end(b.p.snapshot());
    this.refresh();
  }
  private bgDab(pt: Pt): void {
    const b = this.bgErase as NonNullable<Engine['bgErase']>, raster = b.raster, W = raster.width, H = raster.height;
    const inv = invert(b.local) ?? [1, 0, 0, 1, 0, 0], c = applyMat(inv, pt.x, pt.y), r = Math.max(0.5, this.brush.diameter / 2);
    const x0 = Math.max(0, Math.floor(c.x - r)), y0 = Math.max(0, Math.floor(c.y - r)), x1 = Math.min(W, Math.ceil(c.x + r) + 1), y1 = Math.min(H, Math.ceil(c.y + r) + 1);
    if (x1 <= x0 || y1 <= y0) return;
    const w = x1 - x0, h = y1 - y0, img = raster.ctx.getImageData(x0, y0, w, h), d = img.data;
    const cx = Math.min(w - 1, Math.max(0, Math.floor(c.x) - x0)), cy = Math.min(h - 1, Math.max(0, Math.floor(c.y) - y0)), ci = (cy * w + cx) * 4;
    if (b.opts.sampling === 'continuous' || !b.sample) { if (d[ci + 3] === 0 && b.sample) { /* keep the last colour over erased pixels */ } else b.sample = { r: d[ci], g: d[ci + 1], b: d[ci + 2] }; }
    const s = b.sample, tol = b.opts.tolerance, fg = this.fg, hard = Math.max(0, Math.min(1, this.brush.hardness)), sel = b.p.selection;
    const matches = (i: number): boolean => d[i + 3] > 0 && Math.max(Math.abs(d[i] - s.r), Math.abs(d[i + 1] - s.g), Math.abs(d[i + 2] - s.b)) <= tol
      && !(b.opts.protectForeground && Math.max(Math.abs(d[i] - fg.r), Math.abs(d[i + 1] - fg.g), Math.abs(d[i + 2] - fg.b)) <= tol);
    // Which pixels the dab may reach: every match in the circle, or (Contiguous) those joined to the centre.
    const reach = new Uint8Array(w * h);
    const inCircle = (x: number, y: number): boolean => Math.hypot(x + x0 + 0.5 - c.x, y + y0 + 0.5 - c.y) <= r;
    if (b.opts.contiguous) {
      if (matches(ci) && inCircle(cx, cy)) {
        const stack = [cy * w + cx]; reach[cy * w + cx] = 1;
        while (stack.length) {
          const k = stack.pop() as number, x = k % w, y = (k - x) / w;
          for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const nk = ny * w + nx;
            if (!reach[nk] && inCircle(nx, ny) && matches(nk * 4)) { reach[nk] = 1; stack.push(nk); }
          }
        }
      }
    } else for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inCircle(x, y) && matches((y * w + x) * 4)) reach[y * w + x] = 1;
    let any = false;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!reach[y * w + x]) continue;
      const dist = Math.hypot(x + x0 + 0.5 - c.x, y + y0 + 0.5 - c.y) / r;
      let k = dist <= hard ? 1 : Math.max(0, (1 - dist) / Math.max(1e-6, 1 - hard));
      if (sel) { const q = applyMat(b.local, x + x0 + 0.5, y + y0 + 0.5), sx = Math.floor(q.x) - sel.x, sy = Math.floor(q.y) - sel.y; k *= sx < 0 || sy < 0 || sx >= sel.w || sy >= sel.h ? 0 : sel.data[sy * sel.w + sx] / 255; }
      if (k <= 0) continue;
      const i = (y * w + x) * 4;
      d[i + 3] = Math.round(d[i + 3] * (1 - k));
      any = true;
    }
    if (!any) return;
    raster.ctx.putImageData(img, x0, y0);
    raster.touch();
    b.touched = unionRect(b.touched, { x: x0, y: y0, w, h });
  }

  /** The Magic Eraser (E; 1.49.5, the owner's tool list): the area the Magic Wand would select at a
   *  point (with the eraser's own Tolerance, Contiguous and Sample All Layers) made transparent on the active layer, the
   *  selection left as it was; one step. */
  magicErase(pt: Pt, settings: { tolerance: number; contiguous: boolean; sampleAll: boolean }): void {
    const p = this.current;
    if (!p || !this.paintable(p.activeLayer)) { this.notice('Select a pixel layer to erase.'); return; }
    const before = p.selection, wand = this.wand;
    p.history.begin('Magic Eraser', p.snapshot());
    this.wand = { ...wand, ...settings };
    try {
      this.magicWand(pt, 'replace');
      if (p.selection && p.selection !== before) this.clearPixels();
    } finally {
      this.wand = wand;
      p.selection = before;
      p.history.end(p.snapshot());
      this.emit('selection', null);
      this.refresh();
    }
  }

  clearPixels(): void { SO.clearPixels(this.selectHost); }

  invertPixels(): void { SO.invertPixels(this.selectHost); }

  applySelection(next: SelectionMask | null, mode: SelectionMode, name: string): void { SO.applySelection(this.selectHost, next, mode, name); }

  private readonly lastSelections = new WeakMap<Project, SelectionMask>();

  /** Select > Reselect: the selection the last Deselect dropped, back as one step. */
  get canReselect(): boolean { const p = this.current; return !!p && !p.selection && this.lastSelections.has(p); }
  reselect(): void { const p = this.current, s = p ? this.lastSelections.get(p) : undefined; if (p && s && !p.selection) this.applySelection(s, 'replace', 'Reselect'); }

  /** The open documents a selection can be saved to or loaded from: this one first, then the others of its size. */
  alphaDocuments(): Project[] {
    const p = this.current;
    return p ? [p, ...this.projects.filter((q) => q !== p && q.doc.width === p.doc.width && q.doc.height === p.doc.height)] : [];
  }

  /** Select > Save Selection (1.65.1): the selection as a new alpha channel of `doc`, or into `channel` by `op`; one step. */
  saveSelection(opts: { doc?: ID; channel?: ID | null; name?: string; op?: SelectionMode } = {}): ID | null {
    const p = this.current;
    if (!p) return null;
    this.settle();
    const sel = p.selection, q = opts.doc ? this.alphaDocuments().find((d) => d.id === opts.doc) : p;
    if (!sel || !q) return null;
    if (q.doc.width > CANVAS_SIDE || q.doc.height > CANVAS_SIDE || q.doc.width * q.doc.height > CANVAS_PIXELS) { this.notice('Alpha channels are kept only in documents within one canvas for now.'); return null; }
    const list = q.doc.alphas ?? [], old = opts.channel ? list.find((a) => a.id === opts.channel) : undefined, name = (opts.name ?? '').trim().slice(0, 200), op = opts.op ?? 'replace';
    if (opts.channel && !old) return null;
    const id = old?.id ?? uid();
    const ok = this.editOn(q, 'Save Selection', () => {
      if (!old) { q.doc = { ...q.doc, alphas: [...list, { id, name: name || nextAlphaName(list), mask: sel }] }; return true; }
      const mask = old.mask ? old.mask.combine(sel, op) : op === 'replace' || op === 'add' ? sel : null;
      q.doc = { ...q.doc, alphas: list.map((a) => (a === old ? { ...a, name: name || a.name, mask } : a)) };
      return true;
    });
    return ok ? id : null;
  }

  /** One Calculations source as a document-sized grey (1.68.1): `layer` (an id or name; Merged or left out is the whole
   *  picture) read through `channel` (gray, red, green, blue, transparency, or an alpha channel's id or name). */
  private calcGrey(cur: Project, s: CalcSource): Uint8Array | null {
    let p = cur;
    if (s.doc && s.doc !== cur.doc.id && s.doc !== cur.id) {
      const other = this.projects.find((q) => q.id === s.doc || q.doc.id === s.doc);   // the project's id or its document's
      if (!other || other.doc.width !== cur.doc.width || other.doc.height !== cur.doc.height) { this.notice('The source document must be the same size.', 'error'); return null; }
      p = other;
    }
    const W = p.doc.width, H = p.doc.height, ch = (s.channel ?? 'gray').trim();
    const alpha = (p.doc.alphas ?? []).find((a) => a.id === ch || a.name === ch);
    let g: Uint8Array;
    if (alpha) {
      g = new Uint8Array(W * H);
      const m = alpha.mask;
      if (m) for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) { const dx = m.x + x, dy = m.y + y; if (dx >= 0 && dy >= 0 && dx < W && dy < H) g[dy * W + dx] = m.data[y * m.w + x]; }
    } else {
      const key = ch.toLowerCase() as CalcColorChannel, ref = (s.layer ?? '').trim();
      if (!CALC_COLOR_CHANNELS.includes(key)) return null;
      let surf: Surface | null;
      const foreign = p !== cur;
      if (!ref || ref.toLowerCase() === 'merged') surf = foreign ? this.flattenedOf(p) : this.flattened();
      else {
        const l = p.doc.layers.find((x) => x.id === ref || x.name === ref);
        surf = !l ? null : foreign ? renderDoc(this.work, { ...p.doc, layers: [{ ...l, visible: true }] }) : this.renderLayerAlone(l.id);
      }
      if (!surf) return null;
      const d = ctxOf(surf).getImageData(0, 0, W, H).data;
      g = channelOf(d, key);
    }
    return s.invert ? invertGrey(g) : g;
  }

  /** Image > Calculations (DEV_PLAN 31.2b, 1.68.1): Source 1 blended onto Source 2 by `mode` (Add and Subtract take
   *  `scale` 1 to 2 and `offset`), at `opacity` 0 to 1 and through an optional `mask` (an alpha channel), into a new alpha
   *  channel (one step, "Calculations"), a new grey-as-RGB document, or the selection (one step). Both sources are of the
   *  current document, so the same pixel size. */
  /** The shared core of calculations() and calculationsPreview(): the blended grey at document size, or null (with a notice). */
  private calcCore(p: Project, o: CalcOptions): Uint8Array | null {
    const mode = o.mode ?? 'normal';
    if (!CALC_MODES.includes(mode)) { this.notice('Calculations: unknown blending mode.', 'error'); return null; }
    const a = this.calcGrey(p, o.source1), b = this.calcGrey(p, o.source2);
    if (!a || !b) return null;
    let mask: Uint8Array | null = null;
    if (o.mask) { mask = this.calcGrey(p, { channel: o.mask }); if (!mask) { this.notice('Calculations: the mask channel was not found.', 'error'); return null; } }
    return blendGreys(b, a, { mode, opacity: o.opacity ?? 1, scale: o.scale ?? 1, offset: o.offset ?? 0, mask });
  }

  /** The Calculations result as grey RGBA ImageData scaled to fit within `max` px (220 by default); changes nothing. */
  calculationsPreview(o: CalcOptions, max = 220): ImageData | null {
    const p = this.current;
    if (!p) return null;
    let g: Uint8Array | null;
    this.quiet = true;
    try { g = this.calcCore(p, o); } finally { this.quiet = false; }
    if (!g) return null;
    const W = p.doc.width, H = p.doc.height, k = Math.min(1, max / Math.max(W, H));
    const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k)), out = new ImageData(w, h), d = out.data;
    for (let y = 0; y < h; y++) {
      const sy = Math.min(H - 1, Math.floor((y + 0.5) / k));
      for (let x = 0; x < w; x++) {
        const v = g[sy * W + Math.min(W - 1, Math.floor((x + 0.5) / k))], i = (y * w + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
      }
    }
    return out;
  }

  calculations(o: CalcOptions): { channel?: ID; project?: Project; selection?: boolean } | null {
    const p = this.current;
    if (!p) return null;
    this.settle();
    const W = p.doc.width, H = p.doc.height, result = o.result ?? 'channel';
    const g = this.calcCore(p, o);
    if (!g) { this.notice('Calculations: a source layer or channel was not found.', 'error'); return null; }
    if (result === 'document') {
      const q = this.newDocument(W, H, (o.name ?? '').trim() || 'Calculations', 'white');
      const id = q?.doc.layers[0]?.id;
      if (!q || !id) return null;
      const px = new Uint8ClampedArray(W * H * 4);
      for (let i = 0; i < g.length; i++) { px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = g[i]; px[i * 4 + 3] = 255; }
      this.replaceLayerPixels(id, new ImageData(px, W, H), 'Calculations');
      return { project: q };
    }
    const sel = SelectionMask.cropped(0, 0, W, H, g);
    if (result === 'selection') { this.applySelection(sel, 'replace', 'Calculations'); return { selection: !!sel }; }
    if (W > CANVAS_SIDE || H > CANVAS_SIDE || W * H > CANVAS_PIXELS) { this.notice('Alpha channels are kept only in documents within one canvas for now.'); return null; }
    const list = p.doc.alphas ?? [], id = uid(), name = (o.name ?? '').trim().slice(0, 200);
    const ok = this.editOn(p, 'Calculations', () => { p.doc = { ...p.doc, alphas: [...list, { id, name: name || nextAlphaName(list), mask: sel }] }; return true; });
    return ok ? { channel: id } : null;
  }

  /** Select > Load Selection (1.65.1): an alpha channel, or the active layer's transparency or mask, by `mode`; one step. */
  loadSelection(source: { doc?: ID; channel: ID | 'transparency' | 'mask' | 'vector' }, invert = false, mode: SelectionMode = 'replace'): void {
    const p = this.current, q = source.doc ? this.alphaDocuments().find((d) => d.id === source.doc) : p;
    if (!p || !q) return;
    let m: SelectionMask | null;
    if (source.channel === 'vector') {
      const v = q.activeLayer?.vectorMask;
      if (!v) return;
      const W = q.doc.width, H = q.doc.height, cov = vectorCoverage(v, W, H);
      m = cov ? SelectionMask.fromAlpha(0, 0, W, H, ctxOf(cov.surface).getImageData(0, 0, W, H).data) : SelectionMask.all(W, H);
    } else if (source.channel === 'transparency' || source.channel === 'mask') {
      const l = q.activeLayer;
      if (!l) return;
      m = this.coverage(q, l, source.channel === 'mask');
    } else {
      const a = q.doc.alphas?.find((x) => x.id === source.channel);
      if (!a) return;
      m = a.mask;
    }
    if (invert) m = m ? m.inverted(p.doc.width, p.doc.height) : SelectionMask.all(p.doc.width, p.doc.height);
    if (!m && (mode === 'replace' || mode === 'add')) this.notice('That channel selects nothing.');
    this.applySelection(m, mode, 'Load Selection');
  }

  /** Layer `l`'s opacity, or with `mask` its mask's white, over the document as a selection. */
  private coverage(p: Project, l: Layer, mask: boolean): SelectionMask | null {
    const W = p.doc.width, H = p.doc.height, r = mask ? l.mask?.raster ?? null : l.raster, t = mask ? l.mask?.placement ?? l.transform : l.transform;
    if (mask ? !!l.mask && !r : !r && !!l.adjustment) return SelectionMask.all(W, H);
    const b = r ? intersectRect(integral(transformBounds(t)), { x: 0, y: 0, w: W, h: H }) : null;
    if (!r || !b) return null;
    const c = ctxOf(createSurface(b.w, b.h));
    setMat(c, mul(translation(-b.x, -b.y), placement(t, r.width, r.height)));
    c.drawImage(r.canvas, 0, 0);
    return SelectionMask.fromAlpha(b.x, b.y, b.w, b.h, c.getImageData(0, 0, b.w, b.h).data);
  }

  /** The Channels panel's delete and rename of alpha channel `id`, each one step. */
  deleteAlpha(id: ID): void {
    this.edit('Delete Channel', (p) => { const list = p.doc.alphas ?? []; if (!list.some((a) => a.id === id)) return false; p.doc = { ...p.doc, alphas: list.filter((a) => a.id !== id) }; return true; });
  }
  renameAlpha(id: ID, name: string): void {
    const n = name.trim().slice(0, 200);
    if (n) this.edit('Rename Channel', (p) => { const list = p.doc.alphas ?? [], a = list.find((x) => x.id === id); if (!a || a.name === n) return false; p.doc = { ...p.doc, alphas: list.map((x) => (x === a ? { ...a, name: n } : x)) }; return true; });
  }

  /** Channels panel New Channel: an empty alpha channel, filled `black` (nothing selected) or `white` (all selected); one step. Returns its id. */
  newAlpha(opts: { fill?: 'black' | 'white'; name?: string } = {}): ID | null {
    const p = this.current;
    if (!p) return null;
    const W = p.doc.width, H = p.doc.height;
    if (W > CANVAS_SIDE || H > CANVAS_SIDE || W * H > CANVAS_PIXELS) { this.notice('Alpha channels are kept only in documents within one canvas for now.'); return null; }
    const id = uid(), name = (opts.name ?? '').trim().slice(0, 200);
    const ok = this.edit('New Channel', (q) => { const list = q.doc.alphas ?? []; q.doc = { ...q.doc, alphas: [...list, { id, name: name || nextAlphaName(list), mask: opts.fill === 'white' ? SelectionMask.all(W, H) : null }] }; return true; });
    return ok ? id : null;
  }

  /** Duplicate Channel: a copy of alpha channel `id`, named "<name> copy" unless `name` is given, right after it; one step. */
  duplicateAlpha(id: ID, name?: string): ID | null {
    const copy = uid();
    const ok = this.edit('Duplicate Channel', (p) => {
      const list = p.doc.alphas ?? [], i = list.findIndex((x) => x.id === id);
      if (i < 0) return false;
      const a = list[i], n = (name ?? '').trim().slice(0, 200) || `${a.name} copy`;
      p.doc = { ...p.doc, alphas: [...list.slice(0, i + 1), { ...a, id: copy, name: n }, ...list.slice(i + 1)] };
      return true;
    });
    return ok ? copy : null;
  }

  /** Moves alpha channel `id` to `to` (an index in the channel list, clamped), or by one place with a `by` of -1 or 1; one step. */
  moveAlpha(id: ID, to: number, relative = false): boolean {
    return this.edit('Move Channel', (p) => {
      const list = [...(p.doc.alphas ?? [])], i = list.findIndex((x) => x.id === id);
      if (i < 0) return false;
      const j = Math.max(0, Math.min(list.length - 1, relative ? i + to : to));
      if (j === i) return false;
      list.splice(j, 0, ...list.splice(i, 1));
      p.doc = { ...p.doc, alphas: list };
      return true;
    });
  }

  /** Channel Options: name, what the overlay colour marks, the colour and its opacity in percent; one step. */
  setAlphaOptions(id: ID, o: { name?: string; color?: RGB; opacity?: number; indicates?: 'masked' | 'selected' }): boolean {
    return this.edit('Channel Options', (p) => {
      const list = p.doc.alphas ?? [], a = list.find((x) => x.id === id);
      if (!a) return false;
      const name = o.name === undefined ? a.name : o.name.trim().slice(0, 200) || a.name;
      const next: AlphaChannel = { ...a, name, color: o.color ? { r: clamp(Math.round(o.color.r), 0, 255), g: clamp(Math.round(o.color.g), 0, 255), b: clamp(Math.round(o.color.b), 0, 255) } : a.color, opacity: o.opacity === undefined ? a.opacity : clamp(Math.round(o.opacity), 0, 100), indicates: o.indicates ?? a.indicates };
      if (next.name === a.name && next.opacity === a.opacity && next.indicates === a.indicates && JSON.stringify(next.color) === JSON.stringify(a.color)) return false;
      p.doc = { ...p.doc, alphas: list.map((x) => (x === a ? next : x)) };
      return true;
    });
  }

  /** Select > Load Luminosity: the picture's brightness (Rec. 601 grey times coverage) as a selection by `mode`; one step. */
  loadLuminosity(mode: SelectionMode = 'replace'): void {
    const src = this.current ? this.flattened() : null;
    if (!src) return;
    const W = src.width, H = src.height, d = (src.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, W, H).data, mask = new Uint8Array(W * H);
    for (let i = 0, j = 0; j < mask.length; i += 4, j++) mask[j] = Math.round(((0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * d[i + 3]) / 255);
    this.applySelection(SelectionMask.cropped(0, 0, W, H, mask), mode, 'Load Selection');
  }

  /** The alpha channels the Channels panel shows over the image in red, per document; the view only. */
  private readonly alphaViews = new WeakMap<Project, Set<ID>>();
  shownAlphas(p: Project): AlphaChannel[] { const v = this.alphaViews.get(p); return v?.size ? (p.doc.alphas ?? []).filter((a) => v.has(a.id)) : []; }
  /** The alpha channel a channel command acts on: the one named or identified by `ref`, else the one shown last, else the last in the list. */
  alphaFor(ref?: string): AlphaChannel | undefined {
    const p = this.current, list = p?.doc.alphas ?? [];
    if (!p || !list.length) return undefined;
    if (ref) return list.find((a) => a.id === ref || a.name === ref);
    const last = [...(this.alphaViews.get(p) ?? [])].pop();
    return list.find((a) => a.id === last) ?? list[list.length - 1];
  }
  /** `id` shown or hidden over the image; null with `on` false hides them all. */
  showAlpha(id: ID | null, on: boolean): void {
    const p = this.current;
    if (!p) return;
    const v = this.alphaViews.get(p) ?? new Set<ID>();
    if (id !== null && on && v.has(id) && [...v].pop() !== id) v.delete(id);   // the one clicked last is the one channel commands act on
    if (id === null ? !v.size : v.has(id) === on) return;
    if (id === null) v.clear(); else if (on) v.add(id); else v.delete(id);
    this.alphaViews.set(p, v);
    this.emit('overlay', null);
  }

  /** Select > Grow and Similar: pixels within the Magic Wand's tolerance of the range of each channel and alpha among
   *  the selected pixels, joined to the selection (Grow, four-connected) or anywhere (Similar), sampled as the Magic
   *  Wand samples (the active layer, or all layers). One step. */
  growSelection(contiguous: boolean): void {
    const p = this.current, sel = p?.selection;
    if (!p || !sel) return;
    const W = p.doc.width, H = p.doc.height;
    let surface: Surface;
    if (this.wand.sampleAll) surface = renderDoc(this.work, p.doc);
    else {
      const l = p.activeLayer;
      if (!l) { this.notice('Select a layer first.'); return; }
      surface = createSurface(W, H);
      if (l.raster) { const c = ctxOf(surface); setMat(c, placement(l.transform, l.raster.width, l.raster.height)); c.drawImage(l.raster.canvas, 0, 0); }
    }
    const d = ctxOf(surface).getImageData(0, 0, W, H).data, n = W * H, on = new Uint8Array(n), lo = [255, 255, 255, 255], hi = [0, 0, 0, 0], tol = this.wand.tolerance;
    let any = false;
    for (let y = Math.max(0, sel.y); y < Math.min(H, sel.y + sel.h); y++) for (let x = Math.max(0, sel.x); x < Math.min(W, sel.x + sel.w); x++) {
      if (sel.data[(y - sel.y) * sel.w + x - sel.x] < 128) continue;
      const i = y * W + x;
      on[i] = 1; any = true;
      for (let c = 0; c < 4; c++) { const v = d[i * 4 + c]; if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; }
    }
    if (!any) { this.notice(`${contiguous ? 'Grow' : 'Similar'} needs pixels at least half selected.`); return; }
    const inside = (i: number): boolean => { for (let c = 0; c < 4; c++) { const v = d[i * 4 + c]; if (v < lo[c] - tol || v > hi[c] + tol) return false; } return true; };
    if (contiguous) {
      const stack: number[] = [];
      for (let i = 0; i < n; i++) if (on[i]) stack.push(i);
      while (stack.length) {
        const i = stack.pop() as number, x = i % W;
        for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < n && !on[j] && inside(j)) { on[j] = 1; stack.push(j); }
      }
    } else for (let i = 0; i < n; i++) if (!on[i] && inside(i)) on[i] = 1;
    const hard = new Uint8Array(n);
    for (let i = 0; i < n; i++) hard[i] = on[i] ? 255 : 0;
    this.applySelection(SelectionMask.cropped(0, 0, W, H, this.wand.antialias ? antialiasMask(hard, W, H) : hard), 'replace', contiguous ? 'Grow' : 'Similar');
  }

  /** Select > Convert to Shape: the selection's outline (where at least half selected), simplified within 1.5 px and
   *  smoothed except at its corners, as a shape layer in the foreground colour. One step. */
  selectionToShape(): void {
    const p = this.current, sel = p?.selection;
    if (!p || !sel) return;
    const subpaths = this.tracedOutline(sel.data, sel.w, sel.h, sel.x, sel.y);
    if (!subpaths.length) { this.notice('The selection is too small to make a shape.'); return; }
    const path: VectorPath = { subpaths }, look: ShapeStyle = { fill: { ...this.fg }, stroke: null }, r = this.renderShape(path, look);
    if (!r) return;
    let k = 1;
    while (p.doc.layers.some((l) => l.name === `Shape ${k}`)) k++;
    this.insertRasterLayer(r.raster, `Shape ${k}`, r.x, r.y, { vector: { path, fill: look.fill, stroke: look.stroke, origin: { x: r.x, y: r.y } } }, 'Convert to Shape');
  }

  /** The outline of coverage `data` (`w` by `h` at `x`, `y`, at least half covered), each loop simplified within 1.5 of
   *  its units and smoothed except at its corners, holes wound against their outer loops. */
  private tracedOutline(data: Uint8Array, w: number, h: number, x: number, y: number): SubPath[] {
    const loops: Pt[][] = [];
    traceOutline(data, w, h, x, y, 128, {
      moveTo: (x: number, y: number) => { loops.push([{ x, y }]); },
      lineTo: (x: number, y: number) => { loops[loops.length - 1]?.push({ x, y }); },
      closePath: () => undefined,
      rect: (x: number, y: number, w: number, h: number) => { loops.push([{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]); },
    });
    const subpaths: SubPath[] = [];
    for (const raw of loops) {
      const pts = raw.length > 1 && raw[0].x === raw[raw.length - 1].x && raw[0].y === raw[raw.length - 1].y ? raw.slice(0, -1) : raw;
      if (pts.length < 3) continue;
      const kept = simplify([...pts, pts[0]], 1.5).slice(0, -1);
      if (kept.length < 3) continue;
      const corners = new Set<number>();
      kept.forEach((q, i) => {
        const a = kept[(i - 1 + kept.length) % kept.length], b = kept[(i + 1) % kept.length];
        const ux = q.x - a.x, uy = q.y - a.y, vx = b.x - q.x, vy = b.y - q.y, l = Math.hypot(ux, uy) * Math.hypot(vx, vy);
        if (l && (ux * vx + uy * vy) / l < Math.cos(Math.PI / 3.5)) corners.add(i);
      });
      subpaths.push({ closed: true, anchors: smoothAnchors(kept, true, corners) });
    }
    return subpaths;
  }

  /** Select > Find Layers: the layers whose names hold `text` (any case) selected, the top one active. */
  findLayers(text: string): number {
    const p = this.current, q = text.trim().toLowerCase();
    if (!p || !q) return 0;
    const found = hierarchy(p.doc, true).map((e) => e.layer).filter((l) => l.name.toLowerCase().includes(q));
    if (!found.length) { this.notice(`No layer's name holds "${text.trim()}".`); return 0; }
    this.settle();
    p.activeId = found[0].id;
    p.selectedIds = new Set(found.map((l) => l.id));
    p.maskTarget = false;
    for (const l of found) for (const a of ancestors(byId(p.doc), l)) p.collapsed.delete(a.id);
    this.emit('active', null);
    this.emit('doc', null);
    this.emit('overlay', null);
    return found.length;
  }

  selectAll(): void { if (this.current) this.applySelection(SelectionMask.all(this.current.doc.width, this.current.doc.height), 'replace', 'Select All'); }
  deselect(): void { if (this.current?.selection) this.applySelection(null, 'replace', 'Deselect'); }
  invertSelection(): void { this.edit('Inverse Selection', (p) => { if (!p.selection) return false; p.selection = p.selection.inverted(p.doc.width, p.doc.height); }); }

  selectLayerPixels(id?: ID): void { SO.selectLayerPixels(this.selectHost, id); }

  /** Paint Bucket: the area of similar colour around `pt`, found as Magic Wand finds it with the bucket's own settings,
   *  its edge softened by a pixel when anti-aliased, kept within any selection, filled with the foreground colour at the
   *  bucket's opacity; one undo step. */
  paintBucket(pt: Pt): void {
    const p = this.current;
    if (!p) return;
    const { width: W, height: H } = p.doc;
    const x = Math.floor(pt.x), y = Math.floor(pt.y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    if (p.selection && p.selection.valueAt(x, y) <= 0) { this.notice('Click inside the selection to fill; the Paint Bucket fills only there.'); return; }
    let surface: Surface;
    if (this.bucket.sampleAll) surface = renderDoc(this.work, p.doc);
    else {
      const l = p.activeLayer;
      if (!l) { this.notice('Select a layer first.'); return; }
      surface = createSurface(W, H);   // an empty layer is transparent, and fills (1.50.2)
      if (l.raster) {
        const c = ctxOf(surface);
        setMat(c, placement(l.transform, l.raster.width, l.raster.height));
        c.drawImage(l.raster.canvas, 0, 0);
      }
    }
    const data = ctxOf(surface).getImageData(0, 0, W, H).data;
    let mask = wandMask(data, W, H, x, y, this.bucket.tolerance, this.bucket.contiguous, 0);
    if (this.bucket.antiAlias) {
      const soft = new Uint8Array(mask.length);
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const o = j * W + i, v = mask[o];
        const edge = (i > 0 && mask[o - 1] !== v) || (i < W - 1 && mask[o + 1] !== v) || (j > 0 && mask[o - W] !== v) || (j < H - 1 && mask[o + W] !== v);
        if (!edge) { soft[o] = v; continue; }
        let s = 0, n = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < W && jj < H) { s += mask[jj * W + ii]; n++; } }
        soft[o] = Math.round(s / n);
      }
      mask = soft;
    }
    let region: SelectionMask | null = SelectionMask.cropped(0, 0, W, H, mask);
    if (p.selection && region) region = p.selection.combine(region, 'intersect');
    if (!region) { this.notice('The area clicked is outside the selection.'); return; }
    const color = this.fg, alpha = this.bucket.opacity;
    this.regionEdit('Paint Bucket', ({ raster, target, rect, cover }) => {
      const c = raster.ctx;
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalAlpha = alpha;
      if (target === 'mask') {
        const t = this.tint(rect, '#ffffff', cover), v = luminance(color);
        c.globalCompositeOperation = 'destination-out';
        c.drawImage(t, rect.x, rect.y);
        if (v > 0) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = alpha * v; c.drawImage(t, rect.x, rect.y); }
      } else {
        const pat = this.bucket.source === 'pattern' ? patternById(this.bucket.pattern) ?? allPatterns()[0] ?? null : null;
        c.globalCompositeOperation = compositeOp(this.bucket.mode);
        c.drawImage(pat ? this.patternTint(rect, pat.surface, cover) : this.tint(rect, rgbCss(color), cover), rect.x, rect.y);
      }
      c.restore();
    }, region);
  }

  /** The layer sample toned by Dodge, Burn or Sponge at the current settings, for a retouch stroke to reveal. */
  private toned(src: Surface, kind: 'dodge' | 'burn' | 'sponge'): Surface {
    const W = src.width, H = src.height, img = ctxOf(src).getImageData(0, 0, W, H), d = img.data, t = this.tone;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, l = 0.299 * r + 0.587 * g + 0.114 * b;
      let f: (v: number) => number;
      if (kind === 'sponge') {
        const sat = Math.max(r, g, b) - Math.min(r, g, b), k = t.spongeMode === 'saturate' ? -t.flow * (t.vibrance ? 1 - sat : 1) : t.flow;
        f = (v) => v + (l - v) * k;
      } else {
        const w = t.range === 'shadows' ? (1 - l) * (1 - l) : t.range === 'highlights' ? l * l : 1 - (2 * l - 1) * (2 * l - 1), a = t.exposure * w;
        const g1 = kind === 'dodge' ? (v: number): number => v + (1 - v) * a : (v: number): number => v * (1 - a);
        if (t.protectTones) {
          // The brightness moves as the channels would, every channel by the same amount (the hue kept); a colour that
          // would then clip is eased toward its grey just far enough to fit.
          const nl = g1(l), shift = nl - l, ch = [r + shift, g + shift, b + shift];
          let s = 1;
          for (const c of ch) { if (c > 1) s = Math.min(s, (1 - nl) / Math.max(1e-6, c - nl)); if (c < 0) s = Math.min(s, nl / Math.max(1e-6, nl - c)); }
          const out = ch.map((c) => nl + (c - nl) * Math.max(0, s));
          d[i] = Math.round(Math.min(1, Math.max(0, out[0])) * 255); d[i + 1] = Math.round(Math.min(1, Math.max(0, out[1])) * 255); d[i + 2] = Math.round(Math.min(1, Math.max(0, out[2])) * 255);
          continue;
        }
        f = g1;
      }
      d[i] = Math.round(Math.min(1, Math.max(0, f(r))) * 255); d[i + 1] = Math.round(Math.min(1, Math.max(0, f(g))) * 255); d[i + 2] = Math.round(Math.min(1, Math.max(0, f(b))) * 255);
    }
    const out = createSurface(W, H);
    ctxOf(out).putImageData(img, 0, 0);
    return out;
  }

  /** Select > Color Range: each pixel of the composite scored by how close its colour is to the sampled colours (fully
   *  selected at a sample, falling to none at Fuzziness away, less what is close to a colour taken away), or by tone for
   *  Highlights, Midtones or Shadows; inverted on request; kept within any selection. `scale` below 1 works on a reduced
   *  copy for the dialog's preview. */
  colorRangeMask(o: { mode: 'sampled' | 'highlights' | 'midtones' | 'shadows'; plus: RGB[]; minus: RGB[]; fuzziness: number; invert: boolean }, scale = 1): { mask: Uint8Array; w: number; h: number; any: boolean } | null {
    const p = this.current;
    if (!p) return null;
    const { width: W, height: H } = p.doc, comp = renderDoc(this.work, p.doc);
    const w = scale < 1 ? Math.max(1, Math.round(W * scale)) : W, h = scale < 1 ? Math.max(1, Math.round(H * scale)) : H;
    let src = comp;
    if (scale < 1) { src = createSurface(w, h); ctxOf(src).drawImage(comp as CanvasImageSource, 0, 0, w, h); }
    const d = ctxOf(src).getImageData(0, 0, w, h).data, out = new Uint8Array(w * h), f = Math.max(1, o.fuzziness), k = 1 / Math.sqrt(3);
    const near = (list: RGB[], r: number, g: number, b: number): number => {
      let best = Infinity;
      for (const c of list) { const dr = r - c.r, dg = g - c.g, db = b - c.b, dist = Math.sqrt(dr * dr + dg * dg + db * db) * k; if (dist < best) best = dist; }
      return list.length ? Math.max(0, 1 - best / f) : 0;
    };
    let any = false;
    for (let i = 0, j = 0; i < out.length; i++, j += 4) {
      const r = d[j], g = d[j + 1], b = d[j + 2], L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      let v = o.mode === 'sampled' ? Math.max(0, near(o.plus, r, g, b) - near(o.minus, r, g, b))
        : o.mode === 'highlights' ? Math.min(1, Math.max(0, (L - 0.55) / 0.2))
        : o.mode === 'shadows' ? Math.min(1, Math.max(0, (0.45 - L) / 0.2))
        : Math.min(1, Math.max(0, 1 - Math.abs(L - 0.5) / 0.3));
      if (o.invert) v = 1 - v;
      const sx = scale < 1 ? Math.floor((i % w) / scale) : i % w, sy = scale < 1 ? Math.floor(Math.floor(i / w) / scale) : Math.floor(i / w);
      if (p.selection) v *= p.selection.valueAt(sx, sy) / 255;
      out[i] = Math.round(v * 255);
      if (out[i]) any = true;
    }
    return { mask: out, w, h, any };
  }

  selectColorRange(o: Parameters<Engine['colorRangeMask']>[0]): void {
    const r = this.colorRangeMask(o);
    if (!r) return;
    if (!r.any) { this.notice('No pixels matched; nothing was selected.'); return; }
    this.applySelection(SelectionMask.cropped(0, 0, r.w, r.h, r.mask), 'replace', 'Color Range');
  }

  /** Quick Selection: brush over an area and the selection grows to it, stopping at edges; it shares the brush size. */
  quick = { sampleAll: false };
  setQuick(patch: Partial<Engine['quick']>): void { this.quick = { ...this.quick, ...patch }; this.emit('options', null); }
  private quickState: { project: Project; data: Uint8ClampedArray; W: number; H: number; base: SelectionMask | null; grown: Uint8Array; box: Rect | null; subtract: boolean; last: Pt | null } | null = null;
  get quickSelecting(): boolean { return !!this.quickState; }

  /** fresh: Quick Selection's New (starting from no selection within this step, so one undo covers it). */
  beginQuickSelect(pt: Pt, subtract: boolean, fresh = false): void {
    const p = this.current;
    if (!p || this.quickState) return;
    this.settle();
    const { width: W, height: H } = p.doc;
    let surface: Surface;
    if (this.quick.sampleAll) surface = renderDoc(this.work, p.doc);
    else {
      const l = p.activeLayer;
      if (!l) { this.notice('Select a layer first.'); return; }
      surface = createSurface(W, H);   // an empty layer is transparent (1.50.2)
      if (l.raster) {
        const c = ctxOf(surface);
        setMat(c, placement(l.transform, l.raster.width, l.raster.height));
        c.drawImage(l.raster.canvas, 0, 0);
      }
    }
    this.quickState = { project: p, data: ctxOf(surface).getImageData(0, 0, W, H).data, W, H, base: p.selection, grown: new Uint8Array(W * H), box: null, subtract, last: null };
    if (fresh && !subtract) this.quickState.base = null;
    this.quickTo(pt);
  }

  /** Grows the selection from the brush at `pt`: seeds are the pixels under the brush; a neighbour joins when its colour
   *  is within tolerance of the brushed colours and the step to it is small, so growth stops at edges; kept within eight
   *  brush radii of the brush (at least 96 px). The selection shows live; the stroke becomes one undo step when it ends. */
  quickTo(pt: Pt): void {
    const q = this.quickState;
    if (!q) return;
    const r = Math.max(1, this.brush.diameter / 2);
    if (q.last && Math.hypot(pt.x - q.last.x, pt.y - q.last.y) < Math.max(1, r / 2)) return;
    q.last = pt;
    const { data, W, H, grown } = q, R = Math.max(r * 8, 96);
    const x0 = Math.max(0, Math.floor(pt.x - R)), x1 = Math.min(W - 1, Math.ceil(pt.x + R)), y0 = Math.max(0, Math.floor(pt.y - R)), y1 = Math.min(H - 1, Math.ceil(pt.y + R));
    if (x0 > x1 || y0 > y1) return;
    const seeds: number[] = [], colours: number[][] = [];
    for (let y = Math.max(0, Math.floor(pt.y - r)); y <= Math.min(H - 1, Math.ceil(pt.y + r)); y++) for (let x = Math.max(0, Math.floor(pt.x - r)); x <= Math.min(W - 1, Math.ceil(pt.x + r)); x++) {
      if ((x - pt.x) ** 2 + (y - pt.y) ** 2 > r * r) continue;
      const i = y * W + x;
      seeds.push(i);
      if (seeds.length % 3 === 1 && colours.length < 64) colours.push([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
    }
    if (!seeds.length) return;
    const k = 1 / Math.sqrt(3), dist = (a: number, b: number[]): number => Math.hypot(data[a * 4] - b[0], data[a * 4 + 1] - b[1], data[a * 4 + 2] - b[2]) * k;
    const mean = [0, 1, 2].map((c) => colours.reduce((s, x) => s + x[c], 0) / colours.length), spread = colours.reduce((s, x) => s + Math.hypot(x[0] - mean[0], x[1] - mean[1], x[2] - mean[2]) * k, 0) / colours.length;
    const tol = Math.max(18, spread * 2.5), step = Math.max(10, tol * 0.6);
    const seen = new Uint8Array((x1 - x0 + 1) * (y1 - y0 + 1)), at = (i: number): number => ((Math.floor(i / W) - y0) * (x1 - x0 + 1)) + (i % W - x0), stack: number[] = [];
    for (const i of seeds) { grown[i] = 255; seen[at(i)] = 1; stack.push(i); }
    while (stack.length) {
      const i = stack.pop() as number, x = i % W, y = (i - x) / W;
      for (const n of [x > x0 ? i - 1 : -1, x < x1 ? i + 1 : -1, y > y0 ? i - W : -1, y < y1 ? i + W : -1]) {
        if (n < 0 || seen[at(n)]) continue;
        seen[at(n)] = 1;
        let close = false;
        for (const c of colours) if (dist(n, c) <= tol) { close = true; break; }
        if (!close || dist(n, [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]) > step) continue;
        grown[n] = 255;
        stack.push(n);
      }
    }
    const b = q.box, nx0 = b ? Math.min(b.x, x0) : x0, ny0 = b ? Math.min(b.y, y0) : y0, nx1 = b ? Math.max(b.x + b.w - 1, x1) : x1, ny1 = b ? Math.max(b.y + b.h - 1, y1) : y1;
    q.box = { x: nx0, y: ny0, w: nx1 - nx0 + 1, h: ny1 - ny0 + 1 };
    const crop = new Uint8Array(q.box.w * q.box.h);
    for (let y = 0; y < q.box.h; y++) crop.set(grown.subarray((q.box.y + y) * W + q.box.x, (q.box.y + y) * W + q.box.x + q.box.w), y * q.box.w);
    const stroke = SelectionMask.cropped(q.box.x, q.box.y, q.box.w, q.box.h, crop);
    q.project.selection = !stroke ? q.base : q.base ? q.base.combine(stroke, q.subtract ? 'subtract' : 'add') : q.subtract ? null : stroke;
    this.emit('selection', null);
    this.emit('render', null);
  }

  endQuickSelect(): void {
    const q = this.quickState;
    if (!q) return;
    this.quickState = null;
    const result = q.project.selection;
    q.project.selection = q.base;
    if (result !== q.base) { if (this.current === q.project) this.applySelection(result, 'replace', 'Quick Selection'); else q.project.selection = result; }
  }

  cancelQuickSelect(): void {
    const q = this.quickState;
    if (!q) return;
    this.quickState = null;
    q.project.selection = q.base;
    this.emit('selection', null);
    this.emit('render', null);
  }

  magicWand(pt: Pt, mode: SelectionMode): void { SO.magicWand(this.selectHost, pt, mode); }

  beginSelectionShift(): void { this.selectionShift = TE.beginSelectionShift(this.entryHost); }

  updateSelectionShift(dx: number, dy: number): void { if (this.selectionShift) TE.updateSelectionShift(this.entryHost, this.selectionShift, dx, dy); }

  endSelectionShift(): void {
    const s = this.selectionShift;
    if (!s) return;
    this.selectionShift = null;
    TE.endSelectionShift(this.entryHost, s);
  }

  /** Whether the Move tool moves a mask by itself: with the mask targeted and unlinked, the Move tool transforms the
   *  mask's placement instead of the layer. */
  transformsMask(l: Layer | null | undefined): boolean { return !!this.current && TE.transformsMask(this.current, l); }

  /** The selected layers and every layer linked to one of them (1.65.3). */
  private withLinked(p: Project): ReadonlySet<ID> {
    const links = new Set<ID>();
    for (const id of p.selectedIds) { const k = p.layer(id)?.link; if (k) links.add(k); }
    return links.size ? new Set([...p.selectedIds, ...p.doc.layers.filter((l) => l.link && links.has(l.link)).map((l) => l.id)]) : p.selectedIds;
  }

  /** Whether the selected layers are all of one link that another layer holds too (Link Layers then reads Unlink Layers). */
  get selectionLinked(): boolean {
    const p = this.current, ls = p ? [...p.selectedIds].map((id) => p.layer(id)) : [], k = ls[0]?.link;
    return !!p && !!k && ls.every((l) => l?.link === k) && p.doc.layers.filter((l) => l.link === k).length > 1;
  }

  /** Layer > Link Layers (1.65.3): the selected layers linked to move together, or unlinked when they are already one
   *  link; a link left to one layer is dropped. One step. */
  linkLayers(): void {
    const p = this.current;
    if (!p || this.stroke) return;
    const unlink = this.selectionLinked, link = uid();
    if (!unlink && p.selectedIds.size < 2) return;
    this.settle();
    this.edit(unlink ? 'Unlink Layers' : 'Link Layers', (q) => {
      const next = q.doc.layers.map((l) => (q.selectedIds.has(l.id) ? { ...l, link: unlink ? undefined : link } : l)), held = new Map<ID, number>();
      for (const l of next) if (l.link) held.set(l.link, (held.get(l.link) ?? 0) + 1);
      q.setLayers(next.map((l) => (l.link && (held.get(l.link) ?? 0) < 2 ? { ...l, link: undefined } : l)));
      return true;
    });
  }

  /** Layer > Select Linked Layers (1.65.3): every layer linked to a selected one joins the selection; not a step. */
  selectLinkedLayers(): void {
    const p = this.current;
    if (!p || this.stroke) return;
    const all = this.withLinked(p);
    if (all.size === p.selectedIds.size) return;
    this.settle();
    p.selectedIds = new Set(all);
    this.emit('active', null);
    this.emit('options', null);
    this.emit('overlay', null);
  }

  /** The layers the Move tool carries as one: with more than one layer selected, or a folder, the Move tool transforms the
   *  visible pixel layers that are selected or inside a selected folder together; linked layers count as selected,
   *  unless one layer's unlinked mask is targeted, which moves alone. */
  private groupMembers(p: Project): Layer[] { return TE.groupMembers(this.entryHost, p); }

  /** The group's handle box: the upright bounds of every member's box. */
  groupBox(): Transform | null { return TE.groupBox(this.entryHost); }

  /** The last transform, for Edit > Transform > Again (1.65.6): a box changed (moved, scaled, turned, flipped by a
   *  handle), a flip, or a distortion's corners before and after. */
  private lastTransform: { from: Transform; to: Transform } | { flip: boolean } | { quadFrom: Pt[]; quadTo: Pt[] } | null = null;

  get canTransformAgain(): boolean { return !!this.lastTransform && !!this.activeLayer && !this.floatSel && !this.distortEdit && !this.meshWarpEdit && !this.puppetEdit && !this.perspectiveEdit; }

  /** Edit > Transform > Again (1.65.6): the last transform's own matrix, in document space, applied
   *  again to what is selected now, so a turn about a point keeps turning about it: a box change through `following`,
   *  a flip as the same flip, a distortion's perspective through `againQuad`; with `copy` on a duplicate of the
   *  selected layers (Alt+Shift+Mod+T). One Transform Again step. */
  transformAgain(copy = false): boolean {
    const last = this.lastTransform, l = this.activeLayer;
    if (!this.canTransformAgain || !last || !l) { if (!last) this.notice('There is no transform to repeat yet.'); return false; }
    if (this.locked(l, 'position')) return false;
    return this.edit('Transform Again', () => {
      if (copy) this.duplicateLayers();
      if ('flip' in last) { this.flipLayers(last.flip); return true; }
      if ('quadFrom' in last) {
        if (!this.beginDistort()) return false;
        const d = this.distortEdit, q = d ? againQuad(last.quadFrom, last.quadTo, d.corners) : null;
        if (!d || !q || !distortUsable(q)) { this.cancelDistort(); return false; }
        d.corners = q;
        this.applyDistort();
        return true;
      }
      if (!this.beginTransform({ kind: 'resize', handle: 0 }, { x: 0, y: 0 }) || !this.transformEdit) return false;
      this.transformEdit.draft = following(this.transformEdit.original, last.from, last.to);
      this.endTransform('Transform Again');
      return true;
    });
  }

  /** Edit > Transform > Rotate 180°, 90° Clockwise and 90° Counter Clockwise (1.65.6): the selected layer, or the
   *  selected layers together, turned about the box's centre as a handle turns them, its mask following; no pixel is
   *  resampled. */
  rotateLayers(quarters: 1 | 2 | 3): boolean {
    if (!this.beginTransform({ kind: 'rotate' }, { x: 0, y: 0 }) || !this.transformEdit) return false;
    const te = this.transformEdit, r = te.original.rotation + quarters * 90;
    te.draft = { ...te.original, rotation: r - 360 * Math.ceil((r - 180) / 360) };
    this.endTransform(quarters === 1 ? 'Rotate 90° Clockwise' : quarters === 2 ? 'Rotate 180°' : 'Rotate 90° Counter Clockwise');
    return true;
  }

  /** Edit > Transform > Scale and Rotate (1.65.6): Free Transform with the Move tool's handles only scaling, or with
   *  them and the space outside the box only turning, until the tool changes or Enter or Escape ends it. */
  transformConstraint: 'scale' | 'rotate' | null = null;

  beginTransformMode(kind: 'scale' | 'rotate'): void {
    if (this.distortEdit || this.meshWarpEdit || this.puppetEdit || this.perspectiveEdit) { this.notice('Apply or cancel the transform under way first (Enter or Escape).'); return; }
    this.transformCommand();
    this.transformConstraint = kind;
    this.emit('options', null);
  }

  endTransformMode(): void { if (this.transformConstraint) { this.transformConstraint = null; this.emit('options', null); } }

  /** Edit > Transform > Skew, Distort and Perspective (1.65.6): the free distort begun in that mode on the Move tool,
   *  or one under way switched to it with its corners kept. */
  beginDistortMode(mode: DistortMode): boolean {
    if (this.distortEdit) { this.distortEdit.mode = mode; this.emit('options', null); this.emit('overlay', null); return true; }
    if (this.meshWarpEdit || this.puppetEdit || this.perspectiveEdit) { this.notice('Apply or cancel the transform under way first (Enter or Escape).'); return false; }
    if (this.tool !== 'move') this.setTool('move');
    return this.beginDistort(mode);
  }

  beginTransform(mode: DragMode, start: Pt): boolean {
    const te = TE.beginTransform(this.entryHost, mode, start);
    if (te) this.transformEdit = te;
    return !!te;
  }

  updateTransform(pt: Pt, shift: boolean, alt: boolean): void { if (this.transformEdit) TE.updateTransform(this.entryHost, this.transformEdit, pt, shift, alt); }

  /** Commits the box being edited; `name`, when given, names the step (a command's) in place of the drag's. */
  endTransform(name?: string): void {
    const te = this.transformEdit;
    if (!te) return;
    this.transformEdit = null;
    this.snapGuides = null;
    TC.commitTransform(this.commitHost, te, name);
  }

  /** The free distort (Cmd-drag a corner handle) moves the four corners of the Move tool's box each on its own, pending
   *  until applied (Enter) or cancelled (Escape). The box is the active layer's, or with several layers or a
   *  folder selected the group box, each member carried by the same perspective. `mode` says how a handle drags. */
  distortEdit: TE.DistortEditState | null = null;
  private distortFrame = 0;

  beginDistort(mode: DistortMode = 'distort'): boolean {
    if (this.transformEdit) return false;
    const d = TE.beginDistort(this.entryHost, mode, SHAPE_NOTICE);
    if (d) this.distortEdit = d;
    return !!d;
  }

  /** The corners a distortion hands one layer: the corners themselves for a single layer, or a member's own corners
   *  carried through the box's perspective; null when the shape is unusable and the member is left alone. */

  /** A layer's mask through a distortion to a quad: linked on the layer it warps with the pixels; linked but placed
   *  apart it takes the same perspective over its own bounds with its edge tone outside; unlinked it stays where it
   *  is on the document. */
  /** A smart object's mask through a distortion from `start` to `quad`: an unlinked mask stays put; otherwise its frame
   *  (its own placement, or the layer's when tied to the pixels) follows the same change of perspective, and the mask
   *  keeps a placement of its own from then on, so later re-renders of the object leave it where it belongs. */
  private smartDistortMask(l: Layer, start: Pt[], quad: Pt[], scale: number): DistortedMask | null {
    const m = l.mask;
    if (!m?.raster) return null;
    const pinned = m.placement ?? l.transform;
    if (!m.linked) return { warped: null, placement: pinned };
    const back = inverse3(homography(start));
    if (!back) return null;
    const on = homography(quad), mq = cornersOf(pinned).map((c) => { const u = project(back, c.x, c.y); return project(on, u.x, u.y); });
    const w = distortUsable(mq) ? warpRaster(m.raster, pinned, mq, scale, true, maskEdgeTone(m.raster)) : null;
    return w ? { warped: w, placement: w.t } : null;
  }

  /** Drags handle `handle` (0 to 3 the corners, 4 to 7 the sides' middles) by (dx, dy) from the corners `from` the drag
   *  began with, as the distortion's mode drags it (`distortDragged`); the preview is re-warped once per frame. */
  moveDistortHandle(handle: number, from: readonly Pt[], dx: number, dy: number): void {
    const d = this.distortEdit;
    if (!d || from.length !== 4) return;
    TE.moveDistortHandle(this.entryHost, d, handle, [...from], dx, dy, (f, h, x, y, m) => distortDragged(f, h, x, y, m));
  }

  /** Applies the free distort: each distorted layer's pixels resampled into its shape at full resolution and trimmed
   *  to what is visible, leaving upright layers, its mask handled by `distortMask` (a linked mask cropped with the pixels), as
   *  one step named by the mode (Distort, Skew or Perspective), with Layers after it for a group. */
  applyDistort(): void {
    const d = this.distortEdit;
    if (!d) return;
    this.distortEdit = null;
    TE.applyDistort(this.entryHost, d);
  }

  /** A linked vector mask carried through a distortion from corners `from` to `to` (1.66.1): its anchors and handles
   *  through the same perspective. Unlinked, or with a shape the perspective cannot take, it stays as it is. */
  private distortVector(l: Layer, from: Pt[], to: Pt[]): VectorMask | null | undefined {
    const v = l.vectorMask, back = v?.linked ? inverse3(homography(from)) : null;
    if (!v || !back) return v;
    const on = homography(to);
    return movedVector(v, (x, y) => { const u = project(back, x, y); return project(on, u.x, u.y); });
  }

  cancelDistort(): void {
    const d = this.distortEdit;
    if (!d) return;
    this.distortEdit = null;
    TE.cancelDistort(this.entryHost, d);
  }

  /** Edit > Transform > Warp: a 4 x 4 control grid over the active layer's corners, pending until applied (Enter) or
   *  cancelled (Escape). The warp is the smooth one (engine/mesh-warp.ts, ported from NodeMode's formvis): the surface
   *  curves through the points. A linked mask without a placement of its own warps with the pixels. */
  meshWarpEdit: { project: Project; layerId: ID; gw: number; gh: number; points: P2[]; us: number[]; vs: number[]; lastCol: number; lastRow: number; source: ImageData; mask: ImageData | null; preview: Warped | null } | null = null;
  private meshFrame = 0;
  /** The last place the pointer was over the canvas while a warp is pending (the Move tool sets it), which Split Warp splits at. */
  meshWarpAim: Pt | null = null;

  /** Where Split Warp should split: `meshWarpAim` when it lies on the warp surface, else undefined (the largest cell's middle). */
  meshSplitPoint(): Pt | undefined {
    const w = this.meshWarpEdit, a = this.meshWarpAim;
    if (!w || !a) return undefined;
    const ring: P2[] = [], q: P2 = [0, 0], n = 24, gu = w.gw - 1, gv = w.gh - 1;
    for (let k = 0; k < 4 * n; k++) {
      const t = (k % n) / n, side = Math.floor(k / n);
      meshSurfacePoint(w.gw, w.gh, w.points, side === 0 ? t * gu : side === 1 ? gu : side === 2 ? (1 - t) * gu : 0, side === 0 ? 0 : side === 1 ? t * gv : side === 2 ? gv : (1 - t) * gv, q);
      ring.push([q[0], q[1]]);
    }
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      if ((ring[i][1] > a.y) !== (ring[j][1] > a.y) && a.x < ((ring[j][0] - ring[i][0]) * (a.y - ring[i][1])) / (ring[j][1] - ring[i][1]) + ring[i][0]) inside = !inside;
    }
    return inside ? { ...a } : undefined;
  }

  /** Edit > Transform > Warp: points per side of the starting grid, 3 to 6 (Warp > Grid). */
  meshWarpGrid = 4;

  beginMeshWarp(grid = this.meshWarpGrid): boolean {
    const p = this.current, l = p?.activeLayer;
    if (!p || !l || this.stroke || this.transformEdit || this.distortEdit || this.meshWarpEdit || this.perspectiveEdit) return false;
    if (l.vector || l.smart || l.fillContent || l.isGroup || l.adjustment || !l.raster) { this.notice('Warp works on a pixel layer. Rasterize shape layers, fill layers and smart objects first.'); return false; }
    this.settle();
    this.meshWarpAim = null;
    const r = l.raster, c = cornersOf(l.transform), gw = Math.max(3, Math.min(6, Math.round(grid) || 4)), gh = gw, points: P2[] = [];
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const u = i / (gw - 1), v = j / (gh - 1), top = { x: c[0].x + (c[1].x - c[0].x) * u, y: c[0].y + (c[1].y - c[0].y) * u }, bot = { x: c[3].x + (c[2].x - c[3].x) * u, y: c[3].y + (c[2].y - c[3].y) * u };
      points.push([top.x + (bot.x - top.x) * v, top.y + (bot.y - top.y) * v]);
    }
    const m = l.mask?.raster && l.mask.linked && !l.mask.placement ? l.mask.raster.read() : null;
    this.meshWarpEdit = { project: p, layerId: l.id, gw, gh, points, us: evenSpacing(gw), vs: evenSpacing(gh), lastCol: -1, lastRow: -1, source: r.read(), mask: m, preview: null };
    this.emit('render', null);
    this.emit('options', null);
    return true;
  }

  /** Moves one control point (row-major); a move that would fold a cell is ignored. Re-previews once per frame. */
  moveMeshWarpPoint(i: number, pt: Pt): void {
    const w = this.meshWarpEdit;
    if (!w || i < 0 || i >= w.points.length) return;
    const next = w.points.map((q, k): P2 => (k === i ? [pt.x, pt.y] : q));
    for (let cy = 0; cy < w.gh - 1; cy++) for (let cx = 0; cx < w.gw - 1; cx++) {
      if (!convexQuad([next[cy * w.gw + cx], next[cy * w.gw + cx + 1], next[(cy + 1) * w.gw + cx], next[(cy + 1) * w.gw + cx + 1]])) return;
    }
    w.points = next;
    if (!this.meshFrame) this.meshFrame = requestAnimationFrame(() => { this.meshFrame = 0; const e = this.meshWarpEdit; if (e) { e.preview = this.meshWarped(e.source, e.points, e.gw, e.gh, 360, e.us, e.vs); this.emit('render', null); } });
    this.emit('overlay', null);
  }

  /** Grid parameters (u, v) of the surface point nearest the document point `at`: a coarse search over the surface,
   *  then a finer one around the best sample. */
  private meshParamAt(w: NonNullable<Engine['meshWarpEdit']>, at: Pt): { u: number; v: number } {
    const q: P2 = [0, 0];
    let bu = (w.gw - 1) / 2, bv = (w.gh - 1) / 2, bd = Infinity;
    const scan = (u0: number, u1: number, v0: number, v1: number, n: number): void => {
      let cu = bu, cv = bv;
      for (let a = 0; a <= n; a++) for (let b = 0; b <= n; b++) {
        const u = u0 + ((u1 - u0) * a) / n, v = v0 + ((v1 - v0) * b) / n;
        meshSurfacePoint(w.gw, w.gh, w.points, u, v, q);
        const d = (q[0] - at.x) ** 2 + (q[1] - at.y) ** 2;
        if (d < bd) { bd = d; cu = u; cv = v; }
      }
      bu = cu; bv = cv;
    };
    scan(0, w.gw - 1, 0, w.gh - 1, Math.max(8, (Math.max(w.gw, w.gh) - 1) * 8));
    scan(Math.max(0, bu - 0.25), Math.min(w.gw - 1, bu + 0.25), Math.max(0, bv - 0.25), Math.min(w.gh - 1, bv + 0.25), 10);
    return { u: bu, v: bv };
  }

  /** Edit > Transform > Split Warp: adds a grid row ('h'), column ('v') or both ('cross') at the point `at` (document
   *  coordinates), or in the middle of the largest cell. The new points sit on the current surface at the matching
   *  source positions, so the picture does not change; they then move like any other point. */
  splitMeshWarp(kind: 'h' | 'v' | 'cross', at?: Pt): boolean {
    const w = this.meshWarpEdit;
    if (!w) return false;
    let u: number, v: number;
    if (at) ({ u, v } = this.meshParamAt(w, at));
    else {
      let best = -1, bc = 0, br = 0;
      for (let cy = 0; cy < w.gh - 1; cy++) for (let cx = 0; cx < w.gw - 1; cx++) {
        const q = [w.points[cy * w.gw + cx], w.points[cy * w.gw + cx + 1], w.points[(cy + 1) * w.gw + cx + 1], w.points[(cy + 1) * w.gw + cx]];
        let area = 0;
        for (let k = 0; k < 4; k++) { const a = q[k], b = q[(k + 1) % 4]; area += a[0] * b[1] - b[0] * a[1]; }
        area = Math.abs(area) / 2;
        if (area > best) { best = area; bc = cx; br = cy; }
      }
      u = bc + 0.5; v = br + 0.5;
    }
    const want: { u?: number; v?: number } = {};
    if (kind !== 'h') { u = Math.min(w.gw - 1.05, Math.max(0.05, u)); want.u = u; }
    if (kind !== 'v') { v = Math.min(w.gh - 1.05, Math.max(0.05, v)); want.v = v; }
    const g = splitGrid(w.gw, w.gh, w.points, w.us, w.vs, want);
    for (let cy = 0; cy < g.gh - 1; cy++) for (let cx = 0; cx < g.gw - 1; cx++) {
      if (!convexQuad([g.points[cy * g.gw + cx], g.points[cy * g.gw + cx + 1], g.points[(cy + 1) * g.gw + cx], g.points[(cy + 1) * g.gw + cx + 1]])) { this.notice('That split would fold a cell. Straighten the grid there first.'); return false; }
    }
    w.lastCol = want.u !== undefined ? Math.floor(want.u) + 1 : -1;
    w.lastRow = want.v !== undefined ? Math.floor(want.v) + 1 : -1;
    w.gw = g.gw; w.gh = g.gh; w.points = g.points; w.us = g.us; w.vs = g.vs;
    w.preview = this.meshWarped(w.source, w.points, w.gw, w.gh, 360, w.us, w.vs);
    this.emit('render', null);
    this.emit('overlay', null);
    return true;
  }

  /** Removes the interior row and/or column added last, or else the last interior line (a column when the grid is at
   *  least as wide as tall); the border lines stay. The picture follows the remaining points. */
  removeMeshWarpSplit(): boolean {
    const w = this.meshWarpEdit;
    if (!w) return false;
    let col = w.lastCol, row = w.lastRow;
    if (col < 1 && row < 1) {
      if (w.gw >= w.gh && w.gw > 2) col = w.gw - 2;
      else if (w.gh > 2) row = w.gh - 2;
      else { this.notice('No split left to remove.'); return false; }
    }
    const g = removeSplit(w.gw, w.gh, w.points, w.us, w.vs, col, row);
    for (let cy = 0; cy < g.gh - 1; cy++) for (let cx = 0; cx < g.gw - 1; cx++) {
      if (!convexQuad([g.points[cy * g.gw + cx], g.points[cy * g.gw + cx + 1], g.points[(cy + 1) * g.gw + cx], g.points[(cy + 1) * g.gw + cx + 1]])) { this.notice('Removing that split would fold a cell. Move its neighbours first.'); return false; }
    }
    w.gw = g.gw; w.gh = g.gh; w.points = g.points; w.us = g.us; w.vs = g.vs; w.lastCol = -1; w.lastRow = -1;
    w.preview = this.meshWarped(w.source, w.points, w.gw, w.gh, 360, w.us, w.vs);
    this.emit('render', null);
    this.emit('overlay', null);
    return true;
  }

  /** `img` through the grid into document space, at most `maxSide` pixels a side (0 for full size). */
  private meshWarped(img: ImageData, points: P2[], gw: number, gh: number, maxSide = 0, us?: number[], vs?: number[]): Warped | null {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of points) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const mg = 0.12 * Math.max(x1 - x0, y1 - y0);
    x0 = Math.floor(x0 - mg); y0 = Math.floor(y0 - mg); x1 = Math.ceil(x1 + mg); y1 = Math.ceil(y1 + mg);
    const W = Math.max(1, x1 - x0), H = Math.max(1, y1 - y0), s = maxSide ? Math.min(1, maxSide / Math.max(W, H)) : 1;
    const ow = Math.max(1, Math.round(W * s)), oh = Math.max(1, Math.round(H * s));
    const out = meshWarpImage(img, gw, gh, points.map(([x, y]): P2 => [(x - x0) * s, (y - y0) * s]), ow, oh, true, us, vs);
    if (!out) return null;
    const raster = new Raster(ow, oh);
    raster.ctx.putImageData(out, 0, 0);
    return { raster, t: { ...docTransform(W, H), x: x0, y: y0, w: W, h: H } };
  }

  /** Applies the warp at full resolution as one Warp step, trimmed to what is visible. */
  applyMeshWarp(): void {
    const w = this.meshWarpEdit;
    if (!w) return;
    this.dropMeshWarp();
    const p = w.project, l = p.layer(w.layerId);
    if (p !== this.current || !l) return;
    const full = this.meshWarped(w.source, w.points, w.gw, w.gh, 0, w.us, w.vs);
    if (!full) { this.notice('That warp folds over itself. Try smaller moves.'); return; }
    const crop = visibleBounds(full.raster), pixels = crop ? cropWarp(full, crop) : full;
    let mask = l.mask;
    if (mask && w.mask) { const mw = this.meshWarped(w.mask, w.points, w.gw, w.gh, 0, w.us, w.vs); if (mw) mask = { ...mask, raster: crop ? cropWarp(mw, crop).raster : mw.raster }; }
    this.edit('Warp', (q) => q.updateLayer(l.id, { raster: pixels.raster, transform: pixels.t, mask, shape: null }));
  }

  cancelMeshWarp(): void { if (this.meshWarpEdit) this.dropMeshWarp(); }

  /** Edit > Puppet Warp: pins placed on the active layer (click to add, drag to move, Alt-click to remove); the layer
   *  bends by rigid moving least squares (engine/puppet.ts) so pins land where they are dragged. Pending until Enter,
   *  cancelled by Escape. */
  puppetEdit: { project: Project; layerId: ID; from: P2[]; to: P2[]; source: ImageData; toLocal: Mat; box: Rect; preview: Warped | null } | null = null;
  private puppetFrame = 0;

  beginPuppetWarp(): boolean {
    const p = this.current, l = p?.activeLayer;
    if (!p || !l || this.stroke || this.transformEdit || this.distortEdit || this.meshWarpEdit || this.puppetEdit || this.perspectiveEdit) return false;
    if (l.vector || l.smart || l.fillContent || l.isGroup || l.adjustment || !l.raster) { this.notice('Puppet Warp works on a pixel layer. Rasterize shape layers, fill layers and smart objects first.'); return false; }
    this.settle();
    const r = l.raster, m = placement(l.transform, r.width, r.height);
    this.puppetEdit = { project: p, layerId: l.id, from: [], to: [], source: r.read(), toLocal: invert(m), box: transformBounds(l.transform), preview: null };
    this.emit('render', null);
    this.emit('options', null);
    return true;
  }

  addPuppetPin(pt: Pt): number {
    const w = this.puppetEdit;
    if (!w) return -1;
    w.from.push([pt.x, pt.y]);
    w.to.push([pt.x, pt.y]);
    this.emit('overlay', null);
    return w.to.length - 1;
  }

  movePuppetPin(i: number, pt: Pt): void {
    const w = this.puppetEdit;
    if (!w || i < 0 || i >= w.to.length) return;
    w.to[i] = [pt.x, pt.y];
    this.schedulePuppet();
  }

  removePuppetPin(i: number): void {
    const w = this.puppetEdit;
    if (!w || i < 0 || i >= w.to.length) return;
    w.from.splice(i, 1);
    w.to.splice(i, 1);
    this.schedulePuppet();
  }

  private schedulePuppet(): void {
    if (!this.puppetFrame) this.puppetFrame = requestAnimationFrame(() => { this.puppetFrame = 0; const w = this.puppetEdit; if (w) { w.preview = this.puppetRender(w, 360); this.emit('render', null); } });
    this.emit('overlay', null);
  }

  /** The layer through the pins over the layer's box grown by the largest pin move, at most `maxSide` pixels a side
   *  (0 for full size); null when nothing has moved. */
  private puppetRender(w: NonNullable<Engine['puppetEdit']>, maxSide = 0): Warped | null {
    if (!w.to.length || w.to.every((q, i) => q[0] === w.from[i][0] && q[1] === w.from[i][1])) return null;
    const grow = Math.ceil(Math.max(...w.to.map((q, i) => Math.hypot(q[0] - w.from[i][0], q[1] - w.from[i][1])))) + 2;
    const x0 = Math.floor(w.box.x - grow), y0 = Math.floor(w.box.y - grow), W = Math.ceil(w.box.w + 2 * grow), H = Math.ceil(w.box.h + 2 * grow);
    const s = maxSide ? Math.min(1, maxSide / Math.max(W, H)) : 1, img = puppetImage(w.source, (x, y) => { const q = applyMat(w.toLocal, x, y); return [q.x, q.y]; }, w.from, w.to, x0, y0, W, H, s);
    const raster = new Raster(img.width, img.height);
    raster.ctx.putImageData(img, 0, 0);
    return { raster, t: { ...docTransform(W, H), x: x0, y: y0, w: W, h: H } };
  }

  /** Applies at full resolution as one Puppet Warp step, trimmed to the visible pixels. */
  applyPuppetWarp(): void {
    const w = this.puppetEdit;
    if (!w) return;
    this.dropPuppet();
    const p = w.project, l = p.layer(w.layerId);
    if (p !== this.current || !l) return;
    const full = this.puppetRender(w);
    if (!full) return;
    const crop = visibleBounds(full.raster), pixels = crop ? cropWarp(full, crop) : full;
    this.edit('Puppet Warp', (q) => q.updateLayer(l.id, { raster: pixels.raster, transform: pixels.t, shape: null }));
  }

  cancelPuppetWarp(): void { if (this.puppetEdit) this.dropPuppet(); }

  /** Edit > Perspective Warp (1.55.6, the parity plan's M4): in Layout, drag to draw planes over the picture and move
   *  their corners to fit it (corners within a few pixels of another plane's snap to share it); in Warp, move the
   *  corners and the picture follows each plane's homography (engine/perspective.ts). Straighten and Level make
   *  near-vertical or near-horizontal edges exact. Enter applies as one step, Escape cancels. */
  perspectiveEdit: { project: Project; layerId: ID; phase: 'layout' | 'warp'; planes: Plane[]; source: ImageData; toLocal: Mat; box: Rect; preview: Warped | null } | null = null;
  private perspectiveFrame = 0;

  beginPerspectiveWarp(): boolean {
    const p = this.current, l = p?.activeLayer;
    if (!p || !l || this.stroke || this.transformEdit || this.distortEdit || this.meshWarpEdit || this.puppetEdit || this.perspectiveEdit) return false;
    if (l.vector || l.smart || l.fillContent || l.isGroup || l.adjustment || !l.raster) { this.notice('Perspective Warp works on a pixel layer. Rasterize shape layers, fill layers and smart objects first.'); return false; }
    this.settle();
    const r = l.raster, m = placement(l.transform, r.width, r.height);
    this.perspectiveEdit = { project: p, layerId: l.id, phase: 'layout', planes: [], source: r.read(), toLocal: invert(m), box: transformBounds(l.transform), preview: null };
    this.emit('render', null);
    this.emit('options', null);
    return true;
  }

  /** Layout: a plane from a dragged rectangle; corners near another plane's corner (within `snap`) take it. */
  addPerspectivePlane(a: Pt, b: Pt, snap = 0): number {
    const w = this.perspectiveEdit;
    if (!w || w.phase !== 'layout') return -1;
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    const quad = ([[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as Quad).map((c) => this.snapPerspective(c, snap, -1)) as Quad;
    if (!convexQuadTLTRBRBL(quad)) return -1;
    w.planes.push({ src: quad.map((c) => [c[0], c[1]]) as Quad, dst: quad.map((c) => [c[0], c[1]]) as Quad });
    this.emit('overlay', null);
    this.emit('options', null);
    return w.planes.length - 1;
  }

  private snapPerspective(c: P2, snap: number, skip: number): P2 {
    const w = this.perspectiveEdit;
    if (!w || snap <= 0) return c;
    for (const [k, pl] of w.planes.entries()) { if (k === skip) continue; for (const q of pl.dst) if (Math.hypot(q[0] - c[0], q[1] - c[1]) <= snap) return [q[0], q[1]]; }
    return c;
  }

  /** Moves one corner: in Layout the plane's layout and warped corner together (the plane is fitted to the picture),
   *  in Warp only the warped one; every plane's corner at the same place moves with it, so shared edges stay shared.
   *  A move that would fold a quad is ignored. */
  movePerspectiveCorner(plane: number, corner: number, pt: Pt, snap = 0): void {
    const w = this.perspectiveEdit;
    if (!w || !w.planes[plane]) return;
    const old = w.planes[plane].dst[corner], target = w.phase === 'layout' ? this.snapPerspective([pt.x, pt.y], snap, plane) : [pt.x, pt.y] as P2;
    const same = (c: P2): boolean => Math.abs(c[0] - old[0]) < 1e-6 && Math.abs(c[1] - old[1]) < 1e-6;
    const next = w.planes.map((pl) => ({ src: (w.phase === 'layout' ? pl.src.map((c) => (same(c) ? [target[0], target[1]] : c)) : pl.src) as Quad, dst: pl.dst.map((c) => (same(c) ? [target[0], target[1]] : c)) as Quad }));
    if (next.some((pl) => !convexQuadTLTRBRBL(pl.dst) || !convexQuadTLTRBRBL(pl.src))) return;
    w.planes = next;
    this.schedulePerspective();
  }

  setPerspectivePhase(phase: 'layout' | 'warp'): void {
    const w = this.perspectiveEdit;
    if (!w || w.phase === phase) return;
    if (phase === 'layout' && w.planes.some((pl) => pl.dst.some((c, i) => c[0] !== pl.src[i][0] || c[1] !== pl.src[i][1]))) { this.notice('Layout returns once the warp is undone: Escape cancels the warp.'); return; }
    w.phase = phase;
    this.emit('overlay', null);
    this.emit('options', null);
  }

  straightenPerspective(vertical: boolean): void {
    const w = this.perspectiveEdit;
    if (!w || w.phase !== 'warp' || !w.planes.length) return;
    const planes = w.planes.map((pl) => ({ src: pl.src, dst: pl.dst.map((c) => [c[0], c[1]]) as Quad }));
    straighten(planes, vertical);
    if (planes.some((pl) => !convexQuadTLTRBRBL(pl.dst))) { this.notice('Straightening would fold a plane.'); return; }
    w.planes = planes;
    this.schedulePerspective();
  }

  private schedulePerspective(): void {
    if (!this.perspectiveFrame) this.perspectiveFrame = requestAnimationFrame(() => { this.perspectiveFrame = 0; const w = this.perspectiveEdit; if (w) { w.preview = this.perspectiveRender(w, 360); this.emit('render', null); } });
    this.emit('overlay', null);
  }

  /** The layer through the planes over a region holding the layer's box and every warped quad, at most `maxSide`
   *  pixels a side (0 for full size); null while nothing is warped. */
  private perspectiveRender(w: NonNullable<Engine['perspectiveEdit']>, maxSide = 0): Warped | null {
    if (!w.planes.length || w.planes.every((pl) => pl.dst.every((c, i) => c[0] === pl.src[i][0] && c[1] === pl.src[i][1]))) return null;
    let x0 = w.box.x, y0 = w.box.y, x1 = w.box.x + w.box.w, y1 = w.box.y + w.box.h;
    for (const pl of w.planes) {
      const f = quadHomography(pl.src, pl.dst);
      const pts: P2[] = [...pl.dst, ...(f ? [[w.box.x, w.box.y], [x1, w.box.y], [x1, w.box.y + w.box.h], [w.box.x, w.box.y + w.box.h]].map(([x, y]) => applyH(f, x, y)) : [])];
      for (const [x, y] of pts) if (Number.isFinite(x) && Number.isFinite(y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    }
    const doc = w.project.doc, lim = 2 * Math.max(doc.width, doc.height);
    x0 = Math.floor(Math.max(-lim, x0)); y0 = Math.floor(Math.max(-lim, y0)); x1 = Math.ceil(Math.min(doc.width + lim, x1)); y1 = Math.ceil(Math.min(doc.height + lim, y1));
    const W = Math.max(1, x1 - x0), H = Math.max(1, y1 - y0), s = maxSide ? Math.min(1, maxSide / Math.max(W, H)) : 1;
    const img = perspectiveImage(w.source, (x, y) => { const q = applyMat(w.toLocal, x, y); return [q.x, q.y]; }, w.planes, x0, y0, W, H, s);
    const raster = new Raster(img.width, img.height);
    raster.ctx.putImageData(img, 0, 0);
    return { raster, t: { ...docTransform(W, H), x: x0, y: y0, w: W, h: H } };
  }

  /** Applies at full resolution as one Perspective Warp step, trimmed to the visible pixels. */
  applyPerspectiveWarp(): void {
    const w = this.perspectiveEdit;
    if (!w) return;
    this.dropPerspective();
    const p = w.project, l = p.layer(w.layerId);
    if (p !== this.current || !l) return;
    const full = this.perspectiveRender(w);
    if (!full) return;
    const crop = visibleBounds(full.raster), pixels = crop ? cropWarp(full, crop) : full;
    this.edit('Perspective Warp', (q) => q.updateLayer(l.id, { raster: pixels.raster, transform: pixels.t, shape: null }));
  }

  cancelPerspectiveWarp(): void { if (this.perspectiveEdit) this.dropPerspective(); }

  private dropPerspective(): void {
    if (this.perspectiveFrame) cancelAnimationFrame(this.perspectiveFrame);
    this.perspectiveFrame = 0;
    this.perspectiveEdit = null;
    this.emit('render', null);
    this.emit('options', null);
  }

  private dropPuppet(): void {
    if (this.puppetFrame) cancelAnimationFrame(this.puppetFrame);
    this.puppetFrame = 0;
    this.puppetEdit = null;
    this.emit('render', null);
    this.emit('options', null);
  }

  private dropMeshWarp(): void {
    if (this.meshFrame) cancelAnimationFrame(this.meshFrame);
    this.meshFrame = 0;
    this.meshWarpEdit = null;
    this.emit('render', null);
    this.emit('options', null);
  }

  cancelTransform(): void { this.snapGuides = null; if (this.transformEdit) { this.transformEdit = null; this.emit('render', null); this.emit('options', null); } }

  /** How far the video timeline places layer `id` from its own position at the playhead (its Position keyframes), so a
   *  drag's preview starts where the layer is seen (1.59.9). Zero without keyframes. */
  keyedOffset(p: Project, id: ID): { dx: number; dy: number } {
    const vt = this.timelines.get(p)?.video, tr = vt?.tracks[id], l = p.layer(id);
    if (!vt || !tr || !l) return { dx: 0, dy: 0 };
    return { dx: tr.keys.x?.length ? valueAt(tr.keys.x, vt.current, l.transform.x) - l.transform.x : 0, dy: tr.keys.y?.length ? valueAt(tr.keys.y, vt.current, l.transform.y) - l.transform.y : 0 };
  }

  /** A move keyed (1.59.9): a layer whose Position X or Y has keyframes moves by keying its new place at
   *  the playhead (an axis without keyframes moves the layer itself), all one step named `name`. False when the layer
   *  has no Position keyframes, for the caller to move it as ever. */
  keyMove(id: ID, dx: number, dy: number, name: string): boolean {
    const p = this.current, vt = this.video, tr = vt?.tracks[id], l = p?.layer(id);
    if (!p || !vt || !tr || !l || (!tr.keys.x?.length && !tr.keys.y?.length) || (!dx && !dy)) return false;
    p.history.begin(name, { ...p.snapshot(), video: structuredClone(vt) });
    try {
      this.editVideo((v) => {
        const t = v.tracks[id];
        if (!t) return;
        for (const [prop, d, base] of [['x', dx, l.transform.x], ['y', dy, l.transform.y]] as const) {
          const ks = t.keys[prop];
          if (!ks?.length || !d) continue;
          const val = valueAt(ks, v.current, base) + d, at = ks.find((k) => k.t === v.current);
          if (at) at.v = val; else { ks.push({ t: v.current, v: val, interp: 'linear' }); ks.sort((a, b) => a.t - b.t); }
        }
      }, name);
      const fx = tr.keys.x?.length ? 0 : dx, fy = tr.keys.y?.length ? 0 : dy;
      if (fx || fy) this.edit(name, (q) => { const ll = q.layer(id); if (!ll) return false; const t = { ...ll.transform, x: ll.transform.x + fx, y: ll.transform.y + fy }; q.updateLayer(id, { transform: t, mask: followMask(ll, t), vectorMask: followVector(ll, t) }); return true; });
    } finally {
      p.history.end({ ...p.snapshot(), video: structuredClone(this.video) });
      this.refresh();
    }
    return true;
  }

  nudge(dx: number, dy: number): void { PO.nudge(this.paintHost, dx, dy); }

  /** The selected layers and folders as units to align, each with the document bounds of its visible pixels. */
  private alignItems(p: Project): Array<{ ids: ID[]; box: Rect }> {
    const map = byId(p.doc);
    return this.selectedRoots(p).flatMap((root) => {
      const members = p.doc.layers.filter((l) => !l.isGroup && !!l.raster && (l.id === root || isDescendant(map, l.id, root)));
      let box: Rect | null = null;
      for (const l of members) {
        const r = l.raster as Raster, vb = visibleBounds(r);
        if (!vb) continue;
        const m = placement(l.transform, r.width, r.height);
        const b = boundsOf([applyMat(m, vb.x, vb.y), applyMat(m, vb.x + vb.w, vb.y), applyMat(m, vb.x + vb.w, vb.y + vb.h), applyMat(m, vb.x, vb.y + vb.h)]);
        box = box ? unionRect(box, b) : b;
      }
      return box ? [{ ids: members.map((l) => l.id), box }] : [];
    });
  }

  private shiftItems(name: string, moves: Array<{ ids: ID[]; dx: number; dy: number }>): void {
    this.edit(name, (p) => {
      let moved = false;
      for (const mv of moves) {
        const dx = Math.round(mv.dx), dy = Math.round(mv.dy);
        if (!dx && !dy) continue;
        for (const id of mv.ids) {
          const l = p.layer(id);
          if (!l) continue;
          const t = { ...l.transform, x: l.transform.x + dx, y: l.transform.y + dy };
          p.updateLayer(id, { transform: t, mask: followMask(l, t), vectorMask: followVector(l, t) });
          moved = true;
        }
      }
      return moved;
    });
  }

  /** Layer > Align: several layers or folders align to the bounds of them all; one aligns to the selection, or to
   *  the canvas when nothing is selected. Visible pixels decide each one's edges. */
  alignLayers(edge: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'): void {
    const p = this.current;
    if (!p || this.stroke) return;
    this.settle();
    const items = this.alignItems(p);
    if (!items.length) { this.notice('Select layers with visible pixels to align.'); return; }
    const sel = p.selection, ref = items.length > 1 ? items.slice(1).reduce((a, it) => unionRect(a, it.box), items[0].box) : sel ? { x: sel.x, y: sel.y, w: sel.w, h: sel.h } : { x: 0, y: 0, w: p.doc.width, h: p.doc.height };
    const names = { left: 'Left Edges', hcenter: 'Horizontal Centers', right: 'Right Edges', top: 'Top Edges', vcenter: 'Vertical Centers', bottom: 'Bottom Edges' };
    this.shiftItems(`Align ${names[edge]}`, items.map(({ ids, box: b }) => ({
      ids,
      dx: edge === 'left' ? ref.x - b.x : edge === 'right' ? ref.x + ref.w - b.x - b.w : edge === 'hcenter' ? ref.x + ref.w / 2 - b.x - b.w / 2 : 0,
      dy: edge === 'top' ? ref.y - b.y : edge === 'bottom' ? ref.y + ref.h - b.y - b.h : edge === 'vcenter' ? ref.y + ref.h / 2 - b.y - b.h / 2 : 0,
    })));
  }

  /** Layer > Distribute: three or more layers or folders, the outermost two staying put, spaced so the chosen edges
   *  or centres fall at equal steps, or so the gaps between them are equal. */
  distributeLayers(kind: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom' | 'hspace' | 'vspace'): void {
    const p = this.current;
    if (!p || this.stroke) return;
    this.settle();
    const items = this.alignItems(p);
    if (items.length < 3) { this.notice('Select three or more layers with visible pixels to distribute.'); return; }
    const horizontal = kind === 'left' || kind === 'hcenter' || kind === 'right' || kind === 'hspace';
    const lo = (b: Rect): number => (horizontal ? b.x : b.y), size = (b: Rect): number => (horizontal ? b.w : b.h);
    const at = (b: Rect): number => (kind === 'left' || kind === 'top' || kind.endsWith('space') ? lo(b) : kind === 'right' || kind === 'bottom' ? lo(b) + size(b) : lo(b) + size(b) / 2);
    const sorted = [...items].sort((a, b) => at(a.box) - at(b.box)), n = sorted.length;
    const want: number[] = [];
    if (kind.endsWith('space')) {
      const span = lo(sorted[n - 1].box) + size(sorted[n - 1].box) - lo(sorted[0].box), gap = (span - sorted.reduce((s, it) => s + size(it.box), 0)) / (n - 1);
      let cur = lo(sorted[0].box);
      for (const it of sorted) { want.push(cur); cur += size(it.box) + gap; }
    } else {
      const a = at(sorted[0].box), b = at(sorted[n - 1].box);
      for (let i = 0; i < n; i++) want.push(a + ((b - a) * i) / (n - 1));
    }
    const label = { left: 'Left Edges', hcenter: 'Horizontal Centers', right: 'Right Edges', top: 'Top Edges', vcenter: 'Vertical Centers', bottom: 'Bottom Edges', hspace: 'Horizontal Spacing', vspace: 'Vertical Spacing' }[kind];
    this.shiftItems(`Distribute ${label}`, sorted.map((it, i) => {
      const d = want[i] - (kind.endsWith('space') ? lo(it.box) : at(it.box));
      return { ids: it.ids, dx: horizontal ? d : 0, dy: horizontal ? 0 : d };
    }));
  }

  layerAt(pt: Pt): ID | null { return PO.layerAt(this.paintHost, pt); }
  /** Every visible pixel layer with a pixel at `pt`, top first (1.87.3, the canvas layer picker), at most `max`. */
  layersAt(pt: Pt, max = 10): ID[] {
    const p = this.current, out: ID[] = [];
    if (!p) return out;
    const hidden = new Set<ID>();
    for (let id = PO.layerAt(this.paintHost, pt); id && out.length < max; id = this.withHidden(p, hidden, () => PO.layerAt(this.paintHost, pt))) { out.push(id); hidden.add(id); }
    return out;
  }
  /** Runs `fn` with the `hidden` layers' visibility off, restored after; nothing is recorded or drawn. */
  private withHidden<T>(p: Project, hidden: Set<ID>, fn: () => T): T {
    const doc = p.doc;
    p.doc = { ...doc, layers: doc.layers.map((l) => (hidden.has(l.id) ? { ...l, visible: false } : l)) };
    try { return fn(); } finally { p.doc = doc; }
  }

  /** The Eyedropper's Sample Size, in the options bar: 1 is Point Sample, otherwise the side of the
   *  square averaged (3, 5, 11, 31, 51 or 101). */
  eyedropperSize = 1;

  /** The document composed beneath `id` (1.54.7, Harmonize): the layers below it, at document size. */
  compositeBelow(id: ID): ImageData | null {
    const p = this.current, l = p?.layer(id);
    if (!p || !l) return null;
    const s = createSurface(p.doc.width, p.doc.height);
    this.work.render({ doc: p.doc, target: s, view: [1, 0, 0, 1, 0, 0], overrides: this.belowOverrides(p, l), quality: 'high' });
    return ctxOf(s).getImageData(0, 0, p.doc.width, p.doc.height);
  }

  compositeUnder(id: ID): ImageData | null {
    const p = this.current, l = p?.layer(id);
    if (!p || !l) return null;
    const s = createSurface(p.doc.width, p.doc.height), overrides = this.belowOverrides(p, l);
    overrides.set(l.id, { hidden: true });
    this.work.render({ doc: p.doc, target: s, view: [1, 0, 0, 1, 0, 0], overrides, quality: 'high' });
    return ctxOf(s).getImageData(0, 0, p.doc.width, p.doc.height);
  }

  /** The document's colour at `pt`: the pixel itself for Point Sample, or the average of the Sample Size square around
   *  it, each pixel weighted by its opacity, so transparent pixels and anything past the canvas do not pull the colour. */
  sampleColor(pt: Pt): RGB | null {
    const p = this.current;
    if (!p || pt.x < 0 || pt.y < 0 || pt.x >= p.doc.width || pt.y >= p.doc.height) return null;
    const n = Math.max(1, Math.min(101, Math.round(this.eyedropperSize))), half = Math.floor(n / 2);
    const s = createSurface(n, n);
    const view = translation(-(Math.floor(pt.x) - half), -(Math.floor(pt.y) - half)), l = p.activeLayer, sample = l ? this.eyedropperSample : 'all';
    if (sample === 'current' && l) { if (l.raster) { const c = ctxOf(s); setMat(c, mul(view, placement(l.transform, l.raster.width, l.raster.height))); c.drawImage(l.raster.canvas, 0, 0); } }
    else this.work.render({ doc: p.doc, target: s, view, ...(sample === 'below' && l ? { overrides: this.belowOverrides(p, l) } : {}) });
    const d = ctxOf(s).getImageData(0, 0, n, n).data;
    let r = 0, g = 0, b = 0, a = 0;
    for (let i = 0; i < n * n; i++) {
      const w = d[i * 4 + 3];
      if (!w) continue;
      r += d[i * 4] * w; g += d[i * 4 + 1] * w; b += d[i * 4 + 2] * w; a += w;
    }
    return a ? { r: Math.round(r / a), g: Math.round(g / a), b: Math.round(b / a) } : null;
  }

  insertImages(images: ImportedImage[], at?: Pt): void {
    if (!images.length) return;
    if (!this.current) {
      const f = images[0];
      this.addProject({ id: uid(), width: f.width, height: f.height, resolution: f.resolution ?? 72, layers: [], ...(f.profile ? { profile: f.profile } : {}), ...(f.mode ? { mode: f.mode } : {}), ...(f.meta ? { meta: f.meta } : {}) }, stripExt(f.name));   // its embedded profile kept (1.53.5), its File Info (29.2), a grayscale file's mode
    }
    this.edit(images.length > 1 ? 'Import Images' : 'Import Image', (p) => {
      let pixels = p.doc.layers.reduce((n, l) => n + (l.raster ? l.raster.width * l.raster.height : 0), 0), added = 0;
      for (const img of images) {
        if (img.width > LIMITS.side || img.height > LIMITS.side || pixels + img.width * img.height > LIMITS.pixels) {
          this.notice(`${img.name} was skipped: it would exceed the 30,000 px side or the ${Math.round(LIMITS.pixels / 1_000_000)}-megapixel document limit.`, 'error');
          continue;
        }
        pixels += img.width * img.height;
        const c = at ?? { x: p.doc.width / 2, y: p.doc.height / 2 };
        const act = p.activeLayer, parentId = act ? (act.isGroup ? act.id : act.parentId) : null;
        // Into a frame, the image covers it, centred; elsewhere it lands at its own size.
        const fr = parentId ? p.layer(parentId)?.frame : null, cover = fr ? Math.max(fr.w / img.width, fr.h / img.height) : 1;
        const depth = p.doc.depth ?? 8, channels = img.deep && !fr && (!p.doc.mode || p.doc.mode === 'rgb') ? (depth === 32 ? img.deep : depth === 16 ? deepToned(img.deep, 0, 1) : null) : null;
        const layer = newLayer(stripExt(img.name), p.doc, {
          raster: Raster.from(img.source, img.width, img.height), parentId, ...(channels ? { channels } : {}),
          transform: fr
            ? { ...docTransform(img.width, img.height), x: fr.x + (fr.w - img.width * cover) / 2, y: fr.y + (fr.h - img.height * cover) / 2, w: img.width * cover, h: img.height * cover }
            : { ...docTransform(img.width, img.height), x: Math.floor(c.x - img.width / 2), y: Math.floor(c.y - img.height / 2) },
        });
        p.setLayers([...p.doc.layers, layer]);
        this.focus(p, layer.id);
        added++;
      }
      return added > 0;
    });
  }

  /** A pixel layer's pixels replaced by `img` of the same size, as one history step (Develop's camera profile re-develops
   *  a RAW file under the layer); false where the sizes differ, the layer has none, or the document is deeper than 8 bits. */
  redevelopLayer(id: ID, img: ImportedImage, name: string): boolean {
    return this.edit(name, (p) => {
      const l = p.layer(id);
      if (!l?.raster || l.channels || (p.doc.depth ?? 8) !== 8 || l.raster.width !== img.width || l.raster.height !== img.height) return false;
      p.setLayers(p.doc.layers.map((x) => (x.id === id ? { ...x, raster: Raster.from(img.source, img.width, img.height) } : x)));
      return true;
    });
  }

  private liveOpen: Project | null = null;
  preview: { project: Project; layerId: ID; target: Target; surface: Surface; transform?: Transform } | null = null;
  /** Counted up for every preview request and every clear, so a worker's late result
   *  for an older request is dropped. */
  private previewToken = 0;
  gradient: PO.GradientDrag | null = null;
  /** The Gradient tool's settings: Shape, Colors (style), Reverse, Opacity, and Mode and Dither from the options
   *  bar (Dither off by default). */
  /** transparency and method (1.50.6, the tool audit): the stops' own transparency honoured or not;
   *  the colours blended in sRGB (Classic, as before), linear light (Linear) or OKLab (Perceptual). */
  gradientSettings: { shape: GradientType; style: string; reversed: boolean; opacity: number; blend: BlendMode; dither: boolean; transparency: boolean; method: 'classic' | 'linear' | 'perceptual' } = { shape: 'linear', style: 'transparent', reversed: false, opacity: 1, blend: 'normal', dither: false, transparency: true, method: 'classic' };
  /** Dialogs a tool's options can open; the app fills these in, since tools only see the engine. */
  uiHooks: { gradientEditor?: () => void; importBrushes?: () => void } = {};
  /** The shape tools' settings. mode (1.49.8, the owner's tool list): a shape layer, the work path, or
   *  pixels on the active layer; fill and stroke each the foreground, the background or none, and the stroke's width. */
  shapeSettings: { kind: 'rectangle' | 'ellipse' | PathShapeKind; cornerRadius: number; mode: 'shape' | 'path' | 'pixels'; fill: 'fg' | 'bg' | 'none'; stroke: 'fg' | 'bg' | 'none'; strokeWidth: number; strokeDash: 'solid' | 'dashed' | 'dotted'; strokeAlign: 'inside' | 'center' | 'outside' } & PathShapeOptions =
    { kind: 'rectangle', cornerRadius: 0, mode: 'shape', fill: 'fg', stroke: 'none', strokeWidth: 3, strokeDash: 'solid', strokeAlign: 'center', ...DEFAULT_PATH_SHAPE };
  /** The Pen's Mode and Auto Add/Delete (1.52.8, the tool audit): a path, or a shape layer made from
   *  each path closed; clicking a path adds a point and clicking a point deletes it, unless turned off. */
  penSettings = { mode: 'path' as 'path' | 'shape', autoAddDelete: true };

  /** The Pen in Shape mode: a closed path made into a shape layer with the Shape tool's fill and stroke. */
  shapeFromPath(path: VectorPath): void {
    const st = this.shapeSettings, colour = (c: 'fg' | 'bg' | 'none'): RGB | null => (c === 'fg' ? { ...this.fg } : c === 'bg' ? { ...this.bg } : null);
    const strokeC = colour(st.stroke), look: ShapeStyle = { fill: colour(st.fill) ?? (strokeC ? null : { ...this.fg }), stroke: strokeC ? { color: strokeC, width: Math.max(0.5, st.strokeWidth), dash: st.strokeDash, align: st.strokeAlign } : null };
    this.createVectorShape(path, look, 'Shape');
  }

  /** The shape tools' drag, by mode: a shape layer (a filled rectangle or ellipse without a stroke stays a live shape;
   *  anything else a vector layer with the fill and stroke), the outline added to the work path, or painted pixels. */
  drawShape(a: Pt, b: Pt, rect: Rect): void {
    const p = this.current, st = this.shapeSettings, kind = st.kind;
    if (!p) return;
    const line = kind === 'line' || kind === 'arrow';
    if (line ? Math.hypot(b.x - a.x, b.y - a.y) < 2 : rect.w < 1 || rect.h < 1) return;
    const colour = (c: 'fg' | 'bg' | 'none'): RGB | null => (c === 'fg' ? { ...this.fg } : c === 'bg' ? { ...this.bg } : null);
    const fill = line ? colour(st.fill === 'none' ? 'fg' : st.fill) : colour(st.fill), strokeC = colour(st.stroke);
    const look: ShapeStyle = { fill, stroke: strokeC ? { color: strokeC, width: Math.max(0.5, st.strokeWidth), dash: st.strokeDash, align: st.strokeAlign } : null };
    if (!look.fill && !look.stroke) { this.notice('Choose a fill or a stroke for the shape.'); return; }
    const path = line ? linePath(kind as 'line' | 'arrow', a, b, st) : boxedShapePath(kind as 'polygon' | 'star' | 'heart' | 'custom' | 'triangle' | 'rectangle' | 'ellipse', rect, st);
    const name = { rectangle: 'Rectangle', ellipse: 'Ellipse', triangle: 'Triangle', polygon: 'Polygon', star: 'Star', line: 'Line', arrow: 'Arrow', heart: 'Heart', custom: 'Custom Shape' }[kind];
    if (st.mode === 'path') {
      // Path: the outline joins the work path (one undoable edit when there is one).
      const vp = this.workPath;
      this.beginPathEdit();
      this.setWorkPath({ subpaths: [...(vp?.subpaths ?? []), ...path.subpaths] });
      this.endPathEdit();
      return;
    }
    if (st.mode === 'pixels') {
      // Pixels: painted into the active layer, fill then stroke, in one step.
      this.paintPath(name, (c, shape) => {
        if (look.fill) { c.fillStyle = rgbCss(look.fill); c.fill(shape); }
        if (look.stroke) strokeShape(c, shape, look.stroke, path.subpaths.every((sp) => sp.closed));
      }, path);
      return;
    }
    if ((kind === 'rectangle' || kind === 'ellipse') && look.fill && !look.stroke) { this.createShape(rect, look.fill); return; }
    this.createVectorShape(path, look, name);
  }

  clipboard: { surface: Surface; x: number; y: number; w: number; h: number; stamp: string } | null = null;
  selectionAmounts = { expand: 1, contract: 1, feather: 5, border: 4, smooth: 2 };
  /** Select > Modify "Apply effect at canvas bounds", kept between uses. */
  selectionAtBounds = false;

  /** View > Rulers, Guides, Grid and Lock Guides; the grid's spacing and subdivisions in document pixels. */
  view = { rulers: false, guides: true, slices: false, grid: false, guidesLocked: false, gridSpacing: 100, gridSubdivisions: 4, patternPreview: false, pixelArt: false, parCorrection: false };
  /** A guide being dragged out of a ruler or across the canvas, drawn but not yet in the document. */
  guideDraft: { axis: 'x' | 'y'; at: number; index: number | null } | null = null;

  setView(patch: Partial<Engine['view']>): void {
    Object.assign(this.view, patch);
    this.emit('overlay', null);
    this.emit('options', null);
    if ('patternPreview' in patch || 'pixelArt' in patch) this.emit('render', null);   // the scene itself changes
  }

  /** View > New Guide, or a guide dropped from a ruler: at a whole or half pixel, kept within the canvas. */
  addGuide(axis: 'x' | 'y', at: number): void { GD.addGuide(this.guideHost, axis, at); }

  moveGuide(index: number, at: number): void { GD.moveGuide(this.guideHost, index, at); }

  removeGuide(index: number): void { GD.removeGuide(this.guideHost, index); }

  /** View > New Guide Layout (27.11): `columns` and `rows` with gutters inside margins, laid out:
   *  guides at the margins and at both edges of every gutter (a gutter of 0 puts one guide between cells). `clear`
   *  replaces the existing guides. One undo step. */
  guideLayout(o: { columns: number; rows: number; gutterX: number; gutterY: number; margin: { top: number; left: number; bottom: number; right: number }; clear: boolean }): void { GD.guideLayout(this.guideHost, o); }

  /** View > New Guides From Shape (27.11): guides on the four edges of the active shape layer's path, else of the selection. */
  guidesFromShape(): boolean { return GD.guidesFromShape(this.guideHost); }
  clearGuides(): void { GD.clearGuides(this.guideHost); }

  /** Slice tool: a user slice on whole pixels, kept within the canvas; returns false when it has no area. */
  addSlice(r: { x: number; y: number; w: number; h: number }): boolean { return GD.addSlice(this.guideHost, r); }
  removeSlice(id: string): void {
    GD.removeSlice(this.guideHost, id);
    if (this.activeSlice === id && !this.current?.doc.slices?.some((s) => s.id === id)) { this.activeSlice = null; this.emit('options', null); }
  }
  /** Delete or Backspace with the Slice tool, and Delete Slice: the selected slice goes, as one step; false when none is selected. */
  deleteActiveSlice(): boolean {
    const id = this.activeSlice;
    if (!id || !this.current?.doc.slices?.some((s) => s.id === id)) return false;
    this.removeSlice(id);
    return true;
  }
  clearSlices(): void { GD.clearSlices(this.guideHost); }

  /** The slice Slice Options edits and the Slice tool last made or clicked; not saved with the document. */
  activeSlice: string | null = null;

  /** Changes a slice's name, link, alt text or rectangle (whole pixels, kept inside the canvas) as one undo step. */
  updateSlice(id: string, patch: Partial<Omit<import('./types').DocSlice, 'id'>>, step = 'Slice Options'): void { GD.updateSlice(this.guideHost, id, patch, step); }

  /** Layer > New Layer Based Slice: a slice over the visible pixels of the active layer, tied to that layer. */
  addLayerSlice(): boolean { return GD.addLayerSlice(this.guideHost); }

  /** The guide within `tol` screen pixels of a screen point, nearest first; null when guides are hidden or locked. */
  guideAt(screen: Pt, tol = 4): number | null { return GD.guideAt(this.guideHost, screen, tol); }

  beginLive(name: string): boolean {
    const p = this.current;
    if (!p || this.stroke || this.liveOpen) return false;
    this.settle();
    p.history.begin(name, p.snapshot());
    this.liveOpen = p;
    return true;
  }

  updateLive(fn: (p: Project) => void): void {
    const p = this.liveOpen;
    if (!p) return;
    fn(p);
    this.emit('doc', null);
    this.emit('render', null);
  }

  commitLive(): void {
    const p = this.liveOpen;
    if (!p) return;
    this.liveOpen = null;
    p.history.end(p.snapshot());
    this.refresh();
  }

  cancelLive(): void {
    const p = this.liveOpen;
    if (!p) return;
    const snap = p.history.abort();
    this.liveOpen = null;
    if (snap) { p.doc = snap.doc; p.selection = snap.selection; }
    this.refresh();
  }

  setPreview(layerId: ID | null, target: Target = 'pixels', surface: Surface | null = null, transform?: Transform): void {
    if (!layerId) this.previewToken++;
    const p = this.current;
    this.preview = p && layerId && surface ? { project: p, layerId, target, surface, ...(transform ? { transform } : {}) } : null;
    this.emit('render', null);
  }

  targetImage(): { layerId: ID; target: Target; image: ImageData; width: number; height: number; unitsPerPixel: number } | null { return IE.targetImage(this.editHost); }

  get targetSize(): { width: number; height: number } | null {
    const p = this.current, l = p?.activeLayer ?? null;
    if (!p || !l || l.isGroup || l.tiled) return null;
    const r = p.maskTarget && l.mask ? l.mask.raster : l.raster;
    return r ? { width: r.width, height: r.height } : null;
  }

  targetCrop(x: number, y: number, w: number, h: number, scale: number): { image: ImageData; frame: LibFrame } | null {
    const p = this.current, l = p?.activeLayer ?? null;
    if (!p || !l || l.isGroup || l.tiled) return null;
    const onMask = p.maskTarget && !!l.mask, r = onMask ? l.mask?.raster ?? null : l.raster;
    if (!r || w < 1 || h < 1) return null;
    const W = Math.max(1, Math.round(w * scale)), H = Math.max(1, Math.round(h * scale)), c = ctxOf(createSurface(W, H));
    c.drawImage(r.canvas, x, y, w, h, 0, 0, W, H);
    const img = c.getImageData(0, 0, W, H), f = this.filterFrame(p, onMask ? l.mask?.placement ?? l.transform : l.transform, r.width, r.height);
    const at = (q: Rect): Rect => ({ x: (q.x - x) * scale, y: (q.y - y) * scale, w: q.w * scale, h: q.h * scale });
    return { image: onMask ? toGray(img) : img, frame: { area: at(f.area), canvas: at(f.canvas), doc: f.doc } };
  }

  private coverageFor(p: Project, layer: Layer, target: Target, w: number, h: number): Uint8ClampedArray | null {
    const sel = p.selection;
    if (!sel) return null;
    const t = target === 'mask' ? (layer.mask?.placement ?? layer.transform) : layer.transform;
    const s = createSurface(w, h), c = ctxOf(s);
    setMat(c, mul(invert(placement(t, w, h)), translation(sel.x, sel.y)));
    c.drawImage(sel.surface(), 0, 0);
    return new Uint8ClampedArray(c.getImageData(0, 0, w, h).data);
  }

  private blendThrough(src: ImageData, out: ImageData, cov: Uint8ClampedArray): ImageData { return IE.blendThrough(src, out, new ImageData(new Uint8ClampedArray(cov), src.width, src.height)); }

  private canGrow(p: Project, l: Layer): boolean { return !p.selection && !l.mask && !!l.raster && !l.locks?.transparency; }

  filterFrame(p: Project, t: Transform, w: number, h: number, shift = 0): LibFrame {
    const m = invert(placement(t, w, h)), snap = (v: number): number => Math.round(v * 1e6) / 1e6;
    const local = (r: Rect): Rect => {
      const b = boundsOf([applyMat(m, r.x, r.y), applyMat(m, r.x + r.w, r.y), applyMat(m, r.x + r.w, r.y + r.h), applyMat(m, r.x, r.y + r.h)]);
      return { x: snap(b.x) + shift, y: snap(b.y) + shift, w: snap(b.w), h: snap(b.h) };
    };
    const canvas = local({ x: 0, y: 0, w: p.doc.width, h: p.doc.height });
    return { area: p.selection ? local(p.selection.rect) : canvas, canvas, doc: { w: p.doc.width, h: p.doc.height } };
  }

  previewImageEdit(run: (src: ImageData, scale: number, frame?: LibFrame) => ImageData | Promise<ImageData>, grow = 0, maxPixels = 2_000_000): void { ++this.previewToken; IE.previewImageEdit(this.editHost, run, grow, maxPixels); }

  /** Filters on layers past this many pixels run in bands (1.60.9, DEV_PLAN 26.4); settable so a check can force either way. */
  bandFrom = 16_000_000;

  private bandFrame(f: LibFrame, dy: number): LibFrame {
    return { ...f, area: { ...f.area, y: f.area.y - dy }, canvas: { ...f.canvas, y: f.canvas.y - dy } };
  }

  /** A filter whose effect reaches `apron` pixels and does not depend on where it is, run on a large active layer in
   *  bands of 512 rows (1.60.9, DEV_PLAN 26.4): each read with `apron` rows above and below, so its result is what the
   *  whole layer at once gives, byte for byte; written back in 512-pixel tiles through the selection (each band's own
   *  coverage, blended as `blendThrough` blends), each changed tile's undo its before pixels only (its after read at
   *  undo), and the step's tiles then sent to the undo store. One step. False when this is not a case it handles the
   *  same as the whole-layer path (smaller layers, masks, smart and shape layers, deep, CMYK and Lab documents, a layer
   *  the filter would grow), for the caller to run that path. */
  bandedFilter(name: string, run: (src: ImageData, frame?: LibFrame) => ImageData, apron: number, grow = 0): boolean | 'refused' {
    const p = this.current, l = p?.activeLayer;
    if (!p || !l?.raster || this.stroke || p.maskTarget || l.smart || l.vector || l.fillContent || !this.paintable(l)) return false;
    if (l.raster.width * l.raster.height <= this.bandFrom || (p.doc.depth ?? 8) > 8 || p.doc.mode === 'cmyk' || p.doc.mode === 'lab') return false;
    if (grow > 0 && this.canGrow(p, l)) return this.bandedGrow(name, run, apron, grow, p, l);   // as applyImageEdit grows
    // Bands at least as tall as the apron, and each band's source read before the band above it is written, so the
    // apron above a band lies in rows not yet written and every band filters the layer's original pixels.
    const r = l.raster, W = r.width, H = r.height, A = Math.max(0, Math.ceil(apron)), B = Math.max(512, A), T = 512;
    // Room: two bands read with their apron, one filtered, its coverage, and the tiles' before pixels until stored.
    if (!this.room((B + 2 * A) * W * 4 * 4 + W * H * 4, name)) return 'refused';   // said so; not done
    this.preview = null;
    const sel = p.selection, m = sel ? mul(invert(placement(l.transform, W, H)), translation(sel.x, sel.y)) : null, f0 = this.filterFrame(p, l.transform, W, H);
    const source = (y0: number): ImageData => { const a0 = Math.max(0, y0 - A), a1 = Math.min(H, Math.min(H, y0 + B) + A); return r.ctx.getImageData(0, a0, W, a1 - a0); };
    p.history.begin(name, p.snapshot());
    try {
      let src = source(0);
      for (let y0 = 0; y0 < H; y0 += B) {
        const y1 = Math.min(H, y0 + B), h = y1 - y0, a0 = Math.max(0, y0 - A);
        const out = run(src, this.bandFrame(f0, a0));
        src = y1 < H ? source(y1) : src;   // the next band's original pixels, before this band is written
        let cov: Uint8ClampedArray | null = null;
        if (sel && m) { const s = createSurface(W, h), c = ctxOf(s); setMat(c, mul(translation(0, -y0), m)); c.drawImage(sel.surface(), 0, 0); cov = c.getImageData(0, 0, W, h).data; }
        for (let x0 = 0; x0 < W; x0 += T) {
          const w = Math.min(T, W - x0), before = r.read(x0, y0, w, h), tile = new ImageData(w, h);
          for (let yy = 0; yy < h; yy++) { const so = ((y0 - a0 + yy) * W + x0) * 4; tile.data.set(out.data.subarray(so, so + w * 4), yy * w * 4); }
          if (l.locks?.transparency) for (let i = 3; i < tile.data.length; i += 4) tile.data[i] = before.data[i];   // Lock Transparency keeps the alpha
          let after = tile;
          if (cov) { const ct = new Uint8ClampedArray(w * h * 4); for (let yy = 0; yy < h; yy++) { const so = (yy * W + x0) * 4; ct.set(cov.subarray(so, so + w * 4), yy * w * 4); } after = this.blendThrough(before, tile, ct); }
          if (sameBytes(before.data, after.data)) continue;
          r.ctx.putImageData(after, x0, y0);
          p.history.addPatch({ raster: r, x: x0, y: y0, before, after: new ImageData(1, 1), lazy: true });
        }
      }
      r.touch();
      if (l.shape) p.updateLayer(l.id, { shape: null });
    } finally {
      p.history.end(p.snapshot());
      this.refresh();
    }
    void this.pageNewest(p);
    return true;
  }

  /** `bandedFilter` with the bands filtered on the worker pool (36.18, band-pool.ts): the same bands, aprons, tiles,
   *  selection blend and one undo step, the same bytes (each band is filtered by the same kernel, in a worker or, where
   *  a worker fails, here). A band's source is read when it is sent and a band is written only after the next one has
   *  been sent, so every band still filters the layer's original pixels; results are written in order. Edits wait
   *  (`busyWith`) while it runs. False where `bandedFilter` would be used instead: no workers, layers under the pool's
   *  threshold, or any case `bandedFilter` declines, and a filter that grows the layer. */
  bandedFilterPool(name: string, job: { kind: FilterKind; settings: FilterSettings; seed: number }, run: (src: ImageData, frame?: LibFrame) => ImageData, apron: number, grow = 0): Promise<boolean> | 'refused' | false {
    const p = this.current, l = p?.activeLayer;
    if (!p || !l?.raster || this.stroke || p.maskTarget || l.smart || l.vector || l.fillContent || !this.paintable(l)) return false;
    if (l.raster.width * l.raster.height <= Math.max(this.bandFrom, POOL_FROM) || (p.doc.depth ?? 8) > 8 || p.doc.mode === 'cmyk' || p.doc.mode === 'lab') return false;
    if (grow > 0 && this.canGrow(p, l)) return false;
    if (!bandPoolReady()) return false;
    if (this.waiting()) return 'refused';
    const r = l.raster, W = r.width, H = r.height, A = Math.max(0, Math.ceil(apron)), B = Math.max(512, A), T = 512, N = bandPoolSize();
    if (!this.room((N + 1) * (B + 2 * A) * W * 4 * 3 + W * H * 4, name)) return 'refused';
    this.preview = null;
    const sel = p.selection, m = sel ? mul(invert(placement(l.transform, W, H)), translation(sel.x, sel.y)) : null, f0 = this.filterFrame(p, l.transform, W, H);
    const write = async (q: { y0: number; y1: number; a0: number; src: ImageData; out: Promise<ImageData | null> }): Promise<void> => {
      const out = (await q.out) ?? run(q.src, this.bandFrame(f0, q.a0)), y0 = q.y0, h = q.y1 - y0;
      if (!this.projects.includes(p)) return;
      let cov: Uint8ClampedArray | null = null;
      if (sel && m) { const s = createSurface(W, h), c = ctxOf(s); setMat(c, mul(translation(0, -y0), m)); c.drawImage(sel.surface(), 0, 0); cov = c.getImageData(0, 0, W, h).data; }
      for (let x0 = 0; x0 < W; x0 += T) {
        const w = Math.min(T, W - x0), before = r.read(x0, y0, w, h), tile = new ImageData(w, h);
        for (let yy = 0; yy < h; yy++) { const so = ((y0 - q.a0 + yy) * W + x0) * 4; tile.data.set(out.data.subarray(so, so + w * 4), yy * w * 4); }
        if (l.locks?.transparency) for (let i = 3; i < tile.data.length; i += 4) tile.data[i] = before.data[i];   // Lock Transparency keeps the alpha
        let after = tile;
        if (cov) { const ct = new Uint8ClampedArray(w * h * 4); for (let yy = 0; yy < h; yy++) { const so = (yy * W + x0) * 4; ct.set(cov.subarray(so, so + w * 4), yy * w * 4); } after = this.blendThrough(before, tile, ct); }
        if (sameBytes(before.data, after.data)) continue;
        r.ctx.putImageData(after, x0, y0);
        p.history.addPatch({ raster: r, x: x0, y: y0, before, after: new ImageData(1, 1), lazy: true });
      }
    };
    this.busyWith = name;
    return (async (): Promise<boolean> => {
    p.history.begin(name, p.snapshot());
    try {
      const queue: { y0: number; y1: number; a0: number; src: ImageData; out: Promise<ImageData | null> }[] = [];
      for (const b of bandPlan(H, A, B)) {
        const src = r.ctx.getImageData(0, b.a0, W, b.a1 - b.a0);
        queue.push({ y0: b.y0, y1: b.y1, a0: b.a0, src, out: runBandOnPool(job.kind, job.settings, job.seed, src, this.bandFrame(f0, b.a0)) });
        while (queue.length > N) await write(queue.shift()!);   // band j is written once band j + 1 is sent
      }
      while (queue.length) await write(queue.shift()!);
      r.touch();
      if (l.shape) p.updateLayer(l.id, { shape: null });
    } finally {
      p.history.end(p.snapshot());
      this.busyWith = null;
      this.refresh();
    }
    void this.pageNewest(p);
    return true;
    })();
  }

  /** A tiled layer's tiles in view as GPU layers (1.62.9, DEV_PLAN 26.6g): each tile its own texture (2,048 a side,
   *  within any GPU's limit) at the level suiting the view (a half, a quarter, down to a sixteenth of its side, so a
   *  frame's textures stay about one screen's worth at any zoom), an empty tile as the base colour stretched over it, a
   *  tile on disk as its preview while it is fetched, each shown tile stamped as drawTo stamps those it draws. Tiles do
   *  not overlap, so each drawn with the layer's opacity and blend equals the layer drawn whole. */
  private tileSpecs(t: TiledRaster, tf: Transform, opacity: number, blend: BlendMode, folders: GpuMaskSpec[] | undefined, view: { matrix: Mat; width: number; height: number }, out: GpuLayerSpec[]): void {
    const L = placement(tf, t.width, t.height), S = mul(view.matrix, L), scale = Math.hypot(S[0], S[1]);
    const k = Math.max(0, Math.min(4, Math.floor(Math.log2(1 / Math.max(scale, 1e-6))))), full = scale > 1 / PREVIEW;
    const base = t.baseSurface(), shown: number[] = [];
    for (let ty = 0; ty < t.rows; ty++) {
      for (let tx = 0; tx < t.cols; tx++) {
        const key = ty * t.cols + tx, ox = tx * t.tile, oy = ty * t.tile, tw = Math.min(t.tile, t.width - ox), th = Math.min(t.tile, t.height - oy);
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const [px, py] of [[ox, oy], [ox + tw, oy], [ox, oy + th], [ox + tw, oy + th]]) {
          const sx = S[0] * px + S[2] * py + S[4], sy = S[1] * px + S[3] * py + S[5];
          x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
        }
        if (x1 <= 0 || y1 <= 0 || x0 >= view.width || y0 >= view.height) continue;
        const state = t.stateOf(key);
        let lv = t.levelOf(key, k);
        if (state !== 'empty') shown.push(key);
        if (!lv && state === 'paged') { lv = t.levelOf(key, 4); if (full) t.onMissing?.(t, key); }
        if (lv) out.push({ image: lv.image, version: lv.version, width: lv.image.width, height: lv.image.height, matrix: mul(L, [lv.sx, 0, 0, lv.sy, ox, oy]), opacity, blend, folders });
        else if (state === 'empty' && base) out.push({ image: base, version: 0, width: 1, height: 1, matrix: mul(L, [tw, 0, 0, th, ox, oy]), opacity, blend, folders });
      }
    }
    t.touchView(shown, full);
  }

  /** A fresh pixel layer (no pixels yet) on a giant document, given tiles, empty and transparent, costing nothing, in
   *  place of the full-size canvas painting would give it, which the browser cannot make (1.62.8). A document is giant
   *  past one canvas, or once it has a tiled layer (made so past the single-canvas limits). */
  private tileFreshLayer(p: Project): void {
    const l = p.activeLayer;
    if (!l || l.raster || l.tiled || l.isGroup || l.adjustment || l.shape || l.vector || l.smart || liveText(l)) return;
    const W = p.doc.width, H = p.doc.height;
    if (W * H <= CANVAS_PIXELS && W <= CANVAS_SIDE && H <= CANVAS_SIDE && !p.doc.layers.some((x) => x.tiled)) return;
    const t = new TiledRaster(W, H);
    t.onMissing = (tr, key) => this.bringTile(tr, key);
    p.updateLayer(l.id, { tiled: t });
  }

  /** Whether the active layer is a giant one kept in tiles (1.62.7: the filter panel sends bandable filters there). */
  activeTiled(): boolean { return !!this.current?.activeLayer?.tiled; }

  /** A filter on a giant layer kept in tiles (1.62.7, DEV_PLAN 26.6e), in place, a band at a time: each band read with
   *  `apron` rows around it, its tiles brought back first, the next band's source read before this band is written (so
   *  every band filters original pixels), written back a 512-pixel tile at a time, each changed tile's before and after
   *  sent at once to the engine's store, so the step's undo (up to 2.4 GB a side at 600 MP) never sits in memory: undo
   *  and redo stream it back a tile at a time. Tiles behind are paged out as it goes; edits wait while it runs. A
   *  blur's spill past the canvas is not kept here (an ordinary layer grows to keep it; a giant one cannot). */
  async bandedFilterTiled(name: string, run: (src: ImageData, frame?: LibFrame) => ImageData, apron: number): Promise<boolean | 'refused'> {
    const p = this.current, l = p?.activeLayer, t = l?.tiled, store = this.undoStore;
    if (!p || !l || !t || this.stroke) return false;
    if (this.waiting() || !this.paintable(l, true)) return 'refused';
    if (!store) { this.notice(`${name} on a document this large needs formvis's engine running: its undo is kept on the engine's disk.`, 'error'); return 'refused'; }
    if (p.selection || p.maskTarget) { this.notice(`${name} inside a selection or on a mask, on a layer kept in tiles, comes in a later release.`); return 'refused'; }
    const W = t.width, H = t.height, A = Math.max(0, Math.ceil(apron)), B = Math.max(A, 16, Math.min(512, Math.floor(2_097_152 / W)));
    this.busyWith = name;
    this.notice(`${name} runs over the picture a band at a time, keeping its undo on disk; editing waits until it finishes.`);
    p.history.begin(name, p.snapshot());
    try {
      const source = async (y0: number): Promise<{ img: ImageData; a0: number }> => {
        const a0 = Math.max(0, y0 - A), a1 = Math.min(H, Math.min(H, y0 + B) + A);
        await t.ensure(0, a0, W, a1 - a0, store);
        return { img: t.read(0, a0, W, a1 - a0), a0 };
      };
      let src = await source(0);
      const f0 = this.filterFrame(p, l.transform, W, H);
      for (let y0 = 0; y0 < H; y0 += B) {
        const y1 = Math.min(H, y0 + B), h = y1 - y0, out = run(src.img, this.bandFrame(f0, src.a0)), a0 = src.a0;
        if (y1 < H) src = await source(y1);   // the next band's originals, before this band is written
        await t.ensure(0, y0, W, h, store);
        for (let x0 = 0; x0 < W; x0 += 512) {
          const w = Math.min(512, W - x0), before = t.read(x0, y0, w, h), after = new ImageData(w, h);
          for (let yy = 0; yy < h; yy++) { const so = ((y0 - a0 + yy) * W + x0) * 4; after.data.set(out.data.subarray(so, so + w * 4), yy * w * 4); }
          if (l.locks?.transparency) for (let i = 3; i < after.data.length; i += 4) after.data[i] = before.data[i];   // Lock Transparency keeps the alpha
          if (sameBytes(before.data, after.data)) continue;
          t.write(after, x0, y0);
          const [kb, ka] = await Promise.all([store.put(new Uint8Array(before.data.buffer) as Uint8Array<ArrayBuffer>), store.put(new Uint8Array(after.data.buffer) as Uint8Array<ArrayBuffer>)]);
          p.history.addPatch({ raster: t, x: x0, y: y0, before: new ImageData(1, 1), after: new ImageData(1, 1), disk: { before: kb, after: ka, w, h } });
        }
        await this.pageTiles();
      }
    } catch (err) {
      this.notice(`${name} stopped part way (what it did is one step, undoable): ${String((err as Error)?.message ?? err)}`, 'error');
    } finally {
      p.history.end(p.snapshot());
      const e = p.history.peekUndo();
      if (e && e.patches.some((q) => q.disk)) e.streamed = true;   // undo and redo stream it from the store
      this.busyWith = null;
      this.refresh();
    }
    return true;
  }

  /** `grown` in bands (1.60.9): the layer made larger by the filter's reach on every side and the filter run on it a
   *  band of 512 rows at a time, each drawn from the old layer with `apron` rows around it onto transparent at the same
   *  offset, its middle rows written into the larger layer; the same pixels and placement as `grown`, one step, the
   *  old layer kept for undo as there, with no whole-layer copy in or out. */
  private bandedGrow(name: string, run: (src: ImageData, frame?: LibFrame) => ImageData, apron: number, grow: number, p: Project, l: Layer): boolean | 'refused' {
    // Bands of 256 rows (1.61.3): with the new layer beside the old, the peak at 150 MP stays inside a 4 GB computer's budget.
    const r = l.raster as Raster, g = Math.ceil(grow), A = Math.max(g, Math.ceil(apron)), Wb = r.width + 2 * g, Hb = r.height + 2 * g, B = 256;
    if (!this.room(Wb * Hb * 4 + (B + 2 * A) * Wb * 4 * 3, name)) return 'refused';   // said so; not done
    this.preview = null;
    const big = new Raster(Wb, Hb), f0 = this.filterFrame(p, l.transform, r.width, r.height, g);
    for (let y0 = 0; y0 < Hb; y0 += B) {
      const y1 = Math.min(Hb, y0 + B), a0 = Math.max(0, y0 - A), a1 = Math.min(Hb, y1 + A);
      const band = createSurface(Wb, a1 - a0), c = ctxOf(band);
      c.drawImage(r.canvas, g, g - a0);
      const out = run(c.getImageData(0, 0, Wb, a1 - a0), this.bandFrame(f0, a0));
      big.ctx.putImageData(out, 0, a0, 0, y0 - a0, Wb, y1 - y0);
      band.width = 0; band.height = 0;
    }
    big.touch();
    const t = l.transform, sx = t.w / r.width, sy = t.h / r.height;
    this.edit(name, (q) => { q.updateLayer(l.id, { raster: big, transform: { ...t, x: t.x - g * sx, y: t.y - g * sy, w: t.w + 2 * g * sx, h: t.h + 2 * g * sy }, shape: null }); return true; });
    void this.pageRasterOut(p, r);   // the old layer, kept only for undo, to the undo store, its canvas freed (1.61.3)
    return true;
  }

  /** The newest step's lazy tiles sent to the undo store at once (a banded filter's whole-layer undo), each let go only
   *  once stored, and only if still lazy and still in the history (an undo or a close meanwhile keeps them). */
  private async pageNewest(p: Project): Promise<void> {
    const store = this.undoStore, e = p.history.peekUndo();
    if (!store || !e) return;
    for (const q of e.patches) {
      if (q.paged || !q.lazy) continue;
      const w = q.before.width, h = q.before.height, bytes = new Uint8Array(w * h * 4);
      bytes.set(q.before.data, 0);
      let key: string;
      try { key = await store.put(bytes); } catch { return; }
      if (!this.projects.includes(p)) { store.drop(key); return; }
      if (q.paged || !q.lazy || !p.history.entries().some((s) => s.patches.includes(q))) { store.drop(key); continue; }
      q.paged = { key, w, h };
      q.before = new ImageData(1, 1);
    }
    this.emit('history', null);
  }

  mapImage(id: ID, side = 256): LibImage | null {
    const p = this.projects.find((x) => x.id === id);
    if (!p) return null;
    const full = (this.composesFloats(p) ? this.composedRendition(p)?.canvas : null) ?? renderDoc(this.work, p.doc);
    const W = p.doc.width, H = p.doc.height, k = Math.min(1, side / Math.max(W, H)), w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
    const s = createSurface(w, h), c = ctxOf(s);
    c.fillStyle = '#808080';
    c.fillRect(0, 0, w, h);
    c.imageSmoothingQuality = 'high';
    c.drawImage(full, 0, 0, w, h);
    const d = c.getImageData(0, 0, w, h).data;
    let bin = '';
    for (let i = 0; i < w * h; i += 4096) {
      const n = Math.min(4096, w * h - i), part = new Array<number>(n * 2);
      for (let j = 0; j < n; j++) { part[j * 2] = d[(i + j) * 4]; part[j * 2 + 1] = d[(i + j) * 4 + 1]; }
      bin += String.fromCharCode(...part);
    }
    s.width = 0; s.height = 0;
    return { name: p.name, w0: W, h0: H, w, h, rg: btoa(bin) };
  }

  pathLines(which?: string | null): LibPath | null {
    const p = this.current;
    if (!p) return null;
    const set = this.paths, usable = set.list.filter((n) => !n.shape && n.path.subpaths.some((sp) => sp.anchors.length > 0));
    const n = which ? usable.find((x) => x.id === which || x.name === which) ?? (which.toLowerCase() === 'work' ? usable.find((x) => x.work) : undefined) : usable.find((x) => x.id === set.active) ?? usable.find((x) => x.work) ?? usable[0];
    if (!n) return null;
    const subs = n.path.subpaths.filter((sp) => sp.anchors.length > 0).slice(0, 256), sample = (step: number): number[][] => subs.map((sp) => samplePath(sp, step).flatMap((q) => [Math.round(q.x * 100) / 100, Math.round(q.y * 100) / 100]));
    let lines = sample(2);
    const count = lines.reduce((s, l) => s + l.length, 0);
    if (count > 300_000) lines = sample(2 * Math.ceil(count / 300_000));
    return { name: n.name, w0: p.doc.width, h0: p.doc.height, lines };
  }

  private emptyPixelLayer(p: Project | null, l: Layer | null | undefined): l is Layer {
    return !!p && !!l && !l.raster && !l.isGroup && !l.adjustment && !l.tiled && !l.smart && !l.vector && !l.shape && !liveText(l) && !p.maskTarget && (p.doc.depth ?? 8) === 8 && (p.doc.mode ?? 'rgb') === 'rgb';
  }

  get canGivePixels(): boolean { const p = this.current ?? null; return this.emptyPixelLayer(p, p?.activeLayer); }

  givePixels(): boolean {
    const p = this.current ?? null, l = p?.activeLayer;
    if (!p || !this.emptyPixelLayer(p, l) || this.locked(l, 'pixels')) return false;
    this.ensurePixels(p, l);
    this.refresh();
    return true;
  }

  private fadeStep(): { name: string; was: Layer; layer: Layer; patches: readonly PixelPatch[] } | null {
    const p = this.current, l = p?.activeLayer, e = p?.history.last;
    if (!p || !l?.raster || !e || e.streamed || e.afterRev !== p.history.revision || p.maskTarget || l.tiled || l.smart || l.vector || l.fillContent || (p.doc.depth ?? 8) !== 8 || (p.doc.mode ?? 'rgb') !== 'rgb') return null;
    const r = l.raster, was = e.before.doc.layers.find((x) => x.id === l.id);
    if (!was?.raster || e.before.doc.layers.length !== p.doc.layers.length || e.patches.some((q) => q.raster !== r || q.paged || q.disk)) return null;
    if (was.raster === r) return e.patches.length ? { name: e.name, was, layer: l, patches: e.patches } : null;
    const t0 = was.transform, t1 = l.transform, flat = (t: Transform): boolean => !t.rotation && !t.flipX && !t.flipY;
    const same = flat(t0) && flat(t1) && Math.abs(t0.w / was.raster.width - t1.w / r.width) < 1e-9 && Math.abs(t0.h / was.raster.height - t1.h / r.height) < 1e-9;
    return same ? { name: e.name, was, layer: l, patches: e.patches } : null;
  }

  get fadeName(): string | null { return this.fadeStep()?.name ?? null; }

  fadeSource(): { name: string; before: ImageData } | null {
    const f = this.fadeStep();
    if (!f) return null;
    const r = f.layer.raster as Raster, wr = f.was.raster as Raster;
    if (wr !== r) {
      const t0 = f.was.transform, t1 = f.layer.transform, s = createSurface(r.width, r.height), c = ctxOf(s);
      c.drawImage(wr.canvas, Math.round((t0.x - t1.x) / (t1.w / r.width)), Math.round((t0.y - t1.y) / (t1.h / r.height)));
      const before = c.getImageData(0, 0, r.width, r.height);
      s.width = 0; s.height = 0;
      return { name: f.name, before };
    }
    const before = r.read();
    for (let i = f.patches.length - 1; i >= 0; i--) {
      const q = f.patches[i], pb = q.before, w = Math.min(pb.width, r.width - q.x);
      for (let y = 0; y < pb.height && q.y + y < r.height; y++) before.data.set(pb.data.subarray(y * pb.width * 4, (y * pb.width + w) * 4), ((q.y + y) * r.width + q.x) * 4);
    }
    return { name: f.name, before };
  }

  averageFill(): void {
    if (!this.room(this.layerBytes() * 3, 'Average')) return;
    const al = this.current?.activeLayer;
    if ((al?.smart || al?.vector || al?.fillContent) && !(this.current?.maskTarget && al.mask)) { this.notice(al.vector ? SHAPE_NOTICE : al.fillContent ? FILL_NOTICE : SMART_NOTICE); return; }
    const p0 = this.current, l0 = p0?.activeLayer ?? null;
    if (!p0 || !this.paintable(l0)) { this.notice('Select a pixel layer first.'); return; }
    this.regionEdit('Average', ({ raster, target, rect }) => {
      const p = this.current as Project, l = p.activeLayer as Layer;
      const src = target === 'mask' ? toGray(raster.read()) : raster.read();
      const cov = this.coverageFor(p, l, target, raster.width, raster.height), out = averageImage(src, cov);
      let result = cov ? this.blendThrough(src, out, cov) : out;
      if (target === 'mask') result = fromGray(result);
      raster.ctx.putImageData(result, 0, 0, rect.x, rect.y, rect.w, rect.h);
    });
  }

  applyImageEdit(name: string, run: (src: ImageData, scale: number, frame?: LibFrame) => ImageData, grow = 0, peak = 2): void { IE.applyImageEdit(this.editHost, name, run, grow, peak); }

  /** applyImageEdit with the work done off the main thread: the source is prepared as the synchronous path prepares
   *  it (padded for a filter that reaches past the layer, grown to the canvas as painting grows a layer, grey for a
   *  mask), `run` computes on it in the background while the interface stays live, and the result goes through
   *  applyImageEdit as one undo step. If the layer changed meanwhile nothing is applied; if the pixels applyImageEdit
   *  sees ever differ in size from those computed on, `fallback` recomputes on them there. */
  async applyImageEditAsync(name: string, run: (src: ImageData, scale: number, frame?: LibFrame) => Promise<ImageData>, grow: number, fallback: (src: ImageData, scale: number, frame?: LibFrame) => ImageData, peak = 2): Promise<boolean> {
    if (!this.room(this.layerBytes() * peak, name)) return false;   // its caller's measured peak (1.61.1)
    const al = this.current?.activeLayer;
    if ((al?.smart || al?.vector || al?.fillContent) && !(this.current?.maskTarget && al.mask)) { this.notice(al.vector ? SHAPE_NOTICE : al.fillContent ? FILL_NOTICE : SMART_NOTICE); return false; }
    const p0 = this.current, l0 = p0?.activeLayer ?? null;
    if (!p0 || !this.paintable(l0)) { this.notice('Select a pixel layer first.'); return false; }
    this.settle();
    const onMask = p0.maskTarget && !!l0.mask, raster = onMask ? l0.mask?.raster ?? null : l0.raster;
    if (!raster) { this.applyImageEdit(name, fallback, grow); return true; }
    const growing = grow > 0 && !onMask && this.canGrow(p0, l0);
    const whole = growing || onMask ? null : this.sourceForEdit(p0, l0);
    const src = whole ? whole.img : growing ? this.grownSource(l0, grow) : toGray(raster.read());
    const frame = whole ? this.filterFrame(p0, whole.t, src.width, src.height) : growing ? this.filterFrame(p0, l0.transform, raster.width, raster.height, Math.ceil(grow)) : this.filterFrame(p0, l0.mask?.placement ?? l0.transform, raster.width, raster.height);
    const doc0 = p0.doc, version = raster.version;
    const out = await this.task(() => run(src, 1, frame));
    if (this.current !== p0 || p0.doc !== doc0 || raster.version !== version) { this.setPreview(null); this.notice(`The layer changed while ${name} ran, so it was not applied.`); return false; }
    this.applyImageEdit(name, (s, k, f) => (s.width === out.width && s.height === out.height ? out : fallback(s, k, f)), grow);
    return true;
  }

  /** The pixels a filter that reaches past the layer works on: the layer padded by its reach, as grown() pads it. */
  private grownSource(l: Layer, grow: number): ImageData {
    const r = l.raster as Raster, g = Math.ceil(grow), big = new Raster(r.width + 2 * g, r.height + 2 * g);
    big.ctx.drawImage(r.canvas, g, g);
    return big.read();
  }

  /** The pixels an edit of the whole layer works on: the layer grown to cover the canvas where growLayer would grow
   *  it, else as it is. */
  private sourceForEdit(p: Project, l: Layer): { img: ImageData; t: Transform } {
    const r = l.raster as Raster, t = l.transform, W = p.doc.width, H = p.doc.height;
    if (!isAxisAligned(t, r.width, r.height) || (t.x <= 0 && t.y <= 0 && t.x + t.w >= W && t.y + t.h >= H)) return { img: r.read(), t };
    const u = unionRect({ x: t.x, y: t.y, w: t.w, h: t.h }, { x: 0, y: 0, w: W, h: H });
    if (u.w > LIMITS.side || u.h > LIMITS.side || u.w * u.h > LIMITS.pixels) return { img: r.read(), t };
    const m = l.mask;
    if (m?.raster && (m.placement || m.raster.width !== r.width || m.raster.height !== r.height)) return { img: r.read(), t };
    const nr = new Raster(u.w, u.h);
    nr.ctx.drawImage(r.canvas, t.x - u.x, t.y - u.y);
    return { img: nr.read(), t: { ...t, x: u.x, y: u.y, w: u.w, h: u.h } };
  }

  private insertAboveActive(p: Project, layer: Layer): void {
    const a = p.activeLayer, list = p.doc.layers.slice();
    let pos = list.length;
    if (a) {
      const at = list.findIndex((l) => l.id === a.id);
      pos = at + 1;
      if (a.isGroup) list.forEach((l, k) => { if (l.parentId === a.id && k >= pos) pos = k + 1; });
    }
    list.splice(pos, 0, layer);
    p.setLayers(list);
    this.focus(p, layer.id);
  }

  /** The folder a new layer lands in: the active layer when it is a folder, else that layer's parent, else the root. */
  private parentForNew(p: Project): ID | null {
    const a = p.activeLayer;
    return a ? (a.isGroup ? a.id : a.parentId) : null;
  }

  /** Layer > Color Match (1.51.3, the capability plan): a layer's colours matched to the picture beneath it, or to a band
   *  around its edge, without touching its pixels: a Curves adjustment clipped to it, each of red, green and blue a line
   *  mapping the layer's mean and spread onto the reference's (the scale kept within a quarter and four). The
   *  adjustment's opacity is the amount; run again on the same layer, it updates its match. One step. */
  colorMatch(layerId: ID, to: 'beneath' | 'around', amount = 1): boolean {
    const p = this.current, l = p?.layer(layerId);
    if (!p || !l?.raster || l.isGroup || l.adjustment) { this.notice('Color Match needs a pixel layer.'); return false; }
    const W = p.doc.width, H = p.doc.height;
    const layerImg = createSurface(W, H), lc = ctxOf(layerImg);
    setMat(lc, placement(l.transform, l.raster.width, l.raster.height));
    lc.drawImage(l.raster.canvas, 0, 0);
    const ld = lc.getImageData(0, 0, W, H).data;
    // The picture without this layer and what is above it.
    const at = p.doc.layers.findIndex((x) => x.id === l.id), hidden = new Map<ID, LayerOverride>();
    p.doc.layers.forEach((x, i) => { if (i >= at && x.id !== l.parentId) hidden.set(x.id, { hidden: true }); });
    const ref = createSurface(W, H);
    this.work.render({ doc: p.doc, target: ref, view: [1, 0, 0, 1, 0, 0], overrides: hidden, quality: 'high' });
    const rd = ctxOf(ref).getImageData(0, 0, W, H).data;
    const inside = new Uint8Array(W * H);
    for (let i = 0; i < inside.length; i++) inside[i] = ld[i * 4 + 3] > 128 ? 1 : 0;
    let where = inside;
    if (to === 'around') {   // a 24-pixel band outside the layer's edge
      const band = new Uint8Array(W * H), R = 24;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!inside[y * W + x]) continue;
        const edge = (x > 0 && !inside[y * W + x - 1]) || (x < W - 1 && !inside[y * W + x + 1]) || (y > 0 && !inside[(y - 1) * W + x]) || (y < H - 1 && !inside[(y + 1) * W + x]);
        if (!edge) continue;
        for (let dy = -R; dy <= R; dy += 2) for (let dx = -R; dx <= R; dx += 2) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H && !inside[Y * W + X] && dx * dx + dy * dy <= R * R) band[Y * W + X] = 1; }
      }
      where = band;
    }
    const stats = (d: Uint8ClampedArray, m: Uint8Array): { mean: number[]; sd: number[]; n: number } => {
      const sum = [0, 0, 0], sq = [0, 0, 0];
      let n = 0;
      for (let i = 0; i < m.length; i++) { if (!m[i] || d[i * 4 + 3] < 8) continue; n++; for (let k = 0; k < 3; k++) { const v = d[i * 4 + k]; sum[k] += v; sq[k] += v * v; } }
      const mean = sum.map((v) => v / Math.max(1, n));
      return { mean, sd: sq.map((v, k) => Math.sqrt(Math.max(0, v / Math.max(1, n) - mean[k] * mean[k]))), n };
    };
    const a = stats(ld, inside), b = stats(rd, where);
    if (a.n < 16 || b.n < 16) { this.notice(to === 'around' ? 'There is too little around the layer to match to.' : 'There is too little beneath the layer to match to.'); return false; }
    const line = (k: number): Array<{ x: number; y: number }> => {
      const scale = Math.max(0.25, Math.min(4, b.sd[k] / Math.max(1, a.sd[k]))), off = b.mean[k] - scale * a.mean[k], f = (x: number): number => scale * x + off;
      const x0 = f(0) < 0 ? -off / scale : 0, x1 = f(255) > 255 ? (255 - off) / scale : 255;
      const c = (v: number): number => Math.round(Math.max(0, Math.min(255, v)));
      return [{ x: c(x0), y: c(f(x0)) }, { x: c(Math.max(x1, x0 + 1)), y: c(f(Math.max(x1, x0 + 1))) }];
    };
    const data = defaultAdjustmentData('curves') as { curves: { channel: string; channels: Array<Array<{ x: number; y: number }>> } };
    data.curves.channels = [data.curves.channels[0], line(0), line(1), line(2)];   // red, green and blue; the composite left straight
    const opacity = Math.max(0, Math.min(1, amount));
    return this.edit('Color Match', (pp) => {
      const existing = pp.doc.layers.find((x) => x.clipId === l.id && x.adjustment?.kind === 'curves' && x.name === 'Color Match');
      if (existing) { pp.updateLayer(existing.id, { adjustment: { kind: 'curves', data }, opacity }); pp.activeId = existing.id; return true; }
      const layer = newLayer('Color Match', pp.doc, { adjustment: { kind: 'curves', data }, clipId: l.id, opacity, parentId: l.parentId });
      const layers = [...pp.doc.layers], i = layers.findIndex((x) => x.id === l.id);
      layers.splice(i + 1, 0, layer);
      pp.setLayers(layers);
      pp.activeId = layer.id;
      return true;
    });
  }

  /** Layer > New Film Layer (1.51.6, film looks): a light leak (warm light entering from an edge, in Screen blend, so it
   *  only brightens) or a frame (a black film edge with rounded corners, a white print border, or a thin line), each a
   *  pixel layer at the document's size that can be moved, scaled, erased, masked or re-blended. One step. */
  addFilmLayer(o: { kind: 'leak'; color: 'amber' | 'red' | 'magenta' | 'gold'; from: 'left' | 'right' | 'top' | 'bottom' | 'corner'; size: number } | { kind: 'frame'; style: 'film' | 'white' | 'line'; width: number }): boolean {
    const p = this.current;
    if (!p) return false;
    const W = p.doc.width, H = p.doc.height, r = new Raster(W, H), c = r.ctx;
    if (o.kind === 'leak') {
      const hue = { amber: [255, 140, 40], red: [255, 60, 30], magenta: [255, 60, 150], gold: [255, 200, 80] }[o.color];
      const at = { left: [0, H * 0.45], right: [W, H * 0.55], top: [W * 0.55, 0], bottom: [W * 0.45, H], corner: [W, 0] }[o.from];
      const R = Math.max(W, H) * Math.max(0.1, Math.min(1.5, o.size / 100));
      const blob = (x: number, y: number, rad: number, rgb: number[], a: number): void => {
        const g = c.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`); g.addColorStop(0.45, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a * 0.45})`); g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
        c.fillStyle = g; c.fillRect(0, 0, W, H);
      };
      c.globalCompositeOperation = 'lighter';
      blob(at[0], at[1], R, hue, 0.85);
      blob(at[0], at[1], R * 0.35, [255, 240, 200], 0.7);   // the hotter core
      const dx = W / 2 - at[0], dy = H / 2 - at[1], len = Math.hypot(dx, dy) || 1, s = c.createLinearGradient(at[0], at[1], at[0] + (dx / len) * R, at[1] + (dy / len) * R);
      s.addColorStop(0, `rgba(${hue[0]},${hue[1]},${hue[2]},0.35)`); s.addColorStop(1, `rgba(${hue[0]},${hue[1]},${hue[2]},0)`);
      c.fillStyle = s; c.fillRect(0, 0, W, H);   // a soft streak toward the middle
      c.globalCompositeOperation = 'source-over';
    } else {
      const w = Math.max(1, Math.round(Math.min(W, H) * Math.max(0.2, Math.min(25, o.width)) / 100));
      if (o.style === 'line') { c.strokeStyle = '#000000'; c.lineWidth = Math.max(1, Math.round(w / 4)); c.strokeRect(w, w, W - 2 * w, H - 2 * w); }
      else {
        c.fillStyle = o.style === 'white' ? '#ffffff' : '#000000';
        c.fillRect(0, 0, W, H);
        c.globalCompositeOperation = 'destination-out';
        c.beginPath();
        const rad = o.style === 'film' ? w * 0.6 : 0, x = w, y = w, iw = W - 2 * w, ih = H - 2 * w;
        c.moveTo(x + rad, y); c.arcTo(x + iw, y, x + iw, y + ih, rad); c.arcTo(x + iw, y + ih, x, y + ih, rad); c.arcTo(x, y + ih, x, y, rad); c.arcTo(x, y, x + iw, y, rad); c.closePath();
        c.fill();
        c.globalCompositeOperation = 'source-over';
      }
    }
    r.touch();
    this.insertRasterLayer(r, o.kind === 'leak' ? 'Light Leak' : 'Frame', 0, 0, o.kind === 'leak' ? { blend: 'screen' } : {}, o.kind === 'leak' ? 'New Light Leak' : 'New Frame');
    return true;
  }

  /** One layer drawn by itself at the document's size (1.51.7, for OpenRaster): its mask and effects applied, everything
   *  else hidden, at full opacity and Normal blend, as the file keeps those separately. */
  renderLayerAlone(id: ID): Surface {
    const p = this.current, s = createSurface(p?.doc.width ?? 1, p?.doc.height ?? 1);
    const l = p?.layer(id);
    if (!p || !l) return s;
    const keep = new Set<ID>([id]);
    for (let a = l.parentId; a; a = p.layer(a)?.parentId ?? null) keep.add(a);
    const overrides = new Map<ID, LayerOverride>();
    for (const x of p.doc.layers) overrides.set(x.id, keep.has(x.id) ? { hidden: false, opacity: 1, ...(x.id === id ? { blend: 'normal' as BlendMode } : {}) } : { hidden: true });
    this.work.render({ doc: p.doc, target: s, view: [1, 0, 0, 1, 0, 0], overrides, quality: 'high' });
    return s;
  }

  /** A pixel layer's pixels replaced by a document-sized image, one step (1.52.6, for plugins). */
  replaceLayerPixels(id: ID, image: ImageData, undoName: string): boolean {
    const p = this.current, l = p?.layer(id);
    if (!p || !l || l.isGroup || l.adjustment || l.text || l.shape || l.smart) { this.notice('Only a pixel layer can take new pixels.'); return false; }
    if (image.width !== p.doc.width || image.height !== p.doc.height) { this.notice('The image must be the size of the document.'); return false; }
    const r = new Raster(image.width, image.height);
    r.ctx.putImageData(image, 0, 0);
    r.touch();
    return this.edit(undoName, (pp) => { pp.updateLayer(id, { raster: r, transform: docTransform(image.width, image.height) }); return true; });
  }

  /** Auto-Align and Auto-Blend Layers (DEV_PLAN 32.1), one undo step for every layer: a pixel layer is drawn alone at the
   *  document's size, moved by `matrix` (3x3 row-major, its pixels to the document's, by an inverse map with bilinear
   *  sampling), multiplied by the RGB `gain`, and put back with the document transform; `mask` (a grey image) becomes its
   *  layer mask. Layers that are not plain pixel layers are skipped. */
  applyLayerEdits(items: Array<{ id: ID; matrix?: number[]; gain?: number[]; mask?: CanvasImageSource }>, undoName: string): boolean {
    const p = this.current;
    if (!p) return false;
    const W = p.doc.width, H = p.doc.height, done: Array<{ id: ID; raster: Raster | null; mask: ReturnType<typeof LM.maskFromImage> | null }> = [];
    for (const it of items) {
      const l = p.layer(it.id);
      if (!l || !l.raster || l.isGroup || l.adjustment || l.text || l.shape || l.smart) continue;
      let raster: Raster | null = null;
      const m = it.matrix, g = it.gain;
      const moved = !!m && m.some((v, i) => Math.abs(v - (i % 4 === 0 ? 1 : 0)) > 1e-9), toned = !!g && g.some((v) => Math.abs(v - 1) > 1e-6);
      if (moved || toned) {
        const src = ctxOf(this.renderLayerAlone(it.id)).getImageData(0, 0, W, H), out = new ImageData(W, H), sd = src.data, od = out.data;
        let inv = [1, 0, 0, 0, 1, 0, 0, 0, 1];
        if (m && moved) {
          const [a, b, c, d, e, f, gg, h, i] = m, A = e * i - f * h, B = c * h - b * i, C = b * f - c * e, det = a * A + d * B + gg * C;
          if (Math.abs(det) < 1e-12) continue;
          inv = [A, B, C, f * gg - d * i, a * i - c * gg, c * d - a * f, d * h - e * gg, b * gg - a * h, a * e - b * d].map((v) => v / det);
        }
        const gr = g?.[0] ?? 1, gg2 = g?.[1] ?? 1, gb = g?.[2] ?? 1;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const px = x + 0.5, py = y + 0.5, z = inv[6] * px + inv[7] * py + inv[8];
          const o = (y * W + x) * 4;
          if (Math.abs(z) < 1e-12) continue;
          const sx = (inv[0] * px + inv[1] * py + inv[2]) / z - 0.5, sy = (inv[3] * px + inv[4] * py + inv[5]) / z - 0.5;
          const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
          if (x0 < -1 || y0 < -1 || x0 >= W || y0 >= H) continue;
          // premultiplied bilinear: outside the picture counts as transparent
          let r = 0, gc = 0, bc = 0, al = 0;
          for (let k = 0; k < 4; k++) {
            const xx = x0 + (k & 1), yy = y0 + (k >> 1), wt = ((k & 1) ? fx : 1 - fx) * ((k >> 1) ? fy : 1 - fy);
            if (xx < 0 || yy < 0 || xx >= W || yy >= H || wt <= 0) continue;
            const q = (yy * W + xx) * 4, a = sd[q + 3] * wt;
            r += sd[q] * a / 255; gc += sd[q + 1] * a / 255; bc += sd[q + 2] * a / 255; al += a;
          }
          if (al <= 0) continue;
          od[o] = Math.min(255, Math.round(r / al * 255 * gr)); od[o + 1] = Math.min(255, Math.round(gc / al * 255 * gg2)); od[o + 2] = Math.min(255, Math.round(bc / al * 255 * gb)); od[o + 3] = Math.round(al);
        }
        raster = new Raster(W, H);
        raster.ctx.putImageData(out, 0, 0);
        raster.touch();
      }
      done.push({ id: it.id, raster, mask: it.mask ? LM.maskFromImage(it.mask, W, H) : null });
    }
    if (!done.length) { this.notice('No plain pixel layers to change.'); return false; }
    return this.edit(undoName, (pp) => {
      for (const d of done) pp.updateLayer(d.id, { ...(d.raster ? { raster: d.raster, transform: docTransform(W, H) } : {}), ...(d.mask ? { mask: d.mask } : {}) });
      return true;
    });
  }

  /** A pixel layer's pixels replaced at a new size, its box resized in place (Adaptive Wide Angle). */
  rescaleLayerPixels(id: ID, image: ImageData, undoName: string): boolean {
    const p = this.current, l = p?.layer(id);
    if (!p || !l || !l.raster || l.isGroup || l.adjustment || l.text || l.shape || l.smart) { this.notice('Only a pixel layer can take new pixels.'); return false; }
    const r = new Raster(image.width, image.height);
    r.ctx.putImageData(image, 0, 0);
    r.touch();
    const t = l.transform, sx = image.width / l.raster.width, sy = image.height / l.raster.height;
    return this.edit(undoName, (pp) => { pp.updateLayer(id, { raster: r, transform: { ...t, w: t.w * sx, h: t.h * sy } }); return true; });
  }

  addAdjustmentLayer(kind: AdjustmentKind): ID | null {
    const label = ADJUSTMENT_LABELS[kind];
    let id: ID | null = null;
    this.edit(`New ${label} Layer`, (p) => {
      const sel = p.selection;
      let mask: Mask | undefined;
      if (sel) {
        const r = new Raster(p.doc.width, p.doc.height);
        r.ctx.drawImage(sel.surface(), sel.x, sel.y);
        r.touch();
        mask = { raster: r, enabled: true, linked: true, placement: null };
      }
      const layer = newLayer(label, p.doc, { adjustment: { kind, data: defaultAdjustmentData(kind) }, parentId: this.parentForNew(p), ...(mask ? { mask } : {}) });
      this.insertAboveActive(p, layer);
      if (mask) { p.maskTarget = true; p.selection = null; }
      id = layer.id;
    });
    return id;
  }

  /** Layer > New Fill Layer (1.66.0): a fill layer over the whole canvas above the active layer, named by its
   *  kind, with the usual default layer mask (revealing all, or with a selection only it, the
   *  selection used up) as the target, so painting it paints the mask. One New Fill Layer step; the dialog that follows
   *  sets its content into that step (amendNewFill) or takes it back (dropNewFill). */
  newFillLayer(content: FillContent): ID | null {
    let made: ID | null = null;
    this.edit('New Fill Layer', (p) => {
      const W = p.doc.width, H = p.doc.height, base = fillName(content), sel = p.selection;
      let n = 1;
      while (p.doc.layers.some((l) => l.name === `${base} ${n}`)) n += 1;
      let mask: Mask = { raster: null, enabled: true, linked: true, placement: null };
      if (sel) { const r = new Raster(W, H); r.ctx.drawImage(sel.surface(), sel.x, sel.y); r.touch(); mask = { ...mask, raster: r }; }
      const shell = newLayer(`${base} ${n}`, p.doc, { fillContent: content, mask, parentId: this.parentForNew(p) }), raster = this.drawFill(shell, W, H);
      if (!raster) { this.notice('That pattern is not defined in this window.'); return false; }
      this.insertAboveActive(p, { ...shell, raster });
      p.maskTarget = true;
      p.selection = null;
      made = shell.id;
      return true;
    });
    return made;
  }

  /** What a fill layer's dialog shows on the canvas before anything is recorded (previewFill). */
  private fillPreview: { project: Project; layerId: ID; source: Surface } | null = null;

  /** Shows `content` on fill layer `id` without recording anything, while its dialog changes it, in a CMYK document
   *  as its inks will show; null ends it. */
  previewFill(id: ID | null, content: FillContent | null = null): void {
    const p = this.current, l = p && id ? p.layer(id) : null;
    let r = p && l && content ? renderFill(content, p.doc.width, p.doc.height, fillFrame({ ...l, fillContent: content }, p.doc.width, p.doc.height)) : null;
    const t = r && p?.doc.mode === 'cmyk' ? this.deriveTables(p) : null;
    if (r && t && p?.cmykLut) r = rasterFromChannels(deriveWhole(r.read(), t, false, false), p.cmykLut);
    this.fillPreview = p && l && r ? { project: p, layerId: l.id, source: r.canvas } : null;
    this.emit('render', null);
  }

  /** Layer > Layer Content Options on a fill layer: its content set to `content` and drawn again, one Modify Fill Layer
   *  step; nothing when it is unchanged. */
  setFillContent(id: ID, content: FillContent): boolean {
    this.fillPreview = null;
    const ok = this.edit('Modify Fill Layer', (p) => {
      const l = p.layer(id);
      if (!l?.fillContent || JSON.stringify(l.fillContent) === JSON.stringify(content)) return false;
      const r = this.drawFill({ ...l, fillContent: content }, p.doc.width, p.doc.height);
      if (!r) { this.notice('That pattern is not defined in this window.'); return false; }
      p.updateLayer(id, { fillContent: content, raster: r });
      return true;
    });
    this.emit('render', null);
    return ok;
  }

  /** The New Fill Layer step just made given the dialog's `content` and `name` in place, so making the layer and
   *  setting it stay one step, its inks or floats brought into step as `edit` brings them; false when that step is no
   *  longer the last. */
  amendNewFill(id: ID, content: FillContent, name: string): boolean {
    const p = this.current, l = p?.layer(id);
    this.fillPreview = null;
    if (!p || !l?.fillContent || p.history.last?.name !== 'New Fill Layer' || this.stroke) { this.emit('render', null); return false; }
    const same = JSON.stringify(l.fillContent) === JSON.stringify(content), title = name.trim().slice(0, 200) || l.name;
    const r = same ? l.raster : this.drawFill({ ...l, fillContent: content }, p.doc.width, p.doc.height);
    if (!r) { this.emit('render', null); return false; }
    if (same && title === l.name) { this.emit('render', null); return true; }
    const before = new Map(p.doc.layers.map((x) => [x.id, x]));
    p.updateLayer(id, { fillContent: content, raster: r, name: title });
    if ((p.doc.depth ?? 8) > 8 || p.doc.mode === 'cmyk' || p.doc.mode === 'lab') this.deriveChannels(p, before, []);
    p.history.amend(p.snapshot());
    this.refresh();
    return true;
  }

  /** The New Fill Layer step just made taken back as though never made (its dialog cancelled), leaving nothing to redo. */
  dropNewFill(id: ID): void {
    const p = this.current;
    this.fillPreview = null;
    if (p?.layer(id) && p.history.last?.name === 'New Fill Layer' && !this.stroke) { this.undoNow(); p.history.dropRedo(); }
    this.emit('render', null);
    this.emit('history', null);
  }

  private relightPreview: { project: Project; layerId: ID; source: Surface } | null = null;

  newRelightLayer(content: RelightContent, image: ImageData): ID | null {
    let made: ID | null = null;
    this.relightPreview = null;
    this.edit('New Relight Layer', (p) => {
      if (image.width !== p.doc.width || image.height !== p.doc.height) return false;
      let n = 1;
      while (p.doc.layers.some((l) => l.name === `Relight Layer ${n}`)) n += 1;
      const r = new Raster(p.doc.width, p.doc.height);
      r.write(image);
      const layer = newLayer(`Relight Layer ${n}`, p.doc, { raster: r, relight: content, parentId: this.parentForNew(p) });
      this.insertAboveActive(p, layer);
      made = layer.id;
      return true;
    });
    return made;
  }

  previewRelight(id: ID | null, image: ImageData | null = null): void {
    const p = this.current, l = p && id ? p.layer(id) : null;
    if (!p || !l || !image) { this.relightPreview = null; this.emit('render', null); return; }
    const s = createSurface(image.width, image.height);
    ctxOf(s).putImageData(image, 0, 0);
    this.relightPreview = { project: p, layerId: l.id, source: s };
    this.emit('render', null);
  }

  setRelight(id: ID, content: RelightContent, image: ImageData, amendNew = true): boolean {
    this.relightPreview = null;
    const p = this.current, l = p?.layer(id);
    if (!p || !l?.relight || image.width !== p.doc.width || image.height !== p.doc.height) { this.emit('render', null); return false; }
    const r = new Raster(p.doc.width, p.doc.height);
    r.write(image);
    const patch = { relight: content, raster: r, transform: docTransform(p.doc.width, p.doc.height) };
    if (amendNew && p.history.last?.name === 'New Relight Layer' && !this.stroke) {
      p.updateLayer(id, patch);
      p.history.amend(p.snapshot());
      this.refresh();
      return true;
    }
    const ok = this.edit('Modify Relight Layer', (q) => { q.updateLayer(id, patch); return true; });
    this.emit('render', null);
    return ok;
  }

  dropNewRelight(id: ID): void {
    const p = this.current;
    this.relightPreview = null;
    if (p?.layer(id) && p.history.last?.name === 'New Relight Layer' && !this.stroke) { this.undoNow(); p.history.dropRedo(); }
    this.emit('render', null);
    this.emit('history', null);
  }

  /** Adds a raster as a new layer above the active one, inside the folder `parentForNew` picks. A null x or y centres it
   *  on the canvas along that axis (whole pixels, rounded down); `extra` is laid over the layer's other fields. */
  /** Filter > 3D (DEV_PLAN 31.9): a normal, bump or height map of the active layer, added as a new pixel layer above it. */
  generateMap(kind: 'normal' | 'bump' | 'height', opts: { strength: number; blur: number; invert: boolean; flipY: boolean }): boolean {
    const p = this.current;
    const id = p?.activeLayer?.id;
    if (!p || !id) { this.notice('Select a pixel layer first.'); return false; }
    const w = p.doc.width, h = p.doc.height;
    const src = ctxOf(this.renderLayerAlone(id)).getImageData(0, 0, w, h);
    let bytes: Uint8ClampedArray;
    if (kind === 'height') {
      bytes = bumpMap(heightFromNormal(src.data, w, h), w, h, 1);
    } else {
      const field = heightField(src.data, w, h, opts.blur, opts.invert);
      bytes = kind === 'normal' ? normalMap(field, w, h, opts.strength, opts.flipY) : bumpMap(field, w, h, opts.strength);
    }
    const raster = new Raster(w, h);
    raster.write(new ImageData(bytes as Uint8ClampedArray<ArrayBuffer>, w, h));
    const label = kind === 'normal' ? 'Normal Map' : kind === 'bump' ? 'Bump Map' : 'Height Map';
    this.insertRasterLayer(raster, label, 0, 0, {}, `Generate ${label}`);
    return true;
  }

  insertRasterLayer(raster: Raster, name: string, x: number | null, y: number | null, extra: Partial<Layer> = {}, undoName = 'Paste'): void {
    this.edit(undoName, (p) => {
      const base = newLayer(name, p.doc, { raster, parentId: this.parentForNew(p) });
      const tx = x ?? Math.floor((p.doc.width - raster.width) / 2), ty = y ?? Math.floor((p.doc.height - raster.height) / 2);
      this.insertAboveActive(p, { ...base, transform: { ...docTransform(raster.width, raster.height), x: tx, y: ty }, ...extra });
    });
  }

  private sizeOk(width: number, height: number): boolean {
    const ok = Number.isInteger(width) && Number.isInteger(height) && width >= 1 && height >= 1 && width <= LIMITS.side && height <= LIMITS.side && width * height <= LIMITS.pixels;
    if (!ok) this.notice(`Canvas sides must be 1 to 30,000 px, and the canvas at most ${Math.round(LIMITS.pixels / 1_000_000)} megapixels.`, 'error');
    return ok;
  }

  resizeCanvas(width: number, height: number, dx: number, dy: number, fill: RGB | null = null, name = 'Canvas Size'): boolean { return DS.resizeCanvas(this.sizeHost, width, height, dx, dy, fill, name); }

  /** Image > Trim: crops away the border of transparent pixels, or of pixels the colour of the top-left or bottom-right
   *  pixel, judged on the flattened image, as one undo step. */
  trim(basis: 'transparent' | 'topLeft' | 'bottomRight'): boolean {
    const p = this.current;
    if (!p) return false;
    this.settle();
    const flat = this.flattened();
    if (!flat) return false;
    const W = flat.width, H = flat.height, d = ctxOf(flat).getImageData(0, 0, W, H).data;
    const at = basis === 'topLeft' ? 0 : (W * H - 1) * 4, r0 = d[at], g0 = d[at + 1], b0 = d[at + 2], a0 = d[at + 3];
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0, i = y * W * 4; x < W; x++, i += 4) {
        const keep = basis === 'transparent' ? d[i + 3] > 0 : d[i] !== r0 || d[i + 1] !== g0 || d[i + 2] !== b0 || d[i + 3] !== a0;
        if (!keep) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
    if (x1 < 0) { this.notice('Trimming would leave nothing.'); return false; }
    if (x0 === 0 && y0 === 0 && x1 === W - 1 && y1 === H - 1) { this.notice('There is nothing to trim.'); return false; }
    return this.resizeCanvas(x1 - x0 + 1, y1 - y0 + 1, -x0, -y0, null, 'Trim');
  }

  /** Image > Trap (DEV_PLAN 31.5): lighter inks spread `widthPx` under darker ones in a CMYK document, K held back.
   *  Needs one pixel layer; the inks are rewritten as a new record and the rendition redrawn through the doc's table. */
  trap(widthPx: number): boolean {
    const p = this.current;
    if (!p) return false;
    if (p.doc.mode !== 'cmyk' || !p.cmykLut) { this.notice('Trap works on CMYK documents: convert with Image > Mode > CMYK Color first.'); return false; }
    const pixel = p.doc.layers.filter((l) => l.raster && !l.isGroup && !l.adjustment && l.channels?.mode === 'cmyk');
    if (pixel.length > 1) { this.notice('Flatten the image first: Trap works on one layer.'); return false; }
    const target = pixel[0];
    if (!target || !target.channels) return false;
    const lut = p.cmykLut, src = target.channels, radius = Math.min(10, Math.max(1, Math.round(widthPx)));
    return this.edit('Trap', (pp) => {
      const ch: ChannelPixels = { mode: 'cmyk', n: 4, width: src.width, height: src.height, data: trapInk(src.data, src.width, src.height, radius) };
      pp.doc = { ...pp.doc, layers: pp.doc.layers.map((l) => (l.id === target.id ? { ...l, channels: ch, raster: rasterFromChannels(ch, lut) } : l)) };
      return true;
    });
  }

  /** Image > Reveal All: grows the canvas to show every layer, parts beyond its edges included, as one undo step. */
  revealAll(): boolean {
    const p = this.current;
    if (!p) return false;
    let b: Rect = { x: 0, y: 0, w: p.doc.width, h: p.doc.height };
    for (const l of p.doc.layers) if (l.raster && !l.isGroup && !l.adjustment) b = unionRect(b, transformBounds(l.transform));
    const r = integral(b);
    if (r.x >= 0 && r.y >= 0 && r.x + r.w <= p.doc.width && r.y + r.h <= p.doc.height) { this.notice('Every layer is already inside the canvas.'); return false; }
    return this.resizeCanvas(r.w, r.h, -r.x, -r.y, null, 'Reveal All');
  }

  /** The Crop tool's W × H × Resolution: the crop as `straightenCrop` makes it, then the result
   *  resampled to exactly `width` by `height` pixels at `resolution` ppi, as one Crop step (history steps nest). */
  cropToSize(rect: Rect, angleDeg: number, contentAware: boolean, width: number, height: number, resolution: number): boolean {
    const p = this.current, w = Math.round(width), h = Math.round(height);
    if (!p || !this.sizeOk(w, h)) return false;
    p.history.begin('Crop', p.snapshot());
    const prior = p.doc, was = this.marksNow(p);
    try {
      if (!this.straightenCrop(rect, angleDeg, contentAware)) return false;
      const done = this.resampleImage(w, h, 'high', Math.max(1, Math.min(9600, resolution)));
      this.marksKeep(p, prior, 'Crop', was);
      return done;
    } finally {
      p.history.end(p.snapshot());
    }
  }

  /** Crop with Straighten and Content-Aware, as one step: every layer turns by `angleDeg` about the frame's centre
   *  (masks follow as a move does), the canvas is cut to the frame, and with `contentAware` the parts of the canvas
   *  that the bottom pixel layer no longer covers (corners opened by the turn, or canvas added by a frame past the
   *  edge) are filled by content-aware fill from the rest of that layer, which becomes canvas-sized. */
  straightenCrop(rect: Rect, angleDeg: number, contentAware: boolean): boolean {
    const p0 = this.current, r = integral(rect);
    if (!p0 || r.w < 1 || r.h < 1 || !this.sizeOk(r.w, r.h)) return false;
    const turn = Number.isFinite(angleDeg) ? Math.max(-45, Math.min(45, angleDeg)) : 0, c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    return this.edit(turn ? 'Straighten and Crop' : 'Crop', (p) => {
      const prior = p.doc, was = this.marksNow(p);
      if (turn) {
        const a = (turn * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
        for (const l of p.doc.layers) {
          if (l.isGroup) continue;
          const t = l.transform, lx = t.x + t.w / 2 - c.x, ly = t.y + t.h / 2 - c.y;
          const next = { ...t, x: c.x + lx * cs - ly * sn - t.w / 2, y: c.y + lx * sn + ly * cs - t.h / 2, rotation: t.rotation + turn };
          p.updateLayer(l.id, { transform: next, mask: followMask(l, next) });
        }
        if (p.doc.layers.some((l) => l.vectorMask)) p.setLayers(this.carryVectors(p.doc.layers, (x, y) => ({ x: c.x + (x - c.x) * cs - (y - c.y) * sn, y: c.y + (x - c.x) * sn + (y - c.y) * cs })));
        if (p.doc.alphas?.length) p.doc = { ...p.doc, ...alphasRedrawn(p.doc, p.doc.width, p.doc.height, (g, m) => { g.translate(c.x, c.y); g.rotate(a); g.translate(-c.x, -c.y); g.drawImage(m.surface(), m.x, m.y); }) };
        const spin = (x: number, y: number): Pt => ({ x: c.x + (x - c.x) * cs - (y - c.y) * sn, y: c.y + (x - c.x) * sn + (y - c.y) * cs });
        p.doc = { ...p.doc, ...GD.carryMarks(p.doc, { map: spin, width: Infinity, height: Infinity, upright: false }) };
        this.marksMove(p, spin, false);
      }
      this.resizeCanvas(r.w, r.h, -r.x, -r.y, null, 'Crop');
      if (contentAware) this.fillOpenedEdges(p);
      if (this.cropDeletePixels) this.deleteCroppedPixels(p);
      this.marksKeep(p, prior, turn ? 'Straighten and Crop' : 'Crop', was);
      return true;
    });
  }

  /** Content-aware fill of the canvas the bottom visible pixel layer does not reach; that layer becomes canvas-sized. */
  /** The Crop tool's Delete Cropped Pixels option: after the crop, each pixel layer reaching past
   *  the canvas keeps only what lies on it. The layer is drawn through its own placement onto a canvas-sized raster, so
   *  an unscaled, unturned layer at whole pixels is copied exactly and a scaled or turned one is resampled once to what
   *  shows; a mask that followed the layer is pinned where it was. Smart objects, type, shapes, adjustments and folders
   *  are left whole (pixels inside smart objects are never deleted). */
  private deleteCroppedPixels(p: Project): void {
    const W = p.doc.width, H = p.doc.height;
    for (const l of p.doc.layers) {
      if (!l.raster || l.isGroup || l.adjustment || l.smart || l.text || l.shape) continue;
      const b = transformBounds(l.transform);
      if (b.x >= 0 && b.y >= 0 && b.x + b.w <= W && b.y + b.h <= H) continue;
      const out = new Raster(W, H), c = out.ctx;
      c.save();
      setMat(c, placement(l.transform, l.raster.width, l.raster.height));
      c.drawImage(l.raster.canvas, 0, 0);
      c.restore();
      p.updateLayer(l.id, { raster: out, transform: docTransform(W, H), mask: l.mask ? { ...l.mask, placement: l.mask.placement ?? l.transform } : null });
    }
  }

  private fillOpenedEdges(p: Project): void {
    const l = hierarchy(p.doc).find((e) => e.visible && !e.layer.isGroup && !!e.layer.raster && !e.layer.adjustment && !e.layer.vector)?.layer;
    if (!l?.raster) return;
    const W = p.doc.width, H = p.doc.height, reach = createSurface(W, H), rc = ctxOf(reach);
    setMat(rc, placement(l.transform, l.raster.width, l.raster.height));
    rc.fillStyle = '#fff';
    rc.fillRect(0, 0, l.raster.width, l.raster.height);
    const cov = rc.getImageData(0, 0, W, H).data, mask = new Uint8Array(W * H);
    let open = 0;
    for (let i = 0; i < mask.length; i++) if (cov[i * 4 + 3] < 128) { mask[i] = 255; open++; }
    if (!open) return;
    const img = ctxOf(this.layerSample(p, l)).getImageData(0, 0, W, H);
    contentFill(img.data, mask, W, H);
    const out = new Raster(W, H);
    out.ctx.putImageData(img, 0, 0);
    p.updateLayer(l.id, { raster: out, transform: docTransform(W, H), mask: l.mask ? { ...l.mask, placement: l.mask.placement ?? l.transform } : null, shape: null });
  }

  /** Perspective Crop: the quad `quad` (top-left, top-right, bottom-right, bottom-left, in document pixels) becomes the
   *  whole canvas, a rectangle as wide and tall as the quad's opposite sides on average; every pixel layer is carried
   *  through the same perspective (linked masks with it), as one step. Shape, type and smart layers become pixels. */
  perspectiveCrop(quad: Pt[]): boolean {
    const p0 = this.current;
    if (!p0) return false;
    if (!distortUsable(quad)) { this.notice('Keep the four corners in order, with no sides crossing, to crop in perspective.'); return false; }
    const len = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.y - a.y);
    const W = Math.max(1, Math.round((len(quad[0], quad[1]) + len(quad[3], quad[2])) / 2)), H = Math.max(1, Math.round((len(quad[0], quad[3]) + len(quad[1], quad[2])) / 2));
    const back = inverse3(homography(quad));
    if (!back || !this.sizeOk(W, H)) return false;
    const toOut = (q: Pt): Pt => { const u = project(back, q.x, q.y); return { x: u.x * W, y: u.y * H }; };
    const moved = new Map<ID, Partial<Layer>>();
    for (const l of p0.doc.layers) {
      if (l.isGroup || !l.raster) continue;
      const nq = cornersOf(l.transform).map(toOut);
      if (!distortUsable(nq)) continue;
      const b = boundsOf(nq);
      if (b.w * b.h > LIMITS.pixels) { this.notice(`That perspective would stretch a layer past the ${Math.round(LIMITS.pixels / 1_000_000)}-megapixel limit. Pull the corners in a little.`, 'error'); return false; }
      const w = warpRaster(l.raster, l.transform, nq);
      if (!w) continue;
      let mask = l.mask;
      if (mask?.raster && mask.linked) {
        const mt = mask.placement ?? l.transform, mq = cornersOf(mt).map(toOut), wm = distortUsable(mq) ? warpRaster(mask.raster, mt, mq, 1, true, maskEdgeTone(mask.raster)) : null;
        if (wm) mask = { ...mask, raster: wm.raster, placement: mask.placement ? wm.t : null };
      }
      moved.set(l.id, { raster: w.raster, transform: w.t, mask, shape: null, vector: null, text: null, smart: null });
    }
    return this.edit('Perspective Crop', (p) => {
      const prior = p.doc;
      p.doc = { ...p.doc, width: W, height: H, layers: this.carryVectors(p.doc.layers.map((l) => (moved.has(l.id) ? { ...l, ...moved.get(l.id) } : l)), (x, y) => toOut({ x, y })), ...alphasRedrawn(p.doc, W, H, (g, m) => {
        const t = { ...docTransform(m.w, m.h), x: m.x, y: m.y }, w = warpRaster(Raster.from(m.surface(), m.w, m.h), t, cornersOf(t).map(toOut), 1, true);
        if (w) { setMat(g, placement(w.t, w.raster.width, w.raster.height)); g.drawImage(w.raster.canvas, 0, 0); }
      }) };
      p.selection = null;
      const warp = (x: number, y: number): Pt => toOut({ x, y });
      p.doc = { ...p.doc, ...GD.carryMarks(prior, { map: warp, width: W, height: H, upright: false }) };
      this.carryMeasure(p, prior, 'Perspective Crop', warp);
      return true;
    });
  }

  cropTo(rect: Rect): boolean {
    const r = integral(rect);
    if (r.w < 1 || r.h < 1) return false;
    return this.resizeCanvas(r.w, r.h, -r.x, -r.y, null, 'Crop');
  }

  resampleImage(width: number, height: number, sampling: Transform['sampling'], resolution: number): boolean { return DS.resampleImage(this.sizeHost, width, height, sampling, resolution); }

  /** File > Automate > Fit Image (1.65.8): the image resampled, its proportions kept, to
   *  fit within `width` by `height` pixels, smaller or (with `enlarge`) larger, as one Fit Image step at the same
   *  resolution. True when it fits afterwards, resized or not; `quiet` keeps one that already fits from saying so. */
  fitImage(width: number, height: number, enlarge = true, quiet = false): boolean {
    const p = this.current;
    if (!p || !(width >= 1) || !(height >= 1)) return false;
    const W = p.doc.width, H = p.doc.height, k = Math.min(width / W, height / H), w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
    if ((k > 1 && !enlarge) || (w === W && h === H)) {
      if (!quiet) this.notice(`The image already fits within ${width} × ${height} px.`);
      return true;
    }
    this.settle();
    p.history.begin('Fit Image', p.snapshot());
    try { return this.resampleImage(w, h, 'high', p.doc.resolution); } finally { p.history.end(p.snapshot()); }
  }

  resizeSelection(delta: number, atBounds = false): void { PO.resizeSelection(this.paintHost, delta, atBounds); }

  /** Select > Modify. Feather blurs the selection's edge with a Gaussian of half the radius (so the edge fades over
   *  about the radius each way); Border keeps a band `amount` wide centred on the edge; Smooth rounds off corners
   *  and specks by a majority vote over a square of the radius. */
  modifySelection(kind: 'feather' | 'border' | 'smooth', amount: number, atBounds = false): void {
    const p = this.current, sel = p?.selection;
    if (!p || !sel || !(amount > 0) || amount > 1024) return;
    const pad = Math.ceil(kind === 'feather' ? amount * 1.5 : amount) + 2, W = p.doc.width, H = p.doc.height;
    // Unless the effect applies at canvas bounds (always for Border), the canvas edge pixels carry on past the canvas.
    const edge = atBounds || kind === 'border';
    const region = { x: sel.x - pad, y: sel.y - pad, w: sel.w + 2 * pad, h: sel.h + 2 * pad };
    const { w, h } = region, src = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) {
      const sy = edge ? region.y + j : Math.min(H - 1, Math.max(0, region.y + j));
      for (let i = 0; i < w; i++) src[j * w + i] = sel.valueAt(edge ? region.x + i : Math.min(W - 1, Math.max(0, region.x + i)), sy);
    }
    let out: Uint8Array;
    if (kind === 'feather') {
      const img = new ImageData(w, h);
      for (let i = 0; i < src.length; i++) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = src[i]; }
      const b = gaussianBlur(img, amount / 2);
      out = new Uint8Array(w * h);
      for (let i = 0; i < out.length; i++) out[i] = b.data[i * 4 + 3];
    } else if (kind === 'border') {
      const grown = resizeMask(src, w, h, amount / 2), shrunk = resizeMask(src, w, h, -amount / 2);
      out = new Uint8Array(w * h);
      for (let i = 0; i < out.length; i++) out[i] = Math.max(0, grown[i] - shrunk[i]);
    } else {
      const r = Math.round(amount), S = new Float64Array((w + 1) * (h + 1));
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) S[(j + 1) * (w + 1) + i + 1] = src[j * w + i] / 255 + S[j * (w + 1) + i + 1] + S[(j + 1) * (w + 1) + i] - S[j * (w + 1) + i];
      out = new Uint8Array(w * h);
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const x0 = Math.max(0, i - r), x1 = Math.min(w, i + r + 1), y0 = Math.max(0, j - r), y1 = Math.min(h, j + r + 1);
          const s = S[y1 * (w + 1) + x1] - S[y0 * (w + 1) + x1] - S[y1 * (w + 1) + x0] + S[y0 * (w + 1) + x0];
          out[j * w + i] = s * 2 >= (x1 - x0) * (y1 - y0) ? 255 : 0;
        }
      }
    }
    const label = kind === 'feather' ? 'Feather Selection' : kind === 'border' ? 'Border Selection' : 'Smooth Selection';
    const cx0 = Math.max(0, region.x), cy0 = Math.max(0, region.y), cw = Math.min(W, region.x + w) - cx0, ch = Math.min(H, region.y + h) - cy0;
    if (cw <= 0 || ch <= 0) return;
    const back = new Uint8Array(cw * ch);
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) back[j * cw + i] = out[(cy0 - region.y + j) * w + cx0 - region.x + i];
    this.applySelection(SelectionMask.cropped(cx0, cy0, cw, ch, back), 'replace', label);
  }

  selectMaskBlack(): void { LM.selectMaskBlack(this.maskHost); }

  /** The pixels inside the selection: the active layer's own, its mask as gray, or with `merged` the visible image;
   *  the whole canvas when nothing is selected. Rendered over the selection's region, shared by Copy and Layer via Copy. */
  private selectedPixels(merged: boolean): { surface: Surface; region: Rect } | null { return SO.selectedPixels(this.selectHost, merged); }

  copySelection(merged: boolean): boolean {
    const s = this.selectedPixels(merged);
    if (!s) return false;
    const { surface, region: { x, y, w, h } } = s;
    this.clipboard = { surface, x, y, w, h, stamp: uid() };
    this.emit('options', null);
    return true;
  }

  private nextLayerName(p: Project): string {
    const used = new Set(p.doc.layers.map((l) => l.name));
    let n = 1;
    while (used.has(`Layer ${n}`)) n++;
    return `Layer ${n}`;
  }

  /** Cmd-J: with a selection, its pixels on the active layer (or its mask as gray) become a new layer in place, as one
   *  Layer via Copy step and without touching the clipboard; with no selection the layer is duplicated. */
  layerViaCopy(): void {
    const p = this.current;
    if (!p) return;
    if (!p.selection) { this.duplicateLayers(); return; }
    this.settle();
    const s = this.selectedPixels(false);
    if (!s) return;
    const { surface, region: { x, y, w, h } } = s;
    this.insertRasterLayer(Raster.from(surface, w, h), this.nextLayerName(p), x, y, {}, 'Layer via Copy');
  }

  /** Layer > New > Layer via Cut (Shift+Ctrl+J): the selection's pixels moved to a new layer in place. One step. */
  layerViaCut(): void {
    const p = this.current;
    if (!p) return;
    if (!p.selection) { this.notice('Layer via Cut needs a selection.'); return; }
    this.settle();
    const got = this.selectedPixels(false);
    if (!got || !this.paintable(p.activeLayer) || this.smartLocked(p)) return;
    const raster = Raster.from(got.surface, got.region.w, got.region.h), name = this.nextLayerName(p);
    this.edit('Layer via Cut', () => {
      this.clearPixels();
      this.insertRasterLayer(raster, name, got.region.x, got.region.y, {}, 'Layer via Cut');
    });
  }

  cutSelection(): void {
    if (!this.current?.selection) { this.notice('Cut needs a selection.'); return; }
    if (this.copySelection(false)) this.clearPixels();
  }

  pasteClipboard(): boolean { return SO.pasteClipboard(this.selectHost); }

  /** Edit > Paste Special > Paste Into and Paste Outside (1.65.7): formvis's own clipboard, or `image`
   *  from another app, pasted as a new layer centred on the selection's bounds, with a layer mask the size of the
   *  canvas showing it only inside the selection (or only outside it), unlinked so the picture can be moved behind it;
   *  the selection is used up. One step. */
  pasteInto(outside: boolean, image: { raster: Raster; name: string } | null = null): boolean {
    const p = this.current, sel = p?.selection, cb = this.clipboard;
    if (!p || !sel) { this.notice('Make a selection first: Paste Into and Paste Outside paste against it.'); return false; }
    const src = image?.raster ?? (cb ? Raster.from(cb.surface, cb.w, cb.h) : null);
    if (!src) { this.notice('Nothing to paste.'); return false; }
    const b = sel.rect, x = Math.round(b.x + b.w / 2 - src.width / 2), y = Math.round(b.y + b.h / 2 - src.height / 2);
    return this.edit(outside ? 'Paste Outside' : 'Paste Into', (q) => {
      const W = q.doc.width, H = q.doc.height, m = outside ? Raster.filled(W, H, '#ffffff') : new Raster(W, H);
      m.ctx.globalCompositeOperation = outside ? 'destination-out' : 'source-over';
      m.ctx.drawImage(sel.surface(), sel.x, sel.y);
      m.ctx.globalCompositeOperation = 'source-over';
      m.touch();
      const layer = newLayer(image?.name ?? 'Pasted Layer', q.doc, { raster: src, parentId: this.parentForNew(q), transform: { ...docTransform(src.width, src.height), x, y }, mask: { raster: m, enabled: true, linked: false, placement: docTransform(W, H) } });
      this.insertAboveActive(q, layer);
      q.selection = null;
      return true;
    });
  }

  private get paintHost(): PO.PaintHost {
    const st = this.gradientSettings;
    return {
      current: this.current,
      busy: !!this.stroke,
      settle: () => this.settle(),
      notice: (m) => this.notice(m),
      emit: (what) => this.emit(what, null),
      refresh: () => this.refresh(),
      canPaint: (p) => this.paintable(p.activeLayer) && !this.smartLocked(p),
      target: (p) => this.target(p) as NonNullable<ReturnType<Engine['target']>>,
      edit: (label, fn) => this.edit(label, fn),
      regionEdit: (label, apply) => this.regionEdit(label, apply),
      tint: (rect, css, cover) => this.tint(rect, css, cover),
      fg: this.fg,
      bg: this.bg,
      luminance: (c) => luminance(c),
      css: (c, a) => rgbCss(c, a),
      gradient: { shape: st.shape, opacity: st.opacity, blend: st.blend, dither: st.dither },
      gradientStops: (fg, bg) => gradientMethod(resolveStops(presetById(st.style), fg, bg, st.reversed).map((x) => (st.transparency ? x : { ...x, alpha: 1 })), st.method),
      positionLocked: (id) => this.locked(id ? this.current?.layer(id) ?? null : this.activeLayer, 'position'),
      linkedOf: (p) => this.withLinked(p),
      keyMove: (id, dx, dy, label) => this.keyMove(id, dx, dy, label),
      maskFollowing: (l, t) => followMask(l, t),
      vectorFollowing: (l, t) => followVector(l, t),
      setFlipAgain: (horizontal) => { this.lastTransform = { flip: horizontal }; },
      applySelection: (sel, mode, label) => this.applySelection(sel, mode, label),
    };
  }

  private get artboardHost(): AB.ArtboardHost {
    return {
      current: this.current,
      work: this.work,
      edit: (name, fn) => this.edit(name, fn),
      notice: (m) => this.notice(m),
      sizeOk: (w, h) => this.sizeOk(w, h),
      fit: () => this.fit(),
      focus: (p, id) => this.focus(p, id),
      settle: () => this.settle(),
      selectedRoots: (p) => this.selectedRoots(p),
      alignItems: (p) => this.alignItems(p),
      normalizeClips: (layers) => this.normalizeClips(layers),
    };
  }

  private get profileHost(): PR.ProfileHost {
    return {
      current: this.current,
      edit: (name, fn) => this.edit(name, fn),
      setCmykTables: (p, lut, inLut) => this.setCmykTables(p, lut, inLut),
    };
  }

  private get guideHost(): GD.GuideHost {
    return {
      current: this.current,
      view: this.view,
      edit: (name, fn) => this.edit(name, fn),
      overlay: () => { this.emit('overlay', null); },
      contentBounds: (id, p) => this.contentBounds(id, p),
      setActiveSlice: (id) => { this.activeSlice = id; },
    };
  }

  private get noteHost(): NT.NoteHost {
    const self = this;
    return {
      get activeNote() { return self.activeNote; },
      set activeNote(v) { self.activeNote = v; },
      edit: (name, fn) => this.edit(name, fn),
    };
  }

  private get pathHost(): PA.PathHost {
    const e = this;
    return {
      current: this.current,
      store: this.pathStore,
      fg: this.fg,
      brushDiameter: this.brush.diameter,
      notice: (m) => this.notice(m),
      edit: (name, fn) => this.edit(name, fn),
      refresh: () => this.refresh(),
      settle: () => this.settle(),
      emit: (what) => this.emit(what, null),
      css: (c) => rgbCss(c),
      reshape: (p, id, path, style) => this.reshape(p, id, path, style),
      changeVectorMask: (change) => this.changeVectorMask(change),
      applySelection: (next, mode, name) => this.applySelection(next, mode, name),
      paintable: (l) => this.paintable(l),
      regionEdit: (name, apply) => this.regionEdit(name, apply),
      stroker: {
        get dynamics() { return e.brushDynamics; },
        set dynamics(v) { e.brushDynamics = v; },
        get mode() { return e.brushMode; },
        set mode(v) { e.brushMode = v; },
        begin: (pt, pressure) => e.beginStroke(pt, false, pressure),
        beginRetouch: (kind, pt) => e.beginRetouchStroke(kind, pt, false),
        to: (pt, pressure) => e.strokeTo(pt, pressure),
        end: () => e.endStroke(),
      },
    };
  }

  private get textHost(): TX.TextHost {
    const e = this;
    return {
      get current() { return e.current; },
      get textSettings() { return e.textSettings; },
      set textSettings(v) { e.textSettings = v; },
      notice: (m) => this.notice(m),
      edit: (name, fn) => this.edit(name, fn),
      applySelection: (next, mode, name) => this.applySelection(next, mode, name),
      insertRasterLayer: (raster, name, x, y, extra, undoName) => this.insertRasterLayer(raster, name, x, y, extra, undoName),
      paths: {
        get work() { return e.workPath; },
        select: (id) => e.selectPath(id),
        setWork: (vp) => e.setWorkPath(vp),
      },
      renderShape: (path, style) => this.renderShape(path, style),
    };
  }

  private get videoHost(): VD.VideoHost {
    const e = this;
    return {
      get current() { return e.current; },
      store: this.videoStoreState,
      work: this.work,
      timelineOf: (p) => this.timelineOf(p),
      setTimeline: (p, t) => { this.timelines.set(p, t); },
      blocked: () => !!this.stroke || this.waiting(),
      settle: () => this.settle(),
      refresh: () => this.refresh(),
      emit: (what) => this.emit(what, null),
      insertRasterLayer: (raster, name, x, y, extra, undoName) => this.insertRasterLayer(raster, name, x, y, extra, undoName),
      selectLayer: (id) => this.selectLayer(id),
      duplicateLayers: () => this.duplicateLayers(),
    };
  }

  private get frameHost(): FR.FrameHost {
    return {
      current: this.current,
      work: this.work,
      edit: (name, fn) => this.edit(name, fn),
      notice: (m) => this.notice(m),
      timelineOf: (p) => this.timelineOf(p),
      syncFrame: (p) => this.syncFrame(p),
      timelineChanged: () => { this.emit('timeline', null); },
    };
  }

  private get snapshotHost(): SN.SnapshotHost {
    const e = this;
    return {
      get current() { return e.current; },
      get stroke() { return e.stroke; },
      get autoFirstSnapshot() { return e.autoFirstSnapshot; },
      get snapshotByteLimit() { return e.snapshotByteLimit; },
      get memoryBudget() { return e.memoryBudget; },
      get historyBrushSource() { return e.historyBrushSource; },
      store: this.snapshotStore,
      notice: (m) => this.notice(m),
      settle: () => this.settle(),
      room: (extra, what) => this.room(extra, what),
      edit: (name, fn) => this.edit(name, fn),
      focus: (p, id) => this.focus(p, id),
      emit: (what) => this.emit(what, null),
    };
  }

  private get modeHost(): MO.ModeHost {
    const e = this;
    return {
      get current() { return e.current; },
      work: this.work,
      get fg() { return e.fg; },
      set fg(c: RGB) { e.fg = c; },
      get bg() { return e.bg; },
      set bg(c: RGB) { e.bg = c; },
      get fgc() { return e.fgc; },
      get bgc() { return e.bgc; },
      get fgInk() { return e.fgInk; },
      set fgInk(i: Ink) { e.fgInk = i; },
      get bgInk() { return e.bgInk; },
      set bgInk(i: Ink) { e.bgInk = i; },
      fillKeys: this.fillKeys,
      edit: (name, fn) => this.edit(name, fn),
      refresh: () => this.refresh(),
      emit: (what) => this.emit(what, null),
      flattened: () => this.flattened(),
      multichannelSurface: (doc) => this.multichannelSurface(doc),
      openImage: (img) => this.openImage(img),
      addProject: (doc, name, activeId) => this.addProject(doc, name, activeId),
    };
  }

  private get smartObjectHost(): SOB.SmartObjectHost {
    const e = this;
    return {
      get current() { return e.current; },
      get projects() { return e.projects; },
      store: this.smartStore,
      get smartFilterRunner() { return e.smartFilterRunner; },
      get smartFilterMargin() { return e.smartFilterMargin; },
      get smartFilterRunnerAsync() { return e.smartFilterRunnerAsync; },
      notice: (m) => this.notice(m),
      edit: (name, fn) => this.edit(name, fn),
      editOn: (p, name, fn) => this.editOn(p, name, fn),
      normalizeClips: (layers) => this.normalizeClips(layers),
      focus: (p, id) => this.focus(p, id),
      insertRasterLayer: (raster, name, x, y, extra, undoName) => this.insertRasterLayer(raster, name, x, y, extra, undoName),
      addProject: (doc, name, activeId) => this.addProject(doc, name, activeId),
      task: (fn) => this.task(fn),
      settle: () => this.settle(),
      flattened: () => this.flattened(),
      emit: (what) => this.emit(what, null),
    };
  }

  private get smartHost(): SM.SmartHost {
    return {
      current: this.current,
      notice: (m, kind) => this.notice(m, kind),
      restackSoon: (p, id, source, filters, name, maskChange, extra) => this.restackSoon(p, id, source, filters, name, maskChange, extra),
      smartFiltersShown: (id) => this.smartFiltersShown(id),
    };
  }

  private get selectHost(): SO.SelectHost {
    return {
      current: this.current,
      edit: (label, fn) => this.edit(label, fn),
      notice: (m) => this.notice(m),
      rememberDeselected: (p, sel) => { this.lastSelections.set(p, sel); },
      regionEdit: (label, apply) => this.regionEdit(label, apply),
      tint: (rect, css, cover) => this.tint(rect, css, cover),
      bg: this.bg,
      luminance: (c) => luminance(c),
      composite: (p) => renderDoc(this.work, p.doc),
      renderInto: (p, target, view) => this.work.render({ doc: p.doc, target, view, quality: 'high' }),
      wand: this.wand,
      clipboard: this.clipboard,
      newDocumentFor: (w, h, name) => { this.addProject({ id: uid(), width: w, height: h, resolution: 72, layers: [] }, name); },
      insertRasterLayer: (r, name, x, y) => { this.insertRasterLayer(r, name, x, y); },
    };
  }

  private get editHost(): IE.EditHost {
    return {
      current: this.current,
      edit: (label, fn) => this.edit(label, fn),
      notice: (m) => this.notice(m),
      emit: (what) => this.emit(what, null),
      canPaint: (p) => this.paintable(p.activeLayer) && !this.smartLocked(p),
      paintable: (l) => this.paintable(l),
      target: (p) => this.target(p),
      coverage: (p, l, target, w, h) => this.coverageFor(p, l, target, w, h),
      frame: (p, t, w, h, shift) => this.filterFrame(p, t, w, h, shift),
      setPreview: (id, target, surface, transform) => this.setPreview(id, target, surface ?? null, transform),
      clearPreview: () => { this.preview = null; },
      room: (bytes, what) => this.room(bytes, what),
      layerBytes: () => this.layerBytes(),
      refusal: (l, maskTargeted) => ((l.smart || l.vector || l.fillContent) && !maskTargeted ? (l.vector ? SHAPE_NOTICE : l.fillContent ? FILL_NOTICE : SMART_NOTICE) : null),
    };
  }

  private get sizeHost(): DS.SizeHost {
    return {
      current: this.current,
      edit: (label, fn) => this.edit(label, fn),
      notice: (m, kind) => this.notice(m, kind),
      sizeOk: (w, h) => this.sizeOk(w, h),
      fit: () => this.fit(),
      css: (c) => rgbCss(c),
      carryVectors: (layers, map) => this.carryVectors(layers, map),
      carryMeasure: (p, prior, name, map) => this.carryMeasure(p, prior, name, map),
      alphasShifted: (doc, dx, dy, w, h) => alphasMoved(doc, (m) => m.translated(dx, dy, w, h)),
      alphasScaled: (doc, w, h, sx, sy, smooth) => alphasRedrawn(doc, w, h, (g, m) => { g.imageSmoothingEnabled = smooth; g.drawImage(m.surface(), m.x * sx, m.y * sy, m.w * sx, m.h * sy); }),
      shapeScaled: (shape, k) => { const radii = cornerRadiiOf(shape); return { ...shape, cornerRadius: (Number(shape.cornerRadius) || 0) * k, ...(radii ? { cornerRadii: radii.map((v) => v * k) } : {}) }; },
      shapeRaster: (shape, w, h) => this.shapeRaster(shape, w, h),
      deepResampled: (p, l, w, h) => {
        if (!l.channels) return null;
        const ch = resampleDeep(l.channels, w, h);
        return { channels: ch, raster: ch.mode === 'cmyk' && p.cmykLut ? rasterFromChannels(ch, p.cmykLut) : rasterFromDeep(ch, p.doc.depth === 32) };
      },
    };
  }

  private get entryHost(): TE.EntryHost {
    return {
      current: this.current,
      busy: !!this.stroke,
      settle: (keep) => this.settle(keep),
      notice: (m) => this.notice(m),
      emit: (what) => this.emit(what, null),
      refresh: () => this.refresh(),
      edit: (label, fn) => this.edit(label, fn),
      positionLocked: (l) => this.locked(l ?? null, 'position'),
      linkedOf: (p) => this.withLinked(p),
      keyedOffset: (p, id) => this.keyedOffset(p, id),
      floatingId: (p) => (this.floatSel?.project === p ? this.floatSel.floatingId : null),
      snapping: this.snapping,
      lockRatio: this.lockRatio,
      snapMove: (p, id, t, moving) => this.snapMove(p, id, t, moving),
      clearSnapGuides: () => { this.snapGuides = null; },
      setLayerTransform: (patch, label) => this.setLayerTransform(patch, label),
      smartStart: (l) => {
        if (!l.smart || !l.raster) return null;
        const warp = this.smartWarpNow(l), margin = this.smartMargin(l.smart.filters);
        const R = warp ? this.renderSmart(l.smart.source, l.smart.filters, l.smart.filterMaskEnabled !== false ? l.smart.filterMask ?? null : null) : l.raster, t = warp ? docTransform(R.width, R.height) : l.transform;
        let corners = cornersOf(t);
        if (warp) {
          const H = homography(warp), ex = margin / l.smart.source.width, ey = margin / l.smart.source.height;
          corners = [[-ex, -ey], [1 + ex, -ey], [1 + ex, 1 + ey], [-ex, 1 + ey]].map(([u, v]) => project(H, u, v));
        }
        return { R, t, margin, corners };
      },
      applySmartDistort: (d, label) => {
        const sm = d.smart, sl = sm ? d.project.layer(d.layerId) : null;
        if (!sm || !sl?.smart) return;
        const H = homography(imageCorners(d.corners, sm.t.flipX, sm.t.flipY)), src = sl.smart.source, m = sm.margin, Rw = sm.R.width, Rh = sm.R.height;
        const warp = [[m, m], [m + src.width, m], [m + src.width, m + src.height], [m, m + src.height]].map(([x, y]) => project(H, x / Rw, y / Rh));
        const w = this.warpedSmart(sm.R, m, src, warp), dm = this.smartDistortMask(sl, sm.start, d.corners, 1);
        const smart = sl.smart, mask = sl.mask && dm ? { ...sl.mask, raster: dm.warped?.raster ?? sl.mask.raster, placement: dm.placement } : sl.mask;
        if (w) this.edit(label, (q) => q.updateLayer(sl.id, { raster: w.raster, transform: w.t, smart: { ...smart, warp, warpAt: w.t }, mask, vectorMask: this.distortVector(sl, sm.start, d.corners) }));
      },
      smartPreview: (l, d, quad, scale) => (d.smart ? { pixels: warpRaster(d.smart.R, d.smart.t, quad, scale), mask: this.smartDistortMask(l, d.smart.start, quad, scale) } : { pixels: null, mask: null }),
      vectorThrough: (l, from, to) => this.distortVector(l, from, to),
      setLastQuads: (from, to) => { this.lastTransform = { quadFrom: from, quadTo: to }; },
      requestFrame: (fn) => { if (!this.distortFrame) this.distortFrame = requestAnimationFrame(() => { this.distortFrame = 0; fn(); }); },
      cancelFrame: () => { if (this.distortFrame) cancelAnimationFrame(this.distortFrame); this.distortFrame = 0; },
      canPaint: (p) => this.paintable(p.activeLayer) && !this.smartLocked(p),
      target: (p) => this.target(p),
      composite: (p) => renderDoc(this.work, p.doc),
      layerSample: (p, l) => this.layerSample(p, l),
      brush: this.brush,
      smudge: { sampleAll: this.retouch.smearSampleAll, fingerPainting: this.retouch.fingerPainting },
      fg: this.fg,
      css: (c, a) => rgbCss(c, a),
    };
  }

  beginGradient(pt: Pt): boolean {
    const g = PO.beginGradient(this.paintHost, pt);
    this.gradient = g;
    return !!g;
  }

  updateGradient(start?: Pt, end?: Pt): void { if (this.gradient) PO.updateGradient(this.paintHost, this.gradient, start, end); }

  renderGradient(): void { if (this.gradient) PO.updateGradient(this.paintHost, this.gradient); }

  commitGradient(): void {
    const g = this.gradient;
    if (!g) return;
    this.gradient = null;
    PO.commitGradient(this.paintHost, g);
  }

  cancelGradient(): void {
    const g = this.gradient;
    if (!g) return;
    this.gradient = null;
    PO.cancelGradient(this.paintHost, g);
  }

  /** Live corners: a rectangle shape layer's four radii (top left, top right, bottom right, bottom left, in pixels),
   *  redrawn from its parameters, as one step. */
  setShapeCorners(id: ID, radii: readonly number[]): boolean {
    const clean = radii.length === 4 && radii.every((v) => Number.isFinite(v)) ? radii.map((v) => Math.max(0, Math.min(15000, v))) : null;
    if (!clean) return false;
    return this.edit('Corner Radii', (p) => {
      const l = p.layer(id);
      if (!l?.shape || l.shape.kind === 'Ellipse') return false;
      const same = clean.every((v) => v === clean[0]), shape = { ...l.shape, cornerRadius: clean[0], cornerRadii: same ? undefined : clean };
      if (same) delete (shape as Record<string, unknown>).cornerRadii;
      if (JSON.stringify(shape) === JSON.stringify(l.shape)) return false;
      p.updateLayer(id, { shape, raster: this.shapeRaster(shape, l.transform.w, l.transform.h) });
      return true;
    });
  }

  private shapeRaster(style: Record<string, unknown>, w: number, h: number): Raster {
    const r = new Raster(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
    const c = r.ctx;
    const ch = (v: unknown) => Math.round(clamp(Number(v) || 0, 0, 1) * 255);
    c.fillStyle = `rgb(${ch(style.red)}, ${ch(style.green)}, ${ch(style.blue)})`;
    c.beginPath();
    if (style.kind === 'Ellipse') c.ellipse(r.width / 2, r.height / 2, r.width / 2, r.height / 2, 0, 0, Math.PI * 2);
    else {
      // Live corners: four radii (top left, top right, bottom right, bottom left) when set, else one for all; each is
      // held to half the shorter side.
      const cap = Math.min(r.width, r.height) / 2, radii = cornerRadiiOf(style);
      c.roundRect(0, 0, r.width, r.height, radii ? radii.map((v) => Math.min(v, cap)) : Math.min(Number(style.cornerRadius) || 0, cap));
    }
    c.fill();
    return r;
  }

  createShape(rect: Rect, color: RGB = this.fg): void {
    const r = integral(rect);
    if (r.w < 1 || r.h < 1 || !this.current) return;
    const st = this.shapeSettings, kind = st.kind === 'ellipse' ? 'Ellipse' : 'Rectangle';
    const style = { kind, red: color.r / 255, green: color.g / 255, blue: color.b / 255, cornerRadius: st.kind === 'rectangle' ? st.cornerRadius : 0 };
    this.insertRasterLayer(this.shapeRaster(style, r.w, r.h), kind, r.x, r.y, { shape: style }, kind);
  }

  retouch: { healMode: HealMode; cloneAligned: boolean; cloneSample: HealSample; cloneBlend: BlendMode; cloneFlow: number; smearMode: 'blur' | 'sharpen' | 'smudge' | 'liquify'; smearBlend: BlendMode; smearSampleAll: boolean; protectDetail: boolean; fingerPainting: boolean; cloneScale: number; cloneAngle: number; cloneFlipH: boolean; cloneFlipV: boolean; patchMode: 'normal' | 'contentAware'; patchFrom: 'source' | 'destination'; patchTransparent: boolean; patchDiffusion: number; patchStructure: number; patchColor: number; healDiffusion: number; healBlendMode: HealBlend; spotBlendMode: HealBlend; healSample: HealSample; spotSampleAll: boolean; patchSampleAll: boolean; healSource: 'sampled' | 'pattern'; healPattern: ID | null; patchPattern: ID | null } = { healMode: 'contentAware', cloneAligned: true, cloneSample: 'current', cloneBlend: 'normal', cloneFlow: 1, smearMode: 'blur', smearBlend: 'normal', smearSampleAll: false, protectDetail: true, fingerPainting: false, cloneScale: 100, cloneAngle: 0, cloneFlipH: false, cloneFlipV: false, patchMode: 'normal', patchFrom: 'source', patchTransparent: false, patchDiffusion: 7, patchStructure: 5, patchColor: 10, healDiffusion: 7, healBlendMode: 'normal', spotBlendMode: 'normal', healSample: 'current', spotSampleAll: false, patchSampleAll: false, healSource: 'sampled', healPattern: null, patchPattern: null };

  /** Clone Source: where a document point's source moves once scaled, rotated and flipped about `pivot` (the sample
   *  point), as a matrix taking source pixels to where they are painted from; null when all are neutral. Painting at
   *  50 percent paints the source at half size, as the panel's W and H do. */
  private cloneTransform(pivot: Pt): Mat | null {
    const r = this.retouch, s = Math.min(1000, Math.max(1, r.cloneScale)) / 100;
    if (s === 1 && !(r.cloneAngle % 360) && !r.cloneFlipH && !r.cloneFlipV) return null;
    const a = mul(rotation((r.cloneAngle * Math.PI) / 180), scaling(s * (r.cloneFlipH ? -1 : 1), s * (r.cloneFlipV ? -1 : 1)));
    return mul(translation(pivot.x, pivot.y), mul(a, translation(-pivot.x, -pivot.y)));
  }
  cloneSource: Pt | null = null;
  cloneOffset: Pt | null = null;
  /** The Clone Source panel's five sources: Alt-click
   *  sets the chosen slot's source, and each slot keeps its own point, scale, angle and flips, restored on choosing it. */
  cloneSlots: Array<{ source: Pt; scale: number; angle: number; flipH: boolean; flipV: boolean } | null> = [null, null, null, null, null];
  cloneSlot = 0;
  /** The overlay: Show Overlay; Clipped (on by default) keeps it to the brush, off shows the whole source as a stroke
   *  would copy it; its opacity; Auto Hide hides it while painting. */
  cloneOverlay = { show: true, clipped: true, opacity: 1, autoHide: false };
  private cloneFullCache: { key: string; image: Surface } | null = null;
  private warpState: TE.WarpDrag | null = null;

  /** True while a smudge or liquify drag is in progress. */
  get warping(): boolean { return !!this.warpState; }

  setCloneSource(pt: Pt): void {
    this.cloneSource = { x: pt.x, y: pt.y };
    this.cloneOffset = null;
    const r = this.retouch;
    this.cloneSlots[this.cloneSlot] = { source: { x: pt.x, y: pt.y }, scale: r.cloneScale, angle: r.cloneAngle, flipH: r.cloneFlipH, flipV: r.cloneFlipV };
    this.emit('overlay', null);
    this.emit('options', null);
  }

  /** Choose one of the five sources: the slot left keeps the transform it had, the slot chosen brings back its own
   *  point and transform; an empty slot has no source until an Alt-click sets one. */
  selectCloneSlot(i: number): void {
    if (!Number.isInteger(i) || i < 0 || i > 4 || i === this.cloneSlot) return;
    const r = this.retouch, left = this.cloneSlots[this.cloneSlot];
    if (left) Object.assign(left, { scale: r.cloneScale, angle: r.cloneAngle, flipH: r.cloneFlipH, flipV: r.cloneFlipV });
    this.cloneSlot = i;
    const s = this.cloneSlots[i];
    this.cloneSource = s ? { ...s.source } : null;
    if (s) Object.assign(r, { cloneScale: s.scale, cloneAngle: s.angle, cloneFlipH: s.flipH, cloneFlipV: s.flipV });
    this.cloneOffset = null;
    this.emit('overlay', null);
    this.emit('options', null);
  }

  /** The Clone Source panel's overlay settings: assigns the given fields and redraws the overlay. */
  setCloneOverlay(patch: Partial<{ show: boolean; clipped: boolean; opacity: number; autoHide: boolean }>): void {
    Object.assign(this.cloneOverlay, patch);
    this.emit('overlay', null);
    this.emit('options', null);
  }

  /** The panel's reset: scale 100%, no rotation, no flips. */
  resetCloneTransform(): void {
    Object.assign(this.retouch, { cloneScale: 100, cloneAngle: 0, cloneFlipH: false, cloneFlipV: false });
    this.emit('overlay', null);
    this.emit('options', null);
  }

  /** The unclipped overlay: the whole source (the document as shown, or the active layer, as the stroke samples) and
   *  the matrix placing it where a stroke at `at` would copy it, as `clonePreview` maps it. Cached by the document's
   *  revision and the layer; null with no source. */
  cloneOverlayImage(at: Pt): { image: Surface; m: Mat } | null {
    const p = this.current, l = p?.activeLayer, sp = this.clonePoint(at);
    if (!p || !l || !sp) return null;
    // Current Layer, Current & Below or All Layers (1.50.6, the tool audit), as the Healing Brush's Sample.
    const all = this.retouch.cloneSample !== 'current', key = [this.retouch.cloneSample, l.id, p.history.revision, p.id].join('|');
    if (this.cloneFullCache?.key !== key) {
      const image = all ? this.healSampleSurface(p, l, this.retouch.cloneSample) : l.raster ? l.raster.canvas : null;
      if (!image) return null;
      this.cloneFullCache = { key, image };
    }
    const place = all || !l.raster ? [1, 0, 0, 1, 0, 0] as Mat : placement(l.transform, l.raster.width, l.raster.height);
    const m = mul(mul(translation(at.x - sp.x, at.y - sp.y), this.cloneTransform(sp) ?? [1, 0, 0, 1, 0, 0]), place);
    return { image: this.cloneFullCache.image, m };
  }

  cloneStrokeOffset(pt: Pt): Pt | null {
    if (!this.cloneSource) return null;
    if (this.retouch.cloneAligned && this.cloneOffset) return this.cloneOffset;
    return { x: Math.round(this.cloneSource.x - pt.x), y: Math.round(this.cloneSource.y - pt.y) };
  }

  /** What a Clone Stamp click at `at` would stamp: the source around `clonePoint(at)`, rendered for only the brush
   *  circle at `scale` screen pixels per document pixel, from the whole document or the active layer according to how
   *  the stroke samples, faded by the brush tip as the hardness sets. Reused until the sample point, brush, zoom, layer,
   *  sampling mode or document changes; null with no source or while a stroke is under way. */
  private clonePreviewCache: { key: string; surface: Surface } | null = null;

  clonePreview(at: Pt, scale: number): Surface | null {
    const p = this.current, l = p?.activeLayer, sp = this.clonePoint(at);
    if (!p || !l || !sp || this.stroke) return null;
    const d = this.brush.diameter, side = clamp(Math.ceil(d * scale), 1, 1024);
    const r0 = this.retouch, key = [sp.x.toFixed(2), sp.y.toFixed(2), d, this.brush.hardness, side, r0.cloneSample, l.id, p.history.revision, r0.cloneScale, r0.cloneAngle, r0.cloneFlipH, r0.cloneFlipV].join('|');
    if (this.clonePreviewCache?.key === key) return this.clonePreviewCache.surface;
    const s = createSurface(side, side), c = ctxOf(s), per = side / d, tm = this.cloneTransform(sp);
    const view = mul(mul(scaling(per, per), translation(d / 2 - sp.x, d / 2 - sp.y)), tm ?? [1, 0, 0, 1, 0, 0]);
    if (this.retouch.cloneSample !== 'current') this.work.render({ doc: p.doc, target: s, view, quality: 'medium', ...(this.retouch.cloneSample === 'below' ? { overrides: this.belowOverrides(p, l) } : {}) });
    else if (l.raster) {
      setMat(c, mul(view, placement(l.transform, l.raster.width, l.raster.height)));
      c.drawImage(l.raster.canvas as CanvasImageSource, 0, 0);
      c.setTransform(1, 0, 0, 1, 0, 0);
    }
    const rad = side / 2, hard = clamp(this.brush.hardness, 0, 0.999), fade = c.createRadialGradient(rad, rad, 0, rad, rad, rad);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(hard, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalCompositeOperation = 'destination-in';
    c.fillStyle = fade;
    c.fillRect(0, 0, side, side);
    c.globalCompositeOperation = 'source-over';
    this.clonePreviewCache = { key, surface: s };
    return s;
  }

  clonePoint(pt: Pt): Pt | null {
    const src = this.cloneSource;
    if (!src) return null;
    const off = this.cloneOffset;
    if (!off || (!this.retouch.cloneAligned && !this.stroke)) return src;
    return { x: pt.x + off.x, y: pt.y + off.y };
  }

  private layerSample(p: Project, layer: Layer, sigma = 0): Surface { return IE.layerSample(p, layer, sigma); }

  /** the blurSample for a mask: the mask as the canvas shows it at document size, its edge tone kept past its pixels. */
  private maskBlurSample(p: Project, layer: Layer, sigma: number): Surface { return IE.maskBlurSample(p, layer, sigma); }

  /** The Mixer Brush (1.56.2, the parity plan's L4): its settings, what it holds between strokes, and the colour
   *  source each stroke paints with (engine/mixer.ts). The canvas it picks up from is read once as the stroke starts:
   *  the layer it paints, or every visible layer with Sample All Layers. */
  mixer: MixerSettings = { ...DEFAULT_MIXER };
  private mixerState: MixerState | null = null;
  private mixerSourceFor(p: Project, raster: Raster, local: Mat): (x: number, y: number) => RGB | null {
    this.mixerState = mixerStart(this.mixerState, this.fg, this.mixer);
    const all = this.mixer.sampleAll, img = all ? ctxOf(renderDoc(this.work, p.doc)).getImageData(0, 0, p.doc.width, p.doc.height) : raster.read();
    const inv = all ? null : invert(local) ?? null, toPixels = (x: number, y: number): { x: number; y: number } => (inv ? applyMat(inv, x, y) : { x, y });
    return mixerSource(this.mixerState, this.mixer, windowSampler(img, toPixels, this.brush.diameter / 6));
  }

  /** The Art History Brush (1.56.3): its style and tolerance (percent of the level range), and the stylised version
   *  of the source a stroke reveals, its strokes a quarter of the brush wide, a new pattern each stroke. */
  artHistory: { style: ArtStyle; tolerance: number } = { style: 'tightShort', tolerance: 0 };
  private artHistoryTexture(p: Project, l0: Layer, sample: Surface): Surface {
    const W = p.doc.width, H = p.doc.height, src = ctxOf(sample).getImageData(0, 0, W, H);
    const tol = Math.round(Math.max(0, Math.min(100, this.artHistory.tolerance)) * 2.55);
    const current = tol > 0 ? ctxOf(this.layerSample(p, l0)).getImageData(0, 0, W, H) : null;
    return artHistoryTexture(src, this.artHistory.style, Math.max(2, this.brush.diameter / 4), Math.floor(Math.random() * 2 ** 31), current, tol);
  }

  beginRetouchStroke(kind: 'heal' | 'remove' | 'clone' | 'blur' | 'sharpen' | 'healBrush' | 'dodge' | 'burn' | 'sponge' | 'historyBrush' | 'artHistory' | 'patternStamp', pt: Pt, shift: boolean): boolean {
    if (!this.deepPaintOk()) return false;
    const p = this.current;
    if (!p || this.stroke || this.warpState) return false;
    this.settle();
    const l0 = p.activeLayer;
    if (!l0 || !this.paintable(l0)) { this.notice('Select a pixel layer first.'); return false; }
    if (this.smartLocked(p)) return false;
    const onMask = !!p.maskTarget && !!l0.mask;
    if (onMask && kind !== 'blur') { this.notice('This tool works on layer pixels. Click the layer thumbnail to target them.'); return false; }
    let texture: { surface: Surface; dx: number; dy: number } | null = null;
    if (kind === 'clone' || kind === 'healBrush') {
      // Source: Pattern (the Healing Brush) heals from the chosen pattern tiled over the document; no source to set.
      const pattern = kind === 'healBrush' && this.retouch.healSource === 'pattern' ? this.patternSurface(this.retouch.healPattern, p) : null;
      const off = pattern ? { x: 0, y: 0 } : this.cloneStrokeOffset(pt);
      if (!off) { this.notice(`Alt-click to set where ${kind === 'clone' ? 'Clone Stamp' : 'the Healing Brush'} copies from.`); return false; }
      if (!pattern) this.cloneOffset = off;
      texture = { surface: pattern ?? (kind === 'healBrush' ? this.healSampleSurface(p, l0, this.retouch.healSample) : this.healSampleSurface(p, l0, this.retouch.cloneSample)), dx: off.x, dy: off.y };
      const m = kind === 'clone' && this.cloneSource ? this.cloneTransform(this.cloneSource) : null;
      if (m) {
        const t = createSurface(texture.surface.width, texture.surface.height), tc = ctxOf(t);
        setMat(tc, m);
        tc.drawImage(texture.surface, 0, 0);
        tc.setTransform(1, 0, 0, 1, 0, 0);
        texture = { surface: t, dx: off.x, dy: off.y };
      }
    } else if (kind === 'blur') {
      // Sample All Layers (1.51.4, the tool audit): the composite blurred, painted into the active layer.
      const sigma = clamp(this.brush.diameter / 10, 1.5, 30), all = this.retouch.smearSampleAll && !onMask;
      texture = { surface: onMask ? this.maskBlurSample(p, l0, sigma) : all ? blurred(renderDoc(this.work, p.doc), sigma) : this.layerSample(p, l0, sigma), dx: 0, dy: 0 };
    } else if (kind === 'sharpen') {
      const src = this.retouch.smearSampleAll ? renderDoc(this.work, p.doc) : this.layerSample(p, l0), W = src.width, H = src.height, out = createSurface(W, H);
      const before = ctxOf(src).getImageData(0, 0, W, H), sharp = sharpenSample(before, clamp(this.brush.diameter / 40, 0.8, 4));
      ctxOf(out).putImageData(this.retouch.protectDetail ? withinNeighbours(before, sharp) : sharp, 0, 0);   // Protect Detail: no halos
      texture = { surface: out, dx: 0, dy: 0 };
    } else if (kind === 'dodge' || kind === 'burn' || kind === 'sponge') texture = { surface: this.toned(this.layerSample(p, l0), kind), dx: 0, dy: 0 };
    else if (kind === 'patternStamp') {
      // The Pattern Stamp (1.49.5, the owner's tool list): the pattern tiled across the document, anchored to it, so
      // strokes line up (Aligned).
      const pat = patternById(this.patternStampPattern) ?? allPatterns()[0];
      if (!pat) { this.notice('No pattern to paint with.'); return false; }
      const W = p.doc.width, H = p.doc.height, tile = createSurface(W, H), c = ctxOf(tile), fill = c.createPattern(pat.surface as CanvasImageSource, 'repeat');
      if (fill) { c.fillStyle = fill; c.fillRect(0, 0, W, H); }
      texture = { surface: tile, dx: 0, dy: 0 };
    }
    else if (kind === 'historyBrush' || kind === 'artHistory') {
      // The History Brush paints this layer back from the source snapshot's own copy of it, in document space; the Art
      // History Brush (1.56.3) paints a stylised version of that copy (engine/art-history.ts).
      const id = this.historyBrushSourceId, snap = id ? this.historySnapshots.get(p)?.find((x) => x.id === id) : undefined;
      const src = snap?.state.doc.layers.find((l) => l.id === l0.id);
      if (!snap) { this.notice('The History Brush paints from a snapshot: take one in the History panel (New Snapshot).'); return false; }
      if (!src?.raster) { this.notice(`${snap.name} has no layer matching this one, so the History Brush cannot paint it back; choose another source in the History panel.`); return false; }
      const sample = this.layerSample(p, src);
      texture = { surface: kind === 'artHistory' ? this.artHistoryTexture(p, l0, sample) : sample, dx: 0, dy: 0 };
    }
    p.history.begin({ heal: 'Spot Healing', remove: 'Remove', clone: 'Clone Stamp', healBrush: 'Healing Brush', blur: 'Blur', sharpen: 'Sharpen', dodge: 'Dodge', burn: 'Burn', sponge: 'Sponge', historyBrush: 'History Brush', artHistory: 'Art History Brush', patternStamp: 'Pattern Stamp' }[kind], p.snapshot());
    const pick = this.target(p) as NonNullable<ReturnType<Engine['target']>>;
    const white = { r: 255, g: 255, b: 255 };
    // The Clone Stamp's Flow and Mode (1.50.6, the tool audit), from the options bar; Lock Transparency keeps precedence.
    const style = kind === 'heal' || kind === 'remove' ? { ...this.brush, opacity: 0.45, color: white } : kind === 'clone' ? { ...this.brush, color: white, flow: this.retouch.cloneFlow } : { ...this.brush, color: white };
    const op: GlobalCompositeOperation = pick.target !== 'mask' && l0.locks?.transparency ? 'source-atop' : pick.target === 'mask' ? 'source-over'
      : kind === 'clone' ? compositeOp(this.retouch.cloneBlend) : kind === 'blur' || kind === 'sharpen' ? compositeOp(this.retouch.smearBlend) : 'source-over';
    const s = new PixelStroke(pick.raster, pick.local, style, op, p.selection, texture, pick.target === 'mask');
    // The Healing Brush heals from the same offset at release, in the layer's own pixels.
    let healFrom: Pt | undefined;
    if (kind === 'healBrush' && texture) {
      const toLayer = invert(pick.local), a = applyMat(toLayer, pt.x, pt.y), b = applyMat(toLayer, pt.x + texture.dx, pt.y + texture.dy);
      healFrom = { x: Math.round(b.x - a.x), y: Math.round(b.y - a.y) };
    }
    this.stroke = { project: p, layerId: pick.layer.id, target: pick.target, s, heal: kind === 'heal' ? this.retouch.healMode : kind === 'remove' ? 'remove' : undefined, healFrom };
    s.canGrow = (b) => !this.memoryBudget || this.memoryUse() + b <= this.memoryBudget;   // its window, within the budget (1.60.6)
    const last = this.lastBrush;
    if (shift && last && last.layerId === pick.layer.id && last.target === pick.target) s.to(last.p);
    s.to(pt);
    s.compose();
    this.emit('render', null);
    return true;
  }

  /** The healing brushes' Mode (sourced: Font Bundles' Healing Brush and Spot Healing tutorials; tutvid; Photofocus).
   *  The heal arrives mixed into `before` by the brush's coverage times `opacity`; the full-strength heal is recovered
   *  and composited again in `mode`. Multiply, Screen, Darken, Lighten, Color and Luminosity use the canvas's standard
   *  composite operations. Replace keeps grain and texture at a soft edge by never averaging the two: each pixel takes
   *  the heal or the original whole, with a chance equal to the brush's strength there, on the same stable per-pixel
   *  pattern as the Dissolve blend mode. Pixels the brush barely touches (under 2%) are left as the heal made them. */
  private healBlend(before: ImageData, out: ImageData, coverage: Uint8Array, opacity: number, mode: HealBlend): void {
    if (mode === 'normal') return;
    const W = out.width, H = out.height, a = before.data, o = out.data, full = new ImageData(W, H), f = full.data;
    for (let i = 0; i < coverage.length; i++) {
      const k = (coverage[i] / 255) * opacity, j = i * 4;
      if (k < 0.02) continue;
      for (let ch = 0; ch < 3; ch++) f[j + ch] = a[j + ch] + (o[j + ch] - a[j + ch]) / k;
      f[j + 3] = Math.round(k * 255);
      if (mode === 'replace') {
        const take = dissolveNoise(i % W, (i / W) | 0) < k;
        for (let ch = 0; ch < 3; ch++) o[j + ch] = take ? f[j + ch] : a[j + ch];
      }
    }
    if (mode === 'replace') return;
    const base = createSurface(W, H), bc = ctxOf(base), top = createSurface(W, H);
    bc.putImageData(before, 0, 0);
    ctxOf(top).putImageData(full, 0, 0);
    bc.globalCompositeOperation = mode;
    bc.drawImage(top, 0, 0);
    const res = bc.getImageData(0, 0, W, H).data;
    for (let i = 0; i < coverage.length; i++) {
      if ((coverage[i] / 255) * opacity < 0.02) continue;
      const j = i * 4;
      o[j] = res[j]; o[j + 1] = res[j + 1]; o[j + 2] = res[j + 2];
    }
  }

  /** A pattern (the one chosen, or the first there is) tiled over a document-sized surface from the document's origin,
   *  as Fill tiles it: the source for the Healing Brush's Pattern and Patch's Use Pattern. */
  private patternSurface(id: ID | null, p: Project): Surface {
    const pat = patternById(id) ?? allPatterns()[0] ?? null, s = createSurface(p.doc.width, p.doc.height), c = ctxOf(s);
    const cp = pat ? c.createPattern(pat.surface, 'repeat') : null;
    if (cp) { c.fillStyle = cp; c.fillRect(0, 0, p.doc.width, p.doc.height); }
    return s;
  }

  /** The healing brushes' Sample (Font Bundles' Healing Brush and Spot Healing tutorials; SLR Lounge), in document
   *  space: the active layer alone, it and the layers under it (every layer above hidden, except the folders it sits
   *  in), or every layer shown. */
  private healSampleSurface(p: Project, l: Layer, sample: HealSample): Surface {
    if (sample === 'current') return this.layerSample(p, l);
    if (sample === 'all') return renderDoc(this.work, p.doc);
    const s = createSurface(p.doc.width, p.doc.height);
    this.work.render({ doc: p.doc, target: s, view: [1, 0, 0, 1, 0, 0], overrides: this.belowOverrides(p, l), quality: 'high' });
    return s;
  }

  /** Current & Below: every layer above `l` hidden, but for the groups holding it. */
  private belowOverrides(p: Project, l: Layer): Map<ID, LayerOverride> {
    const layers = p.doc.layers, at = layers.findIndex((x) => x.id === l.id), ancestors = new Set<ID>();
    for (let a = l.parentId; a; a = layers.find((x) => x.id === a)?.parentId ?? null) ancestors.add(a);
    const overrides = new Map<ID, LayerOverride>();
    layers.forEach((x, i) => { if (i > at && !ancestors.has(x.id)) overrides.set(x.id, { hidden: true }); });
    return overrides;
  }

  /** A document-space image in the layer's own pixel space. */
  private rasterSpace(image: Surface, l: Layer, W: number, H: number): ImageData {
    const s = createSurface(W, H), c = ctxOf(s);
    setMat(c, invert(placement(l.transform, W, H)));
    c.drawImage(image, 0, 0);
    c.setTransform(1, 0, 0, 1, 0, 0);
    return c.getImageData(0, 0, W, H);
  }

  /** Healed pixels, worked out on a sampled image, laid onto the layer's own pixels at the brush's strength (coverage
   *  times opacity) with source-over, so an empty layer ends up holding just the repair. */
  private layHeal(before: ImageData, healed: ImageData, coverage: Uint8Array, opacity: number): ImageData {
    const W = before.width, H = before.height, top = new ImageData(W, H), t = top.data, h = healed.data;
    for (let i = 0; i < coverage.length; i++) {
      const j = i * 4;
      t[j] = h[j]; t[j + 1] = h[j + 1]; t[j + 2] = h[j + 2];
      t[j + 3] = Math.round((h[j + 3] / 255) * coverage[i] * opacity);
    }
    const base = createSurface(W, H), bc = ctxOf(base), over = createSurface(W, H);
    bc.putImageData(before, 0, 0);
    ctxOf(over).putImageData(top, 0, 0);
    bc.drawImage(over, 0, 0);
    return bc.getImageData(0, 0, W, H);
  }

  private healFromPatch(s: PixelStroke, off: Pt): ReturnType<PixelStroke['commit']> {
    const r = s.layer;   // an ordinary layer (1.62.5)
    const before = r.read();
    const sample = this.retouch.healSample, p = this.current, l = p?.doc.layers.find((x) => x.raster === r);
    // Source: Pattern: the pattern in the layer's pixel space, healed from in place (the offset is 0).
    const patRaw = this.retouch.healSource === 'pattern' && p && l ? this.rasterSpace(this.patternSurface(this.retouch.healPattern, p), l, r.width, r.height) : null;
    const patPm = patRaw ? premultiply(patRaw.data) : undefined;
    if (sample !== 'current' && p && l) {
      // Healed at full strength over the stroke's whole footprint on the sampled image, then laid on at the brush's
      // own soft coverage; healing with the soft coverage and laying it on again would square the falloff.
      const cov = s.coverageAlpha(), hard = cov.map((v) => (v > 0 ? 255 : 0)), W = r.width, H = r.height;
      const base = this.rasterSpace(this.healSampleSurface(p, l, sample), l, W, H), pmS = premultiply(base.data);
      if (!healFromSource(pmS, hard, W, H, 1, off.x, off.y, patPm)) return null;
      const healed = new ImageData(W, H);
      unpremultiply(pmS, healed.data);
      scaleHealCorrection(healed.data, base.data, hard, W, H, off.x, off.y, this.retouch.healDiffusion, 1, 1, patRaw?.data);
      this.healBlend(base, healed, hard, 1, this.retouch.healBlendMode);
      r.write(this.layHeal(before, healed, cov, this.brush.opacity));
      return { raster: r, x: 0, y: 0, before, after: r.read() };
    }
    const pm = premultiply(before.data);
    if (!healFromSource(pm, s.coverageAlpha(), r.width, r.height, this.brush.opacity, off.x, off.y, patPm)) return null;
    const out = new ImageData(r.width, r.height);
    unpremultiply(pm, out.data);
    scaleHealCorrection(out.data, before.data, s.coverageAlpha(), r.width, r.height, off.x, off.y, this.retouch.healDiffusion, 1, this.brush.opacity, patRaw?.data);
    this.healBlend(before, out, s.coverageAlpha(), this.brush.opacity, this.retouch.healBlendMode);
    r.write(out);
    return { raster: r, x: 0, y: 0, before, after: r.read() };
  }

  /** Patch's Use Pattern (Light Stalking's Patch tutorial: repair an area using a pattern, blended with the pixels
   *  around it): heals the selected area of the active pixel layer from the chosen pattern, tiled from the document's
   *  origin, so it meets the selection's edge without a seam, with the Patch tool's Diffusion, as one undo step. */
  patchWithPattern(): void {
    const p0 = this.current;
    if (!p0?.selection) { this.notice('Make a selection, then choose Use Pattern.'); return; }
    if (!this.paintable(p0.activeLayer)) { this.notice('Select a pixel layer first.'); return; }
    if (p0.maskTarget && p0.activeLayer?.mask) { this.notice('Patch works on layer pixels. Click the layer thumbnail to target them.'); return; }
    this.edit('Patch', () => {
      this.regionEdit('Patch', ({ raster, target, rect }) => {
        if (target !== 'pixels') return;
        const p = this.current as Project, l = p.activeLayer as Layer, W = raster.width, H = raster.height;
        const cov = this.coverageFor(p, l, target, W, H);
        if (!cov) return;
        const mask = new Uint8Array(W * H);
        for (let i = 0; i < mask.length; i++) mask[i] = cov[i * 4 + 3];
        const before = raster.read(), pm = premultiply(before.data), pat = this.rasterSpace(this.patternSurface(this.retouch.patchPattern, p), l, W, H);
        if (!healFromSource(pm, mask, W, H, 1, 0, 0, premultiply(pat.data))) return;
        const out = new ImageData(W, H);
        unpremultiply(pm, out.data);
        scaleHealCorrection(out.data, before.data, mask, W, H, 0, 0, this.retouch.patchDiffusion, 1, 1, pat.data);
        raster.ctx.putImageData(out, 0, 0, rect.x, rect.y, rect.w, rect.h);
      });
    });
  }

  /** Patch: heals the selected area of the active pixel layer from the area (dx, dy) document pixels away, blended to
   *  meet the selection's edge, as one undo step. Destination (Patch: Destination) copies the selection
   *  onto the area it is dragged to instead: the same work on the moved selection with the drag reversed, and the
   *  selection ends there. Transparent keeps what is under the patch and adds only the source's detail (its high
   *  pass). Content-Aware heals, then rebuilds a band along the seam by content-aware fill, so the edge is
   *  synthesized rather than colour-blended. */
  patchSelection(dx: number, dy: number): void {
    const p0 = this.current;
    if (!p0?.selection) { this.notice('Make a selection, then drag it onto the area to copy from.'); return; }
    if (!this.paintable(p0.activeLayer)) { this.notice('Select a pixel layer first.'); return; }
    if (p0.maskTarget && p0.activeLayer?.mask) { this.notice('Patch works on layer pixels. Click the layer thumbnail to target them.'); return; }
    const opts = this.retouch, dest = opts.patchFrom === 'destination';
    this.edit('Patch', (pp) => {
      const sel = pp.selection as SelectionMask;
      if (dest) pp.selection = SelectionMask.cropped(sel.x + dx, sel.y + dy, sel.w, sel.h, sel.data);
      const ddx = dest ? -dx : dx, ddy = dest ? -dy : dy;
      this.regionEdit('Patch', ({ raster, target, rect }) => {
        if (target !== 'pixels') return;
        const p = this.current as Project, l = p.activeLayer as Layer, W = raster.width, H = raster.height;
        const cov = this.coverageFor(p, l, target, W, H);
        if (!cov) return;
        const toLayer = invert(placement(l.transform, W, H)), a = applyMat(toLayer, 0, 0), b = applyMat(toLayer, ddx, ddy);
        const ox = Math.round(b.x - a.x), oy = Math.round(b.y - a.y);
        const mask = new Uint8Array(W * H);
        for (let i = 0; i < mask.length; i++) mask[i] = cov[i * 4 + 3];
        // Sample All Layers (Content-Aware): the patch is worked out on everything shown, in the layer's pixel space, and
        // the result laid onto the layer through the selection, so a patch can go onto an empty layer.
        const sampleAll = opts.patchMode === 'contentAware' && opts.patchSampleAll;
        const baseImage = sampleAll ? this.rasterSpace(this.healSampleSurface(p, l, 'all'), l, W, H) : raster.read();
        const orig = baseImage.data, pm = premultiply(orig);
        if (!healFromSource(pm, mask, W, H, 1, ox, oy)) return;
        const out = new ImageData(W, H);
        unpremultiply(pm, out.data);
        // Diffusion (Normal mode, 1 to 7) and Color (Content-Aware, 0 to 10) act on the heal's colour correction, the
        // difference between the healed result and a plain copy of the source. Diffusion fades it with the distance
        // inside the edge over 2^Diffusion px (7 keeps it everywhere, as before; lower keeps more of the source's own
        // texture inside); Color scales it (0 is a plain copy, no colour blending; 10 is the full blend, as before).
        const diffusion = opts.patchMode === 'normal' ? opts.patchDiffusion : 7;
        const colour = opts.patchMode === 'contentAware' ? Math.min(10, Math.max(0, opts.patchColor)) / 10 : 1;
        scaleHealCorrection(out.data, orig, mask, W, H, ox, oy, diffusion, colour);
        if (opts.patchTransparent) {
          const src = new ImageData(W, H);
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const sx = Math.min(W - 1, Math.max(0, x + ox)), sy = Math.min(H - 1, Math.max(0, y + oy)); src.data.set(orig.subarray((sy * W + sx) * 4, (sy * W + sx) * 4 + 4), (y * W + x) * 4); }
          const low = gaussianBlur(src, 4);
          for (let i = 0; i < mask.length; i++) {
            const k = mask[i] / 255;
            for (let ch = 0; ch < 3; ch++) out.data[i * 4 + ch] = Math.round(orig[i * 4 + ch] + k * (src.data[i * 4 + ch] - low.data[i * 4 + ch]));
            out.data[i * 4 + 3] = orig[i * 4 + 3];
          }
        }
        if (opts.patchMode === 'contentAware') {
          // Structure (1 to 7): how strictly the patch keeps the source's patterns; the band inside the edge rebuilt from the
          // surroundings is 8 - Structure px wide (5 gives the 3 px used before).
          const band = new Uint8Array(W * H), R = 8 - Math.round(Math.min(7, Math.max(1, opts.patchStructure)));
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const inside = mask[y * W + x] >= 128;
            let edge = false;
            for (let j = -R; j <= R && !edge; j++) for (let i = -R; i <= R; i++) { const X = x + i, Y = y + j; if (X >= 0 && Y >= 0 && X < W && Y < H && (mask[Y * W + X] >= 128) !== inside) { edge = true; break; } }
            if (edge && inside) band[y * W + x] = 255;
          }
          contentFill(out.data, band, W, H);
        }
        raster.ctx.putImageData(sampleAll ? this.layHeal(raster.read(), out, mask, 1) : out, 0, 0, rect.x, rect.y, rect.w, rect.h);
      });
    });
  }

  /** The Remove tool's release: what the stroke covered, grown by two pixels so its soft edge goes too, rebuilt by
   *  content-aware fill (PatchMatch-style patch copying) from the rest of the layer. */
  private removePatch(s: PixelStroke): ReturnType<PixelStroke['commit']> {
    const r = s.layer, W = r.width, H = r.height, before = r.read(), pm = premultiply(before.data), cov = s.coverageAlpha(), hole0 = new Uint8Array(W * H);
    for (let i = 0; i < hole0.length; i++) hole0[i] = cov[i] > 0 ? 255 : 0;
    const grown = resizeMask(hole0, W, H, 2), hole = new Uint8Array(W * H);
    for (let i = 0; i < hole.length; i++) hole[i] = grown[i] >= 128 ? 1 : 0;
    // A hole in a smooth area (little variance in the known ring around it) takes the quick diffusion fill (36.5); any
    // other keeps the patch-copying fill.
    const quick = ringVariance(pm, hole, W, H) < SMOOTH_RING_VARIANCE;
    if (!(quick ? diffusionFill(pm, hole, W, H) : contentFill(pm, hole, W, H))) { this.notice('There is nothing opaque around the stroke to fill from.'); return null; }
    const out = new ImageData(W, H);
    unpremultiply(pm, out.data);
    r.write(out);
    return { raster: r, x: 0, y: 0, before, after: r.read() };
  }

  /** Remove Distractions: Wires and Cables on the active layer (within the selection when there is one), filled
   *  smoothly as Spot Healing's Create Texture fills, as one step. Returns how many pixels were taken. */
  removeWires(): number {
    const p0 = this.current;
    if (!this.paintable(p0?.activeLayer ?? null)) { this.notice('Select a pixel layer first.'); return 0; }
    let found = 0;
    this.regionEdit('Remove Wires and Cables', ({ raster, target, rect, cover }) => {
      if (target !== 'pixels') return;
      const W = raster.width, H = raster.height, img = raster.read(), wires = findWires(img), cov = new Uint8Array(W * H);
      const inSel = cover ? ctxOf(cover).getImageData(0, 0, rect.w, rect.h).data : null;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!wires[i]) continue;
        if (inSel && (x < rect.x || y < rect.y || x >= rect.x + rect.w || y >= rect.y + rect.h || inSel[((y - rect.y) * rect.w + (x - rect.x)) * 4 + 3] < 128)) continue;
        cov[i] = 255; found++;
      }
      if (!found) return;
      const pm = premultiply(img.data);
      if (!spotHeal(pm, cov, W, H, 1, 'createTexture', 0x5eed)) { found = 0; return; }
      const out = new ImageData(W, H);
      unpremultiply(pm, out.data);
      raster.ctx.putImageData(out, 0, 0, rect.x, rect.y, rect.w, rect.h);
    });
    if (!found) this.notice('No wires or cables were found.');
    return found;
  }

  private healPatch(s: PixelStroke, mode: HealMode): ReturnType<PixelStroke['commit']> {
    const r = s.layer;   // an ordinary layer (1.62.5)
    const before = r.read();
    const p = this.current, l = p?.doc.layers.find((x) => x.raster === r);
    if (this.retouch.spotSampleAll && p && l) {
      // Sample All Layers: healed at full strength on everything shown, then laid on at the brush's soft coverage.
      const cov = s.coverageAlpha(), hard = cov.map((v) => (v > 0 ? 255 : 0)), W = r.width, H = r.height;
      const base = this.rasterSpace(this.healSampleSurface(p, l, 'all'), l, W, H), pmS = premultiply(base.data);
      if (!spotHeal(pmS, hard, W, H, 1, mode, (Math.random() * 0x100000000) >>> 0)) return null;
      const healed = new ImageData(W, H);
      unpremultiply(pmS, healed.data);
      this.healBlend(base, healed, hard, 1, this.retouch.spotBlendMode);
      r.write(this.layHeal(before, healed, cov, this.brush.opacity));
      return { raster: r, x: 0, y: 0, before, after: r.read() };
    }
    const pm = premultiply(before.data);
    if (!spotHeal(pm, s.coverageAlpha(), r.width, r.height, this.brush.opacity, mode, (Math.random() * 0x100000000) >>> 0)) return null;
    const out = new ImageData(r.width, r.height);
    unpremultiply(pm, out.data);
    this.healBlend(before, out, s.coverageAlpha(), this.brush.opacity, this.retouch.spotBlendMode);
    r.write(out);
    return { raster: r, x: 0, y: 0, before, after: r.read() };
  }

  beginWarp(mode: 'smudge' | 'liquify', pt: Pt): boolean {
    if (this.warpState) return false;
    const w = TE.beginWarp(this.entryHost, mode, pt);
    this.warpState = w;
    return !!w;
  }

  warpTo(pt: Pt): void { if (this.warpState) TE.warpTo(this.entryHost, this.warpState, pt); }

  endWarp(): void {
    const w = this.warpState;
    if (!w) return;
    this.warpState = null;
    TC.commitWarpStroke(this.commitHost, { project: w.project, layerId: w.layerId, stroke: w.stroke, surface: { canvas: w.surface } });
  }

  cancelWarp(): void {
    const w = this.warpState;
    if (!w) return;
    this.warpState = null;
    TE.cancelWarp(this.entryHost, w);
  }

  /** Generative Fill: paints the selection from `prompt`, or removes what it covers when the prompt is empty, through
   *  `generate`; the result arrives as a new layer masked to the selection, in one undo step. */
  async generativeFill(prompt: string, generate: (image: Blob, mask: Blob) => Promise<Blob>): Promise<boolean> {
    const p = this.current, sel = p?.selection;
    if (!p || !sel) { this.notice('Generative Fill needs a selection.'); return false; }
    return this.fillArea(p, sel, prompt, generate, 'Generative Fill', 'remove');
  }

  /** Generative Expand: grows the canvas by the margins, then fills the new border from `prompt` (an empty prompt
   *  extends the scene) as a layer masked to the border. The canvas change and the fill are two undo steps. */
  async generativeExpand(margins: { left: number; top: number; right: number; bottom: number }, prompt: string, generate: (image: Blob, mask: Blob) => Promise<Blob>): Promise<boolean> {
    const p = this.current;
    if (!p) return false;
    const side = (v: number): number => Math.max(0, Math.round(Number.isFinite(v) ? v : 0));
    const left = side(margins.left), top = side(margins.top), right = side(margins.right), bottom = side(margins.bottom);
    if (!(left + top + right + bottom)) { this.notice('Set how far to expand the canvas.'); return false; }
    const oldW = p.doc.width, oldH = p.doc.height, W = oldW + left + right, H = oldH + top + bottom;
    if (!this.resizeCanvas(W, H, left, top, null, 'Generative Expand')) return false;
    const border = new Uint8Array(W * H).fill(255);
    for (let y = top; y < top + oldH; y++) border.fill(0, y * W + left, y * W + left + oldW);
    return this.fillArea(p, new SelectionMask(0, 0, W, H, border), prompt, generate, 'Generative Expand', 'extend');
  }

  /** A new document holding `img` as its one layer, as Batch opens each file. */
  openImage(img: ImportedImage): Project {
    const base: Doc = { id: uid(), width: img.width, height: img.height, resolution: img.resolution ?? 72, layers: [] };
    const layer = { ...newLayer('Background', base), raster: Raster.from(img.source, img.width, img.height) };
    return this.addProject({ ...base, ...(img.profile ? { profile: img.profile } : {}), ...(img.meta ? { meta: img.meta } : {}), layers: [layer] }, img.name.replace(/\.[^.]+$/, '') || 'Image', layer.id);   // an embedded profile kept (1.53.5)
  }

  /** A new document for an animation opened from a file: a layer per frame (Frame 1 at the bottom) and a frame
   *  animation whose frame n shows layer n alone, with the file's delay and `plays` (0 forever). */
  openFrameAnimation(name: string, width: number, height: number, plays: number, frames: Array<{ source: CanvasImageSource; delay: number }>): Project | null {
    if (!frames.length || !this.sizeOk(width, height)) return null;
    const base: Doc = { id: uid(), width, height, resolution: 72, layers: [] };
    const layers = frames.map((f, i) => newLayer(`Frame ${i + 1}`, base, { raster: Raster.from(f.source, width, height), visible: i === 0 }));
    const p = this.addProject({ ...base, layers }, name, layers[0].id);
    const list: Frame[] = frames.map((f, i) => ({
      id: uid(), delay: Math.min(60000, Math.max(0, Math.round(f.delay))),
      state: Object.fromEntries(layers.map((l, j) => [l.id, { visible: i === j, opacity: 1, x: l.transform.x, y: l.transform.y, fx: null }])),
    }));
    this.setTimelineFor(p, { frames: list, current: list[0].id, loops: Math.min(65535, Math.max(0, Math.round(plays))) });
    return p;
  }

  /** File > Scripts > Load Files into Stack and Statistics (30.4): one new document holding every image as a layer at the
   *  top left (the first file at the bottom), sized to the largest; as a smart object stack when `smart` or a mode is set. */
  loadStack(imgs: ImportedImage[], opts: { smart: boolean; mode: StackMode }): Project | null {
    if (imgs.length < 2) { this.notice('Choose at least two files to load into a stack.'); return null; }
    const W = Math.max(...imgs.map((i) => i.width)), H = Math.max(...imgs.map((i) => i.height));
    const base: Doc = { id: uid(), width: W, height: H, resolution: 72, layers: [] };
    const layers = imgs.map((img) => ({ ...newLayer(img.name.replace(/\.[^.]+$/, '') || 'Layer', base), raster: Raster.from(img.source, img.width, img.height) }));
    const first = imgs[0];
    const p = this.addProject({ ...base, ...(first.profile ? { profile: first.profile } : {}), layers }, first.name.replace(/\.[^.]+$/, '') || 'Stack', layers[layers.length - 1].id);
    if (opts.smart || opts.mode !== 'none') {
      this.stackToSmartObject(p.doc.layers.filter((l) => !l.isGroup));
      if (opts.mode !== 'none') this.setStackMode(opts.mode);
    }
    return p;
  }

  /** Edit > Compare with... (36.5): a new document holding what this one shows, what `other` shows (hidden, kept for
   *  reference) and a "Differences" layer in Difference blend mode, with the regions that differ by more than
   *  `threshold` (0 to 255, the largest channel difference) and at least `minSize` pixels selected. Both pictures sit at
   *  the top left of a canvas as large as the larger. Returns how many regions differ, or null when it could not run. */
  compareDocuments(other: Project, threshold: number, minSize: number): number | null {
    const mine = this.current;
    if (!mine || other === mine) return null;
    const a = this.flattenedOf(mine), b = this.flattenedOf(other);
    if (!a || !b) { this.notice('One of the documents could not be read.', 'error'); return null; }
    const W = Math.max(a.width, b.width), H = Math.max(a.height, b.height);
    if (W > LIMITS.side || H > LIMITS.side || W * H > LIMITS.pixels || !this.room(W * H * 4 * 5, 'Compare')) return null;
    const put = (s: Surface): Raster => { const r = new Raster(W, H); (r.ctx as CanvasRenderingContext2D).drawImage(s as CanvasImageSource, 0, 0); r.touch(); return r; };
    const ra = put(a), rb = put(b);
    const found = diffRegions(ra.read().data, rb.read().data, W, H, Math.max(0, Math.min(255, Math.round(threshold))), Math.max(1, Math.round(minSize)));
    const base: Doc = { id: uid(), width: W, height: H, resolution: mine.doc.resolution, layers: [] };
    const la = { ...newLayer(mine.name, base), raster: ra }, lb = { ...newLayer(other.name, base), raster: rb, visible: false };
    const ld = { ...newLayer('Differences', base), raster: put(b), blend: 'difference' as const };
    const p = this.addProject({ ...base, layers: [la, lb, ld] }, `${mine.name} vs ${other.name}`, ld.id);
    p.selection = SelectionMask.cropped(0, 0, W, H, found.mask);
    this.emit('selection', null);
    this.refresh();
    return found.regions.length;
  }

  /** Upscale: what the document shows, enlarged `scale` times by `run`, opened as a new document. */
  async upscaleToDocument(scale: number, run: (image: Blob) => Promise<Blob>): Promise<boolean> {
    const p = this.current, view = this.flattened();
    if (!p || !view) return false;
    const W = p.doc.width * scale, H = p.doc.height * scale;
    if (W > LIMITS.side || H > LIMITS.side || W * H > LIMITS.pixels) { this.notice(`Upscaled ${scale} times, this image would pass 30,000 px a side or ${Math.round(LIMITS.pixels / 1_000_000)} megapixels.`, 'error'); return false; }
    let result: Blob;
    try {
      result = await run(await toBlob(view));
    } catch (err) {
      this.notice(err instanceof Error ? err.message : 'Upscale failed.', 'error');
      return false;
    }
    const bitmap = await createImageBitmap(result);
    const raster = new Raster(W, H);
    raster.ctx.imageSmoothingQuality = 'high';
    raster.ctx.drawImage(bitmap, 0, 0, W, H);
    bitmap.close();
    raster.touch();
    const base: Doc = { id: uid(), width: W, height: H, resolution: p.doc.resolution, layers: [] };
    const layer = { ...newLayer('Background', base), raster };
    this.addProject({ ...base, layers: [layer] }, `${p.name} ${scale}x`, layer.id);
    return true;
  }

  /** Sends what the document shows around `sel` (a quarter of its size again as context, 16 to 256 px), with see-
   *  through areas pre-filled smoothly and `sel` grown by three pixels as the mask, to `generate`, then places the
   *  result as a new layer masked to `sel`, unless the document changed meanwhile. */
  /** Remove's People and Distractions (1.57.4, the parity plan's M1): the app sets `removeFinder` (it asks the engine
   *  for the area and LaMa for the fill); `removeArea` fills a found area as one step, as Generative Fill does. */
  removeFinder: ((kind: 'people' | 'distractions') => Promise<void>) | null = null;
  async removeArea(area: SelectionMask, undoName: string, generate: (image: Blob, mask: Blob) => Promise<Blob>): Promise<boolean> {
    const p = this.current;
    if (!p) return false;
    return this.fillArea(p, area, '', generate, undoName, 'remove');
  }

  private async fillArea(p: Project, sel: SelectionMask, prompt: string, generate: (image: Blob, mask: Blob) => Promise<Blob>, undoName: string, emptyName: string): Promise<boolean> {
    const view = this.flattened();
    if (!view) return false;
    const reach = Math.min(256, Math.max(16, Math.round(Math.max(sel.w, sel.h) * 0.25)));
    const x0 = Math.max(0, sel.x - reach), y0 = Math.max(0, sel.y - reach);
    const w = Math.min(p.doc.width, sel.x + sel.w + reach) - x0, h = Math.min(p.doc.height, sel.y + sel.h + reach) - y0;
    if (w < 1 || h < 1) { this.notice('The selection is outside the canvas.'); return false; }
    const context = new Raster(w, h);
    context.ctx.drawImage(view, -x0, -y0);
    const pixels = context.ctx.getImageData(0, 0, w, h);
    if (fillTransparent(pixels)) context.ctx.putImageData(pixels, 0, 0);
    const cover = new Raster(w, h);
    cover.ctx.drawImage(sel.surface(), sel.x - x0, sel.y - y0);
    const mask = Raster.filled(w, h, '#000000');
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy <= 9) mask.ctx.drawImage(cover.canvas, dx, dy);
    let result: Blob;
    try {
      result = await generate(await toBlob(context.canvas), await toBlob(mask.canvas));
    } catch (err) {
      this.notice(err instanceof Error ? err.message : `${undoName} failed.`, 'error');
      return false;
    }
    // The result goes into the document it was made for (1.87.3, D11): back to its tab when another was chosen meanwhile.
    if (this.current !== p) {
      if (!this.projects.includes(p)) { this.notice(`${p.name} was closed while generating, so the ${undoName} result was not placed.`, 'error'); return false; }
      this.switchTo(p.id);
      this.notice(`The ${undoName} result was placed in ${p.name}, the document it was made for.`);
    }
    const bitmap = await createImageBitmap(result);
    const layer = new Raster(w, h);
    layer.ctx.imageSmoothingQuality = 'high';
    layer.ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    layer.touch();
    cover.touch();
    const name = `${undoName}: ${prompt.trim() || emptyName}`;
    this.insertRasterLayer(layer, name.length > 60 ? `${name.slice(0, 57)}...` : name, x0, y0, { mask: { raster: cover, enabled: true, linked: true, placement: null } }, undoName);
    return true;
  }

  /** Content-Aware Move (J; 1.49.9, the owner's tool list): the selected pixels (their soft edges kept)
   *  placed dx, dy away; in Move mode the hole they leave filled from around it (the Content-Aware Fill's fill), in
   *  Extend mode the original kept; the selection goes with them. One step. */
  contentAwareMove(dx: number, dy: number, mode: 'move' | 'extend' = 'move'): void {
    const p0 = this.current;
    if (!p0?.selection) { this.notice('Make a selection, then drag it where it should go.'); return; }
    if (!this.paintable(p0.activeLayer)) { this.notice('Select a pixel layer first.'); return; }
    if (p0.maskTarget && p0.activeLayer?.mask) { this.notice('Content-Aware Move works on layer pixels. Click the layer thumbnail to target them.'); return; }
    const sel0 = p0.selection;
    this.regionEdit('Content-Aware Move', ({ raster }) => {
      const p = this.current as Project, l = p.activeLayer as Layer, W = raster.width, H = raster.height;
      const cov = this.coverageFor(p, l, 'pixels', W, H);
      if (!cov) return;
      const sx = W / Math.max(1e-6, l.transform.w), sy = H / Math.max(1e-6, l.transform.h), ox = Math.round(dx * sx), oy = Math.round(dy * sy);
      const src = raster.read(), out = new ImageData(new Uint8ClampedArray(src.data), W, H);
      if (mode === 'move') {
        const pm = premultiply(src.data), hole = new Uint8Array(W * H);
        for (let i = 0; i < hole.length; i++) hole[i] = cov[i * 4 + 3] ? 1 : 0;
        if (contentFill(pm, hole, W, H)) unpremultiply(pm, out.data);
      }
      // The moved pixels over what is there, by the selection's coverage.
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, a = cov[i * 4 + 3] / 255;
        if (!a) continue;
        const tx = x + ox, ty = y + oy;
        if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
        const s4 = i * 4, d4 = (ty * W + tx) * 4, sa = (src.data[s4 + 3] / 255) * a, da = out.data[d4 + 3] / 255, oa = sa + da * (1 - sa);
        for (let k = 0; k < 3; k++) out.data[d4 + k] = oa ? Math.round((src.data[s4 + k] * sa + out.data[d4 + k] * da * (1 - sa)) / oa) : 0;
        out.data[d4 + 3] = Math.round(oa * 255);
      }
      raster.ctx.putImageData(out, 0, 0);
    }, null);
    if (this.current === p0 && p0.selection === sel0) { p0.selection = SelectionMask.cropped(sel0.x + dx, sel0.y + dy, sel0.w, sel0.h, sel0.data); this.emit('selection', null); }
  }

  /** Red Eye (J; 1.49.9, the owner's tool list): at a click near a red pupil, the red area joined to it
   *  (reached from the nearest red pixel within a few pixels, and no wider than Pupil Size allows) darkened to a
   *  neutral by Darken Amount. One step; nothing red near the click leaves the image as it was. */
  redEye(pt: Pt, pupil = 50, darken = 50): void {
    const p0 = this.current, l0 = p0?.activeLayer ?? null;
    if (!p0 || !this.paintable(l0) || !l0?.raster) { this.notice('Select a pixel layer first.'); return; }
    // Found first, so a click with nothing red near it records no step.
    if (!this.redEyeArea(l0.raster, l0.transform, pt, pupil)) { this.notice('No red pupil near the click: click the red part of the eye.'); return; }
    this.regionEdit('Red Eye', ({ raster }) => {
      const l = (this.current as Project).activeLayer as Layer, area = this.redEyeArea(raster, l.transform, pt, pupil);
      if (!area) return;
      const { x0, y0, w, h, inside } = area, img = raster.ctx.getImageData(x0, y0, w, h), d = img.data;
      const f = 1 - (Math.max(1, Math.min(100, darken)) / 100) * 0.75;
      for (let k = 0; k < inside.length; k++) {
        if (!inside[k]) continue;
        const v = Math.round(((d[k * 4 + 1] + d[k * 4 + 2]) / 2) * f);
        d[k * 4] = v; d[k * 4 + 1] = v; d[k * 4 + 2] = v;
      }
      raster.ctx.putImageData(img, x0, y0);
    }, null);
  }

  /** The red area joined to a click (from the nearest red pixel within 6), no further than Pupil Size allows. */
  private redEyeArea(raster: Raster, t: Transform, pt: Pt, pupil: number): { x0: number; y0: number; w: number; h: number; inside: Uint8Array } | null {
    const W = raster.width, H = raster.height;
    const q = applyMat(invert(placement(t, W, H)) ?? [1, 0, 0, 1, 0, 0], pt.x, pt.y), cx = Math.floor(q.x), cy = Math.floor(q.y);
    const reach = Math.round(8 + pupil * 1.2), x0 = Math.max(0, cx - reach), y0 = Math.max(0, cy - reach), x1 = Math.min(W, cx + reach + 1), y1 = Math.min(H, cy + reach + 1);
    if (x1 <= x0 || y1 <= y0) return null;
    const w = x1 - x0, h = y1 - y0, d = raster.ctx.getImageData(x0, y0, w, h).data;
    const red = (k: number): boolean => d[k * 4 + 3] > 0 && d[k * 4] > 60 && d[k * 4] > 1.5 * Math.max(d[k * 4 + 1], d[k * 4 + 2]);
    let seed = -1, best = Infinity;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = y * w + x, dd = Math.hypot(x + x0 - cx, y + y0 - cy); if (dd <= 6 && red(k) && dd < best) { best = dd; seed = k; } }
    if (seed < 0) return null;
    const inside = new Uint8Array(w * h), stack = [seed];
    inside[seed] = 1;
    while (stack.length) {
      const k = stack.pop() as number, x = k % w, y = (k - x) / w;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nk = ny * w + nx;
        if (!inside[nk] && red(nk) && Math.hypot(nx + x0 - cx, ny + y0 - cy) <= reach) { inside[nk] = 1; stack.push(nk); }
      }
    }
    return { x0, y0, w, h, inside };
  }

  contentAwareFill(): void { IE.contentAwareFill(this.editHost); }

  /** The Content-Aware Fill workspace's OK: fills the selection on the active layer, sampling only from `allowDoc`
   *  (1 where sampling is allowed, over the whole canvas) when given, and sends the result to the current layer, a
   *  new layer holding only the filled pixels (for an upright, unscaled layer), or a duplicate of the layer. One step. */
  contentAwareFillWith(allowDoc: Uint8Array | null, output: 'current' | 'new' | 'duplicate', options: FillOptions = FILL_DEFAULTS): void {
    const p0 = this.current;
    if (!p0?.selection) { this.notice('Content-Aware Fill needs a selection.'); return; }
    if (!this.paintable(p0.activeLayer)) { this.notice('Select a pixel layer first.'); return; }
    const l0 = p0.activeLayer as Layer, plain = !!l0.raster && !l0.transform.rotation && l0.transform.w === l0.raster.width && l0.transform.h === l0.raster.height && !l0.transform.flipX && !l0.transform.flipY;
    const mode = output === 'new' && !plain ? 'duplicate' : output;
    this.edit('Content-Aware Fill', (p) => {
      if (mode === 'duplicate') this.duplicateLayers();
      const l = p.activeLayer as Layer, r = l.raster;
      if (!r) return false;
      const cov = this.coverageFor(p, l, 'pixels', r.width, r.height);
      if (!cov) return false;
      let allow: Uint8Array | null = null;
      if (allowDoc && allowDoc.length === p.doc.width * p.doc.height) {
        const doc = createSurface(p.doc.width, p.doc.height), dc = ctxOf(doc), di = dc.createImageData(p.doc.width, p.doc.height);
        for (let i = 0; i < allowDoc.length; i++) di.data[i * 4 + 3] = allowDoc[i] ? 255 : 0;
        dc.putImageData(di, 0, 0);
        const local = createSurface(r.width, r.height), lc = ctxOf(local);
        setMat(lc, invert(placement(l.transform, r.width, r.height)));
        lc.imageSmoothingEnabled = false;
        lc.drawImage(doc, 0, 0);
        const ld = lc.getImageData(0, 0, r.width, r.height).data;
        allow = new Uint8Array(r.width * r.height);
        for (let i = 0; i < allow.length; i++) allow[i] = ld[i * 4 + 3] >= 128 ? 1 : 0;
      }
      const src = r.read(), pm = premultiply(src.data), hole = new Uint8Array(r.width * r.height);
      for (let i = 0; i < hole.length; i++) hole[i] = cov[i * 4 + 3] ? 1 : 0;
      if (!contentFill(pm, hole, r.width, r.height, allow, options)) { this.notice('There is nothing opaque in the sampling area to fill from.'); return false; }
      const out = new ImageData(r.width, r.height);
      unpremultiply(pm, out.data);
      const result = this.blendThrough(src, out, cov);
      if (mode === 'new') {
        const only = new ImageData(r.width, r.height);
        for (let i = 0; i < hole.length; i++) if (hole[i]) only.data.set(result.data.subarray(i * 4, i * 4 + 4), i * 4);
        const nr = new Raster(r.width, r.height);
        nr.ctx.putImageData(only, 0, 0);
        this.insertRasterLayer(nr, 'Content-Aware Fill', l.transform.x, l.transform.y, {}, 'Content-Aware Fill');
        return true;
      }
      const nr = new Raster(r.width, r.height);
      nr.ctx.putImageData(result, 0, 0);
      p.updateLayer(l.id, { raster: nr, shape: null });
      return true;
    });
  }

  snapping = true;
  snapGuides: { xs: number[]; ys: number[] } | null = null;
  private contentBoxes = new WeakMap<Raster, { version: number; box: Rect | null }>();

  /** A layer's visible pixels in document space under transform `t`, or its whole bounds when it has none; the
   *  pixel scan is cached until the raster changes. */
  private snapBox(l: Layer, t: Transform): Rect {
    const r = l.raster;
    if (!r) return transformBounds(t);
    let c = this.contentBoxes.get(r);
    if (!c || c.version !== r.version) { c = { version: r.version, box: visibleBounds(r) }; this.contentBoxes.set(r, c); }
    const vb = c.box;
    if (!vb) return transformBounds(t);
    const m = placement(t, r.width, r.height);
    return boundsOf([applyMat(m, vb.x, vb.y), applyMat(m, vb.x + vb.w, vb.y), applyMat(m, vb.x + vb.w, vb.y + vb.h), applyMat(m, vb.x, vb.y + vb.h)]);
  }

  private get moveHost(): PM.MoveHost {
    return {
      current: this.current,
      busy: !!this.stroke || !!this.floating || !!this.warpState || !!this.floatSel,
      settle: () => this.settle(),
      notice: (m) => this.notice(m),
      emit: (what) => this.emit(what, null),
      refresh: () => this.refresh(),
      canPaint: (p) => this.paintable(p.activeLayer) && !this.smartLocked(p),
      target: (p) => this.target(p) as NonNullable<ReturnType<Engine['target']>>,
      setTool: (id) => this.setTool(id),
      insertAboveActive: (p, layer) => this.insertAboveActive(p, layer),
      focus: (p, id) => this.focus(p, id),
      growLayer: (p, l, rect) => this.growLayer(p, l, rect),
      flattened: () => this.flattened(),
      snapBox: (l, t) => this.snapBox(l, t),
      view: this.view,
      setSnapGuides: (g) => { this.snapGuides = g; },
    };
  }

  private get commitHost(): TC.CommitHost {
    return {
      current: this.current,
      activeLayer: this.activeLayer,
      edit: (label, fn) => this.edit(label, fn),
      emit: (what) => this.emit(what, null),
      refresh: () => this.refresh(),
      floatingId: (p) => (this.floatSel?.project === p ? this.floatSel.floatingId : null),
      setLastTransform: (from, to) => { this.lastTransform = { from, to }; },
      maskFollowing: (l, t) => followMask(l, t),
      vectorFollowing: (l, t) => followVector(l, t),
      shapeRaster: (shape, w, h) => this.shapeRaster(shape, w, h),
      selectedRoots: (p) => this.selectedRoots(p),
      artboardFrom: (data) => artboardFromData(data),
      keyMove: (id, dx, dy, label) => this.keyMove(id, dx, dy, label),
      positionLocked: () => this.locked(this.activeLayer, 'position'),
    };
  }

  private snapMove(p: Project, id: ID, t: Transform, moving?: ReadonlySet<ID>): Transform { return PM.snapMove(this.moveHost, p, id, t, moving); }

  setLayerTransform(patch: Partial<Transform>, name = 'Transform Layer'): void { TC.setLayerTransform(this.commitHost, patch, name); }

  resizeLayerTo(value: number, width: boolean): void { TE.resizeLayerTo(this.entryHost, value, width); }

  scaleLayerTo(percent: number): void { TE.scaleLayerTo(this.entryHost, percent); }

  private floating: PM.FloatingPixels | null = null;

  /** True while a pixel move is under way. */
  get movingPixels(): boolean { return !!this.floating; }

  /** For Transform Selection: while selected pixels float, the selection they came from plus the matrix that carries it
   *  with the floating pixels' transform (the live draft while dragging), so the marching ants keep matching them.
   *  Null when no affine map fits, i.e. a distortion of the floating pixels is pending or applied. */
  floatingOutline(p: Project): { selection: SelectionMask; m: Mat } | null {
    const f = this.floatSel, dz = this.distortEdit, te = this.transformEdit;
    if (!f || f.project !== p) return null;
    const distorting = !!dz && dz.project === p && (dz.layerId === f.floatingId || !!dz.members?.includes(f.floatingId));
    const draft = te && te.project === p && te.layerId === f.floatingId && !te.mask && !te.group ? te.draft : null;
    return TE.floatingOutline(p, f, draft, distorting);
  }

  outlineShift(p: Project): { dx: number; dy: number } | null {
    if (this.selectionShift?.project === p) return { dx: this.selectionShift.dx, dy: this.selectionShift.dy };
    if (this.floating?.project === p) return { dx: this.floating.dx, dy: this.floating.dy };
    return null;
  }

  beginPixelMove(duplicate: boolean): boolean {
    const f = PM.beginPixelMove(this.moveHost, duplicate);
    this.floating = f;
    return !!f;
  }

  movePixelsBy(dx: number, dy: number): void { if (this.floating) PM.movePixels(this.moveHost, this.floating, dx, dy); }

  endPixelMove(): void {
    const f = this.floating;
    if (!f) return;
    this.floating = null;
    PM.endPixelMove(this.moveHost, f);
  }

  cancelPixelMove(): void {
    const f = this.floating;
    if (!f) return;
    this.floating = null;
    PM.cancelPixelMove(this.moveHost, f);
  }

  private floatSel: PM.FloatingSelection | null = null;

  /** True while a selection transform is under way. */
  get floatingSelection(): boolean { return !!this.floatSel; }

  get canTransformSelection(): boolean {
    const p = this.current, l = p?.activeLayer;
    if (!p || !p.selection || this.floatSel || this.stroke || this.floating || this.warpState) return false;
    return !!l && this.paintable(l) && !!l.raster && !(p.maskTarget && l.mask);
  }

  transformCommand(): void {
    this.endTransformMode();
    if (this.canTransformSelection) { this.beginSelectionTransform(); return; }
    this.settle();
    if (!this.showTransformControls) this.update({ showTransformControls: true });
    this.setTool('move');
  }

  /** Edit > Free Transform a Copy (Alt+Mod+T): the layer (or the selection's pixels) copied in place, then the copy takes
   *  the Move tool's handles, so the original stays as it was. */
  transformCopy(): boolean {
    const p = this.current, l = p?.activeLayer;
    if (!p || !l || this.floatSel || this.floatingSelection) return false;
    this.endTransformMode();
    this.layerViaCopy();
    this.settle();
    if (!this.showTransformControls) this.update({ showTransformControls: true });
    this.setTool('move');
    return true;
  }

  beginSelectionTransform(): boolean {
    if (!this.current || !this.canTransformSelection) return false;
    const fs = PM.beginSelectionTransform(this.moveHost);
    this.floatSel = fs;
    return !!fs;
  }

  commitSelectionTransform(): void {
    const fs = this.floatSel;
    if (!fs) return;
    this.floatSel = null;
    PM.commitSelectionTransform(this.moveHost, fs);
  }

  cancelSelectionTransform(): void {
    const fs = this.floatSel;
    if (!fs) return;
    this.floatSel = null;
    PM.cancelSelectionTransform(this.moveHost, fs);
  }

  /** Select > Transform Selection: the selection's outline alone takes the Move tool's handles, the pixels staying;
   *  Enter applies it as one step and Escape cancels, as with selected pixels. */
  beginOutlineTransform(): boolean {
    const fs = PM.beginOutlineTransform(this.moveHost);
    this.floatSel = fs;
    return !!fs;
  }

  /** Unpremultiplied RGB (0 to 1) of the original pixels under a document point, read from the same source the Levels
   *  histogram uses: the target layer's own pixels, its mask's when the mask is targeted, or with `composite` the
   *  flattened document. The Levels eyedroppers sample the edit's original image the same way. */
  sampleOriginal(pt: Pt, composite: boolean): [number, number, number] | null { return PM.sampleOriginal(this.moveHost, pt, composite); }

  /** Lays a subject mask (0 to 1 per layer pixel, 1 over the subject) on a layer as one Remove Background step. An
   *  existing mask of the same size is multiplied in, so whatever either hides stays hidden; the pixels themselves
   *  stay, so the background can be painted back. */
  applySubjectMask(id: ID, levels: Float32Array, width: number, height: number): void { LM.applySubjectMask(this.maskHost, id, levels, width, height); }

  /** While a drag samples the canvas, the ring shows the new colour on its top half and the colour from before the
   *  drag on its bottom half; `showsSampleRing` is the Eyedropper's Sample Ring option. */
  showsSampleRing = true;
  sampleRing: { at: Pt; sampled: RGB; original: RGB } | null = null;

  setSampleRing(ring: { at: Pt; sampled: RGB; original: RGB } | null): void {
    if (!ring && !this.sampleRing) return;
    this.sampleRing = this.showsSampleRing ? ring : null;
    this.emit('overlay', null);
  }

  /** The arrow-key nudge for selection tools: the outline moves by the given amount, each press one Move Selection
   *  step, while the pixels stay put. False when there is no selection to move. */
  nudgeSelection(dx: number, dy: number): boolean {
    const p = this.current;
    if (!p || !p.selection || (!dx && !dy)) return false;
    this.settle();
    const moved = p.selection.translated(dx, dy, p.doc.width, p.doc.height);
    if (!moved) return false;
    this.applySelection(moved, 'replace', 'Move Selection');
    return true;
  }

  setMaskFromImage(id: ID, source: CanvasImageSource, width: number, height: number, name: string): void { LM.setMaskFromImage(this.maskHost, id, source, width, height, name); }

  /** Whether the current document's flattened picture goes out in bands (1.61.2, DEV_PLAN 26.4): an 8-bit RGB
   *  document past the band size, composed by the ordinary renderer. */
  bandedExportable(): boolean {
    const p = this.current;
    // A tiled document too (1.62.6, DEV_PLAN 26.6e; excluded at 1.62.3, when its 61 MB bands crashed the page): its
    // bands are now sized from its width, one surface reused, its tiles brought back before each band is drawn.
    return !!p && p.doc.width * p.doc.height > this.bandFrom && (p.doc.depth ?? 8) <= 8 && p.doc.mode !== 'cmyk' && p.doc.mode !== 'lab' && !this.composesFloats(p);
  }

  /** The flattened picture rendered a band of 512 rows at a time, as `renderDoc` renders it whole (the same renderer,
   *  its view moved up by the band's top), each band's RGBA rows handed to `sink` and awaited before the next, so
   *  nothing full-size is made. */
  async renderBands(sink: (rows: Uint8ClampedArray<ArrayBuffer>, y0: number, h: number) => Promise<void>, background: string | null = null): Promise<boolean> {
    const p = this.current;
    if (!p) return false;
    // About 4 megapixels a band, 16 to 512 rows, from the width (1.62.6): 16 MB at 30,000 wide, where 512 rows had been
    // 61 MB and, piling up awaiting collection, crashed the page at 1.62.3; one band surface, cleared and reused.
    const W = p.doc.width, H = p.doc.height, B = Math.max(16, Math.min(512, Math.floor(4_194_304 / W)));
    const s = createSurface(W, Math.min(B, H)), c = ctxOf(s), store = this.undoStore;
    const tiled = p.doc.layers.map((l) => l.tiled).filter((t): t is TiledRaster => !!t);
    try {
      for (let y0 = 0; y0 < H; y0 += B) {
        const h = Math.min(B, H - y0);
        // A tiled layer's tiles under the band brought back first: a tile on disk draws as its preview, a placeholder on
        // screen but wrong pixels in a file (1.62.6).
        if (store) for (const t of tiled) await t.ensure(0, y0, W, h, store);
        c.clearRect(0, 0, W, s.height);
        this.work.render({ doc: p.doc, target: s, view: translation(0, -y0), background, quality: 'high' });
        const rows = c.getImageData(0, 0, W, h).data as Uint8ClampedArray<ArrayBuffer>;
        await sink(rows, y0, h);
        if (tiled.length) await this.pageTiles();   // the tiles behind it back to disk past their share
      }
    } finally {
      s.width = 0;
      s.height = 0;
    }
    return true;
  }

  async exportBlob(type: 'image/png' | 'image/jpeg' | 'image/webp', quality = 0.92): Promise<Blob | null> {
    const p = this.current;
    if (!p) return null;
    const blob = await toBlob(renderDoc(this.work, p.doc, type === 'image/jpeg' ? '#ffffff' : null), type, quality);
    return blob ? withResolution(blob, p.doc.resolution) : null;
  }

  /** Any open document's flattened picture, as its own surface (n-up views and Calculations read documents other than
   *  the active one; the duotone and multichannel looks are left to flattened()). */
  flattenedOf(p: Project): Surface | null {
    if (p === this.current) return this.flattened();
    const s = renderDoc(this.work, p.doc);
    if (!s) return null;
    const out = createSurface(s.width, s.height);
    ctxOf(out).drawImage(s as CanvasImageSource, 0, 0);
    return out;
  }

  flattened(): Surface | null {
    const p = this.current;
    if (!p) return null;
    if (p.doc.mode === 'multichannel') {
      const m = this.multichannelSurface(p.doc);
      if (m) { const out = createSurface(m.width, m.height); ctxOf(out).drawImage(m as CanvasImageSource, 0, 0); return out; }
    }
    if (this.composesFloats(p)) { const r = this.composedRendition(p); if (r) return r.canvas; }
    const s = renderDoc(this.work, p.doc);
    if (p.doc.mode !== 'duotone' || !p.doc.duotone || !s) return s;
    // Duotone (31.3a): the flattened grey, shown and exported as the inks overprinted on white.
    const img = ctxOf(s).getImageData(0, 0, s.width, s.height), out = createSurface(s.width, s.height);
    applyDuotoneLut(img.data, duotoneLut(p.doc.duotone));
    ctxOf(out).putImageData(img, 0, 0);
    return out;
  }

  /** Image > Mode > Duotone (31.3a): from Grayscale or Duotone; the grey pixels stay, the inks are the document's. */
  setDuotone(d: Duotone): boolean {
    const p = this.current;
    if (!p || !['grayscale', 'duotone'].includes(p.doc.mode ?? 'rgb')) return false;
    return this.edit('Duotone', (pp) => { pp.doc = { ...pp.doc, mode: 'duotone', duotone: d, palette: undefined }; return true; });
  }

  /** Image > Mode > Color Table (31.4): the Indexed Color document's palette. One undo step. Pixels hold the colours, so
   *  a pixel whose colour was palette entry i (the first such entry) takes the new entry i; others are left alone. */
  setPalette(rgb: readonly RGB[]): boolean {
    const p = this.current;
    if (!p || p.doc.mode !== 'indexed' || !p.doc.palette || rgb.length < 1 || rgb.length > 256) return false;
    const old = p.doc.palette, next = rgb.map((c) => ({ r: c.r, g: c.g, b: c.b }));
    const map = new Map<number, number>();
    old.forEach((c, i) => { const k = (c.r << 16) | (c.g << 8) | c.b; if (!map.has(k) && next[i]) map.set(k, (next[i].r << 16) | (next[i].g << 8) | next[i].b); });
    return this.edit('Color Table', (pp) => {
      const layers = pp.doc.layers.map((l) => {
        if (!l.raster) return l;
        const r = l.raster.clone(), d = r.ctx.getImageData(0, 0, r.width, r.height), px = d.data;
        for (let i = 0; i < px.length; i += 4) {
          if (px[i + 3] === 0) continue;
          const to = map.get((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
          if (to !== undefined) { px[i] = to >> 16; px[i + 1] = (to >> 8) & 255; px[i + 2] = to & 255; }
        }
        r.ctx.putImageData(d, 0, 0); r.touch();
        return { ...l, raster: r };
      });
      pp.doc = { ...pp.doc, layers, palette: next };
      return true;
    });
  }

  /** A new document's mode (New Document's Color Mode): set, not converted, as its pixels are only the background. */
  setDocumentMode(mode: DocMode): void {
    const p = this.current;
    if (!p) return;
    p.doc = { ...p.doc, mode, palette: undefined };
    this.fg = this.fgc; this.bg = this.bgc;
    this.emit('projects', null); this.emit('options', null);
  }

  /** Layer > Flatten Image: the visible image as one Background layer (hidden layers are discarded).
   *  One step. */
  flattenImage(): boolean {
    const p = this.current, flat = this.flattened();
    if (!p || !flat) return false;
    return this.edit('Flatten Image', (pp) => {
      const r = new Raster(pp.doc.width, pp.doc.height);
      r.ctx.drawImage(flat as CanvasImageSource, 0, 0);
      r.touch();
      const l = newLayer('Background', pp.doc, { raster: r });
      pp.doc = { ...pp.doc, layers: [l] };
      pp.activeId = l.id;
      return true;
    });
  }

  /** Image > Mode (1.50.2, the owner's walkthrough): RGB; Grayscale (each layer to its luminance, type,
   *  shapes and vectors kept editable with their colours made grey); Bitmap (flattened, then black and white by a 50
   *  percent threshold or diffusion dither); Indexed Color (flattened, then to a palette: exact at 256 colours or fewer,
   *  else adaptive by median cut, optionally dithered). New pixels throughout, so one undo restores the old ones. */
  /** The view's colour transform (1.53.5, H2): the document's profile to the display, through a proof profile when
   *  Proof Colors is on, with the gamut warning; the document itself is not changed. */
  viewTransform: { lut: ColourLut; gamut: boolean } | null = null;

  setViewTransform(v: { lut: ColourLut; gamut: boolean } | null): void { this.viewTransform = v; this.emit('render', null); }   // the stage redraws on render, not doc

  /** Edit > Assign Profile: the profile the numbers are read in, the numbers unchanged; null for sRGB. */
  assignProfile(profile: DocProfile | null): boolean { return PR.assignProfile(this.profileHost, profile); }

  /** Assign Profile in a CMYK document (1.57.9): the inks unchanged, each layer's rendition redrawn through the new
   *  profile's tables (`lut`, `inLut`), the profile assigned; one step. */
  assignCmykProfile(profile: DocProfile, lut: Lut4, inLut: Lut3x4): boolean { return PR.assignCmykProfile(this.profileHost, profile, lut, inLut); }

  /** Convert to Profile in a CMYK document (1.57.9): each layer's inks replaced by `inks` (converted by the engine's
   *  LittleCMS to `profile`), renditions redrawn through its tables, the profile assigned; one step. */
  convertCmykProfile(profile: DocProfile, inks: Map<ID, ChannelPixels>, lut: Lut4, inLut: Lut3x4): boolean { return PR.convertCmykProfile(this.profileHost, profile, inks, lut, inLut); }

  /** Convert to Profile at 32 bits (1.57.3): every layer's linear floats through `m` (the engine's matrix between the
   *  two profiles' primaries), light above white converting exactly; renditions redrawn; `target` assigned; one step. */
  convertToProfileLinear(target: DocProfile | null, m: number[][]): boolean { return PR.convertToProfileLinear(this.profileHost, target, m); }

  /** Edit > Convert to Profile: every layer's pixels through `lut` (the engine's LittleCMS table from the document's
   *  profile to `target`), then `target` assigned; one step. Live type and shapes keep their colours' numbers. */
  convertToProfile(target: DocProfile | null, lut: ColourLut): boolean { return PR.convertToProfile(this.profileHost, target, lut); }

  /** Convert to Profile and mode changes at 16 bits (DEV_PLAN 28.2): each pixel layer's channels replaced by the engine's
   *  LittleCMS result in `plan.layers` (double precision, rounded once, no 8-bit step), renditions redrawn, the mode,
   *  profile and depth set; one step. For CMYK the plan carries the new press's display and separation tables. */
  convertDeepDocument(plan: { mode: DocMode; profile: DocProfile | null; depth: 8 | 16; layers: ReadonlyMap<ID, ChannelPixels>; cmyk?: { lut: Lut4; inLut: Lut3x4 } }): boolean { return PR.convertDeepDocument(this.profileHost, plan); }

  /** Generated pixels through the table (1.55.9, DEV_PLAN 22.7): after a step at 16 bits or in CMYK, a layer whose
   *  8-bit pixels changed while its floats did not is brought into step (engine/derive.ts), its rendition redrawn from
   *  the floats; a pixel layer without floats takes them whole. Replaced rasters, in-place patches and new layers. A
   *  fill layer's CMYK rendition keeps the note of what its pixels were drawn for (1.66.0), so pinFills leaves it. */
  private deriveChannels(p: Project, before: ReadonlyMap<ID, Layer>, patches: readonly PixelPatch[]): boolean { return MO.deriveChannels(this.modeHost, p, before, patches); }

  /** Layer styles for the float compositor (1.56.9): the layer drawn alone by the 8-bit renderer, with and without its
   *  style, at full opacity with its Fill, without mask, blend, clipping or group (the compositor applies those). */
  /** A style swatch (DEV_PLAN 35.3): `effects` drawn on a mid-grey rounded square in a `size`-pixel document, for the
   *  Styles panel's tiles. The square is inset so shadows and glows have room. */
  stylePreview(effects: LayerEffects, size = 48): Surface {
    const doc: Doc = { id: uid(), width: size, height: size, resolution: 72, layers: [] };
    const r = new Raster(size, size), g = r.ctx, inset = Math.round(size * 0.22), w = size - inset * 2, rad = Math.round(size * 0.12);
    g.fillStyle = '#8a8a8a';
    g.beginPath();
    g.roundRect(inset, inset, w, w, rad);
    g.fill();
    r.touch();
    const layer = newLayer('Style', doc, { raster: r, effects });
    return renderDoc(this.work, { ...doc, layers: [layer] });
  }

  private readonly styleDrawer = setStyleDrawer((doc: Doc, l: Layer) => {
    const alone: Layer = { ...l, parentId: null, opacity: 1, blend: 'normal', clipId: null, mask: null, visible: true };
    const draw = (layer: Layer): ImageData => ctxOf(renderDoc(this.work, { ...doc, layers: [layer] })).getImageData(0, 0, doc.width, doc.height);
    return { styled: draw(alone), plain: draw({ ...alone, effects: null }) };
  });

  /** Every step's end (1.55.9): a step made outside `edit` (strokes of the retouching tools, the Gradient tool, Crop,
   *  Move Pixels, Stroke Path...) brings 16-bit and CMYK floats into step here; 32 bits is left to its own guards. */
  /** A step the History trims away has its tiles in the undo store dropped too (1.60.8). */
  private readonly dropHook = (History.onDrop = (e: HistoryEntry): void => {
    // A trimmed step's stored pixels, a streamed step's both sides (1.62.7), in one request (1.63.0).
    this.dropKeys(e.patches.flatMap((q) => [...(q.paged ? [q.paged.key] : []), ...(q.disk ? [q.disk.before, q.disk.after] : [])]));
  });

  private readonly stepHook = (History.onStepEnd = (h: History, before: Snapshot, patches: readonly PixelPatch[]): Snapshot | null => {
    const p = this.projects.find((q) => q.history === h);
    if (!p) return null;
    const pinned = this.pinFills(p);
    if (!(p.doc.mode === 'cmyk' || p.doc.mode === 'lab' || (p.doc.depth ?? 8) > 8)) return pinned ? p.snapshot() : null;
    return this.deriveChannels(p, new Map(before.doc.layers.map((l) => [l.id, l])), patches) || pinned ? p.snapshot() : null;
  });

  /** What each fill layer's pixels were drawn for (1.66.0): its content, the canvas and, when its mask lays it out, the
   *  mask; a raster not drawn here (opened from a file) is drawn again at the next step. */
  private readonly fillKeys = new WeakMap<Raster, string>();
  private fillKey(l: Layer, W: number, H: number): string {
    const c = l.fillContent, m = l.mask, laid = c?.kind === 'gradient' ? c.align : c?.kind === 'pattern' ? c.link : false;
    return JSON.stringify([c, W, H, laid && m ? [m.enabled, m.raster?.id ?? null, m.raster?.version ?? 0, m.placement ?? l.transform] : null]);
  }

  /** A fill layer's pixels for `l` as it stands, noted with what they were drawn for; null when its pattern is gone. */
  private drawFill(l: Layer, W: number, H: number): Raster | null {
    const r = l.fillContent ? renderFill(l.fillContent, W, H, fillFrame(l, W, H)) : null;
    if (r) this.fillKeys.set(r, this.fillKey(l, W, H));
    return r;
  }

  /** Fill layers kept over the whole canvas at the end of every step (1.66.0), endless: one moved,
   *  transformed or left short by a canvas change is drawn again over the canvas at its place, its mask staying where
   *  the change took it; one whose content, canvas or laying-out mask changed is drawn again. True when one was. */
  private pinFills(p: Project): boolean {
    const W = p.doc.width, H = p.doc.height, at = docTransform(W, H);
    let changed = false;
    const layers = p.doc.layers.map((l) => {
      if (!l.fillContent) return l;
      const moved = !sameTransform(l.transform, at);
      if (!moved && l.raster && this.fillKeys.get(l.raster) === this.fillKey(l, W, H)) return l;
      const next: Layer = moved ? { ...l, transform: at, mask: l.mask && !l.mask.placement ? { ...l.mask, placement: l.transform } : l.mask } : l;
      const r = this.drawFill(next, W, H);
      if (!r) return l;
      changed = true;
      return { ...next, raster: r };
    });
    if (changed) p.setLayers(layers);
    return changed;
  }

  private deriveTables(p: Project): DeriveTables | null { return MO.deriveTables(this.modeHost, p); }

  /** Image > Mode > CMYK Color (1.54.0, H1): each pixel layer's ink, converted by the engine's LittleCMS, beside its
   *  rendition through `lut`; the CMYK profile becomes the document's; one step. Live type and shapes keep their
   *  RGB colours; the deep guard then keeps every later step to what knows ink. */
  setCmyk(profile: DocProfile, ink: Map<ID, ChannelPixels>, lut: Lut4, inLut: Lut3x4 | null = null): boolean { return MO.setCmyk(this.modeHost, profile, ink, lut, inLut); }

  /** Image > Mode > RGB Color from CMYK: each layer's rendition replaced by the engine's exact conversion, the ink
   *  dropped, the document back in sRGB (or `profile`). */
  /** Image > Mode > Lab Color (1.56.4, DEV_PLAN 22.9): each pixel layer's floats in Lab, converted from its pixels
   *  exactly (engine/lab.ts); the rasters stay as their rendition. From an 8-bit or (1.57.3) a 16-bit RGB document,
   *  whose layers convert from their 16-bit floats; 32 bits come down to 16 first (app.ts). */
  setLab(): boolean { return MO.setLab(this.modeHost); }

  /** Image > Mode > Grayscale from Lab (1.57.5): each layer's grey from its Lightness alone,
   *  the sRGB grey of that lightness exactly; the document leaves Lab for 8-bit Grayscale. */
  setGrayFromLab(): boolean { return MO.setGrayFromLab(this.modeHost); }

  /** Image > Mode > RGB Color from Lab: each layer's pixels from its Lab floats, exactly, clipped to sRGB. */
  setRgbFromLab(): boolean { return MO.setRgbFromLab(this.modeHost); }

  setRgbFromCmyk(rasters: Map<ID, Raster>, profile: DocProfile | null = null): boolean { return MO.setRgbFromCmyk(this.modeHost, rasters, profile); }

  /** Opens CMYK ink as a CMYK document (1.54.0): its layer holds the ink, its raster the rendition through `lut`. */
  openChannels(name: string, ch: ChannelPixels, profile: DocProfile, lut: Lut4, inLut: Lut3x4 | null = null): Project { return MO.openChannels(this.modeHost, name, ch, profile, lut, inLut); }

  /** Opens CMYK layers as a CMYK document (1.56.1, a CMYK PSD): each layer's ink beside its rendition through `lut`,
   *  its place, opacity, visibility and blend mode kept; bottom layer first. */
  openChannelLayers(name: string, width: number, height: number, layers: ReadonlyArray<{ name: string; x: number; y: number; channels: ChannelPixels; opacity: number; visible: boolean; blend: string }>, profile: DocProfile, lut: Lut4, inLut: Lut3x4): Project { return MO.openChannelLayers(this.modeHost, name, width, height, layers, profile, lut, inLut); }

  /** A Lab document from read layers (1.58.1, Lab TIFF and PSD): each layer's Lab floats kept, its rendition drawn by
   *  the formulas; `depth` 16 for a 16-bit file. */
  openLabLayers(name: string, width: number, height: number, layers: ReadonlyArray<{ name: string; x: number; y: number; channels: ChannelPixels; opacity: number; visible: boolean }>, depth: 8 | 16): Project { return MO.openLabLayers(this.modeHost, name, width, height, layers, depth); }

  /** File > Import > Video Frames to Layers (1.58.9, L1): a new document of the clip's frames, one
   *  layer each named Frame 1, Frame 2 and on (the first at the bottom); with `animate`, a frame animation in which
   *  each frame shows its own layer alone for `delayMs`, the first frame showing. */
  openFrames(name: string, width: number, height: number, frames: Raster[], delayMs: number, animate: boolean): Project {
    const made = frames.map((r, i) => newLayer(`Frame ${i + 1}`, { width, height }, { raster: r, transform: docTransform(r.width, r.height), visible: animate ? i === 0 : true }));
    const doc: Doc = { id: uid(), width, height, resolution: 72, layers: made } as Doc;
    const p = this.addProject(doc, name, made[animate ? 0 : made.length - 1]?.id ?? null);
    if (animate && made.length) {
      const anim: Frame[] = made.map((_, k) => ({ id: uid(), delay: delayMs, state: Object.fromEntries(made.map((l, i) => [l.id, { visible: i === k, opacity: 1, x: l.transform.x, y: l.transform.y }])) }));
      this.setTimelineFor(p, { frames: anim, current: anim[0].id, loops: 0 });
    }
    return p;
  }

  /** The tables of a CMYK project opened from a saved file (1.54.2), fetched by the app once its profile is known. */
  setCmykTables(p: Project, lut: Lut4, inLut: Lut3x4): void { MO.setCmykTables(this.modeHost, p, lut, inLut); }

  /** Image > Mode > 8 or 16 Bits/Channel (1.53.6, H1): each pixel layer gains its 16-bit pixels, or keeps only its
   *  8-bit rendition. */
  setDepth(depth: 8 | 16 | 32, tone: { exposure: number; gamma: number } = { exposure: 0, gamma: 1 }): boolean {
    const p = this.current, from = p?.doc.depth ?? 8;
    if (!p || from === depth) return false;
    if (p.doc.mode === 'cmyk' || p.doc.mode === 'lab') {
      // CMYK and Lab (1.57.8): their ink and Lab values are floats already, so 16 bits changes only how
      // files keep them; 32 bits needs RGB (app.ts brings the document there first).
      if (depth === 32) return false;
      return this.edit(`${depth} Bits/Channel`, (pp) => { pp.doc = { ...pp.doc, depth }; return true; });
    }
    // 32 bits are linear light (1.53.9): up, the encoded values are linearised; down, Exposure and Gamma bring them in.
    return this.edit(`${depth} Bits/Channel`, (pp) => {
      const layers = pp.doc.layers.map((l) => {
        if (!l.raster || l.isGroup || l.adjustment) return l;
        const src = l.channels ?? deepFromRaster(l.raster);
        if (depth === 32) return { ...l, channels: from === 32 ? src : deepToLinear(src) };
        const enc = from === 32 ? deepToned(src, tone.exposure, tone.gamma) : src;
        return depth === 16 ? { ...l, channels: enc, raster: from === 32 ? rasterFromDeep(enc) : l.raster } : { ...l, channels: undefined, raster: from === 32 ? rasterFromDeep(enc) : l.raster };
      });
      pp.doc = { ...pp.doc, layers, depth: depth === 8 ? undefined : depth };
      return true;
    });
  }

  /** Opens 16-bit pixels as a 16-bit document (1.53.6): its layer holds them, its raster their 8-bit rendition. */
  openDeep(name: string, deep: DeepPixels, depth: 16 | 32 = 16, resolution?: number): Project {
    const raster = rasterFromDeep(deep, depth === 32);
    const p = this.openImage({ source: raster.canvas as CanvasImageSource, width: deep.width, height: deep.height, name, ...(resolution ? { resolution } : {}) });
    p.doc = { ...p.doc, depth, layers: p.doc.layers.map((l) => (l.raster && !l.isGroup ? { ...l, channels: deep } : l)) };
    this.refresh();
    return p;
  }

  /** A multi-part OpenEXR as a 32-bit document (DEV_PLAN 36.15): one layer per part named after it, each at its data
   *  window offset. `parts` are in file order and the first ends on top (the beauty), as a compositor lists passes. */
  openDeepLayers(name: string, width: number, height: number, parts: Array<{ name: string; x: number; y: number; deep: DeepPixels }>): Project | null {
    if (!parts.length || !this.sizeOk(width, height)) return null;
    const doc: Doc = { id: uid(), width, height, resolution: 72, layers: [] };
    const layers = [...parts].reverse().map((q) => newLayer(q.name, doc, { raster: rasterFromDeep(q.deep, true), channels: q.deep, transform: { ...docTransform(q.deep.width, q.deep.height), x: q.x, y: q.y } }));
    const p = this.addProject({ ...doc, depth: 32, layers }, name, layers[layers.length - 1].id);
    this.refresh();
    return p;
  }

  /** A filter at 16 bits (1.53.7): `fn` on the active layer's 16-bit pixels, its 8-bit rendition from the result, one
   *  step. Within a selection it waits for a later release rather than filtering the whole layer. */
  applyDeepFilter(name: string, fn: (d: DeepPixels) => DeepPixels): boolean {
    const p = this.current, l = p?.activeLayer, ch = l?.channels;
    if (!p || !l || !ch) return false;
    let deep = fn(ch);
    if (p.selection) {
      const t = l.transform, sel = p.selection, S = ch.n + 1;
      if (t.rotation || t.flipX || t.flipY || t.w !== ch.width || t.h !== ch.height || t.x !== Math.round(t.x) || t.y !== Math.round(t.y)) { this.notice(`${name} within a selection needs the layer unscaled and unrotated in this mode: Select > Deselect to filter the whole layer.`); return false; }
      const src = ch.data, f = deep.data, out = new Float32Array(src);
      for (let y = 0; y < ch.height; y++) for (let x = 0; x < ch.width; x++) {
        const cov = sel.valueAt(x + t.x, y + t.y) / 255;
        if (cov <= 0) continue;
        const o = (y * ch.width + x) * S;
        for (let c = 0; c < S; c++) out[o + c] = src[o + c] + (f[o + c] - src[o + c]) * cov;
      }
      deep = { ...ch, data: out };
    }
    const rendition = deep.mode === 'cmyk' && p.cmykLut ? rasterFromChannels(deep, p.cmykLut) : rasterFromDeep(deep, p.doc.depth === 32);
    return this.edit(name, (pp) => { pp.doc = { ...pp.doc, layers: pp.doc.layers.map((x) => (x.id === l.id ? { ...x, channels: deep, raster: rendition } : x)) }; return true; });
  }

  /** Brush, Pencil and Eraser paint at 16 bits (1.53.8) unless colour dynamics vary the paint (the rebuild needs one
   *  colour); other painting tools wait for a later release. */
  private deepPaintOk(): boolean {
    const cmyk = this.current?.doc.mode === 'cmyk';
    if ((this.current?.doc.depth ?? 8) === 8 && !cmyk) return true;
    if (this.current?.doc.depth === 32) return true;   // 1.56.8: through derive in linear light, light above white kept where a stroke changes little
    if (cmyk && (!this.current?.cmykLut || !this.current.cmykIn)) return !this.deepBlocked('Painting');
    return true;
  }

  /** Whether the brush's colour varies within a stroke (1.55.9): such a stroke is not one colour, so its floats come
   *  through derive rather than the Brush's exact rebuild. */
  private colourDynamics(): boolean {
    const base = noDynamics() as unknown as Record<string, unknown>, cur = this.brushDynamics as unknown as Record<string, unknown>;
    return ['fgBg', 'hue', 'saturation', 'brightness'].some((k) => JSON.stringify(cur[k]) !== JSON.stringify(base[k]));
  }

  /** Painting changes a raster in place, outside `edit`; in a 16-bit document it waits for a later release. */
  private deepBlocked(what: string): boolean {
    const d = this.current?.doc.depth ?? 8;
    if (this.current?.doc.mode === 'cmyk') { this.notice(`${what} does not work in CMYK yet. Image > Mode > RGB Color to use it.`); return true; }
    if (d === 8) return false;
    this.notice(`${what} does not work in ${d} bits yet. Image > Mode > 8 Bits/Channel to use it.`);
    return true;
  }

  convertMode(mode: DocMode, opts: { dither?: boolean; colors?: number } = {}): boolean { return MO.convertMode(this.modeHost, mode, opts); }

  /** One artboard as its own image: only it and what it holds, rendered and cut to its rectangle. */
  artboardImage(id: ID, bare = false): Surface | null { return AB.artboardImage(this.artboardHost, id, bare); }
}


/** A gradient's stops blended by Method: Classic as they are (sRGB); Linear in linear light; Perceptual in
 *  OKLab. The canvas blends in sRGB only, so each segment is divided into 24 steps worked out in the chosen space. */
function gradientMethod<T extends { at: number; rgb: RGB; alpha: number }>(stops: T[], method: 'classic' | 'linear' | 'perceptual'): T[] {
  if (method === 'classic' || stops.length < 2) return stops;
  const lin = (v: number): number => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const enc = (v: number): number => Math.round(255 * Math.max(0, Math.min(1, v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)));
  const toLab = (c: RGB): [number, number, number] => {
    const r = lin(c.r), g = lin(c.g), b = lin(c.b);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  };
  const fromLab = ([L, A, B]: [number, number, number]): RGB => {
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3, m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3, s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
    return { r: enc(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), g: enc(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), b: enc(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s) };
  };
  const mix = (a: RGB, b: RGB, t: number): RGB => {
    if (method === 'linear') return { r: enc(lin(a.r) + (lin(b.r) - lin(a.r)) * t), g: enc(lin(a.g) + (lin(b.g) - lin(a.g)) * t), b: enc(lin(a.b) + (lin(b.b) - lin(a.b)) * t) };
    const x = toLab(a), y = toLab(b);
    return fromLab([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
  };
  const out: T[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    for (let k = 0; k < 24; k++) { const t = k / 24; out.push({ ...a, at: a.at + (b.at - a.at) * t, rgb: mix(a.rgb, b.rgb, t), alpha: a.alpha + (b.alpha - a.alpha) * t }); }
  }
  out.push(stops[stops.length - 1]);
  return out;
}

/** A copy of `src` blurred by `sigma` pixels (Blur with Sample All Layers). */
function blurred(src: Surface, sigma: number): Surface {
  const out = createSurface(src.width, src.height), c = ctxOf(out);
  c.filter = `blur(${sigma}px)`;
  c.drawImage(src as CanvasImageSource, 0, 0);
  c.filter = 'none';
  return out;
}

/** Sharpen's Protect Detail: each sharpened pixel held within the range of its 3 by 3 neighbourhood in the original,
 *  so edges gain contrast without the bright and dark halos and the speckle plain sharpening leaves. */
function withinNeighbours(orig: ImageData, sharp: ImageData): ImageData {
  const W = orig.width, H = orig.height, o = orig.data, s = sharp.data, out = new ImageData(new Uint8ClampedArray(s), W, H), d = out.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    for (let k = 0; k < 3; k++) {
      let lo = 255, hi = 0;
      for (let dy = -1; dy <= 1; dy++) { const Y = Math.min(H - 1, Math.max(0, y + dy)); for (let dx = -1; dx <= 1; dx++) { const v = o[(Y * W + Math.min(W - 1, Math.max(0, x + dx))) * 4 + k]; if (v < lo) lo = v; if (v > hi) hi = v; } }
      d[i + k] = Math.max(lo, Math.min(hi, s[i + k]));
    }
  }
  return out;
}

/** A shape's stroke (1.52.8), its options: solid, dashed (4 widths on, 2 off, square ends) or dotted (round
 *  dots 2 widths apart); centred on the path, inside it (clipped to the shape) or outside it (the shape cut away). An open
 *  path is always centred: it has no inside. Round joins keep corners smooth. */
function strokeShape(c: Ctx2D, shape: Path2D, s: ShapeStroke, closed: boolean): void {
  const w = s.width, align = closed ? s.align ?? 'center' : 'center', dotted = s.dash === 'dotted';
  const set = (x: Ctx2D, width: number): void => {
    x.strokeStyle = rgbCss(s.color); x.lineWidth = width; x.lineJoin = 'round';
    x.lineCap = dotted ? 'round' : s.dash === 'dashed' ? 'butt' : 'round';
    x.setLineDash(s.dash === 'dashed' ? [4 * w, 2 * w] : dotted ? [0.001, 2 * w] : []);
  };
  if (align === 'center') { set(c, w); c.stroke(shape); c.setLineDash([]); return; }
  if (align === 'inside') { c.save(); c.clip(shape); set(c, 2 * w); c.stroke(shape); c.restore(); return; }
  // Outside: twice the width, then the shape itself cut away, drawn over what is there.
  const t = createSurface(c.canvas.width, c.canvas.height), x = ctxOf(t);
  x.setTransform(c.getTransform());
  set(x, 2 * w); x.stroke(shape);
  x.globalCompositeOperation = 'destination-out'; x.fillStyle = '#000'; x.fill(shape);
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(t as CanvasImageSource, 0, 0); c.restore();
}
