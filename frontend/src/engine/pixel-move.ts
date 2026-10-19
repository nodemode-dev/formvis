import type { Mat } from './geometry';
import { applyMat, integral, intersectRect, invert, mul, placement, sameTransform, setMat, translation } from './geometry';
import type { Ctx2D, Surface } from './surface';
import { createSurface, ctxOf, Raster } from './surface';
import { SelectionMask } from './selection';
import type { ID, Layer, Pt, Rect, Transform } from './types';
import { docTransform, newLayer } from './types';
import { hierarchy } from './tree';
import type { Project } from './project';

export interface FloatingPixels {
  project: Project;
  layerId: ID;
  dx: number;
  dy: number;
  raster: Raster;
  base: ImageData;
  local: Mat;
  mask: Surface;
  lifted: Surface;
  preview: Surface;
  cx: number;
  cy: number;
  duplicate: boolean;
  selection: SelectionMask;
}

export interface FloatingSelection {
  project: Project;
  sourceId: ID;
  floatingId: ID;
  region: Rect;
  selection: SelectionMask;
  original: Transform;
  outline?: boolean;
  sourceRaster: Raster;
  base: ImageData | null;
  floatRaster: Raster;
  hole: Surface;
  mask: Surface;
}

export interface MoveHost {
  readonly current: Project | null;
  readonly busy: boolean;
  settle(): void;
  notice(message: string): void;
  emit(what: 'render' | 'overlay'): void;
  refresh(): void;
  canPaint(p: Project): boolean;
  target(p: Project): { layer: Layer; raster: Raster; local: Mat };
  setTool(id: 'move'): void;
  insertAboveActive(p: Project, layer: Layer): void;
  focus(p: Project, id: ID | null): void;
  growLayer(p: Project, l: Layer, rect: Rect): Raster;
  flattened(): Surface | null;
  snapBox(l: Layer, t: Transform): Rect;
  view: { guides: boolean; grid: boolean; gridSpacing: number; gridSubdivisions: number };
  setSnapGuides(g: { xs: number[]; ys: number[] } | null): void;
}

const NOTICE = 'Moving selected pixels works on a layer with pixels.';
const IDENT = (c: Ctx2D): void => {
  c.setTransform(1, 0, 0, 1, 0, 0);
};

function restore(p: Project, s: ReturnType<Project['snapshot']> | null): void {
  if (!s) return;
  p.doc = s.doc;
  p.selection = s.selection;
}

function clearShape(p: Project, id: ID): void {
  const l = p.layer(id);
  if (l && l.shape) p.updateLayer(id, { shape: null });
}

function clipToCanvas(p: Project, sel: SelectionMask): Rect | null {
  return intersectRect(sel.rect, { x: 0, y: 0, w: p.doc.width, h: p.doc.height });
}

function maskSurface(sel: SelectionMask, r: Rect): Surface {
  const s = createSurface(r.w, r.h);
  const c = ctxOf(s);
  c.drawImage(sel.surface(), sel.x - r.x, sel.y - r.y);
  return s;
}

function eraseSelection(raster: Raster, local: Mat, mask: Surface, cx: number, cy: number): void {
  const inv = invert(local);
  const c = raster.ctx;
  c.save();
  setMat(c, mul(inv, translation(cx, cy)));
  c.globalCompositeOperation = 'destination-out';
  c.drawImage(mask, 0, 0);
  c.restore();
  IDENT(c);
  raster.touch();
}

function liftPixels(raster: Raster, local: Mat, mask: Surface, cx: number, cy: number, w: number, h: number): Surface {
  const s = createSurface(w, h);
  const c = ctxOf(s);
  c.save();
  setMat(c, mul(translation(-cx, -cy), local));
  c.drawImage(raster.canvas, 0, 0);
  c.restore();
  IDENT(c);
  c.globalCompositeOperation = 'destination-in';
  c.drawImage(mask, 0, 0);
  c.globalCompositeOperation = 'source-over';
  return s;
}

export function beginPixelMove(host: MoveHost, duplicate: boolean): FloatingPixels | null {
  const p = host.current;
  if (!p || !p.selection || host.busy) return null;
  host.settle();
  const sel = p.selection;
  let t: { layer: Layer; raster: Raster; local: Mat } | null = null;
  if (host.canPaint(p) && !p.maskTarget) t = host.target(p);
  if (!t || t.raster.width <= 0 || t.raster.height <= 0) {
    host.notice(NOTICE);
    return null;
  }
  const clip = clipToCanvas(p, sel);
  if (!clip || clip.w <= 0 || clip.h <= 0) return null;
  p.history.begin(duplicate ? 'Duplicate Pixels' : 'Move Pixels', p.snapshot());
  const mask = maskSurface(sel, clip);
  const lifted = liftPixels(t.raster, t.local, mask, clip.x, clip.y, clip.w, clip.h);
  const f: FloatingPixels = {
    project: p,
    layerId: t.layer.id,
    dx: 0,
    dy: 0,
    raster: t.raster,
    base: t.raster.read(),
    local: t.local,
    mask,
    lifted,
    preview: createSurface(t.raster.width, t.raster.height),
    cx: clip.x,
    cy: clip.y,
    duplicate,
    selection: sel,
  };
  movePixels(host, f, 0, 0);
  return f;
}

export function movePixels(host: MoveHost, f: FloatingPixels, dx: number, dy: number): void {
  f.dx = Math.round(dx);
  f.dy = Math.round(dy);
  const inv = invert(f.local);
  const c = ctxOf(f.preview);
  IDENT(c);
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, f.raster.width, f.raster.height);
  c.drawImage(f.raster.canvas, 0, 0);
  if (!f.duplicate) {
    c.save();
    setMat(c, mul(inv, translation(f.cx, f.cy)));
    c.globalCompositeOperation = 'destination-out';
    c.drawImage(f.mask, 0, 0);
    c.restore();
  }
  c.save();
  setMat(c, mul(inv, translation(f.cx + f.dx, f.cy + f.dy)));
  c.drawImage(f.lifted, 0, 0);
  c.restore();
  IDENT(c);
  c.globalCompositeOperation = 'source-over';
  host.emit('render');
  host.emit('overlay');
}

export function endPixelMove(host: MoveHost, f: FloatingPixels): void {
  const p = f.project;
  if (f.dx === 0 && f.dy === 0) {
    cancelPixelMove(host, f);
    return;
  }
  const rc = f.raster.ctx;
  IDENT(rc);
  rc.globalCompositeOperation = 'source-over';
  rc.clearRect(0, 0, f.raster.width, f.raster.height);
  rc.drawImage(f.preview, 0, 0);
  f.raster.touch();
  p.history.addPatch({ raster: f.raster, x: 0, y: 0, before: f.base, after: f.raster.read() });
  p.selection = f.selection.translated(f.dx, f.dy, p.doc.width, p.doc.height);
  clearShape(p, f.layerId);
  p.history.end(p.snapshot());
  host.refresh();
}

export function cancelPixelMove(host: MoveHost, f: FloatingPixels): void {
  const p = f.project;
  restore(p, p.history.abort());
  host.refresh();
}

function openFloat(host: MoveHost, outline: boolean): FloatingSelection | null {
  const p = host.current;
  if (!p || !p.selection || host.busy) return null;
  host.settle();
  if (!host.canPaint(p) || p.maskTarget) {
    host.notice(NOTICE);
    return null;
  }
  const t = host.target(p);
  if (t.raster.width <= 0 || t.raster.height <= 0) {
    host.notice(NOTICE);
    return null;
  }
  const sel = p.selection;
  const region = outline ? sel.rect : clipToCanvas(p, sel);
  if (!region || region.w <= 0 || region.h <= 0) return null;
  host.setTool('move');
  p.history.begin('Transform Selection', p.snapshot());
  const mask = maskSurface(sel, region);
  const fr = new Raster(region.w, region.h);
  const fc = fr.ctx;
  if (outline) {
    fc.drawImage(mask, 0, 0);
  } else {
    fc.drawImage(liftPixels(t.raster, t.local, mask, region.x, region.y, region.w, region.h), 0, 0);
  }
  fr.touch();
  const base = outline ? null : t.raster.read();
  const hole = createSurface(t.raster.width, t.raster.height);
  if (!outline) {
    const hc = ctxOf(hole);
    hc.drawImage(t.raster.canvas, 0, 0);
    hc.save();
    setMat(hc, mul(invert(t.local), translation(region.x, region.y)));
    hc.globalCompositeOperation = 'destination-out';
    hc.drawImage(mask, 0, 0);
    hc.restore();
    IDENT(hc);
  }
  const layer = newLayer(outline ? 'Selection Outline' : 'Floating Selection', { width: region.w, height: region.h }, {
    raster: fr,
    transform: { ...docTransform(region.w, region.h), x: region.x, y: region.y, w: region.w, h: region.h, rotation: 0 },
    parentId: t.layer.parentId,
    opacity: outline ? 0 : t.layer.opacity,
    blend: t.layer.blend,
  });
  host.insertAboveActive(p, layer);
  p.selection = null;
  host.focus(p, layer.id);
  host.refresh();
  return {
    project: p,
    sourceId: t.layer.id,
    floatingId: layer.id,
    region,
    selection: sel,
    original: { ...layer.transform },
    outline,
    sourceRaster: t.raster,
    base,
    floatRaster: fr,
    hole,
    mask,
  };
}

export function beginSelectionTransform(host: MoveHost): FloatingSelection | null {
  return openFloat(host, false);
}

export function beginOutlineTransform(host: MoveHost): FloatingSelection | null {
  return openFloat(host, true);
}

function carrySelection(p: Project, sel: SelectionMask, m: Mat): SelectionMask | null {
  const r = sel.rect;
  const pts: Pt[] = [
    applyMat(m, r.x, r.y),
    applyMat(m, r.x + r.w, r.y),
    applyMat(m, r.x, r.y + r.h),
    applyMat(m, r.x + r.w, r.y + r.h),
  ];
  const x0 = Math.min(...pts.map((q) => q.x));
  const y0 = Math.min(...pts.map((q) => q.y));
  const x1 = Math.max(...pts.map((q) => q.x));
  const y1 = Math.max(...pts.map((q) => q.y));
  const b = intersectRect(integral({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }), { x: 0, y: 0, w: p.doc.width, h: p.doc.height });
  if (!b || b.w <= 0 || b.h <= 0) return null;
  const s = createSurface(b.w, b.h);
  const c = ctxOf(s);
  c.save();
  setMat(c, mul(translation(-b.x, -b.y), mul(m, translation(sel.x, sel.y))));
  c.imageSmoothingEnabled = true;
  c.drawImage(sel.surface(), 0, 0);
  c.restore();
  return SelectionMask.fromAlpha(b.x, b.y, b.w, b.h, c.getImageData(0, 0, b.w, b.h).data);
}

function removeLayer(p: Project, id: ID): void {
  p.setLayers(p.doc.layers.filter((l: Layer) => l.id !== id));
}

export function commitSelectionTransform(host: MoveHost, fs: FloatingSelection): void {
  const p = fs.project;
  const fl = p.layer(fs.floatingId);
  const src = p.layer(fs.sourceId);
  if (!fl || !src || fs.floatRaster.width <= 0 || fs.sourceRaster.width <= 0 || sameTransform(fl.transform, fs.original)) {
    cancelSelectionTransform(host, fs);
    return;
  }
  const fw = fs.floatRaster.width;
  const fh = fs.floatRaster.height;
  const newT = fl.transform;
  const fm = placement(newT, fw, fh);
  const carried = carrySelection(p, fs.selection, mul(fm, invert(placement(fs.original, fw, fh))));
  removeLayer(p, fs.floatingId);
  host.focus(p, fs.sourceId);
  if (fs.outline) {
    p.selection = carried;
    p.history.end(p.snapshot());
    host.refresh();
    return;
  }
  const corners = [applyMat(fm, 0, 0), applyMat(fm, fw, 0), applyMat(fm, 0, fh), applyMat(fm, fw, fh)];
  const x0 = Math.min(...corners.map((q) => q.x));
  const y0 = Math.min(...corners.map((q) => q.y));
  const x1 = Math.max(...corners.map((q) => q.x));
  const y1 = Math.max(...corners.map((q) => q.y));
  const need = integral({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  const srcNow = p.layer(fs.sourceId) ?? src;
  const sm = placement(srcNow.transform, fs.sourceRaster.width, fs.sourceRaster.height);
  const sc = [applyMat(sm, 0, 0), applyMat(sm, fs.sourceRaster.width, 0), applyMat(sm, 0, fs.sourceRaster.height), applyMat(sm, fs.sourceRaster.width, fs.sourceRaster.height)];
  const covered =
    Math.min(...sc.map((q) => q.x)) <= need.x &&
    Math.min(...sc.map((q) => q.y)) <= need.y &&
    Math.max(...sc.map((q) => q.x)) >= need.x + need.w &&
    Math.max(...sc.map((q) => q.y)) >= need.y + need.h;
  let raster = fs.sourceRaster;
  if (!covered) raster = host.growLayer(p, srcNow, need);
  if (raster === fs.sourceRaster) {
    const hc = raster.ctx;
    IDENT(hc);
    hc.globalCompositeOperation = 'source-over';
    hc.clearRect(0, 0, raster.width, raster.height);
    hc.drawImage(fs.hole, 0, 0);
  } else {
    const gl = p.layer(fs.sourceId) ?? srcNow;
    eraseSelection(raster, placement(gl.transform, raster.width, raster.height), fs.mask, fs.region.x, fs.region.y);
  }
  const now = p.layer(fs.sourceId) ?? srcNow;
  const local = placement(now.transform, raster.width, raster.height);
  const inv = invert(local);
  {
    const c = raster.ctx;
    c.save();
    setMat(c, mul(inv, fm));
    const nearest = newT.sampling === 'nearest';
    c.imageSmoothingEnabled = !nearest;
    if (!nearest) c.imageSmoothingQuality = 'high';
    c.drawImage(fs.floatRaster.canvas, 0, 0);
    c.restore();
    IDENT(c);
    raster.touch();
  }
  if (raster === fs.sourceRaster && fs.base) {
    p.history.addPatch({ raster, x: 0, y: 0, before: fs.base, after: raster.read() });
  }
  clearShape(p, fs.sourceId);
  p.selection = carried;
  p.history.end(p.snapshot());
  host.refresh();
}

export function cancelSelectionTransform(host: MoveHost, fs: FloatingSelection): void {
  const p = fs.project;
  restore(p, p.history.abort());
  host.focus(p, p.layer(fs.sourceId) ? fs.sourceId : null);
  host.refresh();
}

/** View > Snap and Snap To: the master switch and the four targets, each on its own (the app keeps them). */
export const snapOptions = { on: true, guides: true, grid: true, layers: true, bounds: true, smart: true };

export function snapMove(host: MoveHost, p: Project, id: ID, t: Transform, moving?: ReadonlySet<ID>): Transform {
  const layer = p.layer(id);
  if (!layer) return t;
  const d = snapDelta(host, p, host.snapBox(layer, t), (l) => l.id === id || !!moving?.has(l.id));
  return d ? { ...t, x: t.x + d.x, y: t.y + d.y } : t;
}

/** The shift that snaps `box` (a moving rectangle in document pixels) to the guides, grid, document bounds and other
 *  layers' edges within 6 screen pixels, drawing the smart guides; null when nothing is near or snapping is off.
 *  `skip` names layers that move with the box. */
export function snapDelta(host: MoveHost, p: Project, box: Rect, skip: (l: Layer) => boolean): Pt | null {
  if (!snapOptions.on) { host.setSnapGuides(null); return null; }
  const tol = 6 / (p.viewport.zoom || 1);
  const xc: number[] = snapOptions.bounds ? [0, p.doc.width / 2, p.doc.width] : [];
  const yc: number[] = snapOptions.bounds ? [0, p.doc.height / 2, p.doc.height] : [];
  for (const h of hierarchy(p.doc)) {
    if (!snapOptions.layers) break;
    const l = h.layer;
    if (!h.visible || skip(l)) continue;
    if (l.isGroup) continue;
    const b = host.snapBox(l, l.transform);
    xc.push(b.x, b.x + b.w / 2, b.x + b.w);
    yc.push(b.y, b.y + b.h / 2, b.y + b.h);
  }
  if (snapOptions.guides && host.view.guides && p.doc.guides) {
    for (const g of p.doc.guides) (g.axis === 'x' ? xc : yc).push(g.at);
  }
  const ex = [box.x, box.x + box.w / 2, box.x + box.w];
  const ey = [box.y, box.y + box.h / 2, box.y + box.h];
  if (snapOptions.grid && host.view.grid) {
    const step = host.view.gridSpacing / Math.max(1, host.view.gridSubdivisions);
    if (step > 0) {
      for (const e of ex) xc.push(Math.round(e / step) * step);
      for (const e of ey) yc.push(Math.round(e / step) * step);
    }
  }
  const axis = (edges: number[], cands: number[]): { shift: number; lines: number[] } | null => {
    let best = Infinity;
    let shift = 0;
    for (const e of edges) {
      for (const c of cands) {
        const d = Math.abs(c - e);
        if (d < best) {
          best = d;
          shift = c - e;
        }
      }
    }
    if (best > tol) return null;
    const lines: number[] = [];
    for (const e of edges) {
      for (const c of cands) {
        if (Math.abs(c - e - shift) < 1e-6 && !lines.includes(c)) lines.push(c);
      }
    }
    return { shift, lines };
  };
  const sx = axis(ex, xc);
  const sy = axis(ey, yc);
  if (!sx && !sy) {
    host.setSnapGuides(null);
    return null;
  }
  host.setSnapGuides(snapOptions.smart ? { xs: sx ? sx.lines : [], ys: sy ? sy.lines : [] } : null);
  return { x: sx ? sx.shift : 0, y: sy ? sy.shift : 0 };
}

export function sampleOriginal(host: MoveHost, pt: Pt, composite: boolean, radius = 0): [number, number, number] | null {
  let ctx: Ctx2D;
  let x: number;
  let y: number;
  let w: number;
  let h: number;
  if (composite) {
    const s = host.flattened();
    if (!s) return null;
    ctx = ctxOf(s);
    x = Math.floor(pt.x);
    y = Math.floor(pt.y);
    const p = host.current;
    w = p ? p.doc.width : 0;
    h = p ? p.doc.height : 0;
  } else {
    const p = host.current;
    if (!p) return null;
    if (!p.maskTarget && !host.canPaint(p)) return null;
    const t = host.target(p);
    const inv = invert(t.local);
    const q = applyMat(inv, pt.x, pt.y);
    ctx = t.raster.ctx;
    x = Math.floor(q.x);
    y = Math.floor(q.y);
    w = t.raster.width;
    h = t.raster.height;
  }
  if (x < 0 || y < 0 || x >= w || y >= h) return null;
  if (radius > 0) {
    const xa = Math.max(0, x - radius), ya = Math.max(0, y - radius), xb = Math.min(w - 1, x + radius), yb = Math.min(h - 1, y + radius);
    const px = ctx.getImageData(xa, ya, xb - xa + 1, yb - ya + 1).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 0) { r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; }
    return n ? [r / n / 255, g / n / 255, b / n / 255] : null;
  }
  const d = ctx.getImageData(x, y, 1, 1).data;
  if (d[3] === 0) return null;
  return [d[0] / 255, d[1] / 255, d[2] / 255];
}
