// Paths (DEV_PLAN 36.13): the Engine's path methods (the path set, the Work Path, the shape and vector mask entries, path
// edit gestures, make selection, fill and stroke path), moved out of index.ts. The state they share (each document's path
// set, the working copies of a shape's and a vector mask's path, the open gesture) lives in a PathStore the Engine holds;
// each function takes a PathHost, the few Engine members it uses, so this file never imports the Engine class.
import type { Project } from './project';
import type { Target } from './image-edit';
import { fillVector, pathBounds, samplePath, shiftPath, tracePath, type NamedPath, type PathSet, type VectorPath } from './paths';
import { SelectionMask, type SelectionMode } from './selection';
import { createSurface, ctxOf, type Ctx2D, type Raster, type Surface } from './surface';
import { invert, mul, placement, setMat, translation } from './geometry';
import { pressureOption, type BrushDynamics } from './brush-dynamics';
import { uid, type ID, type Layer, type Pt, type Rect, type RGB, type ShapeStyle } from './types';
import type { StrokeTool } from './index';

/** The path state the Engine keeps: each open document's paths, the working copies the tools hold during a drag, and the
 *  gesture open on a path. */
export class PathStore {
  readonly sets = new WeakMap<Project, PathSet>();
  /** The working copy of the active layer's vector mask path that the tools change in place, as `shapeEdit` is. */
  maskEdit: { project: Project; layerId: ID; layer: Layer; path: VectorPath } | null = null;
  /** The working copy of the active shape layer's path, and the layer object it matches: a copy the tools hold during
   *  a drag, rebuilt only when the layer changes some other way (a move, an undo, a recolour). */
  shapeEdit: { project: Project; layerId: ID; layer: Layer; path: VectorPath } | null = null;
  gesture: Project | null = null;
  gestureWork = false;
}

/** The retouch kinds a path stroke can run. */
export type PathRetouchKind = 'heal' | 'healBrush' | 'clone' | 'blur' | 'sharpen' | 'dodge' | 'burn' | 'sponge' | 'patternStamp' | 'historyBrush' | 'colorReplace';

/** What the path methods need of the Engine. */
export interface PathHost {
  current: Project | null;
  store: PathStore;
  /** The foreground colour. */
  fg: RGB;
  /** The brush's diameter. */
  brushDiameter: number;
  notice(text: string): void;
  edit(name: string, fn: (p: Project) => boolean | void): boolean;
  refresh(): void;
  settle(): void;
  emit(what: 'overlay' | 'options' | 'paths'): void;
  css(c: RGB): string;
  /** Re-renders shape layer `id` in `p` from `path` (shape layers stay with the Engine). */
  reshape(p: Project, id: ID, path: VectorPath, style?: ShapeStyle): void;
  changeVectorMask(change: 'delete' | 'enable' | 'link'): boolean;
  applySelection(next: SelectionMask | null, mode: SelectionMode, name: string): void;
  paintable(l: Layer | null): boolean;
  regionEdit(name: string, apply: (a: { raster: Raster; target: Target; rect: Rect; cover: Surface | null }) => void): void;
  /** The stroke engine a path stroke drives: the brush settings it borrows and the stroke calls. */
  stroker: {
    dynamics: BrushDynamics;
    mode: 'paint' | 'erase';
    begin(pt: Pt, pressure: number, aliased?: boolean): boolean;
    beginRetouch(kind: PathRetouchKind, pt: Pt): boolean;
    to(pt: Pt, pressure: number): void;
    end(): void;
  };
}

export function pathSet(host: PathHost, p: Project): PathSet {
  let set = host.store.sets.get(p);
  if (!set) { set = { list: [], active: null }; host.store.sets.set(p, set); }
  return set;
}

export function selectedPath(host: PathHost, p: Project): NamedPath | null {
  const set = pathSet(host, p);
  if (set.active?.startsWith('shape:')) return shapeEntry(host, p)?.id === set.active ? shapeEntry(host, p) : null;
  if (set.active?.startsWith('vmask:')) return maskEntry(host, p)?.id === set.active ? maskEntry(host, p) : null;
  return set.list.find((n) => n.id === set.active) ?? null;
}

/** The active layer's vector mask as a path entry (1.66.1), its outline in document pixels, reshaped in place by the
 *  path tools as a shape's outline is. */
export function maskEntry(host: PathHost, p: Project): NamedPath | null {
  const l = p.activeLayer, v = l?.vectorMask;
  if (!l || !v) return null;
  const e = host.store.maskEdit;
  if (!e || e.project !== p || e.layerId !== l.id || e.layer !== l) host.store.maskEdit = { project: p, layerId: l.id, layer: l, path: structuredClone(v.path) };
  return { id: `vmask:${l.id}`, name: `${l.name} Vector Mask`, path: (host.store.maskEdit as { path: VectorPath }).path, work: false, shape: true, mask: true };
}

/** The active shape layer's outline as a path entry, its working copy moved along with any move of the layer. */
export function shapeEntry(host: PathHost, p: Project): NamedPath | null {
  const l = p.activeLayer;
  if (!l?.vector) return null;
  const e = host.store.shapeEdit;
  if (!e || e.project !== p || e.layerId !== l.id || e.layer !== l) {
    const dx = l.transform.x - l.vector.origin.x, dy = l.transform.y - l.vector.origin.y;
    host.store.shapeEdit = { project: p, layerId: l.id, layer: l, path: shiftPath(l.vector.path, dx, dy) };
  }
  return { id: `shape:${l.id}`, name: `${l.name} Shape Path`, path: (host.store.shapeEdit as { path: VectorPath }).path, work: false, shape: true };
}

/** Brackets a pointer gesture on the selected path, so a gesture on a Shape Path is one undo step. */
export function beginPathEdit(host: PathHost): void {
  const p = host.current, entry = p ? selectedPath(host, p) : null;
  if (!p || host.store.gesture || !entry) return;
  host.settle();
  // A work path's edits are undoable too (1.49.3: they never were): the step carries the paths before and after.
  host.store.gestureWork = !entry.shape;
  p.history.begin(entry.mask ? 'Edit Vector Mask' : entry.shape ? 'Edit Shape Path' : 'Edit Path', entry.shape ? p.snapshot() : { ...p.snapshot(), paths: structuredClone(pathSet(host, p)) });
  host.store.gesture = p;
}

export function endPathEdit(host: PathHost): void {
  const p = host.store.gesture;
  if (!p) return;
  host.store.gesture = null;
  p.history.end(host.store.gestureWork ? { ...p.snapshot(), paths: structuredClone(pathSet(host, p)) } : p.snapshot());
  host.refresh();
}

export function cancelPathEdit(host: PathHost): void {
  const p = host.store.gesture;
  if (!p) return;
  host.store.gesture = null;
  p.history.abort();
  host.refresh();
}

export function pathsChanged(host: PathHost, p: Project): void {
  if (p === host.current) { host.emit('overlay'); host.emit('options'); }
  host.emit('paths');
}

/** The current document's paths, the Work Path among them, and which one is selected. Paths live with the document
 *  and save with the project, outside undo. */
export function pathsOfCurrent(host: PathHost): PathSet {
  const p = host.current;
  if (!p) return { list: [], active: null };
  const set = pathSet(host, p), own = [shapeEntry(host, p), maskEntry(host, p)].filter((n): n is NamedPath => !!n);
  return own.length ? { list: [...own, ...set.list], active: set.active } : set;
}

/** The selected path, which the Pen, Direct Selection and the path commands work on; null when none is selected. */
export function workPath(host: PathHost): VectorPath | null { const p = host.current; return p ? selectedPath(host, p)?.path ?? null : null; }

/** Sets the selected path's points. With none selected, a new Work Path takes them, replacing the old one; a Work
 *  Path left with no points goes away, while a named path stays, empty. */
export function setWorkPath(host: PathHost, vp: VectorPath | null): void {
  const p = host.current;
  if (!p) return;
  const set = pathSet(host, p), entry = selectedPath(host, p), has = !!vp && vp.subpaths.some((sp) => sp.anchors.length);
  if (entry?.mask) {
    // Reshaping a vector mask (1.66.1): live within a gesture's undo step, or one step of its own from the keyboard;
    // an outline taken down to nothing leaves the empty mask, which shows (or, inverted, hides) everything.
    const l = p.activeLayer, v = l?.vectorMask;
    if (l && v) {
      const write = (q: Project): void => q.updateLayer(l.id, { vectorMask: { ...v, path: vp && has ? structuredClone(vp) : { subpaths: [] } } });
      if (host.store.gesture === p) write(p);
      else host.edit('Edit Vector Mask', (q) => write(q));
      const e = host.store.maskEdit, now = p.layer(l.id);
      if (e && e.project === p && e.layerId === l.id && now) { e.layer = now; if (vp) e.path = vp; }
      host.refresh();
    }
    pathsChanged(host, p);
    return;
  }
  if (entry?.shape) {
    // Reshaping a shape layer: live within a gesture's undo step, or one step of its own from the keyboard.
    const l = p.activeLayer;
    if (l?.vector && vp && has) {
      (host.store.shapeEdit as { path: VectorPath }).path = vp;
      if (host.store.gesture === p) host.reshape(p, l.id, vp);
      else host.edit('Edit Shape Path', (q) => host.reshape(q, l.id, vp));
      host.refresh();
    }
    pathsChanged(host, p);
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
  pathsChanged(host, p);
}

/** Selects a path by id, or none, so the next Pen drawing starts a new Work Path. */
export function selectPath(host: PathHost, id: ID | null): void {
  const p = host.current;
  if (!p) return;
  const set = pathSet(host, p);
  set.active = id && (set.list.some((n) => n.id === id) || shapeEntry(host, p)?.id === id || maskEntry(host, p)?.id === id) ? id : null;
  pathsChanged(host, p);
}

export function nextPathName(set: PathSet): string { let i = 1; while (set.list.some((n) => n.name === `Path ${i}`)) i++; return `Path ${i}`; }

/** Paths > New Path: an empty named path, selected, for the Pen to draw into. */
export function newPath(host: PathHost): void {
  const p = host.current;
  if (!p) return;
  const set = pathSet(host, p), n: NamedPath = { id: uid(), name: nextPathName(set), path: { subpaths: [] }, work: false };
  set.list.push(n);
  set.active = n.id;
  pathsChanged(host, p);
}

/** Renames a path; naming the Work Path saves it, so it stays when a new one is drawn. */
export function renamePath(host: PathHost, id: ID, name: string): void {
  const p = host.current, n = p ? pathSet(host, p).list.find((x) => x.id === id) : null;
  if (!p || !n) return;
  n.name = name.trim().slice(0, 80) || nextPathName(pathSet(host, p));
  n.work = false;
  pathsChanged(host, p);
}

/** Paths > Clipping Path: marks a saved path (not the Work Path) as the document's clipping path with a flatness in
 *  pixels, or clears the mark with null. Only one path carries it. Paths live outside undo. */
export function setClippingPath(host: PathHost, id: ID | null, flatness = 0): boolean {
  const p = host.current;
  if (!p) return false;
  const set = pathSet(host, p), n = id ? set.list.find((x) => x.id === id) : null;
  if (id && (!n || n.work || n.shape || n.mask)) return false;
  for (const x of set.list) delete x.clipping;
  if (n) n.clipping = Math.max(0, Math.min(100, Number.isFinite(flatness) ? Math.round(flatness * 10) / 10 : 0));
  pathsChanged(host, p);
  return true;
}

/** Paths > Delete Path: removes the selected path, or the one given. */
export function deletePath(host: PathHost, id?: ID): void {
  const p = host.current;
  if (!p) return;
  const set = pathSet(host, p), target = id ?? set.active;
  if (!target) return;
  if (target === maskEntry(host, p)?.id) { host.changeVectorMask('delete'); return; }
  set.list = set.list.filter((n) => n.id !== target);
  if (set.active === target) set.active = null;
  pathsChanged(host, p);
}

/** Replaces an open document's paths, as opening a project restores them. */
export function setPathsOf(host: PathHost, p: Project, set: PathSet): void {
  host.store.sets.set(p, { list: set.list, active: set.list.some((n) => n.id === set.active) ? set.active : null });
  pathsChanged(host, p);
}

/** Select > Make Selection from Path: the path's inside, by the non-zero winding rule, becomes the selection. */
export function pathToSelection(host: PathHost): void {
  const p = host.current, vp = workPath(host), b = vp ? pathBounds(vp) : null;
  if (!p || !vp || !b) { host.notice('Draw a path with the Pen tool first.'); return; }
  const mask = SelectionMask.fromPath(p.doc.width, p.doc.height, b, (c) => fillVector(c as CanvasRenderingContext2D, vp), true);
  if (!mask) { host.notice('The path lies outside the canvas.'); return; }
  host.applySelection(mask, 'replace', 'Make Selection');
}

/** Edit > Fill Path: the path's inside painted into the active layer in the foreground colour, within any selection. */
export function fillPath(host: PathHost): void { paintPath(host, 'Fill Path', (c, _shape, vp) => { c.fillStyle = host.css(host.fg); fillVector(c as CanvasRenderingContext2D, vp); }); }

/** Edit > Stroke Path: the path traced in the foreground colour as wide as the brush, within any selection. */
export function strokePath(host: PathHost): void {
  paintPath(host, 'Stroke Path', (c, shape) => {
    c.strokeStyle = host.css(host.fg);
    c.lineWidth = Math.max(1, host.brushDiameter);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.stroke(shape);
  });
}

/** Stroke Path with its settings, as the dialog has them: each subpath stroked with `tool` at its current
 *  settings, following the curves; Simulate Pressure runs the pressure from nothing at each end to full in the middle
 *  (thin, thick, thin), and when the brush's size does not follow pressure it does so for this stroke. One step. */
export function strokePathWith(host: PathHost, tool: StrokeTool, simulatePressure: boolean): void {
  const p = host.current, vp = workPath(host);
  if (!p || !vp || !pathBounds(vp)) { host.notice('Draw a path with the Pen tool first.'); return; }
  if (!host.paintable(p.activeLayer)) { host.notice('Select a pixel layer to stroke on.'); return; }
  const runs = vp.subpaths.map((sp) => samplePath(sp, 2)).filter((pts) => pts.length > 1);
  if (!runs.length) return;
  const st = host.stroker, brush = tool === 'brush' || tool === 'eraser' || tool === 'pencil', savedDyn = st.dynamics, savedMode = st.mode;
  if (brush) {
    st.mode = tool === 'eraser' ? 'erase' : 'paint';
    if (simulatePressure && !st.dynamics.size.enabled) st.dynamics = { ...savedDyn, size: pressureOption(0.02) };
  }
  const kind = ({ clone: 'clone', healBrush: 'healBrush', spotHealing: 'heal', dodge: 'dodge', burn: 'burn', sponge: 'sponge', blur: 'blur', sharpen: 'sharpen', patternStamp: 'patternStamp', historyBrush: 'historyBrush', colorReplace: 'colorReplace' } as const)[tool as Exclude<StrokeTool, 'brush' | 'eraser' | 'pencil'>];
  p.history.begin('Stroke Path', p.snapshot());
  try {
    for (const pts of runs) {
      const pressure = (i: number): number => (simulatePressure ? Math.max(0.01, Math.sin((Math.PI * i) / (pts.length - 1))) : 1);
      const ok = brush ? st.begin(pts[0], pressure(0), tool === 'pencil') : st.beginRetouch(kind, pts[0]);
      if (!ok) break;
      for (let i = 1; i < pts.length; i++) st.to(pts[i], pressure(i));
      st.end();
    }
  } finally {
    st.dynamics = savedDyn;
    st.mode = savedMode;
    p.history.end(p.snapshot());
  }
  host.refresh();
}

export function paintPath(host: PathHost, name: string, paint: (c: Ctx2D, shape: Path2D, vp: VectorPath) => void, given?: VectorPath): void {
  const vp = given ?? workPath(host);
  if (!vp || !pathBounds(vp)) { host.notice('Draw a path with the Pen tool first.'); return; }
  const shape = tracePath(vp);
  host.regionEdit(name, ({ raster, target, rect, cover }) => {
    const p = host.current as Project, l = p.activeLayer as Layer;
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
