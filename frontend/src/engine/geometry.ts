import type { Pt, Rect, Transform } from './types';
import type { Ctx2D } from './surface';

export type Mat = readonly [number, number, number, number, number, number];
export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

/** Matrix product m times n: n is applied first, then m. */
export function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

/** Inverse of a matrix; a singular or non-finite one gives the identity. */
export function invert(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det || !Number.isFinite(det)) return IDENTITY;
  const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

export const applyMat = (m: Mat, x: number, y: number): Pt => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
export const translation = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
export const scaling = (sx: number, sy: number): Mat => [sx, 0, 0, sy, 0, 0];
export const rotation = (rad: number): Mat => { const c = Math.cos(rad), s = Math.sin(rad); return [c, s, -s, c, 0, 0]; };
export const radians = (deg: number): number => ((deg % 360) * Math.PI) / 180;
export const matScale = (m: Mat): number => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
export function setMat(ctx: Ctx2D, m: Mat): void { ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]); }

/** Matrix drawing a pw by ph picture into the box t (centre, scale with flips, rotate, move to the box centre). */
export function placement(t: Transform, pw: number, ph: number): Mat {
  const sx = (t.flipX ? -t.w : t.w) / pw, sy = (t.flipY ? -t.h : t.h) / ph;
  const inner = mul(scaling(sx, sy), translation(-pw / 2, -ph / 2));
  return mul(translation(t.x + t.w / 2, t.y + t.h / 2), mul(rotation(radians(t.rotation)), inner));
}

/** Document point at fraction (ux, uy) of the box, turned about the box centre by its rotation. */
export function unitPoint(t: Transform, ux: number, uy: number): Pt {
  const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
  const m = mul(translation(cx, cy), rotation(radians(t.rotation)));
  return applyMat(m, (ux - 0.5) * t.w, (uy - 0.5) * t.h);
}

/** The box's corners: top-left, top-right, bottom-right, bottom-left. */
export function corners(t: Transform): Pt[] {
  return [unitPoint(t, 0, 0), unitPoint(t, 1, 0), unitPoint(t, 1, 1), unitPoint(t, 0, 1)];
}

/** Smallest axis-aligned rectangle holding every point. */
export function boundsOf(points: Pt[]): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export const transformBounds = (t: Transform): Rect => boundsOf(corners(t));

/** Whether p lies inside the rotated box, edges included. */
export function contains(t: Transform, p: Pt): boolean {
  const q = applyMat(invert(mul(translation(t.x + t.w / 2, t.y + t.h / 2), rotation(radians(t.rotation)))), p.x, p.y);
  return Math.abs(q.x) <= t.w / 2 && Math.abs(q.y) <= t.h / 2;
}

/** Bounds of both rectangles; a copy of b when a is null. */
export function unionRect(a: Rect | null, b: Rect): Rect {
  if (!a) return { ...b };
  const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y);
  return { x: x0, y: y0, w: Math.max(a.x + a.w, b.x + b.w) - x0, h: Math.max(a.y + a.h, b.y + b.h) - y0 };
}

/** Overlap of two rectangles, or null when it has no area. */
export function intersectRect(a: Rect, b: Rect): Rect | null {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/** Smallest whole-pixel rectangle covering r. */
export function integral(r: Rect): Rect {
  const x0 = Math.floor(r.x), y0 = Math.floor(r.y);
  return { x: x0, y: y0, w: Math.ceil(r.x + r.w) - x0, h: Math.ceil(r.y + r.h) - y0 };
}

/** Whether the box draws a pw by ph picture one to one, with no rotation or flip and on whole pixels. */
export function isAxisAligned(t: Transform, pw: number, ph: number): boolean {
  return t.rotation % 360 === 0 && !t.flipX && !t.flipY && t.w === pw && t.h === ph && Number.isInteger(t.x) && Number.isInteger(t.y);
}

/** Whether every field of the two transforms is equal. */
export function sameTransform(a: Transform, b: Transform): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h && a.rotation === b.rotation && a.flipX === b.flipX && a.flipY === b.flipY && a.sampling === b.sampling;
}
