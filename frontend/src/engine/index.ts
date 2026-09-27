import { captureFrame, frameLayers, type Frame, type FrameLayer, type Timeline } from './timeline';
import { fillVector, pathBounds, samplePath, shiftPath, tracePath, type NamedPath, type PathSet, type VectorPath } from './paths';
export { PATH_OPS, type PathOp } from './paths';
import { defaultText, liveText, loadTextFont, renderText, styleOf, textKey, withStyle } from './text';
import { Emitter } from './events';
import type { Snapshot } from './history';
import { Renderer, renderDoc, type LayerOverride } from './renderer';
import { PixelStroke, warmStrokeSurfaces } from './stroke';
import { SelectionMask, type SelectionMode } from './selection';
import { Raster, createSurface, ctxOf, toBlob, type Surface, type Ctx2D } from './surface';
import { applyMat, boundsOf, contains, integral, intersectRect, invert, isAxisAligned, mul, placement, rotation, sameTransform, scaling, setMat, transformBounds, translation, unionRect, type Mat } from './geometry';
import { ancestors, byId, descendantIds, hierarchy, isDescendant } from './tree';
import { dragged, following, rounded, type DragMode } from './transform';
import { carried, cornersOf, cropWarp, distortUsable, maskEdgeTone, visibleBounds, warpRaster, type Warped, imageCorners, homography, project, inverse3 } from './distort';
import { withResolution } from './dpi';
import { antialiasMask, wandMask } from './kernels';
import { Project } from './project';
import { BLEND_MODES, LIMITS, clamp, compositeOp, docTransform, newLayer, uid, type BlendMode, type Doc, type Guide, type ID, type Layer, type LayerLocks, type Mask, type Pt, type Rect, type RGB, type ToolId, type Transform, type ParagraphStyle, effectsActive, type LayerEffects, type TextSpec, type SmartFilter, type SmartLink, type SmartObject, type ShapeStyle, effectsFromData, type Artboard, artboardFromData } from './types';
import { allPatterns, patternById } from './patterns';

export * from './types';
export * from './geometry';
export { Project } from './project';
export { Viewport } from './viewport';
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
import { ADJUSTMENT_LABELS, defaultAdjustmentData } from './adjust';
import { fromGray, gaussianBlur, resizeMask, toGray } from './filters';
import { sharpenSample } from './filters-more';
import { diamondFill, presetById, reflectStops, resolveStops, type GradientType } from './gradients';
import { convexQuad, meshWarpImage, type P2 } from './mesh-warp';
import { liquifyImage, type LiquifyField } from './liquify';
import { puppetImage } from './puppet';
import { findWires } from './distractions';
import type { SampledTip } from './abr';
import { DEFAULT_GLOBAL_LIGHT, type GlobalLight } from './style-extras';
export { CONTOURS, DEFAULT_GLOBAL_LIGHT, withGlobalLight, type ContourId, type GlobalLight } from './style-extras';
import { UPRIGHT, defaultShape, noDynamics, pressureOption, type BrushDynamics, type BrushPreset, type BrushShape, type PenPose } from './brush-dynamics';
import { DEFAULT_PATH_SHAPE, boxedShapePath, linePath, type PathShapeKind, type PathShapeOptions } from './shape-paths';
import { CUSTOM_SHAPES } from './custom-shapes';
export { CUSTOM_SHAPES } from './custom-shapes';
import { WarpStroke, contentFill, fillTransparent, healFromSource, premultiply, scaleHealCorrection, spotHeal, unpremultiply, type HealBlend, type HealMode, type HealSample } from './retouch';
import { dissolveNoise } from './blend';
import { LUT3_N, adjustmentLut, adjustmentLut3 } from './lut';
import { decontaminate } from './select-mask';

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
export { TEXT_FONTS, defaultText, fontCss, liveText, paragraphStylesFrom, styleOf, textFromData, textKey, textMetrics, renderText, withStyle } from './text';
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
export interface ImportedImage { source: CanvasImageSource; width: number; height: number; name: string }
type Target = 'pixels' | 'mask';
type Settings = Pick<Engine, 'selectionMode' | 'marqueeKind' | 'lassoKind' | 'showPixelGrid' | 'showTransformControls' | 'autoSelect' | 'autoSelectTarget' | 'lockRatio'>;

export const luminance = (c: RGB): number => (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
export const rgbCss = (c: RGB, a = 1): string => `rgba(${c.r},${c.g},${c.b},${a})`;
export const hexOf = (c: RGB): string => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
export const stripExt = (name: string): string => name.replace(/\.[A-Za-z0-9]{1,8}$/, '') || 'Untitled';

function followMask(l: Layer, next: Transform): Mask | null {
  const m = l.mask;
  if (!m || !m.placement || !m.linked) return m;
  const o = l.transform;
  if (o.w === next.w && o.h === next.h && o.rotation === next.rotation && o.flipX === next.flipX && o.flipY === next.flipY) {
    return { ...m, placement: { ...m.placement, x: m.placement.x + next.x - o.x, y: m.placement.y + next.y - o.y } };
  }
  return m;
}

function mirrored(t: Transform, horizontal: boolean, W: number, H: number): Transform {
  return horizontal
    ? { ...t, x: W - t.x - t.w, flipX: !t.flipX, rotation: -t.rotation }
    : { ...t, y: H - t.y - t.h, flipY: !t.flipY, rotation: -t.rotation };
}

/** A layer mask through a distortion: warped pixels (for a linked mask), and where it is placed (for a mask placed
 *  apart, its warped bounds; for an unlinked mask, where it stays). */
interface DistortedMask { warped: Warped | null; placement: Transform | null }

/** Why a smart object's pixels cannot be changed directly, and what to do instead. */
const SHAPE_NOTICE = 'This is a shape layer. Reshape it with Direct Selection on its Shape Path, or rasterize it (Layer > Rasterize Layer) to change its pixels.';
const SMART_NOTICE = 'This layer is a smart object. Rasterize it (Layer > Rasterize Layer) to change its pixels; its filters stay editable in Layer > Smart Filters.';

/** Tools that paint with a PixelStroke, whose surfaces are warmed when the tool is chosen. */
const PAINT_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>(['brush', 'cloneStamp', 'healingBrush', 'spotHealing', 'remove']);

/** The tools Stroke Path can stroke with, and their names in its dialog. */
export type StrokeTool = 'brush' | 'eraser' | 'clone' | 'healBrush' | 'spotHealing' | 'dodge' | 'burn' | 'sponge' | 'blur' | 'sharpen';
export const STROKE_TOOLS: ReadonlyArray<readonly [StrokeTool, string]> = [['brush', 'Brush'], ['eraser', 'Eraser'], ['clone', 'Clone Stamp'], ['healBrush', 'Healing Brush'], ['spotHealing', 'Spot Healing Brush'], ['blur', 'Blur'], ['sharpen', 'Sharpen'], ['dodge', 'Dodge'], ['burn', 'Burn'], ['sponge', 'Sponge']];

/** A rectangle shape's four corner radii (top left, top right, bottom right, bottom left) when it carries them and
 *  they are all finite and not negative; null when it has one radius for all. */
export function cornerRadiiOf(style: Record<string, unknown>): number[] | null {
  const r = style.cornerRadii;
  return Array.isArray(r) && r.length === 4 && r.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0) ? (r as number[]).slice() : null;
}

export class Engine {
  readonly events = new Emitter<EngineEvents>();
  readonly projects: Project[] = [];
  tool: ToolId = 'move';
  brush: BrushSettings = { diameter: 40, hardness: 1, opacity: 1 };
  /** The Brush and Eraser's Flow (0.01 to 1), as Photoshop's options bar has it: how much paint each dab lays down.
   *  Kept apart from `brush`, which the retouch tools spread into their own strokes. */
  brushFlow = 1;
  /** The Crop tool's Delete Cropped Pixels: on by default, as Photoshop's (its Crop page and CreativeLive agree); off,
   *  cropped pixels stay beyond the canvas and Image > Reveal All brings them back. */
  cropDeletePixels = true;
  /** Preferences > Performance: History States (steps kept for undo, 1 to 1000) and the memory history may hold. Each
   *  project takes them when made; changing them applies to every open project from its next step. */
  historyLimits = { states: 100, bytes: 256 * 1024 * 1024 };
  setHistoryLimits(states: number, bytes: number): void {
    this.historyLimits = { states: Math.round(clamp(states, 1, 1000)), bytes: Math.round(clamp(bytes, 16 * 1024 * 1024, 4096 * 1024 * 1024)) };
    for (const p of this.projects) { p.history.entryLimit = this.historyLimits.states; p.history.byteLimit = this.historyLimits.bytes; }
  }
  /** Pen pressure's effect on the Brush's size and flow; neutral until a preset or the options turn it on. */
  brushDynamics: BrushDynamics = noDynamics();
  /** Brush Settings (Window > Brush Settings): tip shape, shape dynamics, scattering, texture and dual brush. */
  brushShape: BrushShape = defaultShape();
  /** The preset last applied, for the options bar; cleared by nothing, since changing a value is Photoshop's way too. */
  brushPresetId: string | null = null;

  /** Size, hardness, opacity and dynamics from a preset. */
  applyBrushPreset(preset: BrushPreset): void {
    this.brushDynamics = structuredClone(preset.dynamics);
    this.brushPresetId = preset.id;
    // The preset's tip shape, or a round tip: another preset's angle never lingers.
    this.brushShape = { ...this.brushShape, angle: preset.angle ?? 0, roundness: preset.roundness ?? 100 };
    this.setBrush({ diameter: preset.diameter, hardness: preset.hardness, opacity: preset.opacity, tip: preset.tip ?? null });
  }
  brushMode: 'paint' | 'erase' = 'paint';
  fg: RGB = { r: 0, g: 0, b: 0 };
  bg: RGB = { r: 255, g: 255, b: 255 };
  selectionMode: SelectionMode = 'replace';
  marqueeKind: 'rectangle' | 'ellipse' = 'rectangle';
  /** The Marquee's Feather (pixels) and Style, as Photoshop's options bar has them: Normal, Fixed Ratio (width to
   *  height) or Fixed Size (pixels). */
  marqueeFeather = 0;
  marqueeStyle: 'normal' | 'ratio' | 'size' = 'normal';
  marqueeRatio = { w: 1, h: 1 };
  marqueeSize = { w: 64, h: 64 };
  /** The Lasso's Feather (pixels), kept apart from the Marquee's as Photoshop keeps each tool's. */
  lassoFeather = 0;
  lassoKind: 'freehand' | 'polygonal' = 'freehand';
  wand = { tolerance: 32, contiguous: true, sampleAll: false, sampleSize: 0, antialias: true };
  /** smooth Lasso and elliptical Marquee edges (rectangles snap to whole pixels and
   *  the Magic Wand's edges follow pixels exactly, so neither changes). On by default. */
  selectionAntialiased = true;
  showPixelGrid = true;
  showTransformControls = true;
  autoSelect = false;
  /** Auto-Select's target, as Photoshop's: the layer under the pointer, or the top-most folder holding it. */
  autoSelectTarget: 'layer' | 'group' = 'layer';
  lockRatio = true;
  transformEdit: { project: Project; layerId: ID; original: Transform; draft: Transform; mode: DragMode; start: Pt; mask: boolean; group: { box: Transform; originals: Map<ID, Transform> } | null } | null = null;
  selectionShift: { project: Project; dx: number; dy: number } | null = null;
  private currentId: string | null = null;
  private viewSize = { w: 800, h: 600 };
  private readonly display = new Renderer();
  private readonly work = new Renderer();
  private stroke: { project: Project; layerId: ID; target: Target; s: PixelStroke; heal?: HealMode | 'remove'; healFrom?: Pt; quick?: Raster } | null = null;

  /** Quick Mask (Q), as Photoshop's: the Brush and Eraser paint the selection itself, white adding to it and black
   *  taking away (the Eraser the other way), shown as a red tint where nothing is selected. Each stroke becomes the new
   *  selection in its own history step, so undo gives back the one before. No selection means all is selected, as
   *  Photoshop's, so painting black begins one. */
  quickMask = false;
  toggleQuickMask(): void {
    if (this.stroke || !this.current) return;
    this.quickMask = !this.quickMask;
    this.emit('options', null);
    this.emit('selection', null);
  }
  /** The Quick Mask stroke in progress (the selection as painted so far), for the tint to follow it live. */
  get quickMaskLive(): Surface | null { return this.stroke?.quick ? this.stroke.s.working : null; }

  private beginQuickMaskStroke(p: Project, pt: Pt, pressure: number, pose: PenPose): boolean {
    const { width: W, height: H } = p.doc, sel = p.selection, r = new Raster(W, H);
    p.history.begin('Quick Mask', p.snapshot());
    const img = new ImageData(W, H), d = img.data;
    if (!sel) d.fill(255);
    else for (let y = 0; y < sel.h; y++) {
      const Y = sel.y + y;
      if (Y < 0 || Y >= H) continue;
      for (let x = 0; x < sel.w; x++) { const X = sel.x + x; if (X < 0 || X >= W) continue; const i = (Y * W + X) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = sel.data[y * sel.w + x]; }
    }
    ctxOf(r.canvas).putImageData(img, 0, 0);
    const white = luminance(this.fg) >= 0.5 !== (this.brushMode === 'erase');
    const s = new PixelStroke(r, [1, 0, 0, 1, 0, 0], { ...this.brush, color: { r: 255, g: 255, b: 255 }, flow: this.brushFlow }, white ? 'source-over' : 'destination-out', null);
    s.dynamics = structuredClone(this.brushDynamics);
    s.setShape(this.brushShape, null);
    this.stroke = { project: p, layerId: p.activeId ?? '', target: 'pixels', s, quick: r };
    s.to(pt, pressure, pose);
    s.compose();
    this.emit('selection', null);
    return true;
  }
  private lastBrush: { layerId: ID; target: Target; p: Pt } | null = null;
  private opacityOpen: Project | null = null;
  private swipeOpen: Project | null = null;
  private busyCount = 0;

  on<K extends keyof EngineEvents>(key: K, fn: (p: EngineEvents[K]) => void): () => void { return this.events.on(key, fn); }
  emit<K extends keyof EngineEvents>(key: K, payload: EngineEvents[K]): void { this.events.emit(key, payload); }
  notice(text: string, kind: Notice['kind'] = 'info'): void {
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

  /** Layers > Lock: the selected layers' locks, as one undo step (Layer Locks). */
  setLocks(patch: LayerLocks): void {
    this.edit('Layer Locks', (p) => {
      let changed = false;
      for (const id of p.selectedIds) {
        const l = p.layer(id);
        if (!l) continue;
        const next = { ...(l.locks ?? {}), ...patch }, clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v)) as LayerLocks;
        if (JSON.stringify(clean) !== JSON.stringify(l.locks ?? {})) { p.updateLayer(id, { locks: Object.keys(clean).length ? clean : undefined }); changed = true; }
      }
      return changed;
    });
  }
  get current(): Project | null { return this.projects.find((p) => p.id === this.currentId) ?? null; }
  get activeLayer(): Layer | null { return this.current?.activeLayer ?? null; }
  get stroking(): boolean { return this.stroke !== null; }
  get busy(): boolean { return this.busyCount > 0; }

  async task<T>(fn: () => Promise<T>): Promise<T> {
    this.busyCount += 1;
    if (this.busyCount === 1) this.emit('busy', true);
    try { return await fn(); } finally {
      this.busyCount -= 1;
      if (this.busyCount === 0) this.emit('busy', false);
    }
  }

  private refresh(): void {
    for (const key of ['doc', 'selection', 'active', 'history', 'render', 'options'] as const) this.emit(key, null);
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
    const taken = new Set(this.projects.map((p) => p.name));
    if (!taken.has(name)) return name;
    let n = 2;
    while (taken.has(`${name} ${n}`)) n += 1;
    return `${name} ${n}`;
  }

  addProject(doc: Doc, name: string, activeId: ID | null = null): Project {
    const p = new Project(doc, this.uniqueName(name));
    p.history.entryLimit = this.historyLimits.states;
    p.history.byteLimit = this.historyLimits.bytes;
    p.viewport.width = this.viewSize.w;
    p.viewport.height = this.viewSize.h;
    p.viewport.fit(doc.width, doc.height);
    p.activeId = activeId && doc.layers.some((l) => l.id === activeId) ? activeId : doc.layers[doc.layers.length - 1]?.id ?? null;
    if (p.activeId) p.selectedIds = new Set([p.activeId]);
    this.projects.push(p);
    this.openingSnapshot(p);
    this.switchTo(p.id);
    return p;
  }

  /** Photoshop's Automatically Create First Snapshot: each document keeps itself as opened, the History Brush's first
   *  source, within the snapshots' memory budget (past it, none is taken and the brush says so). */
  autoFirstSnapshot = true;
  /** Preferences > Cursors: how painting tools show where they will paint (drawn by brush-common's drawBrushCursor). */
  cursorPrefs: { paint: 'tip' | 'precise' | 'standard'; crosshair: boolean } = { paint: 'tip', crosshair: false };
  private openingSnapshot(p: Project): void {
    if (!this.autoFirstSnapshot || this.docBytes(p.doc) > this.snapshotByteLimit) return;
    this.historySnapshots.set(p, [{ id: uid(), name: p.name, state: { doc: this.copyDoc(p.doc), activeId: p.activeId, selection: p.selection } }]);
  }

  /** Frame layers (the Frame tool, K; not the Timeline's frames), as Photoshop's: a folder named Frame N whose mask is the frame's rectangle or ellipse;
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

  /** The History Brush's source, as Photoshop's: a snapshot chosen in the History panel, or the document's first. */
  historyBrushSource: ID | null = null;
  setHistoryBrushSource(id: ID): void { this.historyBrushSource = id; this.emit('history', null); }
  get historyBrushSourceId(): ID | null {
    const p = this.current, list = p ? this.historySnapshots.get(p) ?? [] : [];
    return (list.find((x) => x.id === this.historyBrushSource) ?? list[0])?.id ?? null;
  }

  switchTo(id: string): void {
    if (this.stroke || !this.projects.some((p) => p.id === id)) return;
    this.settle();
    this.currentId = id;
    this.emit('projects', null);
    this.emit('viewport', null);
    this.emit('tool', null);
    this.refresh();
  }

  closeProject(id: string): void {
    const i = this.projects.findIndex((p) => p.id === id);
    if (i < 0 || this.stroke) return;
    if (this.transformEdit?.project.id === id) this.transformEdit = null;
    if (this.floatSel?.project.id === id) this.floatSel = null;
    this.projects.splice(i, 1);
    if (this.currentId === id) this.currentId = this.projects[Math.min(i, this.projects.length - 1)]?.id ?? null;
    this.emit('projects', null);
    this.emit('viewport', null);
    this.refresh();
  }

  markSaved(p: Project, name: string, libraryName: string | null): void {
    p.name = name;
    p.libraryName = libraryName;
    p.history.markSaved();
    this.emit('projects', null);
    this.emit('history', null);
  }

  newDocument(width: number, height: number, name = 'Untitled', fill: 'transparent' | 'white' | 'background' = 'transparent', resolution = 72): Project | null {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > LIMITS.side || height > LIMITS.side || width * height > LIMITS.pixels) {
      this.notice('Canvas sides must be 1 to 30,000 px, and the canvas at most 100 megapixels.', 'error');
      return null;
    }
    const base: Doc = { id: uid(), width, height, resolution: Number.isFinite(resolution) && resolution >= 1 && resolution <= 10000 ? resolution : 72, layers: [] };
    let layer = newLayer(fill === 'transparent' ? 'Layer 1' : 'Background', base);
    if (fill !== 'transparent') layer = { ...layer, raster: Raster.filled(width, height, fill === 'white' ? '#ffffff' : rgbCss(this.bg)) };
    return this.addProject({ ...base, layers: [layer] }, name, layer.id);
  }

  edit(name: string, fn: (p: Project) => boolean | void): boolean {
    const p = this.current;
    if (!p || this.stroke) return false;
    this.settle();
    const nested = p.history.open;
    p.history.begin(name, p.snapshot());
    let ok: boolean | void = true;
    try { ok = fn(p); } catch (err) {
      if (nested) throw err;
      this.rollBack(p, name, err);
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
    if (this.swipeOpen) this.endVisibilitySwipe();
    if (this.floatSel && !keepFloating) this.commitSelectionTransform();
  }

  private focus(p: Project, id: ID | null): void {
    p.activeId = id;
    p.selectedIds = new Set(id ? [id] : []);
    p.maskTarget = false;
  }

  private readonly historySnapshots = new WeakMap<Project, Array<{ id: ID; name: string; state: Snapshot }>>();

  /** A copy of `doc` whose layer pixels and masks are copies too: strokes change pixels in place, so a snapshot that
   *  only referred to them would change with later painting. Type stays editable on its copied pixels; smart sources,
   *  paths and shapes are never changed in place, so they are shared. */
  private copyDoc(doc: Doc): Doc {
    const copy = (r: Raster | null | undefined): Raster | null => {
      if (!r) return null;
      const c = new Raster(r.width, r.height);
      c.ctx.drawImage(r.canvas, 0, 0);
      return c;
    };
    return { ...doc, layers: doc.layers.map((l) => {
      const raster = copy(l.raster), text = l.text && raster && liveText(l) ? { ...l.text, rendered: textKey(raster) } : l.text;
      return { ...l, raster, text, mask: l.mask ? { ...l.mask, raster: copy(l.mask.raster) } : l.mask };
    }) };
  }

  /** Snapshots copy every layer's pixels, so beside the history's own limit they have a budget of their own, per
   *  document; past it, New Snapshot declines rather than risk running out of memory. */
  snapshotByteLimit = 768 * 1024 * 1024;

  private docBytes(doc: Doc): number {
    let n = 0;
    for (const l of doc.layers) { if (l.raster) n += l.raster.bytes; if (l.mask?.raster) n += l.mask.raster.bytes; }
    return n;
  }

  /** The current document's snapshots, newest last, with the memory each keeps. They live with the open document and
   *  are not saved. */
  get snapshots(): ReadonlyArray<{ id: ID; name: string; bytes: number }> {
    const p = this.current;
    return p ? (this.historySnapshots.get(p) ?? []).map((x) => ({ id: x.id, name: x.name, bytes: this.docBytes(x.state.doc) })) : [];
  }

  /** History > New Snapshot: the document as it is now, kept to return to however far the steps move on. */
  takeSnapshot(): void {
    const p = this.current;
    if (!p || this.stroke) return;
    this.settle();
    const list = this.historySnapshots.get(p) ?? [], need = this.docBytes(p.doc), used = list.reduce((a, x) => a + this.docBytes(x.state.doc), 0), mb = (b: number): number => Math.ceil(b / 1048576);
    if (used + need > this.snapshotByteLimit) { this.notice(`A snapshot of this document needs ${mb(need)} MB, and snapshots already keep ${mb(used)} MB of the ${mb(this.snapshotByteLimit)} MB they may use. Delete one first.`); return; }
    // Numbered as Photoshop's: the opening snapshot bears the document's name, so the first taken is Snapshot 1.
    let n = list.filter((x) => /^Snapshot \d+$/.test(x.name)).length + 1;
    while (list.some((x) => x.name === `Snapshot ${n}`)) n += 1;
    list.push({ id: uid(), name: `Snapshot ${n}`, state: { doc: this.copyDoc(p.doc), activeId: p.activeId, selection: p.selection } });
    this.historySnapshots.set(p, list);
    this.emit('history', null);
  }

  /** Returns the document to a snapshot as one undo step, from a fresh copy, so the snapshot stays as it was taken. */
  revertToSnapshot(id: ID): void {
    const p = this.current, snap = p ? this.historySnapshots.get(p)?.find((x) => x.id === id) : undefined;
    if (!p || !snap) return;
    this.edit(`Revert to ${snap.name}`, (q) => {
      q.doc = this.copyDoc(snap.state.doc);
      q.selection = snap.state.selection;
      this.focus(q, snap.state.activeId && q.doc.layers.some((l) => l.id === snap.state.activeId) ? snap.state.activeId : null);
    });
  }

  deleteSnapshot(id: ID): void {
    const p = this.current, list = p ? this.historySnapshots.get(p) : undefined;
    if (!p || !list) return;
    this.historySnapshots.set(p, list.filter((x) => x.id !== id));
    this.emit('history', null);
  }

  /** The History panel's list for the current document. */
  get historySteps(): { names: string[]; current: number } { return this.current?.history.steps ?? { names: [], current: 0 }; }

  /** Goes to the state after step `index` (0 is before the first step kept) by undoing or redoing in turn, so
   *  everything that follows undo and redo, frames included, stays right. */
  jumpHistory(index: number): void {
    const p = this.current;
    if (!p || this.stroke) return;
    const { names, current } = p.history.steps, target = Math.max(0, Math.min(names.length, Math.round(index)));
    for (let k = current; k > target; k--) this.undo();
    for (let k = current; k < target; k++) this.redo();
  }

  undo(): void {
    const p = this.current;
    if (!p || this.stroke) return;
    this.settle();
    const e = p.history.undo();
    if (!e) return;
    for (let i = e.patches.length - 1; i >= 0; i--) { const q = e.patches[i]; q.raster.write(q.before, q.x, q.y); }
    this.restore(p, e.before);
    this.reconcileFrame(p, e.name === 'Select Frame');
  }

  redo(): void {
    const p = this.current;
    if (!p || this.stroke) return;
    this.settle();
    const e = p.history.redo();
    if (!e) return;
    for (const q of e.patches) q.raster.write(q.after, q.x, q.y);
    this.restore(p, e.after);
    this.reconcileFrame(p, e.name === 'Select Frame');
  }

  private restore(p: Project, s: Snapshot): void {
    p.doc = s.doc;
    p.selection = s.selection;
    if (s.paths) { this.pathSets.set(p, structuredClone(s.paths) as PathSet); this.pathsChanged(p); }   // a path edit's step
    this.focus(p, s.activeId && s.doc.layers.some((l) => l.id === s.activeId) ? s.activeId : null);
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
    if (this.tool !== id) { this.tool = id; this.emit('tool', null); }
    this.emit('overlay', null);
  }

  /** the right-drag with a brush tool: left and right resize the brush from its size at the press, the
   *  circle's edge following the pointer (each screen point widens the radius by a screen point), or with Shift change
   *  its hardness (the full range across 200 points). The brush circle stays where the press was. */
  tipDrag: { at: Pt; startX: number; diameter: number; hardness: number } | null = null;

  beginTipDrag(at: Pt, screenX: number): boolean {
    if (this.stroke) return false;
    this.tipDrag = { at, startX: screenX, diameter: this.brush.diameter, hardness: this.brush.hardness };
    this.emit('overlay', null);
    return true;
  }

  updateTipDrag(screenX: number, shift: boolean): void {
    const d = this.tipDrag;
    if (!d) return;
    const dx = screenX - d.startX, zoom = Math.max(0.0001, this.current?.viewport.zoom ?? 1);
    if (shift) this.setBrush({ hardness: Math.min(1, Math.max(0, d.hardness + dx / 200)), diameter: d.diameter });
    else this.setBrush({ diameter: Math.min(2000, Math.max(1, Math.round(d.diameter + (2 * dx) / zoom))), hardness: d.hardness });
  }

  endTipDrag(): void {
    if (!this.tipDrag) return;
    this.tipDrag = null;
    this.emit('overlay', null);
  }

  setBrush(patch: Partial<BrushSettings>): void {
    this.brush = {
      diameter: Math.round(clamp(patch.diameter ?? this.brush.diameter, 1, 5000)),
      hardness: clamp(patch.hardness ?? this.brush.hardness, 0, 1),
      opacity: clamp(patch.opacity ?? this.brush.opacity, 0.01, 1),
      tip: 'tip' in patch ? patch.tip ?? null : this.brush.tip ?? null,
    };
    this.emit('options', null);
    this.emit('overlay', null);
  }

  setBrushMode(mode: 'paint' | 'erase'): void { this.brushMode = mode; this.emit('options', null); this.emit('tool', null); }
  setWand(patch: Partial<Engine['wand']>): void { this.wand = { ...this.wand, ...patch }; this.emit('options', null); }
  /** Paint Bucket: fills the area of similar colour clicked with the foreground colour. */
  bucket = { tolerance: 32, contiguous: true, sampleAll: false, opacity: 1, antiAlias: true };
  setBucket(patch: Partial<Engine['bucket']>): void { this.bucket = { ...this.bucket, ...patch }; this.emit('options', null); }
  /** Dodge and Burn lighten and darken, weighted to a tonal range by Exposure; Sponge moves colour away from or toward
   *  its own grey by Flow. */
  tone: { range: 'shadows' | 'midtones' | 'highlights'; exposure: number; spongeMode: 'desaturate' | 'saturate'; flow: number } = { range: 'midtones', exposure: 0.5, spongeMode: 'desaturate', flow: 0.5 };
  setTone(patch: Partial<Engine['tone']>): void { this.tone = { ...this.tone, ...patch }; this.emit('options', null); }
  setColors(fg?: RGB, bg?: RGB): void { if (fg) this.fg = fg; if (bg) this.bg = bg; this.emit('colors', null); this.emit('options', null); }
  swapColors(): void { this.setColors(this.bg, this.fg); }
  defaultColors(): void { this.setColors({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }); }

  fit(): void { const p = this.current; if (!p) return; p.viewport.fit(p.doc.width, p.doc.height); this.emit('viewport', null); this.emit('render', null); }
  zoomTo(z: number, at?: Pt): void {
    const v = this.current?.viewport;
    if (!v) return;
    const a = at ?? { x: v.centerX, y: v.height / 2 };
    v.zoomAt(z, a.x, a.y);
    this.emit('viewport', null);
    this.emit('render', null);
  }
  zoomStep(inward: boolean, at?: Pt): void { const z = this.current?.viewport.zoom ?? 1; this.zoomTo(inward ? z * 1.25 : z / 1.25, at); }
  pan(dx: number, dy: number): void { const v = this.current?.viewport; if (!v) return; v.panBy(dx, dy); this.emit('viewport', null); this.emit('render', null); }

  compose(target: Surface, view: Mat, quality: ImageSmoothingQuality = 'high'): void {
    const p = this.current;
    if (p) this.display.render({ doc: p.doc, target, view, overrides: this.overrides(p), quality });
  }

  /** The GPU display's view of the current document (Phase 18.2b): its visible layers bottom to top, each with its
   *  pixels, placement, opacity and blend mode, live previews applied as `compose` applies them; or the reason the
   *  document still draws on the CPU (what the GPU path does not draw yet). */
  gpuLayers(): { layers: GpuLayerSpec[] } | { reason: string } {
    const p = this.current;
    if (!p) return { reason: 'no document is open' };
    const ov = this.overrides(p), layers: GpuLayerSpec[] = [], map = byId(p.doc), clips = new Map<ID, GpuClipSpec | null | 'nested'>(), fchains = new Map<ID | null, GpuMaskSpec[] | undefined>();
    // A layer's mask, as the CPU renderer's maskOf reads it: enabled with pixels, the live preview's source while
    // painting, and its own placement, else the layer's (Phase 18, masks).
    const maskFor = (x: Layer, xo: LayerOverride | undefined): GpuMaskSpec | undefined => {
      const m = x.mask, msrc = m?.enabled && m.raster ? xo?.maskSource ?? m.raster.canvas : null;
      return m && msrc ? { image: msrc, version: xo?.maskSource ? -1 : (m.raster as Raster).version, width: msrc.width, height: msrc.height,
        matrix: placement(xo?.maskPlacement ?? m.placement ?? xo?.transform ?? x.transform, msrc.width, msrc.height) } : undefined;
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
      // Folders are pass-through, as the CPU renderer draws them: their layers in order, hidden with the folder.
      if (l.isGroup) { if (l.artboard && visible) return { reason: 'artboards' }; continue; }
      const o = ov?.get(l.id);
      if (o?.hidden || !visible) continue;
      // The masks of the folders around it, as the CPU renderer's folderMasks lists them (their pixels as they are, their
      // own placement, else the folder's), one array per parent folder so its layers share one coverage on the GPU.
      if (!fchains.has(l.parentId ?? null)) {
        const chain = ancestors(map, l).flatMap((g) => g.mask?.enabled && g.mask.raster ? [{ image: g.mask.raster.canvas, version: g.mask.raster.version, width: g.mask.raster.width, height: g.mask.raster.height,
          matrix: placement(g.mask.placement ?? g.transform, g.mask.raster.width, g.mask.raster.height) }] : []);
        fchains.set(l.parentId ?? null, chain.length ? chain : undefined);
      }
      const folders = fchains.get(l.parentId ?? null);
      if (folders && l.clipId) return { reason: 'a clipped layer inside a masked folder' };
      const mask = maskFor(l, o);
      let clip: GpuClipSpec | undefined;
      if (l.clipId) {
        if (!clips.has(l.clipId)) clips.set(l.clipId, clipOf(l.clipId));
        const c = clips.get(l.clipId);
        if (c === 'nested') return { reason: 'nested clipping masks' };
        if (!c) continue;
        clip = c;
      }
      if (l.adjustment) {
        // Phase 18.5: a per-channel adjustment goes to the GPU as its proven lookup table (engine/lut.ts); others, by name,
        // keep the document on the CPU.
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
        if (clip || folders) return { reason: 'layer styles on a clipped layer or inside a masked folder' };
        fxParts = this.display.gpuEffectParts(l, o, p.doc);
        if (!fxParts) return { reason: 'layer styles on a layer being edited' };
      }
      // Dissolve's pattern is fixed to document pixels; the display composites in screen pixels, so it stays on the CPU.
      if ((o?.blend ?? l.blend) === 'dissolve') return { reason: 'a layer in Dissolve mode' };
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
  /** The document's Global Light (Photoshop's Layer > Layer Style > Global Light), shared by effects that use it. */
  setGlobalLight(light: GlobalLight): void {
    const next = { angle: clamp(Math.round(light.angle), -180, 180), altitude: clamp(Math.round(light.altitude), 0, 90) };
    this.edit('Global Light', (p) => {
      const cur = p.doc.globalLight ?? DEFAULT_GLOBAL_LIGHT;
      if (cur.angle === next.angle && cur.altitude === next.altitude) return false;
      p.doc = { ...p.doc, globalLight: next };
      return true;
    });
  }

  /** The Layer Style dialog's OK: the layer's effects and, when it changed, the document's Global Light, one step. */
  applyStyleAndLight(id: ID, effects: LayerEffects | null, light: GlobalLight | null): void {
    this.edit('Layer Style', () => {
      if (light) this.setGlobalLight(light);
      this.setLayerEffects(id, effects);
      return true;
    });
  }

  setLayerEffects(id: ID, effects: LayerEffects | null): void {
    this.effectPreview = null;
    this.display.fastEffects = false;
    // Normalised, so a partial style gets every effect's defaults rather than failing later in the renderer.
    const whole = effects ? effectsFromData(JSON.parse(JSON.stringify(effects))) : null;
    const next = effectsActive(whole) ? whole : null;
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
  textLayerAt(pt: Pt): ID | null {
    const p = this.current;
    if (!p) return null;
    for (const l of [...p.doc.layers].reverse()) if (l.visible && liveText(l) && contains(l.transform, pt)) return l.id;
    return null;
  }

  /** A new type layer: the click point `at` is where the first line's baseline starts (its centre or end when the text
   *  is centred or right-aligned), as with Photoshop's point type. */
  async createTextLayer(at: Pt, spec: TextSpec): Promise<void> {
    if (!this.current || !spec.content.trim()) return;
    await loadTextFont(spec);
    const r = renderText(spec), w = r.raster.width;
    const x = at.x - (spec.align === 'center' ? w / 2 : spec.align === 'right' ? w - r.pad : r.pad);
    this.textSettings = { ...spec, content: '', rendered: undefined };
    const name = spec.content.split('\n')[0].trim().slice(0, 40) || 'Type';
    this.insertRasterLayer(r.raster, name, Math.round(x), Math.round(at.y - r.baseline), { text: { ...spec, rendered: textKey(r.raster) } }, 'Type');
  }

  /** Layer > Type on Path: `content` set along the active path's first subpath of two or more anchors, in the current
   *  type settings, from `offset` percent of its length; the path kept with the type, relative to a frame around it
   *  (its bounds and a margin of one and a half times the type size), where the layer is placed. */
  async createTextOnPath(content: string, offset: number): Promise<boolean> {
    const p = this.current, sp = this.workPath?.subpaths.find((s) => s.anchors.length > 1);
    if (!p) return false;
    if (!sp) { this.notice('Draw a path with the Pen tool first, then set type on it.'); return false; }
    if (!content.trim()) { this.notice('Type some text to set on the path.'); return false; }
    const base: TextSpec = { ...this.textSettings, content: content.replace(/\r?\n/g, ' '), warp: null, onPath: null, rendered: undefined };
    await loadTextFont(base);
    if (this.current !== p) return false;
    const rough = samplePath(sp, 4), length = rough.reduce((s, q, i) => (i ? s + Math.hypot(q.x - rough[i - 1].x, q.y - rough[i - 1].y) : 0), 0);
    const pts = samplePath(sp, Math.max(1, length / 2000)), m = Math.ceil(base.size * 1.5);
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y), ox = Math.floor(Math.min(...xs) - m), oy = Math.floor(Math.min(...ys) - m);
    const frame = { w: Math.ceil(Math.max(...xs) - ox + m), h: Math.ceil(Math.max(...ys) - oy + m) };
    const spec: TextSpec = { ...base, onPath: { points: pts.map((q) => ({ x: q.x - ox, y: q.y - oy })), offset: Math.max(0, Math.min(100, offset)), frame } };
    const r = renderText(spec);
    this.textSettings = { ...base, content: '', onPath: null };
    this.insertRasterLayer(r.raster, spec.content.trim().slice(0, 40) || 'Type', ox, oy, { text: { ...spec, rendered: textKey(r.raster) } }, 'Type on Path');
    return true;
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
    for (const s of specs) await loadTextFont(s);
    if (this.current !== p) return;
    this.edit('Redefine Paragraph Style', (pp) => {
      pp.doc = { ...pp.doc, paragraphStyles: (pp.doc.paragraphStyles ?? []).map((x) => (x.id === id ? style : x)) };
      linked.forEach((l, i) => {
        const spec = specs[i], r = renderText(spec), oldR = l.raster as Raster, t = l.transform;
        const nw = r.raster.width * (t.w / oldR.width), nh = r.raster.height * (t.h / oldR.height);
        const x = spec.align === 'center' ? t.x + (t.w - nw) / 2 : spec.align === 'right' ? t.x + t.w - nw : t.x;
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

  /** New text or settings for a type layer, re-rendered in place as one undo step: any scaling of the layer is kept,
   *  and so is its left edge, centre or right edge, by its alignment. */
  async updateTextLayer(id: ID, spec: TextSpec): Promise<void> {
    const p = this.current, l = p?.layer(id);
    if (!p || !l || !liveText(l) || !l.raster || !l.text) return;
    if (!spec.content.trim()) { this.notice('Type some text, or delete the layer.'); return; }
    await loadTextFont(spec);
    if (this.current !== p || !liveText(p.layer(id))) return;
    const r = renderText(spec), old = l.raster, t = l.transform, before = l.text;
    const nw = r.raster.width * (t.w / old.width), nh = r.raster.height * (t.h / old.height);
    const x = spec.align === 'center' ? t.x + (t.w - nw) / 2 : spec.align === 'right' ? t.x + t.w - nw : t.x;
    const autoName = before.content.split('\n')[0].trim().slice(0, 40) || 'Type';
    const name = l.name === autoName ? spec.content.split('\n')[0].trim().slice(0, 40) || 'Type' : l.name;
    this.textSettings = { ...spec, content: '', rendered: undefined };
    this.edit('Edit Type', (pp) => { pp.updateLayer(id, { raster: r.raster, transform: { ...t, x, w: nw, h: nh }, name, text: { ...spec, rendered: textKey(r.raster) } }); });
  }

  /** True, with a notice, when the active layer is a smart object and an edit would change its pixels rather than its
   *  mask. Checked before any history step opens. */
  private smartLocked(p: Project): boolean {
    const l = p.activeLayer;
    if (!(l?.smart || l?.vector) || (p.maskTarget && l.mask)) return false;
    this.notice(l.vector ? SHAPE_NOTICE : SMART_NOTICE);
    return true;
  }

  /** Runs one smart filter on `src`, supplied by the app, since the filter code lives with the Filter dialog. */
  smartFilterRunner: ((kind: string, settings: Record<string, unknown>, src: ImageData) => ImageData) | null = null;

  /** How far a smart filter's effect reaches past its input, supplied by the app with the runner. */
  smartFilterMargin: ((kind: string, settings: Record<string, unknown>) => number) | null = null;

  /** A smart object's pixels: its source padded by the shown filters' total reach, with each applied in order. */
  private smartMargin(filters: SmartFilter[]): number {
    return Math.min(512, Math.ceil(filters.filter((f) => f.enabled).reduce((n, f) => n + (this.smartFilterMargin?.(f.kind, f.settings) ?? 0), 0)));
  }

  /** A distorted smart object's warp as the layer now sits: a move or transform since its last render carried in. */
  private smartWarpNow(l: Layer): Pt[] | null {
    const sm = l.smart, w = sm?.warp;
    if (!sm || !w || !l.raster) return null;
    const at = sm.warpAt;
    if (!at || JSON.stringify(at) === JSON.stringify(l.transform)) return w;
    const move = mul(placement(l.transform, l.raster.width, l.raster.height), invert(placement(at, l.raster.width, l.raster.height)));
    return w.map((p) => applyMat(move, p.x, p.y));
  }

  /** The render `r` (the source padded by `margin`) warped so the source's corners land on `warp`, the padding
   *  following the same perspective, cropped to what shows. */
  private warpedSmart(r: Raster, margin: number, source: Raster, warp: Pt[]): Warped | null {
    const H = homography(warp), ex = margin / source.width, ey = margin / source.height;
    const quad = [[-ex, -ey], [1 + ex, -ey], [1 + ex, 1 + ey], [-ex, 1 + ey]].map(([u, v]) => project(H, u, v));
    const full = warpRaster(r, docTransform(r.width, r.height), quad);
    if (!full) return null;
    const crop = visibleBounds(full.raster);
    return crop ? cropWarp(full, crop) : full;
  }

  /** A smart filter mask applied: where the mask (alpha, source-sized) is clear the unfiltered source shows, where it
   *  is full the filtered render; the padding past the source shows the filters, as Photoshop's mask is white there. */
  private maskFilters(filtered: ImageData, source: Raster, m: number, mask: Raster | null): ImageData {
    if (!mask) return filtered;
    const W = filtered.width, H = filtered.height, plain = createSurface(W, H), pc = ctxOf(plain), mk = createSurface(W, H), mc = ctxOf(mk);
    pc.drawImage(source.canvas, m, m);
    mc.fillStyle = '#ffffff';
    mc.fillRect(0, 0, W, H);
    mc.clearRect(m, m, source.width, source.height);
    mc.drawImage(mask.canvas, m, m, source.width, source.height);
    const u = pc.getImageData(0, 0, W, H).data, a = mc.getImageData(0, 0, W, H).data, f = filtered.data, out = new ImageData(W, H), o = out.data;
    for (let i = 0; i < W * H; i++) { const k = a[i * 4 + 3] / 255; for (let c = 0; c < 4; c++) o[i * 4 + c] = Math.round(u[i * 4 + c] + (f[i * 4 + c] - u[i * 4 + c]) * k); }
    return out;
  }

  private renderSmart(source: Raster, filters: SmartFilter[], mask: Raster | null = null): Raster {
    const shown = filters.filter((f) => f.enabled);
    const m = this.smartMargin(filters);
    const pad = createSurface(source.width + 2 * m, source.height + 2 * m);
    ctxOf(pad).drawImage(source.canvas, m, m);
    let img = ctxOf(pad).getImageData(0, 0, pad.width, pad.height);
    for (const f of shown) if (this.smartFilterRunner) img = this.smartFilterRunner(f.kind, f.settings, img);
    if (shown.length) img = this.maskFilters(img, source, m, mask);
    const out = new Raster(img.width, img.height);
    out.write(img);
    return out;
  }

  /** Layer > Convert to Smart Object: keeps the layer's pixels as the untouched source of a smart object. */
  convertToSmartObject(): void {
    this.edit('Convert to Smart Object', (p) => {
      const l = p.activeLayer;
      if (!l || l.isGroup || l.adjustment || l.smart || !l.raster) { this.notice('Select a pixel layer to convert.'); return false; }
      p.updateLayer(l.id, { smart: { source: l.raster, filters: [] }, text: null, shape: null });
    });
  }

  /** Layer > Rasterize Layer: a smart object or a type layer becomes plain pixels, looking as it does now. */
  rasterizeLayer(): void {
    this.edit('Rasterize Layer', (p) => {
      const l = p.activeLayer;
      if (!l || (!l.smart && !l.text && !l.vector)) return false;
      p.updateLayer(l.id, { smart: null, text: null, vector: null });
    });
  }

  /** Adds a filter to the active smart object's stack and re-renders it, as one undo step. */
  addSmartFilter(kind: string, settings: Record<string, unknown>): void {
    const l = this.current?.activeLayer;
    if (l?.smart) this.setSmartFilters(l.id, [...(this.smartFiltersShown(l.id) ?? l.smart.filters), { id: uid(), kind, settings: structuredClone(settings), enabled: true }], 'Smart Filter');
  }

  /** Replaces a smart object's filter stack and re-renders its pixels from the source, as one undo step. */
  setSmartFilters(id: ID, filters: SmartFilter[], name = 'Smart Filters'): void { const p = this.current; if (p) this.restackSoon(p, id, null, filters, name); }

  /** Layer > Smart Objects > Replace Contents: a new source for the active smart object, shown at the same scale per
   *  source pixel and about the same centre, its filters and mask re-run, as one step. */
  replaceContents(source: Raster): boolean {
    const p = this.current, l = p?.activeLayer;
    if (!p || !l?.smart) { this.notice('Select a smart object to replace its contents.'); return false; }
    return this.restackSoon(p, l.id, source, null, 'Replace Contents');
  }

  /** Adds a smart filter mask to the active smart object: from the selection (mapped into the source's pixels) when
   *  there is one and the object is not distorted, else white, showing the filters everywhere. */
  addSmartFilterMask(): void {
    const p = this.current, l = p?.activeLayer, sm = l?.smart;
    if (!p || !l || !sm || !l.raster) { this.notice('Select a smart object first.'); return; }
    if (sm.filterMask) return;
    const src = sm.source, mask = new Raster(src.width, src.height), sel = p.selection;
    if (sel && !sm.warp) {
      const m = (l.raster.width - src.width) / 2;
      setMat(mask.ctx, mul(translation(-m, -m), mul(invert(placement(l.transform, l.raster.width, l.raster.height)), translation(sel.x, sel.y))));
      mask.ctx.drawImage(sel.surface(), 0, 0);
      mask.ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else { mask.ctx.fillStyle = '#ffffff'; mask.ctx.fillRect(0, 0, src.width, src.height); }
    this.restackSoon(p, l.id, null, null, 'Add Smart Filter Mask', { filterMask: mask, filterMaskEnabled: true });
  }

  deleteSmartFilterMask(): void {
    const p = this.current, l = p?.activeLayer;
    if (p && l?.smart?.filterMask) this.restackSoon(p, l.id, null, null, 'Delete Smart Filter Mask', { filterMask: null, filterMaskEnabled: true });
  }

  toggleSmartFilterMask(): void {
    const p = this.current, l = p?.activeLayer, sm = l?.smart;
    if (p && l && sm?.filterMask) this.restackSoon(p, l.id, null, null, sm.filterMaskEnabled === false ? 'Enable Smart Filter Mask' : 'Disable Smart Filter Mask', { filterMask: sm.filterMask, filterMaskEnabled: sm.filterMaskEnabled === false });
  }

  /** File > Place Linked: `raster` as a new smart object, centred, linked to a file through `link`. */
  placeLinked(raster: Raster, link: SmartLink, name: string): void {
    this.insertRasterLayer(raster, name, null, null, { smart: { source: raster, filters: [], link } }, 'Place Linked');
  }

  /** New contents read from a linked file: the smart object `id` re-rendered from `raster` at the same scale and
   *  centre, its link noting what was read, as one step. */
  updateLinkedContents(id: ID, raster: Raster, link: SmartLink, name = 'Update Modified Content'): boolean {
    const p = this.current;
    return !!p && this.restackSoon(p, id, raster, null, name, null, { link });
  }

  /** Layer > Embed Linked: the smart object keeps its contents and forgets the file. */
  embedLinked(): void {
    const p = this.current, l = p?.activeLayer;
    if (p && l?.smart?.link) this.edit('Embed Linked', (q) => q.updateLayer(l.id, { smart: { ...(l.smart as SmartObject), link: null } }));
  }

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
  private readonly smartPending = new Map<ID, { token: number; filters: SmartFilter[] }>();
  private smartToken = 0;

  /** The filters a smart object's dialog shows: those last asked for while their render is still running, else its own. */
  smartFiltersShown(id: ID): SmartFilter[] | null {
    const pending = this.smartPending.get(id);
    return pending ? pending.filters : this.current?.layer(id)?.smart?.filters ?? null;
  }

  /** renderSmart with each filter run in the worker in turn, the interface staying live. */
  private async renderSmartAsync(source: Raster, filters: SmartFilter[], mask: Raster | null = null): Promise<Raster> {
    const m = this.smartMargin(filters), pad = createSurface(source.width + 2 * m, source.height + 2 * m);
    ctxOf(pad).drawImage(source.canvas, m, m);
    let img = ctxOf(pad).getImageData(0, 0, pad.width, pad.height);
    for (const f of filters.filter((x) => x.enabled)) {
      img = this.smartFilterRunnerAsync ? await this.smartFilterRunnerAsync(f.kind, f.settings, img) : this.smartFilterRunner ? this.smartFilterRunner(f.kind, f.settings, img) : img;
    }
    if (filters.some((x) => x.enabled)) img = this.maskFilters(img, source, m, mask);
    const out = new Raster(img.width, img.height);
    out.write(img);
    return out;
  }

  /** Re-renders a smart object: at once when it is small (up to 2 megapixels) or shows no filter, else in the
   *  background, the result applied as one undo step when it is ready. A later change to the same object supersedes a
   *  render still running, and a render whose source changed meanwhile is dropped. */
  private restackSoon(p: Project, id: ID, source: Raster | null, filters: SmartFilter[] | null, name: string, maskChange: { filterMask: Raster | null; filterMaskEnabled: boolean } | null = null, extra: Partial<SmartObject> | null = null): boolean {
    const l = p.layer(id);
    if (!l?.smart) return false;
    const src = source ?? l.smart.source, stack = structuredClone(filters ?? this.smartFiltersShown(id) ?? l.smart.filters);
    const fm = maskChange ?? { filterMask: l.smart.filterMask ?? null, filterMaskEnabled: l.smart.filterMaskEnabled !== false }, active = fm.filterMaskEnabled ? fm.filterMask : null;
    if (!this.smartFilterRunnerAsync || src.width * src.height <= 2_000_000 || !stack.some((f) => f.enabled)) {
      this.smartPending.delete(id);
      return this.restack(p, id, source, stack, name, null, maskChange, extra);
    }
    const token = ++this.smartToken;
    this.smartPending.set(id, { token, filters: stack });
    void this.task(async () => {
      const rendered = await this.renderSmartAsync(src, stack, active);
      if (this.smartPending.get(id)?.token !== token) return;
      this.smartPending.delete(id);
      const now = p.layer(id);
      if (!this.projects.includes(p) || !now?.smart || (source === null && now.smart.source !== src)) { this.emit('doc', null); return; }
      this.restack(p, id, source, stack, name, rendered, maskChange, extra);
    });
    return true;
  }

  private restack(p: Project, id: ID, source: Raster | null, filters: SmartFilter[] | null, name: string, rendered: Raster | null = null, maskChange: { filterMask: Raster | null; filterMaskEnabled: boolean } | null = null, extra: Partial<SmartObject> | null = null): boolean {
    return this.editOn(p, name, () => {
      const l = p.layer(id);
      if (!l?.smart) return false;
      const src = source ?? l.smart.source;
      const fm = maskChange ?? { filterMask: l.smart.filterMask ?? null, filterMaskEnabled: l.smart.filterMaskEnabled !== false };
      const stack = structuredClone(filters ?? l.smart.filters), raster = rendered ?? this.renderSmart(src, stack, fm.filterMaskEnabled ? fm.filterMask : null), old = l.raster as Raster, t = l.transform;
      const warp = this.smartWarpNow(l);
      if (warp) {
        // A distorted smart object warps its fresh render through its kept warp; a mask tied to its pixels is pinned
        // where it is first, since the pixels' bounds change.
        const w = this.warpedSmart(raster, this.smartMargin(stack), src, warp);
        if (!w) return false;
        const mask = l.mask && !l.mask.placement ? { ...l.mask, placement: l.transform } : l.mask;
        p.updateLayer(id, { smart: { ...l.smart, ...extra, source: src, filters: stack, warp, warpAt: w.t, filterMask: fm.filterMask, filterMaskEnabled: fm.filterMaskEnabled }, raster: w.raster, transform: w.t, mask });
        return;
      }
      // The padding grows or shrinks about the layer's centre, so the source pixels stay exactly where they were.
      const w = (t.w / old.width) * raster.width, h = (t.h / old.height) * raster.height, cx = t.x + t.w / 2, cy = t.y + t.h / 2;
      let mask = l.mask;
      if (mask?.raster && !mask.placement && (raster.width !== old.width || raster.height !== old.height)) {
        const dx = (raster.width - old.width) / 2, dy = (raster.height - old.height) / 2, nm = Raster.filled(raster.width, raster.height, '#ffffff');
        nm.ctx.clearRect(dx, dy, old.width, old.height);
        nm.ctx.drawImage(mask.raster.canvas, dx, dy);
        mask = { ...mask, raster: nm };
      }
      p.updateLayer(id, { smart: { ...l.smart, ...extra, source: src, filters: stack, filterMask: fm.filterMask, filterMaskEnabled: fm.filterMaskEnabled }, raster, transform: { ...t, x: cx - w / 2, y: cy - h / 2, w, h }, mask });
    });
  }

  private readonly contentsLinks = new WeakMap<Project, { parent: Project; layerId: ID }>();

  /** Layer > Edit Contents: the active smart object's original pixels open as their own document. Saving that document
   *  writes it back into the smart object. */
  editContents(): Project | null {
    const p = this.current, l = p?.activeLayer;
    if (!p || !l?.smart) { this.notice('Select a smart object to edit its contents.'); return null; }
    const src = l.smart.source, base: Doc = { id: uid(), width: src.width, height: src.height, resolution: p.doc.resolution, layers: [] };
    const copy = new Raster(src.width, src.height);
    copy.ctx.drawImage(src.canvas, 0, 0);
    const layer = { ...newLayer('Layer 1', base), raster: copy };
    const child = this.addProject({ ...base, layers: [layer] }, `${l.name} contents`, layer.id);
    this.contentsLinks.set(child, { parent: p, layerId: l.id });
    return child;
  }

  /** True for a document opened by Edit Contents, whether or not its smart object is still open. */
  isContents(p: Project | null): boolean { return !!p && this.contentsLinks.has(p); }

  /** The smart object a contents document writes back to, while it is still open; null otherwise. */
  contentsOf(p: Project | null): { parent: Project; layer: Layer } | null {
    const link = p ? this.contentsLinks.get(p) : undefined;
    if (!link || !this.projects.includes(link.parent)) return null;
    const layer = link.parent.layer(link.layerId);
    return layer?.smart ? { parent: link.parent, layer } : null;
  }

  /** Saving a contents document (the one in view): its flattened pixels become the smart object's new source and the
   *  filters re-run, as one undo step in the smart object's document. A new size keeps the object's scale per pixel. */
  updateContents(): boolean {
    const child = this.current;
    if (!child || !this.contentsLinks.has(child)) return false;
    const target = this.contentsOf(child);
    if (!target) { this.notice('The smart object for these contents is no longer open, so they cannot go back into it. Save As keeps them as a project of their own.'); return false; }
    this.settle();
    const flat = this.flattened();
    if (!flat) { this.notice('These contents have nothing visible to put back.'); return false; }
    const ok = this.restackSoon(target.parent, target.layer.id, Raster.from(flat, flat.width, flat.height), null, 'Update Smart Object');
    if (ok) { child.history.markSaved(); this.emit('projects', null); this.emit('history', null); }
    return ok;
  }

  private readonly timelines = new WeakMap<Project, Timeline>();

  private timelineOf(p: Project): Timeline {
    let t = this.timelines.get(p);
    if (!t) { t = { frames: [], current: null, loops: 0 }; this.timelines.set(p, t); }
    return t;
  }

  /** The current frame keeps what the layers show now, as Photoshop's does while it is selected. */
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
  newFrame(): void {
    const p = this.current;
    if (!p) return;
    const t = this.timelineOf(p);
    this.syncFrame(p);
    if (!t.frames.length) { const first: Frame = { id: uid(), delay: 100, state: captureFrame(p.doc) }; t.frames.push(first); t.current = first.id; }
    const i = Math.max(0, t.frames.findIndex((f) => f.id === t.current)), src = t.frames[i];
    const copy: Frame = { id: uid(), delay: src.delay, state: structuredClone(src.state) };
    t.frames.splice(i + 1, 0, copy);
    t.current = copy.id;
    this.emit('timeline', null);
  }

  /** Selects a frame, applying its layer states as one undo step, after the frame being left keeps its own. */
  selectFrame(id: ID): void {
    const p = this.current;
    if (!p) return;
    const t = this.timelineOf(p), f = t.frames.find((x) => x.id === id);
    if (!f) return;
    this.syncFrame(p);
    t.current = id;
    const target = frameLayers(p.doc.layers, f.state);
    this.edit('Select Frame', (q) => {
      target.forEach((l, i) => { const now = q.doc.layers[i]; if (l !== now && now?.id === l.id) q.updateLayer(l.id, { visible: l.visible, opacity: l.opacity, transform: l.transform, effects: l.effects }); });
    });
    this.emit('timeline', null);
  }

  /** Timeline > Delete Frame: removes the selected frame, or the one given, and selects its neighbour. */
  deleteFrame(id?: ID): void {
    const p = this.current;
    if (!p) return;
    const t = this.timelineOf(p), target = id ?? t.current, i = t.frames.findIndex((f) => f.id === target);
    if (i < 0) return;
    const wasCurrent = t.current === target;
    t.frames.splice(i, 1);
    if (!t.frames.length) t.current = null;
    else if (wasCurrent) { t.current = null; this.selectFrame(t.frames[Math.min(i, t.frames.length - 1)].id); }
    this.emit('timeline', null);
  }

  /** Moves frame `id` to position `to`, counted from 0, as dragging it in the Timeline does. */
  moveFrame(id: ID, to: number): void {
    const p = this.current;
    if (!p) return;
    const t = this.timelineOf(p), i = t.frames.findIndex((f) => f.id === id);
    if (i < 0) return;
    const [f] = t.frames.splice(i, 1);
    t.frames.splice(Math.max(0, Math.min(t.frames.length, Math.round(to))), 0, f);
    this.emit('timeline', null);
  }

  /** Timeline > Tween: `count` frames between frame `id` and the one after it, stepping each layer's position and
   *  opacity evenly. A layer shown in only one of the two fades, shown in the new frames with its opacity stepping from
   *  or to nothing; without opacity it keeps the first frame's visibility. New frames take the first frame's delay. */
  tween(id: ID, count: number, opts: { position: boolean; opacity: boolean; easing?: 'linear' | 'in' | 'out' | 'inOut' }): boolean {
    const p = this.current;
    if (!p) return false;
    this.syncFrame(p);
    const t = this.timelineOf(p), i = t.frames.findIndex((f) => f.id === id);
    if (i < 0 || i + 1 >= t.frames.length) { this.notice('Select a frame with another after it to tween towards.'); return false; }
    const a = t.frames[i], b = t.frames[i + 1], n = Math.min(50, Math.max(1, Math.round(count))), made: Frame[] = [];
    for (let k = 1; k <= n; k++) {
      // Easing shapes the steps: in starts slow (the square), out ends slow (its mirror), in and out does both.
      const t0 = k / (n + 1), e = opts.easing ?? 'linear';
      const u = e === 'in' ? t0 * t0 : e === 'out' ? 1 - (1 - t0) * (1 - t0) : e === 'inOut' ? (t0 < 0.5 ? 2 * t0 * t0 : 1 - 2 * (1 - t0) * (1 - t0)) : t0;
      const state: Record<ID, FrameLayer> = {};
      for (const lid of new Set([...Object.keys(a.state), ...Object.keys(b.state)])) {
        const sa = a.state[lid], sb = b.state[lid];
        if (!sa || !sb) { state[lid] = { ...(sa ?? sb) }; continue; }
        const fades = opts.opacity && sa.visible !== sb.visible, oa = sa.visible ? sa.opacity : 0, ob = sb.visible ? sb.opacity : 0;
        state[lid] = {
          fx: sa.fx,
          visible: fades ? true : sa.visible,
          opacity: !opts.opacity ? sa.opacity : fades ? oa + (ob - oa) * u : sa.opacity + (sb.opacity - sa.opacity) * u,
          x: opts.position ? sa.x + (sb.x - sa.x) * u : sa.x,
          y: opts.position ? sa.y + (sb.y - sa.y) * u : sa.y,
        };
      }
      made.push({ id: uid(), delay: a.delay, state });
    }
    t.frames.splice(i + 1, 0, ...made);
    this.emit('timeline', null);
    return true;
  }

  setFrameDelay(id: ID, ms: number): void {
    const p = this.current, f = p ? this.timelineOf(p).frames.find((x) => x.id === id) : null;
    if (!f) return;
    f.delay = Math.min(60000, Math.max(0, Math.round(ms)));
    this.emit('timeline', null);
  }

  /** How often the animation plays: 0 repeats forever. */
  setLoops(n: number): void {
    const p = this.current;
    if (!p) return;
    this.timelineOf(p).loops = Math.min(65535, Math.max(0, Math.round(n)));
    this.emit('timeline', null);
  }

  /** Frame `f` of the current document at full size, rendered without touching the layers; the document as it stands
   *  when `f` is null. */
  renderFrame(f: Frame | null): Surface | null {
    const p = this.current;
    if (!p) return null;
    return renderDoc(this.work, f ? { ...p.doc, layers: frameLayers(p.doc.layers, f.state) } : p.doc);
  }

  /** Any open document's timeline, as saving reads it, and replacing it, as opening restores it. */
  timelineFor(p: Project): Timeline { if (p === this.current) this.syncFrame(p); return this.timelineOf(p); }
  setTimelineFor(p: Project, t: Timeline): void { this.timelines.set(p, t); if (p === this.current) this.emit('timeline', null); }

  private readonly pathSets = new WeakMap<Project, PathSet>();

  private pathSet(p: Project): PathSet {
    let set = this.pathSets.get(p);
    if (!set) { set = { list: [], active: null }; this.pathSets.set(p, set); }
    return set;
  }

  private selectedPath(p: Project): NamedPath | null {
    const set = this.pathSet(p);
    if (set.active?.startsWith('shape:')) return this.shapeEntry(p)?.id === set.active ? this.shapeEntry(p) : null;
    return set.list.find((n) => n.id === set.active) ?? null;
  }

  /** The working copy of the active shape layer's path, and the layer object it matches: a copy the tools hold during
   *  a drag, rebuilt only when the layer changes some other way (a move, an undo, a recolour). */
  private shapeEdit: { project: Project; layerId: ID; layer: Layer; path: VectorPath } | null = null;
  private pathGesture: Project | null = null;

  /** The active shape layer's outline as a path entry, its working copy moved along with any move of the layer. */
  private shapeEntry(p: Project): NamedPath | null {
    const l = p.activeLayer;
    if (!l?.vector) return null;
    const e = this.shapeEdit;
    if (!e || e.project !== p || e.layerId !== l.id || e.layer !== l) {
      const dx = l.transform.x - l.vector.origin.x, dy = l.transform.y - l.vector.origin.y;
      this.shapeEdit = { project: p, layerId: l.id, layer: l, path: shiftPath(l.vector.path, dx, dy) };
    }
    return { id: `shape:${l.id}`, name: `${l.name} Shape Path`, path: (this.shapeEdit as { path: VectorPath }).path, work: false, shape: true };
  }

  /** A shape layer's pixels: its path filled with its colour, in a raster over the path's bounds. */
  private renderShape(path: VectorPath, style: ShapeStyle): { raster: Raster; x: number; y: number } | null {
    const b = pathBounds(path);
    if (!b || (!style.fill && !style.stroke)) return null;
    const pad = (style.stroke ? style.stroke.width / 2 : 0) + 1;
    const x = Math.floor(b.x - pad), y = Math.floor(b.y - pad), w = Math.min(LIMITS.side, Math.ceil(b.x + b.w + pad) - x), h = Math.min(LIMITS.side, Math.ceil(b.y + b.h + pad) - y);
    const raster = new Raster(Math.max(1, w), Math.max(1, h)), c = raster.ctx, shape = tracePath(path);
    c.translate(-x, -y);
    if (style.fill) { c.fillStyle = rgbCss(style.fill); fillVector(c, path); }
    if (style.stroke && style.stroke.width > 0) {
      // Centred on the path, with round joins and caps so corners and open ends stay smooth.
      c.strokeStyle = rgbCss(style.stroke.color);
      c.lineWidth = style.stroke.width;
      c.lineJoin = 'round';
      c.lineCap = 'round';
      c.stroke(shape);
    }
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
    const e = this.shapeEdit, now = p.layer(id);
    if (e && e.project === p && e.layerId === id && now) { e.layer = now; e.path = path; }
  }

  /** Brackets a pointer gesture on the selected path, so a gesture on a Shape Path is one undo step. */
  beginPathEdit(): void {
    const p = this.current, entry = p ? this.selectedPath(p) : null;
    if (!p || this.pathGesture || !entry) return;
    this.settle();
    // A work path's edits are undoable too (1.49.3: they never were): the step carries the paths before and after.
    this.pathGestureWork = !entry.shape;
    p.history.begin(entry.shape ? 'Edit Shape Path' : 'Edit Path', entry.shape ? p.snapshot() : { ...p.snapshot(), paths: structuredClone(this.pathSet(p)) });
    this.pathGesture = p;
  }
  private pathGestureWork = false;

  endPathEdit(): void {
    const p = this.pathGesture;
    if (!p) return;
    this.pathGesture = null;
    p.history.end(this.pathGestureWork ? { ...p.snapshot(), paths: structuredClone(this.pathSet(p)) } : p.snapshot());
    this.refresh();
  }

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
    const name = kind === 'custom' ? CUSTOM_SHAPES.find((s) => s.id === st.custom)?.label ?? 'Custom Shape' : { polygon: 'Polygon', star: 'Star', line: 'Line', arrow: 'Arrow', heart: 'Heart' }[kind];
    let n = 1;
    while (p.doc.layers.some((l) => l.name === `${name} ${n}`)) n++;
    this.insertRasterLayer(r.raster, `${name} ${n}`, r.x, r.y, { vector: { path, fill: look.fill, stroke: null, origin: { x: r.x, y: r.y } } }, `New ${name}`);
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

  private pathsChanged(p: Project): void {
    if (p === this.current) { this.emit('overlay', null); this.emit('options', null); }
    this.emit('paths', null);
  }

  /** The current document's paths, the Work Path among them, and which one is selected. Paths live with the document
   *  and save with the project, outside undo, as in Photoshop. */
  get paths(): PathSet {
    const p = this.current;
    if (!p) return { list: [], active: null };
    const set = this.pathSet(p), shape = this.shapeEntry(p);
    return shape ? { list: [shape, ...set.list], active: set.active } : set;
  }

  /** The selected path, which the Pen, Direct Selection and the path commands work on; null when none is selected. */
  get workPath(): VectorPath | null { const p = this.current; return p ? this.selectedPath(p)?.path ?? null : null; }

  /** Sets the selected path's points. With none selected, a new Work Path takes them, replacing the old one; a Work
   *  Path left with no points goes away, while a named path stays, empty. */
  setWorkPath(vp: VectorPath | null): void {
    const p = this.current;
    if (!p) return;
    const set = this.pathSet(p), entry = this.selectedPath(p), has = !!vp && vp.subpaths.some((sp) => sp.anchors.length);
    if (entry?.shape) {
      // Reshaping a shape layer: live within a gesture's undo step, or one step of its own from the keyboard.
      const l = p.activeLayer;
      if (l?.vector && vp && has) {
        (this.shapeEdit as { path: VectorPath }).path = vp;
        if (this.pathGesture === p) this.reshape(p, l.id, vp);
        else this.edit('Edit Shape Path', (q) => this.reshape(q, l.id, vp));
        this.refresh();
      }
      this.pathsChanged(p);
      return;
    }
    if (entry) {
      if (entry.work && !has) { set.list = set.list.filter((n) => n !== entry); set.active = null; }
      else entry.path = vp ?? { subpaths: [] };
    } else if (vp && has) {
      const work: NamedPath = { id: uid(), name: 'Work Path', path: vp, work: true };
      set.list = [work, ...set.list.filter((n) => !n.work)];
      set.active = work.id;
    }
    this.pathsChanged(p);
  }

  /** Selects a path by id, or none, so the next Pen drawing starts a new Work Path. */
  selectPath(id: ID | null): void {
    const p = this.current;
    if (!p) return;
    const set = this.pathSet(p);
    set.active = id && (set.list.some((n) => n.id === id) || this.shapeEntry(p)?.id === id) ? id : null;
    this.pathsChanged(p);
  }

  private nextPathName(set: PathSet): string { let i = 1; while (set.list.some((n) => n.name === `Path ${i}`)) i++; return `Path ${i}`; }

  /** Paths > New Path: an empty named path, selected, for the Pen to draw into. */
  newPath(): void {
    const p = this.current;
    if (!p) return;
    const set = this.pathSet(p), n: NamedPath = { id: uid(), name: this.nextPathName(set), path: { subpaths: [] }, work: false };
    set.list.push(n);
    set.active = n.id;
    this.pathsChanged(p);
  }

  /** Renames a path; naming the Work Path saves it, so it stays when a new one is drawn. */
  renamePath(id: ID, name: string): void {
    const p = this.current, n = p ? this.pathSet(p).list.find((x) => x.id === id) : null;
    if (!p || !n) return;
    n.name = name.trim().slice(0, 80) || this.nextPathName(this.pathSet(p));
    n.work = false;
    this.pathsChanged(p);
  }

  /** Paths > Delete Path: removes the selected path, or the one given. */
  deletePath(id?: ID): void {
    const p = this.current;
    if (!p) return;
    const set = this.pathSet(p), target = id ?? set.active;
    if (!target) return;
    set.list = set.list.filter((n) => n.id !== target);
    if (set.active === target) set.active = null;
    this.pathsChanged(p);
  }

  /** Any open document's paths, as saving reads them. */
  pathsOf(p: Project): PathSet { return this.pathSet(p); }

  /** Replaces an open document's paths, as opening a project restores them. */
  setPathsOf(p: Project, set: PathSet): void {
    this.pathSets.set(p, { list: set.list, active: set.list.some((n) => n.id === set.active) ? set.active : null });
    this.pathsChanged(p);
  }

  /** Select > Make Selection from Path: the path's inside, by the non-zero winding rule, becomes the selection. */
  pathToSelection(): void {
    const p = this.current, vp = this.workPath, b = vp ? pathBounds(vp) : null;
    if (!p || !vp || !b) { this.notice('Draw a path with the Pen tool first.'); return; }
    const mask = SelectionMask.fromPath(p.doc.width, p.doc.height, b, (c) => fillVector(c as CanvasRenderingContext2D, vp), true);
    if (!mask) { this.notice('The path lies outside the canvas.'); return; }
    this.applySelection(mask, 'replace', 'Make Selection');
  }

  /** Edit > Fill Path: the path's inside painted into the active layer in the foreground colour, within any selection. */
  fillPath(): void { this.paintPath('Fill Path', (c, _shape, vp) => { c.fillStyle = rgbCss(this.fg); fillVector(c as CanvasRenderingContext2D, vp); }); }

  /** Edit > Stroke Path: the path traced in the foreground colour as wide as the brush, within any selection. */
  strokePath(): void {
    this.paintPath('Stroke Path', (c, shape) => {
      c.strokeStyle = rgbCss(this.fg);
      c.lineWidth = Math.max(1, this.brush.diameter);
      c.lineJoin = 'round';
      c.lineCap = 'round';
      c.stroke(shape);
    });
  }

  /** Stroke Path with its settings, as Photoshop's dialog has them: each subpath stroked with `tool` at its current
   *  settings, following the curves; Simulate Pressure runs the pressure from nothing at each end to full in the middle
   *  (thin, thick, thin), and when the brush's size does not follow pressure it does so for this stroke. One step. */
  strokePathWith(tool: StrokeTool, simulatePressure: boolean): void {
    const p = this.current, vp = this.workPath;
    if (!p || !vp || !pathBounds(vp)) { this.notice('Draw a path with the Pen tool first.'); return; }
    if (!this.paintable(p.activeLayer)) { this.notice('Select a pixel layer to stroke on.'); return; }
    const runs = vp.subpaths.map((sp) => samplePath(sp, 2)).filter((pts) => pts.length > 1);
    if (!runs.length) return;
    const brush = tool === 'brush' || tool === 'eraser', savedDyn = this.brushDynamics, savedMode = this.brushMode;
    if (brush) {
      this.brushMode = tool === 'eraser' ? 'erase' : 'paint';
      if (simulatePressure && !this.brushDynamics.size.enabled) this.brushDynamics = { ...savedDyn, size: pressureOption(0.02) };
    }
    const kind = ({ clone: 'clone', healBrush: 'healBrush', spotHealing: 'heal', dodge: 'dodge', burn: 'burn', sponge: 'sponge', blur: 'blur', sharpen: 'sharpen' } as const)[tool as Exclude<StrokeTool, 'brush' | 'eraser'>];
    p.history.begin('Stroke Path', p.snapshot());
    try {
      for (const pts of runs) {
        const pressure = (i: number): number => (simulatePressure ? Math.max(0.01, Math.sin((Math.PI * i) / (pts.length - 1))) : 1);
        const ok = brush ? this.beginStroke(pts[0], false, pressure(0)) : this.beginRetouchStroke(kind, pts[0], false);
        if (!ok) break;
        for (let i = 1; i < pts.length; i++) this.strokeTo(pts[i], pressure(i));
        this.endStroke();
      }
    } finally {
      this.brushDynamics = savedDyn;
      this.brushMode = savedMode;
      p.history.end(p.snapshot());
    }
    this.refresh();
  }

  private paintPath(name: string, paint: (c: Ctx2D, shape: Path2D, vp: VectorPath) => void): void {
    const vp = this.workPath;
    if (!vp || !pathBounds(vp)) { this.notice('Draw a path with the Pen tool first.'); return; }
    const shape = tracePath(vp);
    this.regionEdit(name, ({ raster, target, rect, cover }) => {
      const p = this.current as Project, l = p.activeLayer as Layer;
      const t = target === 'mask' ? l.mask?.placement ?? l.transform : l.transform;
      const s = createSurface(rect.w, rect.h), c = ctxOf(s);
      setMat(c, mul(translation(-rect.x, -rect.y), invert(placement(t, raster.width, raster.height))));
      paint(c, shape, vp);
      if (cover) {
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.globalCompositeOperation = 'destination-in';
        c.drawImage(cover, 0, 0);
      }
      const r = raster.ctx;
      r.save();
      r.setTransform(1, 0, 0, 1, 0, 0);
      r.drawImage(s, rect.x, rect.y);
      r.restore();
    });
  }

  private styleClipboard: LayerEffects | null = null;

  get canPasteLayerStyle(): boolean { return !!this.styleClipboard; }

  /** Copy Layer Style: remembers the active layer's effects for Paste Layer Style. */
  copyLayerStyle(): void {
    const l = this.current?.activeLayer;
    if (!l || !effectsActive(l.effects)) { this.notice('This layer has no layer style to copy.'); return; }
    this.styleClipboard = structuredClone(l.effects);
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
    const st = this.stroke;
    if (st && st.project === p) m.set(st.layerId, st.target === 'pixels' ? { source: st.s.working } : { maskSource: st.s.working });
    const te = this.transformEdit;
    if (te && te.project === p) {
      if (te.group) for (const [id, orig] of te.group.originals) m.set(id, { ...(m.get(id) ?? {}), transform: following(orig, te.group.box, te.draft) });
      else m.set(te.layerId, { ...(m.get(te.layerId) ?? {}), ...(te.mask ? { maskPlacement: te.draft } : { transform: te.draft }) });
    }
    const dz = this.distortEdit;
    if (dz && dz.project === p) {
      for (const [id, pv] of dz.previews) {
        if (!pv.pixels) continue;
        const mk = pv.mask;
        m.set(id, { ...(m.get(id) ?? {}), source: pv.pixels.raster.canvas, transform: pv.pixels.t,
          ...(mk?.warped ? { maskSource: mk.warped.raster.canvas } : {}), ...(mk?.placement ? { maskPlacement: mk.placement } : {}) });
      }
    }
    const pv = this.preview;
    const mw = this.meshWarpEdit;
    if (mw && mw.project === p && mw.preview) m.set(mw.layerId, { ...(m.get(mw.layerId) ?? {}), source: mw.preview.raster.canvas, transform: mw.preview.t });
    const pw = this.puppetEdit;
    if (pw && pw.project === p && pw.preview) m.set(pw.layerId, { ...(m.get(pw.layerId) ?? {}), source: pw.preview.raster.canvas, transform: pw.preview.t });
    if (pv && pv.project === p) m.set(pv.layerId, { ...(m.get(pv.layerId) ?? {}), ...(pv.target === 'pixels' ? { source: pv.surface } : { maskSource: pv.surface }), ...(pv.transform ? { transform: pv.transform } : {}) });
    const gr = this.gradient;
    if (gr && gr.project === p) m.set(gr.layerId, { ...(m.get(gr.layerId) ?? {}), ...(gr.target === 'pixels' ? { source: gr.surface } : { maskSource: gr.surface }) });
    const wp = this.warpState;
    if (wp && wp.project === p) m.set(wp.layerId, { ...(m.get(wp.layerId) ?? {}), source: wp.surface, transform: docTransform(p.doc.width, p.doc.height) });
    const tx = this.textEditing;
    if (tx && tx.project === p) m.set(tx.layerId, { ...(m.get(tx.layerId) ?? {}), hidden: true });
    const ep = this.effectPreview;
    if (ep && ep.project === p) m.set(ep.layerId, { ...(m.get(ep.layerId) ?? {}), effects: ep.effects });
    const fl = this.floating;
    if (fl && fl.project === p) m.set(fl.layerId, { ...(m.get(fl.layerId) ?? {}), source: fl.work });
    const fs = this.floatSel;
    if (fs && fs.project === p) m.set(fs.sourceId, { ...(m.get(fs.sourceId) ?? {}), source: fs.base });
    return m.size ? m : undefined;
  }

  selectLayer(id: ID, how: 'replace' | 'toggle' | 'range' = 'replace'): void {
    const p = this.current;
    if (!p || this.stroke || !p.layer(id)) return;
    this.settle();
    if (how === 'toggle') {
      const s = new Set(p.selectedIds);
      if (s.has(id) && s.size > 1) { s.delete(id); if (p.activeId === id) p.activeId = [...s][s.size - 1]; }
      else { s.add(id); p.activeId = id; }
      p.selectedIds = s;
    } else if (how === 'range' && p.activeId) {
      const order = hierarchy(p.doc, true, p.collapsed).map((e) => e.layer.id);
      const a = order.indexOf(p.activeId), b = order.indexOf(id);
      if (a >= 0 && b >= 0) p.selectedIds = new Set(order.slice(Math.min(a, b), Math.max(a, b) + 1));
      p.activeId = id;
    } else {
      p.activeId = id;
      p.selectedIds = new Set([id]);
    }
    p.maskTarget = false;
    this.emit('active', null);
    this.emit('options', null);
    this.emit('overlay', null);
  }

  setMaskTarget(on: boolean): void {
    const p = this.current;
    if (!p) return;
    const next = on && !!p.activeLayer?.mask;
    if (p.maskTarget === next) return;
    p.maskTarget = next;
    this.emit('active', null);
  }

  toggleCollapsed(id: ID): void {
    const p = this.current;
    if (!p) return;
    if (p.collapsed.has(id)) p.collapsed.delete(id);
    else p.collapsed.add(id);
    this.emit('doc', null);
  }

  private selectedRoots(p: Project): ID[] {
    const map = byId(p.doc);
    const sel = [...p.selectedIds].filter((id) => map.has(id));
    const roots = new Set(sel.filter((id) => !sel.some((o) => o !== id && isDescendant(map, id, o))));
    return p.doc.layers.filter((l) => roots.has(l.id)).map((l) => l.id);
  }

  private normalizeClips(layers: Layer[]): Layer[] {
    const out = [...layers];
    const lastBase = new Map<ID | null, Layer | null>();
    for (let i = 0; i < out.length; i++) {
      const l = out[i];
      if (l.clipId) {
        const base = lastBase.get(l.parentId) ?? null;
        if (!base || base.id !== l.clipId) {
          out[i] = { ...l, clipId: null };
          lastBase.set(l.parentId, l.isGroup || l.adjustment ? null : out[i]);
        }
      } else lastBase.set(l.parentId, l.isGroup || l.adjustment ? null : l);
    }
    return out;
  }

  private cloneLayer(l: Layer, patch: Partial<Layer> = {}): Layer {
    return { ...l, raster: l.raster ? l.raster.clone() : null, mask: l.mask ? { ...l.mask, raster: l.mask.raster ? l.mask.raster.clone() : null } : null, ...patch, id: uid() };
  }

  /** Layer > New > Layer; the New Layer dialog passes its name, blending mode, opacity and whether to clip the new layer
   *  to the one below (Use Previous Layer to Create Clipping Mask). One step either way. */
  addLayer(opts: { name?: string; blend?: BlendMode; opacity?: number; clip?: boolean } = {}): void {
    this.edit('New Layer', (p) => {
      const names = new Set(p.doc.layers.map((l) => l.name));
      let n = 1;
      while (names.has(`Layer ${n}`)) n += 1;
      const active = p.activeLayer;
      const parentId = active?.isGroup ? active.id : active?.parentId ?? null;
      const name = opts.name?.trim().slice(0, 200) || `Layer ${n}`;
      // Clipped to the layer below it: that layer's own base when it is already clipped, else that layer.
      const clipId = opts.clip && active && !active.isGroup ? active.clipId ?? active.id : null;
      const layer = newLayer(name, p.doc, { parentId, clipId, ...(opts.blend ? { blend: opts.blend } : {}), ...(opts.opacity !== undefined ? { opacity: clamp(opts.opacity, 0, 1) } : {}) });
      const layers = [...p.doc.layers];
      let index = active ? layers.indexOf(active) + 1 : layers.length;
      if (active?.isGroup) layers.forEach((l, i) => { if (l.parentId === active.id) index = Math.max(index, i + 1); });
      layers.splice(index, 0, layer);
      p.setLayers(layers);
      if (parentId) p.collapsed.delete(parentId);
      this.focus(p, layer.id);
    });
  }

  /** Layer > New > Group; the New Group dialog passes a name. One step. */
  addFolder(name?: string): void {
    this.edit('New Folder', (p) => {
      const names = new Set(p.doc.layers.map((l) => l.name));
      let n = 1;
      while (names.has(`Folder ${n}`)) n += 1;
      const active = p.activeLayer;
      const group = newLayer(name?.trim().slice(0, 200) || `Folder ${n}`, p.doc, { isGroup: true, parentId: active?.parentId ?? null });
      const layers = [...p.doc.layers];
      layers.splice(active ? layers.indexOf(active) + 1 : layers.length, 0, group);
      p.setLayers(layers);
      this.focus(p, group.id);
    });
  }

  /** The document's artboards, top to bottom as the Layers panel lists them. */
  artboards(p: Project | null = this.current): Layer[] {
    return p ? p.doc.layers.filter((l) => l.isGroup && !l.parentId && l.artboard).reverse() : [];
  }

  /** Layer > New > Artboard: the whole canvas when there is none yet; otherwise the last one's size, 100 px to the
   *  right of the rightmost, the canvas widened to hold it as Photoshop's grows. White by default. One step. */
  newArtboard(rect: { x: number; y: number; w: number; h: number } | null = null, background: RGB | null = { r: 255, g: 255, b: 255 }): ID | null {
    const p = this.current;
    if (!p) return null;
    const existing = this.artboards(p).map((l) => l.artboard as Artboard);
    let r = rect;
    if (!r) {
      if (!existing.length) r = { x: 0, y: 0, w: p.doc.width, h: p.doc.height };
      else {
        const last = existing[0], right = Math.max(...existing.map((a) => a.x + a.w));
        r = { x: right + 100, y: last.y, w: last.w, h: last.h };
      }
    }
    const want = { w: Math.max(p.doc.width, r.x + r.w), h: Math.max(p.doc.height, r.y + r.h) };
    let created: ID | null = null;
    this.edit('New Artboard', (q) => {
      if (want.w !== q.doc.width || want.h !== q.doc.height) {
        if (!this.sizeOk(want.w, want.h)) return false;
        q.doc = { ...q.doc, width: want.w, height: want.h };
      }
      const names = new Set(q.doc.layers.map((l) => l.name));
      let n = 1;
      while (names.has(`Artboard ${n}`)) n += 1;
      const board = newLayer(`Artboard ${n}`, q.doc, { isGroup: true, parentId: null, artboard: { ...(r as Rect), background } });
      q.setLayers([...q.doc.layers, board]);
      this.focus(q, board.id);
      created = board.id;
      return true;
    });
    if (created) this.fit();
    return created;
  }

  /** Layer > New > Artboard from Layers: the selected top-level layers moved into a new artboard fitted to their
   *  visible pixels, transparent behind them. One step. */
  artboardFromLayers(): ID | null {
    const p = this.current;
    if (!p) return null;
    const roots = this.selectedRoots(p).filter((id) => { const l = p.layer(id); return !!l && !l.parentId && !l.artboard; });
    const boxes = this.alignItems(p).filter((it) => it.ids.some((id) => roots.includes(id))).map((it) => it.box);
    if (!roots.length || !boxes.length) { this.notice('Select layers outside any folder or artboard, with pixels, first.'); return null; }
    const b = integral(boxes.reduce((a, c) => unionRect(a, c)));
    let created: ID | null = null;
    this.edit('Artboard from Layers', (q) => {
      const names = new Set(q.doc.layers.map((l) => l.name));
      let n = 1;
      while (names.has(`Artboard ${n}`)) n += 1;
      const board = newLayer(`Artboard ${n}`, q.doc, { isGroup: true, parentId: null, artboard: { x: b.x, y: b.y, w: Math.max(1, b.w), h: Math.max(1, b.h), background: null } });
      const at = Math.max(...roots.map((id) => q.doc.layers.findIndex((l) => l.id === id))) + 1;
      const layers = q.doc.layers.map((l) => (roots.includes(l.id) ? { ...l, parentId: board.id } : l));
      layers.splice(at, 0, board);
      q.setLayers(this.normalizeClips(layers));
      this.focus(q, board.id);
      created = board.id;
      return true;
    });
    return created;
  }

  /** Artboard Options: its rectangle and background, checked, as one step. */
  setArtboard(id: ID, patch: Partial<Artboard>): boolean {
    return this.edit('Artboard Options', (p) => {
      const l = p.layer(id);
      if (!l?.artboard) return false;
      const next = artboardFromData({ ...l.artboard, ...patch });
      if (!next || JSON.stringify(next) === JSON.stringify(l.artboard)) return false;
      p.updateLayer(id, { artboard: next });
      return true;
    });
  }

  /** Layer > Duplicate Layer; the dialog passes a name, used when one layer or folder is duplicated. One step. */
  duplicateLayers(name?: string): void {
    this.edit('Duplicate Layer', (p) => {
      const roots = this.selectedRoots(p);
      if (!roots.length) return false;
      const given = roots.length === 1 ? name?.trim().slice(0, 200) : undefined;
      let layers = [...p.doc.layers];
      let last: ID | null = null;
      for (const id of roots) {
        const src = layers.find((l) => l.id === id);
        if (!src) continue;
        const subtree = [src, ...descendantIds(layers, id).map((d) => layers.find((l) => l.id === d) as Layer)];
        const idMap = new Map<ID, ID>();
        const clones = subtree.map((l) => { const c = this.cloneLayer(l, l === src ? { name: given || `${l.name} copy` } : {}); idMap.set(l.id, c.id); return c; });
        const fixed = clones.map((c) => ({ ...c, parentId: c.parentId && idMap.has(c.parentId) ? (idMap.get(c.parentId) as ID) : c.parentId, clipId: c.clipId && idMap.has(c.clipId) ? (idMap.get(c.clipId) as ID) : c.clipId }));
        layers.splice(layers.indexOf(src) + 1, 0, ...fixed);
        last = fixed[0].id;
      }
      layers = this.normalizeClips(layers);
      p.setLayers(layers);
      this.focus(p, last);
    });
  }

  /** the live masks: layers that stay but are clipped to a layer being deleted. Deleting their base asks
   *  whether to bake their masked look into their pixels or remove the links; `deleteLayers(true)` bakes. */
  liveMaskDependents(): ID[] {
    const p = this.current;
    if (!p || (p.maskTarget && p.activeLayer?.mask && p.selectedIds.size <= 1)) return [];
    const doomed = this.doomedBy(p);
    return p.doc.layers.filter((l) => !doomed.has(l.id) && !!l.clipId && doomed.has(l.clipId)).map((l) => l.id);
  }

  private doomedBy(p: Project): Set<ID> {
    const doomed = new Set<ID>();
    for (const id of this.selectedRoots(p)) { doomed.add(id); for (const d of descendantIds(p.doc.layers, id)) doomed.add(d); }
    return doomed;
  }

  deleteLayers(bake = false): void {
    const p0 = this.current;
    if (!p0) return;
    if (p0.maskTarget && p0.activeLayer?.mask && p0.selectedIds.size <= 1) { this.deleteMask(false); return; }
    this.edit('Delete Layer', (p) => {
      const roots = this.selectedRoots(p);
      if (!roots.length) return false;
      const doomed = this.doomedBy(p);
      const order = hierarchy(p.doc, true).map((e) => e.layer.id);
      const first = Math.min(...roots.map((id) => order.indexOf(id)));
      // the Bake and Delete: a layer clipped to a deleted base keeps its current masked look in its own
      // pixels, through the same coverage the renderer clips it with; adjustments and folders just unlink.
      const baked = new Map<ID, Raster>();
      if (bake) {
        for (const l of p.doc.layers) {
          if (doomed.has(l.id) || !l.clipId || !doomed.has(l.clipId) || !l.raster || l.adjustment || l.isGroup) continue;
          const cov = this.work.clipCoverageOf(p.doc, l.clipId), r = l.raster.clone(), c = r.ctx;
          c.save();
          if (cov) {
            setMat(c, invert(placement(l.transform, r.width, r.height)));
            c.globalCompositeOperation = 'destination-in';
            c.drawImage(cov, 0, 0);
          } else c.clearRect(0, 0, r.width, r.height);
          c.restore();
          r.touch();
          baked.set(l.id, r);
        }
      }
      const kept = p.doc.layers.filter((l) => !doomed.has(l.id)).map((l) => (l.clipId && doomed.has(l.clipId) ? { ...l, clipId: null, ...(baked.has(l.id) ? { raster: baked.get(l.id) as Raster } : {}) } : l));
      p.setLayers(this.normalizeClips(kept));
      const remaining = order.filter((id) => !doomed.has(id));
      this.focus(p, remaining[Math.min(Math.max(0, first), remaining.length - 1)] ?? null);
    });
  }

  renameLayer(id: ID, name: string): void {
    const clean = name.trim().slice(0, 200);
    if (!clean || this.current?.layer(id)?.name === clean) return;
    this.edit('Rename Layer', (p) => { if (!p.layer(id)) return false; p.updateLayer(id, { name: clean }); });
  }

  toggleVisibility(id: ID): void {
    const l = this.current?.layer(id);
    if (!l) return;
    this.edit(l.visible ? 'Hide Layer' : 'Show Layer', (p) => { p.updateLayer(id, { visible: !l.visible }); });
  }

  beginVisibilitySwipe(id: ID): boolean | null {
    const p = this.current;
    const l = p?.layer(id);
    if (!p || !l || this.stroke) return null;
    this.settle();
    const v = !l.visible;
    p.history.begin(v ? 'Show Layer' : 'Hide Layer', p.snapshot());
    this.swipeOpen = p;
    p.updateLayer(id, { visible: v });
    this.emit('doc', null);
    this.emit('render', null);
    return v;
  }

  swipeVisibility(id: ID, visible: boolean): void {
    const p = this.swipeOpen;
    const l = p?.layer(id);
    if (!p || !l || l.visible === visible) return;
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
    for (const id of p.selectedIds) { const l = p.layer(id); if (l && !l.isGroup && l.opacity !== v) p.updateLayer(id, { opacity: v }); }
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

  setBlend(mode: BlendMode): void {
    this.edit('Layer Blend Mode', (p) => {
      let changed = false;
      for (const id of p.selectedIds) { const l = p.layer(id); if (l && !l.isGroup && l.blend !== mode) { p.updateLayer(id, { blend: mode }); changed = true; } }
      return changed;
    });
  }

  cycleBlend(forward: boolean): void {
    const l = this.activeLayer;
    if (!l || l.isGroup) return;
    const i = BLEND_MODES.findIndex((b) => b.id === l.blend), n = BLEND_MODES.length;
    this.setBlend(BLEND_MODES[(i + (forward ? 1 : n - 1)) % n].id);
  }

  moveLayers(ids: ID[], targetId: ID, where: 'above' | 'below' | 'inside', duplicate = false): void {
    this.edit(duplicate ? 'Duplicate Layers' : 'Move Layers', (p) => {
      const map = byId(p.doc);
      const target = map.get(targetId);
      if (!target || (where === 'inside' && !target.isGroup)) return false;
      const moving = p.doc.layers.filter((l) => ids.includes(l.id) && !ids.some((o) => o !== l.id && isDescendant(map, l.id, o)));
      if (!moving.length || moving.some((l) => l.id === targetId)) return false;
      const parentId = where === 'inside' ? target.id : target.parentId;
      if (parentId && moving.some((l) => l.id === parentId || isDescendant(map, parentId, l.id))) return false;
      let layers: Layer[];
      let records: Layer[];
      if (duplicate) {
        layers = [...p.doc.layers];
        records = moving.filter((l) => !l.isGroup).map((l) => this.cloneLayer(l, { name: `${l.name} copy`, parentId }));
      } else {
        layers = p.doc.layers.filter((l) => !moving.includes(l));
        records = moving.map((l) => ({ ...l, parentId }));
      }
      if (!records.length) return false;
      let index: number;
      if (where === 'inside') {
        index = layers.indexOf(target) + 1;
        layers.forEach((l, i) => { if (l.parentId === target.id) index = Math.max(index, i + 1); });
        p.collapsed.delete(target.id);
      } else {
        const ti = layers.indexOf(target);
        if (ti < 0) return false;
        index = where === 'above' ? ti + 1 : ti;
      }
      layers.splice(index, 0, ...records);
      const next = this.normalizeClips(layers);
      const prev = p.doc.layers;
      if (!duplicate && next.length === prev.length && next.every((l, i) => l.id === prev[i].id && l.parentId === prev[i].parentId && l.clipId === prev[i].clipId)) return false;
      p.setLayers(next);
      if (duplicate) this.focus(p, records[records.length - 1].id);
    });
  }

  moveActive(by: 1 | -1): void {
    this.edit('Reorder Layers', (p) => {
      const l = p.activeLayer;
      if (!l) return false;
      const sibs = p.doc.layers.filter((x) => x.parentId === l.parentId);
      const other = sibs[sibs.indexOf(l) + by];
      if (!other) return false;
      const layers = [...p.doc.layers];
      const a = layers.indexOf(l), b = layers.indexOf(other);
      layers[a] = other;
      layers[b] = l;
      p.setLayers(this.normalizeClips(layers));
    });
  }

  groupLayers(): void {
    this.edit('Group Layers', (p) => {
      const map = byId(p.doc);
      const roots = this.selectedRoots(p);
      if (!roots.length) return false;
      const chains = roots.map((id) => [...ancestors(map, map.get(id) as Layer).map((a) => a.id), null] as Array<ID | null>);
      const common = chains[0].find((c) => chains.every((ch) => ch.includes(c))) ?? null;
      const names = new Set(p.doc.layers.map((l) => l.name));
      let n = 1;
      while (names.has(`Folder ${n}`)) n += 1;
      const group = newLayer(`Folder ${n}`, p.doc, { isGroup: true, parentId: common });
      const branchIndex = (id: ID): number => {
        let b = map.get(id) as Layer;
        while (b.parentId !== common && b.parentId) b = map.get(b.parentId) as Layer;
        return p.doc.layers.indexOf(b);
      };
      const at = Math.max(...roots.map(branchIndex)) + 1;
      const layers = p.doc.layers.map((l) => (roots.includes(l.id) ? { ...l, parentId: group.id } : l));
      layers.splice(at, 0, group);
      p.setLayers(this.normalizeClips(layers));
      this.focus(p, group.id);
    });
  }

  moveOutOfFolder(): void {
    this.edit('Move Out of Folder', (p) => {
      const l = p.activeLayer;
      if (!l?.parentId) return false;
      const g = p.layer(l.parentId);
      if (!g) return false;
      const layers = p.doc.layers.filter((x) => x.id !== l.id);
      layers.splice(layers.indexOf(g) + 1, 0, { ...l, parentId: g.parentId });
      p.setLayers(this.normalizeClips(layers));
    });
  }

  /** the Option-drag from a mask thumbnail: a copy of the source's mask on the target, sitting where it sits
   *  on the document and replacing any mask the target had, as one step; the target becomes active with its mask
   *  targeted. The raster is copied, so painting one mask never changes the other. */
  copyMask(source: ID, target: ID): void {
    const p = this.current, to = p?.layer(target);
    if (!p || !to || to.isGroup || source === target) return;
    this.edit(to.mask ? 'Replace Layer Mask' : 'Copy Layer Mask', (q) => {
      const from = q.layer(source), dest = q.layer(target);
      const m = from?.mask;
      if (!from || !m || !dest || dest.isGroup) return false;
      q.updateLayer(target, { mask: { ...m, raster: m.raster ? Raster.from(m.raster.canvas, m.raster.width, m.raster.height) : null, placement: m.placement ?? from.transform } });
      this.focus(q, target);
      q.maskTarget = true;
      return true;
    });
  }

  /** the copyLayer(into:): a layer, with a folder's contents, copied into another open project as one Copy
   *  Layers from Project step there: new ids, cloned pixels, parent and clip links kept inside the copy and dropped
   *  outside it, centered on the target canvas, on top of its stack; the target becomes current. Refused past
   *  the 100-megapixel budget for the target. */
  copyLayerToProject(id: ID, targetKey: string): boolean {
    const src = this.projects.find((q) => !!q.layer(id)), dst = this.projects.find((q) => q.id === targetKey);
    const head = src?.layer(id);
    if (!src || !dst || !head || src === dst || this.stroke) return false;
    this.settle();
    const included = new Set<ID>([id]);
    for (let grew = true; grew;) {
      grew = false;
      for (const l of src.doc.layers) if (l.parentId && included.has(l.parentId) && !included.has(l.id)) { included.add(l.id); grew = true; }
    }
    const copied = src.doc.layers.filter((l) => included.has(l.id));
    const pixels = (ls: readonly Layer[]): number => ls.reduce((n, l) => n + (l.raster ? l.raster.width * l.raster.height : 0), 0);
    if (pixels(dst.doc.layers) + pixels(copied) > 100_000_000) { this.notice("The copied layers exceed this project's 100-megapixel limit."); return false; }
    const dx = dst.doc.width / 2 - (head.transform.x + head.transform.w / 2), dy = dst.doc.height / 2 - (head.transform.y + head.transform.h / 2);
    const ids = new Map(copied.map((l) => [l.id, uid()]));
    const layers: Layer[] = copied.map((l) => ({
      ...l,
      id: ids.get(l.id) as ID,
      parentId: l.parentId ? ids.get(l.parentId) ?? null : null,
      clipId: l.clipId ? ids.get(l.clipId) ?? null : null,
      transform: { ...l.transform, x: l.transform.x + dx, y: l.transform.y + dy },
      raster: l.raster ? l.raster.clone() : null,
      mask: l.mask ? { ...l.mask, raster: l.mask.raster ? l.mask.raster.clone() : null, placement: l.mask.placement ? { ...l.mask.placement, x: l.mask.placement.x + dx, y: l.mask.placement.y + dy } : null } : null,
    }));
    this.switchTo(dst.id);
    this.edit('Copy Layers from Project', (p) => {
      p.setLayers([...p.doc.layers, ...layers]);
      this.focus(p, ids.get(id) as ID);
      return true;
    });
    return true;
  }

  toggleClip(id?: ID): void {
    this.edit('Clipping Mask', (p) => {
      const l = p.layer(id ?? p.activeId ?? '');
      if (!l || l.isGroup) return false;
      if (l.clipId) { p.updateLayer(l.id, { clipId: null }); p.setLayers(this.normalizeClips([...p.doc.layers])); return true; }
      const sibs = p.doc.layers.filter((x) => x.parentId === l.parentId);
      let j = sibs.indexOf(l) - 1;
      while (j >= 0 && sibs[j].clipId) j -= 1;
      const base = sibs[j];
      if (!base || base.isGroup || base.adjustment) { this.notice('A clipping mask needs a pixel layer directly below.'); return false; }
      p.updateLayer(l.id, { clipId: base.id });
      return true;
    });
  }

  mergeLayers(): void {
    const p0 = this.current;
    const active = p0?.activeLayer;
    if (!p0 || !active) return;
    let ids: ID[];
    let remove: Set<ID>;
    let anchor: Layer;
    let title: string;
    if (p0.selectedIds.size > 1) {
      const roots = this.selectedRoots(p0);
      remove = new Set<ID>();
      for (const id of roots) { remove.add(id); for (const d of descendantIds(p0.doc.layers, id)) remove.add(d); }
      ids = [...remove];
      anchor = p0.doc.layers.filter((l) => roots.includes(l.id)).pop() as Layer;
      title = 'Merge Layers';
    } else if (active.isGroup) {
      ids = descendantIds(p0.doc.layers, active.id);
      remove = new Set([active.id, ...ids]);
      anchor = active;
      title = 'Merge Group';
    } else {
      const sibs = p0.doc.layers.filter((l) => l.parentId === active.parentId);
      const below = sibs[sibs.indexOf(active) - 1];
      if (!below || below.isGroup) { this.notice('Merge Down needs a layer directly below.'); return; }
      ids = [below.id, active.id];
      remove = new Set(ids);
      anchor = below;
      title = 'Merge Down';
    }
    this.edit(title, (p) => {
      const set = new Set(ids);
      let b: Rect | null = null;
      for (const l of p.doc.layers) if (set.has(l.id) && l.raster && !l.isGroup) b = unionRect(b, transformBounds(l.transform));
      if (!b) return false;
      let r = integral(b);
      if (r.w > LIMITS.side || r.h > LIMITS.side || r.w * r.h > LIMITS.pixels) r = intersectRect(r, { x: 0, y: 0, w: p.doc.width, h: p.doc.height }) ?? r;
      const s = createSurface(r.w, r.h);
      this.work.render({ doc: p.doc, target: s, view: translation(-r.x, -r.y), only: set, quality: 'high', ignoreFolderMasks: true });
      const merged = newLayer(anchor.name, p.doc, { raster: Raster.from(s, r.w, r.h), parentId: anchor.parentId, transform: { ...docTransform(r.w, r.h), x: r.x, y: r.y } });
      const next: Layer[] = [];
      for (const l of p.doc.layers) { if (l.id === anchor.id) next.push(merged); if (!remove.has(l.id)) next.push(l); }
      p.setLayers(this.normalizeClips(next));
      this.focus(p, merged.id);
    });
  }

  /** Select and Mask's OK: the refined selection (`data`, 0 to 255 over the whole canvas) sent to Photoshop's outputs:
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
      // Decontaminate Colors, on a new layer's own pixels (as Photoshop, only for output to a new layer): the refined
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

  addMask(hide = false): void {
    this.edit(hide ? 'Add Mask Hiding All' : 'Add Layer Mask', (p) => {
      const l = p.activeLayer;
      if (!l || l.mask) return false;
      const w = l.raster?.width ?? Math.max(1, Math.round(l.transform.w)), h = l.raster?.height ?? Math.max(1, Math.round(l.transform.h));
      let raster: Raster | null = null;
      const sel = p.selection;
      if (sel) {
        raster = new Raster(w, h);
        setMat(raster.ctx, mul(invert(placement(l.transform, w, h)), translation(sel.x, sel.y)));
        raster.ctx.drawImage(sel.surface(), 0, 0);
        raster.ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (hide) {
          const inv = Raster.filled(w, h, '#ffffff');
          inv.ctx.globalCompositeOperation = 'destination-out';
          inv.ctx.drawImage(raster.canvas, 0, 0);
          inv.ctx.globalCompositeOperation = 'source-over';
          raster = inv;
        }
      } else if (hide) raster = new Raster(w, h);
      p.updateLayer(l.id, { mask: { raster, enabled: true, linked: true, placement: null } });
      p.maskTarget = true;
    });
  }

  deleteMask(apply: boolean): void {
    this.edit(apply ? 'Apply Layer Mask' : 'Delete Layer Mask', (p) => {
      const l = p.activeLayer;
      if (!l?.mask) return false;
      if (apply && l.raster && l.mask.raster && l.mask.enabled) {
        const r = l.raster.clone();
        const m = l.mask;
        setMat(r.ctx, mul(invert(placement(l.transform, r.width, r.height)), placement(m.placement ?? l.transform, (m.raster as Raster).width, (m.raster as Raster).height)));
        r.ctx.globalCompositeOperation = 'destination-in';
        r.ctx.drawImage((m.raster as Raster).canvas, 0, 0);
        r.ctx.globalCompositeOperation = 'source-over';
        r.ctx.setTransform(1, 0, 0, 1, 0, 0);
        p.updateLayer(l.id, { raster: r, mask: null });
      } else p.updateLayer(l.id, { mask: null });
      p.maskTarget = false;
    });
  }

  toggleMaskEnabled(): void {
    this.edit('Toggle Layer Mask', (p) => {
      const l = p.activeLayer;
      if (!l?.mask) return false;
      p.updateLayer(l.id, { mask: { ...l.mask, enabled: !l.mask.enabled } });
    });
  }

  toggleMaskLink(): void {
    this.edit('Link Layer Mask', (p) => {
      const l = p.activeLayer;
      if (!l?.mask) return false;
      const m = l.mask;
      p.updateLayer(l.id, { mask: m.linked ? { ...m, linked: false, placement: m.placement ?? l.transform } : { ...m, linked: true } });
    });
  }

  flipLayers(horizontal: boolean): void {
    this.edit(horizontal ? 'Flip Layer Horizontal' : 'Flip Layer Vertical', (p) => {
      let any = false;
      for (const id of p.selectedIds) {
        const l = p.layer(id);
        if (!l || l.isGroup || !l.raster) continue;
        const t = l.transform;
        p.updateLayer(id, { transform: horizontal ? { ...t, flipX: !t.flipX, rotation: -t.rotation } : { ...t, flipY: !t.flipY, rotation: -t.rotation } });
        any = true;
      }
      return any;
    });
  }

  flipCanvas(horizontal: boolean): void {
    this.edit(horizontal ? 'Flip Canvas Horizontal' : 'Flip Canvas Vertical', (p) => {
      const { width: W, height: H } = p.doc;
      p.setLayers(p.doc.layers.map((l) => ({
        ...l,
        transform: mirrored(l.transform, horizontal, W, H),
        mask: l.mask?.placement ? { ...l.mask, placement: mirrored(l.mask.placement, horizontal, W, H) } : l.mask,
        ...(l.artboard ? { artboard: horizontal ? { ...l.artboard, x: W - l.artboard.x - l.artboard.w } : { ...l.artboard, y: H - l.artboard.y - l.artboard.h } } : {}),
      })));
      if (p.selection) p.selection = p.selection.flipped(horizontal, W, H);
    });
  }

  private paintable(l: Layer | null): l is Layer { return !!l && !l.isGroup && !l.adjustment && !this.locked(l, 'pixels'); }

  private ensurePixels(p: Project, layer: Layer): Raster {
    const { width: W, height: H } = p.doc;
    if (!layer.raster) {
      const r = new Raster(W, H);
      p.updateLayer(layer.id, { raster: r, transform: docTransform(W, H) });
      return r;
    }
    return this.growLayer(p, layer, { x: 0, y: 0, w: W, h: H });
  }

  private growLayer(p: Project, layer: Layer, want: Rect): Raster {
    const t = layer.transform, r = layer.raster as Raster;
    if (!isAxisAligned(t, r.width, r.height)) return r;
    if (t.x <= want.x && t.y <= want.y && t.x + t.w >= want.x + want.w && t.y + t.h >= want.y + want.h) return r;
    const u = unionRect({ x: t.x, y: t.y, w: t.w, h: t.h }, want);
    if (u.w > LIMITS.side || u.h > LIMITS.side || u.w * u.h > LIMITS.pixels) return r;
    let mask = layer.mask;
    if (mask?.raster) {
      if (mask.placement || mask.raster.width !== r.width || mask.raster.height !== r.height) return r;
      const nm = Raster.filled(u.w, u.h, '#ffffff');
      nm.ctx.clearRect(t.x - u.x, t.y - u.y, r.width, r.height);
      nm.ctx.drawImage(mask.raster.canvas, t.x - u.x, t.y - u.y);
      mask = { ...mask, raster: nm };
    }
    const nr = new Raster(u.w, u.h);
    nr.ctx.drawImage(r.canvas, t.x - u.x, t.y - u.y);
    p.updateLayer(layer.id, { raster: nr, transform: { ...t, x: u.x, y: u.y, w: u.w, h: u.h }, mask });
    return nr;
  }

  private ensureMask(p: Project, layer: Layer): Raster {
    const m = layer.mask as Mask;
    if (m.raster) return m.raster;
    const w = layer.raster?.width ?? p.doc.width, h = layer.raster?.height ?? p.doc.height;
    const r = Raster.filled(w, h, '#ffffff');
    p.updateLayer(layer.id, { mask: { ...m, raster: r } });
    return r;
  }

  private target(p: Project): { layer: Layer; target: Target; raster: Raster; local: Mat } | null {
    const l0 = p.activeLayer;
    if (!this.paintable(l0)) return null;
    const target: Target = p.maskTarget && l0.mask ? 'mask' : 'pixels';
    const raster = target === 'mask' ? this.ensureMask(p, l0) : this.ensurePixels(p, l0);
    const l = p.layer(l0.id) as Layer;
    const t = target === 'mask' ? l.mask?.placement ?? l.transform : l.transform;
    return { layer: l, target, raster, local: placement(t, raster.width, raster.height) };
  }

  beginStroke(pt: Pt, shift: boolean, pressure = 1, pose: PenPose = UPRIGHT): boolean {
    const p = this.current;
    if (!p || this.stroke) return false;
    this.settle();
    if (this.quickMask) return this.beginQuickMaskStroke(p, pt, pressure, pose);   // paints the selection, any layer
    if (!this.paintable(p.activeLayer)) { this.notice('Select a pixel layer to paint on.'); return false; }
    if (this.smartLocked(p)) return false;
    p.history.begin(this.brushMode === 'erase' ? 'Eraser' : 'Brush', p.snapshot());
    const pick = this.target(p) as NonNullable<ReturnType<Engine['target']>>;
    const white = pick.target === 'mask' && luminance(this.fg) >= 0.5 !== (this.brushMode === 'erase');
    // Lock Transparency: paint only where the layer has pixels (source-atop); the Eraser then paints the background
    // colour, as Photoshop's does, since it may not make pixels transparent.
    const keepAlpha = pick.target !== 'mask' && !!p.activeLayer?.locks?.transparency;
    const op: GlobalCompositeOperation = pick.target === 'mask' ? (white ? 'source-over' : 'destination-out') : keepAlpha ? 'source-atop' : this.brushMode === 'erase' ? 'destination-out' : 'source-over';
    const color = pick.target === 'mask' ? { r: 255, g: 255, b: 255 } : keepAlpha && this.brushMode === 'erase' ? this.bg : this.fg;
    const s = new PixelStroke(pick.raster, pick.local, { ...this.brush, color, flow: this.brushFlow }, op, p.selection);
    s.dynamics = structuredClone(this.brushDynamics);
    // Brush Settings (tip shape, shape dynamics, scattering, texture, dual brush); inactive, the stroke is as before.
    s.setShape(this.brushShape, this.brushShape.texture.on ? (patternById(this.brushShape.texture.pattern) ?? allPatterns()[0])?.surface ?? null : null);
    this.stroke = { project: p, layerId: pick.layer.id, target: pick.target, s };
    const last = this.lastBrush;
    if (shift && last && last.layerId === pick.layer.id && last.target === pick.target) s.to(last.p, pressure, pose);
    s.to(pt, pressure, pose);
    s.compose();
    this.emit('render', null);
    return true;
  }

  /** Redraws of the whole scene are the default; a stroke reports just the region it changed, so the stage repaints
   *  that alone. Off, every stroke frame redraws everything. */
  dirtyRendering = true;

  strokeTo(pt: Pt, pressure = 1, pose: PenPose = UPRIGHT): void {
    const st = this.stroke;
    if (!st) return;
    st.s.to(pt, pressure, pose);
    const f = st.s.compose();
    if (!f) return;
    if (st.quick) { this.emit('selection', null); return; }   // Quick Mask: the tint follows the stroke; no layer repaints
    const l = st.project.layer(st.layerId), r = st.target === 'mask' ? l?.mask?.raster : l?.raster;
    const t = st.target === 'mask' ? l?.mask?.placement ?? l?.transform : l?.transform;
    // Styled layers' effects are cached at document resolution, so a region repaint shows them whole; the layer being
    // painted, clipped layers and layers in folders draw their effects per render, so those repaint whole.
    const styled = st.project.doc.layers.some((x) => effectsActive(x.effects) && (x.id === st.layerId || !!x.clipId || x.parentId !== null));
    if (!this.dirtyRendering || !l || !r || !t || styled) { this.emit('render', null); return; }
    const m = placement(t, r.width, r.height);
    this.emit('render', boundsOf([applyMat(m, f.x, f.y), applyMat(m, f.x + f.w, f.y), applyMat(m, f.x + f.w, f.y + f.h), applyMat(m, f.x, f.y + f.h)]));
  }

  endStroke(): void {
    const st = this.stroke;
    if (!st) return;
    this.stroke = null;
    if (st.quick) {
      // Quick Mask: the painted coverage is the new selection, in this stroke's history step (the raster was temporary).
      st.s.commit();
      const W = st.quick.width, H = st.quick.height, d = ctxOf(st.quick.canvas).getImageData(0, 0, W, H).data, a = new Uint8Array(W * H);
      for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
      st.project.selection = SelectionMask.cropped(0, 0, W, H, a);
      st.project.history.end(st.project.snapshot());
      st.s.release();
      this.emit('selection', null);
      this.refresh();
      return;
    }
    const patch = st.heal === 'remove' ? this.removePatch(st.s) : st.heal ? this.healPatch(st.s, st.heal) : st.healFrom ? this.healFromPatch(st.s, st.healFrom) : st.s.commit();
    if (patch) st.project.history.addPatch(patch);
    if (st.target === 'pixels' && st.project.layer(st.layerId)?.shape) st.project.updateLayer(st.layerId, { shape: null });
    st.project.history.end(st.project.snapshot());
    const lp = st.s.lastPoint;
    if (lp) this.lastBrush = { layerId: st.layerId, target: st.target, p: lp };
    this.refresh();
    st.s.release();
  }

  cancelStroke(): void {
    const st = this.stroke;
    if (!st) return;
    this.stroke = null;
    const before = st.project.history.abort();
    if (before) { st.project.doc = before.doc; st.project.selection = before.selection; }
    this.refresh();
    st.s.release();
  }

  private regionEdit(name: string, apply: (a: { raster: Raster; target: Target; rect: Rect; cover: Surface | null }) => void, region?: SelectionMask | null): void {
    this.edit(name, (p) => {
      if (!this.paintable(p.activeLayer)) { this.notice('Select a pixel layer first.'); return false; }
      if (this.smartLocked(p)) return false;
      const pick = this.target(p);
      if (!pick) return false;
      const { raster } = pick;
      let rect: Rect = { x: 0, y: 0, w: raster.width, h: raster.height };
      let cover: Surface | null = null;
      const sel = region !== undefined ? region : p.selection;
      if (sel) {
        const toLocal = mul(invert(pick.local), translation(sel.x, sel.y));
        const b = integral(boundsOf([applyMat(toLocal, 0, 0), applyMat(toLocal, sel.w, 0), applyMat(toLocal, sel.w, sel.h), applyMat(toLocal, 0, sel.h)]));
        const r = intersectRect({ x: b.x - 1, y: b.y - 1, w: b.w + 2, h: b.h + 2 }, rect);
        if (!r) return false;
        rect = r;
        cover = createSurface(rect.w, rect.h);
        const c = ctxOf(cover);
        setMat(c, mul(translation(-rect.x, -rect.y), toLocal));
        c.drawImage(sel.surface(), 0, 0);
      }
      const before = raster.read(rect.x, rect.y, rect.w, rect.h);
      try { apply({ raster, target: pick.target, rect, cover }); } catch (err) { raster.write(before, rect.x, rect.y); raster.touch(); throw err; }
      if (pick.target === 'pixels' && p.layer(pick.layer.id)?.shape) p.updateLayer(pick.layer.id, { shape: null });
      raster.touch();
      p.history.addPatch({ raster, x: rect.x, y: rect.y, before, after: raster.read(rect.x, rect.y, rect.w, rect.h) });
    });
  }

  private tint(rect: Rect, style: string, cover: Surface | null): Surface {
    const s = createSurface(rect.w, rect.h);
    const c = ctxOf(s);
    c.fillStyle = style;
    c.fillRect(0, 0, rect.w, rect.h);
    if (cover) { c.globalCompositeOperation = 'destination-in'; c.drawImage(cover, 0, 0); }
    return s;
  }

  /** Edit > Fill: the selection, or the whole layer, filled with a colour or a pattern (tiled from the layer's corner)
   *  in a blend mode at an opacity, optionally keeping transparent pixels transparent, as one step. On a mask the
   *  colour's grey is used and patterns are refused. */
  /** The active layer as it was at the oldest kept history step, drawn in document space: its raster from that
   *  step's snapshot with every later patch on it written back, newest first. Null when the layer did not exist then. */
  private historySource(p: Project): Surface | null {
    const l = p.activeLayer;
    if (!l) return null;
    const { first, patches } = p.history.origin(), l0 = (first?.doc ?? p.doc).layers.find((x) => x.id === l.id), R0 = l0?.raster;
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
        else if ('color' in contents) sc.fillStyle = rgbCss(contents.color);
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

  /** Fill Path with its settings, as Photoshop's dialog has them: the path's inside (its operations applied),
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

  fill(which: 'fg' | 'bg'): void {
    const color = which === 'fg' ? this.fg : this.bg;
    this.regionEdit(which === 'fg' ? 'Fill with Foreground' : 'Fill with Background', ({ raster, target, rect, cover }) => {
      const c = raster.ctx;
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      if (target === 'mask') {
        const t = this.tint(rect, '#ffffff', cover);
        const v = luminance(color);
        c.globalCompositeOperation = 'destination-out';
        c.drawImage(t, rect.x, rect.y);
        if (v > 0) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = v; c.drawImage(t, rect.x, rect.y); }
      } else c.drawImage(this.tint(rect, rgbCss(color), cover), rect.x, rect.y);
      c.restore();
    });
  }

  clearPixels(): void {
    this.regionEdit('Clear', ({ raster, target, rect, cover }) => {
      const c = raster.ctx;
      const t = this.tint(rect, '#ffffff', cover);
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'destination-out';
      c.drawImage(t, rect.x, rect.y);
      const v = target === 'mask' ? luminance(this.bg) : 0;
      if (v > 0) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = v; c.drawImage(t, rect.x, rect.y); }
      c.restore();
    });
  }

  invertPixels(): void {
    const mask = !!(this.current?.maskTarget && this.activeLayer?.mask);
    this.regionEdit(mask ? 'Invert Mask' : 'Invert', ({ raster, target, rect, cover }) => {
      const img = raster.read(rect.x, rect.y, rect.w, rect.h);
      const d = img.data;
      const cv = cover ? ctxOf(cover).getImageData(0, 0, rect.w, rect.h).data : null;
      for (let i = 0; i < d.length; i += 4) {
        const k = cv ? cv[i + 3] / 255 : 1;
        if (k <= 0) continue;
        if (target === 'mask') {
          d[i + 3] = d[i + 3] + (255 - 2 * d[i + 3]) * k;
          d[i] = 255; d[i + 1] = 255; d[i + 2] = 255;
        } else if (d[i + 3]) {
          d[i] += (255 - 2 * d[i]) * k;
          d[i + 1] += (255 - 2 * d[i + 1]) * k;
          d[i + 2] += (255 - 2 * d[i + 2]) * k;
        }
      }
      raster.ctx.putImageData(img, rect.x, rect.y);
    });
  }

  applySelection(next: SelectionMask | null, mode: SelectionMode, name: string): void {
    this.edit(name, (p) => {
      const cur = p.selection;
      let result: SelectionMask | null;
      if (mode === 'replace') result = next;
      else if (!next) result = cur;
      else if (!cur) result = mode === 'add' ? next : null;
      else result = cur.combine(next, mode);
      if (result === cur) return false;
      p.selection = result;
      return true;
    });
  }

  selectAll(): void { const p = this.current; if (p) this.applySelection(SelectionMask.all(p.doc.width, p.doc.height), 'replace', 'Select All'); }
  deselect(): void { if (this.current?.selection) this.applySelection(null, 'replace', 'Deselect'); }
  invertSelection(): void { this.edit('Inverse Selection', (p) => { if (!p.selection) return false; p.selection = p.selection.inverted(p.doc.width, p.doc.height); return true; }); }

  selectLayerPixels(id?: ID): void {
    const p = this.current;
    const l = p?.layer(id ?? p.activeId ?? '');
    if (!p || !l?.raster) return;
    const b = intersectRect(integral(transformBounds(l.transform)), { x: 0, y: 0, w: p.doc.width, h: p.doc.height });
    if (!b) { this.applySelection(null, 'replace', "Select Layer's Pixels"); return; }
    const s = createSurface(b.w, b.h);
    const c = ctxOf(s);
    setMat(c, mul(translation(-b.x, -b.y), placement(l.transform, l.raster.width, l.raster.height)));
    c.drawImage(l.raster.canvas, 0, 0);
    this.applySelection(SelectionMask.fromAlpha(b.x, b.y, b.w, b.h, c.getImageData(0, 0, b.w, b.h).data), 'replace', "Select Layer's Pixels");
  }

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
      if (!l?.raster) { this.notice('Select a pixel layer first.'); return; }
      surface = createSurface(W, H);
      const c = ctxOf(surface);
      setMat(c, placement(l.transform, l.raster.width, l.raster.height));
      c.drawImage(l.raster.canvas, 0, 0);
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
      } else c.drawImage(this.tint(rect, rgbCss(color), cover), rect.x, rect.y);
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
      if (kind === 'sponge') { const k = t.spongeMode === 'saturate' ? -t.flow : t.flow; f = (v) => v + (l - v) * k; }
      else {
        const w = t.range === 'shadows' ? (1 - l) * (1 - l) : t.range === 'highlights' ? l * l : 1 - (2 * l - 1) * (2 * l - 1), a = t.exposure * w;
        f = kind === 'dodge' ? (v) => v + (1 - v) * a : (v) => v * (1 - a);
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

  beginQuickSelect(pt: Pt, subtract: boolean): void {
    const p = this.current;
    if (!p || this.quickState) return;
    this.settle();
    const { width: W, height: H } = p.doc;
    let surface: Surface;
    if (this.quick.sampleAll) surface = renderDoc(this.work, p.doc);
    else {
      const l = p.activeLayer;
      if (!l?.raster) { this.notice('Quick Selection samples the active pixel layer; turn on Sample all layers to use the whole image.'); return; }
      surface = createSurface(W, H);
      const c = ctxOf(surface);
      setMat(c, placement(l.transform, l.raster.width, l.raster.height));
      c.drawImage(l.raster.canvas, 0, 0);
    }
    this.quickState = { project: p, data: ctxOf(surface).getImageData(0, 0, W, H).data, W, H, base: p.selection, grown: new Uint8Array(W * H), box: null, subtract, last: null };
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

  magicWand(pt: Pt, mode: SelectionMode): void {
    const p = this.current;
    if (!p) return;
    const { width: W, height: H } = p.doc;
    const x = Math.floor(pt.x), y = Math.floor(pt.y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    let surface: Surface;
    if (this.wand.sampleAll) surface = renderDoc(this.work, p.doc);
    else {
      const l = p.activeLayer;
      if (!l?.raster) { this.notice('Magic Wand samples the active pixel layer; turn on Sample all layers to use the whole image.'); return; }
      surface = createSurface(W, H);
      const c = ctxOf(surface);
      setMat(c, placement(l.transform, l.raster.width, l.raster.height));
      c.drawImage(l.raster.canvas, 0, 0);
    }
    const data = ctxOf(surface).getImageData(0, 0, W, H).data;
    const hard = wandMask(data, W, H, x, y, this.wand.tolerance, this.wand.contiguous, this.wand.sampleSize);
    const mask = this.wand.antialias ? antialiasMask(hard, W, H) : hard;
    this.applySelection(SelectionMask.cropped(0, 0, W, H, mask), mode, 'Magic Wand');
  }

  beginSelectionShift(): void {
    const p = this.current;
    if (!p?.selection || this.stroke) return;
    this.settle();
    this.selectionShift = { project: p, dx: 0, dy: 0 };
  }

  updateSelectionShift(dx: number, dy: number): void {
    if (!this.selectionShift) return;
    this.selectionShift.dx = Math.round(dx);
    this.selectionShift.dy = Math.round(dy);
    this.emit('overlay', null);
  }

  endSelectionShift(): void {
    const s = this.selectionShift;
    if (!s) return;
    this.selectionShift = null;
    if ((!s.dx && !s.dy) || this.current !== s.project) { this.emit('overlay', null); return; }
    this.edit('Move Selection', (p) => { if (!p.selection) return false; p.selection = p.selection.translated(s.dx, s.dy, p.doc.width, p.doc.height); return true; });
  }

  /** the rule for moving a mask on its own: with the mask targeted and unlinked, the Move tool transforms the
   *  mask's placement instead of the layer. A linked mask moves with its layer, and a solid (never painted) mask covers
   *  everything wherever it sits, so neither qualifies. */
  transformsMask(l: Layer | null | undefined): boolean {
    return !!l && !!this.current?.maskTarget && !!l.mask?.raster && !l.mask.linked;
  }

  /** with more than one layer selected, or a folder, the Move tool transforms the
   *  visible pixel layers that are selected or inside a selected folder together. */
  private groupMembers(p: Project): Layer[] {
    const sel = p.selectedIds;
    if (!(sel.size > 1 || (sel.size === 1 && p.activeLayer?.isGroup))) return [];
    const parents = new Map(p.doc.layers.map((l) => [l.id, l.parentId]));
    const visible = new Set(hierarchy(p.doc).filter((e) => e.visible).map((e) => e.layer.id));
    return p.doc.layers.filter((l) => {
      if (!l.raster || l.isGroup || !visible.has(l.id)) return false;
      let cur: ID | null = l.id;
      for (let i = 0; i < 64 && cur; i++) {
        if (sel.has(cur)) return true;
        cur = parents.get(cur) ?? null;
      }
      return false;
    });
  }

  /** The group's handle box: the upright bounds of every member's corners (). */
  groupBox(): Transform | null {
    const p = this.current;
    if (!p) return null;
    let b: Rect | null = null;
    for (const l of this.groupMembers(p)) b = unionRect(b, transformBounds(l.transform));
    return b ? { x: b.x, y: b.y, w: Math.max(1, b.w), h: Math.max(1, b.h), rotation: 0, flipX: false, flipY: false, sampling: 'high' } : null;
  }

  beginTransform(mode: DragMode, start: Pt): boolean {
    const p = this.current;
    const l = p?.activeLayer;
    if (!p || !l || this.stroke) return false;
    if (this.locked(l, 'position')) return false;
    const members = this.groupMembers(p), box = members.length ? this.groupBox() : null;
    if (box) {
      this.settle();
      this.transformEdit = { project: p, layerId: l.id, original: box, draft: box, mode, start, mask: false, group: { box, originals: new Map(members.map((m) => [m.id, m.transform])) } };
      return true;
    }
    if (l.isGroup || !l.raster) return false;
    this.settle(this.floatSel?.floatingId === l.id);
    const mask = this.transformsMask(l);
    const tbox = mask ? l.mask?.placement ?? l.transform : l.transform;
    this.transformEdit = { project: p, layerId: l.id, original: tbox, draft: tbox, mode, start, mask, group: null };
    return true;
  }

  updateTransform(pt: Pt, shift: boolean, alt: boolean): void {
    const te = this.transformEdit;
    if (!te) return;
    te.draft = dragged(te.original, te.start, pt, te.mode, this.lockRatio, shift, alt);
    if (te.mode.kind === 'move' && this.snapping) te.draft = this.snapMove(te.project, te.layerId, te.draft, te.group ? new Set(te.group.originals.keys()) : undefined);
    else this.snapGuides = null;
    this.emit('render', null);
    this.emit('options', null);
  }

  endTransform(): void {
    const te = this.transformEdit;
    if (!te) return;
    this.transformEdit = null;
    this.snapGuides = null;
    const next = rounded(te.draft);
    if (sameTransform(next, te.original) || this.current !== te.project) { this.emit('render', null); return; }
    if (this.floatSel?.project === te.project && this.floatSel.floatingId === te.layerId) { te.project.updateLayer(te.layerId, { transform: next }); this.refresh(); return; }
    if (te.group) {
      // the group commit: each member follows the box, its mask following it, as one Transform Layers step.
      const g = te.group;
      this.edit('Transform Layers', (p) => {
        let moved = false;
        for (const [id, orig] of g.originals) {
          const l = p.layer(id);
          const t = following(orig, g.box, next);
          if (!l || !(t.w >= 1 && t.h >= 1) || ![t.x, t.y, t.w, t.h, t.rotation].every(Number.isFinite)) continue;
          const redraw = !!l.shape && (Math.round(t.w) !== l.raster?.width || Math.round(t.h) !== l.raster?.height);
          p.updateLayer(id, { transform: t, mask: followMask(l, t), ...(redraw && l.shape ? { raster: this.shapeRaster(l.shape, t.w, t.h) } : {}) });
          moved = true;
        }
        // A moved artboard takes its rectangle along, mapped as its contents are (artboards do not rotate).
        for (const id of this.selectedRoots(p)) {
          const a = p.layer(id)?.artboard;
          if (!a) continue;
          const t = following({ x: a.x, y: a.y, w: a.w, h: a.h, rotation: 0, flipX: false, flipY: false, sampling: 'smooth' }, g.box, next);
          const r = artboardFromData({ ...a, x: t.x, y: t.y, w: t.w, h: t.h });
          if (r) { p.updateLayer(id, { artboard: r }); moved = true; }
        }
        return moved;
      });
      return;
    }
    if (te.mask) {
      // the mask takes the new placement, its pixels untouched; a placement equal to
      // the layer's own is stored as none.
      this.edit('Transform Layer Mask', (p) => {
        const l = p.layer(te.layerId);
        if (!l?.mask) return false;
        p.updateLayer(l.id, { mask: { ...l.mask, placement: sameTransform(next, l.transform) ? null : next } });
        return true;
      });
      return;
    }
    const name = te.mode.kind === 'move' ? 'Move Layer' : te.mode.kind === 'rotate' ? 'Rotate Layer' : 'Transform Layer';
    this.edit(name, (p) => {
      const l = p.layer(te.layerId);
      if (!l) return false;
      const redraw = !!l.shape && (Math.round(next.w) !== l.raster?.width || Math.round(next.h) !== l.raster?.height);
      p.updateLayer(l.id, { transform: next, mask: followMask(l, next), ...(redraw && l.shape ? { raster: this.shapeRaster(l.shape, next.w, next.h) } : {}) });
      return true;
    });
  }

  /** the free distort (Cmd-drag a corner handle): the four corners of the Move tool's box move on their own,
   *  pending until applied (Enter) or cancelled (Escape). The box is the active layer's, or with several layers or a
   *  folder selected the group box, each member carried by the same perspective. */
  distortEdit: { project: Project; layerId: ID; box: Transform; members: ID[] | null; corners: Pt[]; smart?: { R: Raster; t: Transform; margin: number; start: Pt[] }; previews: Map<ID, { pixels: Warped | null; mask: DistortedMask | null }> } | null = null;
  private distortFrame = 0;

  beginDistort(): boolean {
    if (this.current?.activeLayer?.vector) { this.notice(SHAPE_NOTICE); return false; }
    const p = this.current, l = p?.activeLayer;
    if (!p || !l || this.stroke || this.transformEdit) return false;
    const members = this.groupMembers(p), box = members.length ? this.groupBox() : null;
    if (members.some((m) => m.smart || m.vector)) { this.notice('Smart objects and shape layers are distorted one at a time, not with other layers.'); return false; }
    if (l.smart && !box) {
      if (!l.raster) return false;
      // A smart object distorts from its undistorted render, starting from its current warp, which the new one replaces.
      this.settle();
      const warp = this.smartWarpNow(l), margin = this.smartMargin(l.smart.filters);
      const R = warp ? this.renderSmart(l.smart.source, l.smart.filters, l.smart.filterMaskEnabled !== false ? l.smart.filterMask ?? null : null) : l.raster, rt = warp ? docTransform(R.width, R.height) : l.transform;
      let corners = cornersOf(rt);
      if (warp) {
        const H = homography(warp), ex = margin / l.smart.source.width, ey = margin / l.smart.source.height;
        corners = [[-ex, -ey], [1 + ex, -ey], [1 + ex, 1 + ey], [-ex, 1 + ey]].map(([u, v]) => project(H, u, v));
      }
      this.distortEdit = { project: p, layerId: l.id, box: rt, members: null, corners, previews: new Map(), smart: { R, t: rt, margin, start: corners.map((c) => ({ ...c })) } };
      this.emit('render', null);
      this.emit('options', null);
      return true;
    }
    if (!box && (l.isGroup || !l.raster || l.adjustment || this.transformsMask(l))) return false;
    this.settle();
    const t = box ?? l.transform;
    this.distortEdit = { project: p, layerId: l.id, box: t, members: box ? members.map((m) => m.id) : null, corners: cornersOf(t), previews: new Map() };
    this.emit('render', null);
    this.emit('options', null);
    return true;
  }

  /** Where the distortion takes one layer: the corners themselves for a single layer, a member's own corners carried
   *  through the box's perspective; null when that shape is unusable (the member is then left alone). */
  private distortQuad(d: NonNullable<Engine['distortEdit']>, l: Layer): Pt[] | null {
    const q = d.members ? carried(l.transform, d.box, d.corners) : d.corners;
    return distortUsable(q) ? q : null;
  }

  /** A layer's mask through a distortion to `quad`: linked on the layer, it warps with the pixels;
   *  linked but placed apart, it takes the same perspective over its own bounds with its edge tone outside;
   *  unlinked, it stays where it is on the document. */
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

  private distortMask(l: Layer, quad: Pt[], scale: number): DistortedMask | null {
    const m = l.mask;
    if (!m?.raster) return null;
    if (!m.linked) return { warped: null, placement: m.placement ?? l.transform };
    if (!m.placement) return { warped: warpRaster(m.raster, l.transform, quad, scale, true), placement: null };
    const mq = carried(m.placement, l.transform, quad);
    const w = distortUsable(mq) ? warpRaster(m.raster, m.placement, mq, scale, true, maskEdgeTone(m.raster)) : null;
    return w ? { warped: w, placement: w.t } : null;
  }

  /** Moves one corner (handle order: top-left, top-right, bottom-right, bottom-left); a twisted or collapsed shape
   *  is ignored. The preview is re-warped once per frame. */
  moveDistortCorner(i: number, pt: Pt): void {
    const d = this.distortEdit;
    if (!d) return;
    const next = d.corners.map((c, k) => (k === i ? { x: pt.x, y: pt.y } : c));
    if (!distortUsable(next)) return;
    d.corners = next;
    if (!this.distortFrame) this.distortFrame = requestAnimationFrame(() => { this.distortFrame = 0; this.previewDistort(); });
    this.emit('render', null);
  }

  private previewDistort(): void {
    const d = this.distortEdit;
    if (!d) return;
    const xs = d.corners.map((c) => c.x), ys = d.corners.map((c) => c.y);
    const scale = Math.min(1, 640 / Math.max(1, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)));
    d.previews.clear();
    for (const id of d.members ?? [d.layerId]) {
      const l = d.project.layer(id), q = l?.raster ? this.distortQuad(d, l) : null;
      const sm = d.smart && id === d.layerId ? d.smart : null;
      if (l?.raster && q) d.previews.set(id, sm ? { pixels: warpRaster(sm.R, sm.t, q, scale), mask: this.smartDistortMask(l, sm.start, q, scale) } : { pixels: warpRaster(l.raster, l.transform, q, scale), mask: this.distortMask(l, q, scale) });
    }
    this.emit('render', null);
  }

  /** each distorted layer's pixels resampled into its shape at full resolution and trimmed to what
   *  is visible, leaving upright layers, its mask handled by `distortMask` (a linked mask cropped with the pixels), as
   *  one Distort step, or Distort Layers for a group. */
  applyDistort(): void {
    const d = this.distortEdit;
    if (!d) return;
    this.dropDistort();
    const p = d.project;
    if (p !== this.current) return;
    const sm = d.smart, sl = sm ? p.layer(d.layerId) : null;
    if (sm && sl?.smart) {
      // The new corners of the undistorted render give the perspective; the source's own corners, inside its padding,
      // are carried through it and kept as the warp.
      const H = homography(imageCorners(d.corners, sm.t.flipX, sm.t.flipY)), src = sl.smart.source, m = sm.margin, Rw = sm.R.width, Rh = sm.R.height;
      const warp = [[m, m], [m + src.width, m], [m + src.width, m + src.height], [m, m + src.height]].map(([x, y]) => project(H, x / Rw, y / Rh));
      const w = this.warpedSmart(sm.R, m, src, warp), dm = this.smartDistortMask(sl, sm.start, d.corners, 1);
      const smart = sl.smart, mask = sl.mask && dm ? { ...sl.mask, raster: dm.warped?.raster ?? sl.mask.raster, placement: dm.placement } : sl.mask;
      if (w) this.edit('Distort', (q) => q.updateLayer(sl.id, { raster: w.raster, transform: w.t, smart: { ...smart, warp, warpAt: w.t }, mask }));
      return;
    }
    const updates: Array<[ID, Partial<Layer>]> = [];
    for (const id of d.members ?? [d.layerId]) {
      const l = p.layer(id), q = l?.raster ? this.distortQuad(d, l) : null;
      const full = l?.raster && q ? warpRaster(l.raster, l.transform, q) : null;
      if (!l || !q || !full) continue;
      const crop = visibleBounds(full.raster), pixels = crop ? cropWarp(full, crop) : full, dm = this.distortMask(l, q, 1);
      let mask = l.mask;
      if (mask && dm?.warped && !dm.placement) mask = { ...mask, raster: crop ? cropWarp(dm.warped, crop).raster : dm.warped.raster };
      else if (mask && dm?.warped) mask = { ...mask, raster: dm.warped.raster, placement: dm.placement };
      else if (mask && dm) mask = { ...mask, placement: dm.placement };
      updates.push([id, { raster: pixels.raster, transform: pixels.t, mask, shape: null }]);
    }
    if (updates.length) this.edit(d.members ? 'Distort Layers' : 'Distort', (q) => { for (const [id, patch] of updates) q.updateLayer(id, patch); });
  }

  cancelDistort(): void {
    if (this.distortEdit) this.dropDistort();
  }

  /** Edit > Transform > Warp: a 4 x 4 control grid over the active layer's corners, pending until applied (Enter) or
   *  cancelled (Escape). The warp is the smooth one (engine/mesh-warp.ts, ported from NodeMode's sonny): the surface
   *  curves through the points. A linked mask without a placement of its own warps with the pixels. */
  meshWarpEdit: { project: Project; layerId: ID; gw: number; gh: number; points: P2[]; source: ImageData; mask: ImageData | null; preview: Warped | null } | null = null;
  private meshFrame = 0;

  beginMeshWarp(): boolean {
    const p = this.current, l = p?.activeLayer;
    if (!p || !l || this.stroke || this.transformEdit || this.distortEdit || this.meshWarpEdit) return false;
    if (l.vector || l.smart || l.isGroup || l.adjustment || !l.raster) { this.notice('Warp works on a pixel layer. Rasterize shape layers and smart objects first.'); return false; }
    this.settle();
    const r = l.raster, c = cornersOf(l.transform), gw = 4, gh = 4, points: P2[] = [];
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const u = i / (gw - 1), v = j / (gh - 1), top = { x: c[0].x + (c[1].x - c[0].x) * u, y: c[0].y + (c[1].y - c[0].y) * u }, bot = { x: c[3].x + (c[2].x - c[3].x) * u, y: c[3].y + (c[2].y - c[3].y) * u };
      points.push([top.x + (bot.x - top.x) * v, top.y + (bot.y - top.y) * v]);
    }
    const m = l.mask?.raster && l.mask.linked && !l.mask.placement ? l.mask.raster.read() : null;
    this.meshWarpEdit = { project: p, layerId: l.id, gw, gh, points, source: r.read(), mask: m, preview: null };
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
    if (!this.meshFrame) this.meshFrame = requestAnimationFrame(() => { this.meshFrame = 0; const e = this.meshWarpEdit; if (e) { e.preview = this.meshWarped(e.source, e.points, e.gw, e.gh, 360); this.emit('render', null); } });
    this.emit('overlay', null);
  }

  /** `img` through the grid into document space, at most `maxSide` pixels a side (0 for full size). */
  private meshWarped(img: ImageData, points: P2[], gw: number, gh: number, maxSide = 0): Warped | null {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of points) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const mg = 0.12 * Math.max(x1 - x0, y1 - y0);
    x0 = Math.floor(x0 - mg); y0 = Math.floor(y0 - mg); x1 = Math.ceil(x1 + mg); y1 = Math.ceil(y1 + mg);
    const W = Math.max(1, x1 - x0), H = Math.max(1, y1 - y0), s = maxSide ? Math.min(1, maxSide / Math.max(W, H)) : 1;
    const ow = Math.max(1, Math.round(W * s)), oh = Math.max(1, Math.round(H * s));
    const out = meshWarpImage(img, gw, gh, points.map(([x, y]): P2 => [(x - x0) * s, (y - y0) * s]), ow, oh, true);
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
    const full = this.meshWarped(w.source, w.points, w.gw, w.gh);
    if (!full) { this.notice('That warp folds over itself. Try smaller moves.'); return; }
    const crop = visibleBounds(full.raster), pixels = crop ? cropWarp(full, crop) : full;
    let mask = l.mask;
    if (mask && w.mask) { const mw = this.meshWarped(w.mask, w.points, w.gw, w.gh); if (mw) mask = { ...mask, raster: crop ? cropWarp(mw, crop).raster : mw.raster }; }
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
    if (!p || !l || this.stroke || this.transformEdit || this.distortEdit || this.meshWarpEdit || this.puppetEdit) return false;
    if (l.vector || l.smart || l.isGroup || l.adjustment || !l.raster) { this.notice('Puppet Warp works on a pixel layer. Rasterize shape layers and smart objects first.'); return false; }
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

  private dropDistort(): void {
    if (this.distortFrame) cancelAnimationFrame(this.distortFrame);
    this.distortFrame = 0;
    this.distortEdit = null;
    this.emit('render', null);
    this.emit('options', null);
  }

  cancelTransform(): void { this.snapGuides = null; if (this.transformEdit) { this.transformEdit = null; this.emit('render', null); this.emit('options', null); } }

  nudge(dx: number, dy: number): void {
    if (this.locked(this.activeLayer, 'position')) return;
    this.edit('Nudge', (p) => {
      let moved = false;
      for (const id of p.selectedIds) {
        const l = p.layer(id);
        if (!l || l.isGroup || !l.raster) continue;
        const t = { ...l.transform, x: l.transform.x + dx, y: l.transform.y + dy };
        p.updateLayer(id, { transform: t, mask: followMask(l, t) });
        moved = true;
      }
      return moved;
    });
  }

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
          p.updateLayer(id, { transform: t, mask: followMask(l, t) });
          moved = true;
        }
      }
      return moved;
    });
  }

  /** Layer > Align: several layers or folders align to the bounds of them all; one aligns to the selection, or to
   *  the canvas when nothing is selected. Visible pixels decide each one's edges, as in Photoshop. */
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

  layerAt(pt: Pt): ID | null {
    const p = this.current;
    if (!p) return null;
    const probe = createSurface(1, 1);
    const c = ctxOf(probe);
    const entries = hierarchy(p.doc).filter((e) => e.visible && !e.layer.isGroup && e.layer.raster).reverse();
    for (const e of entries) {
      const l = e.layer;
      const r = l.raster as Raster;
      if (!contains(l.transform, pt)) continue;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, 1, 1);
      setMat(c, mul(translation(-Math.floor(pt.x), -Math.floor(pt.y)), placement(l.transform, r.width, r.height)));
      c.drawImage(r.canvas, 0, 0);
      if (c.getImageData(0, 0, 1, 1).data[3] > 8) return l.id;
    }
    return null;
  }

  /** The Eyedropper's Sample Size, as Photoshop's options bar has it: 1 is Point Sample, otherwise the side of the
   *  square averaged (3, 5, 11, 31, 51 or 101). */
  eyedropperSize = 1;

  /** The document's colour at `pt`: the pixel itself for Point Sample, or the average of the Sample Size square around
   *  it, each pixel weighted by its opacity, so transparent pixels and anything past the canvas do not pull the colour. */
  sampleColor(pt: Pt): RGB | null {
    const p = this.current;
    if (!p || pt.x < 0 || pt.y < 0 || pt.x >= p.doc.width || pt.y >= p.doc.height) return null;
    const n = Math.max(1, Math.min(101, Math.round(this.eyedropperSize))), half = Math.floor(n / 2);
    const s = createSurface(n, n);
    this.work.render({ doc: p.doc, target: s, view: translation(-(Math.floor(pt.x) - half), -(Math.floor(pt.y) - half)) });
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
      this.addProject({ id: uid(), width: f.width, height: f.height, resolution: 72, layers: [] }, stripExt(f.name));
    }
    this.edit(images.length > 1 ? 'Import Images' : 'Import Image', (p) => {
      let used = p.doc.layers.reduce((n, l) => n + (l.raster ? l.raster.width * l.raster.height : 0), 0);
      let added = false;
      for (const img of images) {
        if (img.width > LIMITS.side || img.height > LIMITS.side || used + img.width * img.height > LIMITS.pixels) {
          this.notice(`${img.name} was skipped: it would exceed the 30,000 px side or the 100-megapixel document limit.`, 'error');
          continue;
        }
        used += img.width * img.height;
        const c = at ?? { x: p.doc.width / 2, y: p.doc.height / 2 };
        const active = p.activeLayer;
        const parentId = active?.isGroup ? active.id : active?.parentId ?? null;
        // Into a frame, the image covers it, centred, as Photoshop fills a frame; elsewhere it lands at its own size.
        const fr = parentId ? p.layer(parentId)?.frame : null, cover = fr ? Math.max(fr.w / img.width, fr.h / img.height) : 1;
        const layer = newLayer(stripExt(img.name), p.doc, {
          raster: Raster.from(img.source, img.width, img.height), parentId,
          transform: fr
            ? { ...docTransform(img.width, img.height), x: fr.x + (fr.w - img.width * cover) / 2, y: fr.y + (fr.h - img.height * cover) / 2, w: img.width * cover, h: img.height * cover }
            : { ...docTransform(img.width, img.height), x: Math.floor(c.x - img.width / 2), y: Math.floor(c.y - img.height / 2) },
        });
        p.setLayers([...p.doc.layers, layer]);
        this.focus(p, layer.id);
        added = true;
      }
      return added;
    });
  }

  private liveOpen: Project | null = null;
  preview: { project: Project; layerId: ID; target: Target; surface: Surface; transform?: Transform } | null = null;
  /** Bumped for every preview request and every clear, so a filter result that arrives from the worker after a newer
   *  request, or after the preview is switched off, is dropped instead of painted. */
  private previewToken = 0;
  gradient: { project: Project; layerId: ID; target: Target; start: Pt; end: Pt; raster: Raster; local: Mat; surface: Surface } | null = null;
  /** The Gradient tool's settings: Shape, Colors (style), Reverse, Opacity, and Mode and Dither as Photoshop's options
   *  bar has them (Dither off by default here: no source fetched gives Photoshop's default). */
  gradientSettings: { shape: GradientType; style: string; reversed: boolean; opacity: number; blend: BlendMode; dither: boolean } = { shape: 'linear', style: 'transparent', reversed: false, opacity: 1, blend: 'normal', dither: false };
  /** Dialogs a tool's options can open; the app fills these in, since tools only see the engine. */
  uiHooks: { gradientEditor?: () => void; importBrushes?: () => void } = {};
  shapeSettings: { kind: 'rectangle' | 'ellipse' | PathShapeKind; cornerRadius: number } & PathShapeOptions = { kind: 'rectangle', cornerRadius: 0, ...DEFAULT_PATH_SHAPE };
  clipboard: { surface: Surface; x: number; y: number; w: number; h: number; stamp: string } | null = null;
  selectionAmounts = { expand: 1, contract: 1, feather: 5, border: 4, smooth: 2 };

  /** View > Rulers, Guides, Grid and Lock Guides; the grid's spacing and subdivisions in document pixels. */
  view = { rulers: false, guides: true, grid: false, guidesLocked: false, gridSpacing: 100, gridSubdivisions: 4 };
  /** A guide being dragged out of a ruler or across the canvas, drawn but not yet in the document. */
  guideDraft: { axis: 'x' | 'y'; at: number; index: number | null } | null = null;

  setView(patch: Partial<Engine['view']>): void { Object.assign(this.view, patch); this.emit('overlay', null); this.emit('options', null); }

  private setGuides(name: string, next: (g: Guide[]) => Guide[]): void {
    this.edit(name, (p) => {
      const before = p.doc.guides ?? [], after = next([...before]);
      if (after.length === before.length && after.every((g, i) => g.axis === before[i].axis && g.at === before[i].at)) return false;
      p.doc = { ...p.doc, guides: after };
      return true;
    });
    this.emit('overlay', null);
  }

  /** View > New Guide, or a guide dropped from a ruler: at a whole or half pixel, kept within the canvas. */
  addGuide(axis: 'x' | 'y', at: number): void {
    const d = this.current?.doc;
    if (!d || !Number.isFinite(at)) return;
    const v = Math.min(axis === 'x' ? d.width : d.height, Math.max(0, Math.round(at * 2) / 2));
    this.setGuides('New Guide', (g) => [...g, { axis, at: v }]);
  }

  moveGuide(index: number, at: number): void {
    const d = this.current?.doc;
    if (!d || !Number.isFinite(at)) return;
    this.setGuides('Move Guide', (g) => g.map((x, i) => (i === index ? { axis: x.axis, at: Math.min(x.axis === 'x' ? d.width : d.height, Math.max(0, Math.round(at * 2) / 2)) } : x)));
  }

  removeGuide(index: number): void { this.setGuides('Delete Guide', (g) => g.filter((_, i) => i !== index)); }
  clearGuides(): void { this.setGuides('Clear Guides', () => []); }

  /** The guide within `tol` screen pixels of a screen point, nearest first; null when guides are hidden or locked. */
  guideAt(screen: Pt, tol = 4): number | null {
    const p = this.current, g = p?.doc.guides;
    if (!p || !g?.length || !this.view.guides || this.view.guidesLocked) return null;
    const v = p.viewport;
    let best: number | null = null, bestD = tol + 1;
    g.forEach((x, i) => { const d = Math.abs(x.axis === 'x' ? v.panX + x.at * v.zoom - screen.x : v.panY + x.at * v.zoom - screen.y); if (d <= tol && d < bestD) { best = i; bestD = d; } });
    return best;
  }

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
    this.liveOpen = null;
    const before = p.history.abort();
    if (before) { p.doc = before.doc; p.selection = before.selection; }
    this.refresh();
  }

  setPreview(layerId: ID | null, target: Target = 'pixels', surface: Surface | null = null, transform?: Transform): void {
    if (!layerId) this.previewToken += 1;
    const p = this.current;
    this.preview = p && layerId && surface ? { project: p, layerId, target, surface, transform } : null;
    this.emit('render', null);
  }

  targetImage(): { layerId: ID; target: Target; image: ImageData; width: number; height: number; unitsPerPixel: number } | null {
    const p = this.current;
    const l = p?.activeLayer ?? null;
    if (!p || !this.paintable(l)) return null;
    const onMask = p.maskTarget && !!l.mask;
    const r = onMask ? l.mask?.raster ?? null : l.raster;
    if (!r) return null;
    const t = onMask ? l.mask?.placement ?? l.transform : l.transform;
    const img = r.read();
    return { layerId: l.id, target: onMask ? 'mask' : 'pixels', image: onMask ? toGray(img) : img, width: r.width, height: r.height, unitsPerPixel: t.w / r.width };
  }

  private coverageFor(p: Project, layer: Layer, target: Target, w: number, h: number): Uint8ClampedArray | null {
    const sel = p.selection;
    if (!sel) return null;
    const t = target === 'mask' ? layer.mask?.placement ?? layer.transform : layer.transform;
    const s = createSurface(w, h);
    const c = ctxOf(s);
    setMat(c, mul(invert(placement(t, w, h)), translation(sel.x, sel.y)));
    c.drawImage(sel.surface(), 0, 0);
    return c.getImageData(0, 0, w, h).data;
  }

  private blendThrough(src: ImageData, out: ImageData, cov: Uint8ClampedArray): ImageData {
    const res = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
    const d = res.data, o = out.data;
    for (let i = 0; i < d.length; i += 4) {
      const k = cov[i + 3] / 255;
      if (k <= 0) continue;
      const sa = d[i + 3], oa = o[i + 3], a = sa + (oa - sa) * k;
      for (let c = 0; c < 3; c++) {
        const v = d[i + c] * sa + (o[i + c] * oa - d[i + c] * sa) * k;
        d[i + c] = a > 0 ? v / a : 0;
      }
      d[i + 3] = a;
    }
    return res;
  }

  private canGrow(p: Project, l: Layer): boolean { return !p.selection && !l.mask && !!l.raster; }

  private grown(l: Layer, grow: number, run: (src: ImageData, scale: number) => ImageData): { raster: Raster; transform: Transform } {
    const r = l.raster as Raster, g = Math.ceil(grow);
    const big = new Raster(r.width + 2 * g, r.height + 2 * g);
    big.ctx.drawImage(r.canvas, g, g);
    big.write(run(big.read(), 1));
    const t = l.transform, sx = t.w / r.width, sy = t.h / r.height;
    return { raster: big, transform: { ...t, x: t.x - g * sx, y: t.y - g * sy, w: t.w + 2 * g * sx, h: t.h + 2 * g * sy } };
  }

  previewImageEdit(run: (src: ImageData, scale: number) => ImageData | Promise<ImageData>, grow = 0, maxPixels = 2_000_000): void {
    const token = ++this.previewToken;
    const p = this.current;
    const l = p?.activeLayer ?? null;
    if (!p || !this.paintable(l)) { this.setPreview(null); return; }
    const onMask = p.maskTarget && !!l.mask;
    const r = onMask ? l.mask?.raster ?? null : l.raster;
    if (!r) { this.setPreview(null); return; }
    const scale = Math.min(1, Math.sqrt(maxPixels / (r.width * r.height)));
    const w = Math.max(1, Math.round(r.width * scale)), h = Math.max(1, Math.round(r.height * scale));
    const g = grow > 0 && !onMask && this.canGrow(p, l) ? Math.ceil(grow * scale) : 0;
    const s = createSurface(w + 2 * g, h + 2 * g);
    const c = ctxOf(s);
    c.drawImage(r.canvas, g, g, w, h);
    let src = c.getImageData(0, 0, w + 2 * g, h + 2 * g);
    if (onMask) src = toGray(src);
    const finish = (out: ImageData): void => {
      const cov = g ? null : this.coverageFor(p, l, onMask ? 'mask' : 'pixels', w, h);
      let result = cov ? this.blendThrough(src, out, cov) : out;
      if (onMask) result = fromGray(result);
      c.putImageData(result, 0, 0);
      const t = l.transform, gx = (g / scale) * (t.w / r.width), gy = (g / scale) * (t.h / r.height);
      this.setPreview(l.id, onMask ? 'mask' : 'pixels', s, g ? { ...t, x: t.x - gx, y: t.y - gy, w: t.w + 2 * gx, h: t.h + 2 * gy } : undefined);
    };
    const out = run(src, scale);
    if (out instanceof Promise) { void out.then((done) => { if (token === this.previewToken) finish(done); }).catch(() => undefined); return; }
    finish(out);
  }

  applyImageEdit(name: string, run: (src: ImageData, scale: number) => ImageData, grow = 0): void {
    const al = this.current?.activeLayer;
    if ((al?.smart || al?.vector) && !(this.current?.maskTarget && al.mask)) { this.notice(al.vector ? SHAPE_NOTICE : SMART_NOTICE); return; }
    this.preview = null;
    const p0 = this.current;
    const l0 = p0?.activeLayer ?? null;
    if (!p0 || !this.paintable(l0)) { this.notice('Select a pixel layer first.'); this.emit('render', null); return; }
    if (grow > 0 && !(p0.maskTarget && l0.mask) && this.canGrow(p0, l0)) {
      this.edit(name, (p) => {
        const l = p.layer(l0.id);
        if (!l?.raster) return false;
        const g = this.grown(l, grow, run);
        p.updateLayer(l.id, { raster: g.raster, transform: g.transform, shape: null });
        return true;
      });
      return;
    }
    this.regionEdit(name, ({ raster, target, rect }) => {
      const p = this.current as Project;
      const l = p.activeLayer as Layer;
      const src = target === 'mask' ? toGray(raster.read()) : raster.read();
      const out = run(src, 1);
      const cov = this.coverageFor(p, l, target, raster.width, raster.height);
      let result = cov ? this.blendThrough(src, out, cov) : out;
      if (target === 'mask') result = fromGray(result);
      raster.ctx.putImageData(result, 0, 0, rect.x, rect.y, rect.w, rect.h);
    });
  }

  /** applyImageEdit with the work done off the main thread: the source is prepared as the synchronous path prepares
   *  it (padded for a filter that reaches past the layer, grown to the canvas as painting grows a layer, grey for a
   *  mask), `run` computes on it in the background while the interface stays live, and the result goes through
   *  applyImageEdit as one undo step. If the layer changed meanwhile nothing is applied; if the pixels applyImageEdit
   *  sees ever differ in size from those computed on, `fallback` recomputes on them there. */
  async applyImageEditAsync(name: string, run: (src: ImageData, scale: number) => Promise<ImageData>, grow: number, fallback: (src: ImageData, scale: number) => ImageData): Promise<boolean> {
    const al = this.current?.activeLayer;
    if ((al?.smart || al?.vector) && !(this.current?.maskTarget && al.mask)) { this.notice(al.vector ? SHAPE_NOTICE : SMART_NOTICE); return false; }
    const p0 = this.current, l0 = p0?.activeLayer ?? null;
    if (!p0 || !this.paintable(l0)) { this.notice('Select a pixel layer first.'); return false; }
    this.settle();
    const onMask = p0.maskTarget && !!l0.mask, raster = onMask ? l0.mask?.raster ?? null : l0.raster;
    if (!raster) { this.applyImageEdit(name, fallback, grow); return true; }
    const growing = grow > 0 && !onMask && this.canGrow(p0, l0);
    const src = growing ? this.grownSource(l0, grow) : onMask ? toGray(raster.read()) : this.sourceForEdit(p0, l0);
    const doc0 = p0.doc, version = raster.version;
    const out = await this.task(() => run(src, 1));
    if (this.current !== p0 || p0.doc !== doc0 || raster.version !== version) { this.setPreview(null); this.notice(`The layer changed while ${name} ran, so it was not applied.`); return false; }
    this.applyImageEdit(name, (s, k) => (s.width === out.width && s.height === out.height ? out : fallback(s, k)), grow);
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
  private sourceForEdit(p: Project, l: Layer): ImageData {
    const r = l.raster as Raster, t = l.transform, W = p.doc.width, H = p.doc.height;
    if (!isAxisAligned(t, r.width, r.height) || (t.x <= 0 && t.y <= 0 && t.x + t.w >= W && t.y + t.h >= H)) return r.read();
    const u = unionRect({ x: t.x, y: t.y, w: t.w, h: t.h }, { x: 0, y: 0, w: W, h: H });
    if (u.w > LIMITS.side || u.h > LIMITS.side || u.w * u.h > LIMITS.pixels) return r.read();
    const m = l.mask;
    if (m?.raster && (m.placement || m.raster.width !== r.width || m.raster.height !== r.height)) return r.read();
    const nr = new Raster(u.w, u.h);
    nr.ctx.drawImage(r.canvas, t.x - u.x, t.y - u.y);
    return nr.read();
  }

  private insertAboveActive(p: Project, layer: Layer): void {
    const active = p.activeLayer;
    const layers = [...p.doc.layers];
    let index = active ? layers.indexOf(active) + 1 : layers.length;
    if (active?.isGroup) layers.forEach((l, i) => { if (l.parentId === active.id) index = Math.max(index, i + 1); });
    layers.splice(index, 0, layer);
    p.setLayers(layers);
    this.focus(p, layer.id);
  }

  private parentForNew(p: Project): ID | null {
    const active = p.activeLayer;
    return active?.isGroup ? active.id : active?.parentId ?? null;
  }

  addAdjustmentLayer(kind: AdjustmentKind): ID | null {
    let created: ID | null = null;
    this.edit(`New ${ADJUSTMENT_LABELS[kind]} Layer`, (p) => {
      const layer = newLayer(ADJUSTMENT_LABELS[kind], p.doc, { adjustment: { kind, data: defaultAdjustmentData(kind) }, parentId: this.parentForNew(p) });
      this.insertAboveActive(p, layer);
      created = layer.id;
    });
    return created;
  }

  insertRasterLayer(raster: Raster, name: string, x: number | null, y: number | null, extra: Partial<Layer> = {}, undoName = 'Paste'): void {
    this.edit(undoName, (p) => {
      const px = x ?? Math.floor((p.doc.width - raster.width) / 2), py = y ?? Math.floor((p.doc.height - raster.height) / 2);
      const layer = newLayer(name, p.doc, { raster, parentId: this.parentForNew(p), transform: { ...docTransform(raster.width, raster.height), x: px, y: py }, ...extra });
      this.insertAboveActive(p, layer);
    });
  }

  private sizeOk(width: number, height: number): boolean {
    const ok = Number.isInteger(width) && Number.isInteger(height) && width >= 1 && height >= 1 && width <= LIMITS.side && height <= LIMITS.side && width * height <= LIMITS.pixels;
    if (!ok) this.notice('Canvas sides must be 1 to 30,000 px, and the canvas at most 100 megapixels.', 'error');
    return ok;
  }

  resizeCanvas(width: number, height: number, dx: number, dy: number, fill: RGB | null = null, name = 'Canvas Size'): boolean {
    if (!this.current || !this.sizeOk(width, height)) return false;
    const ok = this.edit(name, (p) => {
      const { width: oldW, height: oldH } = p.doc;
      if (width === oldW && height === oldH && !dx && !dy) return false;
      const shift = (t: Transform): Transform => ({ ...t, x: t.x + dx, y: t.y + dy });
      let layers: Layer[] = p.doc.layers.map((l) => ({ ...l, transform: shift(l.transform), mask: l.mask?.placement ? { ...l.mask, placement: shift(l.mask.placement) } : l.mask, ...(l.artboard ? { artboard: { ...l.artboard, x: l.artboard.x + dx, y: l.artboard.y + dy } } : {}) }));
      if (fill && (width > oldW || height > oldH)) {
        const r = Raster.filled(width, height, rgbCss(fill));
        r.ctx.clearRect(dx, dy, oldW, oldH);
        layers = [newLayer('Canvas Extension', { width, height }, { raster: r }), ...layers];
      }
      p.doc = { ...p.doc, width, height, layers };
      if (p.selection) p.selection = p.selection.translated(dx, dy, width, height);
      return true;
    });
    if (ok) this.fit();
    return ok;
  }

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

  /** The Crop tool's W × H × Resolution, as Photoshop's: the crop as `straightenCrop` makes it, then the result
   *  resampled to exactly `width` by `height` pixels at `resolution` ppi, as one Crop step (history steps nest). */
  cropToSize(rect: Rect, angleDeg: number, contentAware: boolean, width: number, height: number, resolution: number): boolean {
    const p = this.current, w = Math.round(width), h = Math.round(height);
    if (!p || !this.sizeOk(w, h)) return false;
    p.history.begin('Crop', p.snapshot());
    try {
      if (!this.straightenCrop(rect, angleDeg, contentAware)) return false;
      return this.resampleImage(w, h, 'high', Math.max(1, Math.min(9600, resolution)));
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
      if (turn) {
        const a = (turn * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
        for (const l of p.doc.layers) {
          if (l.isGroup) continue;
          const t = l.transform, lx = t.x + t.w / 2 - c.x, ly = t.y + t.h / 2 - c.y;
          const next = { ...t, x: c.x + lx * cs - ly * sn - t.w / 2, y: c.y + lx * sn + ly * cs - t.h / 2, rotation: t.rotation + turn };
          p.updateLayer(l.id, { transform: next, mask: followMask(l, next) });
        }
      }
      this.resizeCanvas(r.w, r.h, -r.x, -r.y, null, 'Crop');
      if (contentAware) this.fillOpenedEdges(p);
      if (this.cropDeletePixels) this.deleteCroppedPixels(p);
      return true;
    });
  }

  /** Content-aware fill of the canvas the bottom visible pixel layer does not reach; that layer becomes canvas-sized. */
  /** The Crop tool's Delete Cropped Pixels, as Photoshop's option has it: after the crop, each pixel layer reaching past
   *  the canvas keeps only what lies on it. The layer is drawn through its own placement onto a canvas-sized raster, so
   *  an unscaled, unturned layer at whole pixels is copied exactly and a scaled or turned one is resampled once to what
   *  shows; a mask that followed the layer is pinned where it was. Smart objects, type, shapes, adjustments and folders
   *  are left whole (Photoshop does not delete pixels inside smart objects either). */
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
      if (b.w * b.h > LIMITS.pixels) { this.notice('That perspective would stretch a layer past the 100-megapixel limit. Pull the corners in a little.', 'error'); return false; }
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
      p.doc = { ...p.doc, width: W, height: H, layers: p.doc.layers.map((l) => (moved.has(l.id) ? { ...l, ...moved.get(l.id) } : l)) };
      p.selection = null;
      return true;
    });
  }

  cropTo(rect: Rect): boolean {
    const r = integral(rect);
    if (r.w < 1 || r.h < 1) return false;
    return this.resizeCanvas(r.w, r.h, -r.x, -r.y, null, 'Crop');
  }

  resampleImage(width: number, height: number, sampling: Transform['sampling'], resolution: number): boolean {
    const p0 = this.current;
    if (!p0 || !this.sizeOk(width, height)) return false;
    const sx0 = width / p0.doc.width, sy0 = height / p0.doc.height;
    const used = p0.doc.layers.reduce((n, l) => n + (l.raster ? l.raster.width * l.raster.height : 0), 0);
    if (used * sx0 * sy0 > LIMITS.pixels) { this.notice('The resized layers would exceed the 100-megapixel document limit.', 'error'); return false; }
    const scaleRaster = (r: Raster, w: number, h: number): Raster => {
      const out = new Raster(w, h);
      out.ctx.imageSmoothingEnabled = sampling !== 'nearest';
      if (sampling !== 'nearest') out.ctx.imageSmoothingQuality = sampling === 'smooth' ? 'medium' : 'high';
      out.ctx.drawImage(r.canvas, 0, 0, w, h);
      return out;
    };
    const ok = this.edit('Image Size', (p) => {
      const sx = width / p.doc.width, sy = height / p.doc.height;
      if (sx === 1 && sy === 1 && resolution === p.doc.resolution) return false;
      const scaleT = (t: Transform): Transform => ({ ...t, x: t.x * sx, y: t.y * sy, w: t.w * sx, h: t.h * sy });
      const layers = p.doc.layers.map((l) => {
        const t = scaleT(l.transform);
        const radii = l.shape ? cornerRadiiOf(l.shape) : null;
        const shape = l.shape ? { ...l.shape, cornerRadius: (Number(l.shape.cornerRadius) || 0) * Math.min(sx, sy), ...(radii ? { cornerRadii: radii.map((v) => v * Math.min(sx, sy)) } : {}) } : null;
        const raster = shape ? this.shapeRaster(shape, t.w, t.h) : l.raster ? scaleRaster(l.raster, Math.max(1, Math.round(l.raster.width * sx)), Math.max(1, Math.round(l.raster.height * sy))) : null;
        const mr = l.mask?.raster ?? null;
        const mask = l.mask ? { ...l.mask, raster: mr ? scaleRaster(mr, Math.max(1, Math.round(mr.width * sx)), Math.max(1, Math.round(mr.height * sy))) : null, placement: l.mask.placement ? scaleT(l.mask.placement) : null } : null;
        return { ...l, raster, mask, shape, transform: t, ...(l.artboard ? { artboard: { ...l.artboard, x: Math.round(l.artboard.x * sx), y: Math.round(l.artboard.y * sy), w: Math.max(1, Math.round(l.artboard.w * sx)), h: Math.max(1, Math.round(l.artboard.h * sy)) } } : {}) };
      });
      p.doc = { ...p.doc, width, height, resolution, layers };
      p.selection = null;
      return true;
    });
    if (ok) this.fit();
    return ok;
  }

  resizeSelection(delta: number): void {
    const p = this.current;
    const sel = p?.selection;
    if (!p || !sel || !delta || Math.abs(delta) > 500) return;
    const pad = delta > 0 ? Math.ceil(delta) + 2 : 1;
    let region: Rect | null = { x: sel.x - pad, y: sel.y - pad, w: sel.w + 2 * pad, h: sel.h + 2 * pad };
    if (delta > 0) region = intersectRect(region, { x: 0, y: 0, w: p.doc.width, h: p.doc.height });
    if (!region) return;
    const src = new Uint8Array(region.w * region.h);
    for (let j = 0; j < region.h; j++) for (let i = 0; i < region.w; i++) src[j * region.w + i] = sel.valueAt(region.x + i, region.y + j);
    const out = resizeMask(src, region.w, region.h, delta);
    this.applySelection(SelectionMask.cropped(region.x, region.y, region.w, region.h, out), 'replace', delta > 0 ? 'Expand Selection' : 'Contract Selection');
  }

  /** Select > Modify. Feather blurs the selection's edge with a Gaussian of half the radius (so the edge fades over
   *  about the radius each way); Border keeps a band `amount` wide centred on the edge; Smooth rounds off corners
   *  and specks by a majority vote over a square of the radius. */
  modifySelection(kind: 'feather' | 'border' | 'smooth', amount: number): void {
    const p = this.current, sel = p?.selection;
    if (!p || !sel || !(amount > 0) || amount > 500) return;
    const pad = Math.ceil(kind === 'feather' ? amount * 1.5 : amount) + 2;
    const region = intersectRect({ x: sel.x - pad, y: sel.y - pad, w: sel.w + 2 * pad, h: sel.h + 2 * pad }, { x: 0, y: 0, w: p.doc.width, h: p.doc.height });
    if (!region) return;
    const { w, h } = region, src = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) src[j * w + i] = sel.valueAt(region.x + i, region.y + j);
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
    this.applySelection(SelectionMask.cropped(region.x, region.y, w, h, out), 'replace', kind === 'feather' ? 'Feather Selection' : kind === 'border' ? 'Border Selection' : 'Smooth Selection');
  }

  selectMaskBlack(): void {
    const p = this.current;
    const l = p?.activeLayer;
    if (!p || !l?.mask) { this.notice('The active layer has no mask.'); return; }
    const m = l.mask;
    const t = m.placement ?? l.transform;
    const b = m.raster ? intersectRect(integral(transformBounds(t)), { x: 0, y: 0, w: p.doc.width, h: p.doc.height }) : null;
    if (!m.raster || !b) { this.applySelection(null, 'replace', "Mask's Black Areas"); return; }
    const s = createSurface(b.w, b.h);
    const c = ctxOf(s);
    setMat(c, mul(translation(-b.x, -b.y), placement(t, m.raster.width, m.raster.height)));
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, m.raster.width, m.raster.height);
    c.globalCompositeOperation = 'destination-out';
    c.drawImage(m.raster.canvas, 0, 0);
    this.applySelection(SelectionMask.fromAlpha(b.x, b.y, b.w, b.h, c.getImageData(0, 0, b.w, b.h).data), 'replace', "Mask's Black Areas");
  }

  /** The active layer's pixels (or its mask as gray, or with `merged` the visible image) inside the selection, or the
   *  whole canvas without one, rendered over the selection's region. Copy and Layer via Copy share it. */
  private selectedPixels(merged: boolean): { surface: Surface; region: Rect } | null {
    const p = this.current;
    if (!p) return null;
    const docRect = { x: 0, y: 0, w: p.doc.width, h: p.doc.height };
    const region = p.selection ? intersectRect(integral(p.selection.rect), docRect) : docRect;
    if (!region) return null;
    const s = createSurface(region.w, region.h);
    const c = ctxOf(s);
    if (merged) this.work.render({ doc: p.doc, target: s, view: translation(-region.x, -region.y), quality: 'high' });
    else {
      const l = p.activeLayer;
      if (!l || l.isGroup || l.adjustment) { this.notice('Select a pixel layer to copy.'); return null; }
      const onMask = p.maskTarget && !!l.mask;
      const r = onMask ? l.mask?.raster ?? null : l.raster;
      if (onMask && !r) { c.fillStyle = '#ffffff'; c.fillRect(0, 0, region.w, region.h); }
      else if (r) {
        const t = onMask ? l.mask?.placement ?? l.transform : l.transform;
        setMat(c, mul(translation(-region.x, -region.y), placement(t, r.width, r.height)));
        c.drawImage(r.canvas, 0, 0);
        c.setTransform(1, 0, 0, 1, 0, 0);
        if (onMask) c.putImageData(toGray(c.getImageData(0, 0, region.w, region.h)), 0, 0);
      }
    }
    if (p.selection) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'destination-in';
      c.drawImage(p.selection.surface(), p.selection.x - region.x, p.selection.y - region.y);
      c.globalCompositeOperation = 'source-over';
    }
    return { surface: s, region };
  }

  copySelection(merged: boolean): boolean {
    const got = this.selectedPixels(merged);
    if (!got) return false;
    const { surface: s, region } = got;
    this.clipboard = { surface: s, x: region.x, y: region.y, w: region.w, h: region.h, stamp: uid() };
    this.emit('options', null);
    return true;
  }

  private nextLayerName(p: Project): string {
    const names = new Set(p.doc.layers.map((l) => l.name));
    let n = 1;
    while (names.has(`Layer ${n}`)) n += 1;
    return `Layer ${n}`;
  }

  /** the Cmd-J: with a selection, its pixels on the active layer (or its mask, as gray) become a new layer in
   *  place as one Layer via Copy step, leaving the clipboard alone; without a selection the layer is duplicated. */
  layerViaCopy(): void {
    const p = this.current;
    if (!p) return;
    if (!p.selection) { this.duplicateLayers(); return; }
    this.settle();
    const got = this.selectedPixels(false);
    if (!got) return;
    this.insertRasterLayer(Raster.from(got.surface, got.region.w, got.region.h), this.nextLayerName(p), got.region.x, got.region.y, {}, 'Layer via Copy');
  }

  cutSelection(): void {
    if (!this.current?.selection) { this.notice('Cut needs a selection.'); return; }
    if (this.copySelection(false)) this.clearPixels();
  }

  pasteClipboard(): boolean {
    const cb = this.clipboard;
    if (!cb) return false;
    if (!this.current) {
      this.addProject({ id: uid(), width: cb.w, height: cb.h, resolution: 72, layers: [] }, 'Pasted');
      this.insertRasterLayer(Raster.from(cb.surface, cb.w, cb.h), 'Pasted Layer', 0, 0);
      return true;
    }
    this.insertRasterLayer(Raster.from(cb.surface, cb.w, cb.h), 'Pasted Layer', cb.x, cb.y);
    return true;
  }

  beginGradient(pt: Pt): boolean {
    const p = this.current;
    if (!p || this.stroke) return false;
    this.settle();
    if (!this.paintable(p.activeLayer)) { this.notice('Select a pixel layer for the gradient.'); return false; }
    if (this.smartLocked(p)) return false;
    p.history.begin('Gradient', p.snapshot());
    const pick = this.target(p) as NonNullable<ReturnType<Engine['target']>>;
    this.gradient = { project: p, layerId: pick.layer.id, target: pick.target, start: pt, end: pt, raster: pick.raster, local: pick.local, surface: createSurface(pick.raster.width, pick.raster.height) };
    this.renderGradient();
    return true;
  }

  updateGradient(start?: Pt, end?: Pt): void {
    const g = this.gradient;
    if (!g) return;
    if (start) g.start = start;
    if (end) g.end = end;
    this.renderGradient();
  }

  renderGradient(): void {
    const g = this.gradient;
    if (!g) return;
    const { raster, local } = g;
    const w = raster.width, h = raster.height;
    const c = ctxOf(g.surface);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, w, h);
    const mask = g.target === 'mask';
    if (mask) c.putImageData(toGray(raster.read()), 0, 0);
    else c.drawImage(raster.canvas, 0, 0);
    const layer = createSurface(w, h);
    const lc = ctxOf(layer);
    setMat(lc, invert(local));
    const st = this.gradientSettings;
    const tone = (col: RGB): RGB => { const v = Math.round(luminance(col) * 255); return { r: v, g: v, b: v }; };
    const fg = mask ? tone(this.fg) : this.fg, bg = mask ? tone(this.bg) : this.bg;
    const stops = resolveStops(presetById(st.style), fg, bg, st.reversed);
    const a = g.start, b = g.end;
    const len = Math.max(0.5, Math.hypot(b.x - a.x, b.y - a.y));
    const bb = boundsOf([applyMat(local, 0, 0), applyMat(local, w, 0), applyMat(local, w, h), applyMat(local, 0, h)]);
    if (st.shape === 'diamond') {
      const img = new ImageData(w, h);
      diamondFill(img, (x, y) => applyMat(local, x, y), a, b, stops);
      lc.save();
      lc.setTransform(1, 0, 0, 1, 0, 0);
      lc.putImageData(img, 0, 0);
      lc.restore();
    } else {
      const grad = st.shape === 'radial' ? lc.createRadialGradient(a.x, a.y, 0, a.x, a.y, len)
        : st.shape === 'angle' ? lc.createConicGradient(Math.atan2(b.y - a.y, b.x - a.x), a.x, a.y)
        : st.shape === 'reflected' ? lc.createLinearGradient(2 * a.x - b.x, 2 * a.y - b.y, b.x, b.y)
        : lc.createLinearGradient(a.x, a.y, len > 0.5 ? b.x : a.x + 0.5, b.y);
      for (const s of st.shape === 'reflected' ? reflectStops(stops) : stops) grad.addColorStop(s.at, rgbCss(s.rgb, s.alpha));
      lc.fillStyle = grad;
      lc.fillRect(bb.x - 1, bb.y - 1, bb.w + 2, bb.h + 2);
    }
    if (st.dither) {
      // Dither: each colour channel moved by up to one level either way, by a fixed hash of the pixel so the preview and
      // the commit agree. The canvas has already rounded the gradient to whole levels, so smaller offsets would round
      // back; a level of grain breaks the steps of a slow gradient into grain too fine to see as bands.
      const img = lc.getImageData(0, 0, w, h), d = img.data;
      for (let i = 0; i < w * h; i++) {
        let hsh = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
        for (let ch = 0; ch < 3; ch++) {
          hsh = Math.imul(hsh ^ (hsh >>> 13), 0xc2b2ae35);
          const k = i * 4 + ch, v = d[k] + 2 * ((hsh >>> 8) / 16777216 - 0.5);
          d[k] = Math.max(0, Math.min(255, Math.round(v)));
        }
      }
      lc.putImageData(img, 0, 0);
    }
    const sel = g.project.selection;
    if (sel) {
      setMat(lc, mul(invert(local), translation(sel.x, sel.y)));
      lc.globalCompositeOperation = 'destination-in';
      lc.drawImage(sel.surface(), 0, 0);
    }
    c.globalAlpha = st.opacity;
    c.globalCompositeOperation = mask ? 'source-over' : compositeOp(st.blend);
    c.drawImage(layer, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    if (mask) c.putImageData(fromGray(c.getImageData(0, 0, w, h)), 0, 0);
    this.emit('render', null);
    this.emit('overlay', null);
  }

  commitGradient(): void {
    const g = this.gradient;
    if (!g) return;
    this.gradient = null;
    if (Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y) < 1) {
      const before = g.project.history.abort();
      if (before) { g.project.doc = before.doc; g.project.selection = before.selection; }
      this.refresh();
      return;
    }
    const r = g.raster;
    const before = r.read();
    r.ctx.save();
    r.ctx.setTransform(1, 0, 0, 1, 0, 0);
    r.ctx.globalCompositeOperation = 'copy';
    r.ctx.drawImage(g.surface, 0, 0);
    r.ctx.restore();
    r.touch();
    g.project.history.addPatch({ raster: r, x: 0, y: 0, before, after: r.read() });
    if (g.target === 'pixels' && g.project.layer(g.layerId)?.shape) g.project.updateLayer(g.layerId, { shape: null });
    g.project.history.end(g.project.snapshot());
    this.refresh();
  }

  cancelGradient(): void {
    const g = this.gradient;
    if (!g) return;
    this.gradient = null;
    const before = g.project.history.abort();
    if (before) { g.project.doc = before.doc; g.project.selection = before.selection; }
    this.refresh();
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
    const ch = (v: unknown): number => Math.round(clamp(Number(v) || 0, 0, 1) * 255);
    c.fillStyle = `rgb(${ch(style.red)},${ch(style.green)},${ch(style.blue)})`;
    c.beginPath();
    if (style.kind === 'Ellipse') c.ellipse(r.width / 2, r.height / 2, r.width / 2, r.height / 2, 0, 0, Math.PI * 2);
    else {
      // Live corners: four radii (top left, top right, bottom right, bottom left) when set, else one for all; each is
      // held to half the shorter side, as Photoshop holds them.
      const cap = Math.min(r.width, r.height) / 2, radii = cornerRadiiOf(style);
      c.roundRect(0, 0, r.width, r.height, radii ? radii.map((v) => Math.min(v, cap)) : Math.min(Number(style.cornerRadius) || 0, cap));
    }
    c.fill();
    return r;
  }

  createShape(rect: Rect): void {
    const r = integral(rect);
    if (r.w < 1 || r.h < 1 || !this.current) return;
    const st = this.shapeSettings;
    const kind = st.kind === 'ellipse' ? 'Ellipse' : 'Rectangle';
    const style = { kind, red: this.fg.r / 255, green: this.fg.g / 255, blue: this.fg.b / 255, cornerRadius: st.kind === 'rectangle' ? st.cornerRadius : 0 };
    this.insertRasterLayer(this.shapeRaster(style, r.w, r.h), kind, r.x, r.y, { shape: style }, kind);
  }

  retouch: { healMode: HealMode; cloneAligned: boolean; cloneSampleAll: boolean; smearMode: 'blur' | 'sharpen' | 'smudge' | 'liquify'; cloneScale: number; cloneAngle: number; cloneFlipH: boolean; cloneFlipV: boolean; patchMode: 'normal' | 'contentAware'; patchFrom: 'source' | 'destination'; patchTransparent: boolean; patchDiffusion: number; patchStructure: number; patchColor: number; healDiffusion: number; healBlendMode: HealBlend; spotBlendMode: HealBlend; healSample: HealSample; spotSampleAll: boolean; patchSampleAll: boolean; healSource: 'sampled' | 'pattern'; healPattern: ID | null; patchPattern: ID | null } = { healMode: 'contentAware', cloneAligned: true, cloneSampleAll: false, smearMode: 'blur', cloneScale: 100, cloneAngle: 0, cloneFlipH: false, cloneFlipV: false, patchMode: 'normal', patchFrom: 'source', patchTransparent: false, patchDiffusion: 7, patchStructure: 5, patchColor: 10, healDiffusion: 7, healBlendMode: 'normal', spotBlendMode: 'normal', healSample: 'current', spotSampleAll: false, patchSampleAll: false, healSource: 'sampled', healPattern: null, patchPattern: null };

  /** Clone Source: where a document point's source moves once scaled, rotated and flipped about `pivot` (the sample
   *  point), as a matrix taking source pixels to where they are painted from; null when all are neutral. Painting at
   *  50 percent paints the source at half size, as Photoshop's W and H do. */
  private cloneTransform(pivot: Pt): Mat | null {
    const r = this.retouch, s = Math.min(1000, Math.max(1, r.cloneScale)) / 100;
    if (s === 1 && !(r.cloneAngle % 360) && !r.cloneFlipH && !r.cloneFlipV) return null;
    const a = mul(rotation((r.cloneAngle * Math.PI) / 180), scaling(s * (r.cloneFlipH ? -1 : 1), s * (r.cloneFlipV ? -1 : 1)));
    return mul(translation(pivot.x, pivot.y), mul(a, translation(-pivot.x, -pivot.y)));
  }
  cloneSource: Pt | null = null;
  cloneOffset: Pt | null = null;
  /** The Clone Source panel's five sources, as Photoshop's (Adobe's "Clone Source panel"; Breathing Color): Alt-click
   *  sets the chosen slot's source, and each slot keeps its own point, scale, angle and flips, restored on choosing it. */
  cloneSlots: Array<{ source: Pt; scale: number; angle: number; flipH: boolean; flipV: boolean } | null> = [null, null, null, null, null];
  cloneSlot = 0;
  /** The overlay: Show Overlay; Clipped (on by default) keeps it to the brush, off shows the whole source as a stroke
   *  would copy it; its opacity; Auto Hide hides it while painting (KelbyOne's Planet Photoshop; Ben Willmore). */
  cloneOverlay = { show: true, clipped: true, opacity: 1, autoHide: false };
  private cloneFullCache: { key: string; image: Surface } | null = null;
  private warpState: { project: Project; layerId: ID; stroke: WarpStroke; surface: Surface; image: ImageData } | null = null;

  get warping(): boolean { return this.warpState !== null; }

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
    const all = this.retouch.cloneSampleAll, key = [all, l.id, p.history.revision, p.id].join('|');
    if (this.cloneFullCache?.key !== key) {
      const image = all ? renderDoc(this.work, p.doc, null) : l.raster ? l.raster.canvas : null;
      if (!image) return null;
      this.cloneFullCache = { key, image };
    }
    const place = all || !l.raster ? [1, 0, 0, 1, 0, 0] as Mat : placement(l.transform, l.raster.width, l.raster.height);
    const m = mul(mul(translation(at.x - sp.x, at.y - sp.y), this.cloneTransform(sp) ?? [1, 0, 0, 1, 0, 0]), place);
    return { image: this.cloneFullCache.image, m };
  }

  cloneStrokeOffset(pt: Pt): Pt | null {
    const src = this.cloneSource;
    if (!src) return null;
    return (this.retouch.cloneAligned ? this.cloneOffset : null) ?? { x: Math.round(src.x - pt.x), y: Math.round(src.y - pt.y) };
  }

  /** what a Clone Stamp click at `at` would stamp, the source around `clonePoint(at)`
   *  rendered for just the brush circle at `scale` screen pixels per document pixel (from the whole document or the
   *  active layer alone, as the stroke samples), faded by the brush tip as hardness sets it. Reused until the sample
   *  point, brush, zoom, layer, sampling mode or document changes. Null with no source, or during a stroke. */
  private clonePreviewCache: { key: string; surface: Surface } | null = null;

  clonePreview(at: Pt, scale: number): Surface | null {
    const p = this.current, l = p?.activeLayer, sp = this.clonePoint(at);
    if (!p || !l || !sp || this.stroke) return null;
    const d = this.brush.diameter, side = Math.min(1024, Math.max(1, Math.ceil(d * scale)));
    const r0 = this.retouch, key = [sp.x.toFixed(2), sp.y.toFixed(2), d, this.brush.hardness, side, r0.cloneSampleAll, l.id, p.history.revision, r0.cloneScale, r0.cloneAngle, r0.cloneFlipH, r0.cloneFlipV].join('|');
    if (this.clonePreviewCache?.key === key) return this.clonePreviewCache.surface;
    const s = createSurface(side, side), c = ctxOf(s), per = side / d, tm = this.cloneTransform(sp);
    const view = mul(mul(scaling(per, per), translation(d / 2 - sp.x, d / 2 - sp.y)), tm ?? [1, 0, 0, 1, 0, 0]);
    if (this.retouch.cloneSampleAll) this.work.render({ doc: p.doc, target: s, view, quality: 'medium' });
    else if (l.raster) { setMat(c, mul(view, placement(l.transform, l.raster.width, l.raster.height))); c.drawImage(l.raster.canvas, 0, 0); c.setTransform(1, 0, 0, 1, 0, 0); }
    const r = side / 2, tip = c.createRadialGradient(r, r, r * Math.min(0.999, Math.max(0, this.brush.hardness)), r, r, r);
    tip.addColorStop(0, 'rgba(0,0,0,1)');
    tip.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalCompositeOperation = 'destination-in';
    c.fillStyle = tip;
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

  private layerSample(p: Project, layer: Layer, sigma = 0): Surface {
    const W = p.doc.width, H = p.doc.height;
    const s = createSurface(W, H);
    const c = ctxOf(s);
    if (layer.raster) { setMat(c, placement(layer.transform, layer.raster.width, layer.raster.height)); c.drawImage(layer.raster.canvas, 0, 0); c.setTransform(1, 0, 0, 1, 0, 0); }
    if (sigma > 0) c.putImageData(gaussianBlur(c.getImageData(0, 0, W, H), sigma), 0, 0);
    return s;
  }

  /** the blurSample for a mask: the mask as the canvas shows it at document size (white, the level in alpha),
   *  softened by `sigma`. Past its pixels a mask keeps its edge tone, white or black by whether its border averages
   *  half or more (`LayerMask.background`), so blurring near its edge does not pull in the wrong value. */
  private maskBlurSample(p: Project, layer: Layer, sigma: number): Surface {
    const W = p.doc.width, H = p.doc.height, m = layer.mask, r = m?.raster;
    const s = createSurface(W, H), c = ctxOf(s);
    let edge = 1;
    if (r) {
      const d = r.read().data, w = r.width, h = r.height;
      let total = 0, count = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (y !== 0 && y !== h - 1 && x !== 0 && x !== w - 1) continue;
          total += d[(y * w + x) * 4 + 3];
          count++;
        }
      }
      edge = total * 2 >= count * 255 ? 1 : 0;
    }
    c.fillStyle = `rgba(255, 255, 255, ${edge})`;
    c.fillRect(0, 0, W, H);
    if (m && r) {
      setMat(c, placement(m.placement ?? layer.transform, r.width, r.height));
      c.clearRect(0, 0, r.width, r.height);
      c.drawImage(r.canvas, 0, 0);
      c.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (sigma > 0) c.putImageData(gaussianBlur(c.getImageData(0, 0, W, H), sigma), 0, 0);
    return s;
  }

  beginRetouchStroke(kind: 'heal' | 'remove' | 'clone' | 'blur' | 'sharpen' | 'healBrush' | 'dodge' | 'burn' | 'sponge' | 'historyBrush', pt: Pt, shift: boolean): boolean {
    const p = this.current;
    if (!p || this.stroke || this.warpState) return false;
    this.settle();
    const l0 = p.activeLayer;
    if (!this.paintable(l0)) { this.notice('Select a pixel layer first.'); return false; }
    if (this.smartLocked(p)) return false;
    const onMask = p.maskTarget && !!l0.mask;
    if (onMask && kind !== 'blur') { this.notice('This tool works on layer pixels. Click the layer thumbnail to target them.'); return false; }
    let texture: { surface: Surface; dx: number; dy: number } | null = null;
    if (kind === 'clone' || kind === 'healBrush') {
      // Source: Pattern (the Healing Brush) heals from the chosen pattern tiled over the document; no source to set.
      const pattern = kind === 'healBrush' && this.retouch.healSource === 'pattern' ? this.patternSurface(this.retouch.healPattern, p) : null;
      const off = pattern ? { x: 0, y: 0 } : this.cloneStrokeOffset(pt);
      if (!off) { this.notice(`Alt-click to set where ${kind === 'clone' ? 'Clone Stamp' : 'the Healing Brush'} copies from.`); return false; }
      if (!pattern) this.cloneOffset = off;
      texture = { surface: pattern ?? (kind === 'healBrush' ? this.healSampleSurface(p, l0, this.retouch.healSample) : this.retouch.cloneSampleAll ? renderDoc(this.work, p.doc) : this.layerSample(p, l0)), dx: off.x, dy: off.y };
      const m = kind === 'clone' && this.cloneSource ? this.cloneTransform(this.cloneSource) : null;
      if (m) {
        const t = createSurface(texture.surface.width, texture.surface.height), tc = ctxOf(t);
        setMat(tc, m);
        tc.drawImage(texture.surface, 0, 0);
        tc.setTransform(1, 0, 0, 1, 0, 0);
        texture = { surface: t, dx: off.x, dy: off.y };
      }
    } else if (kind === 'blur') {
      const sigma = clamp(this.brush.diameter / 10, 1.5, 30);
      texture = { surface: onMask ? this.maskBlurSample(p, l0, sigma) : this.layerSample(p, l0, sigma), dx: 0, dy: 0 };
    } else if (kind === 'sharpen') {
      const src = this.layerSample(p, l0), W = src.width, H = src.height, out = createSurface(W, H);
      ctxOf(out).putImageData(sharpenSample(ctxOf(src).getImageData(0, 0, W, H), clamp(this.brush.diameter / 40, 0.8, 4)), 0, 0);
      texture = { surface: out, dx: 0, dy: 0 };
    } else if (kind === 'dodge' || kind === 'burn' || kind === 'sponge') texture = { surface: this.toned(this.layerSample(p, l0), kind), dx: 0, dy: 0 };
    else if (kind === 'historyBrush') {
      // The History Brush paints this layer back from the source snapshot's own copy of it, in document space.
      const id = this.historyBrushSourceId, snap = id ? this.historySnapshots.get(p)?.find((x) => x.id === id) : undefined;
      const src = snap?.state.doc.layers.find((l) => l.id === l0.id);
      if (!snap) { this.notice('The History Brush paints from a snapshot: take one in the History panel (New Snapshot).'); return false; }
      if (!src?.raster) { this.notice(`${snap.name} has no layer matching this one, so the History Brush cannot paint it back; choose another source in the History panel.`); return false; }
      texture = { surface: this.layerSample(p, src), dx: 0, dy: 0 };
    }
    p.history.begin({ heal: 'Spot Healing', remove: 'Remove', clone: 'Clone Stamp', healBrush: 'Healing Brush', blur: 'Blur', sharpen: 'Sharpen', dodge: 'Dodge', burn: 'Burn', sponge: 'Sponge', historyBrush: 'History Brush' }[kind], p.snapshot());
    const pick = this.target(p) as NonNullable<ReturnType<Engine['target']>>;
    const white = { r: 255, g: 255, b: 255 };
    const style = kind === 'heal' || kind === 'remove' ? { ...this.brush, opacity: 0.45, color: white } : { ...this.brush, color: white };
    const s = new PixelStroke(pick.raster, pick.local, style, pick.target !== 'mask' && l0.locks?.transparency ? 'source-atop' : 'source-over', p.selection, texture, pick.target === 'mask');   // Lock Transparency
    // The Healing Brush heals from the same offset at release, in the layer's own pixels.
    let healFrom: Pt | undefined;
    if (kind === 'healBrush' && texture) {
      const toLayer = invert(pick.local), a = applyMat(toLayer, pt.x, pt.y), b = applyMat(toLayer, pt.x + texture.dx, pt.y + texture.dy);
      healFrom = { x: Math.round(b.x - a.x), y: Math.round(b.y - a.y) };
    }
    this.stroke = { project: p, layerId: pick.layer.id, target: pick.target, s, heal: kind === 'heal' ? this.retouch.healMode : kind === 'remove' ? 'remove' : undefined, healFrom };
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
    const layers = p.doc.layers, at = layers.findIndex((x) => x.id === l.id), ancestors = new Set<ID>();
    for (let a = l.parentId; a; a = layers.find((x) => x.id === a)?.parentId ?? null) ancestors.add(a);
    const overrides = new Map<ID, LayerOverride>();
    layers.forEach((x, i) => { if (i > at && !ancestors.has(x.id)) overrides.set(x.id, { hidden: true }); });
    const s = createSurface(p.doc.width, p.doc.height);
    this.work.render({ doc: p.doc, target: s, view: [1, 0, 0, 1, 0, 0], overrides, quality: 'high' });
    return s;
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
    const r = s.raster;
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
   *  meet the selection's edge, as one undo step. Destination (Photoshop's Patch: Destination) copies the selection
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
    const r = s.raster, W = r.width, H = r.height, before = r.read(), pm = premultiply(before.data), cov = s.coverageAlpha(), hole0 = new Uint8Array(W * H);
    for (let i = 0; i < hole0.length; i++) hole0[i] = cov[i] > 0 ? 255 : 0;
    const grown = resizeMask(hole0, W, H, 2), hole = new Uint8Array(W * H);
    for (let i = 0; i < hole.length; i++) hole[i] = grown[i] >= 128 ? 1 : 0;
    if (!contentFill(pm, hole, W, H)) { this.notice('There is nothing opaque around the stroke to fill from.'); return null; }
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
    const r = s.raster;
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
    const p = this.current;
    if (!p || this.stroke || this.warpState) return false;
    this.settle();
    const l0 = p.activeLayer;
    if (!this.paintable(l0) || !l0.raster) { this.notice('Select a layer with pixels first.'); return false; }
    if (this.smartLocked(p)) return false;
    if (p.maskTarget && l0.mask) { this.notice('Smudge and Liquify work on layer pixels. Click the layer thumbnail to target them.'); return false; }
    p.history.begin(mode === 'smudge' ? 'Smudge' : 'Liquify', p.snapshot());
    const pick = this.target(p) as NonNullable<ReturnType<Engine['target']>>;
    const W = p.doc.width, H = p.doc.height;
    const surface = this.layerSample(p, pick.layer);
    const image = ctxOf(surface).getImageData(0, 0, W, H);
    const stroke = new WarpStroke(premultiply(image.data), W, H, mode, this.brush.diameter, this.brush.hardness, this.brush.opacity);
    this.warpState = { project: p, layerId: pick.layer.id, stroke, surface, image };
    stroke.append(pt);
    this.emit('render', null);
    return true;
  }

  warpTo(pt: Pt): void {
    const w = this.warpState;
    if (!w) return;
    const r = w.stroke.append(pt);
    if (!r) return;
    const W = w.stroke.width;
    for (let y = r.y; y < r.y + r.h; y++) unpremultiply(w.stroke.pixels, w.image.data, (y * W + r.x) * 4, (y * W + r.x + r.w) * 4);
    ctxOf(w.surface).putImageData(w.image, 0, 0, r.x, r.y, r.w, r.h);
    this.emit('render', null);
  }

  endWarp(): void {
    const w = this.warpState;
    if (!w) return;
    this.warpState = null;
    const p = w.project;
    const l = p.layer(w.layerId);
    if (!l?.raster || !w.stroke.points.length) {
      const before = p.history.abort();
      if (before) { p.doc = before.doc; p.selection = before.selection; }
      this.refresh();
      return;
    }
    const W = p.doc.width, H = p.doc.height;
    const cov = createSurface(W, H);
    const cc = ctxOf(cov);
    cc.fillStyle = '#ffffff';
    for (const q of w.stroke.points) { cc.beginPath(); cc.arc(q.x, q.y, w.stroke.radius, 0, Math.PI * 2); cc.fill(); }
    if (p.selection) { cc.globalCompositeOperation = 'destination-in'; cc.drawImage(p.selection.surface(), p.selection.x, p.selection.y); }
    const piece = createSurface(W, H);
    const pc = ctxOf(piece);
    pc.drawImage(w.surface, 0, 0);
    pc.globalCompositeOperation = 'destination-in';
    pc.drawImage(cov, 0, 0);
    const r = l.raster;
    const before = r.read();
    const c = r.ctx;
    c.save();
    setMat(c, invert(placement(l.transform, r.width, r.height)));
    c.globalCompositeOperation = 'destination-out';
    c.drawImage(cov, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.drawImage(piece, 0, 0);
    c.restore();
    r.touch();
    p.history.addPatch({ raster: r, x: 0, y: 0, before, after: r.read() });
    if (l.shape) p.updateLayer(l.id, { shape: null });
    p.history.end(p.snapshot());
    this.refresh();
  }

  cancelWarp(): void {
    const w = this.warpState;
    if (!w) return;
    this.warpState = null;
    const before = w.project.history.abort();
    if (before) { w.project.doc = before.doc; w.project.selection = before.selection; }
    this.refresh();
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
    const base: Doc = { id: uid(), width: img.width, height: img.height, resolution: 72, layers: [] };
    const layer = { ...newLayer('Background', base), raster: Raster.from(img.source, img.width, img.height) };
    return this.addProject({ ...base, layers: [layer] }, img.name.replace(/\.[^.]+$/, '') || 'Image', layer.id);
  }

  /** Upscale: what the document shows, enlarged `scale` times by `run`, opened as a new document. */
  async upscaleToDocument(scale: number, run: (image: Blob) => Promise<Blob>): Promise<boolean> {
    const p = this.current, view = this.flattened();
    if (!p || !view) return false;
    const W = p.doc.width * scale, H = p.doc.height * scale;
    if (W > LIMITS.side || H > LIMITS.side || W * H > LIMITS.pixels) { this.notice(`Upscaled ${scale} times, this image would pass 30,000 px a side or 100 megapixels.`, 'error'); return false; }
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
    if (this.current !== p) { this.notice(`The document changed while generating, so the ${undoName} result was not placed.`, 'error'); return false; }
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

  contentAwareFill(): void {
    const p0 = this.current;
    if (!p0?.selection) { this.notice('Content-Aware Fill needs a selection.'); return; }
    if (!this.paintable(p0.activeLayer)) { this.notice('Select a pixel layer first.'); return; }
    this.regionEdit('Content-Aware Fill', ({ raster, target, rect }) => {
      const p = this.current as Project, l = p.activeLayer as Layer;
      const cov = this.coverageFor(p, l, target, raster.width, raster.height);
      if (!cov) return;
      const src = target === 'mask' ? toGray(raster.read()) : raster.read();
      const pm = premultiply(src.data);
      const mask = new Uint8Array(raster.width * raster.height);
      for (let i = 0; i < mask.length; i++) mask[i] = cov[i * 4 + 3] ? 1 : 0;
      if (!contentFill(pm, mask, raster.width, raster.height)) { this.notice('There is nothing opaque around the selection to fill from.'); return; }
      const out = new ImageData(raster.width, raster.height);
      unpremultiply(pm, out.data);
      let result = this.blendThrough(src, out, cov);
      if (target === 'mask') result = fromGray(result);
      raster.ctx.putImageData(result, 0, 0, rect.x, rect.y, rect.w, rect.h);
    });
  }

  /** The Content-Aware Fill workspace's OK: fills the selection on the active layer, sampling only from `allowDoc`
   *  (1 where sampling is allowed, over the whole canvas) when given, and sends the result to the current layer, a
   *  new layer holding only the filled pixels (for an upright, unscaled layer), or a duplicate of the layer. One step. */
  contentAwareFillWith(allowDoc: Uint8Array | null, output: 'current' | 'new' | 'duplicate'): void {
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
      if (!contentFill(pm, hole, r.width, r.height, allow)) { this.notice('There is nothing opaque in the sampling area to fill from.'); return false; }
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

  private snapMove(p: Project, id: ID, t: Transform, moving?: ReadonlySet<ID>): Transform {
    const tol = 6 / p.viewport.zoom;
    const xs = [0, p.doc.width / 2, p.doc.width], ys = [0, p.doc.height / 2, p.doc.height];
    for (const e of hierarchy(p.doc)) {
      const l = e.layer;
      if (!e.visible || l.isGroup || !l.raster || l.id === id || moving?.has(l.id)) continue;
      const b = this.snapBox(l, l.transform);
      xs.push(Math.round(b.x), Math.round(b.x + b.w / 2), Math.round(b.x + b.w));
      ys.push(Math.round(b.y), Math.round(b.y + b.h / 2), Math.round(b.y + b.h));
    }
    const self = p.layer(id), b = self ? this.snapBox(self, t) : transformBounds(t);
    if (this.view.guides) for (const g of p.doc.guides ?? []) (g.axis === 'x' ? xs : ys).push(g.at);
    if (this.view.grid) {
      const sub = Math.max(1, this.view.gridSpacing / Math.max(1, this.view.gridSubdivisions));
      for (const e of [b.x, b.x + b.w / 2, b.x + b.w]) xs.push(Math.round(e / sub) * sub);
      for (const e of [b.y, b.y + b.h / 2, b.y + b.h]) ys.push(Math.round(e / sub) * sub);
    }
    const pick = (edges: number[], targets: number[]): { d: number; at: number } | null => {
      let best: { d: number; at: number } | null = null;
      for (const edge of edges) for (const g of targets) {
        const d = g - edge;
        if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: g };
      }
      return best;
    };
    const sx = pick([b.x, b.x + b.w / 2, b.x + b.w], xs), sy = pick([b.y, b.y + b.h / 2, b.y + b.h], ys);
    this.snapGuides = sx || sy ? { xs: sx ? [sx.at] : [], ys: sy ? [sy.at] : [] } : null;
    return sx || sy ? { ...t, x: t.x + (sx?.d ?? 0), y: t.y + (sy?.d ?? 0) } : t;
  }

  setLayerTransform(patch: Partial<Transform>, name = 'Transform Layer'): void {
    if (this.locked(this.activeLayer, 'position')) return;
    const fs = this.floatSel, cur = this.current;
    if (fs && cur === fs.project && cur.activeId === fs.floatingId) {
      const l = cur.activeLayer, next: Transform | null = l ? { ...l.transform, ...patch } : null;
      if (l && next && next.w >= 1 && next.h >= 1 && [next.x, next.y, next.w, next.h, next.rotation].every(Number.isFinite) && !sameTransform(next, l.transform)) { cur.updateLayer(l.id, { transform: next }); this.refresh(); }
      return;
    }
    this.edit(name, (p) => {
      const l = p.activeLayer;
      if (!l || l.isGroup || !l.raster) return false;
      const next: Transform = { ...l.transform, ...patch };
      if (!(next.w >= 1 && next.h >= 1) || ![next.x, next.y, next.w, next.h, next.rotation].every(Number.isFinite) || sameTransform(next, l.transform)) return false;
      const redraw = !!l.shape && (Math.round(next.w) !== l.raster.width || Math.round(next.h) !== l.raster.height);
      p.updateLayer(l.id, { transform: next, mask: followMask(l, next), ...(redraw && l.shape ? { raster: this.shapeRaster(l.shape, next.w, next.h) } : {}) });
      return true;
    });
  }

  resizeLayerTo(value: number, width: boolean): void {
    const l = this.activeLayer;
    if (!l || l.isGroup || !l.raster || !(value >= 1)) return;
    const t = l.transform, ratio = t.w / t.h;
    const w = width ? value : this.lockRatio ? value * ratio : t.w;
    const h = width ? (this.lockRatio ? value / ratio : t.h) : value;
    this.setLayerTransform({ w, h, x: t.x + t.w / 2 - w / 2, y: t.y + t.h / 2 - h / 2 }, 'Resize Layer');
  }

  scaleLayerTo(percent: number): void {
    const l = this.activeLayer;
    if (!l || l.isGroup || !l.raster || !(percent > 0)) return;
    const t = l.transform, w = (l.raster.width * percent) / 100, h = (l.raster.height * percent) / 100;
    this.setLayerTransform({ w, h, x: t.x + t.w / 2 - w / 2, y: t.y + t.h / 2 - h / 2 }, 'Scale Layer');
  }

  private floating: { project: Project; layerId: ID; raster: Raster; local: Mat; base: Surface; work: Surface; piece: Surface; region: Rect; dx: number; dy: number; selection: SelectionMask; duplicate: boolean } | null = null;

  get movingPixels(): boolean { return this.floating !== null; }

  /** the mapPath for Transform Selection: while selected pixels float, the selection they came from and the
   *  matrix carrying it with the floating pixels' transform (the live draft while dragging), so the ants keep matching
   *  them. Null when no affine map fits: a pending or applied distortion of the floating pixels. */
  floatingOutline(p: Project): { selection: SelectionMask; m: Mat } | null {
    const f = this.floatSel, l = f && f.project === p ? p.layer(f.floatingId) : null, dz = this.distortEdit;
    if (!f || !l?.raster || l.raster.width !== f.region.w || l.raster.height !== f.region.h) return null;
    if (dz && dz.project === p && (dz.layerId === f.floatingId || dz.members?.includes(f.floatingId))) return null;
    const te = this.transformEdit;
    const now = te && te.project === p && te.layerId === f.floatingId && !te.mask && !te.group ? te.draft : l.transform;
    return { selection: f.selection, m: mul(placement(now, f.region.w, f.region.h), invert(placement(f.original, f.region.w, f.region.h))) };
  }

  outlineShift(p: Project): { dx: number; dy: number } | null {
    if (this.selectionShift?.project === p) return this.selectionShift;
    const f = this.floating;
    return f && f.project === p ? { dx: f.dx, dy: f.dy } : null;
  }

  beginPixelMove(duplicate: boolean): boolean {
    const p = this.current;
    const sel = p?.selection;
    if (!p || !sel || this.stroke || this.floating || this.warpState) return false;
    this.settle();
    const l0 = p.activeLayer;
    if (!this.paintable(l0) || !l0.raster || (p.maskTarget && l0.mask)) { this.notice('Moving selected pixels works on a layer with pixels.'); return false; }
    if (this.smartLocked(p)) return false;
    p.history.begin(duplicate ? 'Duplicate Pixels' : 'Move Pixels', p.snapshot());
    const pick = this.target(p) as NonNullable<ReturnType<Engine['target']>>;
    const r = pick.raster;
    const region = intersectRect(integral(sel.rect), { x: 0, y: 0, w: p.doc.width, h: p.doc.height }) ?? sel.rect;
    const piece = createSurface(region.w, region.h);
    const pc = ctxOf(piece);
    setMat(pc, mul(translation(-region.x, -region.y), pick.local));
    pc.drawImage(r.canvas, 0, 0);
    pc.setTransform(1, 0, 0, 1, 0, 0);
    pc.globalCompositeOperation = 'destination-in';
    pc.drawImage(sel.surface(), sel.x - region.x, sel.y - region.y);
    const base = createSurface(r.width, r.height);
    const bc = ctxOf(base);
    bc.drawImage(r.canvas, 0, 0);
    if (!duplicate) {
      setMat(bc, mul(invert(pick.local), translation(sel.x, sel.y)));
      bc.globalCompositeOperation = 'destination-out';
      bc.drawImage(sel.surface(), 0, 0);
    }
    this.floating = { project: p, layerId: pick.layer.id, raster: r, local: pick.local, base, work: createSurface(r.width, r.height), piece, region, dx: 0, dy: 0, selection: sel, duplicate };
    this.renderFloating();
    return true;
  }

  private renderFloating(): void {
    const f = this.floating;
    if (!f) return;
    const c = ctxOf(f.work);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'copy';
    c.drawImage(f.base, 0, 0);
    c.globalCompositeOperation = 'source-over';
    setMat(c, mul(invert(f.local), translation(f.region.x + f.dx, f.region.y + f.dy)));
    c.drawImage(f.piece, 0, 0);
    c.setTransform(1, 0, 0, 1, 0, 0);
    this.emit('render', null);
    this.emit('overlay', null);
  }

  movePixelsBy(dx: number, dy: number): void {
    const f = this.floating;
    if (!f) return;
    f.dx = Math.round(dx);
    f.dy = Math.round(dy);
    this.renderFloating();
  }

  endPixelMove(): void {
    const f = this.floating;
    if (!f) return;
    this.floating = null;
    const p = f.project;
    if (!f.dx && !f.dy) {
      const before = p.history.abort();
      if (before) { p.doc = before.doc; p.selection = before.selection; }
      this.refresh();
      return;
    }
    const before = f.raster.read();
    const c = f.raster.ctx;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'copy';
    c.drawImage(f.work, 0, 0);
    c.restore();
    f.raster.touch();
    p.history.addPatch({ raster: f.raster, x: 0, y: 0, before, after: f.raster.read() });
    p.selection = f.selection.translated(f.dx, f.dy, p.doc.width, p.doc.height);
    if (p.layer(f.layerId)?.shape) p.updateLayer(f.layerId, { shape: null });
    p.history.end(p.snapshot());
    this.refresh();
  }

  cancelPixelMove(): void {
    const f = this.floating;
    if (!f) return;
    this.floating = null;
    const before = f.project.history.abort();
    if (before) { f.project.doc = before.doc; f.project.selection = before.selection; }
    this.refresh();
  }

  private floatSel: { project: Project; sourceId: ID; floatingId: ID; base: Surface; region: Rect; selection: SelectionMask; original: Transform } | null = null;

  get floatingSelection(): boolean { return this.floatSel !== null; }

  get canTransformSelection(): boolean {
    const p = this.current, l = p?.activeLayer;
    return !!p && !!p.selection && !this.floatSel && !this.stroke && !this.floating && !this.warpState && !!l && this.paintable(l) && !!l.raster && !(p.maskTarget && l.mask);
  }

  transformCommand(): void {
    if (this.canTransformSelection) { this.beginSelectionTransform(); return; }
    this.settle();
    if (!this.showTransformControls) this.update({ showTransformControls: true });
    this.setTool('move');
  }

  beginSelectionTransform(): boolean {
    const p = this.current;
    if (!p || !this.canTransformSelection) return false;
    if (this.smartLocked(p)) return false;
    this.settle();
    this.setTool('move');
    if (!p.selection) return false;
    const sel = p.selection;
    p.history.begin('Transform Selection', p.snapshot());
    const pick = this.target(p) as NonNullable<ReturnType<Engine['target']>>;
    const r = pick.raster, src = pick.layer;
    const region = intersectRect(integral(sel.rect), { x: 0, y: 0, w: p.doc.width, h: p.doc.height }) ?? integral(sel.rect);
    const piece = new Raster(region.w, region.h);
    const pc = piece.ctx;
    setMat(pc, mul(translation(-region.x, -region.y), pick.local));
    pc.drawImage(r.canvas, 0, 0);
    pc.setTransform(1, 0, 0, 1, 0, 0);
    pc.globalCompositeOperation = 'destination-in';
    pc.drawImage(sel.surface(), sel.x - region.x, sel.y - region.y);
    pc.globalCompositeOperation = 'source-over';
    piece.touch();
    const base = createSurface(r.width, r.height);
    const bc = ctxOf(base);
    bc.drawImage(r.canvas, 0, 0);
    setMat(bc, mul(invert(pick.local), translation(sel.x, sel.y)));
    bc.globalCompositeOperation = 'destination-out';
    bc.drawImage(sel.surface(), 0, 0);
    bc.setTransform(1, 0, 0, 1, 0, 0);
    bc.globalCompositeOperation = 'source-over';
    const layer = newLayer('Floating Selection', p.doc, { raster: piece, parentId: src.parentId, opacity: src.opacity, blend: src.blend, transform: { ...docTransform(region.w, region.h), x: region.x, y: region.y } });
    this.insertAboveActive(p, layer);
    p.selection = null;
    this.floatSel = { project: p, sourceId: src.id, floatingId: layer.id, base, region, selection: sel, original: layer.transform };
    this.refresh();
    return true;
  }

  commitSelectionTransform(): void {
    const fs = this.floatSel;
    if (!fs) return;
    this.floatSel = null;
    const p = fs.project;
    const fl = p.layer(fs.floatingId), src0 = p.layer(fs.sourceId);
    if (!fl?.raster || !src0?.raster || sameTransform(fl.transform, fs.original)) { this.restoreSelectionTransform(fs); return; }
    const draft = fl.transform, M = placement(draft, fl.raster.width, fl.raster.height);
    const oldLocal = placement(src0.transform, src0.raster.width, src0.raster.height), oldW = src0.raster.width, oldH = src0.raster.height;
    const old = src0.raster;
    const r = this.growLayer(p, src0, integral(transformBounds(draft)));
    const src = p.layer(fs.sourceId) as Layer;
    const local = placement(src.transform, r.width, r.height);
    const before = r === old ? r.read() : null;
    const c = r.ctx;
    c.save();
    setMat(c, mul(invert(local), oldLocal));
    c.clearRect(0, 0, oldW, oldH);
    c.drawImage(fs.base, 0, 0);
    setMat(c, mul(invert(local), M));
    c.imageSmoothingEnabled = draft.sampling !== 'nearest';
    c.imageSmoothingQuality = 'high';
    c.drawImage(fl.raster.canvas, 0, 0);
    c.restore();
    r.touch();
    if (before) p.history.addPatch({ raster: r, x: 0, y: 0, before, after: r.read() });
    if (src.shape) p.updateLayer(src.id, { shape: null });
    p.setLayers(p.doc.layers.filter((l) => l.id !== fs.floatingId));
    this.focus(p, fs.sourceId);
    const W = p.doc.width, H = p.doc.height, s = createSurface(W, H), sc = ctxOf(s);
    setMat(sc, M);
    sc.drawImage(fs.selection.surface(), fs.selection.x - fs.region.x, fs.selection.y - fs.region.y);
    sc.setTransform(1, 0, 0, 1, 0, 0);
    p.selection = SelectionMask.fromAlpha(0, 0, W, H, sc.getImageData(0, 0, W, H).data);
    p.history.end(p.snapshot());
    this.refresh();
  }

  cancelSelectionTransform(): void {
    const fs = this.floatSel;
    if (!fs) return;
    this.floatSel = null;
    this.restoreSelectionTransform(fs);
  }

  private restoreSelectionTransform(fs: NonNullable<Engine['floatSel']>): void {
    const p = fs.project, before = p.history.abort();
    if (before) { p.doc = before.doc; p.selection = before.selection; }
    this.focus(p, fs.sourceId);
    this.refresh();
  }

  /** Unpremultiplied RGB (0 to 1) of the original pixels under a document point, from the source the Levels histogram
   *  reads: the target layer's own pixels (or its mask's, when the mask is targeted), or with `composite` the flattened
   *  document. the Levels eyedroppers sample the edit's original image the same way. */
  sampleOriginal(pt: Pt, composite: boolean): [number, number, number] | null {
    const p = this.current;
    if (!p) return null;
    let px: Uint8ClampedArray;
    if (composite) {
      const flat = this.flattened(), x = Math.floor(pt.x), y = Math.floor(pt.y);
      if (!flat || x < 0 || y < 0 || x >= flat.width || y >= flat.height) return null;
      px = ctxOf(flat).getImageData(x, y, 1, 1).data;
    } else {
      const l = p.activeLayer;
      if (!l || !this.paintable(l)) return null;
      const onMask = p.maskTarget && !!l.mask;
      const r = onMask ? l.mask?.raster ?? null : l.raster;
      if (!r) return null;
      const t = onMask ? l.mask?.placement ?? l.transform : l.transform;
      const q = applyMat(invert(placement(t, r.width, r.height)), pt.x, pt.y), x = Math.floor(q.x), y = Math.floor(q.y);
      if (x < 0 || y < 0 || x >= r.width || y >= r.height) return null;
      px = r.ctx.getImageData(x, y, 1, 1).data;
    }
    return px[3] ? [px[0] / 255, px[1] / 255, px[2] / 255] : null;
  }

  /** Lays a subject mask (0 to 1 per layer pixel, 1 over the subject) on a layer as one Remove Background step. An
   *  existing mask of the same size is kept too, multiplied in: what either hides stays hidden (the
   *  `subjectMask`). The pixels themselves stay, so the background can be painted back. */
  applySubjectMask(id: ID, levels: Float32Array, width: number, height: number): void {
    this.edit('Remove Background', (p) => {
      const l = p.layer(id);
      if (!l || l.isGroup || !l.raster || levels.length !== width * height) return false;
      const m = l.mask?.raster, old = m && !l.mask?.placement && m.width === width && m.height === height ? m.read().data : null;
      const r = new Raster(width, height), img = r.read(), d = img.data;
      for (let i = 0, j = 0; i < levels.length; i++, j += 4) {
        d[j] = 255; d[j + 1] = 255; d[j + 2] = 255;
        d[j + 3] = Math.round(Math.min(1, Math.max(0, levels[i])) * (old ? old[j + 3] : 255));
      }
      r.write(img);
      p.updateLayer(id, { mask: { raster: r, enabled: true, linked: true, placement: null } });
      return true;
    });
  }

  /** the sample ring: while a drag samples the canvas, the new color shows on the ring's top half and the
   *  color before the drag on its bottom half. `showsSampleRing` is the Eyedropper's Sample Ring option. */
  showsSampleRing = true;
  sampleRing: { at: Pt; sampled: RGB; original: RGB } | null = null;

  setSampleRing(ring: { at: Pt; sampled: RGB; original: RGB } | null): void {
    if (!ring && !this.sampleRing) return;
    this.sampleRing = ring && this.showsSampleRing ? ring : null;
    this.emit('overlay', null);
  }

  /** the arrow-key nudge for selection tools: the outline moves 1 px (10 with Shift at the caller), each
   *  press one Move Selection step; the pixels stay. Returns false when there is no selection to move. */
  nudgeSelection(dx: number, dy: number): boolean {
    const p = this.current, s = p?.selection;
    if (!p || !s || (!dx && !dy)) return false;
    this.settle();
    this.applySelection(s.translated(dx, dy, p.doc.width, p.doc.height), 'replace', 'Move Selection');
    return true;
  }

  setMaskFromImage(id: ID, source: CanvasImageSource, width: number, height: number, name: string): void {
    this.edit(name, (p) => {
      const l = p.layer(id);
      if (!l || l.isGroup) return false;
      const r = Raster.from(source, width, height);
      const img = r.read();
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = Math.round(((d[i] + d[i + 1] + d[i + 2]) / 3) * (d[i + 3] / 255));
        d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = v;
      }
      r.write(img);
      p.updateLayer(id, { mask: { raster: r, enabled: true, linked: true, placement: null } });
      this.focus(p, id);
      p.maskTarget = true;
      return true;
    });
  }

  async exportBlob(type: 'image/png' | 'image/jpeg' | 'image/webp', quality = 0.92): Promise<Blob | null> {
    const p = this.current;
    if (!p) return null;
    return withResolution(await toBlob(renderDoc(this.work, p.doc, type === 'image/jpeg' ? '#ffffff' : null), type, quality), p.doc.resolution);
  }

  flattened(): Surface | null { const p = this.current; return p ? renderDoc(this.work, p.doc) : null; }

  /** One artboard as its own image: only it and what it holds, rendered and cut to its rectangle. */
  artboardImage(id: ID): Surface | null {
    const p = this.current, a = p?.layer(id);
    if (!p || !a?.artboard) return null;
    const map = byId(p.doc), keep = p.doc.layers.filter((l) => l.id === id || isDescendant(map, l.id, id));
    const r = a.artboard, pad = { x: Math.min(0, r.x), y: Math.min(0, r.y) };
    const doc: Doc = { ...p.doc, width: Math.max(p.doc.width, r.x + r.w) - pad.x, height: Math.max(p.doc.height, r.y + r.h) - pad.y, layers: pad.x || pad.y ? keep.map((l) => ({ ...l, transform: { ...l.transform, x: l.transform.x - pad.x, y: l.transform.y - pad.y }, mask: l.mask?.placement ? { ...l.mask, placement: { ...l.mask.placement, x: l.mask.placement.x - pad.x, y: l.mask.placement.y - pad.y } } : l.mask, ...(l.artboard ? { artboard: { ...l.artboard, x: l.artboard.x - pad.x, y: l.artboard.y - pad.y } } : {}) })) : keep };
    const full = renderDoc(this.work, doc), out = createSurface(r.w, r.h);
    ctxOf(out).drawImage(full, r.x - pad.x, r.y - pad.y, r.w, r.h, 0, 0, r.w, r.h);
    return out;
  }
}
