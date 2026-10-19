import type { ID, Pt, Rect, Transform, Layer, Mask } from './types';
import { placement, invert, mul, transformBounds, integral, unitPoint } from './geometry';
import type { Mat } from './geometry';
import { createSurface, ctxOf } from './surface';
import type { Raster, Surface } from './surface';
import type { SelectionMask } from './selection';
import { hierarchy } from './tree';
import { dragged, HANDLES } from './transform';
import type { DragMode } from './transform';
import { cornersOf, carried, distortUsable, warpRaster, cropWarp, visibleBounds, maskEdgeTone } from './distort';
import type { Warped } from './distort';
import { WarpStroke, premultiply, unpremultiply } from './retouch';
import type { Project } from './project';
import { gpuFilters } from './gpu-filters';

/** A Smudge brush at least this many pixels across runs its dabs on the GPU when a runner is registered. */
const GPU_SMUDGE_MIN_DIAMETER = 48;

export type DistortMode = 'distort' | 'skew' | 'perspective';
export interface DistortedMask { warped: Warped | null; placement: Transform | null }

export interface TransformEditState { project: Project; layerId: ID; original: Transform; draft: Transform; mode: DragMode; start: Pt; mask: boolean; group: { box: Transform; originals: Map<ID, Transform> } | null; base?: Transform }
export interface DistortEditState { project: Project; layerId: ID; box: Transform; members: ID[] | null; corners: Pt[]; mode: DistortMode; skew?: { h: number; v: number }; smart?: { R: Raster; t: Transform; margin: number; start: Pt[] }; previews: Map<ID, { pixels: Warped | null; mask: DistortedMask | null }> }
export interface WarpDrag { project: Project; layerId: ID; stroke: WarpStroke; surface: Surface; image: ImageData }
export interface SelectionShift { project: Project; dx: number; dy: number }

export interface EntryHost {
  readonly current: Project | null;
  readonly busy: boolean;
  settle(keepFloating?: boolean): void;
  notice(message: string): void;
  emit(what: 'render' | 'options' | 'overlay'): void;
  refresh(): void;
  edit(label: string, fn: (p: Project) => boolean | void): void;
  positionLocked(l: Layer | null | undefined): boolean;
  linkedOf(p: Project): ReadonlySet<ID>;
  keyedOffset(p: Project, id: ID): { dx: number; dy: number };
  floatingId(p: Project): ID | null;
  snapping: boolean;
  lockRatio: boolean;
  snapMove(p: Project, id: ID, t: Transform, moving?: ReadonlySet<ID>): Transform;
  snapEdges(p: Project, box: Rect, skip: (id: ID) => boolean): Pt | null;
  pendingDraft(): Transform | null;
  clearSnapGuides(): void;
  setLayerTransform(patch: Partial<Transform>, label: string): void;
  smartStart(l: Layer): { R: Raster; t: Transform; margin: number; corners: Pt[] } | null;
  applySmartDistort(d: DistortEditState, label: string): void;
  smartPreview(l: Layer, d: DistortEditState, quad: Pt[], scale: number): { pixels: Warped | null; mask: DistortedMask | null };
  vectorThrough(l: Layer, from: Pt[], to: Pt[]): Layer['vectorMask'];
  shapeThrough(p: Project, l: Layer, from: Pt[], to: Pt[]): boolean;
  setLastQuads(from: Pt[], to: Pt[]): void;
  requestFrame(fn: () => void): void;
  cancelFrame(): void;
  canPaint(p: Project): boolean;
  target(p: Project): { layer: Layer; raster: Raster; local: Mat } | null;
  composite(p: Project): Surface;
  layerSample(p: Project, l: Layer): Surface;
  brush: { diameter: number; hardness: number; opacity: number };
  smudge: { sampleAll: boolean; below: boolean; fingerPainting: boolean; length: number };
  belowSample(p: Project, l: Layer): Surface;
  fg: { r: number; g: number; b: number };
  css(c: { r: number; g: number; b: number }, a?: number): string;
}

const GROUP_DISTORT_NOTICE = 'Smart objects and shape layers are distorted one at a time, not with other layers.';

function copyTransform(t: Transform): Transform {
  return { ...t };
}

export function transformsMask(p: Project, l: Layer | null | undefined): boolean {
  if (!l || !p.maskTarget) return false;
  const m = l.mask;
  return !!m && !!m.raster && !m.linked;
}

function selectedSet(host: EntryHost, p: Project): Set<ID> {
  const s = new Set<ID>(host.linkedOf(p));
  p.selectedIds.forEach((id) => s.add(id));
  if (s.size === 0 && p.activeId) s.add(p.activeId);
  return s;
}

export function groupMembers(host: EntryHost, p: Project): Layer[] {
  const sel = selectedSet(host, p);
  const active = p.activeLayer;
  if (sel.size <= 1 && active && transformsMask(p, active)) return [];
  let hasFolder = false;
  sel.forEach((id) => {
    const l = p.layer(id);
    if (l && l.isGroup) hasFolder = true;
  });
  if (sel.size <= 1 && !hasFolder) return [];
  const byId = new Map<ID, Layer>();
  for (const l of p.doc.layers) byId.set(l.id, l);
  const covered = (l: Layer): boolean => {
    let cur: Layer | undefined = l;
    let guard = 0;
    while (cur && guard++ < 1000) {
      if (sel.has(cur.id)) return true;
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return false;
  };
  const shown = new Map<ID, boolean>();
  for (const e of hierarchy(p.doc)) shown.set(e.layer.id, e.visible);
  return p.doc.layers.filter((l) => shown.get(l.id) === true && !l.isGroup && !!l.raster && !l.adjustment && covered(l));
}

export function groupBox(host: EntryHost): Transform | null {
  const p = host.current;
  if (!p) return null;
  const members = groupMembers(host, p);
  if (members.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const m of members) {
    const b = transformBounds(m.transform);
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0), rotation: 0, flipX: false, flipY: false, sampling: 'high' };
}

export function beginTransform(host: EntryHost, mode: DragMode, start: Pt): TransformEditState | null {
  const p = host.current;
  if (!p || host.busy) return null;
  const l = p.activeLayer;
  if (!l) return null;
  if (host.positionLocked(l)) return null;
  const linked = host.linkedOf(p);
  for (const id of linked) {
    if (id !== l.id && !p.selectedIds.has(id) && host.positionLocked(p.layer(id))) return null;
  }
  const members = groupMembers(host, p);
  if (members.length > 0) {
    for (const m of members) if (host.positionLocked(m)) return null;
    host.settle();
    const box = groupBox(host);
    if (!box) return null;
    const originals = new Map<ID, Transform>();
    for (const m of members) originals.set(m.id, copyTransform(m.transform));
    return { project: p, layerId: l.id, original: copyTransform(box), draft: copyTransform(box), mode, start, mask: false, group: { box: copyTransform(box), originals } };
  }
  if (l.isGroup) return null;
  const maskAlone = transformsMask(p, l);
  if (!maskAlone && (!l.raster || l.adjustment)) return null;
  let pt = start;
  if (!maskAlone) {
    const ko = host.keyedOffset(p, l.id);
    pt = { x: start.x - ko.dx, y: start.y - ko.dy };
  }
  host.settle(host.floatingId(p) === l.id);
  const cur = p.layer(l.id);
  if (!cur) return null;
  const box = maskAlone && cur.mask ? (cur.mask.placement ?? cur.transform) : cur.transform;
  return { project: p, layerId: cur.id, original: copyTransform(box), draft: copyTransform(box), mode, start: pt, mask: maskAlone, group: null };
}

export function updateTransform(host: EntryHost, te: TransformEditState, pt: Pt, shift: boolean, alt: boolean, bypass = false): void {
  let now = pt;
  if (!te.group && !te.mask) {
    const ko = host.keyedOffset(te.project, te.layerId);
    now = { x: pt.x - ko.dx, y: pt.y - ko.dy };
  }
  const from = te.base ?? te.original;
  let next = dragged(from, te.start, now, te.mode, host.lockRatio, shift, alt);
  if (te.mode.kind === 'move' && host.snapping && !bypass) {
    const moving = te.group ? new Set<ID>(te.group.originals.keys()) : undefined;
    next = host.snapMove(te.project, te.layerId, next, moving);
  } else if (te.mode.kind === 'resize' && host.snapping && !bypass && !te.mask && from.rotation % 360 === 0 && next.rotation % 360 === 0) {
    const h = HANDLES[te.mode.handle];
    const at = unitPoint(next, h.x, h.y);
    const off = -1e9;
    const moving = te.group ? new Set<ID>(te.group.originals.keys()) : new Set<ID>([te.layerId]);
    const d = host.snapEdges(te.project, { x: h.x === 0.5 ? off : at.x, y: h.y === 0.5 ? off : at.y, w: 0, h: 0 }, (id) => moving.has(id));
    if (d) next = dragged(from, te.start, { x: now.x + (h.x === 0.5 ? 0 : d.x), y: now.y + (h.y === 0.5 ? 0 : d.y) }, te.mode, host.lockRatio, shift, alt);
  } else {
    host.clearSnapGuides();
  }
  te.draft = next;
  host.emit('render');
  host.emit('options');
}

export function beginDistort(host: EntryHost, mode: DistortMode = 'distort', shapeNotice: string): DistortEditState | null {
  const p = host.current;
  if (!p) return null;
  const l = p.activeLayer;
  if (!l || host.busy) return null;
  if (l.vector && l.mask?.raster) {
    host.notice(shapeNotice);
    return null;
  }
  const members = groupMembers(host, p);
  if (members.length > 0) {
    if (members.some((m) => !!m.smart || !!m.vector)) {
      host.notice(GROUP_DISTORT_NOTICE);
      return null;
    }
    host.settle();
    const box = groupBox(host);
    if (!box) return null;
    const d: DistortEditState = { project: p, layerId: l.id, box, members: members.map((m) => m.id), corners: cornersOf(box), mode, previews: new Map() };
    host.emit('render');
    host.emit('options');
    return d;
  }
  if (l.smart) {
    const s = host.smartStart(l);
    if (!s) return null;
    const d: DistortEditState = {
      project: p,
      layerId: l.id,
      box: copyTransform(s.t),
      members: null,
      corners: s.corners.map((c) => ({ x: c.x, y: c.y })),
      mode,
      smart: { R: s.R, t: s.t, margin: s.margin, start: s.corners.map((c) => ({ x: c.x, y: c.y })) },
      previews: new Map(),
    };
    host.emit('render');
    host.emit('options');
    return d;
  }
  if (l.isGroup || l.adjustment || !l.raster || transformsMask(p, l)) return null;
  host.settle(host.floatingId(p) === l.id);
  const cur = p.layer(l.id);
  if (!cur) return null;
  const d: DistortEditState = { project: p, layerId: cur.id, box: copyTransform(cur.transform), members: null, corners: cornersOf(cur.transform), mode, previews: new Map() };
  host.emit('render');
  host.emit('options');
  return d;
}

export function moveDistortHandle(
  host: EntryHost,
  d: DistortEditState,
  handle: number,
  from: Pt[],
  dx: number,
  dy: number,
  draggedFn: (from: Pt[], handle: number, dx: number, dy: number, mode: DistortMode) => Pt[],
): void {
  const next = draggedFn(from, handle, dx, dy, d.mode);
  if (!distortUsable(next)) return;
  d.corners = next;
  host.requestFrame(() => previewDistort(host, d));
  host.emit('render');
}

export function previewDistort(host: EntryHost, d: DistortEditState): void {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of d.corners) {
    x0 = Math.min(x0, c.x);
    y0 = Math.min(y0, c.y);
    x1 = Math.max(x1, c.x);
    y1 = Math.max(y1, c.y);
  }
  const extent = Math.max(x1 - x0, y1 - y0);
  const scale = extent > 0 ? Math.min(1, 640 / extent) : 1;
  const previews = new Map<ID, { pixels: Warped | null; mask: DistortedMask | null }>();
  const p = d.project;
  if (d.members) {
    for (const id of d.members) {
      const l = p.layer(id);
      if (!l || !l.raster) continue;
      const quad = carried(l.transform, d.box, d.corners);
      if (!distortUsable(quad)) continue;
      previews.set(id, { pixels: warpRaster(l.raster, l.transform, quad, scale), mask: distortMask(l, quad, scale) });
    }
  } else {
    const l = p.layer(d.layerId);
    if (l) {
      if (d.smart) {
        previews.set(l.id, host.smartPreview(l, d, d.corners, scale));
      } else if (l.raster && distortUsable(d.corners)) {
        previews.set(l.id, { pixels: warpRaster(l.raster, l.transform, d.corners, scale), mask: distortMask(l, d.corners, scale) });
      }
    }
  }
  d.previews = previews;
  host.emit('render');
}

export function distortMask(l: Layer, quad: Pt[], scale: number): DistortedMask | null {
  const m = l.mask;
  if (!m || !m.raster) return null;
  if (!m.linked) return { warped: null, placement: m.placement ?? l.transform };
  if (!m.placement) {
    return { warped: warpRaster(m.raster, l.transform, quad, scale, true), placement: null };
  }
  const mq = carried(m.placement, l.transform, quad);
  if (!distortUsable(mq)) return null;
  const warped = warpRaster(m.raster, m.placement, mq, scale, true, maskEdgeTone(m.raster));
  if (!warped) return null;
  return { warped, placement: warped.t };
}

function sameCorners(a: Pt[], b: Pt[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i].x !== b[i].x || a[i].y !== b[i].y) return false;
  return true;
}

function distortLabel(mode: DistortMode): string {
  return mode === 'skew' ? 'Skew' : mode === 'perspective' ? 'Perspective' : 'Distort';
}

export function applyDistort(host: EntryHost, d: DistortEditState): void {
  host.cancelFrame();
  host.emit('render');
  host.emit('options');
  if (host.current !== d.project) return;
  const label = distortLabel(d.mode);
  const startCorners = d.smart ? d.smart.start : cornersOf(d.box);
  if (!sameCorners(startCorners, d.corners)) host.setLastQuads(startCorners, d.corners);
  if (d.smart) {
    host.applySmartDistort(d, label);
    return;
  }
  const ids = d.members ?? [d.layerId];
  host.edit(d.members ? `${label} Layers` : label, (pr) => {
    let any = false;
    for (const id of ids) {
      const l = pr.layer(id);
      if (!l || !l.raster) continue;
      const quad = d.members ? carried(l.transform, d.box, d.corners) : d.corners;
      if (!distortUsable(quad)) continue;
      if (l.vector && !d.members) {
        if (host.shapeThrough(pr, l, cornersOf(l.transform), quad)) any = true;
        continue;
      }
      const w = warpRaster(l.raster, l.transform, quad);
      if (!w) continue;
      const vis = visibleBounds(w.raster);
      if (!vis) continue;
      const cropped = cropWarp(w, vis);
      const patch: Partial<Layer> = { raster: cropped.raster, transform: cropped.t, shape: null };
      const m = l.mask;
      if (m && m.raster && m.linked) {
        if (!m.placement) {
          const mw = warpRaster(m.raster, l.transform, quad, 1, true);
          if (mw) {
            const mc = cropWarp(mw, vis);
            const nm: Mask = { raster: mc.raster, enabled: m.enabled, linked: m.linked, placement: null };
            patch.mask = nm;
          }
        } else {
          const mq = carried(m.placement, l.transform, quad);
          if (distortUsable(mq)) {
            const mw = warpRaster(m.raster, m.placement, mq, 1, true, maskEdgeTone(m.raster));
            if (mw) {
              const nm: Mask = { raster: mw.raster, enabled: m.enabled, linked: m.linked, placement: mw.t };
              patch.mask = nm;
            }
          }
        }
      }
      if (l.vectorMask) {
        const vm = host.vectorThrough(l, cornersOf(l.transform), quad);
        if (vm !== undefined) patch.vectorMask = vm;
      }
      pr.updateLayer(id, patch);
      any = true;
    }
    return any;
  });
}

export function cancelDistort(host: EntryHost, d: DistortEditState): void {
  void d;
  host.cancelFrame();
  host.emit('render');
  host.emit('options');
}

function syncRect(w: WarpDrag, r: Rect): void {
  const W = w.stroke.width;
  const H = w.image.height;
  const ir = integral(r);
  const x0 = Math.max(0, ir.x);
  const y0 = Math.max(0, ir.y);
  const x1 = Math.min(W, ir.x + ir.w);
  const y1 = Math.min(H, ir.y + ir.h);
  if (x1 <= x0 || y1 <= y0) return;
  unpremultiply(w.stroke.pixels, w.image.data, y0 * W * 4, y1 * W * 4);
  ctxOf(w.surface).putImageData(w.image, 0, 0, x0, y0, x1 - x0, y1 - y0);
}

export function beginWarp(host: EntryHost, mode: 'smudge' | 'liquify', pt: Pt): WarpDrag | null {
  const p = host.current;
  if (!p || host.busy) return null;
  host.settle();
  const noLayer = 'Select a layer with pixels first.';
  if (p.activeLayer && p.maskTarget) {
    host.notice('Smudge and Liquify work on layer pixels. Click the layer thumbnail to target them.');
    return null;
  }
  if (!host.canPaint(p)) {
    host.notice(noLayer);
    return null;
  }
  const target = host.target(p);
  if (!target) {
    host.notice(noLayer);
    return null;
  }
  const sampleAll = mode === 'smudge' && (host.smudge.sampleAll || host.smudge.below);
  if (!sampleAll && !visibleBounds(target.raster)) {
    host.notice(noLayer);
    return null;
  }
  const label = mode === 'smudge' ? 'Smudge' : 'Liquify';
  p.history.begin(label, p.snapshot());
  const src = sampleAll ? (host.smudge.sampleAll ? host.composite(p) : host.belowSample(p, target.layer)) : host.layerSample(p, target.layer);
  const W = p.doc.width;
  const H = p.doc.height;
  const surface = createSurface(W, H);
  const ctx = ctxOf(surface);
  ctx.drawImage(src, 0, 0);
  if (mode === 'smudge' && host.smudge.fingerPainting) {
    const r = Math.max(0.5, host.brush.diameter / 2);
    const hard = host.brush.hardness > 1 ? host.brush.hardness / 100 : host.brush.hardness;
    const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r);
    g.addColorStop(0, host.css(host.fg, 1));
    g.addColorStop(Math.min(0.999, Math.max(0, hard)), host.css(host.fg, 1));
    g.addColorStop(1, host.css(host.fg, 0));
    ctx.fillStyle = g;
    ctx.fillRect(pt.x - r, pt.y - r, r * 2, r * 2);
  }
  const image = ctx.getImageData(0, 0, W, H);
  const pm = premultiply(image.data);
  const stroke = new WarpStroke(pm, W, H, mode, host.brush.diameter, host.brush.hardness, host.brush.opacity, mode === 'smudge' ? host.smudge.length / 100 : 1);
  if (mode === 'smudge' && host.brush.diameter >= GPU_SMUDGE_MIN_DIAMETER) {
    try { stroke.useGpu(gpuFilters()?.smudge?.(pm, W, H) ?? null); } catch { /* the CPU smudges */ }
  }
  const drag: WarpDrag = { project: p, layerId: target.layer.id, stroke, surface, image };
  const first = stroke.append(pt);
  if (first) syncRect(drag, first);
  host.emit('render');
  return drag;
}

export function warpTo(host: EntryHost, w: WarpDrag, pt: Pt, pressure = 1): void {
  const r = w.stroke.append(pt, pressure);
  if (r) syncRect(w, r);
  host.emit('render');
}

export function cancelWarp(host: EntryHost, w: WarpDrag): void {
  w.stroke.release();
  const snap = w.project.history.abort();
  if (snap) {
    w.project.doc = snap.doc;
    w.project.selection = snap.selection;
  }
  host.refresh();
}

export function beginSelectionShift(host: EntryHost): SelectionShift | null {
  const p = host.current;
  if (!p || !p.selection) return null;
  return { project: p, dx: 0, dy: 0 };
}

export function updateSelectionShift(host: EntryHost, s: SelectionShift, dx: number, dy: number): void {
  s.dx = Math.round(dx);
  s.dy = Math.round(dy);
  host.emit('overlay');
}

export function endSelectionShift(host: EntryHost, s: SelectionShift): void {
  if ((s.dx === 0 && s.dy === 0) || host.current !== s.project) {
    host.emit('overlay');
    return;
  }
  const dx = s.dx;
  const dy = s.dy;
  host.edit('Move Selection', (p) => {
    const sel = p.selection;
    if (!sel) return false;
    p.selection = sel.translated(dx, dy, p.doc.width, p.doc.height);
    return true;
  });
}

function resizable(l: Layer | null): l is Layer & { raster: Raster } {
  return !!l && !!l.raster && !l.isGroup && !l.adjustment;
}

export function resizeLayerTo(host: EntryHost, value: number, width: boolean): void {
  const p = host.current;
  if (!p) return;
  const l = p.activeLayer;
  if (!resizable(l) || !(value > 0) || !Number.isFinite(value)) return;
  const t = host.pendingDraft() ?? l.transform;
  const cx = t.x + t.w / 2;
  const cy = t.y + t.h / 2;
  let nw = t.w;
  let nh = t.h;
  if (width) {
    nw = value;
    if (host.lockRatio && t.w > 0) nh = (t.h * value) / t.w;
  } else {
    nh = value;
    if (host.lockRatio && t.h > 0) nw = (t.w * value) / t.h;
  }
  host.setLayerTransform({ x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh }, 'Resize Layer');
}

export function scaleLayerTo(host: EntryHost, percent: number): void {
  const p = host.current;
  if (!p) return;
  const l = p.activeLayer;
  if (!resizable(l) || !(percent > 0) || !Number.isFinite(percent)) return;
  const t = l.transform;
  const nw = (l.raster.width * percent) / 100;
  const nh = (l.raster.height * percent) / 100;
  host.setLayerTransform({ x: t.x + t.w / 2 - nw / 2, y: t.y + t.h / 2 - nh / 2, w: nw, h: nh }, 'Scale Layer');
}

export function floatingOutline(
  p: Project,
  fs: { selection: SelectionMask; region: Rect; floatingId: ID; original: Transform; project: Project },
  draft: Transform | null,
  distorting: boolean,
): { selection: SelectionMask; m: Mat } | null {
  if (distorting) return null;
  const l = p.layer(fs.floatingId);
  if (!l || !l.raster) return null;
  const r = l.raster;
  if (r.width !== fs.region.w || r.height !== fs.region.h) return null;
  const t = draft ?? l.transform;
  const m = mul(placement(t, r.width, r.height), invert(placement(fs.original, r.width, r.height)));
  return { selection: fs.selection, m };
}
