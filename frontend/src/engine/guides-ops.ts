// Guides and slices (DEV_PLAN 36.13): the Engine's guide and slice methods, moved out of index.ts. Each takes a
// GuideHost, the few Engine members they use, so this file never imports the Engine class.
import type { Project } from './project';
import { carryBoxes } from './boxes';
import type { Doc, DocBox, DocNote, DocSlice, Guide, ID, Pt, Rect } from './types';

/** What the guide and slice methods need of the Engine. */
export interface GuideHost {
  current: Project | null;
  view: { guides: boolean; guidesLocked: boolean };
  edit(name: string, fn: (p: Project) => boolean | void): boolean;
  /** Redraws the overlay (rulers, guides, slices). */
  overlay(): void;
  contentBounds(id: ID, p: Project | null): Rect | null;
  setActiveSlice(id: string): void;
}

export function setGuides(host: GuideHost, name: string, next: (g: Guide[]) => Guide[]): void {
  host.edit(name, (p) => {
    const before = p.doc.guides ?? [], after = next([...before]);
    if (after.length === before.length && after.every((g, i) => g.axis === before[i].axis && g.at === before[i].at)) return false;
    p.doc = { ...p.doc, guides: after };
    return true;
  });
  host.overlay();
}

/** View > New Guide, or a guide dropped from a ruler: at a whole or half pixel, kept within the canvas. */
export function addGuide(host: GuideHost, axis: 'x' | 'y', at: number): void {
  const d = host.current?.doc;
  if (!d || !Number.isFinite(at)) return;
  const v = Math.min(axis === 'x' ? d.width : d.height, Math.max(0, Math.round(at * 2) / 2));
  setGuides(host, 'New Guide', (g) => [...g, { axis, at: v }]);
}

export function moveGuide(host: GuideHost, index: number, at: number): void {
  const d = host.current?.doc;
  if (!d || !Number.isFinite(at)) return;
  setGuides(host, 'Move Guide', (g) => g.map((x, i) => (i === index ? { axis: x.axis, at: Math.min(x.axis === 'x' ? d.width : d.height, Math.max(0, Math.round(at * 2) / 2)) } : x)));
}

export function removeGuide(host: GuideHost, index: number): void { setGuides(host, 'Delete Guide', (g) => g.filter((_, i) => i !== index)); }

/** View > New Guide Layout (27.11): `columns` and `rows` with gutters inside margins:
 *  guides at the margins and at both edges of every gutter (a gutter of 0 puts one guide between cells). `clear`
 *  replaces the existing guides. One undo step. */
export function guideLayout(host: GuideHost, o: { columns: number; rows: number; gutterX: number; gutterY: number; margin: { top: number; left: number; bottom: number; right: number }; clear: boolean }): void {
  const d = host.current?.doc;
  if (!d) return;
  const half = (v: number): number => Math.round(v * 2) / 2, out: Guide[] = [];
  const lay = (axis: 'x' | 'y', n: number, gutter: number, a: number, b: number): void => {
    const span = b - a, cells = Math.max(1, Math.floor(n));
    if (span <= 0) return;
    const cell = (span - gutter * (cells - 1)) / cells;
    if (a > 0) out.push({ axis, at: half(a) });
    if (b < (axis === 'x' ? d.width : d.height)) out.push({ axis, at: half(b) });
    for (let i = 1; i < cells; i += 1) {
      const end = a + i * cell + (i - 1) * gutter;
      out.push({ axis, at: half(end) });
      if (gutter > 0) out.push({ axis, at: half(end + gutter) });
    }
  };
  if (o.columns >= 1) lay('x', o.columns, Math.max(0, o.gutterX), Math.max(0, o.margin.left), d.width - Math.max(0, o.margin.right));
  if (o.rows >= 1) lay('y', o.rows, Math.max(0, o.gutterY), Math.max(0, o.margin.top), d.height - Math.max(0, o.margin.bottom));
  setGuides(host, 'New Guide Layout', (g) => [...(o.clear ? [] : g), ...out]);
}

/** View > New Guides From Shape (27.11): guides on the four edges of the active shape layer's path, else of the selection. */
export function guidesFromShape(host: GuideHost): boolean {
  const p = host.current;
  if (!p) return false;
  const l = p.activeLayer, sel = p.selection;
  let r: Rect | null = l?.vector ? host.contentBounds(l.id, p) : null;
  if (!r && sel) r = { x: sel.x, y: sel.y, w: sel.w, h: sel.h };
  if (!r) return false;
  const b = r;
  setGuides(host, 'New Guides From Shape', (g) => [...g, { axis: 'x', at: b.x }, { axis: 'x', at: b.x + b.w }, { axis: 'y', at: b.y }, { axis: 'y', at: b.y + b.h }]);
  return true;
}
export function clearGuides(host: GuideHost): void { setGuides(host, 'Clear Guides', () => []); }

export function setSlices(host: GuideHost, name: string, next: (s: DocSlice[]) => DocSlice[]): void {
  host.edit(name, (p) => {
    const before = p.doc.slices ?? [], after = next([...before]);
    if (after.length === before.length && after.every((s, i) => s === before[i])) return false;
    p.doc = { ...p.doc, slices: after };
    return true;
  });
  host.overlay();
}

/** Slice tool: a user slice on whole pixels, kept within the canvas; returns false when it has no area. */
export function addSlice(host: GuideHost, r: { x: number; y: number; w: number; h: number }): boolean {
  const d = host.current?.doc;
  if (!d) return false;
  const x0 = Math.max(0, Math.round(Math.min(r.x, r.x + r.w))), y0 = Math.max(0, Math.round(Math.min(r.y, r.y + r.h)));
  const x1 = Math.min(d.width, Math.round(Math.max(r.x, r.x + r.w))), y1 = Math.min(d.height, Math.round(Math.max(r.y, r.y + r.h)));
  if (x1 - x0 < 1 || y1 - y0 < 1) return false;
  setSlices(host, 'New Slice', (s) => [...s, { id: `sl${Date.now().toString(36)}${s.length}`, name: '', x: x0, y: y0, w: x1 - x0, h: y1 - y0 }]);
  return true;
}
export function removeSlice(host: GuideHost, id: string): void { setSlices(host, 'Delete Slice', (s) => s.filter((x) => x.id !== id)); }
export function clearSlices(host: GuideHost): void { setSlices(host, 'Clear Slices', () => []); }

/** Changes a slice's name, link, alt text or rectangle (whole pixels, kept inside the canvas) as one undo step. */
export function updateSlice(host: GuideHost, id: string, patch: Partial<Omit<DocSlice, 'id'>>, step = 'Slice Options'): void {
  const d = host.current?.doc;
  if (!d) return;
  setSlices(host, step, (list) => list.map((s) => {
    if (s.id !== id) return s;
    const w = Math.max(1, Math.min(d.width, Math.round(patch.w ?? s.w))), h = Math.max(1, Math.min(d.height, Math.round(patch.h ?? s.h)));
    const x = Math.max(0, Math.min(d.width - w, Math.round(patch.x ?? s.x))), y = Math.max(0, Math.min(d.height - h, Math.round(patch.y ?? s.y)));
    const next = { ...s, ...patch, x, y, w, h };
    return next.name === s.name && next.url === s.url && next.alt === s.alt && x === s.x && y === s.y && w === s.w && h === s.h ? s : next;
  }));
}

/** Layer > New Layer Based Slice: a slice over the visible pixels of the active layer, tied to that layer. */
export function addLayerSlice(host: GuideHost): boolean {
  const p = host.current, l = p?.activeLayer;
  if (!p || !l) return false;
  const b = host.contentBounds(l.id, p);
  if (!b) return false;
  const x0 = Math.max(0, Math.floor(b.x)), y0 = Math.max(0, Math.floor(b.y)), x1 = Math.min(p.doc.width, Math.ceil(b.x + b.w)), y1 = Math.min(p.doc.height, Math.ceil(b.y + b.h));
  if (x1 - x0 < 1 || y1 - y0 < 1) return false;
  const id = `sl${Date.now().toString(36)}${p.doc.slices?.length ?? 0}`;
  // Active before the edit, so the redraw the edit causes already shows it highlighted.
  host.setActiveSlice(id);
  setSlices(host, 'New Layer Based Slice', (s) => [...s, { id, name: l.name, x: x0, y: y0, w: x1 - x0, h: y1 - y0, layer: l.id }]);
  return true;
}

/** The guide within `tol` screen pixels of a screen point, nearest first; null when guides are hidden or locked. */
export function guideAt(host: GuideHost, screen: Pt, tol = 4): number | null {
  const p = host.current, g = p?.doc.guides;
  if (!p || !g?.length || !host.view.guides || host.view.guidesLocked) return null;
  const v = p.viewport;
  let best: number | null = null, bestD = tol + 1;
  g.forEach((x, i) => { const d = Math.abs(x.axis === 'x' ? v.panX + x.at * v.zoom - screen.x : v.panY + x.at * v.zoom - screen.y); if (d <= tol && d < bestD) { best = i; bestD = d; } });
  return best;
}

/** A change of the canvas as the marks on it see it: where `map` puts a point of the old canvas on the new one, which is
 *  `width` by `height`; `swap` when horizontal and vertical trade places (a quarter turn); `upright` false when no guide
 *  can stay straight (a turn by any other angle, a perspective crop). */
export interface Carry { map: (x: number, y: number) => Pt; width: number; height: number; swap?: boolean; upright?: boolean }

/** The document's guides, slices, notes and count marks carried through `c`, as the pixels are: a guide, note or count
 *  mark that lands off the canvas goes, a slice is cut to it. Only the fields the document has are returned. */
export function carryMarks(doc: Doc, c: Carry): Partial<Doc> {
  const out: { guides?: Guide[]; slices?: DocSlice[]; notes?: DocNote[]; counts?: { x: number; y: number }[]; boxes?: DocBox[] } = {};
  const inside = (q: Pt): boolean => q.x >= 0 && q.y >= 0 && q.x <= c.width && q.y <= c.height;
  if (doc.guides?.length) {
    out.guides = c.upright === false ? [] : doc.guides.flatMap((g) => {
      const q = c.map(g.axis === 'x' ? g.at : 0, g.axis === 'y' ? g.at : 0);
      const axis: 'x' | 'y' = c.swap ? (g.axis === 'x' ? 'y' : 'x') : g.axis, at = Math.round((axis === 'x' ? q.x : q.y) * 2) / 2;
      return at >= 0 && at <= (axis === 'x' ? c.width : c.height) ? [{ axis, at }] : [];
    });
  }
  if (doc.slices?.length) {
    out.slices = doc.slices.flatMap((s) => {
      const q = [c.map(s.x, s.y), c.map(s.x + s.w, s.y), c.map(s.x, s.y + s.h), c.map(s.x + s.w, s.y + s.h)], xs = q.map((a) => a.x), ys = q.map((a) => a.y);
      const x0 = Math.max(0, Math.floor(Math.min(...xs) + 1e-6)), y0 = Math.max(0, Math.floor(Math.min(...ys) + 1e-6));
      const x1 = Math.min(c.width, Math.ceil(Math.max(...xs) - 1e-6)), y1 = Math.min(c.height, Math.ceil(Math.max(...ys) - 1e-6));
      return x1 - x0 < 1 || y1 - y0 < 1 ? [] : [{ ...s, x: x0, y: y0, w: x1 - x0, h: y1 - y0 }];
    });
  }
  if (doc.notes?.length) out.notes = doc.notes.flatMap((n) => { const q = c.map(n.x, n.y); return inside(q) ? [{ ...n, x: q.x, y: q.y }] : []; });
  if (doc.counts?.length) out.counts = doc.counts.flatMap((n) => { const q = c.map(n.x, n.y); return inside(q) ? [{ x: q.x, y: q.y }] : []; });
  if (doc.boxes?.length) out.boxes = carryBoxes(doc.boxes, c.map, c.width, c.height);
  return out;
}
