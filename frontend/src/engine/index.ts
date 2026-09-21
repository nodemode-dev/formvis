import { captureFrame, frameLayers, type Frame, type FrameLayer, type Timeline } from './timeline';
import { pathBounds, shiftPath, tracePath, type NamedPath, type PathSet, type VectorPath } from './paths';
import { defaultText, liveText, loadTextFont, renderText, textKey } from './text';
import { Emitter } from './events';
import type { Snapshot } from './history';
import { Renderer, renderDoc, type LayerOverride } from './renderer';
import { PixelStroke, warmStrokeSurfaces } from './stroke';
import { SelectionMask, type SelectionMode } from './selection';
import { Raster, createSurface, ctxOf, toBlob, type Surface, type Ctx2D } from './surface';
import { applyMat, boundsOf, contains, integral, intersectRect, invert, isAxisAligned, mul, placement, sameTransform, scaling, setMat, transformBounds, translation, unionRect, type Mat } from './geometry';
import { ancestors, byId, descendantIds, hierarchy, isDescendant } from './tree';
import { dragged, following, rounded, type DragMode } from './transform';
import { carried, cornersOf, cropWarp, distortUsable, maskEdgeTone, visibleBounds, warpRaster, type Warped, imageCorners, homography, project, inverse3 } from './distort';
import { withResolution } from './dpi';
import { wandMask } from './kernels';
import { Project } from './project';
import { BLEND_MODES, LIMITS, clamp, docTransform, newLayer, uid, type BlendMode, type Doc, type ID, type Layer, type Mask, type Pt, type Rect, type RGB, type ToolId, type Transform, effectsActive, type LayerEffects, type TextSpec, type SmartFilter, type ShapeStyle, effectsFromData } from './types';

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
import { WarpStroke, contentFill, fillTransparent, healFromSource, premultiply, spotHeal, unpremultiply, type HealMode } from './retouch';
export type { HealMode } from './retouch';
import type { AdjustmentKind } from './types';
export { ADJUSTMENT_KINDS, ADJUSTMENT_LABELS, COLOR_RANGES, defaultAdjustmentData, defaultHsv, grainFromData, grainKernel, hsvFromData, hsvKernel, hsvToData, randomSeed } from './adjust';
export type { ColorRange, GrainSettings, HsvSettings } from './adjust';
export { addNoise, gaussianBlur, gaussianMargin, histogram, lensDistort, motionBlur, motionMargin, unsharpMask } from './filters';
export { defaultDevelopState, developImage, type DevelopState } from './develop';
export { TEXT_FONTS, defaultText, fontCss, liveText, textFromData, textKey, textMetrics } from './text';
export { FRAME_DELAYS, captureFrame, frameLayers, timelineData, timelineFrom, type Frame, type FrameLayer, type Timeline } from './timeline';
export { anchorNear, cornerAt, nearestSegment, pathBounds, pathData, pathFrom, pathSetData, pathSetFrom, splitSegment, tracePath, type Anchor, type NamedPath, type PathSet, type SubPath, type VectorPath } from './paths';
export { curvesKernel, exposureKernel, gradientMapKernel, levelsKernel } from './kernels';
export type { Kernel, KernelContext } from './kernels';

export interface Notice { kind: 'info' | 'error'; text: string }
export interface EngineEvents {
  projects: null; doc: null; selection: null; active: null; viewport: null; tool: null; options: null;
  history: null; colors: null; render: Rect | null; overlay: null; busy: boolean; notice: Notice; paths: null; timeline: null;
}
export interface BrushSettings { diameter: number; hardness: number; opacity: number }
export interface ImportedImage { source: CanvasImageSource; width: number; height: number; name: string }
type Target = 'pixels' | 'mask';
type Settings = Pick<Engine, 'selectionMode' | 'marqueeKind' | 'lassoKind' | 'showPixelGrid' | 'showTransformControls' | 'autoSelect' | 'lockRatio'>;

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
const PAINT_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>(['brush', 'cloneStamp', 'healingBrush', 'spotHealing']);

export class Engine {
  readonly events = new Emitter<EngineEvents>();
  readonly projects: Project[] = [];
  tool: ToolId = 'move';
  brush: BrushSettings = { diameter: 40, hardness: 1, opacity: 1 };
  brushMode: 'paint' | 'erase' = 'paint';
  fg: RGB = { r: 0, g: 0, b: 0 };
  bg: RGB = { r: 255, g: 255, b: 255 };
  selectionMode: SelectionMode = 'replace';
  marqueeKind: 'rectangle' | 'ellipse' = 'rectangle';
  lassoKind: 'freehand' | 'polygonal' = 'freehand';
  wand = { tolerance: 32, contiguous: true, sampleAll: false, sampleSize: 0 };
  /** smooth Lasso and elliptical Marquee edges (rectangles snap to whole pixels and
   *  the Magic Wand's edges follow pixels exactly, so neither changes). On by default. */
  selectionAntialiased = true;
  showPixelGrid = true;
  showTransformControls = true;
  autoSelect = false;
  lockRatio = true;
  transformEdit: { project: Project; layerId: ID; original: Transform; draft: Transform; mode: DragMode; start: Pt; mask: boolean; group: { box: Transform; originals: Map<ID, Transform> } | null } | null = null;
  selectionShift: { project: Project; dx: number; dy: number } | null = null;
  private currentId: string | null = null;
  private viewSize = { w: 800, h: 600 };
  private readonly display = new Renderer();
  private readonly work = new Renderer();
  private stroke: { project: Project; layerId: ID; target: Target; s: PixelStroke; heal?: HealMode; healFrom?: Pt } | null = null;
  private lastBrush: { layerId: ID; target: Target; p: Pt } | null = null;
  private opacityOpen: Project | null = null;
  private swipeOpen: Project | null = null;
  private busyCount = 0;

  on<K extends keyof EngineEvents>(key: K, fn: (p: EngineEvents[K]) => void): () => void { return this.events.on(key, fn); }
  emit<K extends keyof EngineEvents>(key: K, payload: EngineEvents[K]): void { this.events.emit(key, payload); }
  notice(text: string, kind: Notice['kind'] = 'info'): void { this.emit('notice', { kind, text }); }
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
    p.viewport.width = this.viewSize.w;
    p.viewport.height = this.viewSize.h;
    p.viewport.fit(doc.width, doc.height);
    p.activeId = activeId && doc.layers.some((l) => l.id === activeId) ? activeId : doc.layers[doc.layers.length - 1]?.id ?? null;
    if (p.activeId) p.selectedIds = new Set([p.activeId]);
    this.projects.push(p);
    this.switchTo(p.id);
    return p;
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

  newDocument(width: number, height: number, name = 'Untitled', fill: 'transparent' | 'white' | 'background' = 'transparent'): Project | null {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > LIMITS.side || height > LIMITS.side || width * height > LIMITS.pixels) {
      this.notice('Canvas sides must be 1 to 30,000 px, and the canvas at most 100 megapixels.', 'error');
      return null;
    }
    const base: Doc = { id: uid(), width, height, resolution: 72, layers: [] };
    let layer = newLayer(fill === 'transparent' ? 'Layer 1' : 'Background', base);
    if (fill !== 'transparent') layer = { ...layer, raster: Raster.filled(width, height, fill === 'white' ? '#ffffff' : rgbCss(this.bg)) };
    return this.addProject({ ...base, layers: [layer] }, name, layer.id);
  }

  edit(name: string, fn: (p: Project) => boolean | void): boolean {
    const p = this.current;
    if (!p || this.stroke) return false;
    this.settle();
    p.history.begin(name, p.snapshot());
    let ok: boolean | void = true;
    try { ok = fn(p); } finally { p.history.end(p.snapshot()); }
    this.refresh();
    return ok !== false;
  }

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

  /** The current document's snapshots, newest last. They live with the open document and are not saved. */
  get snapshots(): ReadonlyArray<{ id: ID; name: string }> { const p = this.current; return p ? this.historySnapshots.get(p) ?? [] : []; }

  /** History > New Snapshot: the document as it is now, kept to return to however far the steps move on. */
  takeSnapshot(): void {
    const p = this.current;
    if (!p || this.stroke) return;
    this.settle();
    const list = this.historySnapshots.get(p) ?? [];
    let n = list.length + 1;
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
    };
    this.emit('options', null);
    this.emit('overlay', null);
  }

  setBrushMode(mode: 'paint' | 'erase'): void { this.brushMode = mode; this.emit('options', null); this.emit('tool', null); }
  setWand(patch: Partial<Engine['wand']>): void { this.wand = { ...this.wand, ...patch }; this.emit('options', null); }
  setColors(fg?: RGB, bg?: RGB): void { if (fg) this.fg = fg; if (bg) this.bg = bg; this.emit('colors', null); this.emit('options', null); }
  swapColors(): void { this.setColors(this.bg, this.fg); }
  defaultColors(): void { this.setColors({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }); }

  fit(): void { const p = this.current; if (!p) return; p.viewport.fit(p.doc.width, p.doc.height); this.emit('viewport', null); this.emit('render', null); }
  zoomTo(z: number, at?: Pt): void {
    const v = this.current?.viewport;
    if (!v) return;
    const a = at ?? { x: v.width / 2, y: v.height / 2 };
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

  private effectPreview: { project: Project; layerId: ID; effects: LayerEffects | null } | null = null;

  /** Layer > Layer Style: sets or clears a pixel layer's effects as one undo step; nothing is recorded when the
   *  effects are unchanged. */
  setLayerEffects(id: ID, effects: LayerEffects | null): void {
    this.effectPreview = null;
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

  private renderSmart(source: Raster, filters: SmartFilter[]): Raster {
    const shown = filters.filter((f) => f.enabled);
    const m = this.smartMargin(filters);
    const pad = createSurface(source.width + 2 * m, source.height + 2 * m);
    ctxOf(pad).drawImage(source.canvas, m, m);
    let img = ctxOf(pad).getImageData(0, 0, pad.width, pad.height);
    for (const f of shown) if (this.smartFilterRunner) img = this.smartFilterRunner(f.kind, f.settings, img);
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
  private async renderSmartAsync(source: Raster, filters: SmartFilter[]): Promise<Raster> {
    const m = this.smartMargin(filters), pad = createSurface(source.width + 2 * m, source.height + 2 * m);
    ctxOf(pad).drawImage(source.canvas, m, m);
    let img = ctxOf(pad).getImageData(0, 0, pad.width, pad.height);
    for (const f of filters.filter((x) => x.enabled)) {
      img = this.smartFilterRunnerAsync ? await this.smartFilterRunnerAsync(f.kind, f.settings, img) : this.smartFilterRunner ? this.smartFilterRunner(f.kind, f.settings, img) : img;
    }
    const out = new Raster(img.width, img.height);
    out.write(img);
    return out;
  }

  /** Re-renders a smart object: at once when it is small (up to 2 megapixels) or shows no filter, else in the
   *  background, the result applied as one undo step when it is ready. A later change to the same object supersedes a
   *  render still running, and a render whose source changed meanwhile is dropped. */
  private restackSoon(p: Project, id: ID, source: Raster | null, filters: SmartFilter[] | null, name: string): boolean {
    const l = p.layer(id);
    if (!l?.smart) return false;
    const src = source ?? l.smart.source, stack = structuredClone(filters ?? this.smartFiltersShown(id) ?? l.smart.filters);
    if (!this.smartFilterRunnerAsync || src.width * src.height <= 2_000_000 || !stack.some((f) => f.enabled)) {
      this.smartPending.delete(id);
      return this.restack(p, id, source, stack, name);
    }
    const token = ++this.smartToken;
    this.smartPending.set(id, { token, filters: stack });
    void this.task(async () => {
      const rendered = await this.renderSmartAsync(src, stack);
      if (this.smartPending.get(id)?.token !== token) return;
      this.smartPending.delete(id);
      const now = p.layer(id);
      if (!this.projects.includes(p) || !now?.smart || (source === null && now.smart.source !== src)) { this.emit('doc', null); return; }
      this.restack(p, id, source, stack, name, rendered);
    });
    return true;
  }

  private restack(p: Project, id: ID, source: Raster | null, filters: SmartFilter[] | null, name: string, rendered: Raster | null = null): boolean {
    return this.editOn(p, name, () => {
      const l = p.layer(id);
      if (!l?.smart) return false;
      const src = source ?? l.smart.source;
      const stack = structuredClone(filters ?? l.smart.filters), raster = rendered ?? this.renderSmart(src, stack), old = l.raster as Raster, t = l.transform;
      const warp = this.smartWarpNow(l);
      if (warp) {
        // A distorted smart object warps its fresh render through its kept warp; a mask tied to its pixels is pinned
        // where it is first, since the pixels' bounds change.
        const w = this.warpedSmart(raster, this.smartMargin(stack), src, warp);
        if (!w) return false;
        const mask = l.mask && !l.mask.placement ? { ...l.mask, placement: l.transform } : l.mask;
        p.updateLayer(id, { smart: { source: src, filters: stack, warp, warpAt: w.t }, raster: w.raster, transform: w.t, mask });
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
      p.updateLayer(id, { smart: { source: src, filters: stack }, raster, transform: { ...t, x: cx - w / 2, y: cy - h / 2, w, h }, mask });
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
      target.forEach((l, i) => { const now = q.doc.layers[i]; if (l !== now && now?.id === l.id) q.updateLayer(l.id, { visible: l.visible, opacity: l.opacity, transform: l.transform }); });
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
    if (style.fill) { c.fillStyle = rgbCss(style.fill); c.fill(shape); }
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
    const p = this.current;
    if (!p || this.pathGesture || !this.selectedPath(p)?.shape) return;
    this.settle();
    p.history.begin('Edit Shape Path', p.snapshot());
    this.pathGesture = p;
  }

  endPathEdit(): void {
    const p = this.pathGesture;
    if (!p) return;
    this.pathGesture = null;
    p.history.end(p.snapshot());
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
    const shape = tracePath(vp);
    const mask = SelectionMask.fromPath(p.doc.width, p.doc.height, b, (c) => c.fill(shape), true);
    if (!mask) { this.notice('The path lies outside the canvas.'); return; }
    this.applySelection(mask, 'replace', 'Make Selection');
  }

  /** Edit > Fill Path: the path's inside painted into the active layer in the foreground colour, within any selection. */
  fillPath(): void { this.paintPath('Fill Path', (c, shape) => { c.fillStyle = rgbCss(this.fg); c.fill(shape); }); }

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

  private paintPath(name: string, paint: (c: Ctx2D, shape: Path2D) => void): void {
    const vp = this.workPath;
    if (!vp || !pathBounds(vp)) { this.notice('Draw a path with the Pen tool first.'); return; }
    const shape = tracePath(vp);
    this.regionEdit(name, ({ raster, target, rect, cover }) => {
      const p = this.current as Project, l = p.activeLayer as Layer;
      const t = target === 'mask' ? l.mask?.placement ?? l.transform : l.transform;
      const s = createSurface(rect.w, rect.h), c = ctxOf(s);
      setMat(c, mul(translation(-rect.x, -rect.y), invert(placement(t, raster.width, raster.height))));
      paint(c, shape);
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

  addLayer(): void {
    this.edit('New Layer', (p) => {
      const names = new Set(p.doc.layers.map((l) => l.name));
      let n = 1;
      while (names.has(`Layer ${n}`)) n += 1;
      const active = p.activeLayer;
      const parentId = active?.isGroup ? active.id : active?.parentId ?? null;
      const layer = newLayer(`Layer ${n}`, p.doc, { parentId });
      const layers = [...p.doc.layers];
      let index = active ? layers.indexOf(active) + 1 : layers.length;
      if (active?.isGroup) layers.forEach((l, i) => { if (l.parentId === active.id) index = Math.max(index, i + 1); });
      layers.splice(index, 0, layer);
      p.setLayers(layers);
      if (parentId) p.collapsed.delete(parentId);
      this.focus(p, layer.id);
    });
  }

  addFolder(): void {
    this.edit('New Folder', (p) => {
      const names = new Set(p.doc.layers.map((l) => l.name));
      let n = 1;
      while (names.has(`Folder ${n}`)) n += 1;
      const active = p.activeLayer;
      const group = newLayer(`Folder ${n}`, p.doc, { isGroup: true, parentId: active?.parentId ?? null });
      const layers = [...p.doc.layers];
      layers.splice(active ? layers.indexOf(active) + 1 : layers.length, 0, group);
      p.setLayers(layers);
      this.focus(p, group.id);
    });
  }

  duplicateLayers(): void {
    this.edit('Duplicate Layer', (p) => {
      const roots = this.selectedRoots(p);
      if (!roots.length) return false;
      let layers = [...p.doc.layers];
      let last: ID | null = null;
      for (const id of roots) {
        const src = layers.find((l) => l.id === id);
        if (!src) continue;
        const subtree = [src, ...descendantIds(layers, id).map((d) => layers.find((l) => l.id === d) as Layer)];
        const idMap = new Map<ID, ID>();
        const clones = subtree.map((l) => { const c = this.cloneLayer(l, l === src ? { name: `${l.name} copy` } : {}); idMap.set(l.id, c.id); return c; });
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
      })));
      if (p.selection) p.selection = p.selection.flipped(horizontal, W, H);
    });
  }

  private paintable(l: Layer | null): l is Layer { return !!l && !l.isGroup && !l.adjustment; }

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

  beginStroke(pt: Pt, shift: boolean): boolean {
    const p = this.current;
    if (!p || this.stroke) return false;
    this.settle();
    if (!this.paintable(p.activeLayer)) { this.notice('Select a pixel layer to paint on.'); return false; }
    if (this.smartLocked(p)) return false;
    p.history.begin(this.brushMode === 'erase' ? 'Eraser' : 'Brush', p.snapshot());
    const pick = this.target(p) as NonNullable<ReturnType<Engine['target']>>;
    const white = pick.target === 'mask' && luminance(this.fg) >= 0.5 !== (this.brushMode === 'erase');
    const op: GlobalCompositeOperation = pick.target === 'mask' ? (white ? 'source-over' : 'destination-out') : this.brushMode === 'erase' ? 'destination-out' : 'source-over';
    const color = pick.target === 'mask' ? { r: 255, g: 255, b: 255 } : this.fg;
    const s = new PixelStroke(pick.raster, pick.local, { ...this.brush, color }, op, p.selection);
    this.stroke = { project: p, layerId: pick.layer.id, target: pick.target, s };
    const last = this.lastBrush;
    if (shift && last && last.layerId === pick.layer.id && last.target === pick.target) s.to(last.p);
    s.to(pt);
    s.compose();
    this.emit('render', null);
    return true;
  }

  /** Redraws of the whole scene are the default; a stroke reports just the region it changed, so the stage repaints
   *  that alone. Off, every stroke frame redraws everything. */
  dirtyRendering = true;

  strokeTo(pt: Pt): void {
    const st = this.stroke;
    if (!st) return;
    st.s.to(pt);
    const f = st.s.compose();
    if (!f) return;
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
    const patch = st.heal ? this.healPatch(st.s, st.heal) : st.healFrom ? this.healFromPatch(st.s, st.healFrom) : st.s.commit();
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

  private regionEdit(name: string, apply: (a: { raster: Raster; target: Target; rect: Rect; cover: Surface | null }) => void): void {
    this.edit(name, (p) => {
      if (!this.paintable(p.activeLayer)) { this.notice('Select a pixel layer first.'); return false; }
      if (this.smartLocked(p)) return false;
      const pick = this.target(p);
      if (!pick) return false;
      const { raster } = pick;
      let rect: Rect = { x: 0, y: 0, w: raster.width, h: raster.height };
      let cover: Surface | null = null;
      const sel = p.selection;
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
      apply({ raster, target: pick.target, rect, cover });
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
    const mask = wandMask(data, W, H, x, y, this.wand.tolerance, this.wand.contiguous, this.wand.sampleSize);
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
      const R = warp ? this.renderSmart(l.smart.source, l.smart.filters) : l.raster, rt = warp ? docTransform(R.width, R.height) : l.transform;
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

  private dropDistort(): void {
    if (this.distortFrame) cancelAnimationFrame(this.distortFrame);
    this.distortFrame = 0;
    this.distortEdit = null;
    this.emit('render', null);
    this.emit('options', null);
  }

  cancelTransform(): void { this.snapGuides = null; if (this.transformEdit) { this.transformEdit = null; this.emit('render', null); this.emit('options', null); } }

  nudge(dx: number, dy: number): void {
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

  sampleColor(pt: Pt): RGB | null {
    const p = this.current;
    if (!p || pt.x < 0 || pt.y < 0 || pt.x >= p.doc.width || pt.y >= p.doc.height) return null;
    const s = createSurface(1, 1);
    this.work.render({ doc: p.doc, target: s, view: translation(-Math.floor(pt.x), -Math.floor(pt.y)) });
    const d = ctxOf(s).getImageData(0, 0, 1, 1).data;
    return d[3] ? { r: d[0], g: d[1], b: d[2] } : null;
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
        const layer = newLayer(stripExt(img.name), p.doc, {
          raster: Raster.from(img.source, img.width, img.height), parentId,
          transform: { ...docTransform(img.width, img.height), x: Math.floor(c.x - img.width / 2), y: Math.floor(c.y - img.height / 2) },
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
  gradientSettings: { shape: 'linear' | 'radial'; style: 'background' | 'transparent'; reversed: boolean; opacity: number } = { shape: 'linear', style: 'transparent', reversed: false, opacity: 1 };
  shapeSettings: { kind: 'rectangle' | 'ellipse'; cornerRadius: number } = { kind: 'rectangle', cornerRadius: 0 };
  clipboard: { surface: Surface; x: number; y: number; w: number; h: number; stamp: string } | null = null;
  selectionAmounts = { expand: 1, contract: 1 };

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
      let layers: Layer[] = p.doc.layers.map((l) => ({ ...l, transform: shift(l.transform), mask: l.mask?.placement ? { ...l.mask, placement: shift(l.mask.placement) } : l.mask }));
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
        const shape = l.shape ? { ...l.shape, cornerRadius: (Number(l.shape.cornerRadius) || 0) * Math.min(sx, sy) } : null;
        const raster = shape ? this.shapeRaster(shape, t.w, t.h) : l.raster ? scaleRaster(l.raster, Math.max(1, Math.round(l.raster.width * sx)), Math.max(1, Math.round(l.raster.height * sy))) : null;
        const mr = l.mask?.raster ?? null;
        const mask = l.mask ? { ...l.mask, raster: mr ? scaleRaster(mr, Math.max(1, Math.round(mr.width * sx)), Math.max(1, Math.round(mr.height * sy))) : null, placement: l.mask.placement ? scaleT(l.mask.placement) : null } : null;
        return { ...l, raster, mask, shape, transform: t };
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
    let c0 = rgbCss(fg, 1), c1 = st.style === 'background' ? rgbCss(bg, 1) : rgbCss(fg, 0);
    if (st.reversed) [c0, c1] = [c1, c0];
    const a = g.start, b = g.end;
    const len = Math.max(0.5, Math.hypot(b.x - a.x, b.y - a.y));
    const grad = st.shape === 'radial' ? lc.createRadialGradient(a.x, a.y, 0, a.x, a.y, len) : lc.createLinearGradient(a.x, a.y, len > 0.5 ? b.x : a.x + 0.5, b.y);
    grad.addColorStop(0, c0);
    grad.addColorStop(1, c1);
    lc.fillStyle = grad;
    const bb = boundsOf([applyMat(local, 0, 0), applyMat(local, w, 0), applyMat(local, w, h), applyMat(local, 0, h)]);
    lc.fillRect(bb.x - 1, bb.y - 1, bb.w + 2, bb.h + 2);
    const sel = g.project.selection;
    if (sel) {
      setMat(lc, mul(invert(local), translation(sel.x, sel.y)));
      lc.globalCompositeOperation = 'destination-in';
      lc.drawImage(sel.surface(), 0, 0);
    }
    c.globalAlpha = st.opacity;
    c.drawImage(layer, 0, 0);
    c.globalAlpha = 1;
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

  private shapeRaster(style: Record<string, unknown>, w: number, h: number): Raster {
    const r = new Raster(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
    const c = r.ctx;
    const ch = (v: unknown): number => Math.round(clamp(Number(v) || 0, 0, 1) * 255);
    c.fillStyle = `rgb(${ch(style.red)},${ch(style.green)},${ch(style.blue)})`;
    c.beginPath();
    if (style.kind === 'Ellipse') c.ellipse(r.width / 2, r.height / 2, r.width / 2, r.height / 2, 0, 0, Math.PI * 2);
    else c.roundRect(0, 0, r.width, r.height, Math.min(Number(style.cornerRadius) || 0, r.width / 2, r.height / 2));
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

  retouch: { healMode: HealMode; cloneAligned: boolean; cloneSampleAll: boolean; smearMode: 'blur' | 'smudge' | 'liquify' } = { healMode: 'contentAware', cloneAligned: true, cloneSampleAll: false, smearMode: 'blur' };
  cloneSource: Pt | null = null;
  cloneOffset: Pt | null = null;
  private warpState: { project: Project; layerId: ID; stroke: WarpStroke; surface: Surface; image: ImageData } | null = null;

  get warping(): boolean { return this.warpState !== null; }

  setCloneSource(pt: Pt): void {
    this.cloneSource = { x: pt.x, y: pt.y };
    this.cloneOffset = null;
    this.emit('overlay', null);
    this.emit('options', null);
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
    const key = [sp.x.toFixed(2), sp.y.toFixed(2), d, this.brush.hardness, side, this.retouch.cloneSampleAll, l.id, p.history.revision].join('|');
    if (this.clonePreviewCache?.key === key) return this.clonePreviewCache.surface;
    const s = createSurface(side, side), c = ctxOf(s), per = side / d;
    const view = mul(scaling(per, per), translation(d / 2 - sp.x, d / 2 - sp.y));
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

  beginRetouchStroke(kind: 'heal' | 'clone' | 'blur' | 'healBrush', pt: Pt, shift: boolean): boolean {
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
      const off = this.cloneStrokeOffset(pt);
      if (!off) { this.notice(`Alt-click to set where ${kind === 'clone' ? 'Clone Stamp' : 'the Healing Brush'} copies from.`); return false; }
      this.cloneOffset = off;
      texture = { surface: this.retouch.cloneSampleAll ? renderDoc(this.work, p.doc) : this.layerSample(p, l0), dx: off.x, dy: off.y };
    } else if (kind === 'blur') {
      const sigma = clamp(this.brush.diameter / 10, 1.5, 30);
      texture = { surface: onMask ? this.maskBlurSample(p, l0, sigma) : this.layerSample(p, l0, sigma), dx: 0, dy: 0 };
    }
    p.history.begin(kind === 'heal' ? 'Spot Healing' : kind === 'clone' ? 'Clone Stamp' : kind === 'healBrush' ? 'Healing Brush' : 'Blur', p.snapshot());
    const pick = this.target(p) as NonNullable<ReturnType<Engine['target']>>;
    const white = { r: 255, g: 255, b: 255 };
    const style = kind === 'heal' ? { ...this.brush, opacity: 0.45, color: white } : { ...this.brush, color: white };
    const s = new PixelStroke(pick.raster, pick.local, style, 'source-over', p.selection, texture, pick.target === 'mask');
    // The Healing Brush heals from the same offset at release, in the layer's own pixels.
    let healFrom: Pt | undefined;
    if (kind === 'healBrush' && texture) {
      const toLayer = invert(pick.local), a = applyMat(toLayer, pt.x, pt.y), b = applyMat(toLayer, pt.x + texture.dx, pt.y + texture.dy);
      healFrom = { x: Math.round(b.x - a.x), y: Math.round(b.y - a.y) };
    }
    this.stroke = { project: p, layerId: pick.layer.id, target: pick.target, s, heal: kind === 'heal' ? this.retouch.healMode : undefined, healFrom };
    const last = this.lastBrush;
    if (shift && last && last.layerId === pick.layer.id && last.target === pick.target) s.to(last.p);
    s.to(pt);
    s.compose();
    this.emit('render', null);
    return true;
  }

  private healFromPatch(s: PixelStroke, off: Pt): ReturnType<PixelStroke['commit']> {
    const r = s.raster;
    const before = r.read();
    const pm = premultiply(before.data);
    if (!healFromSource(pm, s.coverageAlpha(), r.width, r.height, this.brush.opacity, off.x, off.y)) return null;
    const out = new ImageData(r.width, r.height);
    unpremultiply(pm, out.data);
    r.write(out);
    return { raster: r, x: 0, y: 0, before, after: r.read() };
  }

  /** Patch: heals the selected area of the active pixel layer from the area (dx, dy) document pixels away, blended to
   *  meet the selection's edge, as one undo step. */
  patchSelection(dx: number, dy: number): void {
    const p0 = this.current;
    if (!p0?.selection) { this.notice('Make a selection, then drag it onto the area to copy from.'); return; }
    if (!this.paintable(p0.activeLayer)) { this.notice('Select a pixel layer first.'); return; }
    if (p0.maskTarget && p0.activeLayer?.mask) { this.notice('Patch works on layer pixels. Click the layer thumbnail to target them.'); return; }
    this.regionEdit('Patch', ({ raster, target, rect }) => {
      if (target !== 'pixels') return;
      const p = this.current as Project, l = p.activeLayer as Layer;
      const cov = this.coverageFor(p, l, target, raster.width, raster.height);
      if (!cov) return;
      const toLayer = invert(placement(l.transform, raster.width, raster.height)), a = applyMat(toLayer, 0, 0), b = applyMat(toLayer, dx, dy);
      const mask = new Uint8Array(raster.width * raster.height);
      for (let i = 0; i < mask.length; i++) mask[i] = cov[i * 4 + 3];
      const pm = premultiply(raster.read().data);
      if (!healFromSource(pm, mask, raster.width, raster.height, 1, Math.round(b.x - a.x), Math.round(b.y - a.y))) return;
      const out = new ImageData(raster.width, raster.height);
      unpremultiply(pm, out.data);
      raster.ctx.putImageData(out, 0, 0, rect.x, rect.y, rect.w, rect.h);
    });
  }

  private healPatch(s: PixelStroke, mode: HealMode): ReturnType<PixelStroke['commit']> {
    const r = s.raster;
    const before = r.read();
    const pm = premultiply(before.data);
    if (!spotHeal(pm, s.coverageAlpha(), r.width, r.height, this.brush.opacity, mode, (Math.random() * 0x100000000) >>> 0)) return null;
    const out = new ImageData(r.width, r.height);
    unpremultiply(pm, out.data);
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

  snapping = true;
  snapGuides: { xs: number[]; ys: number[] } | null = null;

  private snapMove(p: Project, id: ID, t: Transform, moving?: ReadonlySet<ID>): Transform {
    const tol = 6 / p.viewport.zoom;
    const xs = [0, p.doc.width / 2, p.doc.width], ys = [0, p.doc.height / 2, p.doc.height];
    for (const e of hierarchy(p.doc)) {
      const l = e.layer;
      if (!e.visible || l.isGroup || !l.raster || l.id === id || moving?.has(l.id)) continue;
      const b = transformBounds(l.transform);
      xs.push(Math.round(b.x), Math.round(b.x + b.w / 2), Math.round(b.x + b.w));
      ys.push(Math.round(b.y), Math.round(b.y + b.h / 2), Math.round(b.y + b.h));
    }
    const b = transformBounds(t);
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

  async exportBlob(type: 'image/png' | 'image/jpeg', quality = 0.92): Promise<Blob | null> {
    const p = this.current;
    if (!p) return null;
    return withResolution(await toBlob(renderDoc(this.work, p.doc, type === 'image/jpeg' ? '#ffffff' : null), type, quality), p.doc.resolution);
  }

  flattened(): Surface | null { const p = this.current; return p ? renderDoc(this.work, p.doc) : null; }
}
