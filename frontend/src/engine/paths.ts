import { uid, type ID, type Pt, type Rect } from './types';

/** Vector paths drawn with the Pen tool, in document pixels: sub-paths of anchors, each holding the control handles of
 *  the cubic Bezier segments arriving at it (`in`) and leaving it (`out`). A corner's handles sit on the anchor. */
export interface Anchor { x: number; y: number; inX: number; inY: number; outX: number; outY: number }
export interface SubPath { anchors: Anchor[]; closed: boolean }
export interface VectorPath { subpaths: SubPath[] }

export const cornerAt = (p: Pt): Anchor => ({ x: p.x, y: p.y, inX: p.x, inY: p.y, outX: p.x, outY: p.y });

/** The path as a Path2D, each point mapped through `map` (document pixels by default, the screen for an overlay). */
export function tracePath(vp: VectorPath, map: (p: Pt) => Pt = (p) => p): Path2D {
  const out = new Path2D();
  for (const sp of vp.subpaths) {
    const a = sp.anchors;
    if (!a.length) continue;
    const start = map(a[0]);
    out.moveTo(start.x, start.y);
    const segment = (from: Anchor, to: Anchor): void => {
      const c1 = map({ x: from.outX, y: from.outY }), c2 = map({ x: to.inX, y: to.inY }), end = map(to);
      out.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, end.x, end.y);
    };
    for (let i = 1; i < a.length; i++) segment(a[i - 1], a[i]);
    if (sp.closed && a.length > 1) { segment(a[a.length - 1], a[0]); out.closePath(); }
  }
  return out;
}

/** A box holding the whole path; a Bezier segment lies within its anchors' and handles' hull, so their extremes do. */
export function pathBounds(vp: VectorPath): Rect | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const sp of vp.subpaths) for (const a of sp.anchors) {
    x0 = Math.min(x0, a.x, a.inX, a.outX); x1 = Math.max(x1, a.x, a.inX, a.outX);
    y0 = Math.min(y0, a.y, a.inY, a.outY); y1 = Math.max(y1, a.y, a.inY, a.outY);
  }
  return x0 === Infinity ? null : { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/** The path as plain data for a project file, coordinates to a thousandth of a pixel; null when it has no points. */
export function pathData(vp: VectorPath | null): { subpaths: Array<{ closed: boolean; anchors: number[][] }> } | null {
  const subpaths = (vp?.subpaths ?? []).filter((s) => s.anchors.length).map((s) => ({
    closed: s.closed,
    anchors: s.anchors.map((a) => [a.x, a.y, a.inX, a.inY, a.outX, a.outY].map(round3)),
  }));
  return subpaths.length ? { subpaths } : null;
}

/** A path read back from a project file, checked: numbers must be finite, and sizes stay bounded. */
export function pathFrom(raw: unknown): VectorPath | null {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { subpaths?: unknown }).subpaths) ? (raw as { subpaths: unknown[] }).subpaths : [];
  const subpaths: SubPath[] = [];
  for (const s of list.slice(0, 1000)) {
    if (!s || typeof s !== 'object' || !Array.isArray((s as { anchors?: unknown }).anchors)) continue;
    const anchors: Anchor[] = [];
    for (const a of (s as { anchors: unknown[] }).anchors.slice(0, 10000)) {
      if (!Array.isArray(a) || a.length !== 6 || !a.every((v) => typeof v === 'number' && Number.isFinite(v))) continue;
      const [x, y, inX, inY, outX, outY] = a as number[];
      anchors.push({ x, y, inX, inY, outX, outY });
    }
    if (anchors.length) subpaths.push({ anchors, closed: (s as { closed?: unknown }).closed === true });
  }
  return subpaths.length ? { subpaths } : null;
}

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** The segments of a sub-path as anchor index pairs: each anchor to the next, and the last back to the first when closed. */
function segments(sp: SubPath): Array<[number, number]> {
  const n = sp.anchors.length, out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < n; i++) out.push([i, i + 1]);
  if (sp.closed && n > 1) out.push([n - 1, 0]);
  return out;
}

/** The anchor within `near` of point `at`, both measured after `map` (screen pixels for the Pen). */
export function anchorNear(vp: VectorPath, at: Pt, map: (p: Pt) => Pt, near: number): { sp: SubPath; index: number } | null {
  for (const sp of vp.subpaths) for (let i = 0; i < sp.anchors.length; i++) {
    const q = map(sp.anchors[i]);
    if (Math.hypot(q.x - at.x, q.y - at.y) <= near) return { sp, index: i };
  }
  return null;
}

/** The point of the path nearest `at` after `map`: its sub-path, the anchor its segment leaves from, the curve
 *  parameter and the distance. A coarse sweep of each segment is refined by ternary search. */
export function nearestSegment(vp: VectorPath, at: Pt, map: (p: Pt) => Pt): { sp: SubPath; index: number; t: number; d: number } | null {
  let best: { sp: SubPath; index: number; t: number; d: number } | null = null;
  for (const sp of vp.subpaths) for (const [i, j] of segments(sp)) {
    const a = sp.anchors[i], b = sp.anchors[j];
    const p0 = map(a), p1 = map({ x: a.outX, y: a.outY }), p2 = map({ x: b.inX, y: b.inY }), p3 = map(b);
    const dist = (t: number): number => {
      const u = 1 - t, x = u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x;
      const y = u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y;
      return Math.hypot(x - at.x, y - at.y);
    };
    let bt = 0, bd = Infinity;
    for (let k = 0; k <= 48; k++) { const d = dist(k / 48); if (d < bd) { bd = d; bt = k / 48; } }
    let lo = Math.max(0, bt - 1 / 48), hi = Math.min(1, bt + 1 / 48);
    for (let k = 0; k < 24; k++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (dist(m1) < dist(m2)) hi = m2; else lo = m1; }
    const t = (lo + hi) / 2, d = dist(t);
    if (!best || d < best.d) best = { sp, index: i, t, d };
  }
  return best;
}

/** Splits the segment leaving anchor `index` of `sp` at parameter `t` by de Casteljau's construction, inserting an
 *  anchor there; the curve keeps its exact shape. */
export function splitSegment(sp: SubPath, index: number, t: number): Anchor {
  const a = sp.anchors[index], b = sp.anchors[(index + 1) % sp.anchors.length];
  const p0 = { x: a.x, y: a.y }, p1 = { x: a.outX, y: a.outY }, p2 = { x: b.inX, y: b.inY }, p3 = { x: b.x, y: b.y };
  const q0 = lerp(p0, p1, t), q1 = lerp(p1, p2, t), q2 = lerp(p2, p3, t), r0 = lerp(q0, q1, t), r1 = lerp(q1, q2, t), s = lerp(r0, r1, t);
  a.outX = q0.x; a.outY = q0.y;
  b.inX = q2.x; b.inY = q2.y;
  const added: Anchor = { x: s.x, y: s.y, inX: r0.x, inY: r0.y, outX: r1.x, outY: r1.y };
  sp.anchors.splice(index + 1, 0, added);
  return added;
}

/** A document's paths: at most one temporary Work Path and any number of named ones, and which is selected. */
export interface NamedPath { id: ID; name: string; path: VectorPath; work: boolean; shape?: boolean }
export interface PathSet { list: NamedPath[]; active: ID | null }

/** A document's paths as project-file data; null when there are none. A named path saves even when empty. */
export function pathSetData(set: PathSet | null): { list: Array<{ id: ID; name: string; work: boolean; subpaths: unknown[] }>; active: ID | null } | null {
  const list = (set?.list ?? []).map((n) => ({ id: n.id, name: n.name, work: n.work, subpaths: pathData(n.path)?.subpaths ?? [] })).filter((n) => !n.work || n.subpaths.length);
  return list.length ? { list, active: set?.active && list.some((n) => n.id === set.active) ? set.active : null } : null;
}

/** Paths read back from a project file, checked; `legacy` is the single Work Path that 0.46.0 files carry. */
export function pathSetFrom(raw: unknown, active: unknown, legacy: unknown): PathSet | null {
  const list: NamedPath[] = [];
  if (Array.isArray(raw)) {
    for (const r of raw.slice(0, 200)) {
      if (!r || typeof r !== 'object') continue;
      const o = r as Record<string, unknown>, path = pathFrom(o) ?? { subpaths: [] }, work = o.work === true;
      if (work && (!path.subpaths.length || list.some((n) => n.work))) continue;
      const id = typeof o.id === 'string' && o.id && !list.some((n) => n.id === o.id) ? o.id.slice(0, 64) : uid();
      list.push({ id, name: typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 80) : 'Path', path, work });
    }
  } else {
    const path = pathFrom(legacy);
    if (path) list.push({ id: uid(), name: 'Work Path', path, work: true });
  }
  return list.length ? { list, active: typeof active === 'string' && list.some((n) => n.id === active) ? active : null } : null;
}

/** The path moved by `dx`, `dy`, as a new path. */
export function shiftPath(vp: VectorPath, dx: number, dy: number): VectorPath {
  return { subpaths: vp.subpaths.map((s) => ({ closed: s.closed, anchors: s.anchors.map((a) => ({ x: a.x + dx, y: a.y + dy, inX: a.inX + dx, inY: a.inY + dy, outX: a.outX + dx, outY: a.outY + dy })) })) };
}
