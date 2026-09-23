import { cornerAt, type VectorPath } from './paths';
import { customShapePath } from './custom-shapes';
import type { Pt, Rect } from './types';

/** Parametric shapes for the Shape tool, ported from NodeMode's sonny studio (`studio/pixel/shapes.ts`, the owner's
 *  own build, MIT): regular polygons, stars, arrows and the parametric heart. There they fill a tile store; here
 *  they become corner anchors of a closed `VectorPath`, so the shape stays an editable vector layer. Each generator
 *  is fitted to the dragged box, as Photoshop's Polygon and custom shapes are. Lines are arrows without heads. */

export type PathShapeKind = 'polygon' | 'star' | 'line' | 'arrow' | 'heart' | 'custom';
export interface PathShapeOptions { sides: number; starInset: number; weight: number; headLength: number; headWidth: number; custom: string }
export const DEFAULT_PATH_SHAPE: PathShapeOptions = { sides: 5, starInset: 50, weight: 4, headLength: 24, headWidth: 24, custom: 'check' };

/** Regular n-gon, vertex 0 at `rot` (radians, 0 is +x). */
export function ngonPoints(cx: number, cy: number, r: number, n: number, rot = -Math.PI / 2): Pt[] {
  return Array.from({ length: n }, (_, i) => { const a = rot + (2 * Math.PI * i) / n; return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }; });
}

/** Star: n spikes alternating outer and inner radius (2n points). */
export function starPoints(cx: number, cy: number, rOuter: number, rInner: number, n: number, rot = -Math.PI / 2): Pt[] {
  return Array.from({ length: n * 2 }, (_, i) => { const r = i % 2 === 0 ? rOuter : rInner, a = rot + (Math.PI * i) / n; return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }; });
}

/** Closed seven-point arrow from tail `a` to tip `b`; with no head it is a four-point bar (a line of `shaftW`). */
export function arrowPoints(a: Pt, b: Pt, headLen: number, headW: number, shaftW: number): Pt[] {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, px = -uy, py = ux, s = shaftW / 2;
  if (headLen <= 0) return [{ x: a.x + px * s, y: a.y + py * s }, { x: b.x + px * s, y: b.y + py * s }, { x: b.x - px * s, y: b.y - py * s }, { x: a.x - px * s, y: a.y - py * s }];
  const hl = Math.min(headLen, len * 0.9), bx = b.x - ux * hl, by = b.y - uy * hl, h = Math.max(headW, shaftW) / 2;
  return [
    { x: a.x + px * s, y: a.y + py * s }, { x: bx + px * s, y: by + py * s }, { x: bx + px * h, y: by + py * h }, { x: b.x, y: b.y },
    { x: bx - px * h, y: by - py * h }, { x: bx - px * s, y: by - py * s }, { x: a.x - px * s, y: a.y - py * s },
  ];
}

/** Heart: the classic parametric curve, radius `r`. */
export function heartPoints(cx: number, cy: number, r: number, n = 48): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (2 * Math.PI * i) / n, x = 16 * Math.pow(Math.sin(t), 3), y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return { x: cx + (x / 17) * r, y: cy - (y / 17) * r };
  });
}

/** Scales and moves points so their bounds fill `box` exactly. */
function fit(pts: Pt[], box: Rect): Pt[] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const sx = box.w / Math.max(1e-9, x1 - x0), sy = box.h / Math.max(1e-9, y1 - y0);
  return pts.map((p) => ({ x: box.x + (p.x - x0) * sx, y: box.y + (p.y - y0) * sy }));
}

const closed = (pts: Pt[]): VectorPath => ({ subpaths: [{ anchors: pts.map(cornerAt), closed: true }] });

/** The closed path for a boxed shape (polygon, star, heart, or a custom shape from the library) fitted to `box`. */
export function boxedShapePath(kind: 'polygon' | 'star' | 'heart' | 'custom', box: Rect, o: PathShapeOptions): VectorPath {
  if (kind === 'custom') return customShapePath(o.custom, box);
  const n = Math.max(3, Math.min(100, Math.round(o.sides)));
  const pts = kind === 'polygon' ? ngonPoints(0, 0, 1, n) : kind === 'star' ? starPoints(0, 0, 1, Math.max(0.01, 1 - Math.min(99, Math.max(1, o.starInset)) / 100), n) : heartPoints(0, 0, 1);
  return closed(fit(pts, box));
}

/** The closed path for a line or arrow from `a` to `b`. */
export function linePath(kind: 'line' | 'arrow', a: Pt, b: Pt, o: PathShapeOptions): VectorPath {
  const w = Math.max(1, o.weight);
  return closed(arrowPoints(a, b, kind === 'arrow' ? Math.max(1, o.headLength) : 0, kind === 'arrow' ? Math.max(w, o.headWidth) : 0, w));
}
