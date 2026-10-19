// Artboards and frames (DEV_PLAN 36.13): the Engine's artboard methods, moved out of index.ts. Each takes an
// ArtboardHost, the few Engine members they use, so this file never imports the Engine class.
import { Raster, createSurface, ctxOf, type Surface } from './surface';
import { applyMat, boundsOf, integral, placement, unionRect } from './geometry';
import { byId, isDescendant } from './tree';
import { visibleBounds } from './distort';
import { movedVector } from './vector-mask';
import { Renderer, renderDoc } from './renderer';
import type { Project } from './project';
import { artboardFromData, newLayer, type Artboard, type Doc, type ID, type Layer, type Rect, type RGB, type Transform } from './types';

/** What the artboard methods need of the Engine. */
export interface ArtboardHost {
  current: Project | null;
  work: Renderer;
  edit(name: string, fn: (p: Project) => boolean | void): boolean;
  notice(text: string): void;
  sizeOk(width: number, height: number): boolean;
  fit(): void;
  focus(p: Project, id: ID | null): void;
  settle(): void;
  selectedRoots(p: Project): ID[];
  alignItems(p: Project): Array<{ ids: ID[]; box: Rect }>;
  normalizeClips(layers: Layer[]): Layer[];
}

/** The document's artboards, top to bottom as the Layers panel lists them. */
export function artboards(host: ArtboardHost, p: Project | null = host.current): Layer[] {
  return p ? p.doc.layers.filter((l) => l.isGroup && !l.parentId && l.artboard).reverse() : [];
}

/** Where the next artboard goes: over the whole canvas when there is none yet; otherwise the last one's size, 100 px
 *  to the right of the rightmost; `size` given, that size there instead. */
export function nextArtboardRect(host: ArtboardHost, size?: { w: number; h: number }): Rect | null {
  const p = host.current;
  if (!p) return null;
  const existing = artboards(host, p).map((l) => l.artboard as Artboard);
  if (!existing.length) return { x: 0, y: 0, w: size?.w ?? p.doc.width, h: size?.h ?? p.doc.height };
  const last = existing[0], right = Math.max(...existing.map((a) => a.x + a.w));
  return { x: right + 100, y: last.y, w: size?.w ?? last.w, h: size?.h ?? last.h };
}

/** The first free name of the form Artboard N. */
export function nextArtboardName(host: ArtboardHost): string {
  const names = new Set(host.current?.doc.layers.map((l) => l.name) ?? []);
  let n = 1;
  while (names.has(`Artboard ${n}`)) n += 1;
  return `Artboard ${n}`;
}

/** Layer > New > Artboard: at `nextArtboardRect` unless `rect` is given, the canvas widened to hold it,
 *  named `name` or Artboard N. White by default. One step. */
export function newArtboard(host: ArtboardHost, rect: { x: number; y: number; w: number; h: number } | null = null, background: RGB | null = { r: 255, g: 255, b: 255 }, name?: string): ID | null {
  const p = host.current, r = rect ?? nextArtboardRect(host);
  if (!p || !r) return null;
  const want = { w: Math.max(p.doc.width, r.x + r.w), h: Math.max(p.doc.height, r.y + r.h) };
  let created: ID | null = null;
  host.edit('New Artboard', (q) => {
    if (want.w !== q.doc.width || want.h !== q.doc.height) {
      if (!host.sizeOk(want.w, want.h)) return false;
      q.doc = { ...q.doc, width: want.w, height: want.h };
    }
    const board = newLayer(name?.trim().slice(0, 200) || nextArtboardName(host), q.doc, { isGroup: true, parentId: null, artboard: { ...r, background } });
    q.setLayers([...q.doc.layers, board]);
    host.focus(q, board.id);
    created = board.id;
    return true;
  });
  if (created) host.fit();
  return created;
}

/** Layer > New > Artboard from Layers: the selected top-level layers moved into a new artboard fitted to their
 *  visible pixels, transparent behind them. One step. */
export function artboardFromLayers(host: ArtboardHost): ID | null {
  const p = host.current;
  if (!p) return null;
  const roots = host.selectedRoots(p).filter((id) => { const l = p.layer(id); return !!l && !l.parentId && !l.artboard; });
  const boxes = host.alignItems(p).filter((it) => it.ids.some((id) => roots.includes(id))).map((it) => it.box);
  if (!roots.length || !boxes.length) { host.notice('Select layers outside any folder or artboard, with pixels, first.'); return null; }
  const b = integral(boxes.reduce((a, c) => unionRect(a, c)));
  let created: ID | null = null;
  host.edit('Artboard from Layers', (q) => {
    const names = new Set(q.doc.layers.map((l) => l.name));
    let n = 1;
    while (names.has(`Artboard ${n}`)) n += 1;
    const board = newLayer(`Artboard ${n}`, q.doc, { isGroup: true, parentId: null, artboard: { x: b.x, y: b.y, w: Math.max(1, b.w), h: Math.max(1, b.h), background: null } });
    const at = Math.max(...roots.map((id) => q.doc.layers.findIndex((l) => l.id === id))) + 1;
    const layers = q.doc.layers.map((l) => (roots.includes(l.id) ? { ...l, parentId: board.id } : l));
    layers.splice(at, 0, board);
    q.setLayers(host.normalizeClips(layers));
    host.focus(q, board.id);
    created = board.id;
    return true;
  });
  return created;
}

/** The document bounds of the visible pixels of layer `id` and of the layers inside it; null when they have none. */
export function contentBounds(host: ArtboardHost, id: ID, p: Project | null = host.current): Rect | null {
  if (!p) return null;
  const map = byId(p.doc);
  let box: Rect | null = null;
  for (const l of p.doc.layers) {
    if (l.isGroup || !l.raster || (l.id !== id && !isDescendant(map, l.id, id))) continue;
    const r = l.raster, vb = visibleBounds(r);
    if (!vb) continue;
    const m = placement(l.transform, r.width, r.height);
    const b = boundsOf([applyMat(m, vb.x, vb.y), applyMat(m, vb.x + vb.w, vb.y), applyMat(m, vb.x + vb.w, vb.y + vb.h), applyMat(m, vb.x, vb.y + vb.h)]);
    box = box ? unionRect(box, b) : b;
  }
  return box ? integral(box) : null;
}

/** Layer > New > Artboard from Group (1.65.4): a folder outside any other made an artboard over its contents (or
 *  the canvas when it holds no pixels), `w` by `h` when given, renamed when `name` is given; transparent behind, as
 *  Artboard from Layers makes them. One step. */
export function artboardFromGroup(host: ArtboardHost, id: ID, opts: { name?: string; w?: number; h?: number } = {}): boolean {
  const p = host.current, g = p?.layer(id);
  if (!p || !g?.isGroup || g.parentId || g.artboard || g.frame) { host.notice('Select a folder outside any other folder, artboard or frame first.'); return false; }
  const b = contentBounds(host, id, p) ?? { x: 0, y: 0, w: p.doc.width, h: p.doc.height }, name = opts.name?.trim().slice(0, 200);
  const w = Math.max(1, Math.min(30000, Math.round(opts.w ?? b.w))), h = Math.max(1, Math.min(30000, Math.round(opts.h ?? b.h)));
  return host.edit('Artboard from Group', (q) => {
    q.updateLayer(id, { artboard: { x: b.x, y: b.y, w, h, background: null }, ...(name ? { name } : {}) });
    host.focus(q, id);
    return true;
  });
}

/** Layer > New > Frame from Layers (1.65.4): each selected pixel layer put in a new rectangular frame fitted to its
 *  visible pixels, where it lies, as the Frame tool makes them. One step. */
export function frameFromLayers(host: ArtboardHost): void {
  const p = host.current;
  if (!p) return;
  const picks = p.doc.layers.filter((l) => p.selectedIds.has(l.id) && !l.isGroup && !!l.raster && !l.adjustment && !(l.parentId && p.layer(l.parentId)?.frame) && !!contentBounds(host, l.id, p));
  if (!picks.length) { host.notice('Select layers with pixels, outside any frame, first.'); return; }
  host.settle();
  host.edit('Frame from Layers', (q) => {
    let layers = [...q.doc.layers], last: ID | null = null, n = layers.filter((l) => l.frame).length + 1;
    for (const l of picks) {
      const b = contentBounds(host, l.id, q);
      if (!b) continue;
      while (layers.some((x) => x.name === `Frame ${n}`)) n += 1;
      const mask = new Raster(q.doc.width, q.doc.height), fw = Math.max(2, b.w), fh = Math.max(2, b.h);
      mask.ctx.fillStyle = '#ffffff';
      mask.ctx.fillRect(b.x, b.y, fw, fh);
      const frame = newLayer(`Frame ${n}`, q.doc, { isGroup: true, parentId: l.parentId, frame: { x: b.x, y: b.y, w: fw, h: fh, shape: 'rect' }, mask: { raster: mask, enabled: true, linked: true, placement: null } });
      layers = layers.map((x) => (x.id === l.id ? { ...x, parentId: frame.id } : x));
      layers.splice(layers.findIndex((x) => x.id === l.id) + 1, 0, frame);
      last = frame.id;
    }
    if (!last) return false;
    q.setLayers(host.normalizeClips(layers));
    host.focus(q, last);
    return true;
  });
}

/** Artboard Options: its rectangle and background, checked, as one step. */
export function setArtboard(host: ArtboardHost, id: ID, patch: Partial<Artboard>): boolean {
  return host.edit('Artboard Options', (p) => {
    const l = p.layer(id);
    if (!l?.artboard) return false;
    const next = artboardFromData({ ...l.artboard, ...patch });
    if (!next || JSON.stringify(next) === JSON.stringify(l.artboard)) return false;
    p.updateLayer(id, { artboard: next });
    return true;
  });
}

/** The Artboard tool (36.27): artboard `id` set to `rect`, its contents left where they are, the canvas widened to
 *  hold it as a new artboard does. One step. */
export function resizeArtboard(host: ArtboardHost, id: ID, rect: Rect): boolean {
  const p = host.current, l = p?.layer(id);
  if (!p || !l?.artboard) return false;
  const r = { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.max(1, Math.round(rect.w)), h: Math.max(1, Math.round(rect.h)) };
  const want = { w: Math.max(p.doc.width, r.x + r.w), h: Math.max(p.doc.height, r.y + r.h) };
  return host.edit('Resize Artboard', (q) => {
    const cur = q.layer(id)?.artboard;
    if (!cur) return false;
    const next = artboardFromData({ ...cur, ...r });
    if (!next || (next.x === cur.x && next.y === cur.y && next.w === cur.w && next.h === cur.h)) return false;
    if (want.w !== q.doc.width || want.h !== q.doc.height) {
      if (!host.sizeOk(want.w, want.h)) return false;
      q.doc = { ...q.doc, width: want.w, height: want.h };
    }
    q.updateLayer(id, { artboard: next });
    return true;
  });
}

/** The Artboard tool: artboard `id` moved by (dx, dy) with everything in it (boxes, mask placements, vector masks),
 *  the canvas widened to hold it. One step. */
export function moveArtboard(host: ArtboardHost, id: ID, dx: number, dy: number): boolean {
  const p = host.current, l = p?.layer(id);
  dx = Math.round(dx); dy = Math.round(dy);
  if (!p || !l?.artboard || (!dx && !dy)) return false;
  const a = l.artboard, want = { w: Math.max(p.doc.width, a.x + dx + a.w), h: Math.max(p.doc.height, a.y + dy + a.h) };
  return host.edit('Move Artboard', (q) => {
    if (want.w !== q.doc.width || want.h !== q.doc.height) {
      if (!host.sizeOk(want.w, want.h)) return false;
      q.doc = { ...q.doc, width: want.w, height: want.h };
    }
    const map = byId(q.doc), shift = (t: Transform): Transform => ({ ...t, x: t.x + dx, y: t.y + dy });
    q.setLayers(q.doc.layers.map((x) => {
      if (x.id !== id && !isDescendant(map, x.id, id)) return x;
      const out: Layer = { ...x, transform: shift(x.transform), mask: x.mask?.placement ? { ...x.mask, placement: shift(x.mask.placement) } : x.mask };
      if (x.artboard) out.artboard = { ...x.artboard, x: x.artboard.x + dx, y: x.artboard.y + dy };
      if (x.vectorMask) out.vectorMask = movedVector(x.vectorMask, (px, py) => ({ x: px + dx, y: py + dy }));
      return out;
    }));
    return true;
  });
}

/** One artboard as its own image: only it and what it holds, rendered and cut to its rectangle. */
export function artboardImage(host: ArtboardHost, id: ID, bare = false): Surface | null {
  const p = host.current, a = p?.layer(id);
  if (!p || !a?.artboard) return null;
  const map = byId(p.doc), keep = p.doc.layers.filter((l) => l.id === id || isDescendant(map, l.id, id)).map((l) => (bare && l.id === id && l.artboard ? { ...l, artboard: { ...l.artboard, background: null } } : l));
  const r = a.artboard, pad = { x: Math.min(0, r.x), y: Math.min(0, r.y) };
  const doc: Doc = { ...p.doc, width: Math.max(p.doc.width, r.x + r.w) - pad.x, height: Math.max(p.doc.height, r.y + r.h) - pad.y, layers: pad.x || pad.y ? keep.map((l) => ({ ...l, transform: { ...l.transform, x: l.transform.x - pad.x, y: l.transform.y - pad.y }, mask: l.mask?.placement ? { ...l.mask, placement: { ...l.mask.placement, x: l.mask.placement.x - pad.x, y: l.mask.placement.y - pad.y } } : l.mask, ...(l.artboard ? { artboard: { ...l.artboard, x: l.artboard.x - pad.x, y: l.artboard.y - pad.y } } : {}) })).map((l) => (l.vectorMask ? { ...l, vectorMask: movedVector(l.vectorMask, (x, y) => ({ x: x - pad.x, y: y - pad.y })) } : l)) : keep };
  const full = renderDoc(host.work, doc), out = createSurface(r.w, r.h);
  ctxOf(out).drawImage(full, r.x - pad.x, r.y - pad.y, r.w, r.h, 0, 0, r.w, r.h);
  return out;
}
