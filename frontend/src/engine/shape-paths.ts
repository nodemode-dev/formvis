import { cornerAt, type VectorPath } from './paths';
import { customShapePath } from './custom-shapes';
import type { Ctx2D } from './surface';
import { patternById } from './patterns';
import type { Pt, Rect, ShapeGradient, ShapePattern } from './types';

/** A library pattern as a canvas paint, tiled from the shape's bounds at `p.scale` times its size; null when the pattern is not known. */
export function shapePattern(c: Ctx2D, p: ShapePattern, b: Rect): CanvasPattern | null {
  const pat = patternById(p.id);
  if (!pat) return null;
  const out = c.createPattern(pat.surface as CanvasImageSource, 'repeat');
  out?.setTransform(new DOMMatrix().translate(b.x, b.y).scale(Math.min(16, Math.max(0.05, p.scale))));
  return out;
}

/** A shape's gradient fill as a canvas gradient over the shape's bounds `b`: linear runs corner to corner along its angle,
 *  radial reaches the bounds' corners from the centre, angle sweeps round the centre starting at its angle. */
export function shapeGradient(c: Ctx2D, g: ShapeGradient, b: Rect): CanvasGradient {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, a = (g.angle * Math.PI) / 180;
  let out: CanvasGradient;
  if (g.type === 'radial') out = c.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, Math.hypot(b.w, b.h) / 2));
  else if (g.type === 'angle') out = c.createConicGradient(a, cx, cy);
  else {
    const half = (Math.abs(Math.cos(a)) * b.w + Math.abs(Math.sin(a)) * b.h) / 2 || 1, dx = Math.cos(a) * half, dy = Math.sin(a) * half;
    out = c.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
  }
  for (const s of [...g.stops].sort((p, q) => p.at - q.at)) out.addColorStop(Math.min(1, Math.max(0, s.at)), `rgba(${s.color.r}, ${s.color.g}, ${s.color.b}, ${s.alpha ?? 1})`);
  return out;
}

/** Parametric shapes for the Shape tool, ported from NodeMode's formvis studio (`studio/pixel/shapes.ts`, the owner's
 *  own build, MIT): regular polygons, stars, arrows and the parametric heart. There they fill a tile store; here
 *  they become corner anchors of a closed `VectorPath`, so the shape stays an editable vector layer. Each generator
 *  is fitted to the dragged box, as the Polygon and custom shapes are. Lines are arrows without heads. */

export type PathShapeKind = 'polygon' | 'star' | 'line' | 'arrow' | 'heart' | 'custom' | 'triangle';
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

export const closed = (pts: Pt[]): VectorPath => ({ subpaths: [{ anchors: pts.map(cornerAt), closed: true }] });   // exported 1.60.3 (Markup)

/** The closed path for a boxed shape (polygon, star, heart, or a custom shape from the library) fitted to `box`. */
export function boxedShapePath(kind: 'polygon' | 'star' | 'heart' | 'custom' | 'triangle' | 'rectangle' | 'ellipse', box: Rect, o: PathShapeOptions & { cornerRadius?: number; smoothCorners?: boolean }): VectorPath {
  if (kind === 'custom') return customShapePath(o.custom, box);
  const r = Math.max(0, o.cornerRadius ?? 0), smooth = !!o.smoothCorners;
  // The Triangle (1.49.8, the owner's tool list): its apex at the top centre, its base along the bottom.
  if (kind === 'triangle') {
    const tri = [{ x: box.x + box.w / 2, y: box.y }, { x: box.x + box.w, y: box.y + box.h }, { x: box.x, y: box.y + box.h }];
    return r > 0 ? roundedPolygonPath(tri, r, smooth) : closed(tri);
  }
  // Rectangles and ellipses as paths (Path and Pixels modes, or a stroke): a rounded rectangle when it has a radius;
  // an ellipse as four arcs.
  if (kind === 'rectangle' || kind === 'ellipse') {
    if (kind === 'ellipse') return ellipsePath(box);
    const rr = Math.min(r, box.w / 2, box.h / 2);
    return smooth && rr > 0 ? roundedPolygonPath([{ x: box.x, y: box.y }, { x: box.x + box.w, y: box.y }, { x: box.x + box.w, y: box.y + box.h }, { x: box.x, y: box.y + box.h }], rr, true) : roundRectPath(box, rr);
  }
  const n = Math.max(3, Math.min(100, Math.round(o.sides)));
  const pts = kind === 'polygon' ? ngonPoints(0, 0, 1, n) : kind === 'star' ? starPoints(0, 0, 1, Math.max(0.01, 1 - Math.min(99, Math.max(1, o.starInset)) / 100), n) : heartPoints(0, 0, 1);
  const fitted = fit(pts, box);
  return r > 0 && kind !== 'heart' ? roundedPolygonPath(fitted, r, smooth) : closed(fitted);
}

/** A closed polygon with every corner rounded to radius `r`; with `smooth` the corner runs half as long again and
 *  leaves the edges with a flatter handle, so it meets them without a visible join. Each corner is held to half
 *  of the shorter edge beside it. */
export function roundedPolygonPath(pts: Pt[], r: number, smooth = false): VectorPath {
  const n = pts.length, anchors: VectorPath['subpaths'][number]['anchors'] = [];
  for (let i = 0; i < n; i++) {
    const v = pts[i], p = pts[(i + n - 1) % n], q = pts[(i + 1) % n], lp = Math.hypot(p.x - v.x, p.y - v.y), lq = Math.hypot(q.x - v.x, q.y - v.y);
    if (!lp || !lq) { anchors.push(cornerAt(v)); continue; }
    const ux = (p.x - v.x) / lp, uy = (p.y - v.y) / lp, wx = (q.x - v.x) / lq, wy = (q.y - v.y) / lq;
    const theta = Math.acos(Math.max(-1, Math.min(1, ux * wx + uy * wy)));
    if (theta > Math.PI - 1e-3 || theta < 1e-3) { anchors.push(cornerAt(v)); continue; }
    const phi = Math.PI - theta, d = Math.min((r / Math.tan(theta / 2)) * (smooth ? 1.5 : 1), lp / 2, lq / 2);
    const f = smooth ? 0.75 : ((4 / 3) * Math.tan(phi / 4)) / Math.tan(phi / 2);
    const ax = v.x + ux * d, ay = v.y + uy * d, bx = v.x + wx * d, by = v.y + wy * d;
    anchors.push(anchor(ax, ay, ax, ay, ax + (v.x - ax) * f, ay + (v.y - ay) * f));
    anchors.push(anchor(bx, by, bx + (v.x - bx) * f, by + (v.y - by) * f, bx, by));
  }
  return { subpaths: [{ anchors, closed: true }] };
}

/** The closed path for a line or arrow from `a` to `b`. */
export function linePath(kind: 'line' | 'arrow', a: Pt, b: Pt, o: PathShapeOptions): VectorPath {
  const w = Math.max(1, o.weight);
  return closed(arrowPoints(a, b, kind === 'arrow' ? Math.max(1, o.headLength) : 0, kind === 'arrow' ? Math.max(w, o.headWidth) : 0, w));
}

const KAPPA = 0.5523;
const anchor = (x: number, y: number, inX = x, inY = y, outX = x, outY = y): VectorPath['subpaths'][number]['anchors'][number] => ({ x, y, inX, inY, outX, outY });

function ellipsePath(b: Rect): VectorPath {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, rx = b.w / 2, ry = b.h / 2, kx = rx * KAPPA, ky = ry * KAPPA;
  return { subpaths: [{ closed: true, anchors: [
    anchor(cx, b.y, cx - kx, b.y, cx + kx, b.y), anchor(b.x + b.w, cy, b.x + b.w, cy - ky, b.x + b.w, cy + ky),
    anchor(cx, b.y + b.h, cx + kx, b.y + b.h, cx - kx, b.y + b.h), anchor(b.x, cy, b.x, cy + ky, b.x, cy - ky),
  ] }] };
}

/** A rectangle with its own radius at each corner (top left, top right, bottom right, bottom left), each held to half the shorter side. */
export function cornerRectPath(b: Rect, radii: readonly number[]): VectorPath {
  const { x, y, w, h } = b, cap = Math.min(w, h) / 2, [a, c, d, e] = radii.map((v) => Math.max(0, Math.min(v, cap))), K = KAPPA;
  const anchors: VectorPath['subpaths'][number]['anchors'] = [];
  anchors.push(anchor(x + a, y, x + a - a * K, y), anchor(x + w - c, y, x + w - c, y, x + w - c + c * K, y));
  anchors.push(anchor(x + w, y + c, x + w, y + c - c * K), anchor(x + w, y + h - d, x + w, y + h - d, x + w, y + h - d + d * K));
  anchors.push(anchor(x + w - d, y + h, x + w - d + d * K, y + h), anchor(x + e, y + h, x + e, y + h, x + e - e * K, y + h));
  anchors.push(anchor(x, y + h - e, x, y + h - e + e * K), anchor(x, y + a, x, y + a, x, y + a - a * K));
  return { subpaths: [{ closed: true, anchors }] };
}

function roundRectPath(b: Rect, r: number): VectorPath {
  const { x, y, w, h } = b;
  if (r <= 0) return closed([{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]);
  const k = r * KAPPA;
  return { subpaths: [{ closed: true, anchors: [
    anchor(x + r, y, x + r - k, y), anchor(x + w - r, y, x + w - r, y, x + w - r + k, y),
    anchor(x + w, y + r, x + w, y + r - k), anchor(x + w, y + h - r, x + w, y + h - r, x + w, y + h - r + k),
    anchor(x + w - r, y + h, x + w - r + k, y + h), anchor(x + r, y + h, x + r, y + h, x + r - k, y + h),
    anchor(x, y + h - r, x, y + h - r + k), anchor(x, y + r, x, y + r, x, y + r - k),
  ] }] };
}
