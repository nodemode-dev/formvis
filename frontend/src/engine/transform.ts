import { radians, unitPoint } from './geometry';
import type { Pt, Transform } from './types';

export const HANDLES: ReadonlyArray<Pt> = [
  { x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.5 },
  { x: 1, y: 1 }, { x: 0.5, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 0.5 },
];

export type DragMode = { kind: 'move' } | { kind: 'resize'; handle: number } | { kind: 'rotate' };

export function validTransform(t: Transform): boolean {
  return [t.x, t.y, t.w, t.h, t.rotation].every(Number.isFinite) && t.w >= 1 && t.h >= 1 && t.w <= 300000 && t.h <= 300000 && Math.abs(t.x) <= 1e6 && Math.abs(t.y) <= 1e6;
}

export function dragged(o: Transform, start: Pt, p: Pt, mode: DragMode, lockRatio: boolean, shift: boolean, alt: boolean): Transform {
  const r: Transform = { ...o };
  if (mode.kind === 'move') {
    let dx = p.x - start.x, dy = p.y - start.y;
    if (shift) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0; }
    r.x += dx;
    r.y += dy;
  } else if (mode.kind === 'rotate') {
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    const delta = Math.atan2(p.y - cy, p.x - cx) - Math.atan2(start.y - cy, start.x - cx);
    r.rotation = o.rotation + (delta * 180) / Math.PI;
    if (shift) r.rotation = Math.round(r.rotation / 15) * 15;
  } else {
    const hd = HANDLES[mode.handle];
    const au = alt ? { x: 0.5, y: 0.5 } : { x: 1 - hd.x, y: 1 - hd.y };
    const anchor = unitPoint(o, au.x, au.y), initial = unitPoint(o, hd.x, hd.y);
    const dx = initial.x + p.x - start.x - anchor.x, dy = initial.y + p.y - start.y - anchor.y;
    const span = alt ? 2 : 1, rad = radians(o.rotation);
    const lx = (dx * Math.cos(rad) + dy * Math.sin(rad)) * span, ly = (-dx * Math.sin(rad) + dy * Math.cos(rad)) * span;
    const sx = hd.x * 2 - 1, sy = hd.y * 2 - 1;
    let w = sx === 0 ? o.w : Math.max(1, lx * sx);
    let h = sy === 0 ? o.h : Math.max(1, ly * sy);
    if (lockRatio !== shift) {
      let f: number;
      if (sx === 0) f = h / o.h;
      else if (sy === 0) f = w / o.w;
      else f = Math.max(1 / Math.min(o.w, o.h), (lx * sx * o.w + ly * sy * o.h) / (o.w * o.w + o.h * o.h));
      w = o.w * f;
      h = o.h * f;
    }
    r.w = w;
    r.h = h;
    const ox = (0.5 - au.x) * w, oy = (0.5 - au.y) * h;
    const cx = anchor.x + ox * Math.cos(rad) - oy * Math.sin(rad), cy = anchor.y + ox * Math.sin(rad) + oy * Math.cos(rad);
    r.x = cx - w / 2;
    r.y = cy - h / 2;
  }
  return validTransform(r) ? r : o;
}

export function rounded(t: Transform): Transform {
  return { ...t, x: Math.round(t.x), y: Math.round(t.y), w: Math.max(1, Math.round(t.w)), h: Math.max(1, Math.round(t.h)), rotation: Math.round(t.rotation) };
}
