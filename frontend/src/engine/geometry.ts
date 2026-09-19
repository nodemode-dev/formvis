import type { Pt, Rect, Transform } from './types';
import type { Ctx2D } from './surface';

export type Mat = readonly [number, number, number, number, number, number];
export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

export function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function invert(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det || !Number.isFinite(det)) return IDENTITY;
  const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

export const applyMat = (m: Mat, x: number, y: number): Pt => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
export const translation = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
export const scaling = (sx: number, sy: number): Mat => [sx, 0, 0, sy, 0, 0];
export function rotation(rad: number): Mat { const c = Math.cos(rad), s = Math.sin(rad); return [c, s, -s, c, 0, 0]; }
export const radians = (deg: number): number => ((deg % 360) * Math.PI) / 180;
export const matScale = (m: Mat): number => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
export function setMat(ctx: Ctx2D, m: Mat): void { ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]); }

export function placement(t: Transform, pw: number, ph: number): Mat {
  const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
  const sx = ((t.flipX ? -1 : 1) * t.w) / pw, sy = ((t.flipY ? -1 : 1) * t.h) / ph;
  return mul(translation(cx, cy), mul(rotation(radians(t.rotation)), mul(scaling(sx, sy), translation(-pw / 2, -ph / 2))));
}

export function unitPoint(t: Transform, ux: number, uy: number): Pt {
  const r = radians(t.rotation), x = (ux - 0.5) * t.w, y = (uy - 0.5) * t.h;
  const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
  return { x: cx + x * Math.cos(r) - y * Math.sin(r), y: cy + x * Math.sin(r) + y * Math.cos(r) };
}

export function corners(t: Transform): Pt[] {
  return [unitPoint(t, 0, 0), unitPoint(t, 1, 0), unitPoint(t, 1, 1), unitPoint(t, 0, 1)];
}

export function boundsOf(points: Pt[]): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export const transformBounds = (t: Transform): Rect => boundsOf(corners(t));

export function contains(t: Transform, p: Pt): boolean {
  const r = radians(t.rotation), x = p.x - (t.x + t.w / 2), y = p.y - (t.y + t.h / 2);
  return Math.abs(x * Math.cos(r) + y * Math.sin(r)) <= t.w / 2 && Math.abs(-x * Math.sin(r) + y * Math.cos(r)) <= t.h / 2;
}

export function unionRect(a: Rect | null, b: Rect): Rect {
  if (!a) return { ...b };
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export function intersectRect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w), btm = Math.min(a.y + a.h, b.y + b.h);
  return r > x && btm > y ? { x, y, w: r - x, h: btm - y } : null;
}

export function integral(r: Rect): Rect {
  const x = Math.floor(r.x), y = Math.floor(r.y);
  return { x, y, w: Math.ceil(r.x + r.w) - x, h: Math.ceil(r.y + r.h) - y };
}

export function isAxisAligned(t: Transform, pw: number, ph: number): boolean {
  return t.rotation % 360 === 0 && !t.flipX && !t.flipY && t.w === pw && t.h === ph && Number.isInteger(t.x) && Number.isInteger(t.y);
}

export function sameTransform(a: Transform, b: Transform): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h && a.rotation === b.rotation && a.flipX === b.flipX && a.flipY === b.flipY && a.sampling === b.sampling;
}
