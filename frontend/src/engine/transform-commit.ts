import { sameTransform, placement, invert, setMat } from './geometry';
import { rounded, following } from './transform';
import { createSurface, ctxOf } from './surface';
import type { Raster } from './surface';
import type { ID, Layer, Pt, Transform } from './types';
import type { Project } from './project';

export interface TransformEdit {
  project: Project;
  layerId: ID;
  original: Transform;
  draft: Transform;
  mode: { kind: 'move' | 'rotate' | string };
  mask: boolean;
  group: { box: Transform; originals: Map<ID, Transform> } | null;
}

export interface CommitHost {
  readonly current: Project | null;
  edit(label: string, fn: (p: Project) => boolean | void): void;
  emit(what: 'render'): void;
  refresh(): void;
  floatingId(p: Project): ID | null;
  setLastTransform(from: Transform, to: Transform): void;
  maskFollowing(l: Layer, t: Transform): Layer['mask'];
  vectorFollowing(l: Layer, t: Transform): Layer['vectorMask'];
  shapeRaster(shape: NonNullable<Layer['shape']>, w: number, h: number): Raster;
  /** A vector shape layer scaled to `t`: its path carried across and redrawn, or null when the layer is moved only. */
  shapeFollowing(l: Layer, t: Transform): Partial<Layer> | null;
  selectedRoots(p: Project): ID[];
  artboardFrom(data: object): Layer['artboard'] | null;
  keyMove(layerId: ID, dx: number, dy: number, label: string): boolean;
  positionLocked(): boolean;
  readonly activeLayer: Layer | null;
}

interface WarpInput {
  project: Project;
  layerId: ID;
  stroke: { points: Pt[]; radius: number };
  surface: { readonly canvas: CanvasImageSource };
}

const validTransform = (t: Transform): boolean =>
  t.w >= 1 && t.h >= 1 && [t.x, t.y, t.w, t.h, t.rotation].every(Number.isFinite);

const followPatch = (host: CommitHost, l: Layer, t: Transform): Partial<Layer> => {
  const drawn = l.vector ? host.shapeFollowing(l, t) : null;
  if (drawn) {
    const at = drawn.transform ?? t;
    return { ...drawn, mask: host.maskFollowing(l, at), vectorMask: host.vectorFollowing(l, at) };
  }
  const patch: Partial<Layer> = {
    transform: t,
    mask: host.maskFollowing(l, t),
    vectorMask: host.vectorFollowing(l, t),
  };
  if (l.shape && (l.transform.w !== t.w || l.transform.h !== t.h)) {
    patch.raster = host.shapeRaster(l.shape, t.w, t.h);
  }
  return patch;
};

export function commitTransform(host: CommitHost, te: TransformEdit, name?: string): void {
  const p = host.current;
  const to = rounded(te.draft);
  const from = te.original;
  if (!p || p !== te.project || sameTransform(from, to)) {
    host.emit('render');
    return;
  }
  if (host.floatingId(p) === te.layerId) {
    p.updateLayer(te.layerId, { transform: to });
    host.refresh();
    return;
  }
  host.setLastTransform(from, to);

  if (te.group) {
    const { box, originals } = te.group;
    const boxNow = to;
    host.edit(name ?? 'Transform Layers', (proj) => {
      let moved = 0;
      for (const [id, orig] of originals) {
        const layer = proj.layer(id);
        if (!layer) continue;
        const t = rounded(following(orig, box, boxNow));
        if (!validTransform(t)) continue;
        proj.updateLayer(id, followPatch(host, layer, t));
        moved++;
      }
      for (const id of host.selectedRoots(proj)) {
        const layer = proj.layer(id);
        const ab = layer?.artboard;
        if (!layer || !ab) continue;
        const carried = following({ ...box, ...ab, rotation: 0, flipX: false, flipY: false } as Transform, box, boxNow);
        const next = host.artboardFrom({ ...ab, x: carried.x, y: carried.y, w: carried.w, h: carried.h });
        if (!next) continue;
        proj.updateLayer(id, { artboard: next });
        moved++;
      }
      return moved > 0;
    });
    return;
  }

  if (te.mask) {
    host.edit(name ?? 'Transform Layer Mask', (proj) => {
      const layer = proj.layer(te.layerId);
      if (!layer || !layer.mask) return false;
      const placed = sameTransform(to, layer.transform) ? null : to;
      proj.updateLayer(te.layerId, { mask: { ...layer.mask, placement: placed } });
      return true;
    });
    return;
  }

  const kind = te.mode.kind;
  const label = name ?? (kind === 'move' ? 'Move Layer' : kind === 'rotate' ? 'Rotate Layer' : 'Transform Layer');
  if (kind === 'move' && host.keyMove(te.layerId, to.x - from.x, to.y - from.y, label)) return;
  host.edit(label, (proj) => {
    const layer = proj.layer(te.layerId);
    if (!layer) return false;
    proj.updateLayer(te.layerId, followPatch(host, layer, to));
    return true;
  });
}

export function setLayerTransform(host: CommitHost, patch: Partial<Transform>, name = 'Transform Layer'): void {
  if (host.positionLocked()) return;
  const p = host.current;
  const layer = host.activeLayer;
  if (!p || !layer) return;
  const next: Transform = { ...layer.transform, ...patch };
  if (!validTransform(next) || sameTransform(layer.transform, next)) return;
  if (host.floatingId(p) === layer.id) {
    p.updateLayer(layer.id, { transform: next });
    host.refresh();
    return;
  }
  if (layer.isGroup) return;
  const from = layer.transform;
  host.setLastTransform(from, next);
  host.edit(name, (proj) => {
    const cur = proj.layer(layer.id);
    if (!cur) return false;
    proj.updateLayer(layer.id, followPatch(host, cur, next));
    return true;
  });
}

export function commitWarpStroke(host: CommitHost, w: WarpInput): void {
  const p = w.project;
  const layer = p.layer(w.layerId);
  const pts = w.stroke.points;
  if (!layer || !layer.raster || pts.length === 0) {
    const snap = p.history.abort();
    if (snap) {
      p.doc = snap.doc;
      p.selection = snap.selection;
    }
    host.refresh();
    return;
  }
  const raster = layer.raster;
  const rw = raster.width;
  const rh = raster.height;

  const area = createSurface(p.doc.width, p.doc.height);
  const actx = ctxOf(area);
  actx.fillStyle = '#000';
  actx.beginPath();
  for (const pt of pts) {
    actx.moveTo(pt.x + w.stroke.radius, pt.y);
    actx.arc(pt.x, pt.y, w.stroke.radius, 0, Math.PI * 2);
  }
  actx.fill();
  if (p.selection) {
    actx.globalCompositeOperation = 'destination-in';
    actx.drawImage(p.selection.surface(), p.selection.x, p.selection.y);
    actx.globalCompositeOperation = 'source-over';
  }

  const inv = invert(placement(layer.transform, rw, rh));
  const areaL = createSurface(rw, rh);
  const resultL = createSurface(rw, rh);
  const a = ctxOf(areaL);
  setMat(a, inv);
  a.drawImage(area, 0, 0);
  const r = ctxOf(resultL);
  setMat(r, inv);
  r.drawImage(w.surface.canvas, 0, 0);
  r.setTransform(1, 0, 0, 1, 0, 0);
  r.globalCompositeOperation = 'destination-in';
  r.drawImage(areaL, 0, 0);
  r.globalCompositeOperation = 'source-over';

  const before = raster.read();
  const ctx = raster.ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(areaL, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(resultL, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  raster.touch();
  const after = raster.read();
  p.history.addPatch({ raster, x: 0, y: 0, before, after });
  if (layer.shape) p.updateLayer(layer.id, { shape: null });
  p.history.end(p.snapshot());
  host.refresh();
}
