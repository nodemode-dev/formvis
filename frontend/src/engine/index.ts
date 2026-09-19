import { Emitter } from './events';
import type { Snapshot } from './history';
import { Renderer, renderDoc, type LayerOverride } from './renderer';
import { PixelStroke } from './stroke';
import { SelectionMask, type SelectionMode } from './selection';
import { Raster, createSurface, ctxOf, toBlob, type Surface } from './surface';
import { applyMat, boundsOf, contains, integral, intersectRect, invert, isAxisAligned, mul, placement, sameTransform, setMat, transformBounds, translation, unionRect, type Mat } from './geometry';
import { ancestors, byId, descendantIds, hierarchy, isDescendant } from './tree';
import { dragged, rounded, type DragMode } from './transform';
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
  wand = { tolerance: 32, contiguous: true, sampleAll: false };
  showPixelGrid = true;
  showTransformControls = true;
  autoSelect = false;
  lockRatio = true;
  transformEdit: { project: Project; layerId: ID; original: Transform; draft: Transform; mode: DragMode; start: Pt } | null = null;
  selectionShift: { project: Project; dx: number; dy: number } | null = null;
  private currentId: string | null = null;
  private viewSize = { w: 800, h: 600 };
  private readonly display = new Renderer();
  private readonly work = new Renderer();
  private stroke: { project: Project; layerId: ID; target: Target; s: PixelStroke } | null = null;
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

  settle(): void {
    if (this.transformEdit) this.endTransform();
    if (this.selectionShift) this.endSelectionShift();
    if (this.opacityOpen) this.endOpacityEdit();
    if (this.swipeOpen) this.endVisibilitySwipe();
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
    if (te && te.project === p) m.set(te.layerId, { ...(m.get(te.layerId) ?? {}), transform: te.draft });
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

  deleteLayers(): void {
    const p0 = this.current;
    if (!p0) return;
    if (p0.maskTarget && p0.activeLayer?.mask && p0.selectedIds.size <= 1) { this.deleteMask(false); return; }
    this.edit('Delete Layer', (p) => {
      const roots = this.selectedRoots(p);
      if (!roots.length) return false;
      const doomed = new Set<ID>();
      for (const id of roots) { doomed.add(id); for (const d of descendantIds(p.doc.layers, id)) doomed.add(d); }
      const order = hierarchy(p.doc, true).map((e) => e.layer.id);
      const first = Math.min(...roots.map((id) => order.indexOf(id)));
      const kept = p.doc.layers.filter((l) => !doomed.has(l.id)).map((l) => (l.clipId && doomed.has(l.clipId) ? { ...l, clipId: null } : l));
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
      p.setLayers(this.normalizeClips(layers));
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
    const t = layer.transform, r = layer.raster;
    if (!isAxisAligned(t, r.width, r.height)) return r;
    if (t.x <= 0 && t.y <= 0 && t.x + t.w >= W && t.y + t.h >= H) return r;
    const u = unionRect({ x: t.x, y: t.y, w: t.w, h: t.h }, { x: 0, y: 0, w: W, h: H });
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
    const patch = st.s.commit();
    if (patch) st.project.history.addPatch(patch);
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
    this.regionEdit('Clear', ({ raster, rect, cover }) => {
      const c = raster.ctx;
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'destination-out';
      c.drawImage(this.tint(rect, '#ffffff', cover), rect.x, rect.y);
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
    const mask = wandMask(data, W, H, x, y, this.wand.tolerance, this.wand.contiguous);
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

  beginTransform(mode: DragMode, start: Pt): boolean {
    const p = this.current;
    const l = p?.activeLayer;
    if (!p || !l || l.isGroup || !l.raster || this.stroke) return false;
    this.settle();
    this.transformEdit = { project: p, layerId: l.id, original: l.transform, draft: l.transform, mode, start };
    return true;
  }

  updateTransform(pt: Pt, shift: boolean, alt: boolean): void {
    const te = this.transformEdit;
    if (!te) return;
    te.draft = dragged(te.original, te.start, pt, te.mode, this.lockRatio, shift, alt);
    this.emit('render', null);
    this.emit('options', null);
  }

  endTransform(): void {
    const te = this.transformEdit;
    if (!te) return;
    this.transformEdit = null;
    const next = rounded(te.draft);
    if (sameTransform(next, te.original) || this.current !== te.project) { this.emit('render', null); return; }
    const name = te.mode.kind === 'move' ? 'Move Layer' : te.mode.kind === 'rotate' ? 'Rotate Layer' : 'Transform Layer';
    this.edit(name, (p) => {
      const l = p.layer(te.layerId);
      if (!l) return false;
      p.updateLayer(l.id, { transform: next, mask: followMask(l, next) });
      return true;
    });
  }

  cancelTransform(): void { if (this.transformEdit) { this.transformEdit = null; this.emit('render', null); this.emit('options', null); } }

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
