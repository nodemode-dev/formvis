import type { Pt, Rect } from './types';

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
