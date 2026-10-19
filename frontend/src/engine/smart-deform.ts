// A smart object's Warp, Puppet Warp and Perspective Warp as a live transform (DEV_PLAN 36.13): the stored control data
// follows the layer when it is moved or transformed, survives the project file, and is read back checked. The pixel work
// stays with the Engine's warp code; this file holds only the bookkeeping, so it never touches a raster.
import { applyMat, boundsOf, invert, mul, placement, type Mat } from './geometry';
import type { Layer, Rect, SmartDeform, Transform } from './types';

type P = [number, number];

/** The deform with every control point and its base carried by `m`. */
export function deformMove(d: SmartDeform, m: Mat): SmartDeform {
  const pt = (q: P): P => { const r = applyMat(m, q[0], q[1]); return [r.x, r.y]; }, base = mul(m, d.base);
  if (d.kind === 'mesh') return { ...d, base, points: d.points.map(pt) };
  if (d.kind === 'puppet') return { ...d, base, from: d.from.map(pt), to: d.to.map(pt) };
  return { ...d, base, planes: d.planes.map((pl) => ({ src: pl.src.map(pt), dst: pl.dst.map(pt) })) };
}

/** A smart object's deform as the layer now sits: a move or transform since its last render carried in. */
export function deformNow(l: Layer): SmartDeform | null {
  const d = l.smart?.deform, r = l.raster;
  if (!d || !r) return null;
  if (JSON.stringify(d.at) === JSON.stringify(l.transform)) return d;
  return deformMove(d, mul(placement(l.transform, r.width, r.height), invert(placement(d.at, r.width, r.height))));
}

/** The document bounds of a w by h picture drawn by `m`. */
export function matBox(m: Mat, w: number, h: number): Rect {
  return boundsOf([[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => applyMat(m, x, y)));
}

/** The layer transform that draws a w by h picture as `m` does, when `m` is a turn, a scale and a flip. */
export function transformOf(m: Mat, w: number, h: number, like: Transform): Transform {
  const sx = Math.hypot(m[0], m[1]), sy = Math.hypot(m[2], m[3]), flip = m[0] * m[3] - m[1] * m[2] < 0, ang = (Math.atan2(m[1], m[0]) * 180) / Math.PI;
  const tw = sx * w, th = sy * h, c = applyMat(m, w / 2, h / 2);
  return { ...like, x: c.x - tw / 2, y: c.y - th / 2, w: tw, h: th, rotation: ang, flipX: flip, flipY: false };
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const pts = (v: unknown): P[] | null => (Array.isArray(v) && v.every((q) => Array.isArray(q) && num(q[0]) && num(q[1])) ? (v as number[][]).map((q): P => [q[0], q[1]]) : null);
const nums = (v: unknown, n: number): number[] | null => (Array.isArray(v) && v.length === n && v.every(num) ? (v as number[]).slice() : null);

/** A deform read back from saved data, checked; null when it is missing or malformed. `at` is the saved transform. */
export function deformFrom(raw: unknown, at: Transform | null): SmartDeform | null {
  if (!raw || typeof raw !== 'object' || !at) return null;
  const o = raw as Record<string, unknown>, base = nums(o.base, 6);
  if (!base || !num(o.pad) || o.pad < 0) return null;
  const common = { base: base as unknown as Mat, pad: o.pad, at };
  if (o.kind === 'mesh') {
    const points = pts(o.points), us = Array.isArray(o.us) ? nums(o.us, o.us.length) : null, vs = Array.isArray(o.vs) ? nums(o.vs, o.vs.length) : null;
    if (!points || !us || !vs || !num(o.gw) || !num(o.gh) || points.length !== o.gw * o.gh || us.length !== o.gw || vs.length !== o.gh) return null;
    return { ...common, kind: 'mesh', gw: o.gw, gh: o.gh, points, us, vs };
  }
  if (o.kind === 'puppet') {
    const from = pts(o.from), to = pts(o.to);
    if (!from || !to || from.length !== to.length) return null;
    const rot = nums(o.rot, from.length), depth = nums(o.depth, from.length);
    const mode = o.mode === 'normal' || o.mode === 'distort' ? o.mode : 'rigid', density = o.density === 'fewer' || o.density === 'more' ? o.density : 'normal';
    return rot && depth && num(o.expansion) ? { ...common, kind: 'puppet', from, to, rot, depth, mode, density, expansion: o.expansion } : null;
  }
  if (o.kind === 'perspective' && Array.isArray(o.planes)) {
    const planes = o.planes.map((pl) => { const q = pl as Record<string, unknown>, src = pts(q?.src), dst = pts(q?.dst); return src && dst && src.length === 4 && dst.length === 4 ? { src, dst } : null; });
    return planes.every((pl) => pl) ? { ...common, kind: 'perspective', planes: planes as Array<{ src: P[]; dst: P[] }> } : null;
  }
  return null;
}
