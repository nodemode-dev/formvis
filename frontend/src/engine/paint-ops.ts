import type { BlendMode, ID, Layer, Pt, Rect, RGB } from './types';
import { compositeOp, LIMITS } from './types';
import type { Mat } from './geometry';
import { applyMat, boundsOf, integral, invert, isAxisAligned, placement, setMat, unionRect, unitPoint, contains } from './geometry';
import type { Surface } from './surface';
import { createSurface, ctxOf, Raster } from './surface';
import { SelectionMask } from './selection';
import type { Project } from './project';
import { byId, hierarchy, isDescendant } from './tree';
import { diamondFill, reflectStops } from './gradients';
import { PIXEL_BLENDS, blendPixels } from './blend';
import { fromGray, resizeMask, toGray } from './filters';

export type Target = 'pixels' | 'mask';

type Stop = { at: number; rgb: RGB; alpha: number };

export interface PaintHost {
  readonly current: Project | null;
  readonly busy: boolean;
  settle(): void;
  notice(message: string): void;
  emit(what: 'render' | 'overlay'): void;
  refresh(): void;
  canPaint(p: Project): boolean;
  target(p: Project): { layer: Layer; raster: Raster; local: Mat; target: Target };
  edit(label: string, fn: (p: Project) => boolean | void): void;
  regionEdit(label: string, apply: (a: { raster: Raster; target: Target; rect: Rect; cover: Surface | null }) => void): void;
  tint(rect: Rect, css: string, cover: Surface | null): Surface;
  readonly fg: RGB;
  readonly bg: RGB;
  luminance(c: RGB): number;
  css(c: RGB, alpha?: number): string;
  gradient: { shape: 'linear' | 'radial' | 'angle' | 'reflected' | 'diamond'; opacity: number; blend: BlendMode; dither: boolean };
  gradientStops(fg: RGB, bg: RGB): Stop[];
  positionLocked(id: ID | null): boolean;
  linkedOf(p: Project): ReadonlySet<ID>;
  keyMove(layerId: ID, dx: number, dy: number, label: string): boolean;
  maskFollowing(l: Layer, t: Layer['transform']): Layer['mask'];
  vectorFollowing(l: Layer, t: Layer['transform']): Layer['vectorMask'];
  setFlipAgain(horizontal: boolean): void;
  applySelection(sel: SelectionMask | null, mode: 'replace', label: string): void;
}

export interface GradientDrag {
  project: Project;
  layerId: ID;
  target: Target;
  start: Pt;
  end: Pt;
  surface: Surface;
  raster: Raster;
  local: Mat;
  base: ImageData;
}

function ditherOffset(x: number, y: number): number {
  let h = Math.imul(x, 0x45d9f3b) ^ Math.imul(y, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12;
  return ((h >>> 0) / 4294967296) * 2 - 1;
}

function render(host: PaintHost, g: GradientDrag): void {
  const w = g.raster.width;
  const h = g.raster.height;
  const isMask = g.target === 'mask';
  const grey = (c: RGB): RGB => {
    const v = Math.round(host.luminance(c) * 255);
    return { r: v, g: v, b: v };
  };
  const shape = host.gradient.shape;
  let stops = host.gradientStops(isMask ? grey(host.fg) : host.fg, isMask ? grey(host.bg) : host.bg);
  if (shape === 'reflected') stops = reflectStops(stops);
  stops = stops.slice().sort((x, y) => x.at - y.at);
  const sel = g.project.selection;
  const tmp = createSurface(w, h);
  const tctx = ctxOf(tmp);
  const toRaster = invert(g.local);

  if (shape === 'diamond') {
    const grad = new ImageData(w, h);
    const out = grad.data;
    diamondFill(grad, (x, y) => applyMat(g.local, x, y), g.start, g.end, stops);
    if (sel) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const d = applyMat(g.local, x, y);
          out[(y * w + x) * 4 + 3] *= sel.valueAt(Math.floor(d.x), Math.floor(d.y)) / 255;
        }
      }
    }
    tctx.putImageData(grad, 0, 0);
  } else {
    const a = g.start;
    let b = g.end;
    let len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 0.5) {
      b = { x: a.x + 0.5, y: a.y };
      len = 0.5;
    }
    let cg: CanvasGradient;
    if (shape === 'radial') cg = tctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, len);
    else if (shape === 'angle') cg = tctx.createConicGradient(Math.atan2(b.y - a.y, b.x - a.x), a.x, a.y);
    else if (shape === 'reflected') cg = tctx.createLinearGradient(2 * a.x - b.x, 2 * a.y - b.y, b.x, b.y);
    else cg = tctx.createLinearGradient(a.x, a.y, b.x, b.y);
    for (const s of stops) cg.addColorStop(Math.max(0, Math.min(1, s.at)), host.css(s.rgb, s.alpha));
    const cs = [applyMat(g.local, 0, 0), applyMat(g.local, w, 0), applyMat(g.local, 0, h), applyMat(g.local, w, h)];
    const x0 = Math.min(...cs.map((c) => c.x)) - 1;
    const y0 = Math.min(...cs.map((c) => c.y)) - 1;
    const x1 = Math.max(...cs.map((c) => c.x)) + 1;
    const y1 = Math.max(...cs.map((c) => c.y)) + 1;
    tctx.save();
    setMat(tctx, toRaster);
    tctx.fillStyle = cg;
    tctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    if (sel) {
      tctx.globalCompositeOperation = 'destination-in';
      tctx.drawImage(sel.surface(), sel.x, sel.y);
    }
    tctx.restore();
  }

  if (host.gradient.dither) {
    const img = tctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (d[i + 3] === 0) continue;
        const o = ditherOffset(x, y);
        d[i] += o;
        d[i + 1] += o;
        d[i + 2] += o;
      }
    }
    tctx.putImageData(img, 0, 0);
  }

  const ctx = ctxOf(g.surface);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, w, h);
  ctx.putImageData(g.base, 0, 0);
  if (!isMask && PIXEL_BLENDS.has(host.gradient.blend)) {
    const dst = ctx.getImageData(0, 0, w, h);
    blendPixels(dst.data, ctxOf(tmp).getImageData(0, 0, w, h).data, host.gradient.blend, Math.max(0, Math.min(1, host.gradient.opacity)), (i) => [i % w, Math.floor(i / w)]);
    ctx.putImageData(dst, 0, 0);
    ctx.restore();
    return;
  }
  ctx.globalAlpha = Math.max(0, Math.min(1, host.gradient.opacity));
  ctx.globalCompositeOperation = isMask ? 'source-over' : compositeOp(host.gradient.blend);
  ctx.drawImage(tmp, 0, 0);
  ctx.restore();
}

function restore(p: Project): void {
  const s = p.history.abort();
  if (s) {
    p.doc = s.doc;
    p.selection = s.selection;
  }
}

export function beginGradient(host: PaintHost, pt: Pt): GradientDrag | null {
  if (!host.current || host.busy) return null;
  host.settle();
  const p = host.current;
  if (!p) return null;
  if (!host.canPaint(p)) {
    host.notice('Select a pixel layer for the gradient.');
    return null;
  }
  const t = host.target(p);
  const raw = t.raster.read();
  const base = t.target === 'mask' ? toGray(raw) : raw;
  p.history.begin('Gradient', p.snapshot());
  const g: GradientDrag = {
    project: p,
    layerId: t.layer.id,
    target: t.target,
    start: { x: pt.x, y: pt.y },
    end: { x: pt.x, y: pt.y },
    surface: createSurface(t.raster.width, t.raster.height),
    raster: t.raster,
    local: t.local,
    base,
  };
  render(host, g);
  host.emit('render');
  return g;
}

export function updateGradient(host: PaintHost, g: GradientDrag, start?: Pt, end?: Pt): void {
  if (start) g.start = { x: start.x, y: start.y };
  if (end) g.end = { x: end.x, y: end.y };
  render(host, g);
  host.emit('render');
}

export function commitGradient(host: PaintHost, g: GradientDrag): void {
  const p = g.project;
  if (Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y) < 1) {
    restore(p);
    host.refresh();
    return;
  }
  const w = g.raster.width;
  const h = g.raster.height;
  const before = g.raster.read();
  const shown = ctxOf(g.surface).getImageData(0, 0, w, h);
  const after = g.target === 'mask' ? fromGray(shown) : shown;
  g.raster.write(after, 0, 0);
  p.history.addPatch({ raster: g.raster, x: 0, y: 0, before, after });
  if (g.target === 'pixels') {
    const l = p.layer(g.layerId);
    if (l && l.shape) p.updateLayer(g.layerId, { shape: null });
  }
  p.history.end(p.snapshot());
  host.refresh();
}

export function cancelGradient(host: PaintHost, g: GradientDrag): void {
  restore(g.project);
  host.refresh();
}

export function fill(host: PaintHost, which: 'fg' | 'bg'): void {
  const c = which === 'fg' ? host.fg : host.bg;
  const label = which === 'fg' ? 'Fill with Foreground' : 'Fill with Background';
  host.regionEdit(label, ({ raster, target, rect, cover }) => {
    if (rect.w <= 0 || rect.h <= 0) return;
    if (target === 'pixels') {
      const s = host.tint(rect, host.css(c), cover);
      const ctx = raster.ctx;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(s, rect.x, rect.y);
      ctx.restore();
      raster.touch({ x: rect.x, y: rect.y, w: s.width, h: s.height });
      return;
    }
    const lum = Math.round(host.luminance(c) * 255);
    const img = raster.read(rect.x, rect.y, rect.w, rect.h);
    const cov = cover ? ctxOf(cover).getImageData(0, 0, rect.w, rect.h).data : null;
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const s = cov ? cov[i + 3] / 255 : 1;
      d[i] = 255;
      d[i + 1] = 255;
      d[i + 2] = 255;
      d[i + 3] = d[i + 3] * (1 - s) + lum * s;
    }
    raster.write(img, rect.x, rect.y);
  });
}

export function flipLayers(host: PaintHost, horizontal: boolean): void {
  const p = host.current;
  if (!p) return;
  const map = byId(p.doc), roots = p.doc.layers.filter((l) => p.selectedIds.has(l.id) && l.isGroup);
  const targets = p.doc.layers.filter((l) => !l.isGroup && (l.raster !== null || !!l.tiled) && (p.selectedIds.has(l.id) || roots.some((g) => isDescendant(map, l.id, g.id))));
  if (targets.length === 0) return;
  let box: Rect | null = null;
  for (const l of targets) {
    const b = boundsOf([[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => unitPoint(l.transform, u, v)));
    box = box ? unionRect(box, b) : b;
  }
  const mx = box ? 2 * box.x + box.w : 0, my = box ? 2 * box.y + box.h : 0;
  host.edit(horizontal ? 'Flip Layer Horizontal' : 'Flip Layer Vertical', (proj) => {
    for (const l of targets) {
      const cur = proj.layer(l.id);
      if (!cur) continue;
      const t = cur.transform;
      const nt = {
        ...t,
        x: horizontal ? mx - t.x - t.w : t.x,
        y: horizontal ? t.y : my - t.y - t.h,
        flipX: horizontal ? !t.flipX : t.flipX,
        flipY: horizontal ? t.flipY : !t.flipY,
        rotation: -t.rotation,
      };
      proj.updateLayer(cur.id, {
        transform: nt,
        mask: host.maskFollowing(cur, nt),
        vectorMask: host.vectorFollowing(cur, nt),
      });
    }
    return true;
  });
  host.setFlipAgain(horizontal);
}

export function growLayer(p: Project, layer: Layer, want: Rect): Raster {
  const r = layer.raster;
  const need = integral(want);
  if (!r) {
    const nr = new Raster(Math.max(1, need.w), Math.max(1, need.h));
    p.updateLayer(layer.id, { raster: nr, transform: { ...layer.transform, x: need.x, y: need.y, w: nr.width, h: nr.height, rotation: 0 } });
    return nr;
  }
  const t = layer.transform;
  if (!isAxisAligned(t, r.width, r.height) || t.rotation !== 0 || t.w !== r.width || t.h !== r.height) return growPlaced(p, layer, r, need);
  const box: Rect = { x: t.x, y: t.y, w: t.w, h: t.h };
  const u = unionRect(box, need);
  if (u.x === box.x && u.y === box.y && u.w === box.w && u.h === box.h) return r;
  if (u.w > LIMITS.side || u.h > LIMITS.side || u.w * u.h > LIMITS.pixels) return r;
  const m = layer.mask;
  const mr = m ? m.raster : null;
  if (m && mr && m.placement === null && (mr.width !== r.width || mr.height !== r.height)) return r;
  const ox = t.flipX ? u.x + u.w - (box.x + box.w) : box.x - u.x;
  const oy = t.flipY ? u.y + u.h - (box.y + box.h) : box.y - u.y;
  const nr = new Raster(u.w, u.h);
  nr.ctx.drawImage(r.canvas, ox, oy);
  nr.touch();
  const patch: Partial<Layer> = { raster: nr, transform: { ...t, x: u.x, y: u.y, w: u.w, h: u.h } };
  if (m && mr && m.placement === null) {
    const nm = Raster.filled(u.w, u.h, '#ffffff');
    nm.ctx.clearRect(ox, oy, mr.width, mr.height);
    nm.ctx.drawImage(mr.canvas, ox, oy);
    nm.touch();
    patch.mask = { ...m, raster: nm };
  }
  p.updateLayer(layer.id, patch);
  return nr;
}

function growPlaced(p: Project, layer: Layer, r: Raster, need: Rect): Raster {
  const t = layer.transform, m = layer.mask, mr = m?.raster ?? null, tied = !!m && !!mr && m.placement === null;
  if (tied && mr && (mr.width !== r.width || mr.height !== r.height)) return r;
  const at = placement(t, r.width, r.height), back = invert(at);
  if (!back || !(t.w > 0) || !(t.h > 0)) return r;
  const snap = (v: number): number => (Math.abs(v - Math.round(v)) < 1e-6 ? Math.round(v) : v);
  const seen = boundsOf([[need.x, need.y], [need.x + need.w, need.y], [need.x, need.y + need.h], [need.x + need.w, need.y + need.h]].map(([x, y]) => { const q = applyMat(back, x, y); return { x: snap(q.x), y: snap(q.y) }; }));
  const u = integral(unionRect({ x: 0, y: 0, w: r.width, h: r.height }, seen));
  if (u.x === 0 && u.y === 0 && u.w === r.width && u.h === r.height) return r;
  if (u.w > LIMITS.side || u.h > LIMITS.side || u.w * u.h > LIMITS.pixels) return r;
  const ox = -u.x, oy = -u.y, w = u.w * (t.w / r.width), h = u.h * (t.h / r.height), c = applyMat(at, u.w / 2 - ox, u.h / 2 - oy);
  const nr = new Raster(u.w, u.h);
  nr.ctx.drawImage(r.canvas, ox, oy);
  nr.touch();
  const patch: Partial<Layer> = { raster: nr, transform: { ...t, x: c.x - w / 2, y: c.y - h / 2, w, h } };
  if (tied && m && mr) {
    const nm = Raster.filled(u.w, u.h, '#ffffff');
    nm.ctx.clearRect(ox, oy, mr.width, mr.height);
    nm.ctx.drawImage(mr.canvas, ox, oy);
    nm.touch();
    patch.mask = { ...m, raster: nm };
  }
  p.updateLayer(layer.id, patch);
  return nr;
}

/** A mask that has a box of its own, grown to cover `want`: the old mask kept where it was, the new area revealing (white).
 *  Only the mask changes, never the layer's pixels. Returns the mask's raster, grown or not. */
export function growMask(p: Project, layer: Layer, want: Rect): Raster | null {
  const m = layer.mask, mr = m?.raster ?? null, t = m?.placement ?? null;
  if (!m || !mr || !t) return mr;
  if (t.rotation !== 0 || t.flipX || t.flipY || t.w !== mr.width || t.h !== mr.height) return mr;
  const box: Rect = { x: t.x, y: t.y, w: t.w, h: t.h };
  const u = unionRect(box, integral(want));
  if (u.x === box.x && u.y === box.y && u.w === box.w && u.h === box.h) return mr;
  if (u.w > LIMITS.side || u.h > LIMITS.side || u.w * u.h > LIMITS.pixels) return mr;
  const nm = Raster.filled(u.w, u.h, '#ffffff');
  nm.ctx.clearRect(box.x - u.x, box.y - u.y, mr.width, mr.height);
  nm.ctx.drawImage(mr.canvas, box.x - u.x, box.y - u.y);
  nm.touch();
  p.updateLayer(layer.id, { mask: { ...m, raster: nm, placement: { ...t, x: u.x, y: u.y, w: u.w, h: u.h } } });
  return nm;
}

export function nudge(host: PaintHost, dx: number, dy: number): void {
  const p = host.current;
  if (!p) return;
  const linked = host.linkedOf(p);
  if (host.positionLocked(p.activeId)) return;
  for (const id of linked) if (host.positionLocked(id)) return;
  if (p.selectedIds.size === 1) {
    const only = p.selectedIds.values().next().value;
    if (only !== undefined && host.keyMove(only, dx, dy, 'Nudge')) return;
  }
  const burst = lastNudge;
  const joins = !!burst && burst.project === p && burst.rev === p.history.revision && performance.now() - burst.at < NUDGE_BURST_MS;
  host.edit('Nudge', (proj) => {
    let moved = 0;
    for (const id of linked) {
      const l = proj.layer(id);
      if (!l || l.isGroup || !l.raster) continue;
      const nt = { ...l.transform, x: l.transform.x + dx, y: l.transform.y + dy };
      proj.updateLayer(id, {
        transform: nt,
        mask: host.maskFollowing(l, nt),
        vectorMask: host.vectorFollowing(l, nt),
      });
      moved++;
    }
    return moved > 0;
  });
  // Presses in a quick run fold into one history step.
  if (joins) p.history.foldLast();
  lastNudge = { project: p, rev: p.history.revision, at: performance.now() };
}

const NUDGE_BURST_MS = 1000;
let lastNudge: { project: Project; rev: number; at: number } | null = null;

export function layerAt(host: PaintHost, pt: Pt): ID | null {
  const p = host.current;
  if (!p) return null;
  const list = hierarchy(p.doc);
  for (let i = list.length - 1; i >= 0; i--) {
    const { layer, visible } = list[i];
    const r = layer.raster;
    if (!visible || !layer.visible || layer.isGroup || !r || layer.locks?.all) continue;
    if (!contains(layer.transform, pt)) continue;
    const q = applyMat(invert(placement(layer.transform, r.width, r.height)), pt.x, pt.y);
    const x = Math.floor(q.x);
    const y = Math.floor(q.y);
    if (x < 0 || y < 0 || x >= r.width || y >= r.height) continue;
    if (r.read(x, y, 1, 1).data[3] > 8) return layer.id;
  }
  return null;
}

export function resizeSelection(host: PaintHost, delta: number, atBounds = false): void {
  const p = host.current;
  if (!p || !p.selection || delta === 0 || Math.abs(delta) > 1024) return;
  const sel = p.selection;
  const W = p.doc.width, H = p.doc.height, m = Math.ceil(Math.abs(delta)) + 2;
  // The working area reaches past the outline (and past the canvas) so a contraction has unselected pixels to measure
  // from. Unless the effect applies at canvas bounds, the canvas edge pixels carry on past the canvas, so the outline
  // does not pull away from it.
  const x0 = sel.x - m, y0 = sel.y - m, w = sel.w + 2 * m, h = sel.h + 2 * m;
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = atBounds ? y0 + y : Math.min(H - 1, Math.max(0, y0 + y));
    for (let x = 0; x < w; x++) data[y * w + x] = sel.valueAt(atBounds ? x0 + x : Math.min(W - 1, Math.max(0, x0 + x)), sy);
  }
  const grown = resizeMask(data, w, h, delta);
  const cx0 = Math.max(0, x0), cy0 = Math.max(0, y0), cw = Math.min(W, x0 + w) - cx0, ch = Math.min(H, y0 + h) - cy0;
  if (cw <= 0 || ch <= 0) return;
  const out = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) out[y * cw + x] = grown[(cy0 - y0 + y) * w + cx0 - x0 + x];
  host.applySelection(SelectionMask.cropped(cx0, cy0, cw, ch, out), 'replace', delta > 0 ? 'Expand Selection' : 'Contract Selection');
}
