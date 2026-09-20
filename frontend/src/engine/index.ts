import { Emitter } from './events';
import type { Snapshot } from './history';
import { Renderer, renderDoc, type LayerOverride } from './renderer';
import { PixelStroke } from './stroke';
import { SelectionMask, type SelectionMode } from './selection';
import { Raster, createSurface, ctxOf, toBlob, type Surface } from './surface';
import { applyMat, boundsOf, contains, integral, intersectRect, invert, isAxisAligned, mul, placement, sameTransform, setMat, transformBounds, translation, unionRect, type Mat } from './geometry';
import { ancestors, byId, descendantIds, hierarchy, isDescendant } from './tree';
import { dragged, following, rounded, type DragMode } from './transform';
import { carried, cornersOf, cropWarp, distortUsable, maskEdgeTone, visibleBounds, warpRaster, type Warped } from './distort';
import { wandMask } from './kernels';
import { Project } from './project';
import { BLEND_MODES, LIMITS, clamp, docTransform, newLayer, uid, type BlendMode, type Doc, type ID, type Layer, type Mask, type Pt, type Rect, type RGB, type ToolId, type Transform } from './types';

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
export type { Entry as HierarchyEntry } from './tree';
import { ADJUSTMENT_LABELS, defaultAdjustmentData } from './adjust';
import { fromGray, gaussianBlur, resizeMask, toGray } from './filters';
import { WarpStroke, contentFill, premultiply, spotHeal, unpremultiply, type HealMode } from './retouch';
export type { HealMode } from './retouch';
import type { AdjustmentKind } from './types';
export { ADJUSTMENT_KINDS, ADJUSTMENT_LABELS, COLOR_RANGES, defaultAdjustmentData, defaultHsv, grainFromData, grainKernel, hsvFromData, hsvKernel, hsvToData, randomSeed } from './adjust';
export type { ColorRange, GrainSettings, HsvSettings } from './adjust';
export { addNoise, gaussianBlur, gaussianMargin, histogram, lensDistort, motionBlur, motionMargin } from './filters';
export { curvesKernel, exposureKernel, gradientMapKernel, levelsKernel } from './kernels';
export type { Kernel, KernelContext } from './kernels';

export interface Notice { kind: 'info' | 'error'; text: string }
export interface EngineEvents {
  projects: null; doc: null; selection: null; active: null; viewport: null; tool: null; options: null;
  history: null; colors: null; render: null; overlay: null; busy: boolean; notice: Notice;
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
  /** the reference app's selectionAntialiased: smooth Lasso and elliptical Marquee edges (rectangles snap to whole pixels and
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
  private stroke: { project: Project; layerId: ID; target: Target; s: PixelStroke; heal?: HealMode } | null = null;
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

  undo(): void {
    const p = this.current;
    if (!p || this.stroke) return;
    this.settle();
    const e = p.history.undo();
    if (!e) return;
    for (let i = e.patches.length - 1; i >= 0; i--) { const q = e.patches[i]; q.raster.write(q.before, q.x, q.y); }
    this.restore(p, e.before);
  }

  redo(): void {
    const p = this.current;
    if (!p || this.stroke) return;
    this.settle();
    const e = p.history.redo();
    if (!e) return;
    for (const q of e.patches) q.raster.write(q.after, q.x, q.y);
    this.restore(p, e.after);
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
    if (this.stroke) return;
    this.settle();
    if (this.tool !== id) { this.tool = id; this.emit('tool', null); }
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

  /** the reference app's live masks: layers that stay but are clipped to a layer being deleted. Deleting their base asks
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
      // the reference app's Bake and Delete: a layer clipped to a deleted base keeps its current masked look in its own
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

  /** the reference app's Option-drag from a mask thumbnail: a copy of the source's mask on the target, sitting where it sits
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

  /** the reference app's copyLayer(into:): a layer, with a folder's contents, copied into another open project as one Copy
   *  Layers from Project step there: new ids, cloned pixels, parent and clip links kept inside the copy and dropped
   *  outside it, centered on the target canvas, on top of its stack; the target becomes current. Refused past
   *  the reference app's 100-megapixel budget for the target. */
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

  strokeTo(pt: Pt): void {
    const st = this.stroke;
    if (!st) return;
    st.s.to(pt);
    if (st.s.compose()) this.emit('render', null);
  }

  endStroke(): void {
    const st = this.stroke;
    if (!st) return;
    this.stroke = null;
    const patch = st.heal ? this.healPatch(st.s, st.heal) : st.s.commit();
    if (patch) st.project.history.addPatch(patch);
    if (st.target === 'pixels' && st.project.layer(st.layerId)?.shape) st.project.updateLayer(st.layerId, { shape: null });
    st.project.history.end(st.project.snapshot());
    const lp = st.s.lastPoint;
    if (lp) this.lastBrush = { layerId: st.layerId, target: st.target, p: lp };
    this.refresh();
  }

  cancelStroke(): void {
    const st = this.stroke;
    if (!st) return;
    this.stroke = null;
    const before = st.project.history.abort();
    if (before) { st.project.doc = before.doc; st.project.selection = before.selection; }
    this.refresh();
  }

  private regionEdit(name: string, apply: (a: { raster: Raster; target: Target; rect: Rect; cover: Surface | null }) => void): void {
    this.edit(name, (p) => {
      if (!this.paintable(p.activeLayer)) { this.notice('Select a pixel layer first.'); return false; }
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

  /** the reference app's rule for moving a mask on its own: with the mask targeted and unlinked, the Move tool transforms the
   *  mask's placement instead of the layer. A linked mask moves with its layer, and a solid (never painted) mask covers
   *  everything wherever it sits, so neither qualifies. */
  transformsMask(l: Layer | null | undefined): boolean {
    return !!l && !!this.current?.maskTarget && !!l.mask?.raster && !l.mask.linked;
  }

  /** the reference app's groupTransformMembers: with more than one layer selected, or a folder, the Move tool transforms the
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

  /** The group's handle box: the upright bounds of every member's corners (the reference app's groupTransformBox). */
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
      // the reference app's group commit: each member follows the box, its mask following it, as one Transform Layers step.
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
      // the reference app's commitMaskTransform: the mask takes the new placement, its pixels untouched; a placement equal to
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

  /** the reference app's free distort (Cmd-drag a corner handle): the four corners of the Move tool's box move on their own,
   *  pending until applied (Enter) or cancelled (Escape). The box is the active layer's, or with several layers or a
   *  folder selected the group box, each member carried by the same perspective (the reference app's distortTarget). */
  distortEdit: { project: Project; layerId: ID; box: Transform; members: ID[] | null; corners: Pt[]; previews: Map<ID, { pixels: Warped | null; mask: DistortedMask | null }> } | null = null;
  private distortFrame = 0;

  beginDistort(): boolean {
    const p = this.current, l = p?.activeLayer;
    if (!p || !l || this.stroke || this.transformEdit) return false;
    const members = this.groupMembers(p), box = members.length ? this.groupBox() : null;
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

  /** A layer's mask through a distortion to `quad`, as in the reference app: linked on the layer, it warps with the pixels;
   *  linked but placed apart, it takes the same perspective over its own bounds with its edge tone outside;
   *  unlinked, it stays where it is on the document. */
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
   *  is ignored, as in the reference app. The preview is re-warped once per frame. */
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
      if (l?.raster && q) d.previews.set(id, { pixels: warpRaster(l.raster, l.transform, q, scale), mask: this.distortMask(l, q, scale) });
    }
    this.emit('render', null);
  }

  /** the reference app's Apply: each distorted layer's pixels resampled into its shape at full resolution and trimmed to what
   *  is visible, leaving upright layers, its mask handled by `distortMask` (a linked mask cropped with the pixels), as
   *  one Distort step, or Distort Layers for a group. */
  applyDistort(): void {
    const d = this.distortEdit;
    if (!d) return;
    this.dropDistort();
    const p = d.project;
    if (p !== this.current) return;
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

  previewImageEdit(run: (src: ImageData, scale: number) => ImageData, grow = 0, maxPixels = 2_000_000): void {
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
    const out = run(src, scale);
    const cov = g ? null : this.coverageFor(p, l, onMask ? 'mask' : 'pixels', w, h);
    let result = cov ? this.blendThrough(src, out, cov) : out;
    if (onMask) result = fromGray(result);
    c.putImageData(result, 0, 0);
    const t = l.transform, gx = (g / scale) * (t.w / r.width), gy = (g / scale) * (t.h / r.height);
    this.setPreview(l.id, onMask ? 'mask' : 'pixels', s, g ? { ...t, x: t.x - gx, y: t.y - gy, w: t.w + 2 * gx, h: t.h + 2 * gy } : undefined);
  }

  applyImageEdit(name: string, run: (src: ImageData, scale: number) => ImageData, grow = 0): void {
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

  /** the reference app's Cmd-J: with a selection, its pixels on the active layer (or its mask, as gray) become a new layer in
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

  /** the reference app's blurSample for a mask: the mask as the canvas shows it at document size (white, the level in alpha),
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

  beginRetouchStroke(kind: 'heal' | 'clone' | 'blur', pt: Pt, shift: boolean): boolean {
    const p = this.current;
    if (!p || this.stroke || this.warpState) return false;
    this.settle();
    const l0 = p.activeLayer;
    if (!this.paintable(l0)) { this.notice('Select a pixel layer first.'); return false; }
    const onMask = p.maskTarget && !!l0.mask;
    if (onMask && kind !== 'blur') { this.notice('This tool works on layer pixels. Click the layer thumbnail to target them.'); return false; }
    let texture: { surface: Surface; dx: number; dy: number } | null = null;
    if (kind === 'clone') {
      const off = this.cloneStrokeOffset(pt);
      if (!off) { this.notice('Alt-click to set where Clone Stamp copies from.'); return false; }
      this.cloneOffset = off;
      texture = { surface: this.retouch.cloneSampleAll ? renderDoc(this.work, p.doc) : this.layerSample(p, l0), dx: off.x, dy: off.y };
    } else if (kind === 'blur') {
      const sigma = clamp(this.brush.diameter / 10, 1.5, 30);
      texture = { surface: onMask ? this.maskBlurSample(p, l0, sigma) : this.layerSample(p, l0, sigma), dx: 0, dy: 0 };
    }
    p.history.begin(kind === 'heal' ? 'Spot Healing' : kind === 'clone' ? 'Clone Stamp' : 'Blur', p.snapshot());
    const pick = this.target(p) as NonNullable<ReturnType<Engine['target']>>;
    const white = { r: 255, g: 255, b: 255 };
    const style = kind === 'heal' ? { ...this.brush, opacity: 0.45, color: white } : { ...this.brush, color: white };
    const s = new PixelStroke(pick.raster, pick.local, style, 'source-over', p.selection, texture, pick.target === 'mask');
    this.stroke = { project: p, layerId: pick.layer.id, target: pick.target, s, heal: kind === 'heal' ? this.retouch.healMode : undefined };
    const last = this.lastBrush;
    if (shift && last && last.layerId === pick.layer.id && last.target === pick.target) s.to(last.p);
    s.to(pt);
    s.compose();
    this.emit('render', null);
    return true;
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
   *  document. the reference app's Levels eyedroppers sample the edit's original image the same way. */
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
   *  existing mask of the same size is kept too, multiplied in: what either hides stays hidden (the reference app's
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

  /** the reference app's sample ring: while a drag samples the canvas, the new color shows on the ring's top half and the
   *  color before the drag on its bottom half. `showsSampleRing` is the Eyedropper's Sample Ring option. */
  showsSampleRing = true;
  sampleRing: { at: Pt; sampled: RGB; original: RGB } | null = null;

  setSampleRing(ring: { at: Pt; sampled: RGB; original: RGB } | null): void {
    if (!ring && !this.sampleRing) return;
    this.sampleRing = ring && this.showsSampleRing ? ring : null;
    this.emit('overlay', null);
  }

  /** the reference app's arrow-key nudge for selection tools: the outline moves 1 px (10 with Shift at the caller), each
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
    return toBlob(renderDoc(this.work, p.doc, type === 'image/jpeg' ? '#ffffff' : null), type, quality);
  }

  flattened(): Surface | null { const p = this.current; return p ? renderDoc(this.work, p.doc) : null; }
}
